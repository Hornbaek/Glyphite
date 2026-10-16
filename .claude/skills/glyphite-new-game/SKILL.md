---
name: glyphite-new-game
description: Make a new game on the Glyphite ASCII engine from an idea - pin down the design, scaffold it from the starter, build it with the engine API, expose tunables for the web editor, verify it in both renderers, add a thumbnail and notes, and open a pull request that puts it on glyphite.hornbaek.org. Also use it for big reworks of an existing game.
---

# Make a new Glyphite game

A Glyphite game is a folder `games/<id>/`: a `game.json` manifest, a few `.js` parts, optional `head.html`,
`thumb.png` and `NOTES.md`. The build assembles engine + game into one HTML page; the site lists it, plays it
and lets the user tune and edit it. Read `CLAUDE.md` (rules) and `engine/API.md` (what the engine offers)
first. `templates/starter/` (Cave Drone) shows every common piece in about 300 lines; `games/regolith/` shows
everything at full size.

## 1. Pin down the design (keep it short)

Write down, in a few lines: the player (a body? a cursor? several units?), the goal and how it is lost,
the controls (keyboard, mouse/tap, touch buttons), the world (side view with gravity? top-down with gravity 0?
cave without sun? sand and blasting?), and the look (palette, light). Ask the user only what changes the design;
pick sensible defaults for the rest and say which.

Map it onto the engine before writing code:
- **World** → materials (`defineMaterial`) + a generator that fills `cells` (`worldInit`, noise helpers,
  `settleIslands`). Do things fall and break? (`granular`, `STRUCTURES`, `anchor`, `worldMaterials`).
- **Actors** → `Body` with a hull (from `spriteHull` or traced) for things that fly, tumble and crash; a `Character` for
  anything that walks and jumps (platformer heroes, patrolling enemies: coyote time, jump buffer, step-up, wall jumps,
  one-way floors are built in). Draw them with `drawSprite` (`flip` for facing left, one sprite per animation frame) or
  glyph by glyph. `games/spacemouse/` is the walking reference.
- **Hand-made levels** → a tile map in a JS string (one character per 4 × 4 base-unit tile, the smallest square that is whole
  rows at every RES), built into cells and the back wall (`backCells`) per detail level, like `games/spacemouse/station.js`.
  Prove every map can be finished with a search over standing spots using the real controller (copy
  `games/spacemouse/levelcheck.js` and `tests/reach.py`): it finds the jumps that are a tile too far before a player does.
  Declare the maps in game.json (`"levels"`: file, legend with a colour per tile) and give `Glyphite.run` a `levels` hook
  (`play`, `check`): the site's editor then gets a LEVELS tab to paint, play and check them (engine/API.md, "Levels in the
  web editor").
- **Effects** → `explode`, built-in particles, `defineParticle` for pickups and the like, lights.
- **Gravity / sun** → `setGravity` (0 for top-down), `setSun(null)` for caves or indoors, `setAmbient`.
- **Anything the engine lacks** → add it to the engine as a *general* feature (with API.md and ROADMAP
  updates) only if another game could use it; otherwise keep it in the game.

## 2. Scaffold

```sh
node tools/glyphite.mjs new <id> --title "Game Title"    # id: lower-case, digits, dashes
```
This copies the starter, sets the id and title, lists it on the site (`listed: true`, status `draft`).
Edit `game.json`: `tagline` (one line), `description` (2–3 sentences for the game list), `controls`
(`[key, action]` pairs), `parts` (load order: data before the code that reads it at load time), and
`tunables` (below). Keep the starter's split (`world.js`, the actor, `main.js` with the hooks) or rename
parts as the game grows; delete what the game doesn't use.

## 3. Build the game

- Hooks go in one `Glyphite.run({...})` call at the end of `main.js`. Name hook functions `game*` (the build
  rejects names that clash with engine globals such as `update` or `draw`).
- States: `setState('title' | 'play' | ... )`. Provide `start()` so tests can leave the title screen, and a
  `probe()` that returns what a test would want to check (alive, score, level, position).
- Author sizes and speeds in base units × `RES`. Show speeds as `v * UNIT_M` m/s.
- `regenerate()` must rebuild the same level at the new RES (players switch detail with - and +).
- Touch: give `touch` buttons for every action, so the game works on a phone.
- **Tunables**: expose the 3–8 numbers a player would want to try (gravity, speeds, counts, difficulty,
  sizes). Each: `label`, `unit`, `value`, `min`, `max`, `step`, `help`, and `live: true` only if the running
  game reacts (read `TUNE.x` every step, or recompute in `onTune`). Never hard-code a number you exposed.
- Optional `"smoke": { "keys": [...] }` in `game.json`: the keys the smoke test holds and taps.

## 4. Verify (use the glyphite-verify skill)

```sh
node tools/glyphite.mjs build <id>        # SYNTAX_OK
python3 tests/smoke.py <id>               # both renderers, detail levels, no page errors → shots/
```
Look at the screenshots. Then play it headlessly with `Glyphite.test.step(n, keys)` and check that the goal can be
reached and lost (write a small probe script in `games/<id>/tests/` if the game has physics worth guarding). Check
RES 1 and 3 too. Fix what looks wrong; repeat.

## 5. Finish

- Thumbnail: `python3 tools/thumbnail.py <id> --play --steps 120 --keys ArrowUp` (or `--eval "…"` to stage a
  scene). Look at `games/<id>/thumb.png`; a good one shows the player in action and reads at 640 × 400. To let the
  tool choose, add `--auto 24 --every 15` (24 frames, 15 steps apart): it scores them for detail, colour and action,
  writes the best and a contact sheet `shots/thumb_<id>_candidates.png` to look over.
- `games/<id>/NOTES.md`: the design in a few lines, controls, tunables, decisions and known issues, so the next
  session can pick it up.
- Set `"status": "playable"` once it is fun from start to end.
- `docs/HISTORY.md`: a short entry. `docs/ROADMAP.md`: any engine gaps the game exposed.
- `npm run build && npm test && python3 tests/smoke.py --all`, then commit and open a pull request. Merging to
  `main` deploys it to glyphite.hornbaek.org.

## Self-review (always)

In your final message: what took the most iterations, what the engine made hard, and what you would add to the
starter or the engine so the next game is faster. If the answer is a change to this skill, the starter or
`engine/API.md`, make it.
