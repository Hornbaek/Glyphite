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
  drawFront(t) {},        // the front pass: drawn after everything above, so the hero walks behind it (see Layers in front and far behind)
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
  zoom: { default: 1, min: .5, max: 4, wheel: true, pinch: true },   // the view's zoom (see Camera): its first value and limits, and the mouse wheel and a pinch drive it
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
effect lights) → scene (terrain, particles, chunks, then props, entities, the state's `draw`, `GAME.draw`, the front pass (front props and entities, the state's and
`GAME.drawFront`), then shock rings) →
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
| `liquid` | false | Flows: falls, spreads level and pools. Not solid to anything (a `Character` swims in it, a `Body` floats, particles splash, light dims in it) and never structure. See Liquids. |
| `viscosity` | .1 | Liquid only, 0..1: how thick. Thin liquids level out several cells a step, thick ones (lava, honey) creep. |
| `murk` | 1 | Liquid only: how fast light dies in it (1 water-like, 3 lava-like); its colour decides which channels go first. |
| `reacts` | null | `[{ with, makes, leaves: 0, heat: 0, chance: .25 }]`: a cell touching a `with` cell becomes `makes` (0: gone) and that cell becomes `leaves` (0: used up). See Reactions and heat. |
| `flammable`, `ignite`, `burnsTo` | 0, .35, 0 | A flammable cell hotter than `ignite` burns (chance `flammable` per step to be burnt away into `burnsTo`) and heats its neighbours: fire spreads through the `heat` field. |
| `conduct` | 0 | 0..1: heat flows between touching cells that both conduct. |
| `hot` | 0 | 0..1.6: its cells stay this hot (lava); set with `setC` or `addHeat`. |
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
| `updateSkyline()`, `colTop[x]` | First solid row of each column. The frame loop keeps it up to date from the world's revision counter (only the 16-column strips where something changed are rescanned); `updateSkyline()` rescans every column, so call it after writing `cells[]` yourself (a generator does, once). |
| `worldChanged(x0, y0, x1, y1)` | Say which cells (all of them with no arguments) you wrote with `cells[i] = m` *while the game runs*: the lamp cache and the still-frame reuse (see Performance) trust the engine's revision counter, which `setC`, the sand, blasts and structures bump by themselves. Writing at generation time, before the first frame, needs nothing (`worldInit` starts a new revision), and neither do `backCells`, `heat` and `vari` (a checksum of the window and the hot-or-not scan watch those). |

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
| `setBackdrop({ dim, shadow, dir, depth })` | `dim` (.42): brightness against the world; `shadow` (.6): how dark the drop shadow is; `dir` ([.6, .8]): the way shadows fall, in units (down and right); `depth` (2.2): how far they reach, base units; `lamps` (false): the shadow falls away from the lamps that light each cell instead of one way for the whole screen (it turns smoothly toward `dir` where no lamp reaches; the sun does not turn it). |

## Bodies and contacts

```js
const b = new Body(x, y, mass, inertia, hull);   // hull: [{x, y, kind}] in units, body frame, origin = centre of mass
b.fx = fx; b.fy = fy; b.tq = torque;              // set forces before each step (gravity is added for you)
b.step(dt);                                       // integrate + collide with the grid
for (const h of b.hits) if (h.vn > 9 * RES) crash();   // h: {kind, vn (impact speed, units/s), mat, x, y, nx, ny}
```
Fields: `x, y, vx, vy, a, w, m, I, hull, hits, feetDown, bodyDown`, and in a liquid `dens` (density against the liquid's, default 1.5: sinks slowly; below 1 it floats), `inLiquid` (share of the hull under, 0..1), `liquid`. Helpers: `b.toWorld(lx, ly, out)`,
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

### Character: swimming

While the middle of its box is in a liquid (`hero.swimming`) gravity gives way to strokes: up or jump rises, down dives, left / right swims, and doing nothing sinks slowly; a thick
liquid slows every stroke. Holding up with the head already out only keeps it at the surface (it treads water, the middle of the box bobbing there); a jump *press* with the head out of
the liquid, or a moment after swimming, hops out, launched like a jump from the ground (standing on the bottom of a shallow pool, a press is the ordinary jump). A fast entry
splashes (`hero.splashed` = the speed, else 0, for a sound) and a fall into water is no landing (`landed` stays 0). Readable after every step: `inLiquid` (0..1 share of its height in
liquid), `submerged` (the head is under), `swimming`, `liquid` (which material). Options: `swim` (true; false wades and falls through), `swimSpeed` (`16·RES` units/s), `swimRise`
(`20·RES`), `sink` (`6·RES`, negative floats up); entity `character` options give them in base units.

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

## Liquids

```js
const WATER = defineMaterial('water', { albedo: [.22, .5, .9], liquid: true, viscosity: .05, density: 1, murk: 1 });
setC(x, y, WATER); fill(x, y, R, WATER);          // pour it: a liquid is a material in the grid
```
A liquid cell falls into a free cell below and otherwise runs along its row over free cells to the nearest place where it can drop, up to about `12·RES·(1 − viscosity)²` cells a step, so a
poured column levels out in a few steps and a pool at rest is flat to within the reach (chunks of a settled pool go to sleep; any `setC` or blast wakes them). A cell only moves when it ends
up lower, every move swaps with an empty cell, so **a liquid is neither made nor lost** (the unit test pours a column and counts); viscosity makes a move a matter of chance (thick liquids
creep). A heavier liquid sinks through a lighter one (`density`). **Sand** (a `granular` material) sinks through a liquid when its `density` is at least the liquid's (the two swap
places, nothing is lost) and floats on one that is denser; grains thrown into a pool sink with drag, a grain lighter than the liquid floats, droplets of a liquid (`spawnGrain` with its material,
what a blast throws) rejoin it, fire, sparks, dust and exhaust are put out where they enter it, and a fast entry sprays droplets (`splash(x, y, speed, liquid)` does that by hand).

**It is not solid.** `MAT_SOLID[m]` is 0 for a liquid (and `MAT_LIQ[m]` 1): `solidU`, `Character`, `Body`, particles, `lineClear`, `sunAt`, `raycast` and the light's occlusion all pass through
it, `carve` does not dig it (it flows into the hole) and `fill` only fills empty cells. It is never structure: `checkSupport`, `structuralCheck`, `settleIslands` and `breakOff` ignore it, so a pool
never hangs in the air as a chunk. When something solid takes a liquid's cell (`putSolid(x, y, m)`: a chunk freezing in a pool, a slab sinking into one, sand landing in water) the liquid moves to the
nearest free cell reached through liquid (`displaceLiquid(x, y)`): the level rises and nothing is lost, unless the pool is sealed. `setC` simply replaces the cell, as it always did.

**Light and look.** The sun and ambient light that reach a liquid cell (and the floor and walls of the pool) are dimmed by the depth of liquid above them, per colour channel: `exp(-absorb · murk ·
depth / RES / 6)`, where a channel's absorption is higher the less of it the liquid's colour holds, so blue water loses red first and deep water goes dark blue; lamps under water keep their
light, and a liquid casts no sun shadow. A liquid cell is drawn as a translucent flat colour (its bands, lit, mixed with the back wall behind it), a brighter top row and the odd glint on the
surface, in the CPU's colour buffers, so the WebGL and the 2D canvas renderer show the same picture; a hot liquid glows with its heat. Worlds without a liquid take none of these paths
(`ANY_LIQ` is 0) and draw exactly as before.

Not done: pressure (a U-tube does not level through the bend: a liquid only runs along its row), waves, a veil of water drawn over a sprite standing in it (it is darker and bluer by the light only),
gas, and gravity along x for the flow.

## Reactions and heat

```js
const LAVA = defineMaterial('lava', { liquid: true, albedo: [1, .4, .1], viscosity: .7, density: 2, hot: 1.2, conduct: .6, murk: 3, glow: [1, .5, .2, 6] });
setMaterial(LAVA, { reacts: [{ with: WATER, makes: STONE, heat: .6, chance: .5 }] });      // after STONE and WATER exist
defineMaterial('wood', { albedo: [.5, .35, .2], flammable: .03, ignite: .3, conduct: .4, burnsTo: ASH });
```
`reacts`: a cell touching (up, down, left, right) a `with` cell becomes `makes` (0: gone) at `chance` per step, and the touched cell becomes `leaves` (default 0: used up; `leaves: with` keeps it).
`heat` is added to the new cell (it glows and cools off) and, when positive, steams: lava + water makes hot stone and puffs of steam, one water cell per stone cell. A reaction that has not happened
yet keeps its chunk awake. `flammable` (0..1, the chance per step a burning cell is burnt away) with `ignite` (the heat at which it catches) and `burnsTo`: a cell hotter than `ignite` burns:
it keeps itself hot, heats its four neighbours (that is how fire spreads through the `heat` field; `explode`, `carve({ heat })` and `addHeat` light it), throws flames and smoke, and a liquid
beside it that is not hot puts it out. `conduct` (0..1): heat flows between touching cells that both conduct, from hot to cold (a metal bar carries a fire across a gap that plain rock
stops; the pair's lesser rating × .2 of the difference a step; conserved), for the cells near the camera like every heat effect. `hot`: the cells keep this heat (`setC` sets it, a liquid
carries it as it flows, cooling never takes it below it). The engine never names a material: all of this is data on the game's own materials.

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
  wind: 0,                                                                       // how fast the wind (setWind) pulls it, a share a second; 0: it does not
  update(i, dt) { /* steer, collect: P.age[i] = P.life[i] */ },
  onHit(i, cx, cy, m, hitX, hitY) { return true; },                              // it ran into solid cell (cx, cy): true ends it there, false bounces as usual
  onLiquid(i, m, h) { return true; },                                            // it is about to enter a liquid cell: true ends it there (default: it goes on, slowed)
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
`skip` keeps a light from being shadowed by its own body. `setSun(angleDegrees, colour?)`: the sun's angle from the left horizon, so 1..89° is the sun in
the left half of the sky (light travels right and down, shadows fall to the right), 91..179° the right half (a sun at 145° is the one at 35° seen from the other
side: shadows fall to the left; 180 − angle is its height, so an atmosphere reddens both the same); 90° is taken as 89°, and the angle is kept in `SUN_EL`.
A day is `setSun(180 * (hour - 6) / 12)` (see `setTimeOfDay`, Weather). `setSun(null)` is no sun: caves, indoors. `setAmbient([r, g, b])`. Emissive things: `splatLight(cx, cy,
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

**Glowing pixels (the `emit` layer).** A sprite's data may also carry `emit: ['....99..', ...]`, rows the size of `rows`: `.` where a pixel does not glow, a base-36 digit where it
does (`9`: the pixel is fully its own colour, unlit, a window, a screen, eyes; `1`..`8` that share of it, the rest lit as usual; `a`..`z` brighter than the art, up to 3.9). A glowing
pixel is drawn **unlit** (the art's own colours at any hour) and **gives light**: `drawSprite` records where, and the scene pass of the *next* frame pours the record into the light
buffers like fire (`splatLight`): the terrain and particles drawn after it, and the next frame's sprites, are lit by it, one frame behind, which is not visible for anything that moves like a
character. The glowing cells of a sprite are added up in blocks of RES × RES cells (a big screen is a few splats, its light the same in total, per base cell, so it is the same at every
detail level). `defineSprite(data, { glow: 3, glowGain: .05 })`: `glow` is the radius of that light in base cells (0: glowing pixels but no light), `glowGain` its strength per base cell of
glow; `drawSprite(spr, x, y, a, { emit: .5 })` scales the glow of one draw (0: the lamp is off: ordinary lit pixels and no light; a flicker). A sprite without an `emit` layer is drawn
exactly as before. Made from the art by `tools/pixelsprite.py --emit '#ffe08a' [--emit-mask glow.png]` or, in the art pipeline, `node tools/art.mjs add ... --emit '#ffe08a'` (docs/ART_PIPELINE.md).
**Sprites that block lamp light.** A sprite stops the sun through `markSpriteDyn`; `markSpriteDyn(spr, x, y, a, { blocksLamps: true })` (and `blocksLamps: true` in a `defineEntity`)
makes its cells stop the light of lamps as well (shadowed lamps only: a character between a lamp and a wall casts a shadow on it), the lit side of the sprite itself still being lit. A lamp
whose reach touches such a sprite is cast again every frame instead of being kept (`Pixelite.cache`), and goes back to the cache when the sprite has gone.

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
  front: true,                          // drawn in the front pass, after the game's draw hook (see Layers in front and far behind)
  blocksLamps: true,                    // its sprite also stops the light of lamps, not only the sun's (see Sprites, Glowing pixels)
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

- `raycast(x0, y0, dx, dy, max, { entities: true | ['type'], ignore, through, liquids })` → `{ x, y, dist, nx, ny, cell, material, chunk, entity }` or null (a liquid does not stop a ray unless `liquids: true`).
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



`engine/12_iso.js` (`"iso"` in game.json's `"engine"` list), for games seen from above at an angle (`games/fjordheim/`). The ground is a grid of `ni × nj` tiles
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

## Layers in front and far behind

**The front pass.** Everything a game draws lands over the terrain, in this order: props, entities, the state's `draw`, `GAME.draw`. The **front pass** comes after
all of it, so a character walks behind what is drawn there: front props (a tile map legend entry `{ prop: GRASS, front: true }`), entities defined with `front: true`
(`defineEntity('pillar', { front: true, sprite })`), the state's `drawFront(t)` and `GAME.drawFront(t)`. They write cells and sprites the same way (`putEmit`,
`putLit`, `drawSprite`); in the front pass they cover the game's own objects, particles and the terrain, never the HUD.

**Backdrops** are layers between the sky and the world: hills, a far city, mountains. Each has a grid of its own scrolled by the camera times its `parallax`, with the
sky layer's sub-cell offset (so it glides instead of stepping a cell at a time, in both renderers), and shows behind every world cell that is empty: the back wall,
the terrain and everything drawn cover it, and the sky shows through where it paints nothing. The first one added is the farthest; at most three.
```js
addBackdrop({ parallax: .35, horizon: 24 * 8 * RES,                  // 0 holds still on the screen, 1 moves with the world; horizon: a world row (see below)
  paint(gx, dy, out, t) { const top = -14 * RES - 6 * RES * vnoise1(gx * .03, 5); if (dy < top) return 0; out[0] = .1; out[1] = .25; out[2] = .35; return SOLID; } });
addBackdrop({ underground: [.02, .02, .05] });                      // a dark wall below the skyline: a cave and the ground show no stars
```
`paint(gx, dy, out, t)` is asked for every cell when the layer is rebuilt: `gx` is the column in the layer's own space (it scrolls by `cam.x × parallax`, so a hill that
is a function of `gx` stays put), `dy` the row; it returns a cell code (0 = nothing, `SOLID`, or a character's brightness) with `out = [r, g, b]` in light units, as
`GAME.sky` does. Backdrop colours are the painter's own (not lit), baked with the exposure and the vignette like the sky. `horizon` (a world row in units, scaled by RES) makes
`dy = 0` the layer's row that stands where that world row does when the camera is centred on it: hills painted below `dy = 0` sit on the ground of a level whose ground is
at that row, whatever the parallax; without it `dy` is the layer's own row. `parallax` may be `[x, y]`. `begin(ox, oy, t)` runs before each rebuild; `animate: 4` rebuilds that
many times a second even when the layer has not scrolled (drifting clouds); `key: (ox, oy) => value` rebuilds when the value changes (a layer that follows the time of day).
A layer is rebuilt when it has scrolled a whole cell, so keep `paint` cheap (it runs for about 64 000 cells at 1280 × 800: 1 to 3 ms). `removeBackdrop(layer)`, `clearBackdrops()`;
`worldInit` clears them like everything else that belongs to a world (the detail rescale keeps them). `underground: [r, g, b]` (with `grain`) is a built-in painter at
parallax 1 for the cells under the world's skyline (`colTop`): the answer to stars showing in a cave.

## The screen look: palette and post effects

Colours are continuous (banded per material, then tinted by the lamps), so a frame holds thousands of them. `setPost` lets a game choose one look for the whole screen; every
option is off, or as it always was, until it is asked for, so a game that never calls it renders bit for bit as before.
```js
setPost({ palette: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], dither: .6 });   // four greens: the world, the backdrops and the sky lock to them
setPost({ scanlines: .25, vignette: .6, bloom: false });                           // a CRT: thin dark lines, darker corners, no glow
setPost({ palette: null });                                                        // one option at a time; the others stay as they were
getPost()                                                                          // what is set now: { vignette, bloom, palette, dither, scanlines }
```
| Option | |
|---|---|
| `palette` | `null`, or 2 to 255 colours (`'#rrggbb'`, `'#rgb'` or `[r, g, b]` in bytes). Every pixel of the world, the backdrops and the sky becomes the nearest palette colour (the "redmean" distance, which follows the eye better than plain RGB). The HUD keeps its own colours so text stays readable. **Put the background colour in the palette** (`setBackground`): a cell filled with it is snapped, but the empty space behind everything is drawn by the renderer as it is. A game with `art/` can pass its master palette. |
| `dither` | 0..1 (default 0): an ordered (Bayer 4 x 4) offset added before the palette picks, so a gradient becomes a pattern and not bands. It is fixed to world cells, so it does not shimmer while the camera moves. Only matters with a `palette`. |
| `vignette` | 0..1 (default .42, what every game had): how much the corners darken. |
| `bloom` | `false` switches the glow off for this game; the player's own setting (`setSetting('bloom', …)`, the G key) can still switch it off, and neither undoes the other. |
| `scanlines` | 0..1 (default 0): a thin dark line at the bottom of each cell row, fixed on the screen, over the world, backdrops and sky but not the HUD. The same lines in WebGL and 2D. |

The palette is applied after the exposure and the light, so a game that uses `setEyeAdaptation` or lamps still reads as light and dark, only in few colours. The glow
(bloom) is added by the renderer over the locked colours and is not a palette colour, so a game that wants a strict palette switches it off. `setPost` is not undone by
`worldInit` (it is the game's look, like `setBackdrop`).

## Weather, wind, fog and the time of day

A small kit on the existing parts (`engine/21_weather.js`). Each piece is off until a game asks for it, and a game that never calls any of it renders and plays bit for bit as
before (no particle types are even made until `setWeather` is called). They run on the simulation's steps, so pause, slow motion and replays hold.
```js
setTimeOfDay(14.5);                                  // the clock drives the sun, the ambient light, the sky and the stars
setTimeOfDay(6, { rate: 0.25, sunrise: 6, sunset: 20 });   // and the engine can run it: a quarter of an hour a second
setWeather('snow', { amount: .6, pile: SNOW });      // an emitter above the view; some of what lands becomes cells of SNOW
setWind(14, .5);                                     // blows right at 14 units a second, swelling and dropping
setFog({ colour: [.85, .9, 1], density: .35, ground: .6 });   // a ground mist over the world, thicker over the hills and the sky
```
| Call | |
|---|---|
| `setTimeOfDay(hour, opts?)` → `{ hour, daylight, sunAngle }` | `hour` 0..24, wraps (12 is noon). The sun rises on the left at `sunrise` (default 6) and sets on the right at `sunset` (18), climbing and falling by a sine, so its shadows swing across the world (the angle is kept between 8 and 172 degrees: a shadow from the last degrees is a stripe across the world). Its colour goes from a thin red at the horizon to white by a third of the way up and its strength follows its height; it is off (`setSun(null)`) at night. The ambient light goes from night blue to day, with a warm band an hour or so either side of sunrise and sunset, and the sky and the stars follow (below). Options stay set until changed: `sunrise`, `sunset`, `rate` (hours a second the engine runs the clock by itself, 0 stops it), `sun` (the day sun's strength, default 1), `horizon` (the sky gradient's `at`: where on the screen the sky reaches its horizon colour, default 1), `sky: false` and `ambient: false` (leave those to the game). It calls `setSun` with a pinned colour, so an atmosphere does not redden it a second time. |
| `getTimeOfDay()` | `{ hour, on, sunrise, sunset, rate, daylight }`; `daylight` is 0..1, how much of the day's light there is: a game's own "is it night" test (turn the lamps on below .3). |
| `setSkyGradient({ top, horizon, stars, at })` | The sky layer's base colour, `top` at the top of the screen to `horizon` at the share `at` of its height (default 1, the bottom; a side view whose ground fills the bottom third wants about .7, so the sky just above the ground is the horizon colour and a sunset's warm band is not hidden behind it), in light units, under the stars and under what `GAME.sky` paints. `stars` 0..1 is how visible the stars are (below .06 they are not drawn). `setSkyGradient(null)` gives back the plain sky. Used by `setTimeOfDay`; a game may use it alone for a dusk level or a purple planet. |
| `setWeather(kind, { amount, pile, pileChance })` | `'rain'` or `'snow'`, or `null` to stop (what is in the air finishes falling). An emitter above the view, scaled to its width, that never takes more than three quarters of the particle budget. `amount` 0..1 is how heavy (default .5). Rain falls fast, takes heat out of what it hits (fire and hot rock cool), splashes, and ends in a liquid with a few droplets back; snow drifts and sways, and cools a little. `pile: material` turns a share of what lands (`pileChance`: default .03 for snow, .01 for rain) into cells of that material: a granular snow material piles into drifts and slides down slopes, a liquid one makes puddles that flow (see Liquids). Piles are mass the weather adds, so keep the chance small and melt them if the game should (a hot cell, `reacts`). |
| `setWind(speed, gust = 0)` | `speed` in base units a second (scaled by RES like every speed; positive blows right), `gust` 0..1 how much it swells and drops (about every few seconds). A particle is pulled toward the wind at its type's `wind` coupling (a share a second): smoke and vapour .9, dust 1.5, rain 4, snow 2.5, a type a game defines with `wind: k`; everything else (grains, debris, sparks, fire) is not moved. Rain and snow are launched slanted so they still land across the view. `windNow()` is its speed this moment, for a game's own flags and sails. 0 is no wind, and then nothing runs. |
| `setFog({ colour, density, ground })` | A veil of one colour over the finished picture. `density` 0..1 is how much of it covers the world (0 or `null` switches it off); the backdrops are further away and get more of it, the farthest most, and the sky more still. `ground` 0..1 thickens it toward the bottom of the screen and thins it toward the top (a ground mist). `colour` is in light units and is lit by the scene (the ambient light and the sun's height), so a fog is pale by day and dark at night. It is applied before a palette lock (`setPost`). |

`setTimeOfDay` with a `rate` is all a day and night cycle takes; put the lamps' intensity on `1 - getTimeOfDay().daylight`. The sky (and the fog and the backdrops) are cached
layers: they are made again only when a colour has moved by about a sixty-fourth, so a slow day does not cost a pass a frame. `probe()` reports `weather` and `hour`.

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

**Zoom.** The view's scale used to be fixed: a cell is the same size on the screen whatever happens. `setZoom(z, at?)` makes a cell `z` times as wide: 2 shows a quarter
of the cells, twice as big, .5 shows four times as many, half the size. It changes only how many device pixels a cell takes (the physics, the detail level and the world are
not touched), in whole device pixels so it stays crisp: the zoom you get is the nearest the pixels allow, and `getZoom()` says what it came to (it is 1 when the game never
zooms). The camera keeps what is at `at` (fractions of the canvas, default the middle) where it was, so zooming in on the mouse is `setZoom(2, [Input.mouseX, Input.mouseY])`;
a camera hook or rig that follows something keeps following it. `zoomStep(dir, at?)` is one step of about 15 percent in (`dir > 0`) or out, never less than one device pixel.
```js
Pixelite.run({ zoom: { default: 1, min: .5, max: 3 }, /* ... */ });   // the mouse wheel zooms on the pointer and a two finger pinch zooms (wheel: false, pinch: false: not)
setZoom(2);  getZoom();  zoomStep(-1);  setZoom(1)                  // or from the game's own code: a map key, a boss that fills the screen
```
The limits default to .5 and 4, and a game with a `zoom` hook object is the only one the wheel and the pinch reach (the page still scrolls over the canvas for the others).
The cost is in the cells: zooming out lights and draws more of them (about four times at .5 on the same screen), the smallest cell being 2 device pixels. `R.cols` and
`R.rows` (the HUD and your own culling should use them, as they do for a window resize) change with it; `Input.wheel` and `Input.wheelAt` carry the wheel for a game that
wants it itself. `probe().zoom` reports it. The HUD is a grid of its own and does not zoom.

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

The Chip, the Sampler and the isometric ground are **optional engine parts** (see Performance, Smaller pages): a game names the ones it plays with in `game.json`'s `"engine"` list.

`Chip` (NES-style synth playing MIDI; `"chip"`): `Chip.load(arrayBuffer)` → song, `Chip.play(song, { loop, fadeIn, onEnd })`,
`Chip.stop(fade)`, `Chip.setVolume(v)`, `Chip.meter()` (lanes and beat, for visualisers), `Chip.connectMidi()`.
Embed songs as base64 (`b64buf`); see `games/regolith/music.js` for a music director.

`Sampler` (16-bit, Super Nintendo style, `engine/13_sampler.js`; `"sampler"`): sampled instruments made from recipes (piano, strings,
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

## Ropes, a grappling hook, ghosts and rewind

- `drawLine(x0, y0, x1, y1, r, g, b)`: the cells between two world points, in light units (like `putEmit`).
- **Ropes** (`engine/18_toys.js`): `const rope = new Rope(ax, ay, bx, by, 14, { slack: .05, pinA: true, pinB: true, maxTension: 2.5, collide: true, gravity: 1, onSnap(i) {} })`;
  `rope.a` / `rope.b` (a point, `() => [x, y]` or an object with x, y) are what the pinned ends follow; `rope.step(dt)` every step, `rope.draw(r, g, b)` in `GAME.draw`, `rope.cut(i)`.
  Verlet point masses with distance constraints; they collide with the grid (not chunks). A link stretched past `maxTension` times its length snaps (`rope.snapped`).
  For rope bridges, chains, tow cables, pendulums.
- **Grappling hook**: `const hook = new Grapple(hero, { range, rip, reel })`; `hook.fire(dx, dy)` → true if it caught a solid cell; pass `hook.rope` to `hero.step(dt, { rope: hook.rope })`
  while attached: beyond its length the character is pulled back onto the circle and loses the outward velocity, so it swings (`hero.hanging` while taut; left / right pump the
  swing, nothing brakes it); `hook.reel(-1 | 1, dt)`, `hook.release()`, `hook.update()` every step before the character's (lets go when the anchor cell is gone; with `rip: n` a
  material tougher than 0 but weaker than n is torn out of the wall by a hard pull), `hook.draw()`.
- **Ghosts and echoes**: `const rec = new GhostRecorder(hero)`, `rec.step(tag)` every step, `rec.frames`; `spawnGhost(rec.frames, { anim: e => sprite, tint, loop, onEnd })` replays them as an
  entity (a ghost racer: keep the frames with `Pixelite.save`); `spawnEcho(hero, 10, { anim, tint, touches: ['hero'], onTouch })` plays your own path 10 seconds behind you (call `echo.rec.step()` every step).
- **Rewind**: `Rewind.start({ seconds: 10, every: 6, action: 'rewind' })` keeps a snapshot of the world every 6 steps (cells, back wall, entities with their plain fields and
  `Character`s, moving platforms, falling chunks); while the action is held (or `Rewind.hold(true)`) each step puts back one snapshot, about six game seconds per second, then play goes
  on from there (`Rewind.rewinding`). It copies the grid whole (350 KB for a 900 x 200 world), not as changes. Heat, particles, timers and the game's own variables are not kept: put them in entity
  fields or in `Rewind.keep = { save() → state, load(state) }`. `Rewind.stop()`.

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
| `Pixelite.test.probe()` | `{ state, frame, version, paused, errors, res, renderer, cols, rows, world, cam, particles, chunks, perfMs, perf, tune, game: GAME.probe() }` (`perf`: the stage timers, see Performance) |

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
`game.json` key (`tools/authorcheck.mjs`), and warns about `Math.random` in game code, about a call to an engine function with more arguments than it takes
and about a call to an undefined name one or two letters from an engine function (`tools/apicheck.mjs`, which also writes `engine/api.json`, every top-level
name of the engine with its kind and parameters: run `node tools/apicheck.mjs --write` after changing the engine; a unit test fails if it is stale or if a new
name is neither in this file nor listed in `engine/internal.json`).

`tests/smoke.py <id>` uses exactly this for any game. URL hash `#2d` / `#gl` forces a renderer.

## Performance: `Pixelite.perf`

`perfAvg` (and `probe().perfMs`) is the time *between* frames, so it reads 16.7 ms whether a frame took 2 ms or 16. `Pixelite.perf` is the work, in
milliseconds of main-thread time per stage, smoothed over about 25 frames (also `probe().perf`, and a box on screen: press **F3**):

| Field | Stage |
|---|---|
| `step` | one fixed step (`GAME.update` and the engine's world step; a frame runs one to three) |
| `light` | skyline, shadow marks (`GAME.markDyn`), `GAME.lights`, the sun, ambient occlusion, the lamps |
| `scene` | terrain, particles, falling chunks, rings, the tone map into bytes, the sky layer; without `gameDraw` |
| `tone` | *of which* the last pass of `scene`: every cell's tone map, vignette and bytes (and the bloom's bright pass). Not part of `draw`'s sum |
| `gameDraw` | `GAME.draw`, with the engine's props, entities and state drawing |
| `hud` | `GAME.hud`, the toast and the F3 box |
| `present` | handing the picture to WebGL or the canvas: the CPU's part only, the GPU finishes later |
| `draw` | `light + scene + gameDraw + hud + present` |

`Pixelite.perf.mean()` is the plain average since `Pixelite.perf.reset()` (a script that renders N frames reads one number per stage);
`Pixelite.perf.sync = true` reads a pixel back after presenting, so `present` then includes the wait for the picture (software GL, a slow
GPU). `tests/perf.py` runs every game at RES 2 and 3 and two screen sizes in both renderers and prints the table. Headless Chrome has no GPU,
so its `present` says little; `light`, `scene` and `step` are JavaScript and mean the same everywhere.

### Caches: lamps and still frames

Most frames of most games change little: the camera is still, the world is not being dug, the lamps do not move. Two caches skip the work that
would make the same numbers again. Both are **exact**: a frame comes out bit for bit as it did without them (`tests/engine_cache.py` plays every game
with them off, on, and on with the engine re-doing and comparing everything), so there is nothing to tune and nothing a game can see, except time.

- **The lamp cache** (`engine/04_light.js`). A lamp's cast (which cells its rays reach and how much light each gets: depends on its position, radius,
  cone, and the surfaces) is kept per lamp and added again instead of cast again; colour and intensity are applied each frame, so a flickering or pulsing
  lamp stays cached. Valid while no chunk of the world within the lamp's reach was written to (the world's revision counter) and the camera is in the same
  cell; recorded once the lamp has stood still for two frames, so a moving lamp or a moving camera costs nothing extra.
- **The still frame** (`engine/04_light.js`, `06_scene.js`). The sun, ambient and occlusion (the *base*) come back from a copy while the camera cell, the sun
  and ambient colours, the moving bodies that cast shadows and the world under the window and the sun's sweep are the same. The shaded terrain and the
  light buffers come back too while, on top of that, the lamps are the same, the back wall, the exposure, the materials and the backdrop are the
  same, nothing in the window is hot or emissive (fire, gas, sparks, particles with a `light` hook) and `setBeatPulse` is off. Particles, falling
  chunks, sprites, rings and the HUD are drawn every frame as before. The shaded terrain is not kept while the window holds crystals (`style: 'crystal'`) or
  `shiny` surfaces, which follow the clock: only the base is.

`Pixelite.cache` has the switches and counters: `lamps` and `still` (set `false` to turn one off), `hit` / `miss` / `rec` (lamps of the last frame:
served from the cache, cast, cast and recorded), `baseHit` / `terrainHit` (0 or 1: what the last frame reused), `audit` (true: do everything, compare with
what was kept) and `bad` (what the audit found). The one rule for game code: if you write `cells[]` yourself while the game runs, call `worldChanged()`.
`CACHE.audit` finds a miss (it prints a warning naming the cause); in `?dev` pages a lamp is audited now and then.

### Smaller pages: `"engine"` in game.json

A page carries the whole engine, about 350 KB of script, of which the Sampler is 57 KB, the Chip 19 KB and the isometric ground 5 KB, used or not.
`game.json` may name the optional parts the game plays with:

```json
"engine": ["sampler"]
```

The optional parts are `chip` (`08_chip.js`), `iso` (`12_iso.js`) and `sampler` (`13_sampler.js`); `engine/engine.json` lists them under `"optional"`. A part left
out is replaced, in the same place, by its stand-in in `engine/stubs/`: the engine's own calls to it (the sound starting up, the beat asking for a meter,
the studio's preview message) do nothing, and any other call (`Sampler.play`, `isoInit`, `Chip.load`) throws a message saying which name to add. Without the key
(every older game) the page carries everything, byte for byte as before; `"engine": []` is the smallest page. The beat (`Beat`, `setBeatPulse`), `b64buf` and
`noteName` are always there (`engine/08_music.js`). A new game starts from the starter, which says `"engine": []`: add `"sampler"` when it plays songs.

`node tools/pixelite.mjs build --minify` (or `PIXELITE_MINIFY=1`) goes further: it takes the comments and the indentation out of every page and nothing else (`tools/minify.mjs`).
No line is joined or removed, so every line stays where it was: the `// ----- path -----` markers, `PIXELITE_LINE0` and the error overlay's `file:line` work
unchanged, and `tests/node/smaller.test.mjs` checks the number of lines, the file of every line, that every source compiles and that the minified engine makes the
same world. The deployed site is built without it unless you ask (`npm run build:cloudflare`); it is meant for the build that goes to players.
