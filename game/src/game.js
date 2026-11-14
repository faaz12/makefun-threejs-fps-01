// Game orchestration for FROSTLINE: rounds, economy, shooting resolution,
// grenades, the beacon objective, kill feed, spectating and the state the
// screenshots and play-tests read. The simulation runs on a fixed 60 Hz
// step, apart from rendering; this module never draws anything itself.
import * as THREE from 'three';
import { World, SITES, SPAWNS, MAP } from './world.js';
import { Bot, BOT_NAMES } from './bots.js';
import { Objective, PLANT_TIME } from './objective.js';
import { WEAPONS, GRENADE, newLoadout } from './weapons.js';
import { GrenadeView } from './effects.js';

export const BUY_PHASE = 15;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const KILL_BONUS = 300;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1900;
export const PLANT_BONUS = 300;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor({ scene, hud, input, sound, world, effects, player }) {
    this.scene = scene;
    this.hud = hud;
    this.input = input;
    this.sound = sound;
    this.world = world;
    this.effects = effects;
    this.player = player;
    this.sites = SITES;
    this.occluders = world.occluders;
    this.time = 0;
    this.rng = mulberry32((Date.now() % 2147483647) || 1);
    this.raycaster = new THREE.Raycaster();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();

    this.objective = new Objective(scene);
    this.bots = [];
    const namesN = [...BOT_NAMES.northlight];
    const namesS = [...BOT_NAMES.stormfront];
    for (const name of namesN) {
      const bot = new Bot('northlight', name, world, this);
      this.bots.push(bot);
      scene.add(bot.group);
    }
    for (const name of namesS) {
      const bot = new Bot('stormfront', name, world, this);
      this.bots.push(bot);
      scene.add(bot.group);
    }

    // The player's hitbox: invisible meshes the bots' raycasts can hit.
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.playerBodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.35, 8), hitMat);
    this.playerBodyMesh.userData = { player: true, part: 'body' };
    this.playerHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), hitMat);
    this.playerHeadMesh.userData = { player: true, part: 'head' };
    scene.add(this.playerBodyMesh);
    scene.add(this.playerHeadMesh);

    this.grenades = [];
    this.grenadeViews = [];
    for (let i = 0; i < 4; i++) this.grenadeViews.push(new GrenadeView(scene));
    this.phase = 'deploy'; // deploy | buy | live | roundEnd | matchEnd
    this.phaseTimer = 0;
    this.round = 1;
    this.score = { northlight: 0, stormfront: 0 };
    this.buyOpen = false;
    this.lastGunfire = null;
    this.defuser = null;
    this.matchWinner = null;
    this.survived = { player: true, bots: new Map() };
    this.roundEndInfo = null;
  }

  get playerMoving() {
    return Math.hypot(this.player.vel.x, this.player.vel.z) > 1.5;
  }

  // ---- match / round flow ----

  startMatch() {
    this.score = { northlight: 0, stormfront: 0 };
    this.round = 1;
    this.player.money = 800;
    this.player.loadout = newLoadout();
    this.player.kills = 0;
    this.player.deaths = 0;
    this.survived = { player: true, bots: new Map() };
    this.matchWinner = null;
    this.hud.hideMatchEnd();
    this.startRound();
  }

  startRound() {
    // Survivors keep their weapons; the dead restart with a pistol.
    const pSurvived = this.survived.player;
    if (!pSurvived) {
      this.player.loadout = newLoadout();
    }
    this.player.reset(SPAWNS.northlight[1]);
    const botWeapons = ['rifle', 'smg', 'rifle'];
    const enemyWeapons = ['rifle', 'smg', 'sniper', 'rifle'];
    const sites = ['A', 'B', 'A'];
    const enemySites = ['A', 'B', 'A', 'B'];
    let ni = 0;
    let si = 0;
    for (const bot of this.bots) {
      if (bot.team === 'northlight') {
        bot.reset(SPAWNS.northlight[ni], botWeapons[ni % botWeapons.length], sites[ni % sites.length]);
        ni += 1;
      } else {
        bot.reset(SPAWNS.stormfront[si], enemyWeapons[si % enemyWeapons.length], enemySites[si % enemySites.length]);
        si += 1;
      }
    }
    this.objective.reset('player');
    this.player.hasBeacon = true;
    this.grenades = [];
    for (const view of this.grenadeViews) view.hide();
    this.phase = 'buy';
    this.phaseTimer = BUY_PHASE;
    this.buyOpen = true;
    this.hud.showBuy(true);
    this.hud.updateBuy(this.player);
    this.hud.setScore(this.score.northlight, this.score.stormfront, this.round);
    this.hud.showBanner(`ROUND ${this.round}`, 'Buy phase — press B for the buy menu', 3000);
    this.sound.startWind();
  }

  startLive() {
    this.phase = 'live';
    this.phaseTimer = ROUND_TIME;
    this.buyOpen = false;
    this.hud.showBuy(false);
    this.hud.toast('Round live — plant the beacon at A or B');
    this.input.requestLock();
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.score[winner] += 1;
    const playerWon = winner === 'northlight';
    this.player.money += playerWon ? WIN_BONUS : LOSS_BONUS;
    this.survived = {
      player: this.player.alive,
      bots: new Map(this.bots.map((b) => [b.id, b.alive])),
    };
    this.phase = 'roundEnd';
    this.phaseTimer = 4.5;
    this.roundEndInfo = { winner, reason };
    this.hud.setScore(this.score.northlight, this.score.stormfront, this.round);
    this.hud.showBanner(
      playerWon ? 'ROUND WON' : 'ROUND LOST',
      `${reason}  ·  Northlight ${this.score.northlight} — ${this.score.stormfront} Stormfront`,
      4200,
    );
    if (playerWon) this.sound.roundWin();
    else this.sound.roundLose();
    this.buyOpen = false;
    this.hud.showBuy(false);
    this.hud.setProgress(false, 0, '');
  }

  _nextAfterRoundEnd() {
    if (this.score.northlight >= WIN_ROUNDS || this.score.stormfront >= WIN_ROUNDS) {
      this.phase = 'matchEnd';
      this.matchWinner = this.score.northlight >= WIN_ROUNDS ? 'northlight' : 'stormfront';
      const won = this.matchWinner === 'northlight';
      this.hud.showMatchEnd(
        won ? 'MATCH WON — RELAY SECURED' : 'MATCH LOST',
        `Final score Northlight ${this.score.northlight} — ${this.score.stormfront} Stormfront`,
      );
      this.input.exitLock();
      return;
    }
    this.round += 1;
    this.startRound();
  }

  // ---- shooting ----

  _muzzlePos(out) {
    const eye = this.player.eyePosition(this._v4);
    const dir = this._v3.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = this._v1.set(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    out.copy(eye).addScaledVector(dir, 0.55).addScaledVector(right, 0.22);
    out.y -= 0.16;
    return out;
  }

  playerShoot(def) {
    const eye = this.player.eyePosition(this._v1).clone();
    const dir = this.player.aimDirection(this.rng);
    this.raycaster.set(eye, dir);
    this.raycaster.far = def.range;
    const hits = this.raycaster.intersectObjects(this._shootables(), false);
    const muzzle = this._muzzlePos(this._v2).clone();
    let end = this._v3.copy(eye).addScaledVector(dir, def.range).clone();
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const ud = hit.object.userData;
      if (ud.bot) {
        const isHead = ud.part === 'head';
        const dmg = def.damage * (isHead ? def.headMult : 1);
        const died = this.damageBot(ud.bot, dmg, 'You', isHead);
        this.hud.hitmarker(true);
        if (died) this.sound.kill();
        else this.sound.hit();
      } else if (!ud.player) {
        this.effects.sparks(hit.point, hit.face ? hit.face.normal : this._v4.set(0, 1, 0));
      }
    }
    this.effects.tracer(muzzle, end, def.tracerColor);
    this.effects.muzzleFlash(muzzle);
    this.sound.shot(def.sound);
    this.reportGunfire(this.player.pos.x, this.player.pos.z);
    if (!def.auto) this.input.mouseDown = false;
  }

  botShoot(bot, eye, dir, def, aimHead) {
    this.raycaster.set(eye, dir);
    this.raycaster.far = def.range;
    const hits = this.raycaster.intersectObjects(this._shootables(), false);
    const muzzle = eye.clone().addScaledVector(dir, 0.6);
    muzzle.y -= 0.12;
    let end = eye.clone().addScaledVector(dir, def.range);
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const ud = hit.object.userData;
      if (ud.player) {
        const isHead = ud.part === 'head';
        const dmg = def.damage * (isHead ? def.headMult : 1);
        this.player.takeDamage(dmg, bot.name, this);
      } else if (ud.bot && ud.bot !== bot) {
        const isHead = ud.part === 'head';
        const dmg = def.damage * (isHead ? def.headMult : 1);
        this.damageBot(ud.bot, dmg, bot.name, isHead);
      } else if (!ud.player && !ud.bot) {
        this.effects.sparks(hit.point, hit.face ? hit.face.normal : this._v4.set(0, 1, 0));
      }
    }
    this.effects.tracer(muzzle, end, def.tracerColor);
    this.effects.muzzleFlash(muzzle);
    this.sound.shot(def.sound);
    this.reportGunfire(bot.pos.x, bot.pos.z);
  }

  _shootables() {
    if (!this._shootableCache) this._buildShootables();
    return this._shootableCache;
  }

  _buildShootables() {
    const list = [...this.occluders];
    for (const bot of this.bots) list.push(bot.bodyMesh, bot.headMesh);
    list.push(this.playerBodyMesh, this.playerHeadMesh);
    this._shootableCache = list;
  }

  damageBot(target, amount, attacker, isHead) {
    const died = target.takeDamage(amount, attacker, isHead);
    if (died) {
      target.deaths = (target.deaths || 0) + 1;
      this.hud.feedKill(attacker, target.name, attacker === 'You' || this._isNorthlight(attacker) ? 'northlight' : 'stormfront', isHead);
      if (attacker === 'You') {
        this.player.kills += 1;
        this.player.money += KILL_BONUS;
        this.hud.setMoney(this.player.money);
      } else {
        const killerBot = this.bots.find((b) => b.name === attacker);
        if (killerBot) killerBot.kills = (killerBot.kills || 0) + 1;
      }
      if (this.objective.carrier === target.id) {
        this.objective.dropAt(target.pos.x, target.pos.z);
        this.hud.toast('Beacon dropped — recover it');
      }
      this._checkElimination();
    }
    return died;
  }

  _isNorthlight(name) {
    if (name === 'You') return true;
    const bot = this.bots.find((b) => b.name === name);
    return bot ? bot.team === 'northlight' : false;
  }

  onPlayerHurt() {
    this.hud.damageFlash();
  }

  onPlayerDeath(killerName) {
    this.hud.feedKill(killerName, 'You', 'stormfront', false);
    if (this.objective.carrier === 'player') {
      this.objective.dropAt(this.player.pos.x, this.player.pos.z);
      this.player.hasBeacon = false;
      this.hud.toast('Beacon dropped — a teammate must recover it');
    }
    const mate = this.bots.find((b) => b.team === 'northlight' && b.alive);
    this.player.spectating = mate || null;
    this.hud.setSpectate(mate ? `Spectating ${mate.name} — click to cycle` : '');
    this.input.exitLock();
    this._checkElimination();
  }

  _checkElimination() {
    if (this.phase !== 'live') return;
    const northAlive = this.bots.some((b) => b.team === 'northlight' && b.alive) || this.player.alive;
    const stormAlive = this.bots.some((b) => b.team === 'stormfront' && b.alive);
    const planted = this.objective.state === 'planted';
    if (!stormAlive) {
      this.endRound('northlight', 'Stormfront eliminated');
    } else if (!northAlive && !planted) {
      this.endRound('stormfront', 'Northlight eliminated');
    } else if (!northAlive && planted) {
      // Attackers all dead with the beacon planted: Stormfront still has
      // to defuse before the fuse runs out, so the round continues.
    }
  }

  // ---- objective ----

  plantBeacon(siteLetter, byName) {
    if (this.objective.state === 'planted') return;
    this.objective.plant(siteLetter);
    this.player.hasBeacon = false;
    if (byName === 'You') {
      this.player.money += PLANT_BONUS;
      this.hud.setMoney(this.player.money);
    }
    // The nearest living Stormfront bot is tasked with the defuse.
    let best = null;
    let bestD = Infinity;
    const site = SITES[siteLetter];
    for (const b of this.bots) {
      if (b.team !== 'stormfront' || !b.alive) continue;
      const d = Math.hypot(b.pos.x - site.x, b.pos.z - site.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    this.defuser = best;
    this.hud.toast(`Beacon planted at site ${siteLetter} — 30 s fuse`);
    this.sound.beep();
  }

  defuseBeacon(byName) {
    this.objective.state = 'done';
    this.objective.ring.visible = false;
    this.objective.mesh.visible = false;
    this.endRound('stormfront', `${byName} defused the beacon`);
  }

  // ---- grenades ----

  throwGrenade() {
    if (this.phase !== 'live' || !this.player.alive) return;
    if (this.player.loadout.grenades <= 0) {
      this.sound.denied();
      return;
    }
    this.player.loadout.grenades -= 1;
    const eye = this.player.eyePosition(this._v1).clone();
    const dir = this.player.aimDirection(this.rng);
    const g = {
      pos: eye.clone(),
      vel: dir.clone().multiplyScalar(GRENADE.throwSpeed).add(this._v2.set(0, 3.4, 0)),
      fuse: GRENADE.fuse,
    };
    this.grenades.push(g);
    this.sound.dryFire();
  }

  _updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      const px = g.pos.x;
      const pz = g.pos.z;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.14) {
        g.pos.y = 0.14;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.65;
        g.vel.z *= 0.65;
      }
      const fixed = this.world.collide(g.pos.x, g.pos.z, 0.14, px, pz);
      if (fixed.x !== g.pos.x) { g.vel.x *= -0.5; g.pos.x = px; }
      if (fixed.z !== g.pos.z) { g.vel.z *= -0.5; g.pos.z = pz; }
      const view = this.grenadeViews[i];
      if (view) view.set(g.pos, g.fuse < 0.5);
      if (g.fuse <= 0) {
        this._explode(g.pos);
        this.grenades.splice(i, 1);
        if (view) view.hide();
      }
    }
  }

  _explode(pos) {
    this.sound.explosion();
    this.effects.muzzleFlash(pos);
    this.effects.sparks(pos, this._v4.set(0, 1, 0));
    const victims = [];
    if (this.player.alive) victims.push({ kind: 'player', ref: this.player, x: this.player.pos.x, z: this.player.pos.z, y: this.player.y + 1.0 });
    for (const b of this.bots) if (b.alive) victims.push({ kind: 'bot', ref: b, x: b.pos.x, z: b.pos.z, y: 1.0 });
    for (const v of victims) {
      const d = Math.hypot(v.x - pos.x, v.z - pos.z);
      if (d > GRENADE.radius) continue;
      const from = this._v1.copy(pos);
      const to = this._v2.set(v.x, v.y, v.z);
      if (World.segmentBlocked(this.raycaster, from, to, this.occluders)) continue;
      const dmg = Math.round(GRENADE.damage * (1 - (d / GRENADE.radius) * 0.8));
      if (v.kind === 'player') this.player.takeDamage(dmg, 'Cryo Charge', this);
      else this.damageBot(v.ref, dmg, 'You', false);
    }
  }

  // ---- hearing ----

  reportGunfire(x, z) {
    this.lastGunfire = { x, z };
    for (const b of this.bots) b.hearGunfire(x, z, this.time);
  }

  // ---- fixed-step update ----

  update(dt) {
    this.time += dt;
    if (this.phase === 'buy') {
      this.phaseTimer -= dt;
      this.player.update(dt, this.input, (def) => this.playerShoot(def));
      this._syncPlayerHitbox();
      if (this.phaseTimer <= 0) this.startLive();
    } else if (this.phase === 'live') {
      if (this.objective.state !== 'planted') this.phaseTimer -= dt;
      this.player.update(dt, this.input, (def) => this.playerShoot(def));
      this._syncPlayerHitbox();
      for (const b of this.bots) b.update(dt, this.rng, this.raycaster);
      this._updateGrenades(dt);
      this.objective.update(dt, this.sound);
      this._beaconPickup();
      this._playerPlantHold(dt);
      if (this.objective.state === 'planted' && this.objective.fuse <= 0) {
        this.endRound('northlight', `Beacon detonated at site ${this.objective.site}`);
      } else if (this.phaseTimer <= 0 && this.objective.state !== 'planted') {
        this.endRound('stormfront', 'Time expired — the site held');
      }
    } else if (this.phase === 'roundEnd') {
      this.phaseTimer -= dt;
      this._updateGrenades(dt);
      if (this.phaseTimer <= 0) this._nextAfterRoundEnd();
    }
    this._syncSpectateCamera();
  }

  _syncPlayerHitbox() {
    const p = this.player;
    this.playerBodyMesh.position.set(p.pos.x, p.y + 0.85, p.pos.z);
    this.playerHeadMesh.position.set(p.pos.x, p.y + p.eyeHeight() - 0.1, p.pos.z);
  }

  _beaconPickup() {
    const obj = this.objective;
    if (obj.state !== 'dropped') return;
    if (this.player.alive && Math.hypot(this.player.pos.x - obj.pos.x, this.player.pos.z - obj.pos.z) < 1.4) {
      obj.state = 'carried';
      obj.carrier = 'player';
      obj.mesh.visible = false;
      this.player.hasBeacon = true;
      this.hud.toast('Beacon recovered');
      return;
    }
    for (const b of this.bots) {
      if (b.team !== 'northlight' || !b.alive) continue;
      if (Math.hypot(b.pos.x - obj.pos.x, b.pos.z - obj.pos.z) < 1.4) {
        obj.state = 'carried';
        obj.carrier = b.id;
        obj.mesh.visible = false;
        this.hud.toast(`${b.name} picked up the beacon`);
        return;
      }
    }
  }

  _playerPlantHold(dt) {
    const obj = this.objective;
    if (!this.player.alive || obj.state !== 'carried' || obj.carrier !== 'player') {
      this.player.plantProgress = 0;
      this.hud.setProgress(false, 0, '');
      return;
    }
    const site = Objective.siteAt(this.player.pos.x, this.player.pos.z);
    if (site && this.input.down('KeyE')) {
      this.player.plantProgress += dt;
      this.hud.setProgress(true, this.player.plantProgress / PLANT_TIME, `PLANTING BEACON — SITE ${site}`);
      if (this.player.plantProgress >= PLANT_TIME) {
        this.player.plantProgress = 0;
        this.hud.setProgress(false, 0, '');
        this.plantBeacon(site, 'You');
      }
    } else {
      this.player.plantProgress = 0;
      this.hud.setProgress(false, 0, '');
    }
  }

  _syncSpectateCamera() {
    if (this.player.alive) return;
    const target = this.player.spectating;
    if (!target || !target.alive) {
      const mate = this.bots.find((b) => b.team === 'northlight' && b.alive);
      this.player.spectating = mate || null;
      return;
    }
    const cam = this.player.camera;
    cam.position.set(target.pos.x, 1.55, target.pos.z);
    cam.rotation.set(0, 0, 0);
    cam.rotateY(target.yaw);
  }

  cycleSpectate() {
    if (this.player.alive) return;
    const mates = this.bots.filter((b) => b.team === 'northlight' && b.alive);
    if (!mates.length) return;
    const idx = mates.indexOf(this.player.spectating);
    this.player.spectating = mates[(idx + 1) % mates.length];
    this.hud.setSpectate(`Spectating ${this.player.spectating.name} — click to cycle`);
  }

  // ---- HUD sync (called every rendered frame) ----

  syncHud() {
    const p = this.player;
    const def = WEAPONS[p.loadout.current];
    const slot = p.loadout[p.loadout.current];
    this.hud.setHealth(p.hp, p.loadout.armor);
    this.hud.setAmmo(slot.mag, slot.reserve, def.name, p.loadout.grenades);
    this.hud.setMoney(p.money);
    const planted = this.objective.state === 'planted';
    this.hud.setTimer(planted ? this.objective.fuse : this.phaseTimer, planted);
    this.hud.setScore(this.score.northlight, this.score.stormfront, this.round);
    this.hud.setPhase(
      this.phase === 'buy' ? 'BUY PHASE' : this.phase === 'live' ? (planted ? 'BEACON PLANTED' : 'LIVE') : this.phase.toUpperCase(),
    );
    let objText = '';
    let hint = '';
    if (this.phase === 'buy') objText = 'Buy phase — B opens the buy menu';
    else if (this.objective.state === 'carried' && this.objective.carrier === 'player') {
      objText = 'You carry the beacon — plant it at A or B (hold E on a site)';
      hint = 'Hold E on a site pad to plant';
    } else if (this.objective.state === 'carried') {
      const carrier = this.bots.find((b) => b.id === this.objective.carrier);
      objText = carrier ? `${carrier.name} carries the beacon — escort them` : 'Beacon carried';
    } else if (this.objective.state === 'dropped') {
      objText = 'Beacon dropped — recover it';
    } else if (planted) {
      objText = `Beacon planted at site ${this.objective.site} — defend it`;
    }
    this.hud.setObjective(objText);
    this.hud.setBeaconHint(hint);
    if (p.alive) this.hud.setSpectate('');
  }

  // ---- debug / verification state ----

  stateSnapshot() {
    return {
      phase: this.phase,
      round: this.round,
      score: { ...this.score },
      timer: Math.round(this.phaseTimer * 10) / 10,
      fuse: this.objective.state === 'planted' ? Math.round(this.objective.fuse * 10) / 10 : null,
      objective: this.objective.state,
      objectiveSite: this.objective.site,
      carrier: this.objective.carrier,
      player: {
        hp: Math.round(this.player.hp),
        money: this.player.money,
        alive: this.player.alive,
        x: Math.round(this.player.pos.x * 100) / 100,
        z: Math.round(this.player.pos.z * 100) / 100,
        yaw: Math.round(this.player.yaw * 100) / 100,
        weapon: this.player.loadout.current,
        mag: this.player.loadout[this.player.loadout.current].mag,
        reserve: this.player.loadout[this.player.loadout.current].reserve,
        grenades: this.player.loadout.grenades,
        hasBeacon: this.player.hasBeacon,
      },
      bots: this.bots.map((b) => ({
        name: b.name, team: b.team, hp: Math.round(b.hp), alive: b.alive,
        x: Math.round(b.pos.x * 100) / 100, z: Math.round(b.pos.z * 100) / 100,
        state: b.state, weapon: b.weaponId,
      })),
      grenades: this.grenades.length,
      buyOpen: this.buyOpen,
    };
  }
}
