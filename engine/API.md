# Pixelite engine API

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
| `ASPECT = 1` | Cells are square: one pixel, 1 unit each way, so a row is one unit. World x is in cells; world y in units = `row * ASPECT` (the constant stays from the ASCII engine, whose cells were 2 units tall; old code that divides by it keeps working). |
| `RES` | Detail scale, one of `DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3]`. **Author every size and speed in base units and multiply by `RES`** (alias `const S = RES`). A finer RES adds pixels; it does not zoom out. |
| `UNIT_M = 0.5 / RES` | Metres per world unit. Show speeds to the player as `v * UNIT_M` m/s. |
| `G` | Gravity in units/s², downward. Set it in m/s² with `setGravity(mps2)` (`GRAVITY` holds the m/s² value; default 1.62, the Moon). |
| `DT = 1/60` | The fixed step. `update(dt)` always gets `DT`. |
| `CALM` | The player prefers reduced motion (the engine already tones down shake and flashes). |
| Cell codes | Every world cell is one pixel. Its code (the glyph of the ASCII engine, kept so old calls work): 0 = empty (the sky shows), 32 = filled with the background colour, `SOLID` (127) = a plain pixel in the given colour, a printable character 33..126 = a pixel as bright as that character is dense (`INK`: `@` full colour, `.` about half), so dust drawn with `.` stays fainter than a `#`. |
| Colours | World colours are in *light units* (0..~2, tone-mapped later); HUD colours are bytes `[r, g, b]` 0..255. |

Helpers: `clamp(v, a, b)`, `lerp(a, b, t)`, `rr(a, b)` (random in range), `smooth(t)`, `mulberry32(seed)` → seeded
`rng()`, `hash2(x, y, s)`, `vnoise1/2`, `fbm1(x, seed, octaves)`, `fbm2(x, y, seed, octaves)`, `ch('*')` → 42,
`pick('abc')` → a random char code from the string, `b64buf(base64)` → ArrayBuffer.

## Running a game: `Pixelite.run(game)`

Call it once, from the game's last part. Every key is optional.

```js
Pixelite.run({
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
  shell: true,            // the engine's title screen, pause menu and controls screen (see The standard shell)
  menu: [{ label: 'HELP', onSelect() {} }], restart() {}, quit() {},   // the pause menu's extra entries, RESTART and QUIT TO TITLE
  detail: { levels: [2] },// offer only these detail levels (default: all five); no keys or button for one
  cameraEase: 3.2,        // how fast the camera catches up (per second); setCamera() has its own
  floatText: false,       // do not draw addText() labels (default: the engine draws them)
  saveVersion: 1, migrate(oldVersion, data) {},   // Pixelite.save / load (see Settings and saves)
  levels: { play(i, tile) {}, check(i) { return {}; } },   // the web editor's LEVELS tab (see Levels in the web editor)
  snapshot() { return {}; },   // state to keep across a hot reload
  probe() { return {}; }       // small JSON summary of the game, for tests and AI sessions
});
```

**One step** (`update(dt)`, a global the frame loop calls up to 3 times per frame):
`frameNo++`, `stateT += dt` → actions read, HUD taps and menu keys handled, the shell's title start → moving platforms →
`GAME.update(dt)` → the state's `update` → entities, timers and triggers → `Input.pressed` cleared → `stepWorld(dt)` (falling
chunks, particles, sand, heat, effects) → camera.

**One frame** (`draw(t)`): skyline → dynamic marks (chunks, then `GAME.markDyn`) → lighting (`GAME.lights` + entities' lights +
effect lights) → scene (terrain, particles, chunks, then props, entities, the state's `draw`, `GAME.draw`, then shock rings) →
HUD (`GAME.hud`, the state's `hud`, floating texts, the shell, the message feed) → present → `GAME.afterFrame`.

**State**: the globals `state` (string) and `stateT` (seconds in it). `setState('play')` switches and resets `stateT`.
The engine knows three names: `'title'` shows the page's `#titleBar` buttons, `'paused'` stops time (P/Esc toggles
`play` ⇄ `paused`), `'play'` is where the slow-frame hint can appear. Use any other names you like.

Other runtime functions: `setDetail(res, announce)`, `stepDetail(±1)`, `updateCamera(dt, snap)` (call with
`(0, true)` after teleporting), `say(text, { time, colour })` (a line in the message feed), `perfAvg` (smoothed ms per frame), `cam` (`{x, y}`, the view's
top-left in units), `detailLabel()`.

## Tunables (`TUNE`)

Numbers (or booleans) the game declares in `game.json` "tunables" and reads from `TUNE.<key>`; the web editor
shows them as sliders. `live: true` means the game reacts while running (use `onTune` when something must be
recomputed, e.g. `setGravity`); other values apply on restart.

```json
"tunables": { "gravity": { "label": "Gravity", "unit": "m/s²", "value": 1.62, "min": 0.4, "max": 9.81, "step": 0.01, "live": true, "help": "..." } }
```
Overrides come from `window.PIXELITE_TUNE` (the editor) and `?tune={"gravity":3}` in the page URL.

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
| `shades` | 5 | How many flat shades the light on it is cut into (pixel art's bands; a lit top edge gets one brighter, an underside one darker). |
| `palette` | null | `[[r, g, b], ...]` bytes, dark to bright: the material shows exactly these colours, picked by how much light falls on it (coloured light still tints them). `ramp`, the ASCII engine's glyph ramp, is ignored. |
| `granular` | false | Falls and slides like sand. `creep: true` also lets it creep sideways to ~45°. |
| `tough` | .5 | Blast resistance; 99 = indestructible. |
| `shiny` | 0 | Chance of white glint pixels on lit surfaces. |
| `friction` | .95 | Friction for foot hull points (kind 1) standing on it. |
| `density` | 1 | Relative density in falling chunks. |
| `brittle` | true | Chips apart on hard impacts (false: bends and bounces, like steel). |
| `anchor` | false | Never falls; supports any structure touching it (bedrock, pad metal). |
| `oneWay` | false | A `Character` lands on it from above, jumps up through it and drops down through it (catwalks, ledges). To everything else (sand, particles, light, chunks) it is solid. |
| `climbable` | false | A `Character` climbs it (ladders, vines, ropes): not solid to a `Character`, and inside it up / down climb. Works in the world grid and in the back wall (`setBack`): a ladder painted on the wall behind a room. |
| `hazard` | 0 | Damage per second to a `Character` touching it or inside it (spikes, lava, a live cable): `hero.hazard` / `hero.hazardMat`. |
| `grip` | 1 | 0..1, how well a `Character`'s feet hold on it: scales its acceleration and braking (ice: `.08`). |
| `conveyor` | 0 | Base units/s along the surface (negative = left): carries a `Character`, a `Body` and sand standing on it. |
| `bouncy` | 0 | > 0: a `Character` landing on it is thrown back up at that share of its impact speed (at least `bounceMin`; holding jump adds a third); a `Body` bounces on it with that restitution (springs, rubber pads, trampolines). |
| `style` | `'terrain'` | `'terrain'` (bright top edges, dark undersides), `'flat'` (no edges), `'deck'` (like terrain: a bright top), `'mast'` (girders: joints one shade brighter; buried parts look like the ground), `'crystal'` (twinkling facets with a colour `pulse`). |
| `grainGlyphs` / `grains` | `".,'`:"` | Codes of its flying grains (their brightness, see Cell codes); `debris: true` makes them heavier, bouncier debris. |
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

### Character: what it touches, climbs and rides

`hero.step(dt, { x, jump, down, up })`: `up` grabs a ladder (a `climbable` cell in the world grid or back wall in the middle of the box; `down` grabs one
in the air); while `hero.climbing` up / down move it at `o.climb` units/s, left / right slowly, and it lets go with jump (a hop away from the ladder) or
at the top or bottom. After a step: `hero.contacts` `{ under, left, right, above, inside }` (materials, 0 for none), `hero.hazard` (the worst `hazard`
among the cells it overlaps or is within `o.hazardReach` units of, default .4) with `hero.hazardMat`, `hero.carry` (conveyor speed under the feet),
`hero.bounced` (the bouncy material that threw it up), `hero.crushed` (a platform or chunk left it nowhere to stand), `hero.platform` (the moving
platform it stands on). Ice (`grip`) slows its acceleration and braking, a conveyor carries it, a platform carries it by whole cells.
Gravity zones (`addGravityZone`) change its fall; a jump's launch speed uses the world's gravity, so a jump in a low-gravity zone goes higher.

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

### Moving platforms

```js
const lift = addPlatform({ x: 40, y: 80, cols: 12, rows: 2, mat: STEEL,          // top-left cell, size in cells, material (or grid: a Uint8Array)
  path: [[40, 80], [40, 40]], speed: 14, mode: 'pingpong', wait: 1 });            // top-left cells to visit; units/s; seconds to wait at each
lift.go(1)         // travel to path point 1 and stay (mode 'manual' starts like this)
lift.pause(true);  lift.arrived;  removePlatform(lift)
```
A platform is a chunk that follows its path (`mode`: `'pingpong'`, `'loop'`, `'once'`, `'manual'`) instead of falling. It moves by whole cells, like
pixel art, so a `Character` standing on it (carried by `dx`, `dy`) keeps its feet on a row boundary. Solid to a `Character`; drawn, lit and
shadow-casting like any chunk; sand and particles pass through it. A blast that bites or shoves it turns it into an ordinary falling chunk. A `Character`
squeezed between it and a wall gets `crushed`. A structure that loses its support and is too big to fall as a chunk (more than 2600 x RES² cells)
sinks as a slab until it rests, instead of hanging in the air.

## Particles, blasts and effects

`spawnP(type, x, y, vx, vy, life, glyph, material)` → index or -1 (budget full). Built-in types:
`PT_GRAIN` and `PT_DEBRIS` (sand and rubble; they become cells again when they land), `PT_GAS` (hot exhaust:
scours sand, sublimates ice, heats), `PT_FIRE`, `PT_SPARK`, `PT_SMOKE`, `PT_VAPOR`, `PT_DUST`, `PT_WRECK` (hot
wreckage throwing sparks). `spawnGrain(x, y, vx, vy, material)`. Storage is struct-of-arrays: `P.n`, `P.x[i]`,
`P.y`, `P.vx`, `P.vy`, `P.age`, `P.life`, `P.g` (cell code), `P.m` (material). Kill one by `P.age[i] = P.life[i]`.

Custom types:
```js
const PT_SHARD = defineParticle({
  gravity: 1, drag: 0, bounce: .5, friction: .6,
  update(i, dt) { /* steer, collect: P.age[i] = P.life[i] */ },
  light(i, cx, cy, life) { splatLight(cx, cy, .3, .05, .25, 4); },              // optional glow
  look(i, k, life, time, out) { out[0] = 1.3; out[1] = .3; out[2] = 1; return SOLID; }   // colour + cell code
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
is a pure function of time and seed, so the game can draw the lamp's own pixels in step with its light (and buzz with
`Sfx.buzz`), and lamps with different seeds don't blink together.

**Eye adaptation.** `setEyeAdaptation(strength 0..1, opts?)` lets the exposure follow the scene (off by default; 0 = off,
exposure exactly 1). It is measured each frame as the average brightness of what is on screen and eased toward a target: a
dark view brightens over a couple of seconds (`up`, 2.4 s), a bright one darkens faster (`down`, 0.6 s), so stepping from
shadow into sun dazzles for a moment. `opts`: `{ min: .55, max: 2.6, key: .15, up: 2.4, down: .6 }` (`key` = the brightness it
aims for). It applies to the world and the sky, not to the HUD, in both renderers. `EYE.e` is the current exposure.

## Drawing into the world

World cells are `cx = floor(x)`, `cy = floor(y / ASPECT)`. Inside `GAME.draw`:
- `putEmit(cx, cy, code, r, g, b)`: fixed colour (light units). `code` is usually `SOLID`; see Cell codes.
- `putLit(cx, cy, code, ar, ag, ab, floor)`: albedo × the scene light at that cell.
- `slopeGlyph(dx, dy)`: the code of `- \ | /` for a direction (a thin line's brightness).

**Sprites** (pixel art drawn as world pixels; data from `tools/pixelsprite.py`, see the `pixelite-pixel-art` skill):
```js
const SHIP = defineSprite(SPRITE_SHIP, { k: .3, ox: 12, oy: 10, part: (c, r) => 0 });   // SPRITE_SHIP may carry `normals`
drawSprite(SHIP, b.x, b.y, b.a, { shift: [dx1, dy1], foot: 4 * RES, light: true });   // in GAME.draw
markSpriteDyn(SHIP, b.x, b.y, b.a, opts);   // in GAME.markDyn (casts shadows); returns the top row
spriteHull(SHIP, 3)                          // hull points (base units: multiply by RES) for new Body()
```
On the HUD, `hudSprite(SHIP, c, r, w, { rows, flip, gain })` draws a sprite as a small picture (an icon in a menu, a
portrait) fitted into `w` columns (and `rows`, if given) with its top-left on HUD cell `(c, r)`, centred and standing on the
box's bottom; it returns the rows it takes. The art's own colours, unlit; `gain` brightens dark art on the HUD's black.
Worked out once per size (see the build menu in `games/fjordheim/main.js`).

Each world cell the sprite covers becomes one pixel (cells less than about half covered stay clear), so the art is
resampled to the world's pixels, turning with the body: on the silhouette the outline colour wins if it is there at all
(the shape keeps its dark edge), inside the most common paint colour wins (lines thinner than a pixel don't speckle). Pixel art looks best at
one art pixel per world pixel at the game's default detail (`k = 1 / RES`); resize the art rather than `k` (see the skill).

**Normal maps.** A sprite's data may carry `normals: ['..0d..', ...]`, the same size as `rows`: for each pixel, in base 36,
a direction from `SPR_NORMALS` (33 of them: facing the viewer, then rings tipped 20°, 42° and 65°; `.` where there is no
pixel). Made from the art by `node tools/normalmap.mjs art.png --rows` or the PIXEL LAB page (`/lab/`). A lit pixel is
then multiplied by `0.5 + 0.5·sprRelief(n, l)`, where `l` points toward the light there (the sun if it reaches the cell,
the lamps' own direction, `LDX/LDY`, and a little sky from above): up to ×1.35 facing the light, down to ×0.65 facing away,
exactly ×1 for a flat pixel or a sprite without normals.

**Cleaning AI art.** `node tools/snap.mjs in.png out.png [--colors 16] [--pixel-size P] [--palette hex,...]` runs Pixel
Snapper (Sprite Fusion, MIT): it snaps AI-made pixel art to the grid it was meant to have and to a palette.
`k` = base units per pixel, `(ox, oy)` the origin pixel (centre of mass). `part(c, r)` gives movable parts (1..n)
their own offset `shift[2p-2], shift[2p-1]`. `foot` snaps that line to a row boundary so feet stand on the ground.
`flip: true` mirrors it left to right in its own frame (draw characters facing right, flip them to face left). Animation
frames are simply several sprites from rows that differ (see `games/spacemouse/art.js`). A sprite whose box is off screen
costs nothing. `cache: true` for a still sprite (angle 0, no `shift`): its cells are worked out once per detail level and
flip, then only lit each frame, so hundreds of trees and houses stay cheap (`games/fjordheim/main.js`).

### Sprite options and animation

`drawSprite(spr, x, y, a, o)` also takes `o.tint` `[r, g, b]` (multipliers), `o.flash` 0..1 (mix toward white, unlit: a hit flash) and `o.palette`
`[[r, g, b], ...]` (bytes; replaces the sprite's palette entry for entry: a team colour, a poisoned state). Animation:
`defineAnim(sprites, { fps: 10, loop: true, tags: { run: [0, 5], jump: [6, 7] } })`, `animFrame(anim, t, tag)` → the sprite at t seconds,
`drawAnim(anim, x, y, a, o)` (o.tag, o.t; default the simulation clock, so it stops in pause), `animFromAsset(PIPE_ART.hero, { order, tags })` makes one from
an art pipeline asset that holds frames.

## Entities and projectiles

```js
defineEntity('slime', {
  size: [6, 4],                         // w, h in base units (x RES at spawn); x is the middle, y the feet
  sprite: SLIME_SPR,                    // a sprite, or e => sprite; anchor: 'feet' | 'centre' (default 'centre'); anim: e => sprite
  character: { run: 12, jump: 10 },     // optional: a Character (sizes in base units); set e.input = { x, jump, up, down } in update
  props: { hp: 3 },                     // default fields (copied) of every one spawned
  touches: ['player'],                  // types whose overlap calls onTouch(e, other) every step
  always: true,                         // update off screen too (default: more than 2 screens away it sleeps; sleep: 3 changes that)
  init(e) {}, update(e, dt) {}, draw(e, t) {}, lights(e, t, out) {}, onTouch(e, other) {}, onLeave(e) {}
});
const e = spawn('slime', x, y, { hp: 5 });      // e.dead = true removes it at the end of the step
```
The engine steps entities after the game's `update`, draws them (sprite, flipped when `e.facing < 0`, with `e.tint` / `e.flash` / `e.palette`) before the
game's `draw`, marks them as shadow casters and collects their lights. `near(x, y, r, type?)` and `overlapping(e, type?)` use a uniform hash;
`entities` is the list; `clearEntities()`; `entityCounts()` and `entityStates()` are in `probe()` (`entities`, `states`). `worldInit` clears them.
Names of entity types are strings: `spawn('slim')` says "did you mean 'slime'".

`fireProjectile({ x, y, vx, vy, gravity: 1, drag: 0, bounce: 0, maxBounces: 3, life: 4, color: [255, 220, 120], size: 1, light: { r, c, I }, hits: ['enemy'],
owner, onStep(p, dt), onHit(p, hit) })` spawns a projectile (an entity of type `'projectile'`). It moves by rays, so it cannot pass through a one-cell wall;
on a hit `onHit` runs (return `false` to keep flying), then it dies, or bounces off terrain `bounce` times when `bounce > 0`.

**Timers and tweens** run on the step clock (pause stops them, replays repeat them): `after(2, fn)`, `every(.5, fn)` (both return `{ cancel() }`),
`tween(obj, { x: 100 }, 1.5, 'inout', done)` (ease: `linear in out inout back bounce` or a function). **State machines**:
`e.fsm = fsm({ idle: { enter(e), update(e, dt, f), exit(e), to: { chase: e => e.sees } }, chase: {...} }, 'idle')`, then `e.fsm.update(e, dt)`; `f.state`,
`f.t`; the states of entities with an `fsm` are in `probe().states`. **The game's states**: `useStates({ title: { enter(prev), update(dt), hud(t), draw(t),
exit(next) }, play: {...} })` makes `setState` call them. **Steering**: `seek(e, tx, ty, accel, dt, max)`, `flee(...)`, `wander(e, accel, dt)`.
**Path finding**: `findTilePath(w, h, passable(i, j), si, sj, goal, { cost, max, diag })` (A*, eight ways, no corner cutting; goal `[i, j]` or `(i, j) => bool`)
→ the tiles from the start (excluded) to the goal, or null.

## World tools

- `raycast(x0, y0, dx, dy, max, { entities: true | ['type'], ignore, through })` → `{ x, y, dist, nx, ny, cell, material, chunk, entity }` or null.
- **Triggers**: `addTrigger({ x, y, w, h }, { onEnter(actor), onLeave(actor), who: ['type'] | fn, once })` (units; x, w in cells). Actors are entities and anything
  given to `watchActor(obj)` (a `Character`: its box is x ± o.w/2, y − o.h .. y).
- **Tile maps**: `loadTileMap(rows, legend, { tile: 4, margin: 0 })`: `legend` maps a character to `{ mat, back, prop (sprite), entity: 'name' | ['name', props],
  spawn: 'tag', trigger: 'tag' }` (a bare number is `{ mat }`). A tile is `tile` base units × RES cells. It calls `worldInit`, fills the cells, spawns entities with
  their feet at the middle of the tile's bottom, draws props (culled to the view), records spawn points and makes triggers (touching tiles with one tag are one
  trigger). Returns `{ cols, rows, tc, w, h, spawns: { tag: [x, y] }, triggers: { tag: [t] }, on(tag, { onEnter, onLeave }), at(x, y) → character }`.
- **Digging**: `carve(x, y, R, { power: 1, eject: true, heat: 0, support: true })` removes the solid cells within R units (tough ≥ 4 × power or indestructible stay),
  throws grains, wakes the sand and checks that nothing floats; `fill(x, y, R, mat)`. No fire, shake or sound: that is `explode()`.
- **Gravity**: `setGravity(mps2, sideways)` (sideways pulls bodies and particles); `addGravityZone({ x0, y0, x1, y1, scale: .5 | g: [gx, gy] m/s² })` changes it
  inside a rectangle for bodies and characters; `gravityAt(x, y)` → `[gx, gy]` units/s²; `body.gs` scales one body's gravity; `clearGravityZones()`.
- **Bodies touching bodies**: `bodyVsBody(a, b, onHit, { e: .2, reach: .9, push: [.6, .2] })` for a `Body` or a circle `{ x, y, vx, vy, w, m, r }`; set
  `CHUNK_CONTACTS = true` to let falling chunks collide with each other.
- **Where can a character get to?** `reachSearch({ x, y, opts, visit(c), bad(c), onStep(c), max })` explores the standing spots a `Character` with `opts`
  can reach with its real controller (walks, jumps of three heights and lengths, steering, running jumps) → `{ spots, edges, count, ms }`; `navNearest(g, x, y)`,
  `navPath(g, from, to)` (the edges to follow) and `navInput(edge, i)` (the inputs of step i) turn it into a navigation mesh for enemies or a bot; `jumpArc(x, y,
  opts, { dir, hold, run })` → dots along a jump (for an editor overlay). The world must be set up as in the game.
- **Detail levels**: a game with no `regenerate()` is resampled by `rescaleWorld(k)` when the detail changes (cells, back wall, heat, entities, props, triggers,
  platforms, zones; falling chunks freeze first, particles are dropped).

## Input and actions



`engine/12_iso.js`, for games seen from above at an angle (`games/fjordheim/`). The ground is a grid of `ni × nj` tiles
drawn as 2:1 diamonds into the back wall (never solid, lit and shaded by the scene like any material); the world
grid stays empty, so every light reaches the ground. Everything standing on it is a sprite, drawn back to front.
```js
isoInit(30, 30, { tile: 8, top: 20, bottom: 14 });   // the world for 30 × 30 tiles (top/bottom: room for tall sprites, boats)
isoGround((i, j) => GRASS);                          // paint every tile with a material (0: nothing, the sky shows)
isoSetTile(i, j, SOIL);                              // repaint one
isoToWorld(u, v, out); worldToIso(x, y, out);        // ground point (tile i spans u = i .. i + 1) ⇄ world [x, y]
isoPick(mouseAim())                                  // the tile [i, j] under a canvas point, or null
isoOutline(i, j, 2, 2, [.5, 1.6, .6]);               // trace a 2 × 2 footprint in pixels (a cursor, a selection)
isoDraw([{ u, v, draw() { drawSprite(TREE, x, y, 0, { cache: true }); } }, ...]);   // sorted by u + v, then u
```
A tile is `tile · RES` cells wide and half of that in rows; keep `tile` a multiple of 8 so diamonds have whole cells
and rows at every detail level. Give a building's item its footprint's front corner (largest `u + v`) so it covers what
stands behind it.

## Sky

The sky is its own slow-scrolling layer behind empty world cells: stars (`GAME.stars`, default 1) plus whatever
the game paints. Stars twinkle only when the game has an atmosphere (`setAtmosphere`), never in a vacuum, and are dimmed by
the light of nearby lamps and flashes, read from the frame's light buffer minus sun and ambient (`GAME.starGlare`, default 1,
0 = off; the layer then rebuilds a few times a second instead of once). `GAME.skyBegin(ox, oy, time)` runs once per rebuild; `GAME.sky(i, j, out)` is asked for every
sky cell and returns a cell code (0 = nothing, -1 = dark body that hides stars, `SOLID` or a character's brightness, see
Cell codes) with `out = [r, g, b]`. Stars are single pixels.
See `earthBegin` / `earthCell` in `games/regolith/view.js`.

## HUD

A fixed grid of readable cells (`R.hcols × R.hrows`), redrawn every frame inside `GAME.hud(t)`. Text is drawn in the
engine's own pixel font (5 × 9 characters in 6 × 12 cells, scaled by whole pixels, from `tools/pixelfont.py`), so a page
loads no web font. Codes: the printable characters, `SOLID` (127) a full block, 128..133 box lines `─ │ ┌ ┐ └ ┘` that join
across cells, 255 the background (a box's inside).
`hudText(col, row, text, [r,g,b])`, `hudPut(col, row, code, r, g, b)`, `hudFill`, `hudBox(c, r, w, h, col, bg)`,
`msgBox([[text, colour], ...], topRow?)` (centred box), `hudFlow(row, [[text, colour], ...])` → next row,
`fmtS(v, width, decimals)` (signed, zero-padded), `worldToHud(x, y, out)`, colours `HC.txt dim amber red cyan green gold`,
`hudSprite(spr, c, r, w, o)` (a sprite as a small picture: see Sprites).

`setBackground(r, g, b)` (bytes) sets the colour behind everything: empty space without sky, code-32 cells and the HUD's
boxes. Default `[5, 7, 12]`, near black.

`keyDown('ArrowUp', 'KeyW')` (held now), `Input.pressed` (codes pressed since the last step, plus `'Tap'` for a
click or tap as it goes down, `'TapUp'` for one let go where it began (a tap, not a drag) and `'TapAlt'` for a right click,
which opens no browser menu), `Input.aim` (where the tap was, 0..1 of the canvas) and `Input.fireQueued`, `Input.held`
(a finger or mouse button is down on the canvas) with `Input.drag` (how far it moved since the last step, 0..1 of the
canvas: drag to pan, as Fjordheim does), `Input.pointer` (`'mouse'` or `'touch'`, what was used last; it starts as
`'touch'` on a phone), `mouseAim()` (the cursor, 0..1 of the canvas, for 6 s after it moved; null before the
mouse first moves over the canvas and once it leaves), `Input.mouseX`/`mouseY` with `Input.mouseSeen` (0 while the mouse
is off the canvas: for a cursor that may rest, like edge scrolling), `Input.touch.<name>` (on-screen hold buttons from
`GAME.touch`), `touchShown()`. Aim → world: `[cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT]`. `Input.pointer` is also `'pad'` after a gamepad
button; a second finger makes `Input.pinch` (change of the fingers' distance since the last step, as a share of the canvas width, positive = apart) and
`Input.touches` counts fingers; a finger held still for .45 s adds `'TapHold'` to `Input.pressed`.

**Actions** (keys, gamepad and touch under one name). In `game.json`: `"actions": { "left": ["ArrowLeft", "KeyA", "pad:left", "touch:left"], "jump": ["Space",
"KeyW", "pad:a", "touch:jump"] }`; a token is a key code, `pad:<a b x y lb rb lt rt select start l3 r3 up down left right>` (`left right up down` are also the left
stick, analog) or `touch:<name>`. In code: `action('jump')` (0..1), `actionPressed('jump')` (a press shorter than a step counts), `actionReleased('jump')`,
`axis('left', 'right')` (-1..1), `actionLabel('jump')` (what to show: `SPACE`, or `PAD A` after a pad press). All are read once at the start of a step. A game with
`left` and `right` actions and no `GAME.touch` gets touch buttons made from them. Menus and the title use `ui.up/down/left/right/ok`. Players rebind in the pause
menu (CONTROLS); `bindAction(name, token)`, `resetActions()`.

## Camera

`setCamera({ follow, lead: .3, deadzone: [.2, .3], ease: 3.2, bounds: [x0, y0, x1, y1], rooms: { w, h }, offset: [0, -4] })`: `follow` is anything with x, y (a
`Character`, an entity: its middle is aimed at, its `vx`, `vy` give the look-ahead) or `() => [x, y]`; `lead` seconds of its velocity to look ahead; `deadzone` the
share of the view [w, h] it moves in before the camera follows (it is on the camera's real position, so a long fall does not leave it trailing); `rooms` jumps
screen by screen (w, h in units; default the view); `bounds` the most the camera may show. `GAME.camera()` still overrides. `setCamera(null)` removes the rig.
`cameraShake(n)` adds trauma to `FX.shake`.

## HUD kit, messages and the standard shell

On the HUD grid (`HC.*` colours): `hudButton(c, r, label, { onClick, id, disabled })` (a 3-row button: true on the frame after a click or tap; a tap on a button is
not a tap on the world; `onClick` runs in the game's step), `hudPanel(c, r, w, h, title)`, `hudBar(c, r, w, value, max, col, label)`, `hudWrap(text, width)` → lines,
`hudMenu(id, items, { title })` (`items: [{ label, value, onSelect(item), onAdjust(dir, item), disabled }]`: arrows / W S / d-pad move, Enter / Space / A / a tap choose,
left / right adjust; returns the chosen index), `hudPointer()` → `[c, r]`, `hudTitle(c, r, text, col)` (big letters, 6 × 5 cells each).
`say(text, { time, colour })` adds a line to the feed (up to four stack); `addText(x, y, text, colour, life)` labels are drawn by the engine, rising and fading.
**The shell** (`shell: true` in `Pixelite.run`, or `{ title, pause, result }`): a title screen from `game.json` (title, tagline, controls, a blinking prompt) that starts
the game on Enter / Space / tap / pad A (`GAME.start()`, else `setState('play')`), and a pause menu on P or Esc (RESUME, RESTART, SOUND, MUSIC and EFFECTS volume,
DETAIL, REDUCED MOTION, CONTROLS, `GAME.menu` entries, FULL SCREEN, QUIT TO TITLE). `screenResult({ title, lines, prompt })` draws a result box for the game's own end
state. Not done: a per-cell background colour on the HUD (boxes hide what is behind them instead).

## Settings and saves

`Pixelite.settings` `{ music, sfx, mute, bloom, reducedMotion, keys }` and `Pixelite.setSetting(key, value)` (kept in localStorage under the game's id; mute and bloom apply
at once, volumes to `Sfx.setVolumes` when it exists). `Pixelite.save('slot', data)` / `load('slot')` (JSON under the game's id, with `GAME.saveVersion`; a different version
loads through `GAME.migrate(oldVersion, data)` or as null), `Pixelite.saves()`, `Pixelite.erase(slot)`. `worldSave()` / `worldLoad(s)` keep a whole world as JSON (cells and
back wall run-length packed, entities by their plain fields; at the same detail level; heat, particles and chunks are not kept).


## Sound

`Sfx` (procedural, starts on the first input): `Sfx.engine(throttle 0..1)` (a looping thrust hum), `boom(power)`,
`launch()`, `thud(v)`, `pickup()`, `alarm()`, `win()`, `tone(freq, dur, vol, type, delay, at, slideTo)`, `burst(dur, f0, f1, vol, type, q, at)`,
`heard(x, y)`, `place(x, y)`, `play(name, opts)`, `toggle()`, `buzz(level 0..1)` (a looping mains hum for dying lamps and live
wires: set it every frame, e.g. from `flickerAt()` times how near the lamp is). `at` (the last argument of `tone`, `burst`, `boom`) is
where the sound is heard from: `Sfx.heard(x, y)` or `Sfx.place(x, y)`, below.

**Sounds as data, placed in the world.** `defineSound(name, recipe)` once (in `init`), then `Sfx.play(name, { x, y, pitch, vol })` from
anywhere, with no x and y for a sound that is simply here. A recipe is `{ vol, spread, limit, gap, layers }`, or just the list of layers,
or one layer; a layer is one of
- `{ tone: Hz, dur, vol, type: 'square', slide: Hz to slide to, delay }`: an oscillator that fades out;
- `{ burst: dur, from: Hz, to: Hz, vol, filter: 'lowpass', q, delay }`: filtered noise sweeping from one frequency to another;
- `{ note: 72, instrument: 'bell', dur, vel, rate, release, vol, delay }`: one note of a Sampler instrument (`Sampler.note`), so a
  sound effect can be a bell or a pluck; its instrument is made between frames when the sound is defined, and until it is that layer
  is silent (the rest of the sound plays) rather than a stall.
`vol` scales the whole sound, `spread: .05` detunes every play by up to 5% so repeats do not sound alike, `limit: 2` lets at most two of
it sound at once, `gap: .1` keeps it from playing again within 0.1 s. `pitch` in `play` is a frequency multiplier (2 = an octave up).
`Sfx.play` returns true when it played. `pickup`, `alarm`, `win` and `launch` are defined this way (so `Sfx.play('pickup')` works, and
`defineSound('pickup', ...)` replaces the engine's); a misspelt name in the dev build says what you may have meant.
```js
defineSound('door', { vol: .8, spread: .08, gap: .1, layers: [{ burst: .25, from: 600, to: 120, vol: .4 }, { tone: 140, slide: 70, dur: .2, type: 'triangle', vol: .2 }] });
defineSound('chime', { note: 84, instrument: 'bell', dur: .3 });
Sfx.play('door', { x: door.x, y: door.y });                 // left of the camera: heard from the left, and quieter the farther it is
```
**Where a sound is.** `Sfx.place(x, y)` is `heard(x, y)` with a pan added: `{ delay, gain, muffle, m, pan }`. `pan` is -1..1 by how far left
or right of the listener the sound is (a sound at the edge of the screen is 85% to that side); `gain` is `heard()`'s own with an
atmosphere, and in a vacuum, where `heard()` says full volume everywhere, it still fades with distance (full beside the listener, half
at 1.5 half-screens, a fifth at 4.5). `Sfx.play` uses it when you give `x`; your own `burst` / `tone` / `boom` calls can pass it as their
last argument and get the pan too. (The engine's own blasts, `explode()`, still pass `heard()`: no pan yet.)

**Voices.** At most `Sfx.maxVoices` (24) effect voices sound at once: a new one takes the place of the quietest, or is dropped when it
is quieter than all of them, so a collapsing wall's hundred thuds cannot stack up as audio nodes. `Sfx.stats` counts `played`,
`dropped` and `stolen`. Sounds too quiet to hear (below .003) make no nodes at all.

**Volumes and mute.** Everything goes through two buses, effects and music (the Chip and the Sampler), into one master that is a
constant .5 (headroom). `Sfx.setVolumes({ music, sfx })` sets either (0..1, 1 = as made) and returns `Sfx.getVolumes()`
(`{ music, sfx, muted }`); `Sfx.setMuted(on)`, `toggle()` and the `Sfx.muted` field (assign it to mute at once) do the mute. They are
kept in localStorage under the game's id (`storeKey('sound')`) and come back at the next visit; they also set `Pixelite.settings`
(`music`, `sfx`, `mute`) and are saved there, which is what the pause menu and the M key change, so the two never disagree. Set them
before the first input and they are applied when the sound starts.

`Chip` (NES-style synth playing MIDI): `Chip.load(arrayBuffer)` → song, `Chip.play(song, { loop, fadeIn, onEnd })`,
`Chip.stop(fade)`, `Chip.setVolume(v)`, `Chip.meter()` (lanes and beat, for visualisers), `Chip.connectMidi()`.
Embed songs as base64 (`b64buf`); see `games/regolith/music.js` for a music director.

`Sampler` (16-bit, Super Nintendo style, `engine/13_sampler.js`): sampled instruments made from recipes (piano, strings,
choir, brass, flute, synths, basses, guitars, a General MIDI drum kit: `Sampler.INSTRUMENTS`, `Sampler.KIT`), each squeezed
through the SNES's 4-bit BRR compression at 32 kHz or less (a track's `sound.rate`: grit). Per track: an SNES envelope (attack,
decay, sustain, `fall` while held, release), vibrato, octave and fine tune, a 3-band EQ, a filter, chorus, pan, volume, and
sends to the master's SNES echo (a delay fed back through its 8-tap FIR filter) and reverb; the master also has EQ and a
compressor. `song.snes` keeps only what the console had: 8 voices and the echo. Songs are plain data, made in the SOUND
STUDIO (`/studio/`, which runs this same file) and kept in a game as `music/<id>.song.json`; `node tools/song.mjs <game>`
writes them into the game's `songs.js` as `SONGS['<id>']`.
- `Sampler.prepare(songOrList, { first })`: makes a song's instruments (or a list: `['bell', { instrument: 'strings', rate: 16000 }]`)
  in the browser's idle time, a few milliseconds at a time (`Sampler.build.sliceMs`), so no frame stalls; a promise, and `first` puts it
  ahead of whatever else is waiting. Do it at load (`Music.preload()` does). `Sampler.ready(songOrList)` says whether it is all made.
  (A drum kit used to be one 130 ms stall; the longest stretch is now a few ms, `Sampler.build` has the numbers: `slices`,
  `longest`, `work`.) `Sampler.play(song, { from = 0, loop = true, fadeIn, onEnd, crossfade, wait, layers })`: plays from tick `from`
  (`Sampler.PPQ` = 96 per beat), looping the song's loop region (or the whole song); called before the first input, it starts with the
  sound. A plain `play` makes any instrument that is missing on the spot (the old stall); with `wait: true` it waits for them between
  frames and starts when they are, the song playing now going on until then. `crossfade: 1.5` lets the song playing now fade out over
  that many seconds, in a deck of its own, while this one (give it a `fadeIn` too) fades in. `layers: { 'Drums': 0 }` (or a function of
  the song) starts the song with those tracks already out.
- `Sampler.stop(fade)`, `Sampler.setVolume(v)` (`Sampler.vol`), `Sampler.playing`, `Sampler.position()` (the tick heard now).
- `Sampler.track(nameOrIndex, { volume, fade })`: brings a track in or out, for music that follows the game (drums when the
  danger starts, a melody in the safe room).
- `Sampler.meter()`: `{ beat, drum, tracks: [level 0..1] }`; `Beat` follows the Sampler's song when one plays (kick and
  snare hits fire `Beat.v`), else the Chip's.
- Live notes (a MIDI keyboard): `Sampler.noteOn(track, note, vel)` returns a voice for `noteOff(voice)`, `bend(voice, semis)`.
- `Sampler.note(instrument, note, { vel, dur, rate, pitch, gain, pan, delay, release, dest })`: one note of a built-in instrument on its
  own, with no song or mixer, into `dest` (default: the Sampler's output); returns the voice (`cut(at)` stops it) or null. It is what a
  `{ note }` layer of a sound plays. Make the instrument first (`prepare([id])`) or the first call makes it on the spot.
- **Decks.** `Sampler.deck()` is another player on the same output (null before the first input): its own song, mixer and volume,
  for something that plays over the music; `deck.dispose()` when it is done. `Sampler.duck(level, { fade })` turns a deck's output down
  (and back up with 1) apart from `setVolume`. `Music.stinger` uses both.
- `Sampler.render(song, { from, seconds, sampleRate, loop })` → an `AudioBuffer`, rendered offline (exports, tests).
- `Sampler.check(song)` fills in a song's defaults and keeps only valid notes (`[tick, length, note, velocity]`).
- **A song's own samples** (loaded in the studio): `song.samples[id] = { name, rate, root, loop, brr }`: real SNES BRR bytes in
  base64 (`Sampler.brrEncode` / `brrDecode`, 9 bytes per 16 samples), the rate they are at, the note they sound (`root`, MIDI,
  with cents), and the sample they loop from (-1: play once). A track plays one as `instrument: 'sample:<id>'`; it travels in
  the song, so a game needs nothing else. A loop may have its own end (`loopEnd`, a block: the loop runs `loop` to `loopEnd`
  and the sound after it is never played while a note holds) and a crossfade (`xfade`, in samples: that much of the loop's tail is
  blended with the sound before its start, so it flows into the loop's start); both are only in the song when set.
  `brrDecode(bytes, loopAt, loopEnd, xfade)`.
- **Multisamples:** `song.multis[id] = { name, zones: [{ sample, lo, hi }] }` plays several of the song's samples as one instrument
  (`instrument: 'multi:<id>'`): a note plays the zone whose notes (`lo`..`hi`, MIDI) hold it (the nearest zone when none does), pitched
  from that sample's own `root`; each zone is made as loud as the others. Only in the song when there is one.
- **Where it plays:** `song.places = { title, levels: [level indices], note }`, set in the studio's WHERE IT PLAYS.
  `tools/song.mjs` collects them into `SONG_AT` beside `SONGS` (`SONG_AT.title`, `SONG_AT.levels[i]`, `SONG_AT.other`): the music
  director plays them (`Music.place(...)` below; Space Mouse calls it every frame in `afterFrame`).
- **Automation:** `track.auto = { volume, pan, filter }`, each a list of `[tick, value]` points (volume 0..1 on top of the fader,
  pan -1..1 in place of the track's own, filter 0..1 = 40 Hz..16 kHz, which turns a track's filter on as a low-pass): straight
  lines between points, level before the first and after the last. A third number on a point bends the segment that arrives at it
  (`[tick, value, c]`, c -1..1: above 0 it waits then rushes, below 0 it rushes then settles; the engine ramps through it in 1/8-beat
  pieces, `Sampler.laneRamp`). More lanes, each only in `track.auto` once it has points: `echo` and `reverb` (the sends, 0..1, in
  place of the track's own), `pitch` (a bend in semitones, -12..12, on every note of the track at once; a MIDI file's pitch bend),
  `loop` (0..1 along a looping sample: where the loop starts for each note, taken when the note starts, in 16 steps; a held note
  does not move). `song.auto = { echo, feedback }` are the master echo's level (0..1) and feedback (-.95..95).
  `song.tempo = [[tick, bpm], ...]`: tempo changes after the start (the song's `bpm` holds until the first); a third number 1 makes the
  tempo glide to that point from the one before it (a ramp, linear in ticks) instead of jumping. `Sampler.secAt(song, tick)`,
  `tickAt(song, seconds)`, `bpmAt`, `laneAt`.
- **Glide:** `track.sound.glide` (seconds, 0 = off): the track plays one note at a time, and a note that starts while the last
  is still held slides to its pitch from that one (a lead line).
- `Sampler.force(song | null)`: play this song and nothing else (the game's own `play` calls and the Chip keep quiet) until
  `force(null)`, which also lets the music director play the song the game last asked for. A page embedding the game sends
  `{ type: 'pixelite:music', song }` for it: the studio's preview.

**The music director.** `Music` plays the song for where the game is, crossfades between songs, brings tracks in and out as the mood
changes, and plays stingers over the music. It works on the game's `SONGS` and `SONG_AT` (written by `tools/song.mjs`) and on the
Sampler's own deck, so `Beat`, `Sampler.meter()`, `Sampler.track` and the studio's preview work as before. They are plain calls: a
hook, a state change or a trigger can make them. (A game that plays MIDI through the Chip, Regolith, keeps its own director; the
name `Music` belongs to the engine, so that one is `RegolithMusic`.)
- `Music.preload(ids?)`: makes the instruments of the songs (default: every song) between frames; call it in `init`. A song whose
  instruments are not made when it is asked for starts when they are, never stalling a frame.
- `Music.place('title')`, `Music.place(levelIndex)`, `Music.place('<id>')`: the song `SONG_AT` names for that place (a level with no song
  of its own gets the title's; `'<id>'` is a song placed only by a note, `SONG_AT.other`). Asking again for the place it is in does
  nothing, so it can be called every frame. `Music.songAt(where)` says which song that is.
- `Music.play(id, { fade = 1.5, from, loop, restart })`: this song, the one playing fading out over `fade` seconds as it fades in.
  `Music.stop({ fade })`. `Music.current` is the song asked for. `Music.define(id, song)` adds a song of your own beside `SONGS`.
- `Music.layer(name, on, { volume, fade = .5 })`: brings the track called `name` in or out (`Music.layers({ danger: ['Drums', 'Bass'] })
  names a layer of several). Only a change does anything, and the level carries over to the next song: drums that are out stay out
  when the level changes. Write each track so it is harmonically complete alone.
- `Music.stinger(id, { duck = .35, fade = .15, volume })`: a song of one pass (a fanfare, a death) on a second deck over the music, which
  ducks while it plays and comes back up after. Preload it (`Music.preload([id])`) so it is ready when the event happens.
- While the studio previews a song in the game (`Sampler.force`) the director keeps quiet, and takes over again when it ends.

**Sound through air.** In a vacuum (`setAtmosphere(0)`, the default) `Sfx.heard` says every sound is heard at once at full volume, as
if felt through the ground, exactly as before. With an atmosphere, `Sfx.heard(x, y)` says how a sound at that point (body
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

## Levels in the web editor

A game with hand-drawn tile maps gets a **LEVELS** tab in the site's editor (a pixel editor: one coloured square per tile)
by declaring them in `game.json`:
```json
"levels": {
  "file": "sectors.js",                         // a part of the game holding the maps
  "tile": "4 x 4 base units",                   // shown in the editor
  "legend": { "#": { "name": "hull", "color": "#4a5263" }, ".": { "name": "inside", "color": "#1c202b" },
              "P": { "name": "start", "color": "#ffffff", "on": ".", "unique": true } },
  "marks": { "signs": { "kind": "text", "color": "#ffd278" }, "lowG": { "kind": "rect", "color": "#78dcff", "label": "low gravity" } }
}
```
In that file each map is a `String.raw` template literal whose rows start on the line after the backtick, inside an object
with a `name: '...'` before it (see `games/spacemouse/sectors.js`).
Every tile needs its own colour (a map exported as a PNG must come back the same); `on` draws an object over another tile's
colour; `unique` allows exactly one per map; `marks` are read-only overlays read from the map's own object (`text`: `[x, y,
'text']`, `rect`: `[x0, y0, x1, y1]`). Painting edits the file's draft, so the preview, the CODE tab and the CLAUDE tab's
patch all see it. Parsing and edits: `portal/assets/levels-core.mjs`.

Two optional hooks let the editor drive the preview: `GAME.levels.play(i, tile)` starts map `i` (with the player at `tile` =
`[x, y]` when given) and `GAME.levels.check(i)` returns whether it can be finished:
`{ ok, goal, crumbs: [reached, total], missing: { crumbs: [[x, y]], ... }, spots: [[x, y], ...] }` (the editor circles what is
missing and dots `spots`, the tiles the player can stand on). The editor talks to the preview with messages the engine
handles: the page posts `{ type: 'pixelite:ready' }` to its parent once booted, takes `{ type: 'pixelite:level', action:
'play' | 'check', level, tile, id }`, and answers a check with `{ type: 'pixelite:levelcheck', id, result }`.
See `games/spacemouse/` (`main.js` and `levelcheck.js`).

## Tests and probes: `Pixelite.test`

Headless checks and AI sessions drive a game through these (they work while the loop is frozen and run much
faster than real time):

| | |
|---|---|
| `Pixelite.test.start()` | Leave the title screen (`GAME.start`, else Enter). It first sets the step counter to 0 and the random numbers back to the page's seed, so a seed and a list of inputs always make the same run. |
| `Pixelite.test.step(n, ['ArrowUp'])` | n fixed steps with these keys held → `probe()`. |
| `Pixelite.test.stepUntil(fn, max, keys)` | Step until `fn(probe)` is true or `max` steps → `{ steps, probe, ok }`. |
| `Pixelite.test.press(code)` | A one-shot key press. |
| `Pixelite.test.tap(x, y)` | A tap or click at a world point (x in cells, y in units): the next step sees `Tap`, `TapUp` and `Input.aim` there. |
| `Pixelite.test.freeze()` / `unfreeze()` | Stop / resume the frame loop (for screenshots). Freeze first when a test needs exact repeatability: frames that run live change the step counter. |
| `Pixelite.test.render()` | Draw one frame now (at the simulation clock's time, so a frozen frame draws the same twice). |
| `Pixelite.test.record()` / `stop()` / `replay(log)` | Record the steps, presses and taps a test makes → `{ version, seed, steps }`; play such a log back (open the page with `?seed=<log.seed>` first). `?replay=<url or JSON>` in the page address plays a log after boot. A bug report or a level's solution is that small file. |
| `Pixelite.test.hash()` | A checksum of the world (cells, back wall, heat) and the particle count: equal after equal runs. |
| `Pixelite.test.probe()` | `{ state, frame, version, paused, errors, res, renderer, cols, rows, world, cam, particles, chunks, perfMs, tune, game: GAME.probe() }` |

**Random numbers.** The simulation (sand, blasts, particles, structures) and every game draw from one seeded generator: `rnd()` (0..1),
`rr(a, b)`, `pick(string)`. `Pixelite.seed(n)` or `?seed=n` in the page address starts it from n. Use `rnd()` in game code, not
`Math.random()` (the build warns): `Math.random` makes a run unrepeatable. Sound keeps `Math.random`; it is not simulation.

**Pause.** `Pixelite.pause(true|false)` and `Pixelite.paused`. Pause is a flag, so a game in any state (`'build'`, `'night'`) can be paused;
a game that names its pause state `'paused'` still works (setting `state = 'paused'` pauses, and pausing from `'play'` switches to it). Key
presses made while paused are dropped, not saved up for the first step after resuming. The page pauses itself when it is hidden.

**Errors.** An error in a page shows an overlay with the message and its source file and line in `?dev` and in the editor's preview, and
one line on the HUD for a player; `Pixelite.errors` lists them and `probe().errors` counts them. With `?dev` (or in the editor) the engine
also warns, with the nearest valid name, about an unknown option to `defineMaterial`, `new Character` or `Pixelite.run`, and about a NaN in a
body, a character, a particle or a light. The build refuses a game that repeats a key in its `Pixelite.run({...})` hooks or has an unknown
`game.json` key (`tools/authorcheck.mjs`), and warns about `Math.random` in game code.

`tests/smoke.py <id>` uses exactly this for any game. URL hash `#2d` / `#gl` forces a renderer.
