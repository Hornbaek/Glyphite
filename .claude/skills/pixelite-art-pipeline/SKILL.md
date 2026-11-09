---
name: pixelite-art-pipeline
description: Make new art for a Pixelite game through an image API (OpenAI first, Flux second) and put it in the game only when the owner approves - brief, style sheet and palette, generate candidates, snap them to the target size and the game's palette, show a contact sheet in the chat, iterate on a note, promote, verify, open a pull request. Use when the owner asks for a new prop, character, tile or any art for a game that has an art/ folder (Space Mouse), asks to redo or tweak a picture, or wants art in a map's colours. For a sheet the owner makes in ChatGPT or Gemini themselves, use pixelite-art-prompt and pixelite-pixel-art instead.
---

# Make art through the art pipeline

Reference: `docs/ART_PIPELINE.md`. A game's art lives in `games/<id>/art/`: a style sheet (`style/style.json`: the style paragraph and four
reference pictures), one master palette, maps (a seed picture and a sub-palette each) and assets with numbered versions. **Nothing reaches
the game until a version is promoted**, and the owner approves it first. Never edit `pipeline.js` or a `sprite.png` by hand.

## The loop

1. **The brief.** One sentence of what to draw, and where it goes (which asset, which map, how big in the game: a character is about 14 px
   tall, a prop 8 to 40). Ask the owner only what changes the picture. A new asset needs `--class prop|character|tile`, `--target WxH`
   (what the game shows, one art pixel = one world pixel at the default detail, so `--k .5`), and for a prop `--place floor|wall|ceiling`.
   Check the keys first in a new session: `node tools/art.mjs check-keys` (both lines `OK`; if not, `docs/ART_PIPELINE.md`, "Keys").
2. **Look at the prompt before spending.** `node tools/art.mjs make <game> <asset> --brief "..." --map <map> --dry` prints the exact prompt and
   the references it would send. The style paragraph, the palette and the references do most of the work: if the result will depend on a
   detail the paragraph lacks (outline, light, mood), fix the style sheet, not the brief.
3. **Generate, cheap first.** `node tools/art.mjs make <game> <asset> --brief "..." [--map <map>] --n 3 --quality low`. It makes `n` DRAFT versions (three is
   a good first round; low quality is about half the output tokens of medium; the model is the default, `gpt-image-2.6-sunburst`: the owner wants quality over speed), each with `raw.png` (the model's picture), `sprite.png` (snapped to the exact target on the palette),
   `normals.png` and `preview.png` (the contact sheet). It stops by itself at `--max-calls` (default n + 1). A call costs real money (about
   a few cents at medium quality; Flux about 5 cents), so do not loop without a reason. When the owner picks one, finish it once: `make <game> <asset> --from <NNN> --quality medium
   [--note "what to sharpen"]` redraws that draft (sunburst at `high` is refused by the gateway here: three 502s in 100 s; `--quality high --model gpt-image-2.6-flare` works) (its own picture is the first reference). Token counts by model and quality: docs/ART_PIPELINE.md, "Spending less".
4. **Show the owner, in the chat.** Stack the `preview.png` files into one picture (rows, one per candidate; Pillow does it), send it with
   `SendUserFile`, and say in one line which one reads best and why. Each row is: the model's picture | the sprite 4x | its normal map |
   lit from the left | lit from the right | game size. **Judge at game size and in the lit columns**, not the raw: a 10 x 14 sprite has
   little room, and what matters is whether it reads. Say honestly when none do.
5. **The owner answers.**
   - *Approve* → `node tools/art.mjs promote <game> <asset> <NNN>` (it becomes the live version), `node tools/art.mjs build <game>`, and make sure
     the game uses it (a new asset needs `"pipeline.js"` in `game.json` parts before the art file, a map character in the legend and the open
     tiles, and a place in a sector: see how `cheese-crate` is wired in `games/spacemouse/`).
   - *Iterate with a note* → `make ... --parent <NNN> --note "what to change"`; the note goes into the next prompt as the change from that
     version. Two or three rounds is normal; after that rethink the brief.
   - *Reject* → `node tools/art.mjs reject <game> <asset> <NNN> --note "why"`. A rejected version stays on disk (it shows in the gallery with
     "show drafts and rejected") and never reaches the game.
   Drafts nobody approved are fine to leave: the gallery shows them.
6. **Verify and ship.** `npm run build`, `npm test`, `node tools/art.mjs check`, the game's smoke test and its regressions (`pixelite-verify`), look at
   the screenshots with the new art in the lamp light at RES 1-3. Then branch, commit, pull request (CLAUDE.md, "Shipping changes"), merge on
   green, tell the owner what to look at (the gallery: ART on the game list).

## Characters and animation
A character is made like a prop but **at twice the size it is shown** (`--class character --target 28x32 --k .25`: at 14 x 16 the legs turn into blobs; the engine halves a 28 x 32 sprite cleanly). Its other frames are poses of the chosen base frame: `make ... --brief "<the character, no pose>"
--from <base> --align <base> --pose "<what the body does>"`. Use `--align` always for frames of one animation (same grid, same place: no jitter); `resnap` records the lattice of an older
version for free. Make the key poses only (`--frame walk1` tags a candidate and starts from the first frame, aligned), show them side by side (and a GIF: Pillow), and say what turned to blobs. When the owner
approves a frame: `promote <game> <asset> <NNN> --frame walk1`; the asset then holds its frames (`frames` in asset.json), `build` writes them on one palette, the gallery plays them,
and a game uses them through `pipeFrames('<asset>')` (docs/ART_PIPELINE.md).

## Things that go wrong

- **The snap cannot reach the size** ("could not reach 10 x 14"): the model drew something too detailed or too wide. Make the brief simpler
  ("one barrel, plain, no scene"), or change the target by a pixel. Do not stretch.
- **Colours look wrong**: a sprite is snapped to the map's sub-palette (or the master): if a colour the subject needs is missing, add it to
  the master palette by hand (and the map's), then `recolor` is not needed for new versions. Never go over 64 colours.
- **A model refuses a transparent background**: `make` notices and asks again for a flat magenta one. `--key` forces that.
- **Flux in a cloud session** polls `api.<region>.bfl.ai`, which must be an allowed host with the key saved for it; if `make --api flux` fails
  at polling with a 403 from the proxy, say which host and ask the owner (do not retry).
- **The model name changed**: `node tools/art.mjs models openai` lists what the key can use; pass `--model`, or set `gen.model` in `style.json`.
  Every version records the provider, model and request id.
- **Style drifts over time**: when a new version is the best picture of its kind, make it a reference: `node tools/art.mjs promote-ref <game>
  <asset> <NNN> --role props --replace refs/props.png`. Ask the owner before changing the style sheet itself.
- **The owner's own drawings** are never replaced silently: imported versions stay as they are; a generated one is a new version.
