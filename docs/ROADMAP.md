# Roadmap: from Regolith's code to the Glyphite engine

**Goal (from the user):** "I want this to become a custom made ASCII game engine … called Glyphite"
and "This game engine should work for any 2D game, not just a moon lander game." Regolith Lander
stays as the test game that exercises the engine.

**Status:** planned, not started. The user explicitly paused it: "Just update the game with the new
art for now. We build the complete game engine later." Don't start the refactor until asked.
Small steps toward it are fine when they serve a requested change.

## Principles to keep

- Printable ASCII only (32–126) for everything drawn, and one colour per cell.
- One self-contained HTML file per game, with no runtime dependencies. The engine can still be
  developed as separate files and bundled.
- Physics and lighting first. Every subsystem is authored in base units and scaled by detail
  (`RES`), so a game plays the same at every detail level.
- Both renderers (WebGL and 2D canvas) are first-class.

## Phase 1: separate engine and game (structure)

1. Split `src/` into `engine/` and `games/regolith/` (or similar). `build.sh` takes a game name and
   concatenates engine parts plus that game's parts. Keep the numbered, ordered-concatenation
   approach, or move to ES modules plus a tiny bundler step. Either way the output stays one file.
2. Give the engine a namespace (`Glyphite` or `G8`) instead of free globals. Do it gradually: start
   by exporting the public API from each engine part and stop the engine reading game globals
   (`L`, `LEVEL`, `state`, `cam`, `score`).
3. **Loop and boot:** `Glyphite.run({ init, update(dt), draw(t), hud(t), onKey })`. The engine owns
   the fixed-step accumulator, slow motion, detail switching (`setDetail`), resize, the
   slow-device hint and the hot-reload snapshot.
4. **Camera:** an engine object (`cam`) with follow and snap helpers. The game sets the target.

## Phase 2: data-driven world (behaviour)

1. **Material registry.** Replace the hard-coded `EMPTY…MAST` constants and parallel arrays with:
   ```js
   const ROCK = defineMaterial('basalt', {
     albedo, ramp, granular, tough, shiny, density, brittle, anchor,
     glow, glyphStyle: 'terrain'|'deck'|'mast'|'crystal'|fn,
     blast: { debris: 'grain'|'debris'|'vapor'|'pickup'|'none', fuseTo, pickupChance },
     exhaust: { scour, sublimate }
   });
   ```
   Then every engine reference to a specific material becomes a property lookup:
   - `getC`'s out-of-bounds value → a configurable boundary material.
   - `explode` (glass, ice vapour, crystal pickups).
   - Gas scouring and sublimation.
   - Render glyph styles (METAL, MAST, CRYST, ICE).
   - Crystal glow.
   - Chunk anchors, density, brittleness and crumble material.
2. **Particles:** keep the built-in VFX types and add a registry for game-defined types with their
   own update and collision callbacks. `PICKUP_PULL` becomes a type callback.
3. **Breakable structures:** turn the lamp hooks into a generic attachment system. Any game object
   can be attached to a voxel cell ("mount") and ride the chunk that cell ends up in. Callbacks:
   `born`, `moved`, `impact(vb, point)`, `frozen(placedCells)`, `gone`.
4. **Sky:** make the sky painter a game hook. The engine ships a starfield. Regolith adds the Earth.
   Other games could paint clouds, a gradient, or nothing.
5. **Lighting environment:** sun direction and colour, ambient colour and flash are already
   parameters. Expose them as `Glyphite.light.env`, and allow "no sun" for indoor or cave games.
6. **Gravity:** a per-game vector (`G` today is fixed and downward). Top-down games set it to zero.

## Phase 3: sprites and assets

1. **Generic sprite module.**
   - Move `src/10a_lander_art.js` into the engine as `defineSprite(SPRITE_X, { scale, origin,
     parts, glyphs })` plus `drawSprite(spr, x, y, angle, { partOffsets, snap, light })` and
     `markSpriteDyn`.
   - `tools/sprite2ascii.py` already writes the data format, `{ w, h, pal: [[r,g,b,ink,glyph]], rows }`.
   - Parts are pixel rules or rectangles, each with its own offset (legs, doors, turrets).
   - Animation frames: several `rows` arrays per sprite.
2. Optional collision helpers: generate hull points from a sprite silhouette automatically, as a
   convex-ish outline sampled every N pixels.
3. **Level and map import:** a tool that turns a PNG with a colour key into voxel materials, for
   hand-made levels.
4. Asset conventions: `ref/` for source art, generated data under `src/sprites/` or
   `games/<name>/sprites/`.

## Phase 4: prove it with more games

Build at least one more small game on the engine to check that it is game-agnostic:
- a side-view platformer with a walking sprite;
- a falling-sand sandbox;
- or a top-down game (gravity 0, no sun).

Each new game should need no engine edits. Every engine edit it forces goes on this roadmap.

## Phase 5: quality and performance

- **Deterministic simulation:** a seeded RNG in the engine (`Glyphite.rand`) for replays and
  reliable tests.
- **Performance:**
  - Profile lighting at RES 3 on large screens.
  - Consider moving the light computation to a worker or to WebGL.
  - Cache sprite rasterisation when nothing changed.
- **Tests:** turn the most useful scripts in `tests/` into a small regression suite with pass/fail
  thresholds (landing tolerances, floating islands, clearance, sky smoothness, sprite timing).
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
