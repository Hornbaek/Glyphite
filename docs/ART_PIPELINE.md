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
| Image API adapter (OpenAI, Flux) and the `make` loop | planned (phase 4, needs keys) | `tools/art/gen/` |
| The skill that runs the loop | planned (phase 5) | `.claude/skills/pixelite-art-pipeline/` |

## Folder per game: `games/<id>/art/`
It is separate from `ref/`, which holds the owner's own images and keeps its strict rule (`tests/node/ref.test.mjs`).

```
art/style/style.json      pxPerUnit, size classes, the fixed style paragraph, the reference images with a role
art/style/palette.json    the master palette: { colors: ["#rrggbb", ...] }
art/style/refs/           3 or 4 approved reference images (phase 3)
art/maps/<map>/           seed.png and palette.json: a sub-palette that must sit inside the master (phase 3)
art/assets/<asset>/asset.json     what the asset is, and which version is live
art/assets/<asset>/<NNN>/         one attempt: sprite.png, normals.png, preview.png, meta.json, raw.png (if it has one)
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
`pipeline.js` defines `PIPE_ART`: each live asset as `{ name, class, char, place, k, w, h, pal, rows, normals }`, the engine's sprite
format. Space Mouse joins every asset that has a map `char` to its props (`PROP_ART`, `art.js`); anything else a game reads from
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
