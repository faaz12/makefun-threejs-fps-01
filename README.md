# FROSTLINE — Relay Station 9

[![make.fun](https://make.fun/badge/threejs-fps-01)](https://make.fun/bounty/threejs-fps-01)
[![three.js 0.187.0](https://img.shields.io/badge/three.js-0.187.0-049ef4)](https://threejs.org)

A round-based tactical FPS in the browser, built on three.js 0.187.0 — an entry for the [make.fun "Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-01).

**The game.** At a polar research outpost under the aurora, Northlight (you + 3 bot teammates) faces Stormfront (4 bots) across Relay Station 9: three lanes, two plant sites — the Comms Array (A) and the Generator Hall (B) — and a frozen pond at mid. Plant the uplink beacon or eliminate the other team; first to 5 rounds takes the match.

- **First-person:** pointer-lock mouse look, WASD + crouch/jump/walk, acceleration + friction movement, box collision.
- **Gunplay:** 4 buyable weapons (P7 Frostbite pistol, K-12 Gale SMG, AR-90 Northwind rifle, V-88 Whiteout sniper) + thrown cryo charges. Hitscan against bodies with headshot multipliers, recoil and spread that punish firing on the move, muzzle flash, tracers, hitmarkers, ammo that runs out, reloads.
- **Tactics:** buy menu between rounds ($800 start, +$300/kill, +$3,250 round win), an objective beyond killing (plant/defuse the beacon, 30 s fuse), and bots that follow waypoint routes, hold positions, react to what they see and hear, strafe while engaging, escort the beacon carrier, plant and defuse.
- **The look:** an original night-arctic map — snow, ice, steel modules, aurora ribbons, site lamps — with procedural canvas textures and synthesized WebAudio sounds. No network requests at runtime; static files only.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Desktop Chrome (or any browser with WebGL 2). Click **DEPLOY**, then **B** for the buy menu during the buy phase.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own code in headless Chromium (`?shot=play|buy|end|start&seed=1` stages a live firefight, the buy menu, a round end and the deploy screen). `shots.json` lists them.

## Layout

- `game/` — the game: `index.html` + ES modules in `src/` (one job each: palette, textures, audio, input, world, weapons, player, bots, objective, effects, hud, game, main) and vendored three.js 0.187.0 under `game/vendor/three/`.
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `serve.ts` — a tiny local static server for development.

## License

MIT — see `LICENSE`.
