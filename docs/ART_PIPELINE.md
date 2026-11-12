# The art pipeline

How art gets into a game: made (by hand, or generated through an image API), snapped to true pixel art on the game's palette,
given a normal map, **reviewed**, and only then made live. The brief it grew from is the owner's brainstorm ("Pixelite AI Art
Pipeline: Design Summary"); HISTORY 41 says what is built and what is not.

## What exists

| Step | Built? | Where |
|---|---|---|
| Folder layout, versions, a live pointer per asset, the checker | yes | `games/<id>/art/`, `tools/art/lib.mjs`, `tools/art.mjs check` |
| Snapped PNG → game sprite with normals → `pipeline.js` | yes | `tools/art/sprite.mjs`, `tools/art.mjs build` |
| Contact sheet for review (sprite, 4x, normals, lit from both sides) | yes | `tools/art/sprite.mjs` `contactSheet` |
| Master palette curated from a game's sprites (weighted by pixels, real colours only), `recolor` | yes | `tools/art.mjs palette`, `recolor`, `tools/art/palette.mjs` |
| Gallery on the site: tiles, versions, compare, tree | yes | ART page, GALLERY tab (`portal/assets/gallery.js`) |
| Style sheet (paragraph + hero, props, env, mood references), map seeds and sub-palettes, `promote-ref` | yes | `art/style`, `art/maps`, `tools/art.mjs map`, `promote-ref`, `tools/art_capture.py` |
| Image API adapters (OpenAI, Flux), the `make` loop, `check-keys` | yes (OpenAI tried for real; Flux needs its region host allowed) | `tools/art/gen/`, `tools/art/make.mjs` |
| The skill that runs the loop | yes | `.claude/skills/pixelite-art-pipeline/` |

## Folder per game: `games/<id>/art/`
It is separate from `ref/`, which holds the owner's own images and keeps its strict rule (`tests/node/ref.test.mjs`).

```
art/style/style.json      pxPerUnit, size classes, the fixed style paragraph, the reference images with a role
art/style/palette.json    the master palette: { colors: ["#rrggbb", ...] }
art/style/refs/           3 or 4 approved reference images (phase 3)
art/maps/<map>/           seed.png and palette.json: a sub-palette that must sit inside the master (phase 3)
art/assets/<asset>/asset.json     what the asset is, and which version is live
art/assets/<asset>/<NNN>/         one attempt: sprite.png, normals.png, preview.png, meta.json, raw.png (if it has one), emit.png (if a mask says what glows)
games/<id>/pipeline.js    GENERATED from the live versions: PIPE_ART; committed, because the Cloudflare build has no tooling for it
```

### `asset.json`
`id` (the folder), `name`, `class` (a key of `style.json` classes), `target {w, h}` (art pixels), `k` (base units per sprite
pixel: one art pixel is one world pixel at the default detail when `k = 1 / pxPerUnit`, so 0.5 at RES 2), `place` (`floor` stands on
its tile, `wall` hangs in its middle), `char` (the map character that places it, or null: the editor's LEVELS legend and the
game's list of open tiles need it too), `live` (a version number, or null), and `emit: false` for an **imported** asset: one
the game still gets from its own `sprites.js` (made by the game's `tools/art.py`); it is in the pipeline for the gallery and
as a reference, and `build` leaves it out so the two do not clash.

### `meta.json` (one per version)
`version`, `parent` (the version it was made from, or null: history is a small tree), `status` (`draft`, `rejected`, `approved`),
`kind` (`generated`, `imported`, `hand`), `brief`, the final `prompt`, `refs [{path, role}]`, `api {provider, model, params,
requestId}` (generated only), `source` (the owner's original image it was cut from, for an import), `snap {pixelSize, colors,
palette, size}`, `normals {bevel, detail, strength}`, `target {class, w, h}`, `map` (the sub-palette it was made on), `note` (the
owner's note), `created`, `by`.

### Rules the checker (`node tools/art.mjs check`, and `tests/node/art.test.mjs`) enforces
- Exactly one version of an asset is live, and only an **approved** one may be; only the live version reaches the game.
- Rejected versions stay on disk and are hidden by default (a rejected attempt can still hold a useful detail).
- A sprite is exactly the target size, and every colour of a hand-made or generated one is in the master palette (or its map's).
  Imported versions are exempt: they are what the game already has.
- A parent must exist; a map character belongs to one asset; a map's palette is a subset of the master.
- `pipeline.js` is what `tools/art.mjs build` makes from the live versions (a stale one fails the test, so it cannot be forgotten).

## Commands (`tools/art.mjs`)
```sh
node tools/art.mjs init <game>                  # the folders and a style sheet to fill in
node tools/art.mjs palette <game> [--from sprites.js] [--colors 32]   # the master palette: the game's colours weighted by the pixels that use them, curated to N real ones (0 = all)
node tools/art.mjs recolor <game> <asset> <NNN> [--map m]   # move a version's colours onto the nearest ones of the master (or the map's) palette
node tools/art.mjs map <game> <map> --seed seed.png [--colors 14]   # maps/<map>/: the seed picture, a sub-palette inside the master, notes.md to fill in
node tools/art.mjs promote-ref <game> <asset> <NNN> --role hero|props|env|mood [--replace refs/props.png]   # an approved version becomes a style reference
python3 tools/art_capture.py <game> --out f.png [--crop x,y,w,h] [--steps N --keys A,B --level N]   # a picture of the running game, one pixel per cell (a seed, a mood reference)
python3 tools/art_capture.py <game> --out s.png --sprite "MOUSE_SPR.idle"   # or sprites from the game's own code, unlit, on transparent
node tools/art.mjs make <game> <asset> --brief "..." [--n 3] [--map m] [--parent 002 --note "what to change"] [--api openai|flux] [--model m] [--quality low|medium|high] [--mood] [--key] [--max-calls N] [--dry]
     [--class prop --target 10x14 --k .5 --place floor --char j --name "Fuel barrel"]    # generate draft versions through an image API
node tools/art.mjs check-keys [--api openai|flux]   # one free call per API: does its key work
node tools/art.mjs models openai                    # the image models the key can use
node tools/art.mjs add <game> <asset> --sprite in.png [--raw raw.png] [--kind hand|generated] [--parent 002] [--note "..."]
     [--class prop --target 12x11 --k .5 --place floor --char j --name "Cheese crate"]    # a new version (a new asset needs these)
node tools/art.mjs promote <game> <asset> <NNN> # approve it and make it live
node tools/art.mjs reject <game> <asset> <NNN> --note "why"
node tools/art.mjs build <game>                 # games/<id>/pipeline.js; add "pipeline.js" to game.json's parts, before the art file
node tools/art.mjs check [game]
node tools/art.mjs import-sprites <game> --const PROP_ART --class prop --frames ref/frames/prop_   # a game's existing sprites, as imported versions
```

## The style sheet, the palettes and the map seeds
`art/style/style.json` is what every generated picture is told first, and what a person writing a brief reads:
- `styleParagraph`: the look in a few sentences (outline, light direction, detail, the mood of the colours). It goes into every prompt.
- `refs`: three or four reference pictures in `style/refs/`, each with a `role`: `hero` (the main character, for proportions and outline),
  `props` (the objects), `env` (the walls and floors), `mood` (a stretch of the game with its light). A reference is a real picture at
  one pixel per cell, never a re-draw: `tools/art_capture.py` captures them from the running game, and `promote-ref` swaps an approved
  new version in later, so the style sheet gets better as the game does. The checker needs every listed file, a known role, and no
  stray picture in `refs/`.
- `style/palette.json`: the **master palette**, at most 64 colours (a limit is the style). `palette` picks them: it counts the pixels of
  every colour the sprites use, then clusters in Lab space (so "far apart" means "looks different") and keeps the heaviest *real*
  colour of each cluster, so nothing invented ends up in it. Edit it by hand if a colour matters more than its pixel count.
- `maps/<map>/`: `seed.png` (a picture of the place), `palette.json` (the master colours the seed is mostly made of: a subset the
  checker enforces) and `notes.md` (what the place looks and feels like, in words). A brief for a prop in a map is generated
  against the seed and snapped to the sub-palette, so a crate in Cargo Bay is in Cargo Bay's colours.
- Imported versions keep their original colours and are exempt from the palette check; a hand-made or generated version must fit,
  and `recolor` brings one in (the nearest colour in Lab, noted in `meta.snap.recolored`).
Space Mouse's: 32 colours from its 240, four references captured from the game, and `maps/cargo-bay/` with 14 colours.

## Making art with an API (`make`)
`node tools/art.mjs make <game> <asset> --brief "..."` does, for each of `--n` candidates:
1. **Prompt and references** (`tools/art/make.mjs`): the style paragraph, the brief, the target size, the palette (the map's sub-palette with
   `--map`, else the master), the map's notes, and for an iteration the owner's note. References by class (character: hero + env; prop: props + env;
   tile: env; plus the map's seed; `--mood` adds the mood picture; at most four), each shown to the model as big flat blocks on a dark grey ground.
   `--dry` prints the prompt and the references and calls nothing.
2. **The call** (`tools/art/gen/`): OpenAI's images edit endpoint with all references, the model `gpt-image-2.6-sunburst` by default (the newest one
   the owner's account lists that accepts a transparent background; `gpt-image-2` does not), 1024 x 1024. Flux 3 Image (`--api flux`) has no
   transparency, so the prompt asks for a flat `#FF00FF` background that `make` removes by flood fill from the edges; `make` falls back to that by itself
   when an OpenAI model refuses transparency. Provider, model, parameters and request id go into `meta.json`.
3. **Snap** (`snapToTarget`): trim to the subject; pixel size = subject size ÷ target size; the Pixel Snapper with that size and the palette; if the result is
   not within a pixel of the target, correct the size and snap again (four tries); pad to exactly the target (resting on the bottom for a floor prop); every
   colour moved onto the palette. If it cannot reach the target the candidate is reported and nothing is written.
4. **A draft version** with `sprite.png`, `normals.png`, `preview.png` (the contact sheet), `raw.png` and the full `meta.json`. Nothing goes live: the owner looks at
   the sheet in the chat (or in the gallery), then `promote`, `reject`, or another round with `--parent` and `--note`.
`--max-calls` (default n + 1) caps the calls of one run. A call costs real money, so a run is three candidates, not thirty.

### Spending less (measured November 2026, the Space Mouse prop prompt with three references)
Tokens per call, from the API's own `usage` (recorded on every version in `meta.api.usage` and printed by `make`):

| Model, quality (1024 x 1024) | input | output (image) | seconds |
|---|---|---|---|
| `gpt-image-2.6-sunburst`, low | 1703 | 824 | 21 |
| `gpt-image-2.6-sunburst`, medium | 1703 | 1449 | 28 |
| `gpt-image-2.6-flare`, low | 1742 | 824 | 7 |
| `gpt-image-2.6-flare`, high, refining a draft | 2827 | 1758 | 10 |
| `gpt-image-1-mini`, low | 1311 | 272 | 10 |

- **Draft cheap, finish once.** Make candidates at `--quality low` (`--n 3`), look at them, then refine the winner once with `--from <NNN> --quality high`: the draft's own
  picture goes first as the reference ("redraw this cleaner"), and its brief is kept. That is three low calls plus one high, instead of three mediums or highs.
- **Sunburst is the default (the owner prefers quality over time).** Flare uses the same tokens in a third of the time. Refining ship 003 with flare at high and with sunburst at medium gave
  pictures I could not tell apart (versions 004 and 005), so no quality difference has been seen yet; judge by the contact sheets. Slow calls get a 502 from the gateway: `make`
  tries three times in all, and sunburst at `high` failed all three (100 s), medium usually gets through. For `high`, use `--model gpt-image-2.6-flare`.
  Prices per token are on the OpenAI pricing page, not in the API.
- **The cheap model is too cheap.** `gpt-image-1-mini` costs a third of the output tokens but drew a fragmented, outline-less ship (not usable as a draft).
- **Size cannot go down**: 1024 x 1024 is the smallest the newer models accept (512, 640 and 768 are refused: "below the current minimum pixel budget").
- **References cost input tokens**, about 400 each (the draft about 1100): fewer references (`--mood` off, no map) are cheaper, and input tokens are priced below output.
- **Caching**: two identical calls 20 seconds apart both reported 1703 input tokens and no `cached_tokens` field: the Images API did not show any prompt caching. The
  "cached input" price on the pricing page belongs to the Responses API; using it would mean calling the image tool through that API. Not done.

### Characters and animation frames
A character is an asset like a prop (`--class character --target 14x16`), and an animation is **several versions of the same drawing in different poses**. What works (tried on Pip,
`games/spacemouse/art/assets/pip-test/`, drafts 002, 004 and 005):
- Make the character once (`--n 3 --quality low`), pick the best frame (the base).
- Make every other frame from it: `make <game> <asset> --brief "<the character, no pose>" --from <base> --align <base> --pose "mid-stride walking: the front leg stepped forward..."`.
  `--from` sends the base picture as "the same character, drawn before: keep its design, proportions, size, colours and place, change only the pose", so the identity holds (the model kept
  Pip's helmet, ear, suit and tail); `--align` snaps the new picture on the **base's lattice** (the same crop, pixel size and place on the canvas, recorded in `meta.snap.lattice`), so the
  head stays on the same pixels from frame to frame and the frames do not jitter when played. `node tools/art.mjs resnap <game> <asset> <NNN>` records the lattice of an older version, free of charge.
- All frames have the same canvas size (the target) and the same palette. Content that falls outside the canvas at the aligned place is cut and counted (`meta.snap.cut`).
- **An asset holds its frames.** `asset.json` gets `frames: { "idle": "002", "walk1": "004", "walk2": "005" }`: a name for each frame (a-z, 0-9, underscores) and the approved version that is its
  picture, in animation order; the first frame is the base and stands for the asset (its tile and size). An asset with frames has no `live` (the checker refuses both), and its versions
  carry `meta.frame`, the name they are a candidate for.
  - `node tools/art.mjs promote <game> <asset> <NNN> --frame walk1` approves a version as that frame (a new name adds a frame at the end; promoting another version for a name takes the
    frame over; the old one stays approved on disk). `reject` refuses a version that is a frame's picture.
  - `make ... --frame walk1 --pose "..."` tags the new version, and starts from the first frame, aligned to it, unless `--from`/`--align` say otherwise.
  - `art.mjs build` gives all frames **one shared palette** (the union of their colours, dark to light, as `MOUSE_PAL` does for Pip) and writes
    `PIPE_ART[id] = { w, h, k, pal, rows, normals, frames: { idle: { rows, normals }, ... } }`, the first frame also as the asset's own rows (so it still works as a prop); `pipeFrames(id)`,
    in the generated file, turns it into engine sprites by name (`pipeFrames('pip-test').walk1`, origin at the feet for a floor asset).
  - The gallery shows the asset as one tile (first frame, "N frames", "plays"); its page has the frames in order and a player (loops them at game size and enlarged, pause, 3 to 16 per second);
    every frame's version is marked with its name. The site publishes the raw picture of the first frame only.
  Not built: the game's own Pip does not use these frames (it still has `MOUSE_FRAMES`); wiring an animation into a game is `pipeFrames` plus the game's own frame logic.
**Draw a character at twice the size it is shown** (the owner's own Pip is 26 x 28 art pixels at k .25, shown at 13 x 14): `--class character --target 28x32 --k .25`. At 14 x 16 (k .5) the legs of a
moving pose turned into dark blobs (an outline one pixel wide eats a leg that thin) and the thin tail came apart; on the 28 x 32 canvas the same prompt keeps legs, boots, belt and face, and the engine's
downsample (a sprite shown smaller than its art keeps the outline on its silhouette) halves it cleanly: `pip` (28 x 32: idle, walk1, walk2) against `pip-test` (14 x 16) is the comparison. The prompt also asks the
model for a grid of exactly the target size, and for a character, legs and arms at least two squares wide and an outline only round the silhouette (models still draw their own, finer pixels, so the size does most of the work). Cost: Pip has about 38 named frames; a pose is one call (about 2900 input and 824 output
tokens at low), so draw the key poses (idle, two walk, jump, fall) and let the engine's own tweens carry the rest.

### Keys
The keys are **network secrets** of the cloud environment, so a key is never in the repository, a script or the chat: the session's network proxy adds it to
requests for the secret's host, and the tools send a placeholder. In the Claude Code cloud environment menu (Edit, Network secrets):
- `api.openai.com`: header `Authorization`, prefix `Bearer`, the OpenAI key.
- `api.bfl.ai`: header `x-key`, no prefix, the Flux key. Flux runs a job in a region and answers with a polling URL on `api.<region>.bfl.ai` (the first
  test went to `api.isr.bfl.ai`), which needs the key too: save the same key for that host, and the download host is an unauthenticated signed URL that must
  only be allowed. Until then `make --api flux` stops at polling with a proxy 403, naming the host.
Start a **new session** after changing them. Outside the cloud, set `OPENAI_API_KEY` / `BFL_API_KEY` in the environment. `node tools/art.mjs check-keys` makes one free
call per API. Node's fetch ignores the proxy unless `NODE_USE_ENV_PROXY=1`, so `make`, `check-keys` and `models` start themselves again with it on.

## The gallery (ART page, GALLERY tab)
`/art/?game=<id>&tab=gallery`, behind the login. The build (`copyArt` in `tools/pixelite.mjs`) checks the folder with the same rules as
`art.mjs check` (a broken folder fails the build) and publishes `games/<id>/art/index.json` (every asset and the metadata of every
version) plus each version's `sprite.png`, `normals.png` and `preview.png`; the **raw image only for a live version** (the others
stay in the repository). Tiles: one per asset, the live version at game size and enlarged; "show drafts and rejected" adds assets with
no approved version. An asset opens to its pictures (sprite, game size, normal map, lit by a lamp that follows the pointer, raw or the
owner's original drawing for an import), the metadata (prompt, references, API, snap and normal settings, parent, note), a strip of
versions, a tree of which came from which, and a **compare** of any two (side by side and a difference picture). The page only reads
static files; deciding is done in the chat (a session runs `art.mjs promote` / `reject`).

## Using it in a game
`pipeline.js` defines `PIPE_ART`: each live asset as `{ name, class, char, place, k, w, h, pal, rows, normals, emit? }`, the engine's sprite
format. **Glowing pixels** (a window, a screen, eyes: the sprite's `emit` layer, engine/API.md "Sprites"): a version says which pixels glow by `meta.emit`, a list of the sprite's own
colours (`node tools/art.mjs add ... --emit "#ffe08a,#fff3b0"`: every pixel of those colours glows fully), by `emit.png` (a picture the size of the sprite, white where it glows, grey for
less: `--emit-mask glow.png`), or both; `art.mjs build` then writes `emit` rows into `pipeline.js` (and for each frame of an animation) for that asset only, so a game with no glowing pixels keeps
the file it had. The engine draws those pixels unlit and lets them light their surroundings; `art.mjs check` refuses a malformed list and a mask of another size. Space Mouse joins every asset that has a map `char` to its props (`PROP_ART`, `art.js`); anything else a game reads from
`PIPE_ART[id]` and passes to `defineSprite(data, { k: data.k, ox, oy })`. The legend entry, the open-tile list and a map spot
make a prop appear; `python3 games/spacemouse/tests/reach.py` proves the level can still be finished.

## Scale
Sprite scale is what has to match (not the whole screen): fix one `pxPerUnit` per game and a size per class in `style.json`.
Space Mouse: Pip is about 14-16 art pixels tall at the default detail (RES 2), so a prop of 12 x 11 pixels is 6 x 5.5 units. The
existing sheet-cut props are drawn about three times finer (k about 0.15) and are sampled down by the engine; new art is made at
the size the game shows it.

## Not yet built (see ROADMAP "Art pipeline")
Animation sets (Pip walking is nineteen frames today: an asset with `frames` is the natural extension), generation (needs the
owner's API keys), and approval buttons on the site.
