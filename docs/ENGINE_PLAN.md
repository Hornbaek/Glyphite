# Pixelite engine: assessment and improvement plan

## STATUS (2026-11-12): what is done, what is left, and how to carry on

**Start here, in this order:** `CLAUDE.md` (rules, how to ship) → this section → `docs/HISTORY.md` sections 53 to 57 (what was built, per package, with the measured numbers) →
`docs/ROADMAP.md` ("The engine plan: what is done, what is open") → `engine/API.md` (the whole public API, it was extended a lot) → `games/proving/NOTES.md` (the test level that
shows every platformer feature, and how it is tested). The package texts further down are the original plan; the table here says which are done.

### Package status

| Package | State | Where / notes |
|---|---|---|
| A1-A8 (Windows build, one version, pause as a flag, author checks, errors shown, structures, fast bodies) | done | HISTORY 53 |
| B1-B4 (seeded `rnd()`, simulation clock, record/replay, Node engine bench) | done | HISTORY 53; `tests/node/engine-harness.mjs`, `tests/engine_browser.py` |
| B5 (golden screenshots, budgets, phone) | partly | done: `tests/smoke.py --phone`, a 900 KB page budget in the build, `tests/perf.py`. **Left:** golden screenshots per game and renderer |
| C1-C11 | done | HISTORY 55. C7: no per-cell HUD background colour (boxes hide what is behind instead). C11: `engine/api.json` + `tools/apicheck.mjs` lint |
| C12 (starters per genre) | partly | done: `node tools/pixelite.mjs new <id> --kit platformer` (copies the Proving Ground). **Left:** top-down, isometric and sandbox kits |
| D1, D3-D10 | done | HISTORY 55. Not converted on purpose (risk): Regolith's `boulderVsLander` and rockets, Space Mouse's station builder to `loadTileMap`, `explode()` calling `carve` |
| D2 liquids, reactions, heat | done | HISTORY 56. **Left (the agent's own list):** pressure (a U-tube does not level), waves, a veil of water over a sprite standing in it, gas as a material, particles that react, the falling-sand sandbox proof game |
| E2 lamp cache, P1-P3, P6 | done | HISTORY 57. P4 (GPU tone mapping) decided against on the numbers; P5 not needed. **Left:** keep a lamp's cast across a camera move ("shift and fill the edge"); a terrain snapshot that survives flickering lamps |
| E1 sun from either side | **done on a branch, not merged** | `origin/worktree-agent-a276acf83fb7dbba3`, commit 277fb80 |
| E5 layers in front and far behind | **done on a branch, not merged** | same branch, commit f80aa60 |
| E3 emissive sprite pixels, E4 back-wall shadows per light | **work in progress, unverified** | same branch, tip 0d0f8c1 ("WIP (not verified)"): the engine, tools (`tools/pixelsprite.py`, `tools/art.mjs`, `tools/art/`) and tests are partly written; finish, verify, then merge |
| E6 palette lock / post effects, E7 zoom, E8 weather and time of day | not started | E8 is a new part `engine/21_weather.js` |
| F1, F3, F4 | done | HISTORY 54. Not done: a `Music` source for Chip songs, bar-line-quantised transitions, `explode()` sound with pan |
| F2 key remapping | partly | rebinding is in the shell's pause menu. **Left:** a colour-blind-safe HUD set, hold-to-toggle |
| G1 (roadmap as "open work only") | not done | `docs/ROADMAP.md` still mixes done and open; the section "The engine plan" is the up to date part |
| G2 (split 07) | done | `07_sound.js`, `07_input.js` |

Owner decisions taken (the plan asked): C1 yes, a game may offer fewer detail levels (opt-in, `detail: { levels: [2] }`); E6 an option, not the default; C9 a shared default shell,
replaceable; P5 (cross-origin isolation headers) not touched.

### What to do next (suggested order)

1. **Take the look branch**: `git fetch`, check out `worktree-agent-a276acf83fb7dbba3` as a feature branch (`feature/look`), merge `main` into it (`git -c core.autocrlf=false merge`),
   run the whole verification list below, finish E3 and E4 (read its WIP commit and `tests/node/engine-look.test.mjs`, `tests/engine_look.py`), then E6, E7, E8, and show them in the
   Proving Ground (a front layer of grass, a backdrop of hills, a day and night cycle on a tunable, an emissive lamp sprite). Bump the engine to 0.18.0, regenerate `engine/api.json` and
   `engine/internal.json` (`node tools/apicheck.mjs --write`), document in `engine/API.md`, add a HISTORY section. The lighting caches (`04_light.js`, `06_scene.js`) mean anything that
   changes a frame must be in the cache keys or invalidate them: `tests/engine_cache.py` and `tests/node/engine-cache.test.mjs` must keep passing, and every existing game must
   render bit for bit as before when a new feature is off (`Pixelite.test.hash()`, the buffer checksums of `engine_cache.py`).
2. **B5 golden screenshots** and the **other starter kits** (C12), the **F2** leftovers, **G1** (rewrite the roadmap as open work only, with this plan's packages).
3. **Platformer ideas from the idea bank not built yet**, now cheap with the toolkit: a boss as a breakable structure with mounts (and a boss rush kit), a jump-link navgraph *follower*
   for enemies (the graph exists: `reachSearch`, `navPath`, `navInput`), difficulty presets from tunables (`presets` is an allowed `game.json` key but nothing reads it yet), a
   speedrun timer with splits and author medals (the replay and ghost exist), onboarding hints from bot struggles, a platformer reachability overlay in the web editor (`jumpArc`
   exists), a water/fire station that uses the reactions in the Proving Ground, converting Space Mouse's station builder to `loadTileMap`.
4. The liquids leftovers (above) when a game needs them.

### Branches and pull requests

- Everything up to engine **0.17.1** (A, B, C, D, F, liquids, speed) is meant to be on `main` through PR 48 (`feature/a-foundations`). The sub-agents' branches
  `worktree-agent-ad780a119f7e58834` (audio), `-aa798658ee76e87af` (liquids), `-ac4b8929a6f13b2d3` (speed) are fully contained in it and can be deleted.
- `worktree-agent-a276acf83fb7dbba3` (look: E1, E5 and WIP E3/E4) is **not** on `main`; it is the starting point of the next session (step 1).
- PR 47 (the original plan document) is superseded by this file and conflicts with it: close it.

### Working notes (things that cost time)

- **Windows**: `.gitattributes` forces LF; `git status` may list every file as modified if `core.autocrlf=true` (harmless; never "fix" it with `reset --hard`). `python` not `python3`.
  Playwright's own Chromium may be missing: run browser scripts with `python tools/with_chrome.py <script> [args]` or set `PIXELITE_BROWSER_CHANNEL=chrome`.
- **Editing**: heredocs with backslashes (regexes, `\n`) get mangled when a script is written inline; use the Edit tool or write the script to a file first.
- **One script scope**: engine and game share globals. The build refuses a game function that repeats an engine name; a `let`/`const` clash shows up as a syntax error (`REC` was one). Name game things with a prefix.
- **Tests that wait on wall time are flaky on CI**: freeze the game (`Pixelite.test.freeze()`), render at an explicit time (`Pixelite.test.render(2.5)`), clear `FEED`.
- **The engine test bench**: `loadEngine({ game: 'proving' })` loads any game's parts into a Node `vm` with `Pixelite.run` recorded: fast tests of physics and level logic with no browser.
- **Verification list (run before a PR)**: `npm run build` (SYNTAX_OK), `npm test`, `python tests/smoke.py --all` and `--all --renderers 2d --phone`, `python tests/engine_browser.py`,
  `engine_light.py`, `engine_audio.py`, `engine_sound.py`, `engine_cache.py`, `node games/proving/tests/check.mjs` (about a minute), `python games/proving/tests/mechanics.py`,
  `python games/spacemouse/tests/reach.py --res 1`, `python games/spacemouse/tests/mechanics.py`, `python games/fjordheim/tests/playthrough.py`, Regolith's `check_x3_clearance.py` and
  `check_floating_islands.py`. CI runs the same.
- **Shipping** (CLAUDE.md): branch, PR, wait for both checks, squash-merge, check the deploy.

---

## The original plan (written before the work; packages and reasons, for reference)

## Context

The owner asked for a complete analysis of the game engine (not the idea bank, which they will run separately): how to
improve what it can do, its mechanics, its interface and how it works. This file is a plan only. Other models will
execute it later, one work package at a time.

**What this is based on.** I read every line of `engine/01_core.js`, `02_particles.js`, `03_body.js`, `04_light.js`,
`05_render.js`, `06_scene.js`, `07_audio_input.js`, `09_structures.js`, `10_sprite.js`, `11_loop.js`, `12_iso.js`,
`engine/API.md`, `engine/shell.html`, `tools/assemble.mjs`, `docs/ROADMAP.md`, `docs/LESSONS.md`, `tests/smoke.py`, the
CI workflow, the starter game, and the function lists and notes of the three games. **Not read in full:** `08_chip.js`
and `13_sampler.js` (outlined only), `docs/ARCHITECTURE.md`, `docs/HISTORY.md`, the portal and the Worker. Nothing was
built or run: every finding is from reading code. Performance numbers are estimates to be measured (package P1 first).
The owner's stars and statuses in D1 could not be read (no connector, sign-in needed).

## The assessment in short

**Strong today:** a destructible grid with sand, breakable structures that fall as rigid chunks and freeze back, a good
platformer `Character`, hard-shadow sun plus ray-cast lamps with gameplay queries (`sunAt`, `isLitBy`, `lineClear`),
normal-mapped pixel sprites, an isometric ground, a test API (`Pixelite.test`), and one shared assembler for build and
editor.

**The seven biggest gaps** (each has packages below):

1. **Games rebuild the same things.** All three games and the starter hand-roll entity lists, projectiles
   (`fireRocket`/`stepRockets`, `fireBolt`/`stepBolts`), animation frames (`catFrame`, `mouseFrame`, `walkFrame`,
   `personFrame`), floating text (`drawWorldLabels`, `floatText`), menus and buttons (Fjordheim's `hudButton`,
   `hudPanel`, `menuAt`, `wrapText`), cameras, body-vs-body contact (`boulderVsLander`), tile maps, title/pause/game-over
   screens. The engine has no layer between "raw grid + hooks" and "a game".
2. **The world is only solid or sand.** No liquids, no climbable / hazard / slippery flags, no moving platforms, no
   body-to-body or chunk-to-chunk contact, gravity only straight down, no triggers.
3. **Nothing is deterministic.** 34 `Math.random` call sites in the simulation and wall-clock time in drawing, so no
   replays, no golden screenshots, tests check loose outcomes.
4. **Lighting is recomputed in full, in JavaScript, every frame**: several passes over every visible cell plus
   every lamp's rays, even when nothing moved. It is the likely frame-time ceiling at high detail.
5. **Silent failure for authors.** A mistyped material option or hook name is ignored; errors in a deployed game are
   invisible; `Pixelite.version` says `0.5.0` while `engine.json` says `0.14.0`.
6. **No player-facing shell.** No settings (volume, keys), no save, no gamepad, mute is not remembered, one finger
   only, pause only works in the state named `play`.
7. **Every game must support five detail levels** by rebuilding its world in `regenerate()`: the largest authoring
   burden, inherited from the ASCII engine.

## Rules for whoever executes a package

- One package = one branch = one pull request, following `CLAUDE.md` ("Shipping changes", "Verify before saying it's
  done"). Engine changes: `npm run build && npm test && python3 tests/smoke.py --all`, both renderers, look at the shots.
- Every engine change: general feature, never a game's name in engine code; update `engine/API.md`, bump
  `engine/engine.json` version, note it in `docs/HISTORY.md`, move the item in `docs/ROADMAP.md`.
- When a package generalises something a game wrote itself, **convert that game to the engine version in the same
  PR and delete the game's copy** (that is the proof it is general).
- Keep both renderers equal. Keep behaviour equal at every detail level the game declares.
- Do packages in the order of the "Order" section; A1 and A2 first (this checkout cannot build without A1).

Sizes: S = under a day of session work, M = one session, L = several sessions.

---

## A. Correctness and safety nets (do first)

**A1. Make the repository build on Windows. (S)** `core.autocrlf` is `true` here and there is no `.gitattributes`;
`docs/LESSONS.md` records that a CRLF checkout fails (`checkSyntax` in `tools/pixelite.mjs` looks for `<script>\n`, and
generated-file tests compare bytes). Add `.gitattributes` (`* text=auto eol=lf`, binary for png/mid), make `checkSyntax`
and the tests that compare generated files tolerate `\r\n`, and make the npm scripts and docs work with `python` as well
as `python3`. Done when a fresh Windows clone builds and `npm test` passes.

**A2. One engine version. (S)** `engine/11_loop.js` hard-codes `Pixelite.version: '0.5.0'`. Have `tools/assemble.mjs`
emit `const ENGINE_VERSION = "<engine.json version>"` beside `GAME_MANIFEST` and read it in `Pixelite.version` and
`Pixelite.test.probe()`. Unit test: built page reports the manifest's version.

**A3. Presses made while paused fire on resume. (S)** `frame()` runs no `update()` while `state === 'paused'`, and
`Input.pressed` is only cleared inside `update()`, so taps and keys collect and are all delivered on the first step
after resuming (the starter would fire a bolt). Clear `Input.pressed`, `fireQueued` and `drag` once per frame when no
step ran. Add a probe test: pause, press, resume, assert nothing fired.

**A4. Pause as a flag, not a state. (S)** `engineKey` only toggles pause when `state === 'play'`, and pausing
overwrites the game's state name, so a game in `'build'` or `'night'` cannot pause and Fjordheim wrote its own. Add
`Pixelite.paused` / `Pixelite.pause(on)`; keep `state === 'paused'` working as an alias for existing games. Also pause
automatically when the page is hidden.

**A5. Strict mode for authors. (M)** Today these fail silently: unknown keys in `defineMaterial` (`applyMaterial`
copies only known fields), unknown hook names in `Pixelite.run`, lights with missing fields (NaN spreads into the light
buffers), non-ASCII HUD text (drawn as `?`), a duplicate key in the hooks object (LESSONS: two `afterFrame`). Add
`engine/00_dev.js`-style checks that run when the page has `?dev`, in the editor preview and in `Pixelite.test`:
warn with the nearest valid name, assert finite numbers in `Body`, `Character`, `spawnP`, lights. Make the build fail on
duplicate keys in the `Pixelite.run({...})` literal and on unknown `game.json` keys.

**A6. Show errors. (S)** Add a `window.onerror` / `unhandledrejection` handler in the engine: in dev, an overlay with
the message mapped to `file:line` through the `// ----- path -----` markers (`lineMap` in `tools/assemble.mjs`); in
production, one line on the HUD ("Something broke: reload") instead of a frozen picture.

**A7. Structures: three known wrong results. (M)** In `engine/09_structures.js`: (a) `breakOff` returns for pieces over
`2600·RES²` cells, leaving a hillside floating in the air; let it fall as a slow kinematic slab or crumble its lowest
band instead. (b) `stepChunks` freezes any chunk at `age > 20` wherever it is, and `freezeChunk` writes only into empty
cells, so mass disappears and it can freeze inside a body; on forced freeze, push it to free space first and turn
cells that do not fit into grains. (c) A chunk resting on a game body never rests (ROADMAP backlog): treat contact with
a resting body as support. Tests: mass before = mass after for each case.

**A8. Fast bodies tunnel. (S)** `Body.step` moves once per step; chunks get two sub-steps, particles up to ten. Sub-step
`Body.step` by speed the way `stepParticles` does (`n = 1 + speed·dt / 0.7`, capped), so a body cannot pass through a
one-cell wall. Test at RES 1 and 3.

## B. Determinism and testing

**B1. A seeded simulation random. (M)** Add `Pixelite.seed(n)` and an engine `rnd()` (the existing `mulberry32`); make
`rr`, `pick`, `spawnP`'s per-particle byte, `worldInit`'s `vari`, `simGranular`, `explode`, structures use it. Keep
`Math.random` only for audio noise. Games' own `Math.random` calls: add a build warning. Done when two runs with the
same seed and inputs give the same `cells` checksum after 600 steps, in each game.

**B2. A simulation clock for drawing. (S)** `draw(now / 1000)` passes wall-clock time to `flickerAt`, crystals, the
sky, `shimShift`; `say()` and `drawToast` use `performance.now()`. Pass `frameNo·DT`-based time (it then also stops in
pause and slows in slow motion); keep wall time only for the toast. Screenshots of a frozen frame become repeatable.

**B3. Record and replay input. (M)** With B1 and B2: `Pixelite.test.record()` / `replay(log)` storing keys and pointer
per step, a `?replay=` loader, and `Pixelite.test.tap(worldX, worldY)`, `stepUntil(fn, max)`. Lets a bug report or a
level solution be a small JSON file.

**B4. An engine test bench without a game. (M)** No engine physics is tested apart from games. Make parts 01, 02, 03, 09
loadable in Node (`vm`) behind a tiny DOM shim (they touch `window.matchMedia` and listeners at load), and add
`tests/node/engine-*.test.mjs`: sand rests at its slope and keeps mass; `Character` jump height and step-up are the same
at RES 1, 2, 3; a body comes to rest; a cut post falls and freezes; `lineClear` / `sunAt` agree with the grid. Fast, no
browser.

**B5. Golden screenshots and budgets in CI. (M)** After B1/B2: per game, one seeded scene per renderer compared to a
stored image with a small tolerance; a page-size budget and a JavaScript step-time budget from P1's timers; a phone
viewport in `tests/smoke.py` (it only runs 1280 × 800 now).

## C. The author's interface (what a session writes against)

**C1. Detail levels a game chooses. (S, owner decision)** `DETAIL_LEVELS` is fixed at five and every game must write
`regenerate()`. Pixel art has one native size. Let `Pixelite.run({ detail: { levels: [2] } })` restrict it (hide the
keys and button when there is one), and make the smoke test and the "same at RES 1–3" rule apply to declared levels
only. See "Owner decisions".

**C2. Keep the world across a detail change. (M)** For games that keep several levels: an engine `rescaleWorld(from,
to)` that resamples `cells`, `backCells`, `heat`, and scales particles, chunks and registered entities (C3), used when
the game gives no `regenerate`. Removes the need to rebuild and re-`start()` after every switch.

**C3. Entities. (L)** A small registry every game otherwise writes: `spawn(type, x, y, props)`, `defineEntity(name, {
size, sprite, update, draw, lights, onHit, onLeave })`, the engine steps, culls, draws, marks shadows and collects lights
for them; `overlapping(e, type)` and `near(x, y, r, type)` over a uniform hash; `e.dead` removal; included in
`probe()`, `snapshot()` and C2. Convert the starter's bolts and Space Mouse's cat-bots as the proof.

**C4. Sprite animation. (M)** Frames are "several sprites" today and each game writes a frame picker. Add
`defineAnim(sprites, { fps, loop, tags: { run: [0, 5], jump: [6, 7] } })` and `drawSprite(anim, x, y, a, { tag, t })`
driven by the simulation clock; the art pipeline's frame assets (`tools/art.mjs`) emit it directly. Also add the three
draw options games fake: `tint`, `flash` (white hit flash), `palette` (swap colours for teams or states).

**C5. Input as actions, plus gamepad and multi-touch. (M)** Games read raw `keyDown('ArrowUp', 'KeyW')` and
`Input.touch.left` separately. Add `game.json` `"actions": { "jump": ["Space", "KeyW", "pad:a", "touch:jump"] }` and
`action('jump')` / `actionPressed('jump')` / `axis('move')`; the touch buttons and the controls list on the title are
generated from it; add the Gamepad API (none today); track two pointers (`setupInput` ignores a second finger) to give
`Input.pinch` and a long press as `'TapHold'`. Remapping (F2) builds on this.

**C6. Camera rigs. (M)** `updateCamera` has one fixed easing (`3.2`), clamps to the world and nothing else; LESSONS
records the camera trailing long falls, and each game writes look-ahead by hand. Add `setCamera({ follow, lead, deadzone,
ease, bounds, rooms })`: follow an entity or point with velocity look-ahead, a dead zone, screen-by-screen rooms,
adjustable bounds; `cameraShake(amount)` instead of writing `FX.shake`; keep the `camera()` hook as the override.

**C7. HUD kit. (M)** Engine-side versions of what Fjordheim and the starter wrote: `hudButton(c, r, label, opts)` →
clicked (with touch-sized hit boxes and hover), `hudPanel`, `hudBar(value, max)`, `hudWrap(text, width)`, `hudMenu(items)`
with keyboard, pointer and gamepad focus; `hudPointer()` → the HUD cell under the pointer; a per-cell background colour
(ROADMAP: icons and panels sit on black; needs a second colour in `R.hC` and the HUD shader); a double-size font for
titles. Convert Fjordheim's build menu.

**C8. Messages and floating text drawn by the engine. (S)** `addText` stores into `FX.texts` and nothing draws them:
the starter, Regolith and Fjordheim each loop over them. Draw them in the engine (rising, fading, off by a flag). Make
`say(text, { time, colour })` a stacking feed (it is one 1.6 s toast; Fjordheim keeps its own list).

**C9. A standard shell: title, pause, game over, settings. (M)** Every game draws its own title box, pause box and
result boxes, and none has settings. Provide `Pixelite.screens` defaults built from `game.json` (title, tagline,
controls from C5): title, pause menu (resume, restart, sound, detail, controls, fullscreen), result screen with a
score; each replaceable by the game. Uses C7.

**C10. Settings and saves. (M)** Only the detail level is stored (`storeKey`); mute is forgotten on reload and volume
is fixed at 0.5. Add `Pixelite.settings` (music and effects volume, mute, detail, bloom, reduced motion, key bindings)
and `Pixelite.save(slot, data)` / `load(slot)` with a version number per game, plus `worldSave()` / `worldLoad()`
(run-length-packed `cells`, `backCells`, entities) for sandbox and builder games (Fjordheim: "No saving").

**C11. A machine-readable API and a lint. (M)** `engine/API.md` is hand-kept prose and still speaks ASCII in places
(`ramp`, `grainGlyphs`, "glyph"). Generate `engine/api.json` from the source (every top-level name, its kind and
arity; the build already lists engine names in `checkNames`), have the build warn when game code calls an unknown
global or passes the wrong number of arguments, and add a unit test that every public name is in `API.md`. Rename the
ASCII-era options with aliases kept (`grains` for `grainGlyphs`; drop `ramp`).

**C12. Starters per genre. (M, after C3–C9)** `templates/starter` is a flying game only. Add
`node tools/pixelite.mjs new <id> --kit platformer|topdown|iso|sandbox`, each small and built only from engine pieces
(tile map D8, `Character`, entities, camera rig, shell). Update the `pixelite-new-game` skill.

## D. Mechanics

**D1. Material flags for characters. (M)** ROADMAP's open item. Add `climbable`, `hazard` (a damage number),
`grip` (0..1: ice; `Character` ignores `friction` today, only `Body` feet use it), `conveyor` (a speed), `bouncy`; and
give `Character` `contacts` (materials touched under, beside, above, inside) so games stop scanning (`touching`,
`nearMat` in Space Mouse). `Character` gains climbing and conveyor carry. Convert Space Mouse's hazard table.

**D2. Liquids. (L)** The cellular step (`simGranular`) only knows sand. Add `liquid: true` with `viscosity`: falls,
spreads sideways to level, pools; `Character`/`Body` get buoyancy and drag in it; particles splash; light dims with
depth (D-light option). Then reactions as data: `reacts: [{ with, makes, heat }]` (water + lava → rock and steam),
`flammable` with fire spreading through `heat`, and heat conduction between cells (heat only cools today). This is the
"falling-sand sandbox" the roadmap wants as the next proof game.

**D3. Moving platforms and carried characters. (M)** ROADMAP: a `Character` stands on a falling chunk but is not
carried sideways. Add kinematic chunks (`moveChunk(ch, path)` / an entity flag `solid`), carry any `Character` or body
standing on one by its velocity, crush rules when squeezed. Space Mouse's lift art is waiting for this.

**D4. Bodies touch each other. (M)** Only body-vs-grid and chunk-vs-game-body (`chunkVsBody`) exist; Regolith wrote
`boulderVsLander`, and chunks pass through each other (ROADMAP backlog). Generalise `chunkVsBody` into `bodyVsBody(a,
b)` using each side's hull and occupancy, run it for chunk pairs through a broad phase, and for registered entity
bodies (C3). Reduce garbage while there: `Body.collide` allocates a contact array and objects every step.

**D5. Gravity as a vector, and zones. (M)** ROADMAP. `G` is added to `vy` in `Body.step`, `stepParticles`, `Character`.
Add `setGravity(x, y)` in m/s², per-body `gravity` scale, and `gravityAt(x, y)` zones (Space Mouse has
`lowGravityAt`); sand keeps falling along the dominant axis (state that limit in the API).

**D6. Carve, dig and place without an explosion. (S)** `explode()` is the only way to remove matter and always brings
fire, sound and shake; Space Mouse wrote `bite`. Split out `carve(x, y, R, { power, eject, heat })` and
`fill(x, y, R, m)`, which wake the sand and run the support check; `explode` calls `carve` plus effects.

**D7. Projectiles and rays. (S)** Add `raycast(x0, y0, dx, dy, max)` → `{ x, y, cell, material, chunk, entity,
normal }` (terrain, chunks, entities) and a `Projectile` entity (gravity, drag, bounce, lifetime, `onHit`). Replaces
the starter's bolts and Regolith's rockets.

**D8. Tile maps, props and triggers as engine features. (M)** Space Mouse's `tileAt`, `buildSector`, decor drawing and
zones are general (ROADMAP: "prop tiles", "a walking-game starter"). Add `loadTileMap(rows, legend)` (each legend
entry: world material, back material, prop sprite, entity to spawn, trigger), `drawProps` with view culling, and
`addTrigger(rect, { onEnter, onLeave })`. The editor's LEVELS tab already reads this legend shape.

**D9. Path finding and steering. (S)** Move Fjordheim's `findPath` (A*, eight ways, no corner cutting) into the engine
for tile grids, add a platformer variant over standing spots (Space Mouse's reach search has the graph), and
`seek/flee/wander` helpers for entities.

**D10. Timers, tweens and state machines. (S)** Games track `stateT` by hand and write easing inline. Add
`after(seconds, fn)`, `every(seconds, fn)`, `tween(obj, { x }, seconds, ease)` on the simulation clock (so pause and
replay work), and `Pixelite.states({ title: { enter, update, hud }, ... })` as an optional structure over `setState`.

## E. Light and look

**E1. Sun from either side. (S)** ROADMAP. `setSun` clamps elevation to 1..89 and `sunSweep` walks columns left to
right. Accept 91..179 by mirroring the sweep (run it over a mirrored column index) and mirror `sunAt`. Test: shadows
fall the other way in both renderers.

**E2. Lamps cached while nothing changes. (L)** `addPointLight` casts about `r / 0.6 · 2π` rays of `r / 0.6` steps for
every lamp every frame: roughly 250,000 cell steps for one `60·RES` lamp at RES 2 (estimate). Most lamps and most
walls do not move. Keep a per-chunk revision counter bumped in `setC` / `wakeAt` (the `CS = 16` grid exists), store each
static lamp's contribution keyed by its parameters and the revisions it touched, re-cast only when one changes or the
camera moves by a whole cell (then shift and fill the edge). Moving lights stay as they are. Measure with P1 before
and after.

**E3. Sprites that glow and cast light. (M)** ROADMAP's "light masks". A sprite pixel cannot be emissive (a window, a
screen, eyes): add an `emit` layer beside `normals` in the sprite format (`tools/pixelsprite.py`, `tools/art.mjs`,
`defineSprite`), drawn unlit and fed to `splatLight`; and an option for a sprite to block lamp light (it only blocks
the sun through `markSpriteDyn`).

**E4. Back-wall shadows from each light. (M)** ROADMAP. `backShadowOffsets` uses one fixed direction (`BACK.dir`).
Use `LDX/LDY` (already computed per cell for sprite normals) to offset the shadow toward the dominant light, falling
back to `BACK.dir` where no lamp reaches.

**E5. Layers in front and far behind. (M)** Everything a game draws lands over the terrain, and the sky is the only
other layer. Add a `front` pass (cells or sprites drawn after `GAME.draw`, so a character walks behind pillars and
grass) and `addBackdrop({ parallax, paint })` layers between sky and world (hills, a far city) using the sky layer's
own sub-cell offset technique in both renderers. This also answers the roadmap's "stars in caves": a dark backdrop
below the skyline.

**E6. A screen palette and post effects the game controls. (M)** Colours are continuous (banded per material, then
tinted by lamps), so a frame has thousands of colours, and the vignette is hard-coded (`.42` in `renderScene`) with
no switch. Add `setPost({ vignette, bloom, palette, dither, scanlines })`: an optional lock of the whole world layer
to a palette of 16–64 colours (a lookup table in the shader, the same table on the CPU for 2D), which makes a game
look like one hand-made picture and ties in with the art pipeline's master palette.

**E7. Zoom. (M)** ROADMAP. The view scale is fixed by `renderResize` (`base` columns). Add `setZoom(z)` as a stepped
change of the cell's pixel size (whole device pixels, so it stays crisp), reallocating the view buffers as a resize
does; `Input.pinch` (C5) and the wheel drive it. State the cost: zooming out lights more cells.

**E8. Weather and time of day as a kit. (M)** Fjordheim wrote `daylight`/`setSky`; nothing gives rain, snow, fog or
wind. A small kit on existing parts: `setTimeOfDay(h)` driving `setSun`/`setAmbient`/sky colour, rain and snow as
particle types that wet or pile up (with D2), wind as a force on particles, fog as a distance tint in the tone-map
pass.

## P. Performance

**P1. Measure first. (S)** `perfAvg` is the time between frames, not the work done, so it reads 16.7 ms whether the
frame took 2 ms or 16. Add stage timers (`step`, `light`, `scene`, `game draw`, `present`) in `Pixelite.perf`, in
`probe()`, and an overlay on F3. Every package below quotes these numbers before and after, at RES 2 and 3, 1280 × 800
and 2560 × 1440, both renderers.

**P2. Stop redoing still frames. (M)** `computeLighting` and `renderScene` make about eight full passes over the view
each frame. When the camera cell, the world revisions (E2), the lights and the exposure are unchanged, reuse last
frame's sun, ambient and terrain shading and redraw only particles, chunks, sprites and effects.

**P3. Cheaper inner loops. (S)** In `renderScene` the terrain pass calls `getC(cx, cy)` (four bounds tests) for every
cell and again for neighbours; `updateSkyline` scans every column of the whole world every frame (the full grid for an
isometric game, whose world grid is empty); `gatherLights` allocates an object per effect light and per flickering
light each frame. Index `cells` directly inside the view, compute the skyline only for the columns the sun sweep
reads (or keep it up to date in `setC`), reuse light objects.

**P4. Tone mapping and banding on the GPU. (L)** The last pass converts every cell to bytes on the CPU and uploads four
textures. In WebGL, upload light and albedo/material and do bands, exposure, vignette, palette (E6) in the fragment
shader; keep the CPU path for 2D. Do only if P1 shows this pass matters after P2.

**P5. Lighting off the main thread. (L, only if still needed)** ROADMAP's "worker or WebGL". After E2 and P2, decide
with numbers between a Worker (needs the grid in a `SharedArrayBuffer`, which needs cross-origin isolation headers from
the Worker site) and a GPU shadow pass.

**P6. Smaller pages. (S)** Every page carries every engine part, unminified: about 240 KB, of which the Sampler is
58 KB and the Chip 20 KB, used or not. Let `game.json` list optional parts (`"engine": ["sampler", "iso"]`, default
all for old games) with stubs for the rest, and add an optional minify step for `dist/` that keeps the `// -----`
markers so error mapping survives.

## F. Sound and player comfort (audio parts were outlined, not read in full: confirm details first)

**F1. Sounds as data, placed in the world. (M)** `Sfx` is a fixed set of procedural bursts with no stereo: `heard()`
gives delay and loudness only when there is an atmosphere. Add `defineSound(name, recipe)` and `Sfx.play(name, { x, y,
pitch, vol })` with pan from the camera, a cap on voices so a large blast cannot stack dozens of nodes, and separate
music and effects volume (C10). Let a sound be a Sampler instrument note (`Sampler.noteOn` exists).

**F2. Key remapping and accessibility. (S, after C5/C10)** ROADMAP phase 5: remap actions in the settings screen,
colour-blind-safe HUD colour set (`HC` variant), hold-to-toggle, honour `CALM` everywhere (flashes already do).

**F3. A music director. (M)** ROADMAP. Each game writes its own (`stationMusic`, Regolith's `music.js`). Add
`Music.play(id, { fade })`, crossfade, `Music.layer(name, on)` over `Sampler.track`, stingers on events, driven by
`SONG_AT` and by triggers (D8) for music that changes inside a level.

**F4. Instruments made off the main thread. (M)** ROADMAP: a game's first song blocks about 0.3 s. Build instruments in
a Worker or slice them across idle frames before the title's first input.

## G. Housekeeping

**G1. Docs match the engine. (S)** `ROADMAP.md`'s status line is dated 2026-10-15 and mixes done and open;
`package.json` still says "ASCII game engine"; `API.md` keeps ASCII terms. Rewrite the roadmap as "open work only"
with this plan's packages, add a "which hook runs when" table and a "common mistakes" section to `API.md`.

**G2. Engine layout. (S)** `07_audio_input.js` holds two unrelated things, and `06_scene.js` reaches into particle
internals. Split input from sound, keep one concern per part. No behaviour change; the byte-for-byte assembler test
guards it.

---

## Owner decisions (ask before the package starts)

1. **C1: may a game lock itself to one detail level?** It contradicts the written principle "plays the same at every
   detail level" but removes the largest burden on new games. Recommended: yes, opt-in per game.
2. **E6: lock the screen to a palette by default for new games,** or keep it an option? Recommended: option, on in
   the new starters.
3. **C9: a shared look for title and pause screens** across games, or each game's own? Recommended: shared default,
   replaceable.
4. **P5: cross-origin isolation headers on the site** (needed for a lighting Worker) touch `worker/index.js`; ask
   first, and only if P1–P2 numbers call for it.
5. **The idea bank**: not assessed here. When it is, its picks should be mapped onto these packages rather than
   added beside them.

## Order

1. **Now:** A1, A2, A3, A6, then P1 (so later work has numbers).
2. **Safety net:** A4, A5, B1, B2, B4, then B3, B5.
3. **Interface core:** C3 entities → C4 animation → C5 input → C6 camera → C8 → C7 HUD kit → C9 shell → C10 saves.
4. **Mechanics:** D6, D7, D1, D8, D3, D4, D5, D9, D10, then D2 liquids with a sandbox game as its proof.
5. **Look:** E1, E3, E5, E4, E6, E7, E8. **Speed alongside:** P3, E2, P2, then P4/P5 only if measured.
6. **Wrap:** C1/C2, C11, C12 starters, F1–F4, A7, A8, P6, G1, G2.

Dependencies: C7/C9 need C5; C12 needs C3–C9 and D8; B3/B5 need B1+B2; P2 needs E2's revision counters; F2 needs
C5+C10; D3 and D4 share the broad phase.

## Verification (for every package)

- `npm run build` prints `SYNTAX_OK`; `npm test` passes; `python3 tests/smoke.py --all` passes in `gl` and `2d`; look
  at `shots/`.
- A probe test through `Pixelite.test` for the new behaviour, at each detail level the affected games declare.
- The game converted to the new engine feature plays as before: run its own tests
  (`games/spacemouse/tests/reach.py`, `games/fjordheim/tests/playthrough.py`, Regolith's landing checks).
- For P and E2 packages: P1's stage timings before and after, in the PR description.
- `engine/API.md`, `engine/engine.json`, `docs/HISTORY.md`, `docs/ROADMAP.md` updated in the same PR.
