// The uplink beacon objective for FROSTLINE.
// Northlight carries the beacon. Plant it at a site (hold E, 3 s), then a
// 30 s fuse runs: detonation wins the round for Northlight, a 5 s defuse
// (hold E) wins it for Stormfront. If the carrier dies, a teammate picks
// the beacon up by walking over it; if every Northlight attacker is dead
// the beacon returns to the south spawn.
import * as THREE from 'three';
import { SITES } from './world.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 30;

export class Objective {
  constructor(scene) {
    this.scene = scene;
    this.state = 'carried'; // carried | dropped | planted | done
    this.site = null; // 'A' | 'B'
    this.carrier = null; // 'player' | bot id
    this.pos = new THREE.Vector3(0, 0.4, 20);
    this.fuse = 0;
    this.beepTimer = 0;
    // The beacon: a small glowing canister, visible in the world.
    const geo = new THREE.CylinderGeometry(0.22, 0.26, 0.55, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0x24394d, emissive: 0x59d8c9, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.6 });
    this.mesh = new THREE.Mesh(geo, mat);
    const light = new THREE.PointLight(0x59d8c9, 8, 10, 2);
    this.mesh.add(light);
    this.light = light;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // Planted-site marker ring, shown while the fuse runs.
    const ringGeo = new THREE.RingGeometry(2.6, 3.1, 32);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  reset(carrier) {
    this.state = 'carried';
    this.site = null;
    this.carrier = carrier;
    this.fuse = 0;
    this.beepTimer = 0;
    this.mesh.visible = false;
    this.ring.visible = false;
  }

  // Which site (if any) is the actor standing in?
  static siteAt(x, z) {
    for (const [letter, site] of Object.entries(SITES)) {
      const dx = x - site.x;
      const dz = z - site.z;
      if (dx * dx + dz * dz < site.radius * site.radius) return letter;
    }
    return null;
  }

  plant(siteLetter) {
    this.state = 'planted';
    this.site = siteLetter;
    this.carrier = null;
    this.fuse = FUSE_TIME;
    const site = SITES[siteLetter];
    this.pos.set(site.x, 0.4, site.z);
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
    this.light.color.setHex(0xffb347);
    this.light.intensity = 14;
    this.ring.position.set(site.x, 0.06, site.z);
    this.ring.visible = true;
  }

  dropAt(x, z) {
    this.state = 'dropped';
    this.carrier = null;
    this.pos.set(x, 0.4, z);
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
    this.light.color.setHex(0x59d8c9);
    this.light.intensity = 8;
    this.ring.visible = false;
  }

  returnHome() {
    this.reset('player');
    this.pos.set(0, 0.4, 20);
  }

  update(dt, sound) {
    if (this.state === 'planted') {
      this.fuse -= dt;
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        sound.plantTick();
        // Beeps accelerate as the fuse runs down.
        this.beepTimer = Math.max(0.25, this.fuse / FUSE_TIME) * 0.9;
      }
      // Pulsing ring while the fuse runs.
      const pulse = 0.6 + 0.4 * Math.sin(this.fuse * 6);
      this.ring.material.opacity = pulse;
    }
  }
}
