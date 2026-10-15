# Roadmap: the Glyphite engine

**Goal (from the user):** "I want this to become a custom made ASCII game engine … called Glyphite",
"This game engine should work for any 2D game, not just a moon lander game", and (2026-10-15) an
**AI-first** engine: games are made in Claude Code sessions, listed on glyphite.hornbaek.org behind a
Cloudflare login, playable and editable there. Regolith Lander stays the reference game.

**Status (2026-10-15):** phases 1 and 2 are done, phase 3 is partly done, and the site, editor and
deployment exist. Next: prove the engine with a second real game (phase 4).

This file is the plan. [`IDEAS.md`](IDEAS.md) is the idea bank: a large brainstorm of everything the engine
could have, to pick from when planning. Move an idea here when it is chosen.

## Principles to keep

- Printable ASCII only (32–126) for everything drawn, and one colour per cell.
- One self-contained HTML file per game, with no runtime dependencies. The engine can still be
  developed as separate files and bundled.
- Physics and lighting first. Every subsystem is authored in base units and scaled by detail
  (`RES`), so a game plays the same at every detail level.
- Both renderers (WebGL and 2D canvas) are first-class.

## Done (2026-10-15, see HISTORY section 10): phases 1 and 2, most of phase 3

- **Structure.** `engine/` (ordered parts, `engine.json`) and `games/<id>/` (`game.json` manifest); a Node
  build (`tools/glyphite.mjs`) replaced `build.sh`. The engine no longer reads game globals; games hand it
  a hook object through `Glyphite.run`. The engine owns the loop, slow motion, detail switching, resize,
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
  no sun, gravity 3, its own materials and sprite), `glyphite new`, the `glyphite-new-game` skill,
  `Glyphite.test` (start/step/press/freeze/probe), `tests/smoke.py` for any game, `tools/thumbnail.py`,
  tunables in `game.json`.
- **Site.** Game list, play pages, the web editor (tune live, edit code with an in-browser rebuild, hand
  edits to Claude as a prompt plus a patch), a Cloudflare Worker with an Access check, CI and deploy.

## Phase 3, still open: sprites and assets

1. **Animation frames:** several `rows` arrays per sprite, chosen per draw call.
2. **Level and map import:** a tool that turns a PNG with a colour key into voxel materials, for
   hand-made levels.
3. **Sun from any side:** `setSun` only lights from the left (the sweep walks columns left to right);
   mirror the sweep for light from the right.
4. **Gravity as a vector:** `G` is downward only. Top-down games set it to zero, which works, but
   sideways gravity (or per-body gravity) is not possible yet.

## Editor and site ideas

- Commit from the editor directly (a GitHub token or a Worker endpoint opening a pull request), so a
  small tweak doesn't need a Claude session.
- Talk to Claude from the editor (the Worker calling the Claude API with the game's sources), turning
  "make the lander heavier" into a draft change in the preview.
- Shareable preview links for drafts (store them in KV/R2 behind Access).
- Per-pull-request preview deploys of the site.

## Phase 4: prove it with more games

Build at least one more small game on the engine to check that it is game-agnostic:
- a side-view platformer with a walking sprite;
- a falling-sand sandbox;
- or a top-down game (gravity 0, no sun).

Each new game should need no engine edits. Every engine edit it forces goes on this roadmap. The
starter (Cave Drone) already runs without a sun, at a different gravity, with its own materials,
sprite and particle type; a full game is the real test.

## Phase 5: quality and performance

- **Deterministic simulation:** a seeded RNG in the engine (`Glyphite.rand`) for replays and
  reliable tests.
- **Performance:**
  - Profile lighting at RES 3 on large screens.
  - Consider moving the light computation to a worker or to WebGL.
  - Cache sprite rasterisation when nothing changed.
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
