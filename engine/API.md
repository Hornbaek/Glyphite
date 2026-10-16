# Glyphite engine API

Everything a game can call or hook into. The engine parts (`engine/*.js`, in `engine/engine.json` order)
and the game's parts (its `game.json` "parts") are concatenated into **one classic script**, so every
top-level name below is a global the game can use directly. The game's own top-level names must not
repeat an engine name: the build refuses that (a duplicate `function` would silently replace the
engine's). Name game hook functions `game*` or `<gameId>*`.

How it works inside: `docs/ARCHITECTURE.md`. The reference games: `templates/starter/` (small, every
feature once) and `games/regolith/` (big, everything).

## Units and conventions

| Name | Meaning |
|---|---|
| `ASPECT = 2` | A cell is 1 unit wide and 2 units tall. World x is in cells; world y in units = `row * ASPECT`. |
| `RES` | Detail scale, one of `DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3]`. **Author every size and speed in base units and multiply by `RES`** (alias `const S = RES`). A finer RES adds characters; it does not zoom out. |
| `UNIT_M = 0.5 / RES` | Metres per world unit. Show speeds to the player as `v * UNIT_M` m/s. |
| `G` | Gravity in units/s², downward. Set it in m/s² with `setGravity(mps2)` (`GRAVITY` holds the m/s² value; default 1.62, the Moon). |
| `DT = 1/60` | The fixed step. `update(dt)` always gets `DT`. |
| `CALM` | The player prefers reduced motion (the engine already tones down shake and flashes). |
| Glyphs | Printable ASCII only: codes 32..126. In the world grid 0 = transparent (sky shows), 32 = opaque blank. |
| Colours | World colours are in *light units* (0..~2, tone-mapped later); HUD colours are bytes `[r, g, b]` 0..255. |

Helpers: `clamp(v, a, b)`, `lerp(a, b, t)`, `rr(a, b)` (random in range), `smooth(t)`, `mulberry32(seed)` → seeded
`rng()`, `hash2(x, y, s)`, `vnoise1/2`, `fbm1(x, seed, octaves)`, `fbm2(x, y, seed, octaves)`, `ch('*')` → 42,
`pick('abc')` → a random char code from the string, `b64buf(base64)` → ArrayBuffer.

## Running a game: `Glyphite.run(game)`

Call it once, from the game's last part. Every key is optional.

```js
Glyphite.run({
  id: 'mygame',                          // keys saved settings (detail level) in localStorage
  detail: { default: 2, narrow: 1.5 },   // starting RES on wide / narrow (< 640 px) screens
  particles: 9000,                       // particle budget at RES 1 (scaled by RES)
  cameraTop: -80,                        // how far above the world the camera may go (base units)
  keys: { detail: true, bloom: true, mute: true, pause: true },   // built-in keys: - +, G, M, P/Esc
  touch: [[{ label: '[ < ]', aria: 'Left', hold: 'left' }], [{ label: '[ FIRE ]', aria: 'Fire', tap: true }]],
  stars: 1,                              // star density on the sky layer (0 = none)

  init(data) {},          // once, after the renderer exists: build the first world, setState('title')
  regenerate() {},        // the detail level changed: rebuild the world at the new RES (same level)
  update(dt) {},          // one fixed step of game logic, BEFORE the engine's world step
  camera(VW, VH, out) {}, // set out = [x, y]: the wanted top-left of the view (units); engine clamps + smooths
  markDyn() {},           // mark moving bodies as shadow casters; return the top row they cover (or 1e9)
  lights(t, out) {},      // push this frame's lights (see Lighting)
  draw(t) {},             // draw game objects into the world grid (putEmit, putLit, drawSprite)
  hud(t) {},              // draw the HUD (hudText, msgBox...)
  afterFrame(t) {},       // after presenting (music, DOM)
  onKey(code) {},         // one-shot key presses (KeyboardEvent.code) the built-in keys did not take
  onBlast(x, y, R, power, quiet) {},   // after every explode()
  chunkStep(ch) {},       // each falling chunk, each step: collide it with your bodies (chunkVsBody)
  skyBegin(ox, oy, t) {}, sky(i, j, out) {},   // paint planets etc. on the sky layer (see Sky)
  onTune(key, value) {},  // a tunable changed live (the web editor)
  start() {},             // leave the title screen (tests call it; default: the Enter key)
  snapshot() { return {}; },   // state to keep across a hot reload
  probe() { return {}; }       // small JSON summary of the game, for tests and AI sessions
});
```

**One step** (`update(dt)`, a global the frame loop calls up to 3 times per frame):
`frameNo++`, `stateT += dt` → `GAME.update(dt)` → `Input.pressed` cleared → `stepWorld(dt)` (falling chunks,
particles, sand, heat, effects) → camera.

**One frame** (`draw(t)`): skyline → dynamic marks (chunks, then `GAME.markDyn`) → lighting (`GAME.lights` + effect
lights) → scene (terrain, particles, chunks, then `GAME.draw`, then shock rings) → HUD (`GAME.hud`, then the toast) →
present → `GAME.afterFrame`.

**State**: the globals `state` (string) and `stateT` (seconds in it). `setState('play')` switches and resets `stateT`.
The engine knows three names: `'title'` shows the page's `#titleBar` buttons, `'paused'` stops time (P/Esc toggles
`play` ⇄ `paused`), `'play'` is where the slow-frame hint can appear. Use any other names you like.

Other runtime functions: `setDetail(res, announce)`, `stepDetail(±1)`, `updateCamera(dt, snap)` (call with
`(0, true)` after teleporting), `say(text)` (a toast), `perfAvg` (smoothed ms per frame), `cam` (`{x, y}`, the view's
top-left in units), `detailLabel()`.

## Tunables (`TUNE`)

Numbers (or booleans) the game declares in `game.json` "tunables" and reads from `TUNE.<key>`; the web editor
shows them as sliders. `live: true` means the game reacts while running (use `onTune` when something must be
recomputed, e.g. `setGravity`); other values apply on restart.

```json
"tunables": { "gravity": { "label": "Gravity", "unit": "m/s²", "value": 1.62, "min": 0.4, "max": 9.81, "step": 0.01, "live": true, "help": "..." } }
```
Overrides come from `window.GLYPHITE_TUNE` (the editor) and `?tune={"gravity":3}` in the page URL.

## Materials

```js
const ROCK = defineMaterial('basalt', { albedo: [.5, .52, .57], ramp: " .':oO8&%#", tough: .55 });
setMaterial(ROCK, { shiny: .1 });            // change later (e.g. to name a material defined after it)
worldMaterials({ edge: BEDROCK, rubble: RUBBLE, fill: ROCK });
```
Returns the id (1..255; `EMPTY = 0` is built in). Define materials at load time, before `init`.

| Property | Default | Meaning |
|---|---|---|
| `albedo` | `[.6,.6,.6]` | Colour under white light. |
| `ramp` | `' .:;=+*#%@'` | Glyphs from dark to bright. |
| `granular` | false | Falls and slides like sand. `creep: true` also lets it creep sideways to ~45°. |
| `tough` | .5 | Blast resistance; 99 = indestructible. |
| `shiny` | 0 | Chance of `*` glints on lit surfaces. |
| `friction` | .95 | Friction for foot hull points (kind 1) standing on it. |
| `density` | 1 | Relative density in falling chunks. |
| `brittle` | true | Chips apart on hard impacts (false: bends and bounces, like steel). |
| `anchor` | false | Never falls; supports any structure touching it (bedrock, pad metal). |
| `oneWay` | false | A `Character` lands on it from above, jumps up through it and drops down through it (catwalks, ledges). To everything else (sand, particles, light, chunks) it is solid. |
| `style` | `'terrain'` | `'terrain'` (slope glyphs `/ \ | ~` at surfaces), `'flat'` (always the ramp), `'deck'` (`= -` top, `# H` body), `'mast'` (`| = +` by neighbours; buried parts look like the ground), `'crystal'` (animated `* +` with a colour `pulse`). |
| `grainGlyphs` | `".,'`:"` | Glyphs of its flying grains; `debris: true` makes them heavier, bouncier debris. |
| `sublimate` | 0 | Chance per exhaust-gas hit to turn into vapour. `vaporize: true`: blasts turn it into vapour. |
| `fuseTo`, `fuseChance` | 0 | Blast rims sometimes turn it into another material (regolith → glass). |
| `ejecta` | itself if granular, else the world's rubble | What a blast throws. |
| `glow` | null | `[r, g, b, radius]`: emits light from scattered cells. |
| `beatGlow` | 0 | 0..1+: flashes in its own colour and glows brighter on the music's drum hits (scaled by `setBeatPulse`). |
| `blast(x, y, vx, vy, how)` | null | Called when a blast carves a cell (`how = 'blast'`, replaces the ejecta) or a chunk chips one off (`'chip'`). Spawn pickups here. |

`worldMaterials({ edge, rubble, fill })`: `edge` is what `getC` returns beyond the sides and bottom (give it an
anchor material so structures rest on the border); `rubble` is what broken solid crumbles into; `fill` props up
anything left floating by `settleIslands`.

## The world grid

`worldInit(w, h)` makes an empty world of `w × h` cells (multiply your base size by RES) and clears particles,
effects, chunks and mounts. Then fill `cells[y * W + x] = MATERIAL` directly (fast, for generation) or use
`setC(x, y, m)` (wakes the sand simulation).

| Function | |
|---|---|
| `W`, `H`, `cells`, `heat`, `vari` | Size, material ids, heat 0..1.6 (glows), per-cell random byte. |
| `getC(x, y)` | Material at a cell, safe outside the world. |
| `setC(x, y, m)` | Write a cell and wake the sand around it. |
| `solidU(xu, yu)`, `matU(xu, yu)` | Solid? / material at a point in world units. |
| `normalAt(xu, yu, out)` | Surface normal from nearby occupancy → `out = [nx, ny]`. |
| `addHeat(x, y, h)` | Heat a cell (hot rock glows and lights its surroundings). |
| `simGranular()` | One sand step (the engine runs it every step; call it in a loop during generation to settle sand, after `awake.fill(1)`). |
| `settleIslands(onDrop)` | Drop floating solid pieces until they rest; `onDrop(cellIndices, rows)` lets you move objects riding them. Call after generation. |
| `updateSkyline()`, `colTop[x]` | First solid row of each column (updated every frame). |

**The back wall.** A second grid, `backCells` (same size, material ids, 0 = none), for walls, panels and pipes behind the rooms
of a station, a house or a cave. It is never solid: nothing collides with it and light and sand pass it by. It is drawn
wherever the world cell in front is empty, darker than the world (`BACK.dim`), lit by the same light as the air in front of
it, with a drop shadow where world cells stand between it and the light, so rooms read as rooms. Where it is 0 the sky shows
through: windows, hull breaches, the outdoors. Give it the back material of everything inside, solid cells included, so
whatever gets eaten or blown away shows a wall rather than the stars. Materials come from the same registry: `'mast'` style
draws seams and pipes (`| = +` from its back-wall neighbours), every other style uses its ramp.

| | |
|---|---|
| `setBack(x, y, m)`, `getBack(x, y)` | Write / read one back-wall cell (or fill `backCells[y * W + x]` directly while generating). `worldInit` clears it. |
| `setBackdrop({ dim, shadow, dir, depth })` | `dim` (.42): brightness against the world; `shadow` (.6): how dark the drop shadow is; `dir` ([.6, .8]): the way shadows fall, in units (down and right); `depth` (2.2): how far they reach, base units. |

## Bodies and contacts

```js
const b = new Body(x, y, mass, inertia, hull);   // hull: [{x, y, kind}] in units, body frame, origin = centre of mass
b.fx = fx; b.fy = fy; b.tq = torque;              // set forces before each step (gravity is added for you)
b.step(dt);                                       // integrate + collide with the grid
for (const h of b.hits) if (h.vn > 9 * RES) crash();   // h: {kind, vn (impact speed, units/s), mat, x, y, nx, ny}
```
Fields: `x, y, vx, vy, a, w, m, I, hull, hits, feetDown, bodyDown`. Helpers: `b.toWorld(lx, ly, out)`,
`b.dirWorld(lx, ly, out)`, `b.impulse(jx, jy, rx, ry)`. Hull point kinds: 0 structure, 1 foot (uses the ground
material's friction), 2 strut side; the kind only matters for friction, your game decides what a hit means.
A mass of 1 is about a lander; a chunk of 120 cells weighs ~2.

## Characters

A `Character` is an upright box that walks and jumps on the grid the way a platformer hero does: it steps up bumps of about
one row (every slope in a voxel world is a staircase) and sticks to the ground walking down them; it jumps with coyote time,
a jump buffer and a variable height (letting go early cuts the jump short), falls faster than it rises, can slide down walls
and jump off them, lands on `oneWay` materials from above (holding `down` drops through), and stands on falling chunks.
Position is the middle of its feet, like a Body: x in cells, y in units. Author sizes and speeds in base units × `RES`.

```js
const hero = new Character(x, y, { w: 4 * RES, h: 6 * RES, run: 30 * RES, jump: 14 * RES, wallJump: [26 * RES, 10 * RES] });
hero.step(dt, { x: -1..1, jump: held, down: held });   // every fixed step, in GAME.update
if (hero.jumped) Sfx.tone(440, .07); if (hero.landed > 30 * RES) puff(); if (MAT_NAME[hero.ground] === 'ice') slide();
```
After a step: `onGround`, `ground` (the material under the feet, 0 in the air), `wall` (-1 / 1 when airborne against a wall on
that side), `facing` (-1 / 1), `vx`, `vy`, and what happened this step: `jumped`, `wallJumped`, `landed` (impact speed in
units/s, else 0), `bumped` (hit its head). Options live in `hero.o` and can be changed at any time (live tunables):

| Option | Default | |
|---|---|---|
| `w`, `h` | `4·RES`, `6·RES` | The box, units. |
| `run` | `28·RES` | Top running speed, units/s. |
| `accelT`, `stopT` | .09, .06 | Seconds from standing to top speed, and back to standing (also to turn round). |
| `air` | .75 | Air control: acceleration in the air as a fraction of the ground's. |
| `jump` | `14·RES` | Jump height, units (the launch speed is worked out from gravity, so the height stays the same if gravity changes). |
| `cut` | .45 | Vertical speed kept when the jump is let go while rising. |
| `gravity` | 0 | Units/s²; 0 = the world's `G` (set it for low-gravity zones). |
| `fallMul`, `fallMax` | 1.6, `140·RES` | Gravity multiplier while falling; terminal fall speed. |
| `coyote`, `buffer` | .1, .12 | Seconds a jump still counts after leaving the ground / before landing. |
| `step` | one row | The highest bump it walks up, units. |
| `wallSlide` | 0 | > 0: pressing into a wall in the air, it falls no faster than this (units/s). |
| `wallJump` | null | `[push away (units/s), height (units)]`: jump off walls. |
| `chunks` | true | Falling chunks are solid to it. |

Also: `hero.solid(cx, cy)` (is that cell solid to it), `hero.blocked(x, y)` (would the box overlap anything there),
`hero.touches(ch)` (does it overlap this falling chunk: use it in `GAME.chunkStep` to crush or push), `hero.unstick(reach)`
(push it out of whatever it overlaps, e.g. sand poured onto it). Enemies can walk on Characters too: give them `input.x` and
turn them round at `hero.solid(ahead, row)`. See `games/spacemouse/` (the mouse and the cat-bots).

## Breakable structures

After every `explode()` the engine checks support around the blast. Solid regions that lost their connection
to the rest of the world (or to an `anchor` material) break off as **chunks**: rigid bodies that tumble, chip
and freeze back into the grid when they rest. `STRUCTURES = false` turns this off.

| | |
|---|---|
| `blastFrom(vx, vy)` | Call just before `explode()` for a projectile: loose pieces are pushed along its flight. |
| `chunks`, `chunkAt(x, y)` | Falling chunks; the chunk covering a world point (for projectile hits). |
| `chunkVsBody(ch, body, onHit)` | From `GAME.chunkStep(ch)`: pushes your body out of the chunk. `onHit(v, hullPoint)` → return true to stop (body destroyed). |
| `checkSupport(x, y, R, delay = 0)` | A structure lost its support without a blast (the game removed a bracket, a pillar, a pin): check around (x, y) within about R units now, or `delay` seconds from now; whatever no longer connects breaks off as chunks. |
| `addMount(obj)` | Fix a game object to a cell (`obj.mount = y * W + x`) so it rides the chunk that cell breaks into. Handlers on `obj` (this = obj): `onRide(ch)`, `onMove(ch)`, `onImpact(ch, vb, x, y)`, `onLand(ch, placedCells)`, `onLost(ch)`. `obj.chunk` is the chunk while riding; set `obj.dead` to stop. See `games/regolith/lamps.js`. |

## Particles, blasts and effects

`spawnP(type, x, y, vx, vy, life, glyph, material)` → index or -1 (budget full). Built-in types:
`PT_GRAIN` and `PT_DEBRIS` (sand and rubble; they become cells again when they land), `PT_GAS` (hot exhaust:
scours sand, sublimates ice, heats), `PT_FIRE`, `PT_SPARK`, `PT_SMOKE`, `PT_VAPOR`, `PT_DUST`, `PT_WRECK` (hot
wreckage throwing sparks). `spawnGrain(x, y, vx, vy, material)`. Storage is struct-of-arrays: `P.n`, `P.x[i]`,
`P.y`, `P.vx`, `P.vy`, `P.age`, `P.life`, `P.g` (glyph), `P.m` (material). Kill one by `P.age[i] = P.life[i]`.

Custom types:
```js
const PT_SHARD = defineParticle({
  gravity: 1, drag: 0, bounce: .5, friction: .6,
  update(i, dt) { /* steer, collect: P.age[i] = P.life[i] */ },
  light(i, cx, cy, life) { splatLight(cx, cy, .3, .05, .25, 4); },              // optional glow
  look(i, k, life, time, out) { out[0] = 1.3; out[1] = .3; out[2] = 1; return 42; }   // colour + glyph
});
```

`explode(x, y, R, power, quiet)` with R in units (multiply by RES; ~6.5·RES is a rocket): carves cells weaker
than the blast, throws ejecta, fire, sparks, smoke, a shock ring, a flash, shake and a light, plays the boom
(unless `quiet`), breaks structures, then calls `GAME.onBlast`.

Effects (`FX`): `addLight(x, y, r, colour, I, life, shadow)` (a short flash of light), `addRing(x, y, max, life, c)`,
`addText(x, y, text, [r,g,b bytes], life)` (stored in `FX.texts`; draw them on the HUD with `worldToHud`, see
Regolith's `drawWorldLabels`), `FX.shake` (0..1.4), `FX.flash`, `FX.flashCol`, `FX.slow` / `FX.slowT` (slow motion).

## Lighting

Lights are pushed each frame from `GAME.lights(t, out)`:
```js
out.push({ x, y, r: 60 * RES, c: [1, .9, .8], I: 1.5, shadow: true });                          // point light
out.push({ x, y, r: 70 * RES, c: [.8, .9, 1], I: 2, shadow: true, dx, dy, cos: Math.cos(.5), skip: 3 * RES });   // cone
```
`skip` keeps a light from being shadowed by its own body. `setSun(elevationDegrees, colour?)` (light from the
left, 1..89°; `setSun(null)` for no sun: caves, indoors), `setAmbient([r, g, b])`. Emissive things: `splatLight(cx, cy,
r, g, b, radiusBaseCells)`; materials with `glow`; heat. `lightAtCell(cx, cy, out)` reads the light at a cell.

**The sun's colour.** `setSun(el, [r, g, b])` pins it. `setSun(el, { kelvin: 5772, intensity?: 1.15 })` sets the base colour
from a blackbody (1000..40000 K; 2000 is orange, 10000 bluish). Left out, the last base colour stays. `setAtmosphere(thickness)`
(0 = vacuum, the default; 1 = Earth-like) then dims that base by the air the light crosses, per channel
(`exp(-scatter × airmass(elevation))`, blue first), so a low sun is orange and then red without a hand-made sunset palette. A
pinned `[r, g, b]` is never reddened. Calling `setAtmosphere` later recolours the sun at once. The atmosphere also makes
stars twinkle (see Sky).

**Visibility queries** (for gameplay: plants that grow toward light, solar panels, stealth, vampires). Positions are body
coordinates (x in cells, y in units = row × `ASPECT`). They read the world directly, so they work anywhere (not only on
screen) and consider terrain and frozen chunks, not moving bodies:
- `sunAt(x, y)` → `true` if the sun reaches the point (`false` with no sun).
- `isLitBy(light, x, y)` → how strongly this light (an object like the ones `GAME.lights` pushes, with `x, y, r, I, shadow`
  and, for a cone, `dx, dy, cos`) reaches the point: `0` = not at all, else its intensity there. Same falloff, cone and
  shadows as the lighting itself.
- `lineClear(x0, y0, x1, y1, skip)` → `true` if no terrain lies on the straight line between the points (ignoring the first
  `skip` units): line of sight, for guards that see the player.

**Flicker and pulse.** Any light may carry `flicker: 'candle' | 'fluorescent' | 'dying' | 'strobe' | 'alarm' | 'pulse'` and a
`seed`; its intensity is then multiplied by `flickerAt(flicker, time, seed)` (0..1): a candle wavers, a fluorescent tube is
steady with the odd stutter, a dying tube has long dark spells and bursts of stuttering light, an alarm turns like a beacon. It
is a pure function of time and seed, so the game can draw the lamp's own glyph in step with its light (and buzz with
`Sfx.buzz`), and lamps with different seeds don't blink together.

**Eye adaptation.** `setEyeAdaptation(strength 0..1, opts?)` lets the exposure follow the scene (off by default; 0 = off,
exposure exactly 1). It is measured each frame as the average brightness of what is on screen and eased toward a target: a
dark view brightens over a couple of seconds (`up`, 2.4 s), a bright one darkens faster (`down`, 0.6 s), so stepping from
shadow into sun dazzles for a moment. `opts`: `{ min: .55, max: 2.6, key: .15, up: 2.4, down: .6 }` (`key` = the brightness it
aims for). It applies to the world and the sky, not to the HUD, in both renderers. `EYE.e` is the current exposure.

## Drawing into the world

World cells are `cx = floor(x)`, `cy = floor(y / ASPECT)`. Inside `GAME.draw`:
- `putEmit(cx, cy, code, r, g, b)`: fixed colour (light units).
- `putLit(cx, cy, code, ar, ag, ab, floor)`: albedo × the scene light at that cell.
- `slopeGlyph(dx, dy)`: `- \ | /` for a direction.

**Sprites** (pixel art → ASCII; data from `tools/sprite2ascii.py`, see the `glyphite-pixel-art-to-ascii` skill):
```js
const SHIP = defineSprite(SPRITE_SHIP, { k: .3, ox: 12, oy: 10, part: (c, r) => 0, paint: (c, r, p) => false });
drawSprite(SHIP, b.x, b.y, b.a, { shift: [dx1, dy1], foot: 4 * RES, light: true });   // in GAME.draw
markSpriteDyn(SHIP, b.x, b.y, b.a, opts);   // in GAME.markDyn (casts shadows); returns the top row
spriteHull(SHIP, 3)                          // hull points (base units: multiply by RES) for new Body()
```
`k` = base units per pixel, `(ox, oy)` the origin pixel (centre of mass). `part(c, r)` gives movable parts (1..n)
their own offset `shift[2p-2], shift[2p-1]`. `foot` snaps that line to a row boundary so feet stand on the ground.
`flip: true` mirrors it left to right in its own frame (draw characters facing right, flip them to face left). Animation
frames are simply several sprites from rows that differ (see `games/spacemouse/art.js`).

## Sky

The sky is its own slow-scrolling layer behind empty world cells: stars (`GAME.stars`, default 1) plus whatever
the game paints. Stars twinkle only when the game has an atmosphere (`setAtmosphere`), never in a vacuum, and are dimmed by
the light of nearby lamps and flashes, read from the frame's light buffer minus sun and ambient (`GAME.starGlare`, default 1,
0 = off; the layer then rebuilds a few times a second instead of once). `GAME.skyBegin(ox, oy, time)` runs once per rebuild; `GAME.sky(i, j, out)` is asked for every
sky cell and returns a glyph code (0 = nothing, -1 = dark body that hides stars) with `out = [r, g, b]`.
See `earthBegin` / `earthCell` in `games/regolith/view.js`.

## HUD

A fixed grid of readable cells (`R.hcols × R.hrows`), redrawn every frame inside `GAME.hud(t)`.
`hudText(col, row, text, [r,g,b])`, `hudPut(col, row, code, r, g, b)`, `hudFill`, `hudBox(c, r, w, h, col, bg)`,
`msgBox([[text, colour], ...], topRow?)` (centred box), `hudFlow(row, [[text, colour], ...])` → next row,
`fmtS(v, width, decimals)` (signed, zero-padded), `worldToHud(x, y, out)`, colours `HC.txt dim amber red cyan green gold`.

## Input

`keyDown('ArrowUp', 'KeyW')` (held now), `Input.pressed` (codes pressed since the last step, plus `'Tap'` for a
click or tap), `Input.aim` (where the tap was, 0..1 of the canvas) and `Input.fireQueued`, `mouseAim()` (cursor
aim for 6 s after it moved, else null), `Input.touch.<name>` (on-screen hold buttons from `GAME.touch`),
`touchShown()`. Aim → world: `[cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT]`.

## Sound

`Sfx` (procedural, starts on the first input): `Sfx.engine(throttle 0..1)` (a looping thrust hum), `boom(power)`,
`launch()`, `thud(v)`, `pickup()`, `alarm()`, `win()`, `tone(freq, dur, vol, type, delay)`, `burst(...)`, `heard(x, y)`, `toggle()`,
`buzz(level 0..1)` (a looping mains hum for dying lamps and live wires: set it every frame, e.g. from `flickerAt()` times how
near the lamp is).

`Chip` (NES-style synth playing MIDI): `Chip.load(arrayBuffer)` → song, `Chip.play(song, { loop, fadeIn, onEnd })`,
`Chip.stop(fade)`, `Chip.setVolume(v)`, `Chip.meter()` (lanes and beat, for visualisers), `Chip.connectMidi()`.
Embed songs as base64 (`b64buf`); see `games/regolith/music.js` for a music director.

**Sound through air.** In a vacuum (`setAtmosphere(0)`, the default) every sound is heard at once at full volume, as if felt
through the ground, exactly as before. With an atmosphere, `Sfx.heard(x, y)` says how a sound at that point (body
coordinates) reaches the listener: `{ delay: distance / 343 m/s in seconds, gain, muffle, m: metres }`, quieter and duller
(a lower filter) the farther it is. `explode()` already uses it, so a blast is a flash and then, after the delay, the boom;
a far one (over 100 m) adds a long low rumble, thunder. Your own one-shots can pass it as the last argument:
`Sfx.burst(dur, f0, f1, vol, type, q, Sfx.heard(x, y))`, `Sfx.boom(power, Sfx.heard(x, y))`. The listener is the camera's
centre unless the game gives a `listener: () => [x, y] | null` hook (Regolith: the lander).

**The beat.** `Beat` follows the music for lights, glow and bloom:
- `Beat.phase()` = the musical position in beats of what is playing (-1 if nothing is). `Beat.blink(t, hz = 1.6, duty = .45)`
  is true during the first part of each beat, and blinks on a clock when there is no music.
- `Beat.v` jumps to 1 on every drum hit (a rising edge of the noise-drum level, as heard now) and fades over about 0.16 s;
  `Beat.hit(strength)` fires it for the game's own events.
- `setBeatPulse(strength 0..1)` (0 = off, the default) turns the pulse on: it scales every material's `beatGlow` (the
  material flashes in its own colour and its light grows) and swells the bloom (lower threshold, more gain).
  `Beat.pulse()` returns the scaled value for the game's own lights, e.g. `I: .9 * (1 + .8 * Beat.pulse())`.

## Tests and probes: `Glyphite.test`

Headless checks and AI sessions drive a game through these (they work while the loop is frozen and run much
faster than real time):

| | |
|---|---|
| `Glyphite.test.start()` | Leave the title screen (`GAME.start`, else Enter). |
| `Glyphite.test.step(n, ['ArrowUp'])` | n fixed steps with these keys held → `probe()`. |
| `Glyphite.test.press(code)` | A one-shot key press. |
| `Glyphite.test.freeze()` / `unfreeze()` | Stop / resume the frame loop (for screenshots). |
| `Glyphite.test.render()` | Draw one frame now. |
| `Glyphite.test.probe()` | `{ state, frame, res, renderer, cols, rows, world, cam, particles, chunks, perfMs, tune, game: GAME.probe() }` |

`tests/smoke.py <id>` uses exactly this for any game. URL hash `#2d` / `#gl` forces a renderer.
