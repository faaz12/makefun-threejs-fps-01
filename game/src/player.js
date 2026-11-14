// The human player: first-person movement, look, health/armor, shooting.
// The player owns no rendering; it owns a camera, a position and a state
// the game reads. Movement uses acceleration + friction, crouching and
// jumping, and box collision from the world.
import * as THREE from 'three';
import { newLoadout, currentWeapon, currentAmmo, buyWeapon, WEAPONS, GRENADE, ARMOR_PRICE, ARMOR_VALUE } from './weapons.js';

export const PLAYER_RADIUS = 0.42;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;

export class Player {
  constructor(world, sound) {
    this.world = world;
    this.sound = sound;
    this.pos = new THREE.Vector3(0, 0, 21);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing north (-z) from the south spawn
    this.pitch = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.crouching = false;
    this.onGround = true;
    this.y = 0; // foot height above ground (jump)
    this.vy = 0;
    this.loadout = newLoadout();
    this.money = 800;
    this.kills = 0;
    this.deaths = 0;
    this.reloading = 0; // seconds left, 0 = not reloading
    this.fireCooldown = 0;
    this.bloom = 0; // spread growth from firing
    this.recoil = 0; // pitch kick still to recover
    this.lastStepDist = 0;
    this.hasBeacon = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.spectating = null; // bot being watched after death
    this.camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.08, 400);
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.playerYaw ?? spawn.yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.y = 0;
    this.vy = 0;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.bloom = 0;
    this.recoil = 0;
    this.hasBeacon = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.spectating = null;
    this.crouching = false;
  }

  eyeHeight() {
    return this.crouching ? EYE_CROUCH : EYE_STAND;
  }

  // Fixed-step update. `fireHeld` is true while the mouse is down;
  // `onFire` is called by the game when a shot actually leaves the barrel.
  update(dt, input, onFire) {
    if (!this.alive) return;
    const look = input.consumeLook();
    const sens = 0.0021;
    this.yaw -= look.dx * sens;
    this.pitch -= look.dy * sens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));

    const axes = input.moveAxes();
    this.crouching = input.down('ControlLeft') || input.down('ControlRight');
    const walking = input.down('ShiftLeft') || input.down('ShiftRight');
    const baseSpeed = this.crouching ? 2.6 : walking ? 3.4 : 5.6;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -z rotated by yaw; right is +x rotated by yaw.
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    let mx = fx * axes.f + rx * axes.s;
    let mz = fz * axes.f + rz * axes.s;
    const len = Math.hypot(mx, mz);
    if (len > 0.001) { mx /= len; mz /= len; }
    const accel = this.onGround ? 42 : 14;
    this.vel.x += mx * accel * dt;
    this.vel.z += mz * accel * dt;
    // Friction: exponential decay toward the speed cap.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const cap = baseSpeed * (this.onGround ? 1 : 0.9);
    const damp = this.onGround ? Math.exp(-9 * dt) : Math.exp(-0.6 * dt);
    this.vel.x *= damp;
    this.vel.z *= damp;
    const speed2 = Math.hypot(this.vel.x, this.vel.z);
    if (speed2 > cap) {
      this.vel.x *= cap / speed2;
      this.vel.z *= cap / speed2;
    }
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const fixed = this.world.collide(this.pos.x, this.pos.z, PLAYER_RADIUS, prevX, prevZ);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    // Stay inside the arena even if a collider is missed.
    this.pos.x = Math.max(-31.4, Math.min(31.4, this.pos.x));
    this.pos.z = Math.max(-23.4, Math.min(23.4, this.pos.z));

    // Jump + gravity.
    if (input.down('Space') && this.onGround) {
      this.vy = 5.4;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 15.5 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }

    // Footstep sounds every ~2.2 m while moving on the ground.
    const moved = Math.hypot(this.vel.x, this.vel.z) * dt;
    this.lastStepDist += moved;
    if (this.onGround && speed > 1 && this.lastStepDist > 2.2) {
      this.lastStepDist = 0;
      this.sound.step();
    }

    // Reload + fire timers.
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const def = currentWeapon(this.loadout);
        const slot = currentAmmo(this.loadout);
        const need = def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.09);
    this.recoil = Math.max(0, this.recoil - dt * 0.09);

    const wantFire = input.mouseDown && this.fireCooldown <= 0 && this.reloading <= 0;
    if (wantFire) {
      const def = currentWeapon(this.loadout);
      const slot = currentAmmo(this.loadout);
      if (slot.mag > 0) {
        slot.mag -= 1;
        this.fireCooldown = def.fireInterval;
        this.bloom = Math.min(0.06, this.bloom + def.kick * 0.55);
        this.recoil = Math.min(0.09, this.recoil + def.kick);
        if (onFire) onFire(def);
      } else {
        this.fireCooldown = 0.25;
        this.sound.dryFire();
        this.startReload();
      }
    }
    // Semi-auto weapons fire once per click: the game clears mouseDown after
    // the first shot for non-auto weapons (see game.js).
  }

  startReload() {
    if (this.reloading > 0 || !this.alive) return false;
    const def = currentWeapon(this.loadout);
    const slot = currentAmmo(this.loadout);
    if (slot.mag >= def.mag || slot.reserve <= 0) return false;
    this.reloading = def.reloadTime;
    this.sound.reload();
    return true;
  }

  // Spread right now, in radians: base + movement + air + bloom.
  spreadNow() {
    const def = currentWeapon(this.loadout);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let s = def.spread + this.bloom;
    s += (speed / 5.6) * def.moveSpread;
    if (!this.onGround) s += 0.03;
    if (this.crouching) s *= 0.75;
    return s;
  }

  // Direction the camera looks, with spread and recoil applied.
  aimDirection(rng) {
    const spread = this.spreadNow();
    const yaw = this.yaw + (rng() * 2 - 1) * spread + (rng() * 2 - 1) * spread * 0.4;
    const pitch = this.pitch + this.recoil + (rng() * 2 - 1) * spread;
    const cp = Math.cos(pitch);
    return new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
  }

  eyePosition(out) {
    out.set(this.pos.x, this.y + this.eyeHeight(), this.pos.z);
    return out;
  }

  takeDamage(amount, fromName, game) {
    if (!this.alive) return;
    let rest = amount;
    if (this.loadout.armor > 0) {
      const absorbed = Math.min(this.loadout.armor, rest * 0.5);
      this.loadout.armor -= absorbed;
      rest -= absorbed;
    }
    this.hp -= rest;
    this.sound.hurt();
    if (game) game.onPlayerHurt(fromName);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths += 1;
      if (game) game.onPlayerDeath(fromName);
    }
  }

  // Buy menu: returns a short result string for the HUD toast.
  buy(id) {
    if (!this.alive) return 'dead';
    if (id === 'armor') {
      if (this.loadout.armor >= ARMOR_VALUE) return 'owned';
      if (this.money < ARMOR_PRICE) return 'poor';
      this.money -= ARMOR_PRICE;
      this.loadout.armor = ARMOR_VALUE;
      this.sound.buy();
      return 'ok';
    }
    if (id === 'grenade') {
      if (this.loadout.grenades >= GRENADE.maxCarry) return 'owned';
      if (this.money < GRENADE.price) return 'poor';
      this.money -= GRENADE.price;
      this.loadout.grenades += 1;
      this.sound.buy();
      return 'ok';
    }
    const def = WEAPONS[id];
    if (!def) return 'bad';
    if (this.money < def.price) return 'poor';
    this.money -= def.price;
    buyWeapon(this.loadout, id);
    this.sound.buy();
    return 'ok';
  }

  syncCamera() {
    this.camera.position.set(this.pos.x, this.y + this.eyeHeight(), this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch + this.recoil);
  }
}
