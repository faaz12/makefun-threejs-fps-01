// Bot teammates and enemies for FROSTLINE.
// Each bot is a small state machine: route along the waypoint graph, hold a
// position, engage a visible target in bursts, investigate gunfire it hears,
// and play the objective (carry + plant the beacon for Northlight, defuse
// for Stormfront). Shooting is a real raycast from the bot's eye against
// the shootable meshes (bot bodies, the player's hitbox, walls), so a wall
// between two actors really does stop a bullet.
import * as THREE from 'three';
import { WAYPOINTS, World } from './world.js';
import { WEAPONS, newLoadout, buyWeapon } from './weapons.js';

export const BOT_NAMES = {
  northlight: ['Iris', 'Boreal', 'Sable'],
  stormfront: ['Vortex', 'Hail', 'Rime', 'Squall'],
};

const BOT_SPEED_ROUTE = 3.9;
const BOT_SPEED_ENGAGE = 2.3;
const SCAN_INTERVAL = 0.12;
const VIEW_DIST = 55;
const FOV_COS = Math.cos((100 * Math.PI) / 180 / 2);

let botCounter = 0;

export class Bot {
  constructor(team, name, world, game) {
    this.id = `bot-${botCounter++}`;
    this.team = team;
    this.name = name;
    this.world = world;
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.hp = 100;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.loadout = newLoadout();
    this.weaponId = 'rifle';
    this.speed = BOT_SPEED_ROUTE;
    this.state = 'route'; // route | hold | engage | investigate
    this.path = [];
    this.pathIdx = 0;
    this.holdTimer = 0;
    this.scanTimer = Math.random() * SCAN_INTERVAL;
    this.target = null; // {kind:'player'|'bot', ref, lastSeen}
    this.reactTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.fireCooldown = 0;
    this.reloading = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.investigateNode = -1;
    this.assignedSite = 'A';
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.lastHeardAt = -100;
    this.group = this._buildMesh();
  }

  _buildMesh() {
    const group = new THREE.Group();
    const teamColor = this.team === 'northlight' ? 0x59d8c9 : 0xff7a59;
    const suit = new THREE.MeshStandardMaterial({ color: this.team === 'northlight' ? 0x2e4a52 : 0x4a3226, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.32), suit);
    body.position.y = 0.95;
    body.castShadow = true;
    body.userData = { bot: this, part: 'body' };
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.7 }));
    head.position.y = 1.62;
    head.castShadow = true;
    head.userData = { bot: this, part: 'head' };
    group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.9 }));
    visor.position.set(0, 1.64, 0.19);
    group.add(visor);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.5, metalness: 0.6 }));
    gun.position.set(0.28, 1.22, 0.25);
    group.add(gun);
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.4 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    this.bodyMesh = body;
    this.headMesh = head;
    this.ring = ring;
    group.position.copy(this.pos);
    return group;
  }

  reset(spawn, weaponId, site) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = spawn.yaw;
    this.hp = 100;
    this.alive = true;
    this.loadout = newLoadout();
    this.weaponId = weaponId;
    buyWeapon(this.loadout, weaponId);
    this.loadout.current = weaponId;
    this.assignedSite = site;
    this.state = 'route';
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.reactTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.fireCooldown = 0;
    this.reloading = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.ring.visible = true;
    this._routeToSite();
  }

  eyePos(out) {
    out.set(this.pos.x, 1.55, this.pos.z);
    return out;
  }

  _routeToSite() {
    const site = this.game.sites[this.assignedSite];
    const goal = this.world.nearestWaypoint(site.x, site.z);
    this._setPath(goal);
    this.state = 'route';
  }

  _setPath(goalNode) {
    const from = this.world.nearestWaypoint(this.pos.x, this.pos.z);
    this.path = World.findPath(from, goalNode);
    this.pathIdx = 0;
  }

  _nextWaypointTarget() {
    if (this.pathIdx >= this.path.length) return null;
    return WAYPOINTS[this.path[this.pathIdx]];
  }

  _moveToward(tx, tz, dt, speed) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    const nx = this.pos.x + (dx / dist) * step;
    const nz = this.pos.z + (dz / dist) * step;
    const fixed = this.world.collide(nx, nz, 0.42, this.pos.x, this.pos.z);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.yaw = Math.atan2(dx, dz);
    return dist - step < 0.05;
  }

  _canSee(targetPos, targetEyeY, raycaster) {
    const eye = this.eyePos(this.game._v1);
    const to = this.game._v2.set(targetPos.x, targetEyeY, targetPos.z);
    const dir = to.clone().sub(eye);
    const dist = dir.length();
    if (dist > VIEW_DIST) return false;
    // Field of view: the target must be in front of the bot.
    const forward = this.game._v3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (dir.clone().normalize().dot(forward) < FOV_COS && dist > 3) return false;
    return !World.segmentBlocked(raycaster, eye, to, this.game.occluders);
  }

  _scan(dt, rng, raycaster) {
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = SCAN_INTERVAL;
    let best = null;
    let bestDist = Infinity;
    const consider = (kind, ref, x, z, eyeY, alive) => {
      if (!alive) return;
      const dx = x - this.pos.x;
      const dz = z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestDist) return;
      if (this._canSee({ x, z }, eyeY, raycaster)) {
        best = { kind, ref, x, z, eyeY };
        bestDist = d;
      }
    };
    const player = this.game.player;
    if (this.team !== 'northlight' && player.alive) {
      consider('player', player, player.pos.x, player.pos.z, player.y + player.eyeHeight(), true);
    }
    for (const other of this.game.bots) {
      if (other === this || !other.alive || other.team === this.team) continue;
      consider('bot', other, other.pos.x, other.pos.z, 1.55, true);
    }
    if (best) {
      if (!this.target || this.target.ref !== best.ref) {
        this.reactTimer = 0.28 + rng() * 0.35;
        this.burstLeft = 0;
      }
      this.target = best;
      this.state = 'engage';
    } else if (this.state === 'engage') {
      // Lost sight: keep the last known spot briefly, then resume the route.
      this.target = null;
      this.state = 'route';
      if (this.pathIdx >= this.path.length) this._routeToSite();
    }
  }

  _fireAtTarget(dt, rng, raycaster) {
    const def = WEAPONS[this.weaponId];
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const slot = this.loadout[this.weaponId];
        const need = def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
      return;
    }
    if (this.fireCooldown > 0) { this.fireCooldown -= dt; return; }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (this.burstLeft <= 0) {
      this.burstLeft = 3 + ((rng() * 4) | 0);
      this.burstPause = 0;
    }
    if (this.reactTimer > 0) {
      this.reactTimer -= dt;
      return;
    }
    const slot = this.loadout[this.weaponId];
    if (slot.mag <= 0) {
      if (slot.reserve > 0) {
        this.reloading = def.reloadTime;
        this.game.sound.reload();
      }
      return;
    }
    slot.mag -= 1;
    this.fireCooldown = def.fireInterval * (1 + rng() * 0.25);
    this.burstLeft -= 1;
    if (this.burstLeft <= 0) this.burstPause = 0.45 + rng() * 0.55;

    // Aim: at the chest, sometimes the head, with distance-scaled error.
    const t = this.target;
    const dist = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
    const aimHead = rng() < 0.14;
    const aimY = aimHead ? t.eyeY + 0.05 : t.eyeY - 0.35;
    const err = 0.012 + dist * 0.0011 + (this.game.playerMoving ? 0.006 : 0);
    const eye = this.eyePos(this.game._v1);
    const dir = this.game._v2.set(t.x - eye.x, aimY - eye.y, t.z - eye.z).normalize();
    dir.x += (rng() * 2 - 1) * err;
    dir.y += (rng() * 2 - 1) * err;
    dir.z += (rng() * 2 - 1) * err;
    dir.normalize();
    this.game.botShoot(this, eye.clone(), dir, def, aimHead);
  }

  takeDamage(amount, attackerName, isHead) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.group.rotation.z = Math.PI / 2;
      this.group.position.y = 0.25;
      this.ring.visible = false;
      return true;
    }
    return false;
  }

  update(dt, rng, raycaster) {
    if (!this.alive) return;
    this._scan(dt, rng, raycaster);

    // Objective behaviour overrides movement, never combat.
    const obj = this.game.objective;
    if (this.team === 'northlight' && obj.carrier === this.id) {
      const site = this.game.sites[this.assignedSite];
      const dx = site.x - this.pos.x;
      const dz = site.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < site.radius && !this.target) {
        this.plantProgress += dt;
        if (this.plantProgress >= 3) {
          this.plantProgress = 0;
          this.game.plantBeacon(this.assignedSite, this.name);
        }
        this._syncMesh();
        return;
      }
      this.plantProgress = 0;
    }
    if (this.team === 'stormfront' && obj.state === 'planted') {
      const site = this.game.sites[obj.site];
      const dist = Math.hypot(site.x - this.pos.x, site.z - this.pos.z);
      if (dist < site.radius && !this.target) {
        this.defuseProgress += dt;
        if (this.defuseProgress >= 5) {
          this.defuseProgress = 0;
          this.game.defuseBeacon(this.name);
        }
        this._syncMesh();
        return;
      }
      this.defuseProgress = 0;
      // Nearest stormfront bot routes to the planted site.
      if (this.game.defuser === this) {
        if (this.state !== 'route' || this.pathIdx >= this.path.length) {
          this._setPath(this.world.nearestWaypoint(site.x, site.z));
          this.state = 'route';
        }
      }
    }

    if (this.state === 'engage' && this.target) {
      // Face the target, strafe sideways, fire in bursts.
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      this.yaw = Math.atan2(dx, dz);
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.7 + rng() * 0.9;
        this.strafeDir = rng() < 0.5 ? -1 : 1;
      }
      const px = -Math.cos(this.yaw) * this.strafeDir;
      const pz = Math.sin(this.yaw) * this.strafeDir;
      const nx = this.pos.x + px * BOT_SPEED_ENGAGE * dt;
      const nz = this.pos.z + pz * BOT_SPEED_ENGAGE * dt;
      const fixed = this.world.collide(nx, nz, 0.42, this.pos.x, this.pos.z);
      this.pos.x = fixed.x;
      this.pos.z = fixed.z;
      this._fireAtTarget(dt, rng, raycaster);
    } else if (this.state === 'route') {
      const wp = this._nextWaypointTarget();
      if (!wp) {
        this.state = 'hold';
        this.holdTimer = 2.5 + rng() * 3;
      } else {
        const arrived = this._moveToward(wp.x, wp.z, dt, BOT_SPEED_ROUTE);
        if (arrived) this.pathIdx += 1;
      }
    } else if (this.state === 'hold') {
      this.holdTimer -= dt;
      // Slow scan sweep while holding.
      this.yaw += Math.sin(this.game.time * 0.6 + this.id.charCodeAt(4)) * dt * 0.5;
      if (this.holdTimer <= 0) {
        // Pick a nearby waypoint to patrol to.
        const near = this.world.nearestWaypoint(this.pos.x, this.pos.z);
        const options = WAYPOINTS.map((w, i) => i).filter((i) => Math.abs(i - near) <= 4 && i !== near);
        const goal = options.length ? options[(rng() * options.length) | 0] : near;
        this._setPath(goal);
        this.state = 'route';
      }
    }

    // Investigate recent gunfire when idle.
    if (this.state !== 'engage' && this.game.time - this.lastHeardAt < 1.2) {
      const ev = this.game.lastGunfire;
      if (ev) {
        const d = Math.hypot(ev.x - this.pos.x, ev.z - this.pos.z);
        if (d < 28 && d > 6) {
          this._setPath(this.world.nearestWaypoint(ev.x, ev.z));
          this.state = 'route';
          this.lastHeardAt = -100;
        }
      }
    }
    this._syncMesh();
  }

  hearGunfire(x, z, time) {
    this.lastHeardAt = time;
    if (!this.game.lastGunfire) this.game.lastGunfire = { x, z };
    else { this.game.lastGunfire.x = x; this.game.lastGunfire.z = z; }
  }

  _syncMesh() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
}
