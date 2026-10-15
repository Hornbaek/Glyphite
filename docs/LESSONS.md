# Lessons and decisions

This file collects the knowledge gathered while building Glyphite and Regolith Lander: bugs we hit,
why the code is the way it is, and traps to avoid. Add to it whenever you learn something the hard
way.

## Process

- **Split the source.** One big HTML file hit the output limit while it was being written. The
  source lives in parts (`engine/*.js`, `games/<id>/*.js`) concatenated by the build. Keep parts small
  enough to edit comfortably, and keep each banner comment saying whether the part is ENGINE or GAME.
- **Test with synchronous stepping.** In headless Chromium, WebGL runs on SwiftShader at about
  65–75 ms per frame, so wall-clock waits barely advance the simulation. Instead, call
  `page.evaluate(() => { for (...) update(DT) })` to step the sim deterministically, then read the
  state. Use real-time frames only for smoke tests.
- **Screenshot with the loop frozen.** Override `window.update = () => {}` (and restore it
  afterwards); the pause state draws a "PAUSED" box over the scene.
  `device_scale_factor=3` with a clip around the object makes glyph-level detail readable. Build
  contact sheets with Pillow and actually look at them.
- **Headless WebGL flags:** `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
  plus `#gl` in the URL. Without `#gl` the game detects SwiftShader and uses 2D. That is right for
  real users and wrong for testing the GL path. For the 2D path use `--disable-gpu` and `#2d`.
- **Phone layouts need the viewport meta.** The page shell (`engine/shell.html`) has it; without it
  phone screenshots render tiny.
- **Most randomness is not seeded.** Levels use `mulberry32`, but particles, explosions and blast
  noise use `Math.random`. Physics tests should tolerate small variance and check outcomes, not
  exact positions. Run a flaky-looking test several times before concluding anything.
- **Measure features with a column ruler.** When reading coordinates off a printed character map,
  print column indices above it. Without them we misread positions by two pixels once.

- **One script scope, so names can clash silently.** The engine's `gatherLights` was replaced by a game
  function of the same name (duplicate `function` declarations are legal), and the frame loop called the
  wrong one. The build now lists every top-level name in the engine and refuses a game that repeats one;
  game hook functions are named `game*` or `<id>*`.
- **One assembler for the build and the editor.** The editor rebuilds the preview in the browser with
  `tools/assemble.mjs`, the same module the Node build uses, and a unit test checks they produce the same
  page byte for byte. A second implementation would drift.
- **Map errors back to sources.** The assembled script marks each part with `// ----- path -----`; build
  syntax errors and editor runtime errors are reported as `file:line` of the source, not of the page. The
  editor injects its error reporter on the `<head>` line so no line numbers shift.
- **Playwright must match the preinstalled Chromium.** Claude Code cloud sessions ship Chromium for
  Playwright 1.56; a newer `pip install playwright` looks for a browser that isn't there. Pin 1.56.
- **The agent proxy and localhost.** Through the sandbox's HTTPS proxy, Chromium sent `http://localhost`
  requests to the proxy. Use `127.0.0.1` and `bypass: '<-loopback>,localhost,127.0.0.1'`, or `file://`.
  cdnjs is blocked there too, which is one reason the editor vendors CodeMirror.
- **`"type": "module"` in package.json** turns every `.js` that Node runs into an ES module; the one
  CommonJS tool became `render_songs.cjs`. Game and engine `.js` parts are never run by Node directly.
- **`wrangler dev` rewrites the request URL to the custom domain** (it infers the origin from routes), so
  a "localhost only" check sees glyphite.hornbaek.org. `npm run dev` passes `--local-upstream localhost:8787`.
- **Follow the house setup for deploys.** The first version used a GitHub deploy job with a Cloudflare token
  and its own variable names; the user's other sites deploy through Workers Builds with the Access values
  in `wrangler.jsonc`. Look at an existing repo (hornbaek-site, horn-dev) before inventing a deploy path.

## Rendering

- **No dust halos in a vacuum.** An early "dust mote" scattering effect looked noisy and is wrong
  without air. Light is only visible where it hits something.
- **Dynamic bodies must not shadow themselves.** In the sun sweep, cells covered only by dynamic
  bodies mark rays as 2 ("blocked by a body"), so body cells behind other body cells stay lit.
- **Software WebGL is slower than 2D canvas.** It reads pixels back every frame. Detect the renderer
  string (swiftshader, llvmpipe, softpipe, software, basic render) and fall back to 2D.
- **HUD on its own grid.** At fine detail the world cells are tiny, so the HUD has a separate,
  coarser grid. `worldToHud` maps world positions onto it for world-anchored labels.
- **`[hidden]` needs `display:none!important`.** Otherwise `display:flex` rules override it, which
  broke the title bar and touch controls.
- **Spotlights need a soft window and a soak.** Plain inverse falloff gave faint, one-character
  pools. Use `(1-(d/r)²)²` with smoothed cone edges, and let rays soak about 1.3 m into the ground.
  The pad deck glyph switches by luminance so lit decks read.
- **Sun soak at high detail.** Without the `LSSAT` table, only a one-cell band of ground was lit at
  RES 3. Sunlight now soaks a fixed physical depth at every RES.
- **The sky jittered (sawtooth).** Stars were drawn into the world grid, which scrolls by sub-cell
  amounts, while their own slow parallax was rounded to whole cells. They rode along with the ground
  for one cell, then snapped back. Anything that moves at a different rate from the world needs its
  own layer with its own sub-cell offset. Hence the sky layer, and world glyph 0 meaning
  "transparent" while 32 means an opaque blank.
- **Stars in caves.** A 2D cross-section has no back wall, so caves show sky. This was true before
  the sky layer too. It is on the backlog in `ROADMAP.md`.
- **Toast placement.** A centred toast covered the lander; during play it sits at about 76% of the
  screen height.

## Physics

- **Resting contacts need a skin.** Landings never registered while contact required real
  penetration. Hull points now count as touching within `SKIN = 0.3` units.
- **Leg dampers: don't differentiate a quantised measurement.**
  - The first version marched rays at 0.2-unit steps and computed the closing speed as Δcompression
    / Δt. That gave ±6 m/s noise spikes. The touchdown speed came out as about 0, because the first
    contact had a tiny compression.
  - Fix: bisect the ray hit (6 iterations), and take the closing speed from body kinematics: the pad
    point's velocity projected on the strut.
- **Bottom-out points must account for the contact skin.** The skin is 0.3 world units at every RES,
  so it is relatively bigger at RES 1. The struts bottomed out at 73% of the stroke there but 87% at
  RES 3, so 3.5 m/s was survivable only at high detail. The bottom-out hull points sit 0.25 units
  up, inside the skin, and now behave the same at every RES.
- **Landing tolerances**, after the fix (the same at RES 1–3):
  - Up to 3.5 m/s is survivable; past 85% of the stroke shows "HARD LANDING".
  - 4.5 m/s and up collapses the gear.
  - Rest compression is about 22% of the stroke.
- **Settling makes floating geometry.**
  - Masts placed on regolith hung in the air after the level's sand settling moved the regolith
    away. Then the first nearby blast made them "inexplicably" fall.
  - Cave tunnels cut loose rock islands, and ice crusts hung over slid-away regolith.
  - Fixes: masts have footings down to rock, and the x3 pillar goes down to rock. Ice is placed
    after settling. `settleIslands` drops floating pieces (lowest first; skip gaps that lead to the
    island's own lower parts, or C-shaped islands drop one cell per pass). The fallback is a basalt
    column. Caves avoid the x3 roof.
  - `tests/check_floating_islands.py` checks every level at RES 1–3 for floating geometry.
- **Generator order matters.** Building the pads cleared the airspace above them, which erased the
  x3 roof. The roof never existed until it was built after the pads. When generators overlap, check
  the final result, not each step.
- **Toughness vs blast power.** A rocket is power 1.15, so a cell's strength tops out at about 1.86
  right at the centre. Mast steel at toughness 1.25 was almost never cut; 0.8 cuts a 3–6-cell gap.
- **Pushing loose pieces.**
  - A radial push from the blast centre to a chunk's centre of mass threw a post's top straight up,
    because the blast was below it.
  - Physically, pressure acts on the faces exposed to the blast, along their normals. Pushing per
    face (`blastPush`) makes posts topple sideways at the cut while small debris flies.
  - Centre a projectile's push a little behind the impact, along its flight path, so pieces move
    away from the shooter. Clamp spin (±2.4 rad/s) or posts cartwheel.
- **Steel doesn't chip.** `CHUNK_BRITTLE` stops falling steel posts from dissolving into grains on
  impact.
- **Lamp survival.** Shatter a riding lamp only when an impact happens near the lamp's own end and
  is fast (> 9 base units/s). Otherwise lamps died from the post's foot hitting the ground.
- **Big chunks are cheap.** A 700-cell roof chunk costs about 5 ms per *second* of simulation and
  drawing. Headless frame time is dominated by canvas presentation, not physics.

## Sprites (pixel art → ASCII)

- **AI-made pixel art has an irregular grid.** Periodicity fits gave inconsistent periods for x and
  y. Sampling block centres at an approximate grid (48×50 for the lander) worked immediately. Flat
  colour runs are shorter than a block because of anti-aliased seams; `sprite2ascii.py` adds the
  seam width.
- **Letters as edge glyphs read as noise.** With `J L V Y O` in the candidate set, the lander looked
  like random text. Use symbols only: `.,'`-_=:;|/\()[]<>^v+~"!*`.
- **Solid areas need dense glyphs per material** (`#`, `@`, `%`); colour carries the image.
- **Outline handling.** Silhouette outline becomes dark gaps. Interior outline counts as paint
  (darkening its cell), and becomes a blank only if it fills over 60% of the cell. Treating all
  black as gaps made the hull look broken into fragments.
- **Keep thin details crisp.** Weight the cell colour toward its dominant paint (65/35); a plain
  average muddies ladder rails and RCS jets.
- **Brightness.** Linearise palette colours through the inverse tone curve, and use a light floor
  (`0.75 + 0.4·light`) so sprites keep their own shading and never go black.
- **Grounding.** Snap the contact line (footpad soles) to a row boundary, and count the soles'
  outline as paint. Otherwise a landed sprite floats about one row above the deck.
- **Clearance.** The pixel-art lander is taller than the old one. Check clearances: the x3 roof
  was raised 1.5·RES rows; see `tests/check_x3_clearance.py`.

## Audio

- **Stop/play race.** A late callback from a previous song could stop the new one; a play token
  fixes it.
- **`busy()` never went idle.** It now checks the drum volume properly.
- **Drum routing typo.** It sent channel 10 to the wrong lane.
- **Block scheduling** (2048 samples, 0.16 s ahead) avoids AudioWorklet and works everywhere. Use
  smaller blocks while MIDI IN is active, for latency.
