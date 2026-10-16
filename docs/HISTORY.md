# History: how Glyphite and Regolith Lander were built

All of this was built in one long working session on 14 October 2026, between Sebastian (the user)
and Claude, in the Claude app's cloud workspace. The game was published as a private claude.ai
artifact called "Regolith Lander", versions 1 to 7. The project then moved to Claude Code with this
archive. The user's requests are quoted, followed by what was built and the key decisions. Bugs and
their fixes are summarised here; `docs/LESSONS.md` has them in full.

Sections 1–9 use the file names of that time (`src/NN_*.js`, `build.sh`). Section 10 moved everything
into `engine/` and `games/regolith/`; the banner comment at the top of each part still matches.

---

## 1. The engine and the game

> "Make a small very simple game and physics engine that only renders in pure ASCII. Focus on physics
> and lighting. It should only be 2D. It should be playable in the browser. Make a simple game with it,
> it should be a moon lander game with voxel environment that reacts to collisions, rockets from the
> moon lander and more."

**Engine (first called REGOLITH, now Glyphite):**
- A single HTML page. Hitting the output-token limit while writing one big file led to splitting the
  source into `src/` parts that `build.sh` concatenates.
- A voxel world of materials, each with an albedo, a glyph ramp, a toughness, a shininess and a
  granular flag:
  - regolith (granular), basalt, bedrock (indestructible),
  - water ice, pad metal (indestructible), rubble (granular),
  - He-3 crystal (glows), impact glass.
  - The lamp-mast steel material came later.
- A granular cellular automaton that only runs in "awake" 16×16 chunks. It moves sand and rubble
  that has no support.
- A heat field: blasts and exhaust heat rock, which glows and cools.
- Rigid bodies (`Body`) with impulse contacts against the grid. Hull points come in three kinds:
  structure, foot and strut.
- Lighting:
  - Exact sun shadows from a column sweep.
  - Ambient occlusion and normals from summed-area tables.
  - Point lights by ray casting.
  - Ambient sky colour, then a tone map.
- The renderer turns each cell into one ASCII glyph plus a colour, chosen by material, light and
  surface normal: `/ \ | ~` on slopes and luminance ramps on flat ground.

**Game (Regolith Lander):**
- The lander has a throttleable descent engine, RCS rotation with attitude hold, fuel, and rockets
  that recoil.
- Eight landing sites named after real lunar sites, with a different sun elevation and amount of ice
  at each. Each site has craters, mesas, caves (from site 3), x1/x2/x3 pads and meteor showers
  (from site 2).
- Exhaust gas scours regolith and sublimates ice. Rockets and meteoroids carve craters.
- Scoring: pad multiplier, fuel bonus and soft-landing bonus. Three lives.
- HUD styled after the Apollo DSKY caution lamps: ALT, VEL, ATT, FUEL, CONTACT, 1202 (slow
  frame rate) and METEOR.

Notable fixes: contact skin for resting contacts, because landings never registered at first; no
lander self-shadowing; no "dust mote" halos, because there is no air to scatter light.

## 2. Particles and VFX

> "It should also have particle and VFX effects"

- A struct-of-arrays particle system with ten types: grain, gas, fire, spark, smoke, vapor, debris,
  pickup, wreck and dust. Grains and debris turn back into voxels when they stop, so no mass is lost.
- `explode()` carves voxels with noise and per-material toughness. It heats the crater rim and can
  fuse it to glass. It throws ejecta and adds a fireball, sparks, smoke, a shock ring, a light flash,
  screen shake and slow motion.
- Optional bloom (G key). Heat shimmer that jiggles glyphs over hot gas.

## 3. Higher resolution

> "Can we start adjusting the 'resolution' to be more detailed. So I guess lower the font size of the ASCII?"

- Added the detail scale `RES` ∈ {1, 1.5, 2, 2.5, 3}. Every physical quantity is authored in base
  units and multiplied by RES, so a finer grid shows **more detail of the same world** instead of
  zooming out.
- Levels are generated in base units, so every detail level builds the same landscape.
- Detail controls: the DETAIL button, the `-`/`+` keys, a default chosen from screen width, a
  setting saved in localStorage, and a "running slow, press -" hint.
- The renderer moved to WebGL: one full-screen pass samples a glyph atlas. There is a 2D-canvas
  fallback, and WebGL that is software-emulated (SwiftShader, llvmpipe) falls back to 2D.
- The HUD got its own coarser grid, so text stays readable at any detail level.

## 4. Spotlights

> "Add some downward spotlights to light up the ground."

- Lamp masts beside each pad, ceiling lamps under the x3 overhang, and survey lamps across the plain
  (more of them at dark polar sites).
- Cone lights with a soft window `(1-(d/r)²)²` and smooth edges. Light soaks a little way into the
  ground (`soakLen`), so pools of light read on the regolith.
- The lander has a floodlight and two landing lights, which L toggles.
- Fixes: the x2/x3 pads were narrower than the lander, so pads were widened. At high detail only a
  thin band of ground was lit, so a sun-soak table (LSSAT) was added.

## 5. 8-bit music from MIDI

> "Build an addition to the engine. It should be able to play 8-bit music, using midi as inputs"

The **Chip** is a fantasy NES 2A03 rendered sample by sample:
- Pulse channels with 12.5/25/50/75% duty, a 32-step triangle, and 15-bit LFSR noise.
- The console's non-linear DAC, plus 37 Hz high-pass and 14 kHz low-pass filters.

It reads Standard MIDI Files (format 0/1, with a tempo map):
- One chip lane per MIDI channel.
- Chords become 60 Hz arpeggios.
- Channel 10 becomes noise drums through a General MIDI drum map.

Playback renders audio in short blocks scheduled just ahead of the play head, so no AudioWorklet is
needed. There is live **MIDI IN** through Web MIDI, a **LOAD MIDI** button and drag-and-drop.

An original soundtrack was written as code (`tools/compose.py`): a title theme, the in-game descent
loop, and touchdown and loss jingles.

The **music director** switches pieces by game state. Beacon lights blink on the beat. The V key
shows sound-chip meters.

Fixes: a stop/play race, solved with a token; `busy()` never going idle; a drum-routing typo; meter
text spacing.

## 6. Object physics: breakable structures and damped legs

> "Add some physics to object. E.g when I send a rocket at a light post, it should break of from where
> it was hit and fall off. Such things should be implemented. The landers legs should also function as
> dampeners."

**Breakable structures** (`src/09c_chunks.js`):

*How a piece breaks off:*
- After a blast, `structuralCheck` flood-fills support in a region around it. Anchors are the
  region's border plus indestructible materials.
- Every solid island left without support becomes a **chunk**. A chunk is a rigid body that carries
  its own voxel grid; its centre of mass and inertia come from per-material density.
- Crumbs of two cells or fewer fall as grains. Islands of pure sand are left to the sand simulation.
  Islands bigger than 2600·RES² cells stay put.

*What a falling piece does:*
- Chunks collide like the lander. Hard impacts chip off the cells nearest the contact if the
  material is brittle. Steel bends rather than chips.
- A chunk turns back into voxels after resting for 0.6 s, or after 20 s at most. A lamp riding on
  it is re-mounted on the frozen cells, or dies.

*How blasts push pieces:*
- Pressure acts only on cell faces that look toward the blast, along the face normals.
- For rockets and meteors, the push is centred a little behind the impact, along the flight path.
- Spin is clamped.
- So a post cut near its foot is kicked at the cut and topples, while a small fragment flies off.

*Lamps:*
- A lamp whose mount is on a chunk rides along, still shining.
- It only breaks if *its own end* hits the ground hard.

*Follow-ups:*
- A delayed recheck 0.9 s after each blast catches structures undermined by sliding regolith.

**Spring-damper legs** (`legForces` in `src/09_game_sim.js`):
- Each leg is a strut from a knuckle to a footpad. Three rays per leg run down the strut to find the
  ground. They are marched, then **bisected**, so compression is smooth.
- Force is `k·x + c·ẋ`, where `ẋ` is the pad's closing speed taken from the body's motion, not from
  a finite difference. The pad has Coulomb friction.
- Once the stroke is used up, rigid "bottom-out" hull points take the load. They sit just inside the
  contact skin, so behaviour is the same at every RES.
- Outcomes:
  - Under 1 m/s: soft-landing bonus.
  - Up to about 3.5 m/s: survivable. Past 85% of the stroke you get "HARD LANDING".
  - About 4.5 m/s and up: "GEAR COLLAPSED — TOUCHDOWN x M/S".
- The CONTACT lamp now lights from the struts.

**Bugs found while testing:**
- *Hovering masts.* Several lamp masts were hovering: the regolith under them slid away during
  level settling. Masts now have a **footing** driven into rock.
- *Floating terrain.* The new support check revealed islands left floating by level generation:
  cave roofs cut loose by tunnels, and ice crusts. They would have collapsed at the first nearby
  blast. `settleIslands` now drops them straight down, lowest first, ignoring gaps inside an island.
  Anything still floating gets a basalt column. Ice is placed after settling, and caves stay away
  from the x3 roof.
- *Missing roof.* The x3 pad's **roof had never existed**: clearing the pad's airspace erased it.
  It is now built after the pads.
- *Unbreakable posts.* Lamp-mast toughness was 1.25, too high for a rocket (power 1.15) to cut.
  It is now 0.8.

## 7. Choppy stars

> "Is there a reason the moon surface move smoothly, but the stars and the background is very choppy?"

- **Cause:** stars and the Earth were drawn into the world grid. That grid scrolls by sub-cell
  amounts, but the stars' own slow parallax was rounded to whole cells. They rode along with the
  ground for a cell, then snapped back: a sawtooth jitter.
- **Fix:** a separate **sky layer** with its own sub-cell offset, drifting at 5% of the camera speed
  (`SKY_PAR`). It is rebuilt only when it moves a whole cell.
  - Empty world cells now carry glyph 0 (transparent). The sky shows through those, per pixel in
    WebGL and through an occupancy mask in 2D. Glyph 32 is an opaque blank.
- The title-screen rule text was also corrected after the leg change: "Land on a pad. Under 1 m/s
  pays extra."

## 8. The lander from pixel art

> "Make the lander look like this" (a pixel-art Apollo-style lunar module, now `ref/lander_ref.png`)

**Turning the image into a sprite:**
- The reference was resampled onto its 48×50 pixel grid by sampling block centres, so the
  anti-aliased seams between blocks are ignored.
- Each pixel was snapped to a curated 15-colour palette (`tools/art.py` → `src/10a_lander_data.js`).
  Two of the colours are outline colours.

**Drawing it as ASCII** (`src/10a_lander_art.js`):
- Every cell takes 3×6 samples of the sprite in the lander's own frame, so the drawing rotates with
  the body.
- Solid cells get a dense glyph per material: hull `#`, bright metal and the window `@`, foil `%`.
- Silhouette cells get the best-matching symbol from `.,'`-_=:;|/\()[]<>^v+~"!*`. The match is
  against glyph masks rendered from the game font. Letters are excluded because they read as noise.
- Black outline on the silhouette becomes dark gaps between characters. Outline inside the body
  counts as paint and darkens its cell. Cells that are mostly panel line become blanks.
- A cell's colour is 65% its main paint colour and 35% the average, which keeps thin details crisp.
  The palette goes through the inverse of the tone curve, and the sprite is lit by the scene with a
  floor so it never goes black.
- The drawing is pinned to whole cells horizontally. Vertically, the **soles of the footpads** snap
  to a row boundary, so a landed lander stands right on the deck.
- The legs are separate parts of the sprite. Each one slides up its strut by the damper's
  compression.

**Physics and level changes to match the sprite:**
- New physics geometry measured from the sprite at 0.28 base units per pixel, origin at pixel
  (24, 28): knuckles at (±3.92, 1.96), feet at (±5.46, 6.16), pad half-width 1.26.
- New hull points traced from the silhouette.
- The lights, exhaust, RCS puffs and rocket launch points moved to match.
- The x3 roof was raised from 9·S to 10.5·S. The taller lander has 2.5–4.5 base units of clearance
  under the roof lamps at every detail level.

## 9. The engine gets its name; moving to Claude Code

> "This workflow must be turned into a skill, as many more 2D pixel art image should be converted to ASCII
> along the way. Evaluate if something might be done more efficient and also add that self evaluation
> into the skill to always try to improve it. … I want this to become a custom made ASCII game engine in
> the end. Come up with a name for the engine."
>
> "This game engine should work for any 2D game, not just a moon lander game."
>
> "I like the name glyphite. Just update the game with the new art for now. We build the complete game
> engine later :)"
>
> "I'll move this session to Claude code. Create a zip with this game … a complete description of what
> we've done here and what the goal is: to create a complete game engine called Glyphite and we are
> building a test game moon lander to try it out. The zip should also include the skills you creates."

- The name **Glyphite** was chosen: glyph + graphite, drawing with characters, and it keeps the
  mineral naming of Regolith. The user approved it.
- Added `tools/sprite2ascii.py`, a generic pixel-art → sprite converter. It finds the drawing's box
  from alpha, estimates the grid from flat runs plus anti-aliasing seams, samples block centres, and
  builds the palette with k-means plus an accent rescue.
- Wrote the skills `glyphite-pixel-art-to-ascii` (with its efficiency review and self-improvement
  loop) and `glyphite-verify`.
- Made all paths in the archive relative to the repo root.
- The engine/game separation is planned (`docs/ROADMAP.md`) and deliberately not started.

## 10. Installed in the repository; the engine becomes an engine (Claude Code, 2026-10-15)

> "Unpack and "install" this project in the repo. Start converting it into a game engine. It should be
> accessed behind Cloudflare login and live on glyphite.hornbaek.org. I want to be able to see a list of
> games there, the first one being the moon lander and I want to be able to edit them..the engine should
> be an AI first engine, where I run sessions here to create the games. Do the conversion to game engine
> now after install"

- **Install.** The archive went into `hornbaek/glyphite` verbatim as one commit, then moved into the new
  layout: `engine/` (11 parts, `engine.json`, `shell.html`, `API.md`), `games/regolith/` (its parts, art,
  music, tools and tests), `templates/starter/`, `portal/`, `worker/`, `tools/`, `tests/`.
- **The engine conversion** (roadmap phases 1 and 2, most of 3):
  - The engine no longer reads any game global. `Glyphite.run({...hooks})` boots a game; the engine owns the
    loop, camera, detail levels, built-in keys, touch buttons (declared by the game) and states.
  - Registries replace hard-coded game content: `defineMaterial` (every material-specific branch became a
    property: anchors, creep, fusing, vapour, glyph styles, glow, blast callbacks), `defineParticle`
    (Regolith's He-3 shards), `addMount` (Regolith's lamps riding falling masts), `defineSprite` (the lander
    renderer, generalised), sky hooks (Regolith's Earth), `setSun(null)`, `setAmbient`, `setGravity`.
  - Tunables: numbers a game exposes in `game.json`, read from `TUNE`, changed live by the editor.
  - `Glyphite.test` (start, step with keys, press, freeze, render, probe) for tests and AI sessions.
- **Regolith Lander** moved onto the API with identical behaviour: landing sweeps at RES 1/2/3, tilted and
  drifting landings and the x3 clearance give the same numbers as before; no floating islands at any level
  or detail; the roof and lamp-post collapses still work; the lander sprite renders pixel-identically.
- **The starter game, Cave Drone** (`templates/starter/`): a drone in a sunless cave at 3 m/s², its own
  materials, sprite, particle type and tunables. `node tools/glyphite.mjs new <id>` copies it.
- **The site** (`portal/`): the game list, the games, and a web editor per game with three tabs: TUNE
  (sliders, live), CODE (engine and game sources in CodeMirror, rebuilt in the browser with the same
  assembler as the build, errors mapped to source lines), CLAUDE (a prompt plus a `git apply` patch for a
  Claude Code session; edits stay in the browser until then).
- **Cloudflare.** A Worker (`worker/`) serves the site on glyphite.hornbaek.org behind Cloudflare Access and
  verifies the Access token itself; it fails closed. GitHub Actions builds, unit-tests and smoke-tests every
  game on each pull request (`docs/DEPLOY.md`).

> "The Cloudflare thing, look at horn-dev repo or hornbaek-site how we done it before."

- Matched to those repos: Cloudflare Workers Builds deploys `main` (`npm run build:cloudflare`, then
  `npx wrangler deploy`), no deploy token or deploy job in GitHub, CI on pull requests only, `.nvmrc`, an
  empty `previews` block. The Access check now follows hornbaek-site's admin: `ACCESS_TEAM_DOMAIN` and
  `ACCESS_AUD` in `wrangler.jsonc` (the same team, `round-smoke-a734`), an optional `ALLOWED_EMAILS`
  dashboard variable, a localhost-only `DEV_EMAIL`, the token from the header or the `CF_Authorization`
  cookie, verified with WebCrypto (no `jose` dependency).
- **AI-first docs:** a new `CLAUDE.md`, `engine/API.md`, the `glyphite-new-game` skill, updated
  `glyphite-verify` and `glyphite-pixel-art-to-ascii` skills, per-game `NOTES.md`.

## 11. The idea bank (Claude Code, 2026-10-15)

> "Meanwhile, try to imagine all features this engine could/should have. No idea is to crazy or to small. I
> want them all as inspiration."

- A multi-agent brainstorm: 14 agents each took one angle (rendering, light, physics, world, gameplay, genres,
  audio, AI-first authoring, runtime AI, editor, platform, input and accessibility, wild experiments,
  architecture) for 1,184 raw ideas. Curators merged duplicates per category group, three critics added what
  was still missing (completeness, personas, small delights and moonshots), and a last pass removed ideas
  that turned up in two categories. Result: **1,133 ideas** in 17 categories, each with a size and a wildness.
- `docs/IDEAS.md` holds them; `ROADMAP.md` stays the plan and links it. A browsable version (search, filters,
  stars, "copy starred as a prompt" for a session) was published as a claude.ai artifact, "Glyphite Idea Bank".

- **Access goes live (2026-10-15).** The Access application for glyphite.hornbaek.org exists; its AUD tag is
  in `wrangler.jsonc` (`vars.ACCESS_AUD`), so the Worker now accepts sign-ins instead of answering 503.

## 12. The idea bank on the site (Claude Code, 2026-10-15)

> "Add the idea bank into the site too as a button. I want to be able to highlight ideas and set a status on them
> so we can work on them from here. Perhaps this should be added into a database on Cloudflare?"

- **Data in the repository.** The 1,133 ideas are `docs/ideas.json` (stable ids); `docs/IDEAS.md` is generated from it by
  `tools/ideas.mjs`. The build copies the JSON to `dist/ideas/ideas.json`.
- **A page at `/ideas/`**, opened by an **IDEA BANK** button on the game list: search, filters (status, size, wildness,
  category, starred), a star, a status and a note on every idea, all saved at once and rolled back with a message if a
  save fails.
- **Cloudflare D1.** A new database `glyphite` (binding `DB`, table `idea_state`, `migrations/0001_idea_state.sql`) holds
  only what we decided. `worker/ideas.js` serves `GET /api/ideas` and `PUT /api/ideas/<id>` behind the Access check;
  writes need an `X-Glyphite` header and an id that exists in `ideas.json`.
- **Sessions use the same table** through the D1 connector: `CLAUDE.md` ("The idea bank") says how to read what is
  starred or planned and how to set `building` and `shipped` as work goes on.

## 13. Ideas from the idea bank, tried in Regolith Lander (Claude Code, 2026-10-16)

> "I've marked some ideas from the idea bank as planned and I want to test develop them and try them out in the moonlander
> game. Will you change status on them when you have implemented them so I can test them out?"

- **Batch 1, lighting (engine 0.3.0).** From the planned ideas: *Light visibility queries for gameplay* (`sunAt`, `isLitBy`),
  *Sun colour from airmass or kelvin* (`setSun(el, { kelvin })`, `setAtmosphere`), *Stars twinkle through air, fade near
  lamps* and *Auto-exposure eye adaptation* (`setEyeAdaptation`). Regolith gets the tunables **Atmosphere (test)** and **Eye
  adaptation** and `[SUN]` / `[LAMP]` warning lights. `tests/engine_light.py` checks them in both renderers. Statuses in the
  idea bank are set to *Building* when work starts and *Shipped* when the pull request is merged and deployed.
- **Batch 2, audio and beat (engine 0.4.0).** *Thunder delayed by distance* (`Sfx.heard`: with an atmosphere a sound arrives
  after distance / 343 m/s, quieter and duller, far blasts add a rumble; in a vacuum nothing changes) and *Beat-reactive
  emissive materials and bloom* (`Beat`, `setBeatPulse`, material `beatGlow`). Regolith: the He-3 veins flash on drum hits,
  the pad beacons flare, the bloom swells (tunable **Beat pulse**); the beat-synced beacons moved from the game into the
  engine (`Beat.blink`); `listener` hook so blasts are heard from the lander. `tests/engine_audio.py`.
- **Merging.** "Don't wait for my merge at this stage, just merge. We are so early in dev, it does not matter for now." From
  here the session merges its own pull requests once CI is green (`CLAUDE.md`, "Shipping changes"); batches 1 and 2 had been
  merged after a go-ahead each.
- **Batch 3, the site.** *What's-new page built from HISTORY.md* (`tools/changes.mjs` writes `changes.json` at build time;
  `/whats-new/` renders it, newest first, with a "recently merged" list; the game list gets a WHAT'S NEW button with a NEW
  marker and UPDATED badges on cards, both remembered per browser). *A Glyphite micro-game as the 404 page*: `games/notfound`,
  where a lander crashes into the missing address spelled out in rock; the Worker serves it, with status 404, to browsers
  asking for a missing page. *Auto-pick the most interesting thumbnail frame*: `tools/thumbnail.py --auto N --every K` scores
  candidate frames (lit area, contrast, colour, highlights, motion, particles) and keeps the best, with a contact sheet of the
  top six. Tests: `tests/node/changes.test.mjs`, `tests/node/notfound.test.mjs`, `tests/notfound.py`, `tests/thumbnail_pick.py`.

## 14. Space Mouse, the second game (Claude Code, 2026-10-16)

> "Go ahead with the platformer. You should play as a space mouse in an abandoned space station looking for cheese"

- **The game** (`games/spacemouse`): Pip, a mouse in a space suit, crosses three sectors of a dark, abandoned station
  (Cargo Bay, Hydroponics, Observation Deck) looking for the great cheese at the end of each. Run, variable-height jumps,
  wall slides and wall jumps; eat through cheese walls (and cheese floors), collect crumbs, light checkpoints; stomp the
  patrolling cat-bots (their blast cracks walls open); rusted panels crumble under the mouse, a gantry falls with it, live
  cables and broken glass kill; a low-gravity spacewalk on the outer hull; a cheese moon in every window. The sectors are
  hand-drawn tile maps (`sectors.js`, one character per 4 × 4 base-unit tile), so they build the same at every detail level.
  Tunables: gravity, jump height, run speed, air control, wall jumps, cat-bot speed, station light.
- **Engine 0.5.0**, general features the game needed, from the idea bank: the `Character` controller (*Platformer character
  controller kit*), the back wall (*Back wall that catches offset shadows*), light `flicker` presets and `Sfx.buzz` (*Light
  flicker and pulse presets*), material `oneWay`, `drawSprite` `flip`, `checkSupport`.
- **Tests:** `games/spacemouse/tests/mechanics.py` (jump height and run speed match the tunables at RES 1–3, eating, rust,
  catwalks, stomp and side catch, cables, the goal) and `games/spacemouse/tests/reach.py`, a search with the real controller
  over every place the mouse can stand, which proves each sector can be finished with every crumb and checkpoint reachable.
  It caught five level-design mistakes on the way (catwalks too far apart, a cable jump too tight under a low ceiling).
  `tests/engine_audio.py` stops the music while it measures the beat glow (real drum hits made it flaky).

## 15. A level editor in the web editor (Claude Code, 2026-10-16)

> "And for the platform again, I want to be able to edit the levels in like a 2D pixel editor that represents the levels."

- **LEVELS tab** (`portal/assets/levels.js`, core in `levels-core.mjs`): for games that declare `"levels"` in game.json (a map
  file and a legend: name and colour per tile), each map is a grid of coloured squares. Pen, rectangle, flood fill, picker, pan
  and TEST tools, left and right colours, zoom (Ctrl + wheel), grid, undo and redo, resize, PNG export and import (one pixel per
  tile, in the legend's colours, for any pixel editor), revert. Signs and low-gravity zones show as overlays.
- Painting edits the map file's **draft**, the same one the CODE tab edits, so the preview runs it and the CLAUDE tab hands it
  over as a patch. **PLAY THIS MAP** restarts the preview on that map; the **TEST** tool drops the mouse on the tile you click.
  **CHECK** runs Space Mouse's completability search on the map you are painting and circles what can't be reached.
- Engine: the preview announces `glyphite:ready` to the editor and takes `glyphite:level` messages (play, check), handled
  through a new `GAME.levels` hook. Space Mouse's search moved from its test into the game (`levelcheck.js`), so the editor and
  `reach.py` share it. CI now runs the editor test and the search on every sector.

## 16. Space Mouse in the art sheet's style (Claude Code, 2026-10-16)

> "Update the graphics of the space mouse with these" (with an art sheet: station layouts, the mouse's animations, cheese,
> props, tiles with hazard stripes, moss, red cables, cobwebs, amber lamps, a blue planet in the windows)

- **The mouse** is cut from the sheet (`games/spacemouse/ref/art_sheet.png`) by `games/spacemouse/tools/art.py`: six frames
  (idle, walk, run, jump, look up, look down) found as the drawings in the sheet's mouse row, the dark background flood-filled
  away, converted with `tools/sprite2ascii.py` and a curated palette (`tools/mouse_palette.json`: one dense glyph per material,
  and a brighter display colour for the dark helmet glass, which vanished in the gloom), lined up on the helmet. It writes
  `mouse_sprite.js`; edit the palette or the tool, not that file. Walking alternates the walk and run drawings; standing still
  looks up now and then; holding Down looks down.
- **Cheese crumbs** are the sheet's wedge (a single glyph at RES 1 and 1.5). **Ten props** from the sheet (lockers, terminal,
  potted plant, sofa, barrel, toolbox, wall screen, fan box, B3 sign, gas tank) are new map tiles (`k m p h o t g f b n`),
  decoration drawn in front of the wall and never solid, placed around the three sectors and in the LEVELS legend.
- **The station**: decks are worn plates with rust and yellow-black hazard stripes, window frames, amber lamps, grey wall
  panels that show in the dark, moss on the walls; `decor.js` hangs moss strands and red cable loops under ceilings, grows
  tufts on floors and spills moss over ledges, and spins cobwebs in corners (worked out from the map, so alike at every
  detail). The sky is a big blue planet with a bright rim and a small cheese moon.

## 17. Cat-bots, more moves for Pip, and the station's objects from three more sheets (Claude Code, 2026-10-16)

> (three sheets from ChatGPT and Gemini: the cat-bot's patrol walk, alert, chase run and shorted out; Pip's wall slide,
> falling, landing squash, eating, zapped and victory; a cheese checkpoint beacon off and on, the great cheese on a pedestal,
> ceiling lamps off and on, a red alarm beacon, hatches, a ladder and a lift)

- `games/spacemouse/tools/art.py` now cuts all four sheets (in `ref/`) and writes `sprites.js` (was `mouse_sprite.js`). The
  cut keeps pieces above a size fraction (drops labels, sweat drops, motion lines), removes the wall drawn behind the wall
  slides and fills the see-through helmet glass back in. The second mouse sheet draws Pip larger: it is scaled to the first
  sheet's pixels and matched with `tools/mouse_palette_actions.json`, the same materials drawn in the same colours.
- **Pip**: clings to walls while sliding (facing the wall), tumbles on falls longer than 1.3 jumps, squashes on hard landings,
  chews while biting, flashes with its glowing skeleton when a cable gets it, and holds the cheese up when a sector is cleared.
- **Cat-bots**: twelve frames replace the hand-drawn one: patrol walk, an alert pose (it stops for a moment when it spots the
  mouse), the chase run; the eye glow sits on the art's eyes. A shorted cat-bot leaves a wreck that sparks, then lies there.
- **Objects**: the checkpoint is a cheese beacon that lights up; lamps are strips that light with their flicker; the alarm is a
  red dome turning under the ceiling; hatches (`d` shut, `e` open: an open one where Pip enters each sector) are props.
- **The great cheese** is a wheel on a pedestal, drawn as tall as the `G` area on the map, standing on its floor; reaching it
  clears the sector (`atGoal`, shared by the game and the reach search). The `GREAT` material is gone.
- The ladder and the lift wait for climbing and moving platforms in the engine (ROADMAP).

## Published versions (claude.ai artifact "Regolith Lander")

| Version | Content |
|---|---|
| 1–3 | Engine + game, particles/VFX, detail levels, WebGL renderer |
| 4 | Spotlights, Chip music engine with MIDI |
| 5 | Breakable structures, spring-damper legs, settled levels, x3 roof fix |
| 6 | Smooth sky layer |
| 7 | Lander drawn from the pixel-art sprite |
