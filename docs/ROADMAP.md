# Roadmap: the Pixelite engine

**Goal (from the user):** "I want this to become a custom made ASCII game engine … called Glyphite" (renamed Pixelite and moved to pixel art on 2026-11-07, HISTORY section 29),
"This game engine should work for any 2D game, not just a moon lander game", and (2026-10-15) an
**AI-first** engine: games are made in Claude Code sessions, listed on glyphite.hornbaek.org behind a
Cloudflare login, playable and editable there. Regolith Lander stays the reference game.

**Status (2026-10-15):** phases 1 and 2 are done, phase 3 is partly done, and the site, editor and
deployment exist. Next: prove the engine with a second real game (phase 4).

This file is the plan. [`IDEAS.md`](IDEAS.md) is the idea bank: a large brainstorm of everything the engine
could have, to pick from when planning. Move an idea here when it is chosen.

## Now: the move to pixel art (2026-11-07, HISTORY sections 29 and up)

The owner found ASCII too dark and chose pixel art, keeping every mechanic:
1. ~~Rename to Pixelite~~ (#23; the Worker is `pixelite` since #29, D1 keeps the old name). The site also answers on
   pixelite.hornbaek.org (HISTORY 35). Next, once the owner has signed in there: send glyphite.hornbaek.org to it with a
   permanent redirect in `worker/index.js` (a sign-in change: the owner first).
2. ~~The pixel renderer~~: solid cells, flat shading bands or palettes, the pixel-font HUD, glyph codes kept as brightness.
3. ~~Square cells~~ (`ASPECT = 1`): rows doubled, everything that counted cells fixed, physics the same at RES 1–3.
4. ~~Pixel sprites with normal maps and the PIXEL LAB~~ (Pixel Snapper and our own normal maps, in the browser and as CLI
   tools). Left: drop the glyph field from the sprite palettes (`pixelsprite.py`, Fjordheim's and Space Mouse's art tools);
   offer `tools/pixel-snapper.patch` upstream (the forward difference and the lattice fit, with the benchmark); try
   Sprite Fusion's sister project (github.com/Hugo-Dz/spritefusion-sprite-normals) against ours. Pixel Art Lighter is in
   the PIXEL LAB (/lab/lighter/); its **light masks** (which pixels a light may reach, e.g. a window glowing at night) would
   be a general engine feature: a per-sprite emissive/mask layer beside `normals`.
5. ~~Space Mouse in pixels~~: normal-mapped characters and props, sprites drawn small the pixel-art way. Next: art at the size
   the game shows it (Pip ~14–16 px), the sheet's moss and cobweb drawings as decor, material palettes.
6. Later: Regolith from `lander_ref.png`, Fjordheim's sheets (their outline colour still carries the magenta tint of the
   JPEG background, which shows as a reddish rim on trees now that outlines are drawn on the silhouette), the starter,
   showcase and notfound; moving the site to a pixelite domain with the owner.

## Sound: the SOUND STUDIO (HISTORY 36)

Done: the engine's 16-bit Sampler, the studio at /studio/, songs saved on the site and played in Space Mouse. Next:
- ~~**Your own samples**~~ (HISTORY 37, 52): a loop end of its own, crossfaded loops, a microphone, several samples as one multisampled
  instrument (a note range each). Next: layers by loudness (a zone per velocity range), a loop found automatically (the
  nearest zero crossing), a start offset.
- ~~**Projects and places**~~ (HISTORY 37): next, music that changes inside a level (a place per area or event, not only per level).
- ~~**Automation**~~ (HISTORY 38, 52): volume, pan and filter lanes per track, tempo changes, glide, curved segments, the sends, pitch bend,
  the echo's level and feedback, a lane for a sample's loop point, tempo ramps. Next: curves for the tempo ramp, a lane for the chorus
  and the EQ, a loop lane that moves while a note holds (Web Audio's loop points are not parameters: it would take two crossfaded
  sources).
- **Patterns**: SNES composers worked in short patterns; clips that repeat would make long songs quicker to write.
- ~~**MIDI files**~~ (HISTORY 51, 52): import a .mid into tracks, export the song as .mid (`tools/midi.mjs` too); pitch bend and the volume and
  pan that move are lanes, a tempo ramp is a ramp, a file with several instruments asks which to open, and a song's own samples
  travel inside the file (a pad or a marimba to other programs). Next: the filter, the sends and the echo as CC events (74, 91, 93), time
  signature changes.
- **Making instruments off the main thread** (a Worker): a game's first song costs ~0.3 s of blocked frames on its title.
- **Music that follows the game**: a director helper over `Sampler.track` (layers by state), and songs for Regolith and
  Fjordheim (Regolith's MIDI can now be turned into Sampler songs to re-voice: `node tools/midi.mjs import games/regolith/music/<name>.mid`).

## Art pipeline (HISTORY 41; docs/ART_PIPELINE.md)

From the owner's brainstorm: generate art through an image API, snap it to the game's palette, give it normals, review it, version it.
1. ~~Foundation~~: the folder layout, checker, sprite builder, `pipeline.js`, Space Mouse's props imported, a first hand-made prop.
2. ~~The gallery on the ART page~~: tiles at game size, detail, version strip, compare, version tree, hidden rejected versions.
3. ~~Space Mouse's style sheet~~ (hero, props, environment, mood references), a curated 32-colour master palette, `maps/cargo-bay/`
   (seed and 14-colour sub-palette), `recolor`, `promote-ref`, `tools/art_capture.py`. Other maps (Hydroponics, Observation Deck) get a seed when
   they first need generated art.
4. ~~The generation adapter~~ (OpenAI first, Flux second), the `make` loop, `check-keys`, `models`: OpenAI works end to end (first real run: three fuel
   barrels for Cargo Bay). Flux submits and is paid for, but its polling host (`api.isr.bfl.ai`, regional) and its download host are not allowed in the
   environment yet: the owner adds them (docs/ART_PIPELINE.md, "Keys").
5. ~~The skill `pixelite-art-pipeline`~~; `pixelite-art-prompt` points at the style sheet.
   Open: art below about 12 px loses most of what the model drew when it is snapped (the fuel barrel at 10 x 14); try generating the subject at a larger
   art size and reducing with a smarter downsample, or drawing characters at 16 px.
6. Optional: approve / iterate / reject buttons on the site (D1 table, modelled on `worker/songs.js`).
Later: the animation asset exists (HISTORY 49); next is a game using one (Pip's own frames) (the legs are solved by drawing characters at twice the size: HISTORY 50), moving Space Mouse's other art (Pip, cat-bots, objects) into the pipeline, the stray one-pixel
column on the lockers' right edge (a cut artefact the gallery will make visible).

## Principles to keep

- One pixel per cell, one colour per pixel; pixel art keeps one art pixel per world pixel where it can.
- One self-contained HTML file per game, with no runtime dependencies. The engine can still be
  developed as separate files and bundled.
- Physics and lighting first. Every subsystem is authored in base units and scaled by detail
  (`RES`), so a game plays the same at every detail level.
- Both renderers (WebGL and 2D canvas) are first-class.

## Done (2026-10-15, see HISTORY section 10): phases 1 and 2, most of phase 3

- **Structure.** `engine/` (ordered parts, `engine.json`) and `games/<id>/` (`game.json` manifest); a Node
  build (`tools/pixelite.mjs`) replaced `build.sh`. The engine no longer reads game globals; games hand it
  a hook object through `Pixelite.run`. The engine owns the loop, slow motion, detail switching, resize,
  the slow-device hint, the hot-reload snapshot, the camera (the game gives a target) and built-in keys.
  *Not done, on purpose:* a namespace for every engine name. The flat API stays (fast, short to write,
  documented in `engine/API.md`); the build refuses game names that clash with it instead.
- **Data-driven world.** Material registry (`defineMaterial`, properties instead of named materials
  everywhere), world material roles (`worldMaterials`), particle type registry (`defineParticle`;
  Regolith's pickups are one), mounts (`addMount`; Regolith's lamps), generic chunk-vs-body contact,
  sky painter hooks (Regolith's Earth), `setSun` / `setSun(null)` / `setAmbient`, `setGravity`.
- **Sprites.** `defineSprite` / `drawSprite` / `markSpriteDyn` / `spriteHull` in the engine, reading the
  `sprite2ascii.py` format; parts with their own offsets; the lander renders pixel-identically.
- **AI-first tooling.** `CLAUDE.md`, `engine/API.md`, the starter game (`templates/starter/`, Cave Drone:
  no sun, gravity 3, its own materials and sprite), `pixelite new`, the `pixelite-new-game` skill,
  `Pixelite.test` (start/step/press/freeze/probe), `tests/smoke.py` for any game, `tools/thumbnail.py`,
  tunables in `game.json`.
- **Site.** Game list, play pages, the web editor (tune live, edit code with an in-browser rebuild, hand
  edits to Claude as a prompt plus a patch), a Cloudflare Worker with an Access check, CI and deploy.

## Done from the idea bank (engine 0.3.0 and 0.4.0, see HISTORY section 13)

Lighting batch, tried in Regolith Lander: visibility queries (`sunAt`, `isLitBy`), the sun's colour from airmass or kelvin
(`setAtmosphere`, `setSun(el, { kelvin })`), star twinkle in an atmosphere and star glare near lamps, auto-exposure
(`setEyeAdaptation`). Regolith gets an "Atmosphere (test)" and an "Eye adaptation" tunable and `[SUN]` / `[LAMP]` lights on
its warning row.

Audio batch (0.4.0): thunder delayed by distance (`Sfx.heard`, with an atmosphere) and beat-reactive emissive materials and
bloom (`Beat`, `setBeatPulse`, material `beatGlow`); Regolith's beat-synced beacons are now the engine's `Beat.blink`.

Site batch: *What's-new page built from HISTORY.md* (`tools/changes.mjs`, `/whats-new/`, UPDATED badges on game cards),
*A Pixelite micro-game as the 404 page* (`games/notfound`, served by the Worker for missing pages) and *Auto-pick the most
interesting thumbnail frame* (`tools/thumbnail.py --auto`).

Platformer batch (engine 0.5.0, with the second game, Space Mouse): *Platformer character controller kit* (`Character`:
coyote time, jump buffer, variable height, step-up, wall slide and jump, one-way floors, standing on chunks), *Back wall that
catches offset shadows* (`backCells`, `setBackdrop`; the shadows use one fixed direction, not each light's), *Light flicker
and pulse presets* (`flicker` on any light, `flickerAt`, `Sfx.buzz`), plus `drawSprite(..., { flip })` and `checkSupport`.

## Phase 3, still open: sprites and assets

1. **Animation frames:** done the simple way (one sprite per frame, `flip` for the other direction); a sprite with several
   frames built in would save the boilerplate.
2. **Level and map import:** a tool that turns a PNG with a colour key into voxel materials, for
   hand-made levels.
3. **Sun from any side:** `setSun` only lights from the left (the sweep walks columns left to right);
   mirror the sweep for light from the right.
4. **Gravity as a vector:** `G` is downward only. Top-down games set it to zero, which works, but
   sideways gravity (or per-body gravity) is not possible yet.

## Editor and site ideas

- ~~A map painter~~: the LEVELS tab (2026-10-16) paints tile maps declared in game.json. Next: stamps and copy/paste of a
  region, mirror painting, editing the overlays (signs, zones) on the map instead of in code, and maps for generated games
  (painting into the live world, the idea bank's "material painter in the live preview").

- Commit from the editor directly (a GitHub token or a Worker endpoint opening a pull request), so a
  small tweak doesn't need a Claude session.
- Talk to Claude from the editor (the Worker calling the Claude API with the game's sources), turning
  "make the lander heavier" into a draft change in the preview.
- Shareable preview links for drafts (store them in KV/R2 behind Access).
- Per-pull-request preview deploys of the site.

## Phase 4: prove it with more games

Build at least one more small game on the engine to check that it is game-agnostic:
- ~~a side-view platformer with a walking sprite~~: **Space Mouse** (2026-10-16). It needed, and got, general engine
  features: `Character`, the back wall, `oneWay`, sprite `flip`, light flicker, `checkSupport`. Follow-ups it exposed:
  - **Climbable, liquid and hazard flags** (the rest of the idea bank's material-flags idea): ladders, water, spikes as
    plain materials. Space Mouse keeps its hazards in a game table for now; the owner's art sheets have a ladder and a lift
    waiting for this (cut boxes are easy to add to `games/spacemouse/tools/art.py`).
  - **Prop tiles as a general feature**: Space Mouse draws its decoration (sprites standing on a tile's floor or hanging on
    its wall) itself; a `drawProps` helper with view culling would let any tile-map game place sprites from its legend.
  - **Moving platforms and lifts** (kinematic chunks that carry characters): a Character stands on a falling chunk but is
    not carried sideways by one.
  - **Back-wall shadows per light**, instead of one fixed direction.
  - **A walking-game starter**, or a `--kit platformer` option for `pixelite.mjs new`, so the next platformer starts from
    Space Mouse's pieces (tile maps, the reach search) rather than the flying starter.
- a falling-sand sandbox;
- or a top-down game (gravity 0, no sun);
- ~~an isometric game~~: **Fjordheim**, the Viking homestead (2026-10-17, engine 0.6.0), a peaceful settlement builder
  inspired by Anno 1404 and The Settlers, drawn from three Gemini sheets. It needed, and got, general engine features: the
  isometric ground grid (`engine/12_iso.js`: diamonds in the back wall, `isoPick`, `isoDraw` back to front), cached still
  sprites (`drawSprite` `cache`), the right click (`'TapAlt'`), and a `mouseAim` that is null until the mouse moves.
  Follow-ups it exposed:
  - **Ground that reads at a glance**: the back wall shows a texture glyph per cell, so a flat diamond of grass is a field of
    `' , ;` in the grass colour, and it had to be brightened 1.5x to show. A cell background colour (a tint behind the
    glyph) would let ground read as a surface without competing with the sprites.
  - **Touch** (done in 0.6.1: `Input.drag`, `'TapUp'`, `Input.pointer`): Fjordheim pans by dragging and places with two
    taps. Still missing: pinch to zoom (needs zoom, below) and a long press for a second action.
  - **Zoom**: the view's scale is fixed (a base unit is the same size on screen at every detail level). An RTS wants to
    zoom out over the whole map; it would need a second, coarser scale for the view, not just for detail.
  - **Sprite contrast**: dark art (the Gemini buildings) turns into dim `#` blocks. Fjordheim lifts its palettes and picks
    the dense glyph by material (`games/fjordheim/tools/art.py`); a sprite option for both would serve every game.
  - **Pathfinding as an engine helper**: Fjordheim's A* over tiles (`findPath`, eight ways, no corner cutting) is general.
  - **Seasons for materials**: Fjordheim swaps ground albedo and paints snow itself; a material palette per season would
    be a small general feature.
  - **Pictures on the HUD** (done in 0.6.2: `hudSprite`): the build menu shows each building's own drawing as an icon.
    Still missing: a HUD cell background colour (icons and resource glyphs sit on black), and a 2D renderer that tints
    glyphs without a cached sheet per colour (it clears its cache past 96 colours; `hudSprite` rounds colours to stay
    under it).
  - **A message feed**: Fjordheim keeps its messages in a list under the top rows (6–10 s each, by length) instead of the
    engine's one-at-a-time `say()` toast (1.6 s). A `say(text, { time, colour })` that stacks would serve every game.

Each new game should need no engine edits. Every engine edit it forces goes on this roadmap.

## Phase 5: quality and performance

- **Deterministic simulation:** a seeded RNG in the engine (`Pixelite.rand`) for replays and
  reliable tests.
- **Performance** (the engine plan's P and E2 packages, HISTORY 54, engine 0.15.2):
  - ~~Profile lighting at RES 3 on large screens~~: `Pixelite.perf` (stage timers, F3), `tests/perf.py` (every game, both renderers, RES 2 and 3, two screen sizes).
  - ~~Cheaper inner loops (P3)~~, ~~lamps cached while nothing changes (E2)~~, ~~still frames reuse the sun, ambient and terrain shading (P2)~~ (exact: `tests/engine_cache.py`),
    ~~smaller pages: optional engine parts and `build --minify` (P6)~~.
  - **Open:** keep a lamp's cast across a camera move (the plan's "shift and fill the edge": needs a cast defined beyond the window, which the surface buffers do not cover); reuse
    of still frames that have fire, sparks or hot rock in the window (today the base still comes from the copy, the terrain is redone); `build:cloudflare` does not minify yet (the
    owner's call: `node tools/pixelite.mjs build --minify`, tested, about a fifth smaller). @@P4ROAD@@
  - Consider moving the light computation to a worker or to WebGL (P5: only with numbers that call for it; the caches come first).
  - ~~Cache sprite rasterisation when nothing changed~~: `drawSprite` `cache` (engine 0.6.0) for still sprites.
- **Tests:** turn the most useful scripts in `games/regolith/tests/` into a regression suite with
  pass/fail thresholds (landing tolerances, floating islands, clearance, sky smoothness, sprite timing)
  and run it in CI next to the smoke test.
- Accessibility: keyboard remapping, reduced motion (`CALM` exists), colour-blind safe HUD lamps.

## Backlog and known issues (Regolith Lander)

- **Stars in caves.** A 2D cross-section has no back wall, so caves show stars. Option: mask the sky
  below the terrain skyline (`colTop`) except where the cave opens to the sky, or paint a dark
  "back wall".
- **No chunk-to-chunk collision.** Falling pieces pass through each other, and boulders don't
  collide with chunks.
- **A chunk resting on the lander never freezes,** because the lander contact resets its rest
  timer. It freezes at the 20 s age limit, and could then overlap the lander.
- **Sliding.** Chunks slowly sliding down slopes keep moving until the 20 s limit. That is
  physically fine, but long.
- **The lander sprite at RES 1** has about 13×7 cells, too coarse to show detail.
- **The legacy tests** `test.py` to `test13.py` were written against earlier versions (the old
  lander shape, the pause overlay). They may need updating before use as regressions.
- **Music:** more pieces and per-site themes. The music director could crossfade.
- **Gameplay:** fuel pickups, more pad types, a campaign or score table, and a lander damage model
  where one leg breaks and the lander tips instead of crashing.
