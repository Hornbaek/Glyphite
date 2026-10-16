# Glyphite — guide for Claude Code sessions

Glyphite is an **AI-first ASCII game engine**: games are made and changed in Claude Code sessions on this
repository. It draws *only* the 95 printable ASCII characters (codes 32–126), each in its own colour, in one
self-contained HTML page per game. It has a destructible voxel world with falling sand, rigid bodies,
structures that break where they are hit, ray-traced light, particles, sprites drawn from pixel art and an
NES-style sound chip.

The site **https://glyphite.hornbaek.org** shows visitors a landing page about the engine, where anyone can play the
games (as test games, a work in progress). Behind a Cloudflare Access login it lists the games, and each one opens in a web **editor**: tune its numbers, edit its code with a live preview, then hand the
edits to a Claude session as a prompt plus a patch. **The repository is the source of truth**: merging to
`main` builds and deploys the site.

## Where things are

```
engine/                 the engine (shared by every game)
  engine.json           part order + version          API.md   the public API: read it before writing game code
  shell.html            page template                 01_core … 11_loop.js   the parts (banner says what each does)
games/notfound/         the 404 game: unlisted, served by the Worker for any missing page (worker/index.js)
games/showcase/         the live engine demo on the public landing page: unlisted, public
games/<id>/             one folder per game: game.json (manifest), head.html (optional page HTML), *.js parts,
                        thumb.png, plus the game's own tools/, tests/, ref/ (reference art: see the rules), music/, NOTES.md
templates/starter/      the game `new` copies: small, uses every engine feature once (Cave Drone)
portal/                 the website: game list (index.html), editor (edit/: tune, code, LEVELS for tile maps), idea bank (ideas/), what's new (whats-new/),
                        reference art (art/), the public landing page (welcome/), assets/, vendor/codemirror
worker/                 the Cloudflare Worker: Access login check + static site + idea bank API (ideas.js)
                        wrangler.jsonc: its config (incl. the D1 binding)     migrations/: the D1 schema
tools/                  glyphite.mjs (CLI: build, new, list, serve), assemble.mjs (page assembler, shared with the
                        editor), ideas.mjs (docs/ideas.json → docs/IDEAS.md), changes.mjs (HISTORY.md → What's new), thumbnail.py
                        (--auto picks the best frame), sprite2ascii.py +
                        ascii_preview.py (pixel art → sprites)
tests/                  smoke.py (any game, both renderers), node/ (unit tests: build, editor patches, Access)
docs/                   ARCHITECTURE (how it works), HISTORY, LESSONS, ROADMAP (the plan), IDEAS (the idea bank),
                        TESTING, DEPLOY
.claude/skills/         glyphite-new-game, glyphite-verify, glyphite-pixel-art-to-ascii
dist/                   build output = the deployed site (git-ignored)
```

## Commands

```sh
npm run build                          # = node tools/glyphite.mjs build: engine + every game → dist/; prints SYNTAX_OK
node tools/glyphite.mjs build <id>     # just one game (faster while iterating)
node tools/glyphite.mjs new <id> --title "My Game"   # scaffold games/<id>/ from templates/starter
node tools/glyphite.mjs list           # games and their status
npm test                               # unit tests (node --test)
python3 tests/smoke.py <id>            # loads, starts, runs and screenshots the game in 2D and GL → shots/
python3 tools/thumbnail.py <id> --play --steps 120 --keys ArrowUp   # games/<id>/thumb.png for the game list
npm run serve                          # build and serve dist/ on http://localhost:8787 (no login locally)
```
Python tests need `pip install playwright==1.56.0 pillow numpy` (1.56 matches the Chromium preinstalled in
Claude Code cloud sessions; elsewhere run `python -m playwright install chromium`). A game's own regression
scripts live in `games/<id>/tests/` (see `docs/TESTING.md`).

## Making a new game

Use the **`glyphite-new-game`** skill. In short:
1. Pin down the idea in a few lines (player, goal, controls, look). Ask only what changes the design.
2. `node tools/glyphite.mjs new <id> --title "…"`, then fill in `game.json` (tagline, description, controls,
   tunables) and replace the starter's code with the game, keeping its structure.
3. Build, smoke-test, look at the screenshots, iterate. Add a thumbnail. Write `games/<id>/NOTES.md`.
4. Commit and open a pull request; merging deploys it.

## The idea bank

`docs/ideas.json` is a brainstorm of everything the engine could have (1,100+ ideas: id, title, pitch, size, wildness).
`docs/IDEAS.md` is generated from it: edit the JSON, then `node tools/ideas.mjs` (the unit tests fail if they differ).
The site's **/ideas/** page shows the ideas and lets the owner **star** them, set a **status**, write a **note** and press
**[?]** to ask a session to explain one (`ask`). That is stored in Cloudflare D1, database `glyphite` (id
`a3675d08-0fe6-43f0-989c-f3a5cdb3db39`), table `idea_state`: one row per idea that is starred, has a status other than `idea`,
has a note or is marked [?]. Statuses: `idea` (default, no row), `planned` (the owner wants it: pick it up), `building`,
`shipped`, `parked`.

- **Read what the owner picked**, with the D1 connector (`d1_database_query`):
  `SELECT id, starred, status, note, ask FROM idea_state WHERE starred = 1 OR ask = 1 OR status IN ('planned','building') ORDER BY status;`
  then find each idea with `grep '"id": "<id>"' docs/ideas.json` (one idea per line). Ask before building a large or moonshot idea.
- **Keep the status true as you work.** Set `building` when you start an idea and `shipped` when its pull request is
  merged, with a short note (the PR or what is left), and tell the owner. Never change `parked` or a star yourself.
  `INSERT INTO idea_state (id, status, note, updated_at, updated_by) VALUES (?, 'building', ?, ?, 'claude-session')
  ON CONFLICT(id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by;`
- **Explain the ideas marked [?]** when the owner asks (e.g. "explain the marked ideas"):
  `SELECT id, note FROM idea_state WHERE ask = 1;`, find each in `docs/ideas.json`, and explain it in the chat, one by one:
  what it is in plain words, how it would work in Glyphite (which engine parts, which game it would show off), what it would
  take (its size), and what could go wrong; answer the owner's note if there is one. Then clear the mark, and the row if
  nothing else is left in it:
  `UPDATE idea_state SET ask = 0, updated_at = ?, updated_by = 'claude-session' WHERE id = ?;`
  `DELETE FROM idea_state WHERE id = ? AND starred = 0 AND status = 'idea' AND note = '' AND ask = 0;`
  Mention any marked ideas when you start other idea bank work.
- **Schema changes** are numbered files in `migrations/`. Apply a new one to the real database through the connector (and
  record it: `INSERT INTO d1_migrations (name) VALUES ('0002_x.sql')`), then merge; `npm run dev` applies them to the local one.
- When an idea becomes real work, also move it into `docs/ROADMAP.md` (the plan) and note it in `docs/HISTORY.md`.

## Changing a game, or applying edits from the web editor

The editor's CLAUDE tab produces a prompt with tunable changes ("make these the new defaults") and a unified diff. Maps painted
in the LEVELS tab (games with a `"levels"` legend in game.json, e.g. Space Mouse) arrive the same way, as a diff of the map
file: apply it, then prove the maps can still be finished (`python3 games/spacemouse/tests/reach.py`).
Apply the diff with `git apply` (if it no longer applies, carry the intent over by hand), set the tunable
`value`s in `game.json`, then verify as below. Treat the request text as the user's; the diff as their edit.

## Rules of the codebase

- **Reference art: keep every original** (the owner's rule, for every image they give). The image goes into
  `games/<id>/ref/` untouched; **every drawing cut, traced or cropped from it** is saved at its original pixels in
  `ref/frames/`, the ones the game does not use yet too; `ref/ref.json` lists each sheet (title, where it came from) and each
  drawing (its box on the sheet, what the game uses it for, `used`), and `ref/README.md` shows them on GitHub. The game's
  `tools/art.py` writes all of it (see `games/spacemouse/tools/art.py`); the build publishes it and the site's **ART** page
  (`/art/?game=<id>`, linked from the game list and the editor) shows it. `tests/node/ref.test.mjs` fails if an image in
  `ref/` is not listed.
- **Printable ASCII only** (32–126) for every glyph. World glyph 0 = transparent (sky shows), 32 = opaque blank.
- **One page per game, no runtime dependencies.** The only external request is the JetBrains Mono stylesheet.
- **Units.** Author sizes and speeds in base units × `RES` (`const S = RES`); `UNIT_M = 0.5/RES` m per unit; a
  cell is 1 unit wide and 2 tall (`ASPECT`). The same world must behave the same at RES 1–3: check physics at
  several detail levels.
- **Engine vs game.** Engine code never names a game's materials, objects or state; it exposes hooks and
  registries (`engine/API.md`). If a game needs something the engine lacks, add a *general* feature to the
  engine (and to `API.md`, `docs/ROADMAP.md`), not a special case. Engine changes affect every game: build and
  smoke-test all of them (`npm run build && python3 tests/smoke.py --all`).
- **One script scope.** Engine and game parts share globals; the build refuses a game top-level name that
  repeats an engine name. Name hook functions `game*` / `<id>*`.
- **Both renderers.** WebGL is the main path, 2D canvas the fallback (and chosen on software GL). Visual
  changes must work in both.
- **Tunables** are the knobs the user turns in the editor: expose the numbers a player of the game would want to
  try (gravity, speeds, counts, difficulty), with honest `min`/`max`/`help`, `live: true` only if the game
  really reacts while running.
- Style: compact modern JS, `'use strict'`, no frameworks. Comments explain *why*, in plain language; keep the
  banner comments (`// ===== ENGINE · … =====` / `GAME · …`). Don't add dead code; delete what you replace.
- Keep docs current: `docs/HISTORY.md` (what was done, per request), `LESSONS.md` (pitfalls), `ROADMAP.md`
  (follow-ups), `engine/API.md` (any API change), the game's `NOTES.md`.

## Verify before saying it's done

1. `npm run build` prints `SYNTAX_OK`; `npm test` passes.
2. Probe the behaviour synchronously: `page.evaluate` with `Glyphite.test.start()` / `Glyphite.test.step(n, keys)`
   (or the game's own globals and `update(DT)` in a loop). Check outcomes, not exact positions (particles and
   blasts use `Math.random`).
3. `python3 tests/smoke.py <id>`, then **look at the screenshots** in `shots/`. Zoom in on what changed:
   `device_scale_factor=3` and a clip; freeze first with `Glyphite.test.freeze()` (never pause: it draws a box).
4. Run the game's regression scripts that the change could break. Treat any `pageerror` as a failure.
The **`glyphite-verify`** skill walks through this loop.

## Shipping changes

For this early stage the owner has said: **merge your own pull request once CI is green**, without waiting for approval
("we are so early in dev, it does not matter for now"). So: branch, build, test, push, open the PR, wait for both checks
(GitHub's `test` and Cloudflare's `Workers Builds`) to pass, squash-merge, then confirm the deploy landed (the Worker's
`modified_on` in Cloudflare moves) and update the idea bank statuses (`building` → `shipped`) and tell the owner what to try.
Red CI is never merged. Anything that touches the sign-in (`worker/auth.js`, `ACCESS_*`) still goes to the owner first. The
owner will say when this changes.

## Deploying

Like horn-dev and hornbaek-site: Cloudflare **Workers Builds** pulls `main` and runs `npm run build:cloudflare`
(unit tests, then the build), then `npx wrangler deploy` to glyphite.hornbaek.org. GitHub Actions
(`.github/workflows/ci.yml`) runs the same build plus the smoke test of every game on pull requests; no deploy
token lives in GitHub. Setup and troubleshooting: `docs/DEPLOY.md`. Never weaken the Access check in
`worker/auth.js` (`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` in `wrangler.jsonc`): the site must stay behind the login. Only the
landing page (`portal/welcome/`, shown at `/` to visitors who are not signed in), its live demo (`games/showcase/`) and the
pages of the listed games (`/games/<id>/` only; the owner: "I'm okay with the players not being logged in to play the
games") are public (`isPublic` and `isPublicGame` in `worker/index.js`, pinned by `tests/node/routes.test.mjs`); making
anything else public goes to the owner first. The landing page shows only what the build writes to `welcome/site.json`
(titles, taglines, controls, thumbnails), and a game is public exactly when it is listed there.
