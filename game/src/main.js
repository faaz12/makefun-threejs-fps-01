// FROSTLINE entry point: builds the renderer and every module, runs the
// fixed-step simulation apart from rendering, wires the menus, and stages
// the deterministic screenshot modes (?shot=start|play|buy|end&seed=N).
// The game exposes window.__state (live simulation state) for play-tests.
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Game, mulberry32 } from './game.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { WEAPONS, BUY_ORDER, buyWeapon } from './weapons.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot'); // null | start | play | buy | end
const seedParam = params.get('seed');
const SHOT = shotMode !== null;

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1420, 55, 190);

const world = new World(scene);
const effects = new Effects(scene);
const sound = new SoundBank();
const hud = new Hud(document);
const input = new Input(renderer.domElement);
const player = new Player(world, sound);
const game = new Game({ scene, hud, input, sound, world, effects, player });

if (seedParam !== null) game.rng = mulberry32(Number(seedParam) || 1);
if (SHOT) sound.setMuted(true);

window.__game = game;
window.__state = game.stateSnapshot();
window.__shotReady = false;

// ---- input wiring ----

input.onKey = (code, down) => {
  if (!down) {
    if (code === 'Tab') hud.showScoreboard(false);
    return;
  }
  if (code === 'KeyR') player.startReload();
  if (code === 'KeyG') game.throwGrenade();
  if (code === 'KeyB') toggleBuy();
  if (code === 'Tab') {
    hud.showScoreboard(true, scoreboardRows());
    return;
  }
  if (code === 'Escape' && game.buyOpen) toggleBuy();
  const buyIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code);
  if (buyIndex >= 0 && game.buyOpen) buyItem(BUY_ORDER[buyIndex]);
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
    const ids = ['pistol', 'smg', 'rifle', 'sniper'];
    const id = ids[['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code)];
    const slot = player.loadout[id];
    if (!game.buyOpen && slot && (slot.mag > 0 || slot.reserve > 0)) {
      player.loadout.current = id;
    }
  }
};

input.onMouseDown = () => {
  if (game.phase === 'deploy' || game.phase === 'matchEnd') return;
  if (!player.alive) {
    game.cycleSpectate();
    return;
  }
  if (game.buyOpen) return; // clicks go to the buy menu rows
  input.requestLock();
};

input.onLockChange = (locked) => {
  // Leaving pointer lock during a live round pauses nothing, but the
  // deploy overlay is the only thing that may re-appear on lock loss.
};

function toggleBuy() {
  if (game.phase !== 'buy') {
    if (game.buyOpen) {
      game.buyOpen = false;
      hud.showBuy(false);
      input.requestLock();
    }
    return;
  }
  game.buyOpen = !game.buyOpen;
  hud.showBuy(game.buyOpen);
  if (game.buyOpen) {
    hud.updateBuy(player);
    input.exitLock();
  } else {
    input.requestLock();
  }
}

function buyItem(id) {
  if (!game.buyOpen || game.phase !== 'buy') return;
  const result = player.buy(id);
  if (result === 'ok') hud.toast(`${id === 'armor' ? 'Plated Vest' : id === 'grenade' ? 'Cryo Charge' : WEAPONS[id].name} bought`);
  else if (result === 'poor') { hud.toast('Not enough money'); sound.denied(); }
  else if (result === 'owned') hud.toast('Already owned');
  hud.updateBuy(player);
  hud.setMoney(player.money);
}

function scoreboardRows() {
  const rows = [{ name: 'You', team: 'Northlight', kills: player.kills, deaths: player.deaths }];
  for (const b of game.bots) {
    rows.push({ name: b.name, team: b.team === 'northlight' ? 'Northlight' : 'Stormfront', kills: b.kills || 0, deaths: b.deaths || 0 });
  }
  return rows;
}

// Buy-menu rows are clickable (pointer-events are on for the menu).
document.querySelectorAll('.buy-row').forEach((row, i) => {
  row.addEventListener('click', () => buyItem(BUY_ORDER[i]));
});

document.getElementById('play').addEventListener('click', () => {
  sound.unlock();
  sound.startWind();
  hud.showDeploy(false);
  game.startMatch();
  input.requestLock();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  hud.hideMatchEnd();
  game.startMatch();
  input.requestLock();
});

window.addEventListener('resize', () => {
  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- screenshot staging ----

function aimAt(target) {
  const eye = player.eyePosition(game._v1);
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

function stageShot(mode) {
  hud.showDeploy(false);
  hud.hideMatchEnd();
  game.startMatch();
  if (mode === 'start') {
    // Deploy overlay over the map, camera at the south spawn looking north.
    // Freeze the simulation on the deploy phase so the overlay stays put.
    game.phase = 'deploy';
    game.buyOpen = false;
    hud.showBuy(false);
    hud.showDeploy(true);
    player.pos.set(0, 0, 21);
    player.yaw = 0;
    player.pitch = 0;
    player.syncCamera();
  } else if (mode === 'buy') {
    // Buy phase with a full wallet, so every row shows its real state.
    player.money = 3200;
    buyWeapon(player.loadout, 'smg');
    player.loadout.current = 'smg';
    hud.updateBuy(player);
    player.pos.set(0, 0, 18);
    player.yaw = 0;
    player.pitch = 0.02;
    player.syncCamera();
  } else if (mode === 'play') {
    game.startLive();
    // A real mid-lane firefight: player with the Northwind rifle, a
    // Stormfront bot ahead, a Northlight teammate in the lane.
    buyWeapon(player.loadout, 'rifle');
    player.loadout.current = 'rifle';
    player.pos.set(0.5, 0, 9);
    player.yaw = 0;
    player.pitch = 0;
    const enemy = game.bots.find((b) => b.team === 'stormfront');
    enemy.pos.set(0.5, 0, -2);
    enemy.yaw = 0;
    enemy.state = 'hold';
    enemy.holdTimer = 30;
    enemy._syncMesh();
    const mate = game.bots.find((b) => b.team === 'northlight');
    mate.pos.set(-4.5, 0, 3);
    mate.yaw = Math.PI;
    mate.state = 'hold';
    mate.holdTimer = 30;
    mate._syncMesh();
    // No render has happened yet, so the bots' world matrices are stale:
    // refresh them before the staged raycasts, or every shot misses.
    scene.updateMatrixWorld(true);
    // Fire real shots until the bot dies: raycast, damage, kill feed.
    const def = WEAPONS.rifle;
    let guard = 0;
    while (enemy.alive && guard < 8) {
      aimAt({ x: enemy.pos.x, y: 1.62, z: enemy.pos.z });
      player.syncCamera();
      game.playerShoot(def);
      player.loadout.rifle.mag -= 1;
      guard += 1;
    }
    hud.hitmarker(true, 30000);
    // Look down at the fallen bot, so the kill reads in the frame.
    aimAt({ x: enemy.pos.x, y: 0.4, z: enemy.pos.z });
    player.syncCamera();
    hud.updateBuy(player);
  } else if (mode === 'end') {
    game.startLive();
    game.score = { northlight: 3, stormfront: 1 };
    game.round = 5;
    game.objective.plant('A');
    game.endRound('northlight', 'Beacon detonated at site A');
    game.objective.fuse = 0; // the fuse really did run out at detonation
    hud.showBanner('ROUND WON', 'Beacon detonated at site A  ·  Northlight 4 — 1 Stormfront', 30000);
    // Clear sightline to the site A pad from the south-east.
    player.pos.set(-13, 0, -7);
    player.yaw = Math.atan2(-(-22 + 13), -(-14 + 7));
    player.pitch = 0.04;
    player.syncCamera();
  }
  // Let the world settle, then signal the screenshot runner.
  game.update(1 / 60);
  player.syncCamera();
  game.syncHud();
  window.__state = game.stateSnapshot();
  window.__shotReady = true;
}

// ---- main loop: fixed 60 Hz simulation, render decoupled ----

const STEP = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();
let shotStaged = false;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    if (game.phase !== 'deploy' && game.phase !== 'matchEnd') game.update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (accumulator > STEP * 5) accumulator = 0;

  if (SHOT && !shotStaged) {
    shotStaged = true;
    stageShot(shotMode);
  }

  // Camera follows the player (or the spectated bot, via game).
  if (player.alive) player.syncCamera();
  effects.update(frameDt, player.camera.position, now / 1000);
  for (const ribbon of world.auroraRibbons) {
    ribbon.material.opacity = 0.34 + 0.12 * Math.sin(now / 2400 + ribbon.position.x);
  }
  game.syncHud();
  window.__state = game.stateSnapshot();
  renderer.render(scene, player.camera);
}

requestAnimationFrame(frame);
