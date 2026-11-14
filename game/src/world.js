// FROSTLINE map: Relay Station 9, a polar research outpost at night.
// 64 x 48 m. Northlight spawns south, Stormfront spawns north. Site A
// (Comms Array) sits west, Site B (Generator Hall) east, and a frozen pond
// with an ice bridge splits the middle lane. Three lanes run north:
// west ridge, mid pond, east service road.
// All collision is axis-aligned boxes; movement treats the player and bots
// as circles in the XZ plane and resolves one axis at a time.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { snowTexture, iceTexture, steelTexture, hazardTexture, siteMarkerTexture, skyTexture, auroraTexture } from './textures.js';

export const MAP = { halfW: 32, halfD: 24 };

// Boxes are {x, z, hw, hd, h, kind}: kind picks the material.
// y is the box base height (0 = ground).
const WALLS = [
  // Perimeter (h = 4.5)
  { x: 0, z: -24.5, hw: 33, hd: 0.5, h: 4.5, kind: 'steel' },
  { x: 0, z: 24.5, hw: 33, hd: 0.5, h: 4.5, kind: 'steel' },
  { x: -32.5, z: 0, hw: 0.5, hd: 25, h: 4.5, kind: 'steel' },
  { x: 32.5, z: 0, hw: 0.5, hd: 25, h: 4.5, kind: 'steel' },
  // Site A — Comms Array: tower base + dish shelter, west-north
  { x: -24, z: -17, hw: 3.5, hd: 2.5, h: 3.2, kind: 'steel' },
  { x: -27.5, z: -11, hw: 1.5, hd: 2, h: 2.2, kind: 'crate' },
  { x: -18.5, z: -19.5, hw: 2, hd: 1.2, h: 1.6, kind: 'crate' },
  { x: -24, z: -8.5, hw: 4.5, hd: 0.8, h: 2.6, kind: 'steel' },
  // Site B — Generator Hall: hall block + fuel drums, east-north
  { x: 24, z: -17, hw: 4, hd: 3, h: 3.6, kind: 'steel' },
  { x: 27.5, z: -11, hw: 1.5, hd: 2, h: 2.2, kind: 'crate' },
  { x: 18.5, z: -19.5, hw: 2, hd: 1.2, h: 1.6, kind: 'crate' },
  { x: 24, z: -8.5, hw: 4.5, hd: 0.8, h: 2.6, kind: 'steel' },
  // Mid: frozen pond is open ground; two ice boulders guard the bridge
  { x: -6.5, z: -2, hw: 1.8, hd: 1.8, h: 1.8, kind: 'ice' },
  { x: 6.5, z: 2, hw: 1.8, hd: 1.8, h: 1.8, kind: 'ice' },
  // West ridge lane cover
  { x: -24, z: 2, hw: 2.5, hd: 1.2, h: 2.4, kind: 'steel' },
  { x: -26, z: 10, hw: 1.2, hd: 2.5, h: 2.0, kind: 'crate' },
  { x: -16, z: 8, hw: 1.5, hd: 1.5, h: 1.4, kind: 'crate' },
  // East service road cover
  { x: 24, z: 2, hw: 2.5, hd: 1.2, h: 2.4, kind: 'steel' },
  { x: 26, z: 10, hw: 1.2, hd: 2.5, h: 2.0, kind: 'crate' },
  { x: 16, z: 8, hw: 1.5, hd: 1.5, h: 1.4, kind: 'crate' },
  // Mid lane: research module blocks flanking the pond
  { x: -11, z: -6, hw: 2.2, hd: 1.2, h: 2.6, kind: 'steel' },
  { x: 11, z: -6, hw: 2.2, hd: 1.2, h: 2.6, kind: 'steel' },
  { x: -11, z: 7, hw: 1.4, hd: 1.4, h: 1.5, kind: 'crate' },
  { x: 11, z: 7, hw: 1.4, hd: 1.4, h: 1.5, kind: 'crate' },
  // South (Northlight) spawn shelter — low flanking walls, lane stays open
  { x: -14, z: 19, hw: 3, hd: 0.8, h: 2.2, kind: 'steel' },
  { x: 14, z: 19, hw: 3, hd: 0.8, h: 2.2, kind: 'steel' },
  { x: 0, z: 21.5, hw: 2, hd: 1, h: 1.5, kind: 'crate' },
  // North (Stormfront) spawn shelter
  { x: -14, z: -21, hw: 3, hd: 0.8, h: 2.2, kind: 'steel' },
  { x: 14, z: -21, hw: 3, hd: 0.8, h: 2.2, kind: 'steel' },
  { x: 0, z: -22.5, hw: 2, hd: 1, h: 1.5, kind: 'crate' },
];

// Waypoint graph: hand-placed nodes, explicit edges. Bots walk edges only.
// Layout: 0-3 south spawn, 4-7 west ridge, 8-11 mid pond, 12-15 east road,
// 16-19 site A, 20-23 site B, 24-27 north spawn / connector, 28-29 mid links.
export const WAYPOINTS = [
  { x: -8, z: 20 }, { x: 0, z: 19 }, { x: 8, z: 20 }, { x: 0, z: 14 },
  { x: -24, z: 14 }, { x: -24, z: 6 }, { x: -24, z: -2 }, { x: -22, z: -6 },
  { x: -4, z: 12 }, { x: -3, z: 4 }, { x: 0, z: -3 }, { x: 3, z: -9 },
  { x: 24, z: 14 }, { x: 24, z: 6 }, { x: 24, z: -2 }, { x: 22, z: -6 },
  { x: -18, z: -14 }, { x: -22, z: -14 }, { x: -24, z: -12 }, { x: -20, z: -6 },
  { x: 18, z: -14 }, { x: 22, z: -11 }, { x: 19, z: -12 }, { x: 20, z: -6 },
  { x: -8, z: -18 }, { x: 8, z: -18 }, { x: 0, z: -14 }, { x: 0, z: -20 },
  { x: -12, z: -4 }, { x: 12, z: -4 },
];
export const WAYPOINT_EDGES = [
  [0, 1], [1, 2], [0, 4], [1, 3], [2, 12], [3, 8], [3, 4], [3, 12],
  [4, 5], [5, 6], [6, 7], [7, 16], [7, 19], [6, 28],
  [8, 9], [9, 10], [10, 11], [11, 26], [10, 28], [10, 29], [11, 29],
  [12, 13], [13, 14], [14, 15], [15, 20], [15, 23], [14, 29],
  [16, 17], [17, 18], [16, 19], [19, 7], [18, 24], [16, 24],
  [20, 21], [21, 22], [20, 23], [23, 15], [22, 25], [20, 25],
  [24, 26], [25, 26], [26, 27], [24, 27], [27, 11],
  [28, 9], [28, 6], [29, 11], [29, 14], [28, 29],
  [5, 8], [13, 8], [9, 5], [9, 13],
];

export const SPAWNS = {
  // yaw is the bots' convention (forward = sin/cos); playerYaw is the
  // player's (camera rotateY: forward = -sin/-cos), so they differ by PI.
  northlight: [
    { x: -10, z: 21, yaw: Math.PI, playerYaw: 0 }, { x: -3, z: 22, yaw: Math.PI, playerYaw: 0 },
    { x: 3, z: 22, yaw: Math.PI, playerYaw: 0 }, { x: 10, z: 21, yaw: Math.PI, playerYaw: 0 },
  ],
  stormfront: [
    { x: -10, z: -21, yaw: 0, playerYaw: Math.PI }, { x: -3, z: -22, yaw: 0, playerYaw: Math.PI },
    { x: 3, z: -22, yaw: 0, playerYaw: Math.PI }, { x: 10, z: -21, yaw: 0, playerYaw: Math.PI },
  ],
};

export const SITES = {
  A: { name: 'Comms Array', letter: 'A', x: -22, z: -14, radius: 3.4 },
  B: { name: 'Generator Hall', letter: 'B', x: 22, z: -14, radius: 3.4 },
};

export const POND = { x: 0, z: 0, radius: 7 };

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {minX,maxX,minZ,maxZ,top} for movement
    this.occluders = []; // meshes the LOS raycaster tests
    this.auroraRibbons = [];
    this._build();
  }

  _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05, ...opts });
  }

  _build() {
    const snow = snowTexture();
    const ice = iceTexture();
    const steel = steelTexture();
    const steelDark = steelTexture('#27313a', '#1c242b');
    const crateTex = steelTexture('#4a3f33', '#33291f');
    const iceBlockTex = iceTexture();
    const hazard = hazardTexture();

    // Ground: snow plane + frozen pond disc.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP.halfW * 2 + 2, MAP.halfD * 2 + 2),
      new THREE.MeshStandardMaterial({ map: snow, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(POND.radius, 40),
      new THREE.MeshStandardMaterial({ map: ice, roughness: 0.25, metalness: 0.35 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(POND.x, 0.02, POND.z);
    pond.receiveShadow = true;
    this.scene.add(pond);

    // Sky dome + aurora ribbons.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);
    const aurTex = auroraTexture();
    for (let i = 0; i < 3; i++) {
      const ribbon = new THREE.Mesh(
        new THREE.PlaneGeometry(90 + i * 30, 26 + i * 8),
        new THREE.MeshBasicMaterial({
          map: aurTex, transparent: true, opacity: 0.5 - i * 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        }),
      );
      ribbon.position.set(-30 + i * 28, 42 + i * 6, -95 - i * 12);
      ribbon.rotation.x = 0.12;
      this.scene.add(ribbon);
      this.auroraRibbons.push(ribbon);
    }

    // Lights: cold moon + warm site lamps.
    const hemi = new THREE.HemisphereLight(0x8fb4d8, 0x1a2733, 0.85);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xcfe4ff, 1.1);
    moon.position.set(-28, 46, 18);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -40;
    moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40;
    moon.shadow.camera.bottom = -40;
    this.scene.add(moon);
    for (const site of Object.values(SITES)) {
      const lamp = new THREE.PointLight(site.letter === 'A' ? 0x59d8c9 : 0xffb347, 28, 22, 1.8);
      lamp.position.set(site.x, 5, site.z);
      this.scene.add(lamp);
    }
    const midLamp = new THREE.PointLight(0xffe9c4, 18, 18, 1.8);
    midLamp.position.set(0, 4.5, 0);
    this.scene.add(midLamp);

    // Walls from data.
    const mats = {
      steel: new THREE.MeshStandardMaterial({ map: steel, roughness: 0.8, metalness: 0.35 }),
      crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9, metalness: 0.1 }),
      ice: new THREE.MeshStandardMaterial({ map: iceBlockTex, roughness: 0.3, metalness: 0.2 }),
    };
    for (const w of WALLS) {
      const geo = new THREE.BoxGeometry(w.hw * 2, w.h, w.hd * 2);
      const mesh = new THREE.Mesh(geo, mats[w.kind] || mats.steel);
      mesh.position.set(w.x, w.h / 2, w.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.colliders.push({ minX: w.x - w.hw, maxX: w.x + w.hw, minZ: w.z - w.hd, maxZ: w.z + w.hd, top: w.h });
      this.occluders.push(mesh);
    }

    // Site pads: hazard ring + letter plate + dish (A) / generator (B).
    for (const site of Object.values(SITES)) {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(site.radius, 28),
        new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.85, transparent: true, opacity: 0.9 }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(site.x, 0.03, site.z);
      this.scene.add(pad);

      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshStandardMaterial({
          map: siteMarkerTexture(site.letter, site.letter === 'A' ? '#59d8c9' : '#ffb347'),
          roughness: 0.7, transparent: true,
        }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(site.x, 0.05, site.z + site.radius + 1.2);
      this.scene.add(plate);
    }
    // Comms Array dish on a mast at site A.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 10), this._mat(0x4a5a66, { metalness: 0.5, roughness: 0.5 }));
    mast.position.set(-27, 3.5, -19.5);
    mast.castShadow = true;
    this.scene.add(mast);
    this.occluders.push(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), this._mat(0xdfe9f2, { metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }));
    dish.position.set(-27, 7, -19.5);
    dish.rotation.x = Math.PI / 3.2;
    dish.rotation.z = 0.4;
    dish.castShadow = true;
    this.scene.add(dish);
    // Generator hall exhaust stacks at site B.
    for (const dx of [-1.4, 1.4]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.5, 10), this._mat(0x6b4a35, { metalness: 0.45, roughness: 0.6 }));
      stack.position.set(24 + dx, 2.75 + 3.6, -19);
      stack.castShadow = true;
      this.scene.add(stack);
      this.occluders.push(stack);
    }

    // Distant silhouettes: low hills + a relay mast, outside the walls.
    const hillMat = this._mat(0x22384a, { roughness: 1 });
    for (const [hx, hz, hr] of [[-58, -30, 16], [55, -38, 20], [0, -60, 24], [-60, 28, 14], [58, 30, 15]]) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(hr, hr * 0.55, 7), hillMat);
      hill.position.set(hx, hr * 0.2, hz);
      this.scene.add(hill);
    }
    const farMast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 18, 6), this._mat(0x2c3a46));
    farMast.position.set(48, 9, -44);
    this.scene.add(farMast);

    // Waypoint markers are invisible in play; the graph is data, not geometry.
    this.steelDark = steelDark;
  }

  // Circle (x, z, r) vs AABB colliders, one axis at a time. Returns the
  // corrected position; `y` is the actor's foot height, boxes only block
  // while their top is above the feet (so low crates can be stepped on only
  // if the actor is already above them — here every box blocks fully).
  collide(x, z, r, prevX, prevZ) {
    let nx = x;
    let nz = z;
    for (const c of this.colliders) {
      if (nx + r > c.minX && nx - r < c.maxX && prevZ + r > c.minZ && prevZ - r < c.maxZ) {
        nx = prevX;
      }
      if (nz + r > c.minZ && nz - r < c.maxZ && nx + r > c.minX && nx - r < c.maxX) {
        nz = prevZ;
      }
    }
    return { x: nx, z: nz };
  }

  // True when the segment between two points is blocked by a wall mesh.
  // Used for line-of-sight checks; the raycaster is supplied by the caller
  // so no raycaster is allocated per query.
  static segmentBlocked(raycaster, from, to, occluders) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.001) return false;
    raycaster.set(from, dir.normalize());
    raycaster.far = dist;
    return raycaster.intersectObjects(occluders, false).length > 0;
  }

  // Breadth-first shortest path over the waypoint graph; returns node indices.
  static findPath(fromIdx, toIdx) {
    if (fromIdx === toIdx) return [fromIdx];
    const adj = new Map();
    for (const [a, b] of WAYPOINT_EDGES) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [fromIdx];
    prev[fromIdx] = fromIdx;
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj.get(cur) || []) {
        if (prev[nb] !== -1) continue;
        prev[nb] = cur;
        if (nb === toIdx) {
          const path = [toIdx];
          let n = toIdx;
          while (n !== fromIdx) { n = prev[n]; path.unshift(n); }
          return path;
        }
        queue.push(nb);
      }
    }
    return [fromIdx];
  }

  nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const dx = WAYPOINTS[i].x - x;
      const dz = WAYPOINTS[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
}
