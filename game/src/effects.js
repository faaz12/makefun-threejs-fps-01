// Visual effects for FROSTLINE, pooled so the hot loops allocate nothing:
// tracers, muzzle flash, impact sparks, grenade arcs and falling snow.
// Nothing here touches the simulation; it only draws what the game reports.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_POOL = 10;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < TRACER_POOL; i++) {
      const line = new THREE.Line(
        tracerGeo.clone(),
        new THREE.LineBasicMaterial({ color: PALETTE.tracer, transparent: true, opacity: 0 }),
      );
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.flash = new THREE.PointLight(PALETTE.muzzle, 0, 14, 2);
    scene.add(this.flash);
    this.flashLife = 0;

    // Impact sparks: one Points cloud per burst slot, reused.
    this.sparkBursts = [];
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    for (let i = 0; i < SPARK_POOL; i++) {
      const pts = new THREE.Points(
        sparkGeo.clone(),
        new THREE.PointsMaterial({ color: 0xffd27a, size: 0.09, transparent: true, opacity: 0 }),
      );
      pts.frustumCulled = false;
      scene.add(pts);
      this.sparkBursts.push({ pts, life: 0, vel: new Float32Array(12 * 3) });
    }

    // Falling snow: one Points cloud drifting around the camera.
    const SNOW_N = 700;
    this.snowPos = new Float32Array(SNOW_N * 3);
    this.snowVel = new Float32Array(SNOW_N);
    for (let i = 0; i < SNOW_N; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 70;
      this.snowPos[i * 3 + 1] = Math.random() * 26;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 56;
      this.snowVel[i] = 0.7 + Math.random() * 1.1;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.75 }),
    );
    this.snow.frustumCulled = false;
    scene.add(this.snow);

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  tracer(from, to, color = PALETTE.tracer) {
    let slot = this.tracers.find((t) => t.life <= 0);
    if (!slot) slot = this.tracers[0];
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.material.color.setHex(color);
    slot.line.material.opacity = 0.9;
    slot.life = 0.07;
  }

  muzzleFlash(at) {
    this.flash.position.copy(at);
    this.flash.intensity = 60;
    this.flashLife = 0.06;
  }

  sparks(at, normal) {
    let slot = this.sparkBursts.find((s) => s.life <= 0);
    if (!slot) slot = this.sparkBursts[0];
    const pos = slot.pts.geometry.attributes.position;
    for (let i = 0; i < 12; i++) {
      pos.setXYZ(i, at.x, at.y, at.z);
      const spread = 2.6;
      slot.vel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * spread;
      slot.vel[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.2;
      slot.vel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * spread;
    }
    pos.needsUpdate = true;
    slot.pts.material.opacity = 1;
    slot.life = 0.4;
  }

  update(dt, cameraPos, time) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
    for (const s of this.sparkBursts) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const pos = s.pts.geometry.attributes.position;
      for (let i = 0; i < 12; i++) {
        pos.setXYZ(i,
          pos.getX(i) + s.vel[i * 3] * dt,
          Math.max(0.02, pos.getY(i) + s.vel[i * 3 + 1] * dt),
          pos.getZ(i) + s.vel[i * 3 + 2] * dt);
        s.vel[i * 3 + 1] -= 6 * dt;
      }
      pos.needsUpdate = true;
      s.pts.material.opacity = Math.max(0, s.life / 0.4);
    }
    // Snow falls and drifts; recycle flakes above the camera's area.
    const pos = this.snow.geometry.attributes.position;
    for (let i = 0; i < this.snowVel.length; i++) {
      let y = pos.getY(i) - this.snowVel[i] * dt;
      let x = pos.getX(i) + Math.sin(time * 0.7 + i) * dt * 0.35;
      if (y < 0) {
        y = 24 + Math.random() * 2;
        x = cameraPos.x + (Math.random() - 0.5) * 70;
        pos.setZ(i, cameraPos.z + (Math.random() - 0.5) * 56);
      }
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }
}

// A thrown cryo charge: simulated by the game, drawn by this class.
export class GrenadeView {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(0.14, 10, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x59d8c9, emissive: 0x1a5a52, roughness: 0.4, metalness: 0.4 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    const light = new THREE.PointLight(0x59d8c9, 0, 8, 2);
    this.mesh.add(light);
    this.light = light;
  }

  set(pos, armed) {
    this.mesh.visible = true;
    this.mesh.position.copy(pos);
    this.light.intensity = armed ? 6 : 0;
  }

  hide() {
    this.mesh.visible = false;
    this.light.intensity = 0;
  }
}
