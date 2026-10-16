# Architecture

Glyphite renders a 2D world as a grid of character cells, each with one printable ASCII glyph
(32–126) and one RGB colour. Everything is plain JavaScript in one HTML page per game. The engine lives
in numbered parts under `engine/` (order in `engine/engine.json`); each game lives in `games/<id>/` with a
`game.json` manifest listing its parts. The build (`tools/glyphite.mjs`, using `tools/assemble.mjs`)
concatenates the engine parts and then the game's parts into one `<script>`, so all top-level
declarations share one global scope. Function declarations are hoisted, so a later part can be called
from an earlier one at run time.

The engine never reads a game's globals. Games hand it a hook object (`Glyphite.run`, section 12) and
fill its registries: materials, particle types, sprites and mounts. The public API is `engine/API.md`;
this file explains how the parts work inside. Sections 11 and 13 describe Regolith Lander, the reference
game, as an example of a full game on the engine.

---

## 1. Units, detail and time (`engine/01_core.js`)

| Name | Meaning |
|---|---|
| `ASPECT = 2` | A cell is 1 unit wide and 2 units tall. World x is in cells; world y in units is `row * ASPECT`. |
| `RES` | Detail scale, one of `DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3]` (often aliased `S`). |
| base unit | Physical sizes are authored in base units and multiplied by `RES`. At RES 1 one unit is 0.5 m. |
| `UNIT_M = 0.5 / RES` | Metres per world unit. |
| `G = GRAVITY / UNIT_M` | Gravity in units/s². `setGravity(mps2)` sets `GRAVITY` (default 1.62, the Moon); games can expose it as a tunable. |
| `DT = 1/60` | Fixed simulation step. The frame loop runs at most 3 steps per frame and drops the rest. |
| `CALM` | `prefers-reduced-motion`: weaker shake and flashes. |

A finer RES gives a bigger grid of the same world (Regolith: `WORLD_W = 560`, `WORLD_H = 150` base
cells, times RES). The renderer shrinks the cell size to match (`renderResize`: cell width ≈
`cssWidth / (150·RES)` device pixels, never under 4 px). Speeds, radii, light ranges and particle
counts all scale with RES, so a level plays the same at every detail level. Changing detail
regenerates the level (`setDetail` → the game's `regenerate` hook).

Helpers: `clamp`, `lerp`, `rr` (random range), `smooth`, `mulberry32` (seeded RNG for levels),
`hash2`, `vnoise1/2` and `fbm1/2` (value noise).

## 2. World grid and materials (`engine/01_core.js`)

The world is a set of flat typed arrays, `W × H`:
- `cells`: material id per cell.
- `heat`: 0..1+, makes rock glow and cools over time.
- `vari`: random per-cell byte for texture.
- `dyn`: 1 where a dynamic body covers the cell this frame.
- `awake`: one flag per 16×16 chunk, for the sand simulation.

`getC(x, y)` is bounds-safe: outside the sides and bottom it returns the game's edge material
(`worldMaterials({ edge })`; Regolith's bedrock), above the top it returns EMPTY. `setC` writes a cell and wakes its chunk. `solidU(xu, yu)` and `matU(xu, yu)` look up by
world units.

Materials are a registry: the game calls `defineMaterial(name, props)` at load time and gets an id
(1..255; 0 is EMPTY). Hot loops read per-id typed arrays filled from the definitions: `MAT_ALB`
(albedo), `MAT_GRAN` (falls like sand), `MAT_CREEP` (fine dust that creeps sideways), `MAT_TOUGH`
(blast resistance), `MAT_SHINY` (glints), `RAMP_CODES` (luminance glyph ramp), `MAT_FRIC`, `MAT_DENS`,
`MAT_BRITTLE`, `MAT_ANCHOR`, `MAT_STYLE`, `MAT_DEBRIS`, `MAT_SUBL`, `MAT_VAPOR`, `MAT_FUSE`/`MAT_FUSEP`,
`MAT_EJECT`, plus `MAT_GLOWS`, `MAT_PULSE` and the `blast` callback in `MATS[id]`. Engine code only ever
asks about properties, never about a particular material. `worldMaterials({ edge, rubble, fill })` names
the three world-wide roles. Regolith's materials (`games/regolith/materials.js`) keep the original ids:

| id | name | role |
|---|---|---|
| 0 EMPTY | vacuum | built into the engine |
| 1 REGO | regolith | granular; scoured by exhaust; fuses to glass at blast rims |
| 2 ROCK | basalt | |
| 3 BED | bedrock | indestructible (tough 99); an anchor for structures |
| 4 ICE | water ice | sublimates under exhaust; blasts turn it into vapour |
| 5 METAL | pad deck/posts | indestructible; an anchor |
| 6 RUBBLE | rubble | granular; flies as debris |
| 7 CRYST | He-3 crystal | glows; blasting it releases pickups |
| 8 GLASS | impact glass | |
| 9 MAST | lamp-mast steel | tough 0.8, so rockets can cut it; drawn as `| = +` by direction |

Chunk properties come from the same registry: `density` (relative) and `brittle` (steel and pad
metal are not brittle: they bend rather than chip).

The sand simulation, `simGranular()`, runs only in awake chunks. It alternates scan direction every
frame. Unsupported granular cells fall straight down or slide diagonally. Chunks fall asleep when
nothing moves.

`normalAt(xu, yu)` estimates a surface normal from occupancy in a small window.
`coolHeat` and `addHeat` manage the heat field.

## 3. Particles and blasts (`engine/02_particles.js`)

**Storage.** Particles are a struct of arrays (`P.x, y, vx, vy, age, life, rest, t, m, g, s`).
`particlesAlloc(9000·RES)` sizes it. `spawnP` creates a particle; `killP` swap-removes one.

**Types:**
- `PT_GRAIN` and `PT_DEBRIS`: flying sand and rubble. When they stop, `deposit()` writes them back
  into the grid, so no mass is lost.
- `PT_GAS`: engine exhaust.
  - Scours granular cells: the cell becomes a grain thrown along the surface normal.
  - Sublimates ice into vapour.
  - Heats what it touches.
  - Spreads along the ground on impact.
- `PT_FIRE`, `PT_SPARK`, `PT_SMOKE`, `PT_VAPOR`, `PT_DUST`: visual effects. Fire and gas get a
  little fake drag so plumes read well, even though space has no air.
- `PT_WRECK`: hot wreckage that throws sparks.
- Game-defined types from `defineParticle({ gravity, drag, bounce, friction, update, light, look })`,
  ids from `PT_CUSTOM` (16) up. Regolith's He-3 shards (`PT_PICKUP`) are one: `update` homes them in on the
  lander and collects them, `light` makes them glow, `look` animates their glyph.

**Motion.** Particles are sub-stepped so nothing passes through a cell. Collisions find the blocking
axis and bounce with restitution and friction (`bounce`).

**`explode(x, y, R, power, quiet)`.** R is in world units; callers multiply by RES. Each cell within
`1.3R` gets `strength = power·(1-d/R)·rand(0.8, 1.4) + 0.25`, with `d` noised by `vnoise2`.
- Strength ≥ `MAT_TOUGH`: the cell is carved. The material's `blast` callback decides what flies out
  if it has one (Regolith's crystal throws pickups); `vaporize` materials puff vapour; otherwise its
  ejecta (itself if granular, else the world's rubble) flies as a grain or debris.
- Rim cells (d between R and 1.3R) are heated, and materials with `fuseTo` sometimes fuse (regolith
  into glass).

It then adds a fireball, sparks, smoke, a shock ring, a light and shake, plays the boom (unless
`quiet`), runs the structure response (`blastStructures`, section 5) and last calls the game hook
`GAME.onBlast(x, y, R, power, quiet)`.

**FX state** (`FX`): `shake`, `flash` with `flashCol`, slow motion (`slow`, `slowT`), `rings`,
`lights` (short-lived point lights) and `texts` (floating world text). Helpers are `addLight`,
`addRing` and `addText`; `stepFX` ages them.

## 4. Rigid bodies (`engine/03_body.js`)

`new Body(x, y, mass, inertia, hull)`, where `hull` is a list of points `{x, y, kind}` in the body
frame (y down, origin at the centre of mass).

`step(dt)` integrates the forces `fx`, `fy` and torque `tq` plus gravity, then calls `collide()`:
- Each hull point that is inside solid, or within `SKIN = 0.3` units of it, becomes a contact.
  `normalAt` gives the normal; penetration is found by stepping out along the normal.
- 4 solver iterations. Each applies a normal impulse (restitution 0.22 for impacts faster than
  4·RES) and a Coulomb friction impulse (μ = the ground material's `friction` for feet, e.g. 0.75 on
  regolith and 0.95 on rock or metal; 0.45 for structure).
- Positional correction is shared between contacts.
- Fills `hits` (`{kind, vn, mat, x, y, nx, ny}`), `feetDown` and `bodyDown`.

Hull point kinds:
- `0` structure. A hard impact means a crash.
- `1` foot. For the lander these are the *bottom-out* points: they only touch once the leg stroke is
  used up.
- `2` strut side. A hard side hit shears the gear.

`toWorld`, `dirWorld` and `impulse` are the frame helpers.

### Characters (`Character`, same file)

Platformer movement is not a rigid body: a `Character` is an axis-aligned box (feet at `x, y`) moved cell-exactly, so it
never sinks, jitters or tips over. Each step: the jump button is remembered for `buffer` seconds and the ground for `coyote`
seconds; running accelerates toward `dir × run` (slower in the air, `air`); a jump sets `vy = -sqrt(2·g·jump)` so the height
holds whatever the gravity; letting go while rising multiplies `vy` by `cut`; falling uses `g × fallMul`. Then it moves:
- **across**, in steps of under half a cell: when the leading edge enters a new column, the topmost solid cell of that column
  within the box's rows decides. If it lies within `step` of the feet (and the character is on the ground, or falling onto a
  corner) and the box fits above it, the feet rise onto it; otherwise the move stops there.
- **down a staircase**: on the ground and not jumping, ground up to `step` below the feet pulls them down onto it.
- **up or down**, a row at a time: entering a row with anything solid under the box lands it on that row's top (or bumps its
  head on the way up). A `oneWay` cell is solid only here, and only if the feet were at or above its top before the move and
  the character isn't dropping through (`down` held on one).

Solid means any non-empty world cell, plus falling chunks (`chunkCellMat` over the chunks' cell boxes, gathered once per step).
`wall` is set while airborne with something solid beside the box above its lowest row, which is what wall slides and wall
jumps read.

## 5. Breakable structures (`engine/09_structures.js`)

### Support check
`structuralCheck(x, y, R)` flood-fills "anchored" over a region of radius `rx = 3R + 34·RES`
cells around a blast, with height `rx / 2`. The fill seeds from:
- every solid cell on the region's border, since those continue into the world;
- every cell of an `anchor` material (Regolith: bedrock and pad metal).

Support flows through any solid neighbour, regolith included.

Each remaining unanchored island goes to `breakOff`:
- All-granular islands are skipped; the sand simulation handles them.
- Islands over 2600·RES² cells are skipped, so whole hillsides stay put.
- Islands of 2 cells or fewer turn into grains.
- Everything else becomes a chunk (`makeChunk`).

### Chunks
A chunk is `{ grid, gw, gh, ox, oy, X0, Y0, n, rest, age, body }`:
- `grid` holds its own voxels; `ox, oy` is the grid's world origin.
- `X0, Y0` is the centre of mass at creation, in world units.
- Mass is Σ density × `2/(120·RES²)`, so the lander's mass is about 1. Inertia is Σ d·(r² + 5/12).
- The hull is the midpoints of exposed cell faces, capped at 180 points (`chunkHull`).
- `chunkMatAt(ch, wx, wy)` samples the rotated grid. `chunkCellMat` counts a cell as covered if
  either of its halves is inside (cells are 1×2 units), so thin rotated posts stay solid.

### Stepping (`stepChunks`)
- Two sub-steps per frame.
- An impact faster than 4.5·RES (once the chunk is at least 0.12 s old) calls `chunkImpact`: dust,
  sparks, a thud, shake. It also chips off the brittle cells nearest the contact,
  `round((vb-4.5)·1.6·RES)` of them; a hard hit (vb > 12) shatters small pieces outright.
- The game's `chunkStep(ch)` hook runs for every chunk; it calls `chunkVsBody(ch, body, onHit)`, which
  resolves contacts against the body's hull points (Regolith: a fast hit on the lander is "CRUSHED BY
  FALLING DEBRIS").
- The chunk freezes back into the grid after 0.6 s at rest (`|v| < 0.5·RES`, `|ω| < 0.25`,
  touching the grid) or at 20 s of age (`freezeChunk`). It is dropped if it leaves the world.
- Rechecks: `scheduleRecheck` re-runs the support check 0.9 s after a blast, because regolith keeps
  sliding and can undermine more.

### Blast response
- `blastChunks` bites cells within 0.75R out of existing chunks.
- `blastPush` pushes a chunk per cell face. Only faces with no neighbour on the blast side are
  pushed, along their own normals. Top and bottom faces get half weight because they are half the
  size of the sides. The result is added to the chunk's velocity (capped at 24·RES) and spin
  (clamped to ±2.4 rad/s).
- For projectiles, the game calls `blastFrom(vx, vy)` before `explode`, which puts the push centre 0.8R
  *behind* the impact along the flight path. That is why a rocket topples a post away from the shooter.
- `blastStructures` (called by `explode`) runs all of this; `STRUCTURES = false` turns it off.

### Mounts
Game objects fixed to a cell register with `addMount(obj)` (`obj.mount` = the cell index). When that cell
breaks off, the engine sets `obj.chunk` and calls the object's handlers: `onRide(ch)` (store the pose
relative to the chunk), `onMove(ch)` every step, `onImpact(ch, vb, x, y)`, `onLand(ch, placedCells)` when it
freezes, `onLost(ch)` if it crumbles or leaves the world. Regolith's lamps (`games/regolith/lamps.js`):
- A lamp keeps its position and direction relative to the chunk.
- It shatters only if an impact near its own end exceeds 9 base units/s.
- When the chunk freezes, the lamp re-mounts on the nearest frozen cell within 3·RES, or dies.

### Level settling (`settleIslands`)
Called during level generation:
1. Flood from the bottom row and all anchors.
2. Drop each floating island straight down by its smallest gap, lowest island first. Gaps that lead
   to the island's own lower parts are ignored. Repeat up to 12 passes.
3. Give anything still floating a column of the fill material (Regolith: basalt) down to rock.
4. `onDrop` lets the game move objects riding a dropped island (Regolith: lamps and crystals).

## 6. Lighting (`engine/04_light.js`)

Lighting is computed every frame for the visible window plus a margin (`LMX`, `LMY`). The output is
per-cell RGB light in `LR, LG, LB`, plus:
- `LSURF`: 0 empty, 1 buried solid, 2 surface solid.
- `LNX, LNY`: surface normals.
- `LSUN`: sunlit or not.
- `LAO, LAOD`: ambient occlusion at two radii.

Steps in `computeLighting(ox, oy, lights, dynTop)`:
1. **Occupancy** `LOCC` from terrain only, then a summed-area table `LSAT`. Box sums give AO at two
   radii and normals.
2. **Sun** (`sunSweep`) is exact and has no air, so shadows are hard.
   - Every sun ray is a line `y = b + k·x` in rows. Rays are indexed by their intercept `b` at
     half-row spacing (`rayBuf`).
   - Walking columns left to right, each solid cell marks the rays that cross it as blocked: 1 means
     terrain, 2 means only a dynamic body.
   - Dynamic cells (lander, boulders, chunks) stay lit behind each other but still cast shadows.
   - `SUN_L` is the direction sunlight travels; `setSun(elevationDeg)` sets it (Regolith per site) and
     `setSun(null)` turns the sun off (caves). Colours: `SUN_C` (the sun: a base colour `SUN_BASE`, dimmed per channel
     by `exp(-AIR_TAU × ATMOS × (airmass(elevation) - 1))` when `setAtmosphere` > 0 and the colour is not pinned; the base
     can come from `kelvinColor`), `AMB_C = [.095, .115, .17]` (`setAmbient`).
3. **Shading:**
   - Empty cells get `AMB·0.7 + sun`.
   - Surface cells get ambient × (0.55 + 2·AO) plus sun × (0.12 + 0.88·N·L).
   - Buried cells get a little light from nearby sunlit cells (sun-soak table `LSSAT`, about 1.3 m
     deep at any RES).
4. **Point and cone lights** (`addPointLight`):
   - Rays leave the light about every 0.6 units of arc at its edge. Each cell is lit once per light,
     using a stamp generation.
   - Falloff is `(1-d/r)²` for point lights and `(1-(d/r)²)²` for cones. Cone edges are softened
     with `smooth`, and surfaces get a Lambert term.
   - A ray that hits ground soaks `2.6·RES` units into it, so lit pools read as a band.
   - `skip` keeps a light from shadowing itself.
5. **Flash:** a global flash adds `FX.flash`.

`splatLight` adds cheap, unshadowed glow for emissive things: hot rock, fire, crystals, pickups.

**Visibility queries** (`sunAt`, `isLitBy`, same file) march straight lines through `cells` with the lighting's own
conventions (step 0.6, sun rays that start left of the world or above it are clear, a light's `skip`), so a game can ask
about any point without reading the lit window. They ignore moving bodies; the lit window and `lightAtCell` still include them.

## 7. Rendering

### Grids and layers (`engine/05_render.js`)
There are three grids:

| Grid | Contents | Scrolling |
|---|---|---|
| **Sky** (`R.sG`, `R.sPix`) | stars and the game's sky bodies (Regolith's Earth) | its own sub-cell offset `R.skyFX/FY`, drifting at `SKY_PAR = 0.05` of the camera |
| **World** (`R.wG`, `R.wPix`, size `RW × RH` = screen + 1 margin cell each side) | terrain, particles, objects | the camera's sub-cell offset; `ox, oy = floor(cam) - 1` |
| **HUD** (`R.hG`, `R.hC`) | text | fixed; coarser cells (`R.hcw`) so text is readable at any detail level |

World glyph codes:
- **0** is transparent: the sky shows through.
- **32** is an opaque blank: it hides the sky.
- **33–126** are visible glyphs.

HUD cells with code 255 are an opaque box background.

**WebGL path.** One full-screen triangle. The fragment shader works per pixel:
1. If a HUD cell is there, draw it.
2. Otherwise sample the world grid at `pixel - uOff`. If the world glyph is 0, sample the sky grid
   at `pixel - uSkyOff`.
3. Draw the glyph from the atlas: a 16×6 grid of the 95 glyphs, rendered with JetBrains Mono or the
   monospace fallback.
4. Add optional bloom from a separate bright-pass texture. Heat shimmer offsets glyphs sideways via
   the `uShim` texture.

The sky texture is uploaded only when it changes. If the renderer string matches
SwiftShader, llvmpipe and similar, WebGL is dropped for 2D unless `#gl` forces it.

**2D path.** Each grid is a "grid layer":
1. A one-pixel-per-cell colour canvas is scaled up, then cut out by a glyph mask canvas.
2. The world layer gets an occupancy background, so occupied cells hide the sky.
3. The sky layer is composed only when dirty.
4. Draw order: sky, then world, then the HUD, drawn with tinted atlases.

`presentFrame(fracX, fracY, t)` computes both pixel offsets plus screen shake and calls the active
path.

### Scene shading (`engine/06_scene.js`)
`renderScene(ox, oy, time, drawExtras)` runs in order:
1. Emissive particles, hot rock and crystals splat light.
2. Terrain cells. An empty cell with a back-wall material behind it (`backCells`) draws that material instead of staying
   transparent: albedo × the light in the air there × `BACK.dim`, darkened when a world cell lies a short way toward the
   light (`BACK.dir`, `BACK.depth`: a drop shadow that makes rooms look like rooms), with `Z = 0` so particles and rings
   still draw over it. Its glyph is never 0, so the sky stays hidden behind it. A filled cell: colour = albedo × light
   (buried cells have a floor), plus texture variation, plus
   heat glow. The glyph depends on the surface:
   - normal facing up → luminance ramp;
   - normal facing down → `~`;
   - vertical → `|`;
   - slopes → `/` or `\`.
   - Material styles (`style` in the registry):
     - `deck` (Regolith's pad metal): `= -` deck, `# H` body.
     - `mast` (lamp masts): `| = +` by its neighbours; buried footings draw as the ground around them.
     - `crystal`: animated `* +` with a colour `pulse`.
     - `flat` (ice): always the ramp, no slope glyphs.
     - Shiny glints: `*`.
3. Particles, lit by the light buffers and z-tested by luminance against the terrain.
4. Falling chunks (`drawChunks`), then game objects through the game's `draw` hook, which writes with
   `putEmit` (fixed colour), `putLit` (albedo × light) or `drawSprite`.
5. Shock rings.
6. Tone map `tone(c × E) = 1 - exp(-1.7·c·E)` and vignette into bytes, plus the bloom bright-pass. `E` is the exposure of
   the eye adaptation (`adaptEye`): the geometric mean luminance of the visible cells is measured *before* the tone map (so
   exposure cannot feed back into its own measurement) and `EYE.e` eases toward `key / mean` (to the power of the strength,
   clamped), faster down than up. Then `renderSky(time)` rebuilds the sky layer when needed.

The sky has stars from a hash (density `GAME.stars`) and whatever the game paints through
`GAME.skyBegin` / `GAME.sky`. Regolith paints the Earth: an ellipse, lit from the same sun, with
continents and clouds from fbm noise, turning slowly; its night side hides the stars behind it.

The sky layer is rebuilt when it has scrolled a whole cell, once a second, when the quantised exposure changes, and, when
something needs it, about 5-8 times a second: stars twinkle (an atmosphere: a per-star sine) and are dimmed by *light
pollution* (the frame's light minus sun and ambient, from `LR/LG/LB` at the same screen cell; `GAME.starGlare`). A rebuild
costs about 1 ms at RES 2.

## 8. Sprites (`engine/10_sprite.js`)

Pixel art becomes a palette-indexed grid; see the `glyphite-pixel-art-to-ascii` skill and
`tools/sprite2ascii.py`. `defineSprite(data, { k, ox, oy, part, paint })` prepares it and
`drawSprite(spr, x, y, a, { shift, foot, light })` draws it as ASCII (Regolith's lander:
`games/regolith/lander_art.js`):

1. **Pin to the grid.** x is pinned to whole cells. Vertically, the `foot` line (the lander's footpad
   soles) snaps to a row boundary.
2. **Sample.** For each cell in the bounding box, take 3×6 samples in the body frame (rotated). Parts
   (the lander's legs) are sampled where they were before their `shift` (sliding up their struts by
   the damper compression). `spritePixel` returns the sprite pixel or −1.
3. **Classify the cell.**
   - Fewer than 4 samples occupied: leave the cell empty.
   - Fewer than 3 paint samples: draw an opaque blank (silhouette outline).
   - Panel line filling over 60% of a solid cell: opaque blank.
4. **Colour.** 65% the cell's main paint plus 35% the average. The palette is linearised through
   the inverse tone curve. Light factor `0.75 + 0.4·min(1.3, sceneLight)`.
5. **Glyph.**
   - 10 or more of 18 samples painted: the palette entry's dense glyph (the lander: `%` foil; `@`
     window and bright metal; `#` other metal).
   - Otherwise: the symbol whose 3×6 coverage mask, rendered from the game font, best matches the
     samples (least squares).

`markSpriteDyn` marks the covered cells for shadows; `spriteHull` gives collision points from the
silhouette. Cost for the lander: about 0.5 ms (RES 1) to 1.6 ms (RES 3) per frame in headless Chromium.

Physics geometry is derived from the same sprite at 0.28 base units per pixel, origin at pixel
(24, 28). `LEG0 = { ax: 3.92, ay: 1.96, fx: 5.46, fy: 6.16, stroke: 1.5, pad: 1.26, k: 4.3, c: 2.2 }`.
The hull points (`LANDER_HULL0`) are traced from the silhouette.

## 9. Audio (`engine/07_audio_input.js`, `engine/08_chip.js`)

**Sfx** (`07_audio_input.js`): procedural Web Audio effects.
- `engine(throttle)` is a filtered noise loop.
- One-shots: `boom`, `launch`, `thud`, `pickup`, `alarm`, `win`.
- M mutes. Audio is suspended while the page is hidden.
- `Sfx.heard(x, y)`: sound through air. A vacuum returns `HEARD_NOW` (no delay, full volume, unfiltered): sound is felt
  through the ground, as always. With `setAtmosphere` > 0 it returns `{ delay: m / 343, gain: 1 / (1 + m / 120), muffle:
  max(.2, 1 / (1 + m / 250)), m }` for the distance in metres to the listener (`GAME.listener()` or the camera centre).
  `burst(..., at)` starts the burst `at.delay` later (on the audio clock, so it is sample-accurate), scales its volume by
  `at.gain` and its filter frequencies by `at.muffle`. `explode()` passes `Sfx.heard(x, y)` to `boom`, which adds a long low
  rumble when `at.m > 100`.

**Chip** (`07b_chip.js`): the NES 2A03-style synth.
- Pulse lanes with 12.5/25/50/75% duty, 4-bit volume and 11-bit period quantisation. A 32-step
  triangle. 15-bit LFSR noise with long and short modes and 16 periods.
- Mixed through the non-linear DAC curves, then a 37 Hz high-pass and 14 kHz low-pass.
- `parseMidi` reads format 0 and 1 files with a tempo map, program changes, CCs and pitch bend.
- Each MIDI channel gets a lane (`chipLane`) whose voice comes from the GM program
  (`chipInstrument`). Chords are arpeggiated at 60 Hz. Channel 10 maps to noise drums (`chipDrum`).
- Rendering: blocks of 2048 samples are scheduled 0.16 s ahead (1024 samples and 0.07 s once MIDI
  IN is connected).
- API: `Chip.init`, `load(buf)`, `play(song, {loop, fadeIn, onEnd})`, `stop`, `setVolume`, `halt`,
  `connectMidi`, `meter()` for UI meters and beat, `beatAt`.

**Beat** (end of `engine/08_chip.js`): `Beat.step(time)` runs once a frame at the top of `renderScene`. It reads
`Chip.meter()` (the snapshot that matches what the listener hears now) and fires `Beat.v` on a rising edge of the drum
level (at least 7 and 4 higher than the last frame: kicks, snares and crashes, not most hi-hats), then decays it with a
0.16 s time constant. `setBeatPulse(k)` scales it into `Beat.pulse()`, which the scene uses three ways: scattered glow
splats of materials with `beatGlow` are brightened, those materials flash in their own colour (added to the cell colour
before the glyph is chosen), and the bloom bright-pass threshold drops (0.62 → 0.52) while its gain rises (×2.2).
`Beat.blink` replaces the per-game "beacons follow the music" logic (Regolith's old `beaconOn`).

**Music director** (Regolith's `games/regolith/music.js`): picks the piece by game state (title, descent loop, touchdown
jingle, loss jingle). It handles MIDI file loading, drag-and-drop and MIDI IN, and draws the chip
meters panel.

Songs are base64 MIDI in `games/regolith/songs.js` (decoded with the engine's `b64buf`), generated by
`games/regolith/tools/compose.py`. The music is also kept as `.mid` files in `games/regolith/music/`.

## 10. Input (`engine/07_audio_input.js`)

`Input.keys` (a Set of `KeyboardEvent.code`), `Input.pressed` (taps), `Input.aim` / `mouseAim()`
(the normalised cursor, used for 6 s after the mouse last moved), `Input.fireQueued`, and
`Input.touch.<name>` from the on-screen buttons the game declares in `GAME.touch` (hold buttons set a
flag while held; tap buttons act like a tap). `keyDown(...codes)` checks keys. One-shot keys go to the
engine's built-in keys first (- + detail, G bloom, M sound, P/Esc pause), then to the game's `onKey`.

## 11. The reference game: Regolith Lander (`games/regolith/`)

**Sites** (`level.js`): eight sites (`SITES`) with sun elevation and ice amount. `genLevel(lv)`:
1. Builds a heightfield from fbm, with craters (bowl and rim) and mesas from tier 2.
2. Places pads: x1 wide, x2 narrow, x3 from tier 2.
3. Fills voxels: regolith over basalt over bedrock, with rubble pockets.
4. Cuts worm-tunnel caves from tier 3, kept away from pads and the x3 roof.
5. Builds pad decks and posts (METAL), then the x3 roof and its rock pillar with a footing.
6. Adds lamp masts with footings, pad lamps, roof lamps and survey lamps.
7. Places He-3 crystal veins.
8. Settles the regolith for 40·RES steps, runs `settleIslands`, settles again for 12·RES steps and
   runs `settleIslands` again.
9. Adds ice in permanently shadowed regolith.
10. Spawns boulders.

`LEVEL` holds pads, lamps, crystals, the spawn point, fuel and burn rate, rockets, and the meteor
rate.

**Lander** (`lander.js`):
- Descent engine at about 2.7 lunar g. RCS works as rate command while held and attitude hold
  otherwise.
- Fuel; rockets that accelerate for 1.2 s and recoil.
- Spring-damper legs (`legForces`), run twice per frame in half steps, then `evalContacts`.

`evalContacts` outcomes:
- Crashes: structure impacts over 2.6 base units/s, strut-side hits over 5.5, bottom-out over 2.4,
  tipping past 1.2 rad.
- Touchdown dust and regolith displacement.
- "HARD LANDING" past 85% of the stroke.
- Settled on a pad for 0.7 s → `landOnPad`: score = 50·mult + 2·fuel·mult, plus a soft bonus
  (100·mult under 1 m/s, 40·mult under 2 m/s).
- Settled off a pad: "OFF-SITE".
- Out of fuel: "STRANDED".

Other objects:
- **Meteoroids:** showers from tier 2. Hits explode.
- **Boulders** (`boulders.js`): round bodies that roll, are pushed by blasts and can crush the
  lander.

**View** (`view.js`):
- `markDyn` marks dynamic occluders (boulders and the lander; the engine marks chunks).
- `regolithLights` collects the engine glow, floodlight, landing lights, rockets, meteors, pad beacons
  (which blink to the music's beat), crystals and lamps (the engine adds effect lights).
- `drawWorld` draws beacons, lamp heads (rotated on a falling post), boulders, rockets, meteors, the
  lander and the aim line (the engine draws the chunks first).
- HUD:
  - The status line.
  - Caution lamps: ALT, VEL, ATT, FUEL, CONTACT, 1202 (slow frames), METEOR.
  - Off-screen pad arrows, the controls hint, toasts.
  - Message boxes for landed and crashed.
  - The title screen with the logo and the DETAIL / LOAD MIDI / MIDI IN buttons.
  - The chip meters.

**Game logic** (`main.js`): states `title`, `play`, `paused`, `landed`, `crashed`. `regolithUpdate(dt)`
handles input taps, lander control, legs and body half-steps, boulders, lamps, rockets and meteors; the
engine then steps chunks, particles, sand, heat and effects. The camera hook drifts over the landscape
on the title screen and leads the lander in flight. `afterFrame` runs the music director.

## 12. Runtime: loop, camera, detail, boot (`engine/11_loop.js`)

`Glyphite.run(game)` stores the hook object as `GAME` and boots:
- `boot()`: renderer, resize observer, detail (hot-reload data, `localStorage` `<id>.detail`, or screen
  width), input and touch buttons, `#detailBtn` if the page has one, `GAME.init(data)`, the font
  reload, and the `window.claude.hot` snapshot (hot reload in claude.ai artifacts; harmless elsewhere).
- `update(dt)` (global, so tests can step it and freeze it): `frameNo`, `stateT`, `GAME.update`, clear
  `Input.pressed`, `stepWorld` (chunks, particles, sand, heat near the camera, effects), camera.
- `draw(t)`: skyline, dynamic marks (`markChunksDyn` + `GAME.markDyn`), lighting (`GAME.lights` + effect
  lights), scene, HUD (`GAME.hud` + toast), present, `#titleBar` visibility, `GAME.afterFrame`.
- `frame()` runs the fixed-step accumulator (at most 3 steps per frame) with slow motion and the
  slow-device hint.
- `updateCamera` asks `GAME.camera` for a target, clamps it to the world (and `cameraTop` above it) and
  smooths it.
- `setDetail(r)` resets RES, the particle budget and the renderer, then calls `GAME.regenerate`.
- `state` / `stateT` / `setState`: the game's state machine lives in engine globals; `'paused'` stops
  time and `'title'` shows the title bar.
- **Tunables** (`TUNE`): loaded from the manifest's tunables (the build embeds `GAME_MANIFEST`), then
  overridden by `window.GLYPHITE_TUNE` and `?tune=` in the URL; `glyphite:tune` messages from the parent
  page (the editor) change them live and call `GAME.onTune`.
- `Glyphite.test`: `start`, `step(n, keys)`, `press`, `freeze`/`unfreeze`, `render`, `probe`.

## 13. Build, site and deployment

`node tools/glyphite.mjs build` (also `npm run build`):
1. Reads `engine/engine.json` and every `games/*/game.json` (and `templates/*`, built unlisted so they
   stay tested), and validates the manifests.
2. Refuses game top-level names that repeat an engine name (the shared scope would let a game
   `function` silently replace the engine's).
3. Assembles each page with `tools/assemble.mjs`: `engine/shell.html` (a complete HTML document: styles,
   canvas, `#touch`, the game's `head.html` inside `#stage`) around one script = `GAME_MANIFEST`, the
   engine parts and the game parts, each after a `// ----- path -----` marker. `lineMap` turns a page
   line back into a source file and line.
4. Syntax-checks each script with `vm.Script` and reports errors against the source file.
5. Writes the site to `dist/`: the portal (`portal/`), `games/<id>/index.html` + `game.json` +
   `thumb.png`, `src/` (engine and game sources for the editor), `assets/assemble.mjs`, `games.json`
   (the listing, with each game's last git change date), `ideas/ideas.json` (the idea bank) and `changes.json`
   (`tools/changes.mjs`: the numbered sections of `docs/HISTORY.md` — the request quoted, what was done — plus the
   merged pull requests read from `git log --first-parent`, best effort, for the What's new page).

The page uses CSS tokens (`--void`, `--phosphor`, `--amber`...), JetBrains Mono from Google Fonts
with fallbacks, and a `[hidden]{display:none!important}` guard. The canvas has an `aria-label`
describing the controls.

**Portal** (`portal/`): `index.html` lists the games from `games.json`. `edit/` is the editor: it loads
the sources from `src/`, keeps edits as drafts in `localStorage`, rebuilds the preview in the browser with
the same `assemble.mjs` (an `iframe` `srcdoc`, with an error reporter injected on the `<head>` line so
line numbers still map), sends live tunable changes with `postMessage`, and turns edits into a prompt plus
a unified diff (`assets/diff.mjs`) for a Claude Code session. CodeMirror 5 is vendored in
`portal/vendor/codemirror/`. `ideas/` is the idea bank page and `whats-new/` the changelog page. The game list marks a
game **updated** when its last-change date (`games.json`) is newer than the one remembered for it in `localStorage`
(remembered the first time it is seen and again when it is opened, so a new visitor sees no badges), and the What's new button
says **new** until that page has been opened for the latest section.

**The 404 game** (`games/notfound/`, unlisted): for a `GET` that asks for `text/html` and finds nothing (and is not under
`/api/`), `worker/index.js` serves `/games/notfound/` with status 404 and `no-store`; files and API calls get a plain 404.
The page reads `location.pathname` (or `?path=` for tests), keeps printable ASCII and the last 11 characters when it is long,
draws it with the browser's font into a small canvas and builds each lit pixel as a block of `slab` rock (a pixel is 2k cells
wide and k rows tall, k = round(RES), so it stays square) standing on the ground. A lander (a point mass with a 5 x 2 cell
footprint, a few seconds of fuel) drops from the top; touching anything above 1.4 m/s calls the engine's `explode()` and the
letters break like any other terrain.

**Worker** (`worker/`, `wrangler.jsonc`): a Cloudflare Worker with static assets serving `dist/` on the
custom domain glyphite.hornbaek.org, with `run_worker_first` so every request passes `authenticate`
(`worker/auth.js`): it verifies the Cloudflare Access JWT (team domain, AUD tag, optional allowed emails) and fails
closed when unconfigured. Cloudflare Workers Builds deploys `main`; GitHub Actions checks pull requests
(`docs/DEPLOY.md`, `.github/workflows/ci.yml`).
