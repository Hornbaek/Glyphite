# Lessons and decisions

This file collects the knowledge gathered while building Pixelite and Regolith Lander: bugs we hit,
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
- **No ordered dither on flat surfaces.** The first pixel shading dithered between bands with a 4 × 4 Bayer matrix. Any
  evenly lit wall whose light fell between two bands became a checkerboard from edge to edge, and the per-cell texture
  (applied before the cut) flipped random cells into the next band. Pixel-art shading is flat bands with hard edges; apply
  texture after the cut, as a small multiplier.
- **Shading that depends on the exposure must not feed the eye.** Bands are cut after tone mapping (so they look even), and
  their colours are stored divided by the exposure; the eye adaptation measured those colours and saw the scene darker the
  higher the exposure, so it stuck at its maximum. The eye now measures each shaded cell's brightness before the cut (`cL`),
  and the particles' occlusion key is that brightness too.
- **Toast placement.** A centred toast covered the lander; during play it sits at about 76% of the
  screen height.

## Physics

- **Square cells change every count made in cells.** Going from 2-unit to 1-unit rows kept everything written in units
  (bodies, light, particles) but silently changed what was counted in cells: sand slid at 45° instead of about 63° (it now
  needs two free cells below the side it slides to), the mouse ate half as fast (a bite took a number of cells: now an area),
  hot ground and glowing materials gave twice the light (light per cell), stars doubled, sprite samples, the chunk-cell
  sampler read the next cell down, and every game's level code that measured heights in rows built a world half as tall.
  Per-cell chances that turn into matter (ejecta, crumbs) stay as they are: each grain refills one cell, so mass is kept.

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

## Sprites (pixel art)

- **Pixel Snapper cut every grid line one pixel short.** Its edge profile used a centred difference, which scores a sharp
  boundary equally one pixel early; the cut-walker keeps the first of equal peaks, so every cut landed early and a
  one-pixel sliver was left at the end (an 8-pixel drawing came back 9 wide). `tools/pixel-snapper.patch` measures the
  change where the new pixel starts; with it, clean art snaps exactly and its own pixel-size guess works on clean art too.
  On small AI drawings the guess can still be far off: give `--pixel-size`.
- **AI pixel art has no single grid, so measure the pixel size and give it.** A benchmark of 262 images (synthetic
  sprites with a known answer, clean / blurred / JPEG / jittered, and the games' sheets) showed upstream's own guess
  right on 26 and its grid right on 20; on the real Gemini sheets the "true" 3.2 is not even a local peak of any score.
  What helped was a **lattice fit**: one square step for both axes and a phase per axis, scored by the edge energy the
  grid lines explain minus a cost per line (0.7; without it the finest grid always wins), searched over fractional steps,
  then each cut nudged to the strongest edge within a fifth of a pixel. Guessing went to 139 sizes / 115 grids, and with
  the size given to 197 grids (every clean and jittered sprite exact). Scoring by mean contrast or a t-statistic instead
  picked huge steps; a scoring window that changed shape at step 4 clustered every guess around 4.
- **Outlines are style, not shape** (Pixel Art Lighter's idea). The bevel generator read a dark inner line as a trench,
  so the paint on both sides sloped into it and lamps drew ridges along every line. Outline pixels (darker than .16) now
  take the brightness of the paint beside them for the height, and then that paint's direction.
- **Normal maps on outlined art need a wide enough bevel.** A 2-pixel bevel only tilts the dark outline, and brightening
  near-black changes nothing: the lamp made no visible difference. Bevel 3 with the paint's own light and dark (`detail`)
  shades the panels inside; the direction table needed a gentle (20°) ring, or soft slopes rounded to flat.
- **Drawing pixel art small: outline on the silhouette, paint inside.** Taking each cell's most common colour turned Space
  Mouse's 28-pixel mouse, drawn at 14, into speckle: one-pixel inner outlines won cells at random. Letting the outline win
  only where the cell is on the silhouette (some samples off the art) and the paint win inside reads like a hand-made
  smaller version.
- **Side-view light comes from the side.** The normal-map light direction first had a large part toward the viewer (0.6),
  so tilted pixels hardly changed; lamps in a side view stand in the scene's plane, and 0.35 shows the relief.
- **Test pages with things below the fold by scrolling to them first.** Playwright's mouse moves to page coordinates; an
  element below the window never gets the event.

## Sprites (the ASCII engine's pixel art → glyphs; kept for history)

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
- **JPEG sheets bleed the background into the art.** Every Gemini palette had magenta-tinted colours: dark ones from the
  outlines, light ones from edge pixels and from background seen through lattices (the drying rack had 500 of them). Turn
  the dark ones into outline and make the light ones transparent (`unpink`, `games/fjordheim/tools/art.py`).
- **Look at every cut before converting.** A label touching the drawing below it is cut in with it; in the game it showed
  as a stripe of text across a birch. A contact sheet of `ref/frames/` finds it in seconds.
- **Dark art needs texture, not just colour.** The isometric buildings are dark browns, and all-`#` solids made them dim
  blocks. A dense glyph per material (thatch `%`, log walls `=`, stone `#`) shows the parts apart, and a small palette lift
  (gamma .8) makes up for glyphs inking only part of their cell.

## Audio

- **Stop/play race.** A late callback from a previous song could stop the new one; a play token
  fixes it.
- **`busy()` never went idle.** It now checks the drum volume properly.
- **Drum routing typo.** It sent channel 10 to the wrong lane.
- **Block scheduling** (2048 samples, 0.16 s ahead) avoids AudioWorklet and works everywhere. Use
  smaller blocks while MIDI IN is active, for latency.
- **Music leaks into beat tests.** Once a test starts the audio, the game's music plays, and `Beat.step` fires on its real
  drum hits between the frames being compared. Set `Chip.playing = false` while measuring anything beat-driven.

- **A later part's global may not be read while the parts load.** `const DEV` (part 11) is in its temporal dead zone when `07_sound.js` runs,
  so the built-in sounds are set up with `soundOf()` directly, not `defineSound()` (which calls `devKeys`, which reads `DEV`).
- **A game cannot reuse an engine name.** `Music` became an engine global, and Regolith's own `const Music` (a Chip director) made the
  build refuse the game; it is `RegolithMusic` now. Check `node tools/pixelite.mjs build` after adding any top-level name to a part.
- **A yield inside a hot loop is almost free; a long loop without one is the stall.** Turning the instrument recipes into generators
  (`yield` every 8192 samples, every 128 BRR blocks, every 4 harmonics) cost nothing measurable (717 ms against 778 ms of work) and
  cut the longest stretch from 133 ms to 6 ms. Time a step's cost as the fastest of several fresh runs: on a busy machine any one
  stretch can be stolen, and `threadCpuUsage` has a 15 ms resolution on Windows.
- **A timer waits 15 ms on Windows.** `setTimeout(f, 0)` between 1000 small slices made a 1 s job take 3 s in Node; the queue's
  `build.later` hook lets a test run the slices back to back (`queueMicrotask`).
- **A playing deck that is replaced must be told to stop everything.** A crossfade hands the old mixer to a deck that fades out;
  the strips' `lfo` and `pitch` oscillators run until stopped, so `disposeMix` stops them, or every song change would leak a mixer.
- **The settings system and Sfx both keep the volumes.** `SETTINGS` (part 16) calls `Sfx.setVolumes` and assigns `Sfx.muted`; Sfx copies
  what it is given into `SETTINGS` and saves both, and an assignment to `muted` counts as having loaded, or the later lazy `load()`
  would put the old saved mute over the new one.
- **`git status` shows every text file modified on this Windows checkout** (`core.autocrlf=true` against `* text=auto eol=lf`) and a plain
  `git merge` refuses. Rewrite the CRLF files with LF once, and use `git -c core.autocrlf=false merge`.

## Image APIs (the art pipeline)

- **Model names move.** `gpt-image-2` makes no transparent background; `gpt-image-1.5` does but draws worse; the newest one that does and draws well in November 2026 was
  `gpt-image-2.6-sunburst`. Ask the key (`art.mjs models openai`) before trusting a name from memory, and record the model on every version.
- **Show references as big blocks.** A 42 x 13 reference is unreadable to a model and Flux refuses images under 256 px: scale by a whole number (nearest) to at least 384 px on the
  short side and flatten transparency onto grey (a transparent reference is read as black).
- **The snap needs the pixel size.** Auto-detect finds the model's own grid (about 100 px wide for a 1024 picture), not the 10 x 14 the game shows: work the size out from
  subject ÷ target and correct it by what comes back. Alpha edges come back half-covered: binarize, then move every colour onto the palette.
- **Node's fetch ignores the proxy** (`NODE_USE_ENV_PROXY=1` since 22.21); curl works because it reads `HTTPS_PROXY`. A secret saved for one host is not sent to another: Flux's
  polling host differs from its submit host.
- **Slow calls get a 502.** sunburst at medium or high, and anything over about 30 s, came back "502 upstream request failed" about half the time (three tries in a row at high); flare answers in 7 to 10 s even at high.
  `make` tries up to three times. The default stays sunburst (the owner: quality, not time); flare is the way to get `high`.
- **The cheapest model is not a draft model.** gpt-image-1-mini made a third of the tokens and an unusable picture (no outline, pieces apart).
- **The Images API reports no cached tokens.** Two identical calls billed the same input; do not plan on caching there.
- **Spend money on purpose.** Every `make` has `--max-calls`; tests use fixtures; a dry run prints the prompt for free.

## Platformers (Space Mouse)

- **Prove the levels with a search, not by eye.** `games/spacemouse/tests/reach.py` runs the real controller from every
  standing spot. On the first pass it found five mistakes in three sectors: catwalks 4–7 tiles apart when a jump is 3.6, a
  cable jump that bumped a low ceiling and fell short, a crate wall in front of the goal. Run it after every map edit.
- **Model running jumps.** A search that only jumps from a standstill under-reaches; players run up to a gap.
- **Tiles must be whole rows at every detail level.** A square tile of T base units is T·RES cells each way: T = 2 is the
  smallest that is a whole number at RES 1, 1.5, 2, 2.5 and 3 (on the ASCII engine's 2-unit rows it was 4).
- **Anything floating breaks off at the next structural check.** Catwalks hanging in mid-room fell the first time a gantry
  collapsed nearby (any `explode()` or `checkSupport()` checks a wide region). Things that are bolted in place are `anchor`.
- **A gantry is everything joined to its brackets.** The game finds gantry decks by flood-filling deck tiles from the `B`
  brackets; deck touching other deck would fall with it, so keep gantries separate in the map.
- **Tests that step past a death hide it.** After 1.3 s the mouse respawns at a checkpoint, alive again; a test stepping two
  seconds saw "alive". Stop stepping when the state changes.
- **The back wall is dark on purpose, so signs must glow.** Painted letters on the back wall were unreadable in the gloom; the
  game draws them as glow-in-the-dark paint (`putEmit`), and the hull uses the `deck` style so floors and walls read as solid
  plating against the dimmer back wall.
- **The camera trails long falls.** The engine eases the camera at a fixed rate, so a fast fall left the mouse at the bottom
  edge; leading the target by about 0.3 s of the fall speed keeps it on screen.

## Isometric (Fjordheim)

- **An aim of [0, 0] is not "no aim".** `mouseAim()` returned the top-left corner until the mouse first moved, so edge
  scrolling slid the view into the corner on its own (and Regolith aimed at the corner for the first six seconds). It is
  null now until the mouse moves over the canvas and once it leaves.
- **Clamp the game's own camera too.** The engine holds the view inside the world, but Fjordheim's `CAM` ran on past the
  edge, so scrolling back first had to undo the overrun.
- **Thin ground glyphs read nearly black.** A diamond of grass is a field of `' , ;` in the grass colour; it needed its
  albedo lifted 1.5x to read as land, but no more, or it outshines the sprites standing on it.
- **Let a bot play the whole year.** `games/fjordheim/tests/playthrough.py` builds through the real build bar and clicks
  and steps a game year in 18 s. Its first runs found the design bugs no screenshot would: with two adults in two huts
  nobody was left to build, the fields had no farmer, stone ran out, and the berries alone could feed the family.
- **Real-time UI tests wait for game steps, not wall time.** Headless frames are slow and uneven (the loop runs at most
  three steps a frame), so `games/fjordheim/tests/ui.py` waits on `frameNo` or on the outcome.
- **Tiles a multiple of 8 base units.** A 2:1 diamond of T base units is T·RES cells by T·RES/4 rows: whole at every
  detail level only when T is a multiple of 8.
- **A phone has no cursor.** Whatever a mouse shows by hovering (where a building would go, what is under it) needs a tap
  of its own on a touch screen: the first tap shows, a second tap on the same spot acts.
- **Act on release when dragging pans.** A click acted on as it went down would build at the start of every drag; act on
  `'TapUp'`, and ignore the release of the tap that started the game.
- **Give fingers room.** A HUD row on a phone is about 11 CSS pixels; the build bar's rows go a row apart and take taps a
  row around them. Leave the last row free: Android's gesture bar sits over it.
- **The headless 2D canvas is slow and noisy** (50 to 900 ms a frame here). Time the JavaScript, not the frame, and let
  tests wait on game steps.
- **Stand an isometric drawing on its lowest point.** A building drawn in isometric touches the ground at the front
  corner of its base, which is rarely the middle of the drawing: pin that point to the footprint's front corner. Its
  position across the drawing also tells which way the long side runs (w / (w + h) of the way across for a footprint
  w along i): mirror the drawing when it runs the other way. Then check every building with its footprint outlined.
- **Move things the way their drawing faces.** A sprite has one or two facings (drawn and mirrored), so give it a path
  along them: the knarr sails along the shore, not straight at it. A tall sprite near the shore reads as standing on
  the land behind it; keep it well out.
- **Pick a building by its drawing, not its tile.** An isometric building's roof rises far above its footprint, so a click
  on the roof landed on the tile behind it, and a builder standing beside the site took the click. Test the drawing's
  painted pixels (frontmost first, with slack for a finger), and give people a hit box the size of their figure.
- **Lay out the HUD for the narrowest phone.** The same Pixel 7 has 55 HUD columns in WebGL and 54 in 2D (rounding), and a
  menu that needed 55 for two columns fell back to one column four screens tall. Check the layout at the smallest width.
- **The 2D renderer caches a tinted font sheet per HUD text colour**, and clears it past 96 colours, so fades of text should
  use few colours (the news fades in three steps). HUD pictures (`hudSprite`) are full blocks drawn as plain rectangles and
  need no sheet.
- **A worker taken off a job lets go of everything.** Pausing or tearing down a workplace has to bring in the fisher's
  boat, what anyone carries, the builder's way back to a workplace that may be gone, and the farmer once no field is left;
  the tile grid points at buildings by their index, so removing one re-points every tile after it.

## Sound (the Sampler and the SOUND STUDIO)

- **BRR's first block can't predict, which caps it near half volume.** A block with predictor 0 reaches at most
  7 · 2^11 = 14336 of 32767 at the largest shift, so a sample that starts loud clipped to 0.44. The console lives with it
  (samples start quietly); decoding once ahead of time, any block may predict.
- **Search only the BRR shifts near the one a block needs.** The largest step a predictor leaves says which shift fits; trying
  that one and its neighbours gives the same result as all thirteen, twice as fast.
- **Level instruments by what you hear, not their peak.** Peak-normalised samples differed 7x in loudness (a plucked string
  is one sharp peak, an organ is all body); levelling by the first 0.3 s's RMS put all 23 within 3x.
- **The SNES echo filter can gain.** A feedback loop through an FIR whose response passes 1 at some frequency rings forever
  there; each preset is scaled by its peak response, so any feedback below 1 dies away (`tests/studio.py`).
- **A note of known length gets its release scheduled with it.** Cancelling the envelope at the release time would cancel
  an attack ramp that ends exactly there and leave the voice at 0 until the jump; a song's notes get the whole envelope at
  once, only live notes are released by cancelling.
- **Two `afterFrame` keys in one object literal: the second wins silently.** Space Mouse already had one; add to the
  existing hook.
- **Size a canvas from a ResizeObserver, not at start-up.** The piano roll measured its box before the overview above it took
  its height, and kept a third of the space.
- **An engine global is not on `window`.** The parts declare `const Sampler` and friends at the top level of one script, which
  makes them the page's globals but not properties of `window`: from a parent page use the frame's own scope
  (`frame.evaluate('Sampler...')` in Playwright, `postMessage` from the studio), never `iframe.contentWindow.Sampler`.
- **Encoder and decoder must do the same arithmetic.** The BRR encoder tracks the decoder's own predictions (the decoded
  samples, not the input), so decoding its bytes gives exactly what it judged by; a test pins `brrDecode(brrEncode(x))`.
- **A new field of a song stays optional.** The games ship songs that `tools/song.mjs` wrote with the engine's `check` of the day, and
  the unit test fails when regenerating one differs. A lane, a sample setting or a multisample that did not exist then is left out of
  `check`'s result until it has something in it (`auto.echo` only exists with points), and the engine reads it with `laneOf(tr, 'echo')`,
  which is an empty list for a song made before. An empty array a lane left behind in the studio (the last point deleted) is the same as none.
- **A tempo ramp is an integral.** Seconds along a glide from b0 to b1 BPM over t ticks are `60/PPQ · t/(b1−b0) · ln(b1/b0)`, not the
  average of the two tempos; `tickAt` inverts it with an exponential. Both are tested round trip at ticks in the middle of a ramp.
- **A MIDI controller is a step, our lanes are lines.** Reading CC events into a lane: events closer than a beat are a sweep (joined by a
  line), a longer gap is a jump (hold the old value until a tick before); writing one: an event every 1/16 note, so what is read back is a
  sweep and not a jump. A tempo ramp the same way, and an even run of tempo events is read as one ramp.
- **A Windows checkout with `core.autocrlf` cannot build.** `checkSyntax` looks for `<script>\n` and the page template then has `\r\n`:
  the build says "Unexpected identifier 'html'". Build in a clone with `-c core.autocrlf=false` (the unit tests that compare generated files fail
  the same way in the checkout itself; CI, on Linux, is not affected).

## Speed and caches (the engine plan, speed work; HISTORY 54)

- **Measure the work, not the gap between frames.** `perfAvg` read 16.7 ms whether a frame took 2 ms or 16. The stage timers (`Pixelite.perf`) showed the lighting as the biggest stage of
  every game but Fjordheim (11 to 60 ms at RES 2 and 3 in headless Chrome; Fjordheim has no shadowed lamp, and its terrain pass is the biggest), and two shadowed lamps of radius 90 base units
  as most of the showcase's.
- **Software GL pollutes the JavaScript numbers.** SwiftShader runs in another process but on the same cores: the same `light` stage read 14 ms with `#2d` and 18 to 35 ms with `#gl`.
  Compare JavaScript stages in `#2d`; `present` and the readback say nothing about a real GPU.
- **A cache is only as exact as what tells it to let go.** The lamp cache and the still frame trust the revision counter (`setC`, `wakeAt`); a game that writes `cells[]` by hand while it
  runs must call `worldChanged()`. Things with no writer to hook (`backCells`, which `isoSetTile` and games write directly; `heat`, which cools by itself) are watched by a checksum or a scan of
  the window instead, a few tenths of a millisecond. `CACHE.audit` re-does everything and compares, and the tests break each guard on purpose (a mutated `backSig`, `heatCalm`,
  `emissiveIn`) to see that they fail.
- **Cache what is a pure function, apply what varies.** A lamp's cast does not depend on its colour or intensity, so a flickering lamp (the intensity changes every frame) is still cached:
  what is kept is the falloff and the distance, and `cr * a` is computed each frame, in the same lamp order, which is why the float sums come out the same. Adding all the lamps together first
  would have been faster and not bit for bit.
- **Record only what has stood still.** A moving lamp or a moving camera must cost nothing extra, so a lamp is recorded only after two frames with the same parameters and the camera in the
  same cell (the previous frame's hashes; no entry is made before), and a cast made stale by a change near it must see four quiet frames before it is recorded again.
- **The camera moving defeats both caches, on purpose.** The window cuts a lamp's rays at its edge, so a lamp partly off screen casts differently from one in view; keeping a cast across a
  camera move needs the cast to be defined beyond the window (the plan's "shift and fill the edge"), which the surface buffers do not cover. In a platformer that runs, the gain is in the
  standing, talking, dying and title stretches; for the running ones it is P3's cheaper loops.
- **A short name in a long function shadows.** `computeLighting` had `const S = LSAT` inside the block that the still frame wrapped; the outer `S = STILL` was shadowed, `S.snapBase` read
  `undefined` on an Int32Array and nothing was ever kept, without an error. A look at the state after each frame (`have: false`) found it.
- **Make the A/B harness deterministic before trusting it.** Run to run, `EYE.e`, the beat, `Math.random` (the 404 game's lander lands somewhere else), the page's address (the 404 game draws it)
  and wall-clock toasts (the HUD) all differed: the first A/B said every game differed, even a build against itself.
- **A minifier that drops indentation can make a comment into a marker.** `lineMap` takes a line that *starts* with `// ----- ... -----` for the assembler's file marker; the Chip had an
  indented comment of that shape, which became one once its indentation was gone. The minifier keeps a marker only if it started in column 0.
- **Check that the "optimisation" is one, in the same process.** The terrain pass called `getC` for every cell and again for the back wall's shadow search; replacing the second with a read of the lighting's
  occupancy buffer through a function (`occAt`) looked free and was 5 to 20% slower (it does more work per call than `getC`). Reading the cell itself from the array, the thing the plan named, moved the scene stage
  by less than the noise. Timing the P1 `renderScene` against the new one in one page, alternating, and varying the loop found it; the build-to-build numbers (10 to 20% scatter between page loads) could not.
