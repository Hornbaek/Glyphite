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

## 18. Reference art: every original kept, and an ART page (Claude Code, 2026-10-16)

> "I want you to save all the "original" frames you processed and traced, so I can see them on the project as reference
> material. That must be the case for all graphical materials I give you that you process and make ready to convert to ASCII."

- **The rule** (CLAUDE.md, the pixel-art skill): an image the owner gives goes into `games/<id>/ref/` untouched, and every
  drawing cut, traced or cropped from it is saved at its original pixels in `ref/frames/`, used in the game or not, listed in
  `ref/ref.json` (the sheet, the drawing's box on it, what the game uses it for) and `ref/README.md`.
- **Space Mouse**: `tools/art.py` now keeps all 91 drawings on its four sheets, including the 40 the game does not use: the
  three station layouts, the other cheese wedges, the pickup, crate and door, more props, the tiles and platforms, ladders,
  decorations, three more mouse poses, a second lamp, the half-open hatch, the ladder and the lift. Regolith's lander image
  is listed too.
- **The ART page** (`/art/?game=<id>`, an ART button on the game list and in the editor): each sheet with a box over every
  drawing (solid: in the game, dashed: not yet; pointing at one lights its drawing), and the drawings at their own pixels with
  their names, sizes, boxes and uses; filters for all, in the game, not used yet. The build copies `ref/` to the site
  (`games.json` says how many sheets and drawings each game has). `tests/node/ref.test.mjs` fails if an image is not listed.

## 19. A public landing page (Claude Code, 2026-10-16)

> "I want to create a landing page for the game engine … So when someone that is not logged in using the Cloudflare login
> … I want them to see like a landing page of what is the Glyphite engine and what can it do and what the goal and
> everything like that." (The owner chose: the landing page at the main address, Access only on `/login`; visitors read
> about it and watch a live demo, the games stay private.)

- **The landing page** (`portal/welcome/`): what Glyphite is, the engine running live in the page, what it can do, how a
  game gets made, the games (titles, taglines, thumbnails: `welcome/site.json`, written by the build), the goal, and LOG IN.
- **The live demo** (`games/showcase/`, unlisted): GLYPHITE spelled in rock, sand pouring onto it, lamps, and meteors that
  break it into falling chunks; click or tap to drop one. Sized to the view, so a phone sees the whole word.
- **Who sees what** (`worker/index.js`): `/` is the game list when signed in and the landing page otherwise; `/welcome/…`
  and `/games/showcase/` are public; everything else needs the sign-in (a browser is sent to `/login?next=…` and back,
  files and the API get a 401). `tests/node/routes.test.mjs`. Signed in, the game list has an ABOUT button to the landing
  page.
- **To open it**, the owner changes the Glyphite Access application to cover only `/login` (`docs/DEPLOY.md`, section 5).
  Until then nothing changes for visitors: Cloudflare still asks everyone to sign in first.

## 20. Anyone can play the test games (Claude Code, 2026-10-16)

> "I'm okay with the players not being logged in to play the games, but write that they are a work in progress, just
> test games."

- **The listed games are public** (`worker/index.js`, `isPublicGame`): the page of every game on the landing page
  (`/games/<id>/`, from the build's `welcome/site.json`) is served without the sign-in. Only the page: its `game.json`,
  sources and reference art, unlisted games, the editor, the idea bank and the ART pages still need it. If the list cannot
  be read, no game is public. `tests/node/routes.test.mjs`.
- **The landing page says so**: the games section opens with a work-in-progress note ("these are test games, made to try
  out the engine as it grows"), each card carries a TEST GAME · WORK IN PROGRESS tag, its controls and a PLAY button, and
  the main buttons point to the games instead of the login (LOG IN stays in the top bar, for the editor and the idea bank).

## 21. Ask Claude to explain an idea (Claude Code, 2026-10-16)

> "Some ideas I feel need more explanation. When I read those, I need to be able to mark them to ask you to elaborate on
> them here."

- **[?] on every idea** (`/ideas/`): next to the star, it marks the idea for a Claude session to explain. A marked card gets
  a gold line along its foot, the console has a "? To explain only" filter, and the counts say how many are waiting.
- **Stored with the rest** in D1: a new `ask` column (`migrations/0002_idea_ask.sql`), read and written by the API like the
  star (`worker/ideas.js`); an idea that is only marked keeps its row until the mark is cleared.
- **What a session does** (`CLAUDE.md`, "The idea bank"): asked to explain the marked ideas, it reads them from D1, explains
  each in the chat (what it is, how it would work in Glyphite, what it would take, what could go wrong) and clears the mark.

## 22. A skill for art prompts (Claude Code, 2026-10-16)

> "For writing the prompts for art generation, add the experience you get here to a skill, so we can reuse that workflow
> later :)"

- **`glyphite-art-prompt`** (`.claude/skills/`): how to write the prompt the owner pastes into ChatGPT or Gemini for a
  game's art sheet. Decide the game and the view first; leave out what the engine draws itself; one scale (the main
  character's height); about 50 drawings per sheet with a row plan that fits; a fixed rules block (flat magenta
  background, labels clear of the drawings, a fixed pixel grid, outline-only near-black, no effects, everything facing
  right); follow-up sheets matched to the first; and a check of the sheet before converting it. Each rule names what
  went wrong on the Space Mouse sheets without it.
- **First use**: the Viking homestead game, a peaceful settlement builder. The owner first got a side-view prompt,
  then chose an isometric view ("I want it to be isometric view"). So the skill also covers isometric:
  - the 2:1 camera, ground tiles and footprints in tiles;
  - two facings, flipped for the other two;
  - a two-sheet split.

  The two prompts and their row budgets are in `example-viking-homestead.md`; the engine work isometric needs is on the
  roadmap (phase 4). The two rendering ideas explained before it (blue-noise dithering, chromatic aberration)
  wait, with the explanation in their idea bank notes.

## 23. The Viking sheets checked, and a sheet checker (Claude Code, 2026-10-16)

The owner sent the two isometric sheets for the Viking homestead (Gemini, JPEG). Checked with the skill before cutting:
labels clear, every drawing a separate piece, iso angle and palette right. But:
- the background came raspberry instead of magenta, close to the red art;
- most "NE" poses face the viewer;
- walks have 3 frames instead of 4, and two-frame actions 1;
- the ravens are near-black;
- a few items are missing or extra.

- **`tools/sheetcheck.py`**: the mechanical part of that check in 3 s. It reports the background and its noise, the cut
  tolerance that stays inside the outlines, labels close to drawings, and near-black or white drawings. It also writes
  a numbered boxes image and the drawings' boxes as JSON for `tools/art.py`.
- **`glyphite-art-prompt`**: the lessons, folded into its rules. It now:
  - spells out the background colour;
  - asks for exactly N separate figures and nothing extra;
  - describes NE as seen from behind;
  - gives sizes relative to the adult and the tile only;
  - adds an item-by-item count to the check.

## 24. Fjordheim, an isometric homestead builder (Claude Code, 2026-10-17)

The owner asked for "a small rts game ... inspired by anno 1404 and settlers 6. No fighting, just build a base and leave
peacefully with nature. Build a homestead for a new family in the Viking Age in Scandinavia", isometric, and sent three
Gemini sheets (ground, buildings and nature; the family, animals, boats and goods; and a fix sheet with the walks seen
from behind, slate ravens, the drying rack, a meadow tile and a small rock).

- **The game** (`games/fjordheim/`): Ulf, Sigrid and little Eir land on an empty shore. The player chooses what to build
  and where (nine buildings, 1–9 or the build bar, click to place); the family does the work itself, like in The Settlers:
  - adults build first (a worker leaves the hut to build and goes back), then take the empty workplaces (woodcutter,
    fisher, sawyer, farmer), then break stone; the farmer breaks stone between sowing and reaping; the child picks
    lingonberries;
  - every dawn they eat; in winter the longhouse burns two wood a night, and a winter night without a roof is cold. Three
    hungry or cold days and the family sails home; reach the second spring and the homestead stands;
  - newcomers arrive by knarr when there are free beds and food to spare (after the first, only to a homestead with a
    well);
  - nature: woodcutters plant a tree for every two they fell, stumps sprout and saplings grow; the deer leave if the forest
    falls below 85% of what it was. Seasons repaint the ground (autumn grass, snow) and the birches.
- **The art**: `tools/art.py` cuts 92 drawings from the sheets (labels masked, the raspberry keyed out, its halo peeled)
  into `ref/frames/` and the 70 it uses into `sprites.js`. Three fixes on the way: labels touching a drawing were cut in with
  it (now masked), the JPEG's magenta bled into every outline (`unpink`), and the dark buildings needed a dense glyph per
  material and a palette lift to read.
- **Engine 0.6.0**:
  - `engine/12_iso.js`: an isometric ground grid painted into the back wall, `isoPick`, `isoOutline`, `isoDraw` (back to
    front);
  - `drawSprite`: skips sprites off screen, and `cache: true` works a still sprite out once per detail level (about 230
    trees cost under 1 ms);
  - input: `'TapAlt'` for a right click (no browser menu); `mouseAim()` is null until the mouse moves over the canvas and
    once it leaves. It used to return the top-left corner until then, which slid Fjordheim's view into the corner and made
    Regolith aim at the corner for the first six seconds.
- **Tests**: `games/fjordheim/tests/playthrough.py` (a bot builds through the build bar and the map, and must reach the
  second spring; an idle player must lose), `ui.py` (real mouse: edge scroll, build bar, placing, right click) and
  `look.py` (screenshots).

## 25. Fjordheim on a phone (Claude Code, 2026-10-17)

The owner tried Fjordheim on an Android phone: "The controls needs some update on phone." The screenshot showed the four
scroll buttons on top of the build bar, which wrapped into four rows. With no cursor, there was no way to see where a
building would go, and help, speed and pause were keys only.

- **Engine 0.6.1**, for any game:
  - `Input.held` and `Input.drag`: a finger or mouse button down, and how far it moved since the last step;
  - `'TapUp'`: a tap let go where it began, so a game that pans by dragging can act on taps without a drag counting as one;
  - `Input.pointer`: `'mouse'` or `'touch'`, what was used last (it starts as `'touch'` on a phone).
- **Fjordheim**:
  - drag to scroll, replacing the arrow buttons;
  - on a touch screen the first tap on the map shows where the building would stand (outlined green or red, with why
    not), and a second tap there builds it;
  - `[>>]` and `[?]` buttons on the top row, `[CANCEL]` while choosing;
  - the build bar and the info on a framed panel; on a phone its rows sit a row apart and take taps a row around them,
    and the last row stays clear of the gesture bar;
  - the title, help and end texts wrap to the screen;
  - the hills round the map are quieter (a sparse material of their own instead of the scree's `o`).
- **Tests**: `games/fjordheim/tests/phone.py` plays on an emulated Pixel 7 with real touch events (tap, drag, tap-tap,
  the buttons). `ui.py` now waits on game steps, not seconds: the headless 2D canvas can take half a second a frame.

## 26. Buildings and the knarr turned the right way (Claude Code, 2026-10-17)

The owner: "We need to fix some orentations... Both the ship and the house orients strange." The screenshot showed two
problems. The longhouse lay crosswise to its outline, because the drawing's long side runs down-left while its 3 × 2
footprint runs down-right. The knarr's hull lay along one diagonal while the ship sailed almost straight up the screen.
Buildings and fields were also pinned by their middle, so they floated above or beside their footprints.

- Every building, building site and field now stands with its drawing's lowest point (the front corner of its base) on
  its footprint's front corner, and is mirrored when its long side runs the other way from the footprint's
  (`onFoot` in `games/fjordheim/art.js`). The longhouse and the well are mirrored; the rest stand as drawn.
- The knarr sails along the fjord, parallel to the shore, the way its (mirrored) drawing lies. It comes in from the
  right, moors three tiles off the landing, and sails on up the fjord to the left. It is a little smaller (3 tiles long).
- No new art was needed. The thumbnail is redrawn.

## 27. Ready for a session on Fjordheim alone (Claude Code, 2026-10-17)

The owner will develop Fjordheim in a session of its own. `games/fjordheim/NOTES.md` now opens with "Start here": what
each file holds, the commands and tests, how to probe the game, and how the owner works. It ends with ideas for what
could come next. Two helpers moved into the repo from the scratch folder:
- `games/fjordheim/tests/buildings.py`: every building on its outlined footprint, in one sheet;
- `games/fjordheim/tools/thumb_scene.js`: the thumbnail's scene.

`docs/TESTING.md` lists the game's tests, and `CLAUDE.md` points to a game's NOTES.md before changing it.

## 28. Pause and tear down; a BUILD menu with pictures; icons for the goods; news that stays (Claude Code, 2026-10-17)

The owner, playing on a phone: "you need to be able to set buildings to destruct ... a building I have active, for example
the saw pit, I want to be able to deactivate that so I don't use all the wood ... the way I'm selecting buildings, I don't
want it to look like that. I want it to be small ... a button you open ... small icons and the titles and the resources
they need. And I want resources to have icons as well ... maybe we can work with colors ... messages that appear should
stay a little bit longer." Their screenshot showed the build bar filling a fifth of the phone and the toast cut off.

- **A building's panel**: click or tap a building (on its drawing: the roofs rise far above the footprints, so picking by
  the ground tile missed them) for its picture, how it is doing, `[PAUSE]`/`[RESUME]` and `[TEAR DOWN]`, which asks
  first. A paused workplace lets its worker go to other work and gets nobody until resumed (a fisher at sea comes in; what
  anyone carries goes into the store); with every field paused there is no farmer. Tearing down gives back half the cost
  (all of it for a site: "call off"), frees the tiles, lets go of its people, and the tile grid is re-pointed.
- **BUILD**: one small button at the bottom left (`B`) opens a menu of the nine buildings, each with its own drawing as a
  small picture, its name, its cost and what it is for. The placing and the building panel open from the same spot.
- **Icons for the goods**: a glyph in a colour of its own (`=` wood, `#` planks, `@` stone, `*` food, `&` folk, `^`
  forest), on the top row, in the costs (red where the stock is short), and in the colour of the "+1 WOOD" over a worker.
- **The news**: messages stack under the top rows, up to four, each for 6 to 10 s by its length (the toast was 1.6 s and
  one at a time), and wrap to a phone's width.
- **Engine 0.6.2**: `hudSprite(spr, c, r, w, { rows, flip, gain })` draws a sprite as a small picture on the HUD, fitted
  into a box, its colours rounded so the 2D renderer's cache of tinted glyph sheets stays under its 96.
- **Tests**: `games/fjordheim/tests/manage.py` (pausing, tearing down, the tile grid, picking by the roof, the news);
  `playthrough.py` builds through BUILD and the menu; `ui.py` and `phone.py` open the menu and call off a site through its
  panel with real mouse and touch events, and `phone.py` checks the menu's two columns fit 54 columns. The thumbnail is
  redrawn.

## 29. Glyphite becomes Pixelite; the ASCII version is kept (Claude Code, 2026-11-07)

> "I'm okay with changing the name to Pixelite. I mean, we can just save it, you know, as an old branch in this in the
> repo. ... we will convert it completely to pixel art instead, because I don't think it works that well with ASCII as the
> graphical interface. So yeah, let's do that and keep all the mechanics."

The owner found the ASCII look too dark (a glyph covers only part of its black cell, so even bright colours read dim) and
chose to move the engine to pixel art under the name **Pixelite**, keeping every mechanic. The plan, in five pull requests:
this rename; a pixel renderer (solid cells, dithered shading, a bitmap HUD font) with the glyph APIs kept as hints so no game
breaks; square cells (`ASPECT = 1`); pixel sprites with normal maps and a PIXEL LAB admin page (Pixel Snapper for cleaning
AI art, our own normal-map generator); Space Mouse converted fully. See `docs/ROADMAP.md`.

- **The ASCII version is kept** on the branch `glyphite-ascii` (the last commit of Glyphite 0.6.2).
- **Renamed in code and docs**: the global `Glyphite` is now `Pixelite` (`Pixelite.run`, `Pixelite.test`), the CLI is
  `tools/pixelite.mjs`, the skills are `pixelite-*`, the editor's messages are `pixelite:*`, the idea bank's header is
  `X-Pixelite`, and the site, the landing page, the showcase word and the logo say PIXELITE. Engine 0.7.0.
- **Kept on purpose**: the domain glyphite.hornbaek.org, the Worker and D1 database names (`glyphite`), the Access app, the
  GitHub repository, the idea ids (they key the D1 rows) and the browser storage keys (so drafts, saves and "seen" marks
  survive). Moving the domain is a later step with the owner. Older entries in this file keep the old name.
- The Python Playwright for cloud sessions now has to match the preinstalled Chromium, 1.63.0 (CLAUDE.md says how to check).

## 30. The pixel renderer (Claude Code, 2026-11-07)

The second step of the move to pixel art (section 29): the engine draws pixels instead of characters, and every game runs on
it unchanged. Cells are still 1 unit wide and 2 tall (square cells come next, so the physics is untouched in this step).

- **Every world cell is one pixel.** The glyph atlas is gone: the WebGL shader and the 2D canvas draw each cell as a block of
  its colour, and the alpha byte only says whether the cell holds anything. Cell codes stay, so old drawing calls work: 0
  empty, 32 the background colour, `SOLID` (127) a plain pixel, and a printable character a pixel as bright as that
  character is dense (`INK`), so dust drawn with `.` stays fainter than a `#`.
- **Pixel-art shading** (`shadeCell`): the light on a material is cut into a few flat shades (`shades`, default 5) or picks a
  colour of its own `palette`, with a bright top edge on lit surfaces, a dark underside, brighter girder joints and
  twinkling crystal facets; the cell's texture is applied after the cut, so walls are flat colour with a little grain. The
  glyph `ramp` is ignored. This is the idea bank's *Cel-shaded light bands*.
- **The HUD uses the engine's own pixel font**: 95 characters drawn 5 × 9 in `tools/pixelfont.py` (which writes the packed
  data into the engine and can draw a preview sheet), scaled by whole pixels, with box lines that join across cells. Game
  pages load no web font any more: they make no external requests at all.
- **Sprites** are resampled to the world's pixels (each cell the colour most of the art under it has).
- `setBackground(r, g, b)` sets the colour behind everything (it was fixed near-black).
- **Fixed on the way:** the eye adaptation measured the shaded colours, which depend on the exposure, and stuck at its
  maximum (`tests/engine_light.py` caught it); it now measures the brightness before shading.
- **Verified:** build, unit tests, the smoke test of every game in both renderers, `tests/engine_light.py`,
  `tests/editor_levels.py`, Space Mouse's `mechanics.py` and `reach.py`, all of Fjordheim's tests, Regolith's checks.

## 31. Square pixels (Claude Code, 2026-11-07)

The third step of the move to pixel art: a cell is now one square pixel, 1 unit each way (`ASPECT = 1`; the ASCII engine's
cells were 2 units tall). The world is the same size in units and metres, with twice the rows, so pixel art is no longer
stretched. Engine 0.9.0.

- **Engine.** Everything written in units carried over. What counted cells was fixed: sand rests at the same angle (it
  slides down a side only while two cells below are free), the normal and ambient-occlusion boxes keep their size in units,
  light splats are round, glowing materials and hot ground give the same light per area, stars keep their density, blast
  pushes and chunk sampling use the cell's real shape, characters keep their 2-unit step and unstick reach, sprites take
  3 × 3 samples per cell (HUD pictures keep 1 × 2 cells).
- **Games.** Every level generator measured heights in rows; those numbers doubled (Regolith's world is 300 rows tall at
  RES 1, its craters, mesas, pads, masts, caves and the x3 roof keep their size; the starter cave; the 404 page), the letters
  of the showcase and the 404 page are square pixels, Earth and Space Mouse's planet and moon are round, and Space Mouse's
  bites eat an area, not a number of cells.
- **Speed.** Twice the cells cost about 40% more per frame in Regolith (shading and light); the tone curve and the shade
  bands are now lookup tables, which took most of the rest back.
- **Tests.** The star twinkle check in `tests/engine_light.py` now holds the exposure still: with more ground on screen,
  Regolith's eye adaptation eased during the series and dimmed the stars by 4%, which the check read as twinkling.
- **Verified:** build, unit tests, the smoke test of every game in both renderers, the light, editor and 404 tests, Space
  Mouse's mechanics (jump, speed, eating, rust, catwalks at RES 1–3) and reachability, all of Fjordheim's tests, Regolith's
  floating-island, x3-clearance, lamp-post, roof-drop, real-time and lander-sprite checks.

## 32. Pixel sprites with normal maps, and the PIXEL LAB (Claude Code, 2026-11-07)

> "I will also attach some repos which I want you to implement as tools in the admin interface, like so you can use them to
> refine your pixel art. One of them is making AI-generated pixel art more crisp and pixel art correct, and the other one is
> to create a like a normal map onto the pixel sprites, so you can, when you have lighting in the scene, they actually
> respond to it a bit more realistic, even though it's still pixel art."

The owner pointed at Sprite Fusion's Pixel Snapper and at Moonfell's normal-map tool. Moonfell's site could not be reached
from the session, so the owner chose a normal-map generator of our own. Engine 0.10.0.

- **Normal maps in the engine.** A sprite may carry `normals` (base 36 into `SPR_NORMALS`: facing the viewer and rings
  tipped 20°, 42° and 65°). The light pass keeps where each cell's lamp light comes from (`LDX/LDY`); a lit sprite pixel is
  brighter where its normal faces the light (the sun, the lamps, a little sky from above) and darker facing away, up to about
  a third either way; a flat pixel is lit exactly as before. `tests/engine_light.py` checks it in both renderers.
- **The generator** (`portal/assets/normalmap-core.mjs`, also `node tools/normalmap.mjs`): height from the distance to the
  silhouette (a rounded bevel) plus the paint's own light and dark, then the slope. Defaults bevel 3, detail .8,
  strength 2.5: a 2-pixel bevel only tilted the dark outline and hardly showed.
- **Pixel Snapper** (MIT) built to WebAssembly into `portal/vendor/pixel-snapper/` (`tools/build-snapper.sh`), also
  `node tools/snap.mjs`. It cut every grid line a pixel short (a sliver at the end of every image); our patch
  (`tools/pixel-snapper.patch`) fixes it, and is worth offering upstream.
- **The PIXEL LAB** (`/lab/`, behind the login; linked from the game list and the ART page): open an image or pick a drawing
  from a game's reference art, snap it (colours, pixel size, palette), tune the normals with a lamp that follows the pointer,
  download the PNGs, and copy a prompt with the exact commands for a session. `tests/lab.py` drives it in CI.
- `tools/sprite2ascii.py` is now `tools/pixelsprite.py` (same output; the palette's glyph field is ignored);
  `tools/ascii_preview.py` is gone. The `pixelite-pixel-art-to-ascii` skill became `pixelite-pixel-art` (snap, palette,
  normals, one art pixel per world pixel); `pixelite-art-prompt` asks for sprites at the size the game shows them.
- **Tests:** `tests/node/pixeltools.test.mjs` (PNG, snapping, the generator, the engine's table and relief rule are the
  generator's), `tests/lab.py`, the normal-map checks in `tests/engine_light.py`; the routes test pins `/lab/` behind the login.

## 33. Space Mouse in pixels (Claude Code, 2026-11-07)

The last step of the move to pixel art for now: Space Mouse, the game the owner asked to convert first. Engine 0.11.0.

- **Normal maps on every sprite**: `games/spacemouse/tools/art.py` now gives each sprite its `normals` (through
  `tools/normalmap.mjs`, the PIXEL LAB's generator); the mouse's and cat-bots' frames pass them to `defineSprite`. The
  drawings themselves are unchanged (the rerun rewrote `sprites.js` with the same rows, plus the normals).
- **Sprites drawn small, the pixel-art way** (engine): Pip's 28-pixel drawing is 14 pixels tall at RES 2, and taking each
  cell's most common colour made speckle of its thin inner outlines. Now the outline wins only on the silhouette and the
  paint wins inside. This helps every game's sprites (the lander, Fjordheim's people).
- **Light from the side**: the light a normal map sees now leans less toward the viewer (0.35 instead of 0.6 of its
  strength), so lamps model the drawings visibly; the PIXEL LAB preview uses the same.
- **What it still needs** (NOTES, ROADMAP): art drawn at the size the game shows it, the sheet's moss and cobwebs as decor,
  palettes for the station's materials.
- **Verified:** build, unit tests, the smoke test of every game in both renderers, the light and lab tests, Space Mouse's
  mechanics (RES 1–3) and reachability, Fjordheim's UI test, Regolith's lander renders; zoomed screenshots of Pip at RES 2
  and 3 before and after.

## 34. A better Pixel Snapper, and Pixel Art Lighter in the PIXEL LAB (Claude Code, 2026-11-07)

> "I found the GitHub to the pixel snapper … Can you please dig into that and make sure our version works as good or
> better" · "I also found the pixel art lighter. Check that too"

- **Pixel Snapper, measured and rebuilt.** A benchmark of 262 images: synthetic sprites at 2–8 image pixels per art
  pixel (clean, blurred, JPEG, jittered, all at once) plus the Space Mouse and Fjordheim sheets. Upstream (02f9315, still
  its latest) found the right grid on 20 by itself and 63 with the size given; with our first patch (the forward
  difference) 41 and 113. `tools/pixel-snapper.patch` now also replaces its step guess, walker and stabiliser with a
  **lattice fit** (one square step, a phase per axis, edge energy explained minus a cost per line, cuts nudged to the
  nearest strong edge): 115 by itself, 197 with the size given. With the size given, 100% of the pixels come out right
  on clean and jittered art, 91–93% on blurred or JPEG art, 80% with everything at once (upstream: at most 22%).
  Fractional sizes (3.2) work and a given size is followed exactly. On real AI sheets no version guesses reliably, so the
  skill says to give the size. The WebAssembly in `portal/vendor/pixel-snapper/` is rebuilt from it.
- **Pixel Art Lighter** (Red Hat Sprite, MIT, made for Moonfell RPG), the owner's upload, is vendored at `/lab/lighter/`
  (behind the login), unchanged except its analytics beacon, so it makes no outside requests. Compared with our generator
  on the same sprites, its faceted, outline-aware maps read more like hand-made pixel art on hard shapes (the well, the
  hatch). So:
  - the PIXEL LAB links to it and **loads a normal map** made there (checks the size, snaps it to the engine's 33
    directions, lights the preview, and the prompt says `node tools/normalmap.mjs --from-map … --rows`);
  - our generator borrowed its key idea: **outlines are style, not shape**. Dark outline pixels take the brightness and
    then the direction of the paint beside them, so lines no longer carve ridges. Space Mouse's sprites were regenerated
    (only their `normals` changed).
- **Tests:** two snapper tests (fractional sizes; the guess on busy art), outline merging and map import in
  `pixeltools.test.mjs`; `tests/lab.py` loads a map and opens the Lighter; the routes test keeps `/lab/lighter/` behind
  the login. `tests/engine_light.py`'s star check allowed 3% for the level's pulsing lamps and failed now and then at
  3.4%: it allows 5%.
- **Verified:** build, unit tests, `lab.py`, the smoke test of every game in both renderers, the light test, Space
  Mouse's mechanics and reachability, the level editor test.

## 35. The site on pixelite.hornbaek.org too (Claude Code, 2026-11-07)

> "I think I fixed the steps in cloudflare. Is it ready to deploy?"

The owner added `pixelite.hornbaek.org/login` to the existing Access application in the dashboard (same AUD) and renamed
the Worker from `glyphite` to `pixelite` (same Worker, same id). Here, `wrangler.jsonc` takes the new name (they must match
or every build fails; the D1 database keeps its old name and id) and the second custom domain, so the deploy attaches it; both addresses serve the same site, and
glyphite.hornbaek.org keeps working as before. No redirect yet: it waits until the owner has signed in on the new address
(`docs/DEPLOY.md` section 6, `docs/ROADMAP.md`). The Worker's code is unchanged; it never depended on the hostname.

## 36. The SOUND STUDIO: 16-bit music for the games (Claude Code, 2026-11-08)

> "I'm a fan of super Nintendo and the music for it (16-bit?). Create a mini DAW where I can connect a midi keyboard and
> compose music. It should handle multiple tracks in each song, have effects, equilizing etc."

The owner chose: an SNES sound core with studio extras (and an "SNES limits" switch), songs that play in the games, saved on
the site. Engine 0.12.0.

- **The engine's Sampler** (`engine/13_sampler.js`, beside the NES chip): 23 instruments and a drum kit made from recipes
  (nothing recorded, nothing copied), each through the SNES's 4-bit BRR compression and Gaussian read-out at 32 kHz or less;
  SNES envelopes with the held-note fall; per track EQ, filter, chorus, pan, sends; the SNES echo with its FIR filter, reverb,
  master EQ and compressor; 8 voices and echo only under SNES limits. Songs loop a region (an intro, then the loop), tracks can
  be faded in and out by the game, and `Beat` follows the drums.
- **The SOUND STUDIO** (`/studio/`, behind the login, on the game list): tracks with instrument, mute, solo, volume, pan and
  meters; an overview of the song with the loop and the start mark; a piano roll (add, move, lengthen, select, copy, paste,
  duplicate, transpose, snap, velocity lane, the other tracks faint behind) with drum names on a kit's rows; a MIDI keyboard
  (Web MIDI: velocity, sustain pedal, pitch bend) or the computer keyboard plays the selected track; recording with a bar of
  count-in, the metronome, snapping to the grid, latency taken off; undo and redo; the selected track's sound, EQ (with its
  curve), filter, chorus and sends, and the master. Songs save to the site (D1 table `songs`, `worker/songs.js`, which refuses
  to overwrite a song saved elsewhere since it was opened), a draft is kept in the browser, and a song can be exported as WAV
  or a file, or handed to a session with a prompt.
- **Into a game:** a session saves a song from D1 as `games/<id>/music/<song>.song.json` and runs `node tools/song.mjs <id>`,
  which writes `songs.js`. Space Mouse plays the first one, "Cargo Bay" (16 bars in D minor: flute, harp, strings, finger bass,
  drums), from the first key on, quieter while paused, with a Music volume tunable.
- **Tests:** `tests/node/songs.test.mjs` (the API on SQLite, `Sampler.check`, the envelope, BRR, songs.js in sync, the demo song),
  `tests/studio.py` (pitch, voice limit, echo, EQ and loudness from offline renders; the studio driven with the mouse, a fake MIDI
  keyboard and the computer keyboard; saving, a clash, the draft, a WAV), routes keep `/studio/` and `/api/songs` private.
- **Verified:** build, unit tests, studio and lab tests, the smoke test of every game in both renderers, Space Mouse's mechanics
  and reachability, the level editor; Space Mouse's music starts on the first key, ducks when paused, and `Beat` follows it.

## 37. Samples, projects and where a song plays (Claude Code, 2026-11-08)

Engine 0.13.0.

> "Yes, build the sampling functions next!" · "Each song belong to a project, so first we shall open a project (eg. space
> mouse), then you open up a song. It should also be possible to know where the song is to be played in a good way. Perhaps
> would it be in a place where you also can preview the level itself?"

- **Your own samples.** Under a track's instrument, "+ Load a sample…" takes a WAV, MP3, OGG (anything the browser plays):
  mixed to mono, started where it starts sounding, up to 6 s, resampled to 32 kHz (or 16, 11, 8: more grit), and stored in the
  song as real SNES BRR bytes (`Sampler.brrEncode`, base64). The note it plays is heard (autocorrelation, to the cent) and can be
  set by hand; LOOP holds a note by repeating its end (click the picture where the loop starts); length and grit make it again
  from the sound as loaded. It travels in the song: saved to the site, and played by the game with nothing else to install.
- **Projects.** The studio opens on a project picker: the listed games and Sketches. A project's page shows its own songs and
  keeps its own draft; new songs are saved to it.
- **WHERE IT PLAYS.** A tab beside the notes: tick the title screen and the levels (each with its map, from the game's own level
  file) and write when exactly; it is saved in the song (`places`). ▶ HERE opens the game at that place, in the page, playing
  this song instead of its own (`Sampler.force`, the `pixelite:music` message), so the music is heard with the level in view.
  `tools/song.mjs` writes the places into `SONG_AT`, and Space Mouse plays each sector's own song (`stationMusic()`).
- **Tests:** BRR bytes, samples and places in `Sampler.check`, `SONG_AT`; `tests/studio.py`: the project picker, a recorded tone
  loaded (its note heard to within 12 cents, played an octave and a fifth up at the right pitch, looped, made grittier, saved),
  places ticked and saved, the level opened in the game with the song playing there and given back.
- **Verified:** build, unit tests, studio, lab and level editor tests, the smoke test of every game, Space Mouse's mechanics and
  reachability.

## 38. Automation: tempo changes, volume, pan and filter lanes, glide (Claude Code, 2026-11-08)

> "Proceed with what's next in the roadmap"

The next item of the sound roadmap (the pixel-art list's open items wait on the owner: the domain redirect touches the
sign-in, and offering the snapper patch upstream speaks for the owner). Engine 0.14.0.

- **Tempo changes** (`song.tempo`): every tick ↔ second in the Sampler now goes through the tempo map (`secAt`, `tickAt`): the
  scheduler, the playhead, note lengths, offline renders, the count-in.
- **Lanes** (`track.auto`: volume, pan, filter): scheduled ahead with the notes as ramps between points, set afresh when the
  playhead starts or wraps the loop. Volume rides on top of the fader; an automated pan or filter replaces the static one.
- **Glide** (`sound.glide`): a mono lead; a note that starts while the last is held slides to its pitch.
- **The studio:** the lane under the notes has a menu, VELOCITY, VOLUME, PAN, FILTER or TEMPO: click to add a point on the
  grid, drag it, right-click deletes; undo takes them back like notes. Glide is under SOUND.
- **Tests:** the tempo map and lanes in `Sampler.check`; `tests/studio.py`: a note after a tempo change starts at 3 s, a
  volume lane fades a chord out, a glide slides 220 → 330 Hz, lane points added, dragged, deleted and undone in the studio.
- Also fixed: a doubled heading in `docs/ROADMAP.md`.

## 39. Escape Velocity: a second song for Space Mouse (Claude Code, 2026-11-08)

> "Write another song for space mouse. High tempo, catchy melody and cinematic"

- **The song** (`games/spacemouse/music/escape-velocity.song.json`): C minor, 164 BPM, 32 bars (about 47 s), written by a session
  as data (no studio): a 4 bar intro that plays once (a 16th-note string ostinato swells in, a bell hints at the theme, the drums
  gather), then a 28 bar loop (`loop.start` = bar 5). **A** is the hook, a rising triad that lands on a pushed note and falls
  back, sequenced over Cm - Ab - Eb - Bb, on a saw lead over driving eighth-note synth bass and four-on-the-floor drums;
  **B** is the broad theme (trumpet, brass power chords, choir and strings, ride cymbal); **A'** is the hook again with the
  brass an octave down, a harp arpeggio and sixteenth hats; the **break** thins to bell echoes, a swelling pad and a snare roll
  that lands on A's crash, with a breath of silence on the last beat.
- **Where it plays:** `places.levels = [1, 2]` (Hydroponics and the Observation Deck); Cargo Bay now claims only the title
  screen and sector 1. `node tools/song.mjs spacemouse` rewrote `songs.js`.
- **Mix:** checked by rendering the song offline (`Sampler.render`) in Chromium, track by track and as a whole: no clipping,
  and the tracks are within a few dB of each other (a track's gain is `volume` squared, so a first mix had the drums at twice the
  lead's level).

## 40. The pixelite-song skill, and Cheese Moon, a sketch (Claude Code, 2026-11-08)

> "Make the following into a skill we can use to create new songs with. Also, create a new song sketch from this new knowledge."
> (the owner's report "The Craft of Epic Cinematic and Game Music: A Composer's and Critic's Playbook")

- **The skill** (`.claude/skills/pixelite-song/`): `SKILL.md` (the workflow from a brief to a shipped song, what the Sampler gives and
  where it trips you up, the playbook's rules as checks), `craft.md` (harmony, melody, rhythm, orchestration, psychology, game
  use, mapped to the Sampler's instruments and labelled [E]/[C]/[O] as the report does), `recipes.md` (a plan per kind of cue: fast
  loop, main theme, calm loop, boss, platformer, horror, cozy), `rubric.md` (the 100-point critique and the usual mistakes) and
  `playbook.md` (the owner's report, kept whole).
- **Two tools written for it:** `songkit.mjs` (compose a song as code: `put`, `hold`, `roll`, lanes that do not mute the song,
  and `lint`: notes past the end, empty bars, low notes that are not octaves or fifths) and `levels.py` (render a song offline with
  the engine's own Sampler in Chromium; peak, clipping, loudness per bar, each track alone, a WAV to listen to). Made from what
  went wrong mixing Escape Velocity: track gain is the fader squared, and a volume lane holds its first level before its first point.
- **The sketch:** `example-cheese-moon.mjs` writes "Cheese Moon (sketch)", F Lydian, 72 BPM, 40 bars, built on the report's reveal arc: a
  bell hints at the theme, a solo flute states it, strings and a bass join, a retained common tone (C) crosses chromatic-mediant
  chords, layers enter one at a time with the choir as the new voice, the music stops dead on the last beat of bar 28, and the
  theme returns a whole step up with every voice at 70% of the song. Rendered: the climax section is the loudest part (0.08-0.09 RMS a
  bar, peak 0.38, no clipping) and the last beat before it drops to 0.014. Saved to the studio's Sketches project; not placed in any game.

## 41. The art pipeline, phase 1: the foundation (Claude Code, 2026-11-09)

> "I had a brainstorm discussion earlier today with some updates to the engine … Make a plan for this" (a design summary: an
> AI-assisted pixel-art workflow with generation, snapping, normals, a gallery and per-game style management)

The plan (approved): review in the chat first with the site gallery as the archive, everything that needs no API key first, Space
Mouse as the first game. There are no API keys yet. Six phases, one pull request each; this is the first.

- **`games/<id>/art/`** and `docs/ART_PIPELINE.md`: style sheet, master palette, assets with numbered versions (raw, snapped sprite,
  normals, contact sheet, `meta.json` with prompt, references, API, parent, status, note), exactly one live version per asset.
- **`tools/art.mjs`**: init, palette, add, promote, reject, import-sprites, check, build. **`tools/art/`**: the files and the checker
  (`lib.mjs`), and the sprite builder (`sprite.mjs`): a snapped PNG becomes engine sprite data with its normals, a contact sheet,
  and the generated `games/<id>/pipeline.js` (`PIPE_ART`), which the game joins to its props.
- **Space Mouse:** its twelve sheet-cut props are imported as approved versions (kind imported, linked to the owner's original frames
  in `ref/`, `emit: false` because the game still gets them from `sprites.js`), the master palette is extracted from its sprites (240
  colours, to be curated in phase 3), and the first asset made for the pipeline, a hand-drawn **cheese crate** (12 x 11 pixels, one
  art pixel per world pixel), is live and stands next to Pip at the start of Cargo Bay.
- **Tests:** `tests/node/art.test.mjs` (the builder, versions, the live rule, every refusal of the checker, Space Mouse's real folder).
- **Next:** the gallery (phase 2), then the style sheet and palettes (3), then generation once the owner has added the keys (4).

## 42. The art pipeline, phase 2: the gallery (Claude Code, 2026-11-09)

The next phase of the approved art pipeline plan (HISTORY 41): the part of the review that lives on the site, as the archive; deciding
stays in the chat first.

- **Build:** `copyArt` publishes each game's `art/` to the site: `art/index.json` plus every version's sprite, normal map and
  contact sheet, and the raw image only for the live version. A broken art folder now fails the build, and `games.json` carries
  an `art` summary, so the game list's [ ART ] button opens the gallery.
- **ART page:** two tabs, GALLERY and REFERENCE SHEETS (the old page, unchanged). The gallery has a tile per asset at game size and
  enlarged, grouped by class, with a toggle for drafts and rejected versions; an asset's page shows its pictures, a lit preview with a
  lamp, the prompt, references and API when it was generated, a strip of versions, the tree of which came from which, and a compare
  of any two with a difference picture. An imported prop shows the owner's original drawing from `ref/`.
- **Space Mouse:** the cheese crate has a history now: 001 live, 002 (a heap of cheese that hid the crate) rejected, 003 a draft
  branching from 001, so the versions, the tree and the compare show real data.
- **Tests:** `tests/art_gallery.py` (CI), the build and routes tests (the art files are behind the login).
- **Next:** the style sheet, a curated palette and map seeds (phase 3), then generation once the owner has added keys (phase 4).

## 43. Art pipeline phase 3: the style sheet, a curated palette and map seeds

- **Palette:** `art.mjs palette` now counts the pixels of every colour and curates (weighted k-means in Lab, each cluster keeps its
  heaviest real colour). Space Mouse's master palette went from 240 colours to 32; the checker allows at most 64. The three versions of
  the cheese crate were moved onto it with the new `recolor` (6 of 7 colours moved, about 80 pixels), and look the same in the game.
- **Style sheet:** `style.json` has a style paragraph and four references (hero, props, env, mood) captured from the running game with
  the new `tools/art_capture.py`; the checker needs the paragraph, valid roles and every file listed and present. `promote-ref` swaps an
  approved version in as a reference later.
- **Map seeds:** `art.mjs map` makes `maps/<map>/` (seed, a sub-palette that must sit inside the master, notes). Cargo Bay has one.
- **Tests:** the CLI runs against a temporary checkout (`PIXELITE_ROOT`); new cases for curation, recolor, map, promote-ref and the style checks.
- **Next:** generation (phase 4) once the owner has added the keys.

## 44. Art pipeline phases 4-5: generating art through an API

- **Keys:** the owner saved OpenAI and Flux keys as network secrets; `node tools/art.mjs check-keys` calls each once (both OK).
- **Adapters** (`tools/art/gen/`): OpenAI images edit with all references (default `gpt-image-2.6-sunburst`, transparent background; `gpt-image-2` has none),
  and Flux 3 Image (submit, poll, download, magenta key). The commands start themselves with `NODE_USE_ENV_PROXY=1` so Node's fetch uses the cloud proxy.
- **`art.mjs make`** (`tools/art/make.mjs`): brief + style sheet + palette + references (by class, plus the map's seed) → prompt → image → trim → pixel size from
  subject ÷ target → Pixel Snapper on the palette → exact target size → normals, contact sheet → a draft version with the whole recipe in `meta.json`. `--dry`,
  `--n`, `--max-calls`, `--parent --note` (iterate), `--map`, `--key`.
- **First real run:** three fuel barrels (10 x 14) for Cargo Bay: the model's pictures are good, the snapped sprites read but lose detail at that size (ROADMAP).
  They stay as drafts in the gallery; nothing is live.
- **Flux:** a job went through (paid, 4.8 credits) but its polling host `api.isr.bfl.ai` is not allowed; documented under "Keys" for the owner to add.
- **Skill** `pixelite-art-pipeline` runs the loop; `pixelite-art-prompt` points at the style sheet.
- **Tests:** `tests/node/artgen.test.mjs` (no network; fixtures).

## 45. The first approved generated art, and Pip's ship

- **Fuel barrel:** the owner picked candidate 002 of the first round; it is live (`q` in the map legend and the open tiles, one in Cargo Bay next to the crate stairs).
- **Pip's ship:** three drafts of a small one-seat spaceship (32 x 18) made with `art.mjs make`; the owner picks one (not live yet).
- **`make`:** a drawing may be up to 30% short of the box in the dimension that does not bind (a model rarely draws the exact aspect ratio); a paid picture that cannot be
  snapped is kept in the temp folder; OpenAI answers with a 502 now and then, so the adapter asks once more.
- Space Mouse's "tiles to stand on" in Hydroponics went from 192 to 191 because the decor random numbers shift when a prop is added to the first sector; nothing is unreachable.

## 46. Pip's ship goes live, and cheaper generation

- **Pip's ship** (`pip-ship`, 32 x 18): the owner chose draft 003 "for now"; it is live and in the LEVELS tab's palette as `u` (not painted on a map yet: the owner places it).
- **`make --from <NNN>`** refines a draft: its picture is the first reference and its brief is kept; `--quality low|medium|high`; every call records its tokens
  (`meta.api.usage`) and prints them. Measured: low is 824 output tokens against 1449 for medium, flare is three times faster than sunburst, mini is too weak, 1024 x 1024 is the
  smallest size, and the Images API shows no prompt caching (docs/ART_PIPELINE.md, "Spending less").
- Ship drafts 004 (flare, high) and 005 (sunburst, medium) refine 003; the three look the same to me. The owner prefers quality to speed, so sunburst stays the default model;
  `make` tries a 502 up to three times (sunburst at high still fails here, flare at high works).

## 47. Pip's ship in the game

- The owner asked for the ship in the game "for now, no specific level": it stands as scenery on the raised floor of Cargo Bay's first hall (`u` in `sectors.js`), lit by the
  lamps like the other props. The test now wants every live pipeline prop on a map.

## 48. A character test: Pip at 14 x 16, and how frames work

- **Pip (16 px test)** (`pip-test`): three candidates, then two walking poses made from the best one. The model keeps the identity and the poses are right; snapped at 14 x 16 the
  legs of a moving pose are weak (docs/ART_PIPELINE.md, "Characters and animation frames").
- **`make --pose "..." --align <NNN>`**: the base frame is sent as "the same character", the pose goes in the prompt, and the new picture is snapped on the base's lattice (same crop,
  pixel size, place on the canvas), so frames do not jitter. `art.mjs resnap` records the lattice of an older version without a call. Tests in `artgen.test.mjs`.
- Not built: an asset that holds named frames (ROADMAP, animation sets).

## 49. An asset that holds its frames

- The owner asked for it after the character test: `asset.json` `frames` maps a frame name to the approved version that is its picture (in order; the first stands for the asset).
  `promote --frame`, `make --frame`, one shared palette for all frames, `PIPE_ART[id].frames` and a generated `pipeFrames(id)` in `pipeline.js`, checker rules, and the gallery: a tile that says
  "N frames, plays" and a page with the frames in order and a looping player.
- Pip's 16 px test (`pip-test`: idle, walk1, walk2) is the first one; the game renders it through `pipeFrames` (checked), but the game's own Pip is unchanged.
- Tests: checker, build, `promote --frame`, `make --frame --pose`, the published index, and the gallery player (`tests/art_gallery.py`).

## 50. Pip's legs: draw characters at twice the size

- The owner: "I don't know why Pip's legs would not fit, make that work." The cause was the canvas: a 1 pixel outline on a leg two pixels wide leaves no leg. The owner's own Pip is 26 x 28 art pixels shown at 13 x 14
  (k .25) and the engine halves it with its outline-preserving downsample, so the new `pip` is drawn the same way: `--target 28x32 --k .25`. In the engine, side by side with the owner's Pip and the 14 x 16 test, the legs,
  boots, belt and face come through. A prompt that asks the model for a grid of exactly the target size, with thicker thin parts for a character, was tried too: the model keeps drawing its own finer pixels, so the size is what helped.
- `pip` (idle, walk1, walk2) is the second animation asset; style.json's `character` class is 28 to 32 px at k .25 and its paragraph says so. The game's own Pip is still the owner's sheet art; wiring `pipeFrames('pip')` in is next.

## 51. MIDI files in the SOUND STUDIO (Claude Code, 2026-11-09)

> "Please continue with the next functions of the sound studio."

The next open items of the sound roadmap were Patterns (clips that repeat: a change to the song's data and to the whole piano roll, left for
a design of its own), MIDI files, and the rest. MIDI files first: import and export.

- **`portal/assets/midi-core.mjs`** (no DOM: the studio, the CLI and the tests share it): `songFromMidi` reads a Standard MIDI File (format 0
  or 1, any beat division, running status, note-on at velocity 0, the sustain pedal, program changes) into a song: each channel becomes a
  track, a General MIDI program becomes the nearest Sampler instrument (all 128 are mapped), channel 10 is the kit (drums the kit lacks
  play the nearest it has), channel volume and pan become the track's, tempo changes and the first time signature become the song's, markers
  named `loopStart` / `loopEnd` become the loop. `midiFromSong` writes a format 1 file at the Sampler's 96 ticks a beat, with the song's name,
  tempo map, loop markers, and the exact instrument of each track in a text event, so a song written here and read back is the same
  song (tracks with no notes too). Left out, and said so in the studio: automation lanes, effects, EQ and a song's own samples.
  A file that is not MIDI, is timed in SMPTE frames, or has no notes is refused with a sentence; one that ends early gives what is in it;
  more than 32 instruments or 512 bars are cut, and the studio says what was.
- **The studio**: [ MORE ] has "Export MIDI file (.mid)" and "Open a MIDI file…" (a new, unsaved song). Opening a file, MIDI or song file,
  now asks first when the song being worked on has unsaved changes (it used to replace it silently).
- **`node tools/midi.mjs import|export`** does the same for a session: Regolith's four `.mid` files (played on the NES chip) can be turned into
  Sampler songs to re-voice. `pixelite-song` mentions it.
- **Tests** (`tests/node/midi.test.mjs`, 14): files built byte by byte (so the reader is not tested only against our writer), mangled files
  (400 random mutations never crash or hang it), every General MIDI program and every instrument, both shipped songs through a file and
  back with every note equal, the same files read by the engine's own reader (`parseMidi`, the NES chip's) for an independent check,
  and Regolith's real files; breaking the reader five ways (pedal, overlap pairing, tick scaling, running status, an instrument family)
  fails a test each time. `tests/studio.py`: the export, the same file opened as the same song, "cancel" keeping the work, a Regolith file
  opened and played, a text file refused.

## 52. The sound studio's follow-ups: samples, automation and MIDI (Claude Code, 2026-11-10)

> "Fix the following follow-ups: Samples, Automation and MIDI"

Every "Next:" the roadmap listed under those three items, done in one go.

- **Samples** (`engine/13_sampler.js`, `portal/assets/studio.js`). A loop has an end of its own (`sample.loopEnd`: the sound after it is never
  played while a note holds; shift-click the waveform, or the LOOP END slider) and a crossfade (`sample.xfade`, in samples, set in ms with
  the CROSSFADE slider): `brrDecode(bytes, loopAt, loopEnd, xfade)` blends the tail of the loop with the sound before its start, equal-power,
  before the DSP's Gaussian read-out, so the seam is a continuation (a 0.92 jump became 0.02 in the test). Grit changes carry the loop
  along. A **microphone**: "+ Record a sample…" on a track, or [ ● RECORD ] on a sample (a dialog with a level meter and a 6-second limit,
  `getUserMedia` and `MediaRecorder`, the same decode and resample as a file). **Multisamples** (`song.multis`, `instrument: 'multi:<id>'`): zones
  of notes over the song's samples, a track picks "+ New multisample…", edits the zones under MULTISAMPLE ([ + ZONE ], [ FROM THEIR NOTES ]
  shares the keyboard halfway between the samples' own notes); removing a sample removes its zones and sends tracks back to the piano.
- **Automation.** Curved segments (`[tick, value, c]`, c -1..1 bends the segment that arrives at the point; shift-drag on the line;
  shift-click a point makes it straight; the engine ramps through a curve in 1/8-beat pieces, `laneRamp`). New lanes in the studio's menu:
  ECHO SEND, REVERB SEND, PITCH BEND (a constant source into every note's detune, semitones), LOOP POINT (a note picks one of 16 loop
  starts of its sample when it starts: Web Audio's loop points are not parameters, so a held note does not move; the variants are made
  once and kept, and `prepare` makes them), and for the song ECHO LEVEL and ECHO FEEDBACK (`song.auto`). **Tempo ramps**: a third number 1
  on a tempo point glides to it from the one before (shift-click a tempo point); `secAt`/`tickAt`/`bpmAt` integrate and invert a glide. The lane
  is drawn by sampling it, so curves and ramps look as they sound.
- **MIDI** (`portal/assets/midi-core.mjs`). Pitch bend becomes the track's pitch lane (in the range the file's "pitch bend sensitivity" RPN sets,
  2 semitones otherwise; drums are not bent) and is written as bends over ±12 with the RPN set. Volume (CC 7, with CC 11 expression on top) and pan
  (CC 10) that move while the notes play become volume and pan lanes (a controller is a step, a run closer than a beat a sweep; at most 512
  points), and a volume or pan lane is written as CC 11 / CC 10 every 1/16 note, so a song's lanes survive a file. A tempo ramp is written as
  tempo events and an even run of them is read back as one ramp. A file with several instruments asks which to open (`info.candidates`,
  `opts.only`; the song is only as long as what was opened; `node tools/midi.mjs list` and `import --tracks 0,2`). The song's own samples and
  multisamples are carried in sequencer-specific events (manufacturer id 0x7D, the sample as JSON with its BRR in base64) and the track's text
  event, so a file written here opens with its samples; any other program ignores them and plays a pad (looping sample) or a marimba.
  `midiFromSong(song, S)` takes the Sampler now (it evaluates the lanes). Still left out of a file, and said so: the filter, send, loop-point and
  echo lanes, effects and EQ.
- **Old songs read the same.** Every new field exists in `check`'s result only when it has something in it (LESSONS), so the shipped songs and
  `songs.js` did not change.
- **Tests.** `tests/node/songs.test.mjs` (5 new: tempo ramps round trip, curves and `laneRamp`'s windows, optional lanes, loop end / crossfade /
  multisample checks, the seam). `tests/node/midi.test.mjs` (6 new: pitch bend and its range, volume and pan lanes with steps and sweeps,
  a song's lanes through a file, tempo ramps, the choice of instruments, samples in a file read by the NES chip's parser too).
  `tests/studio.py` (about 30 new checks): offline renders of the echo send and level lanes, the pitch bend (440 → 880 Hz), a tempo ramp (the note
  lands at 2.77 s, not 2 s), a curve, a loop end (440 Hz, never the 880 Hz half) and a multisample picking its zone by range; then the lanes by
  mouse, the loop controls, a multisample edited, a recording from Chromium's fake microphone, the instrument picker for MIDI files.
- **Verified:** build, unit tests, the studio test, and the smoke test of every game in both renderers (in a clone with LF line endings: see
  LESSONS on this Windows checkout).

## 53. The engine plan, part 1: a safe foundation (Claude Code, 2026-11-11)

> "Work through all the tiers and also work on all the improvements from the plan. I want them all :)" (the plan: `docs/ENGINE_PLAN.md`, PR 47)

Packages A1-A8, B1-B4 of the plan, on branch `feature/a-foundations`.

- **A1 builds on Windows.** `.gitattributes` (`* text=auto eol=lf`, binaries marked), `read()` in `tools/pixelite.mjs` strips `
`, the art tool writes
  `/` in recorded paths, `git apply` in the diff test ignores autocrlf, `node tools/py.mjs` runs `python3` or `python`, and the smoke test takes
  `PIXELITE_BROWSER_CHANNEL=chrome` where Playwright's Chromium is not installed (and a `file:///` URL that works on Windows). 135 unit tests pass here.
- **A2** one engine version: the assembler writes `ENGINE_VERSION` from `engine.json`; `Pixelite.version` and `probe().version` read it.
- **A3, A4** presses made while paused are dropped; pause is a flag (`Pixelite.pause`, `Pixelite.paused`) any game state can use, with the old
  `'paused'` state kept as an alias; the page pauses when hidden.
- **A5, A6** author checks (`engine/00_dev.js`, `tools/authorcheck.mjs`) and errors shown (overlay with file and line in `?dev` and the editor, a HUD
  line for players). Every game's `Math.random` became `rnd()`.
- **A7** structures: a hillside too big for a chunk sinks as a slab instead of hanging; a forced freeze lifts the chunk out of the ground and keeps cells
  that do not fit as grains; a chunk resting on a still game body rests. **A8** `Body.step` sub-steps by speed. Found by the new sand test: `deposit()`
  gave a grain up after four cells, so sand landing on a steep pile vanished (a pile lost a third of its mass); it now looks 12 cells up and 4 columns across.
- **B1, B2** seeded `rnd()` and `Pixelite.seed(n)` / `?seed=n`; draw time is the simulation clock. **B3** `test.record/replay/tap/stepUntil/hash`,
  `?replay=`. **B4** `tests/node/engine-harness.mjs` loads the engine into a Node `vm` (no browser): `tests/node/engine.test.mjs` (sand keeps its
  mass, jump height and step-up equal at RES 1-3, no tunnelling, chunks freeze with their mass, slabs, pause), `tests/node/author.test.mjs`, and
  `tests/engine_browser.py` (pause, errors, replay gives the same world).

## 54. The engine plan: sound (F1, F3, F4) (Claude Code, 2026-11-12)

> "Work through all the tiers and also work on all the improvements from the plan. I want them all :)" (the plan: `docs/ENGINE_PLAN.md`, section F)

Packages F1, F3 and F4 of the plan; engine 0.15.1.

- **F4, instruments made between frames.** The instrument recipes, the drum kit and the BRR encoder are generators; `Sampler.prepare` works them off
  one page-wide queue in the browser's idle time, and `Sampler.play(song, { wait: true })` starts a song when its instruments are made instead of
  stalling. Space Mouse's two songs (12 instruments), the fastest time seen for each step over nine fresh runs: before, a stretch of 133 ms (a drum
  kit) and 778 ms of work in 12 stretches; after, a longest stretch of 6.3 ms and 717 ms of work in 1180. In Chrome on the real page: 97 slices,
  longest 8.6 ms (2D) and 19 ms (software GL). Every instrument is sample-for-sample what it was (46 variants, 174 buffers). No Worker (see ARCHITECTURE).
- **F1, sounds as data, placed in the world.** `defineSound` / `Sfx.play(name, { x, y, pitch, vol })`: tone, noise and Sampler-note layers, `spread`,
  `limit`, `gap`; `Sfx.place` adds a pan and a vacuum's distance gain to `heard()`; at most 24 voices (the quietest is stolen); effects and music
  on their own buses under the constant master, `Sfx.setVolumes({ music, sfx })`, kept per game and shared with `Pixelite.settings`. Every old Sfx
  function works as before (`pickup`, `alarm`, `win`, `launch` are data now and can be replaced).
- **F3, the music director.** `Music.place / play / layer / stinger / preload` over the Sampler: crossfades (the old song plays on in a deck of its
  own), layers that carry over between songs, stingers on a second deck with the music ducked. Space Mouse's hand-written `stationMusic()` is gone;
  its music is `Music.preload()` and one `Music.place(...)` a frame. Regolith plays MIDI through the Chip and keeps its own director, renamed
  `RegolithMusic` (the engine owns `Music` now).
- **Tests.** `tests/node/audio-mock.mjs` (a recording Web Audio for the Node bench), `sampler.test.mjs`, `sound.test.mjs`, `music.test.mjs`, and
  `tests/engine_sound.py` against the real Web Audio in both renderers.

## 55. The engine plan: the platformer toolkit and the Proving Ground (Claude Code, 2026-11-12)

> "Work through all the tiers and also work on all the improvements from the plan. I want them all :) Create a level that showcases the updates, like a test level."

Packages C1, C3-C10, D1, D3-D10 of `docs/ENGINE_PLAN.md` and the platformer picks from the idea bank, on engine 0.16.0 (new parts 14 to 17), and a test
level that uses them all.

- **Materials** (D1): `climbable` (also in the back wall: a ladder painted behind a room), `hazard`, `grip`, `conveyor` (carries a `Character`, a `Body`
  and sand), `bouncy` (a `Character` is thrown up, a `Body` bounces). `Character` takes `up`, climbs, rides conveyors, slides on ice, bounces, and reports
  `contacts`, `hazard`, `carry`, `bounced`, `crushed`, `platform`. `ramp:` (ignored for ages) is gone from the games, `grains` is the new name of `grainGlyphs`.
- **Moving platforms** (D3, `addPlatform`): chunks on a path, moved by whole cells, carrying a character standing on them (and slimes), crushing against walls;
  a blast turns one into a falling chunk. **Gravity** (D5): `setGravity(mps2, sideways)`, `addGravityZone`, per-body `gs`; a jump's launch uses the world's
  gravity, so it goes higher in a low-g zone (Space Mouse's low-gravity rooms are zones now). **Digging** (D6): `carve`, `fill`. **Bodies** (D4): `bodyVsBody`,
  opt-in chunk-against-chunk contacts (`CHUNK_CONTACTS`).
- **Entities** (C3, `engine/14_entities.js`): `defineEntity` / `spawn` / `near` / `overlapping`, a `Character` per entity, sleeping off screen, probe
  counts; timers, tweens, `fsm`, `useStates` (D10); `seek` / `flee` / `wander`, `findTilePath` (Fjordheim's A* moved here, D9). **World tools** (`engine/15_world.js`):
  `raycast`, projectiles that move by rays (the starter's bolts are `fireProjectile` now, D7), triggers, `loadTileMap` (tile maps with props, spawns, entities,
  merged triggers, D8), `reachSearch` / `navPath` / `jumpArc` (Space Mouse's level search made general: the engine can prove a level finishable), `rescaleWorld`
  (C2: a game without `regenerate` is resampled when the detail changes).
- **Toys** (`engine/18_toys.js`): verlet `Rope` (collides with the grid, snaps under tension), a `Grapple` hook that swings a `Character` (`step(dt, { rope })`, can rip a weak anchor out), `GhostRecorder` / `spawnGhost` / `spawnEcho` (ghost racers, an echo of your own path), `Rewind` (snapshots of the world, hold to step back; a grid copy per snapshot, not deltas), `drawLine`. The Proving Ground has a hook beam over the ferry pit, rewind on R and a ghost of the best run. The platformer kit: `node tools/pixelite.mjs new <id> --kit platformer` (C12). `engine/api.json` and a lint of game code against it (C11), a phone-sized smoke run and a page size budget (B5, partly).
- **Look and feel**: sprite `tint`, `flash`, `palette` and animations (`defineAnim`, `drawAnim`, `animFromAsset`, C4); camera rigs (C6: look-ahead, dead zone, rooms,
  bounds); `cameraShake`.
- **Input and shell** (`engine/16_actions.js`, `17_ui.js`): **actions** from `game.json` over keys, gamepad (analog sticks) and touch, buttons made from them, multi-touch
  pinch and long press (C5); settings and saves (C10: `Pixelite.settings`, `save` / `load`, `worldSave` / `worldLoad`); the HUD kit, a message feed and floating texts drawn
  by the engine (C7, C8; the four games' own loops are deleted); the standard shell: title, pause menu, key rebinding (C9). C1: `detail: { levels: [2] }` offers one
  detail level.
- **The Proving Ground** (`games/proving/`, unlisted): a 112 x 24 tile level, left to right: walking, a catwalk and a ladder, ice, belts, a spring over spikes, a ferry
  and a lift, a low-gravity room, slimes, a brick tower, a dirt wall, the goal. `tests/check.mjs` proves it finishable with the engine's reach search (Node, about a minute);
  `tests/mechanics.py` runs every station in a page (27 checks, including gamepad, rebinding, the save across a reload and a replay that gives the same world).
- **Found on the way**: grains landing on a pile could vanish (A, part 1); a slime on the lift rides it up and hurts the hero (the test kills the slimes first).
- **Not done** (and why): the plan's D2 (liquids, reactions, heat conduction) and E1-E8 (sun from either side, emissive sprites, layers and backdrops, palette lock,
  zoom, weather) were not started; C12 has only the platformer kit (no top-down, isometric or sandbox kits), B5 has no golden screenshots, A5's `game.json` key list is by hand. The performance packages are in their own branch (see ROADMAP).
- **Verified**: build, 175 unit tests, the smoke test of seven games in both renderers, `tests/engine_browser.py`, Space Mouse reach and mechanics, Fjordheim's playthrough,
  the Proving Ground's check and mechanics (three runs).

## 56. The engine plan: liquids, swimming and reactions (D2) (Claude Code, 2026-11-12)

> Package D2 of `docs/ENGINE_PLAN.md`: liquids that fall, spread level and pool, swimming and buoyancy, splashes, light that dims with depth, reactions as data, and a water station for the Proving Ground.

Engine 0.17.0, two new parts: `engine/19_liquid.js` and `engine/20_reactions.js`.

- **Liquids** (`liquid: true`, `viscosity`, `murk`): a liquid is a material in the grid that is not solid (`MAT_SOLID` is 0, `MAT_LIQ` 1), so `solidU`, `Character`, `Body`, particles,
  `lineClear`, `sunAt`, `raycast` and the light's occlusion pass through it, and it is never structure (`structuralCheck`, `settleIslands`, `breakOff`, `startSlab` and the chunk
  freeze all ignore it). The cellular step moves a liquid cell down, or along its row to the nearest drop within `12 x RES x (1 - viscosity)^2` cells, one swap with an empty cell at a time, so
  **its mass is exact** and a poured column settles flat (to within a row) in a second or two at every detail level; a heavier liquid sinks through a lighter one; sand sinks through water
  (two cells swap) or floats on a denser liquid, grains lighter than the liquid float, droplets rejoin it. A solid taking a liquid's cell (a chunk freezing in a pool, a slab sinking in,
  sand landing) moves the liquid to the nearest free cell reachable through liquid (`displaceLiquid`, `putSolid`): the level rises, nothing is lost.
- **Swimming and floating**: `Character` swims while the middle of its box is in a liquid (strokes up, down and across, slow sink, treading water at the surface, a press at the surface hops
  out; `inLiquid`, `submerged`, `swimming`, `liquid`, `splashed`; options `swim`, `swimSpeed`, `swimRise`, `sink`). `Body` gets buoyancy by the share of its hull under, its density against the
  liquid's (`dens`, default 1.5), and drag. Fast entries splash (`splash`, droplets in the liquid's colour); fire and sparks are put out.
- **Light and look**: the sun and ambient light dim per colour channel with the depth of liquid above (a table per liquid), lamps under water keep theirs, a liquid casts no sun shadow; a liquid
  cell is drawn as a translucent flat colour with a brighter top row and glints, in the shared colour buffers, so WebGL and the 2D canvas show the same. Games without a liquid draw
  pixel for pixel as before (checked by hashing the finished frame of all seven games in both renderers against the build before the change).
- **Reactions as data**: `reacts: [{ with, makes, leaves, heat, chance }]` (lava + water makes hot stone and steam, one water cell per stone cell), `flammable` / `ignite` / `burnsTo` (a burning
  cell heats its neighbours: fire spreads through the `heat` field; a liquid beside it puts it out), `conduct` (heat flows between conducting cells: a metal bar carries a fire across a gap) and
  `hot` (lava stays hot, a liquid carries its heat). The engine names no material.
- **Proving Ground**: a pool station between the brick tower and the dirt wall (the goal moved 20 tiles right): a basin four tiles deep with three of water, four coins on the bottom and in the water, steps up
  the far side, a hint, a splash sound; `check.mjs` swims it (the reach search needs nothing new: its tries of holding jump and a direction already swim to the steps) and proves all 35 coins and the goal can be
  reached; `mechanics.py` has 11 new checks (falling in with a splash, a soft landing, a slow sink, treading water, diving, every coin, the water drawn blue with a bright top row, light dimmer and bluer at
  the bottom, swimming across and hopping out).
- **Tests**: `tests/node/engine-liquid.test.mjs` (mass and a flat pool at three detail levels, drops and blasts, thick against thin, sand and pumice and oil, not solid, no structure, a chunk landing in a pool,
  swimming, floating bodies) and `engine-reactions.test.mjs` (water and lava, fire across a rock gap, a metal bar and under water, conduction conserves heat, lava lights wood).
- **Found on the way**: a displaced liquid first went straight up its own column and was lost when a chunk's own top row closed it (fixed: it searches through the liquid); the strokes up at the surface
  threw the swimmer clear of the water like a jump (holding up with the head out now only treads water); a one-frame jump press at the surface hops low because letting go early cuts a jump (hold it).
- **Not done**: see ROADMAP (pressure through a bend, waves, a veil over sprites, gas, particles that react, the falling-sand sandbox game).

## Published versions (claude.ai artifact "Regolith Lander")

| Version | Content |
|---|---|
| 1–3 | Engine + game, particles/VFX, detail levels, WebGL renderer |
| 4 | Spotlights, Chip music engine with MIDI |
| 5 | Breakable structures, spring-damper legs, settled levels, x3 roof fix |
| 6 | Smooth sky layer |
| 7 | Lander drawn from the pixel-art sprite |
