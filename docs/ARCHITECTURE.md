# Architecture

Glyphite renders a 2D world as a grid of character cells, each with one printable ASCII glyph
(32–126) and one RGB colour. Everything is plain JavaScript in one HTML page. The source lives in
numbered parts under `src/`. `build.sh` concatenates them in order into one `<script>`, so all
top-level declarations share one global scope. Function declarations are hoisted, so a later part
can be called from an earlier one at run time.

Below, "engine" means code meant to be reusable, and "game" means Regolith Lander. Today the two
still share globals such as `L` (the lander), `LEVEL`, `state` and `cam`. See `ROADMAP.md`.

---

## 1. Units, detail and time (`01_core.js`)

| Name | Meaning |
|---|---|
| `ASPECT = 2` | A cell is 1 unit wide and 2 units tall. World x is in cells; world y in units is `row * ASPECT`. |
| `RES` | Detail scale, one of `DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3]` (often aliased `S`). |
| base unit | Physical sizes are authored in base units and multiplied by `RES`. At RES 1 one unit is 0.5 m. |
| `UNIT_M = 0.5 / RES` | Metres per world unit. |
| `G = 1.62 / UNIT_M` | Lunar gravity in units/s². |
| `DT = 1/60` | Fixed simulation step. The frame loop runs at most 3 steps per frame and drops the rest. |
| `CALM` | `prefers-reduced-motion`: weaker shake and flashes. |

A finer RES gives a bigger grid of the same world: `WORLD_W = 560`, `WORLD_H = 150` base cells,
times RES. The renderer shrinks the cell size to match (`renderResize`: cell width ≈
`cssWidth / (150·RES)` device pixels, never under 4 px). Speeds, radii, light ranges and particle
counts all scale with RES, so a level plays the same at every detail level. Changing detail
regenerates the level (`setDetail`).

Helpers: `clamp`, `lerp`, `rr` (random range), `smooth`, `mulberry32` (seeded RNG for levels),
`hash2`, `vnoise1/2` and `fbm1/2` (value noise).

## 2. World grid and materials (`01_core.js`)

The world is a set of flat typed arrays, `W × H`:
- `cells`: material id per cell.
- `heat`: 0..1+, makes rock glow and cools over time.
- `vari`: random per-cell byte for texture.
- `dyn`: 1 where a dynamic body covers the cell this frame.
- `awake`: one flag per 16×16 chunk, for the sand simulation.

`getC(x, y)` is bounds-safe: outside the sides and bottom it returns BED, above the top it returns
EMPTY. `setC` writes a cell and wakes its chunk. `solidU(xu, yu)` and `matU(xu, yu)` look up by
world units.

Material ids are constants. Properties live in parallel arrays indexed by id: `MAT_NAME`, `MAT_ALB`
(albedo), `MAT_GRAN` (falls like sand), `MAT_TOUGH` (blast resistance), `MAT_SHINY` (chance of
sparkle glints) and `MAT_RAMP` (luminance glyph ramp).

| id | name | role |
|---|---|---|
| 0 EMPTY | vacuum | |
| 1 REGO | regolith | granular; scoured by exhaust; fuses to glass at blast rims |
| 2 ROCK | basalt | |
| 3 BED | bedrock | indestructible (tough 99); an anchor for structures |
| 4 ICE | water ice | sublimates under exhaust; blasts turn it into vapour |
| 5 METAL | pad deck/posts | indestructible; an anchor |
| 6 RUBBLE | rubble | granular; flies as debris |
| 7 CRYST | He-3 crystal | glows; blasting it releases pickups |
| 8 GLASS | impact glass | |
| 9 MAST | lamp-mast steel | tough 0.8, so rockets can cut it; drawn as `| = +` by direction |

Chunk-only properties (`09c_chunks.js`): `CHUNK_DENS` (relative density) and `CHUNK_BRITTLE`
(steel and pad metal bend rather than chip).

The sand simulation, `simGranular()`, runs only in awake chunks. It alternates scan direction every
frame. Unsupported granular cells fall straight down or slide diagonally. Chunks fall asleep when
nothing moves.

`normalAt(xu, yu)` estimates a surface normal from occupancy in a small window.
`coolHeat` and `addHeat` manage the heat field.

## 3. Particles and blasts (`02_particles.js`)

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
- `PT_PICKUP`: a crystal shard. The game hook `PICKUP_PULL` pulls it toward the lander.
- `PT_WRECK`: hot lander wreckage that throws sparks.

**Motion.** Particles are sub-stepped so nothing passes through a cell. Collisions find the blocking
axis and bounce with restitution and friction (`bounce`).

**`explode(x, y, R, power, quiet)`.** R is in world units; callers multiply by RES. Each cell within
`1.3R` gets `strength = power·(1-d/R)·rand(0.8, 1.4) + 0.25`, with `d` noised by `vnoise2`.
- Strength ≥ `MAT_TOUGH`: the cell is carved. Its material flies as a grain or debris, a vapour
  puff for ice, or occasionally a pickup for crystal.
- Rim cells (d between R and 1.3R) are heated, and regolith rims sometimes fuse into glass.

It then adds a fireball, sparks, smoke, a shock ring, a light, shake and slow motion. Last, it calls
the game hook `onBlast(x, y, R, power, quiet)`.

**FX state** (`FX`): `shake`, `flash` with `flashCol`, slow motion (`slow`, `slowT`), `rings`,
`lights` (short-lived point lights) and `texts` (floating world text). Helpers are `addLight`,
`addRing` and `addText`; `stepFX` ages them.

## 4. Rigid bodies (`03_body.js`)

`new Body(x, y, mass, inertia, hull)`, where `hull` is a list of points `{x, y, kind}` in the body
frame (y down, origin at the centre of mass).

`step(dt)` integrates the forces `fx`, `fy` and torque `tq` plus gravity, then calls `collide()`:
- Each hull point that is inside solid, or within `SKIN = 0.3` units of it, becomes a contact.
  `normalAt` gives the normal; penetration is found by stepping out along the normal.
- 4 solver iterations. Each applies a normal impulse (restitution 0.22 for impacts faster than
  4·RES) and a Coulomb friction impulse (μ 0.75 for feet on regolith, 0.95 on rock or metal, 0.45
  for structure).
- Positional correction is shared between contacts.
- Fills `hits` (`{kind, vn, mat, x, y, nx, ny}`), `feetDown` and `bodyDown`.

Hull point kinds:
- `0` structure. A hard impact means a crash.
- `1` foot. For the lander these are the *bottom-out* points: they only touch once the leg stroke is
  used up.
- `2` strut side. A hard side hit shears the gear.

`toWorld`, `dirWorld` and `impulse` are the frame helpers.

## 5. Breakable structures (`09c_chunks.js`)

### Support check
`structuralCheck(x, y, R)` flood-fills "anchored" over a region of radius `rx = 3R + 34·RES`
cells around a blast, with height `rx / 2`. The fill seeds from:
- every solid cell on the region's border, since those continue into the world;
- every BED or METAL cell.

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
- `chunkVsLander` resolves contacts against the lander's hull points. A fast hit is a crash:
  "CRUSHED BY FALLING DEBRIS".
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
- For projectiles, the game passes a push centre 0.8R *behind* the impact along the flight path
  (`blastFrom`). That is why a rocket topples a post away from the shooter.

### Game hooks
`onChunkBorn`, `onChunkMoved`, `onChunkImpact`, `onChunkFrozen` and `onChunkGone` manage lamps
riding on chunks:
- A lamp keeps its position and direction relative to the chunk.
- It shatters only if an impact near its own end exceeds 9 base units/s.
- When the chunk freezes, the lamp re-mounts on the nearest frozen cell within 3·RES, or dies.

### Level settling (`settleIslands`)
Called during level generation:
1. Flood from the bottom row and all anchors.
2. Drop each floating island straight down by its smallest gap, lowest island first. Gaps that lead
   to the island's own lower parts are ignored. Repeat up to 12 passes.
3. Give anything still floating a basalt column down to rock.
4. `onDrop` moves lamps and crystals that were riding a dropped island.

## 6. Lighting (`04_light.js`)

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
   - `SUN_L` is the direction sunlight travels; levels set the elevation per site. Colours:
     `SUN_C = [1.15, 1.1, 1.0]`, `AMB_C = [.095, .115, .17]`.
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

## 7. Rendering

### Grids and layers (`05_render_base.js`)
There are three grids:

| Grid | Contents | Scrolling |
|---|---|---|
| **Sky** (`R.sG`, `R.sPix`) | stars and the Earth | its own sub-cell offset `R.skyFX/FY`, drifting at `SKY_PAR = 0.05` of the camera |
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

### Scene shading (`06_render_scene.js`)
`renderScene(ox, oy, time, drawExtras)` runs in order:
1. Emissive particles, hot rock and crystals splat light.
2. Terrain cells. Colour = albedo × light (buried cells have a floor), plus texture variation, plus
   heat glow. The glyph depends on the surface:
   - normal facing up → luminance ramp;
   - normal facing down → `~`;
   - vertical → `|`;
   - slopes → `/` or `\`.
   - Material styles:
     - METAL: `= -` deck, `# H` body.
     - MAST: `| = +` by its neighbours.
     - CRYST: animated `* +`.
     - Shiny glints: `*`.
   - Buried mast footings draw as the ground around them.
3. Particles, lit by the light buffers and z-tested by luminance against the terrain.
4. Game objects through the `drawExtras` callback, which writes with `putEmit` (fixed colour) or
   `putLit` (albedo × light).
5. Shock rings.
6. Tone map `tone(c) = 1 - exp(-1.7c)` and vignette into bytes, plus the bloom bright-pass. Then
   `renderSky(time)` rebuilds the sky layer when needed.

The sky has stars from a hash and the Earth: an ellipse, lit from the same sun, with continents and
clouds from fbm noise. It turns slowly.

## 8. Sprites (`10a_lander_*.js`, currently lander-specific)

Pixel art becomes a palette-indexed grid; see the `glyphite-pixel-art-to-ascii` skill and
`tools/sprite2ascii.py`. `drawLanderArt(b)` draws it as ASCII:

1. **Pin to the grid.** x is pinned to whole cells. Vertically, the footpad soles snap to a row
   boundary.
2. **Sample.** For each cell in the bounding box, take 3×6 samples in the body frame (rotated). Legs
   are sampled where they were before sliding up their struts by the damper compression.
   `lmPixel` returns the sprite pixel or −1.
3. **Classify the cell.**
   - Fewer than 4 samples occupied: leave the cell empty.
   - Fewer than 3 paint samples: draw an opaque blank (silhouette outline).
   - Panel line filling over 60% of a solid cell: opaque blank.
4. **Colour.** 65% the cell's main paint plus 35% the average. The palette is linearised through
   the inverse tone curve. Light factor `0.75 + 0.4·min(1.3, sceneLight)`.
5. **Glyph.**
   - 10 or more of 18 samples painted: the material's dense glyph (`%` foil; `@` window and bright
     metal; `#` other metal).
   - Otherwise: the symbol whose 3×6 coverage mask, rendered from the game font, best matches the
     samples (least squares).

`markLanderDyn` marks the covered cells for shadows. Cost: about 0.5 ms (RES 1) to 1.6 ms (RES 3)
per frame in headless Chromium.

Physics geometry is derived from the same sprite at 0.28 base units per pixel, origin at pixel
(24, 28). `LEG0 = { ax: 3.92, ay: 1.96, fx: 5.46, fy: 6.16, stroke: 1.5, pad: 1.26, k: 4.3, c: 2.2 }`.
The hull points (`LANDER_HULL0`) are traced from the silhouette.

## 9. Audio

**Sfx** (`07_audio_input.js`): procedural Web Audio effects.
- `engine(throttle)` is a filtered noise loop.
- One-shots: `boom`, `launch`, `thud`, `pickup`, `alarm`, `win`.
- M mutes. Audio is suspended while the page is hidden.

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

**Music director** (`10b_music.js`): picks the piece by game state (title, descent loop, touchdown
jingle, loss jingle). It handles MIDI file loading, drag-and-drop and MIDI IN, and draws the chip
meters panel.

Songs are base64 MIDI in `07c_songs.js`, generated by `tools/compose.py`. The music is also kept as
`.mid` files in `music/`.

## 10. Input (`07_audio_input.js`)

`Input.keys` (a Set of `KeyboardEvent.code`), `Input.pressed` (taps), `Input.aim` / `mouseAim()`
(the normalised cursor, used for 6 s after the mouse last moved), `Input.fireQueued`, and
`Input.touch.{left, right, thrust}` from the on-screen buttons. `keyDown(...codes)` checks keys.
The game's `onKey(code)` handles one-shot keys.

## 11. The game layer (Regolith Lander)

**Sites** (`08_level.js`): eight sites (`SITES`) with sun elevation and ice amount. `genLevel(lv)`:
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

**Lander** (`09_game_sim.js`):
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
- **Boulders** (`09b_boulders.js`): round bodies that roll, are pushed by blasts and can crush the
  lander.

**View** (`10_game_view.js`):
- `markDyn` marks dynamic occluders.
- `gatherLights` collects the engine glow, floodlight, landing lights, rockets, meteors, pad beacons
  (which blink to the music's beat), crystals, lamps and FX lights.
- `drawExtras` draws beacons, lamp heads (rotated on a falling post), chunks, boulders, rockets,
  meteors, the lander and the aim line.
- HUD:
  - The status line.
  - Caution lamps: ALT, VEL, ATT, FUEL, CONTACT, 1202 (slow frames), METEOR.
  - Off-screen pad arrows, the controls hint, toasts.
  - Message boxes for landed and crashed.
  - The title screen with the logo and the DETAIL / LOAD MIDI / MIDI IN buttons.
  - The chip meters.

**Loop** (`11_main.js`):
- States: `title`, `play`, `paused`, `landed`, `crashed`.
- `update(dt)`: input taps, lander control, legs and body half-steps, boulders, lamps, chunks,
  rockets, meteors, particles, sand, heat, FX, camera.
- `draw(t)`: skyline, dynamic marks, lighting, scene, HUD, present, music.
- `frame()` runs the fixed-step accumulator with slow motion. It shows the slow-device hint when
  frames are slow.
- `boot()`: renderer, resize observer, detail (from saved data, localStorage or screen width),
  input, music UI, first level. It also supports a `window.claude.hot` snapshot for hot reload in
  claude.ai artifacts; that is harmless elsewhere.

## 12. Build and page shell

`build.sh` concatenates `src/00_head.html` (styles, canvas, buttons, the `<script>` opening) through
`src/11_main.js` (which closes the script). It syntax-checks the extracted JS with `node --check`.
It writes `dist/regolith.html` and `dist/test.html`, a complete HTML document with a viewport meta,
used for phone-size tests.

The page uses CSS tokens (`--void`, `--phosphor`, `--amber`...), JetBrains Mono from Google Fonts
with fallbacks, and a `[hidden]{display:none!important}` guard. The canvas has an `aria-label`
describing the controls.
