---
name: pixelite-pixel-art
description: Turn a 2D pixel-art image or an AI-made art sheet (character, vehicle, prop, tile) into sprites for a Pixelite game - snap it to its true grid and palette, give it a normal map so the game's lamps light it, wire it into the game at one art pixel per world pixel, verify it at every detail level, then self-review and improve this skill.
---

# Pixel art → Pixelite sprite

Pixelite draws the world as square pixels, one cell each (1 unit; `UNIT_M = 0.5/RES` m), and the detail scale `RES` ∈
{1, 1.5, 2, 2.5, 3} sets how many pixels show one metre. A sprite is palette-indexed pixel art: each world cell it covers
becomes one pixel in the colour most of the art under it has, turned with the object and lit by the scene, and, with a
normal map, brighter where it faces a lamp or the sun. This skill takes art from an image to a sprite in the game.
**Target: two render iterations or fewer.**

## Before you start

- Work in the Pixelite repo; `CLAUDE.md` describes the layout. The tools:
  - `tools/snap.mjs`: Pixel Snapper (Sprite Fusion, WebAssembly in `portal/vendor/pixel-snapper/`): finds the grid an
    AI-made image was meant to have and snaps it to that grid and a palette (give `--pixel-size` for AI art: it may be
    fractional, e.g. 3.2, and is followed exactly; the guess is good on clean art, unreliable on AI sheets).
  - `tools/pixelsprite.py`: image → sprite data (`{ w, h, pal, rows }`), with its own grid estimate and palette.
  - `tools/normalmap.mjs`: a normal map for clean pixel art (`--rows` prints the sprite's `normals`); `--from-map` reads
    one made by hand in **Pixel Art Lighter** (`/lab/lighter/`, linked from the PIXEL LAB).
  - The **PIXEL LAB** page (`/lab/` on the site) does snapping and normals with sliders and a lamp you move, and hands
    the settings back as a prompt with these exact commands: when the owner sends one, run it as given.
- The engine: `defineSprite` / `drawSprite` / `markSpriteDyn` / `spriteHull` in `engine/10_sprite.js` (`engine/API.md`,
  "Sprites"). Examples: the lander (`games/regolith/lander_sprite.js`, legs as parts in `lander_art.js`), the starter's
  drone (`templates/starter/drone.js`), Space Mouse's sheets (`games/spacemouse/tools/art.py`).
- Ask only what changes the outcome: what the object is, its real size (metres, or next to the player), which parts
  move (legs, doors, turrets, wheels), where it touches the ground. Take everything else from the image.
- A whole sheet the owner generated from a prompt: check it first with the `pixelite-art-prompt` skill (step 5).
- **Keep every original drawing** (the owner's standing rule): the image goes into `games/<id>/ref/` untouched; each
  drawing you cut, trace or crop from it is saved at its original pixels in `ref/frames/`, including the ones the game
  does not use yet, and listed in `ref/ref.json` with its box on the sheet and what it is used for (plus `ref/README.md`).
  Do it in the game's `tools/art.py` (copy `save()`, `REFERENCE` and `write_reference()` from
  `games/spacemouse/tools/art.py`), so a rerun rewrites it. `tests/node/ref.test.mjs` fails on an unlisted image.

## Workflow

### 1. Clean the art: one pixel per art pixel

AI-made "pixel art" is drawn several screen pixels per art pixel, irregularly, with soft seams and stray colours.
- **Snap it** (best on AI sheets): `node tools/snap.mjs in.png clean.png --colors 12 [--pixel-size P] [--palette hex,...]`.
  Measure P once on the sheet (sheet pixels per art pixel; fractions are fine) and always give it for AI art: no
  version of the guess is reliable on AI sheets, which have no single exact grid. Check the printed size: the art should
  come out at the pixel count it was drawn with.
- **Or let pixelsprite.py resample it** (step 2): it averages the middle half of each block, which also ignores seams;
  give `--grid WxH` (box size / pixel size) when its estimate is off.
- **Lock the palette** for a character's frames (one palette for all, so colours don't flicker between moves): snap with
  `--palette` from the first clean frame, or give `pixelsprite.py --palette pal.json` a curated list, one entry per
  material, named by role in a comment. Small characters (under ~30 px) with many materials need the curated list:
  k-means merges fur, suit and glass into muddy greys. A dark detail that matters (helmet glass) gets a 6th field, the
  colour to draw it in (`[r, g, b, ink, glyph, [R, G, B]]`; the 5th field, a glyph, is ignored by the pixel engine).

**An art sheet** (many drawings on one flat background, no alpha, often animation frames in a row):
write a small `games/<id>/tools/art.py` that cuts each drawing out, flood-fills the background away
from the box edges (a plain colour key also eats dark outlines inside the drawing), runs
`pixelsprite.py` on each with one shared palette, and writes the game's sprite file. Find the frames
as the column spans of non-background pixels in the row. Line frames up on a stable feature (the
head), not the box centre, or the character jitters between frames. Example: `games/spacemouse/tools/art.py`
(four sheets). What its `cut()` handles, each learned the hard way:
- **Strays** (labels, sweat drops, motion lines): keep the pieces at least a fraction of the biggest. Keeping only
  the biggest drops thin parts that came loose (a tail, a helmet behind a dark collar).
- **Tolerance**: about 9 on a clean PNG background (higher eats thin dark parts like a tail), about 24 on a JPEG.
- **Something drawn behind the character** (a wall): treat its colours as background too, then fill what the
  outline encloses in the head with the glass colour (see-through glass showed the wall).
- **A glow round a lit object**: crop the box to the object itself; a higher tolerance alone leaves a halo.
- **A second sheet of the same character** (from another AI, drawn larger): scale it by a standing frame's height,
  and give it a palette listing the same materials in the same order, matched against its colours but drawn in
  the first sheet's (the 6th field), so the colours don't jump between moves.
- **Dark shading** (black-grey metal): only near-black (luminance < 25) is outline; the default 45 turns dark
  metal into gaps and the character falls apart.

### 2. Sprite data

```sh
python3 tools/pixelsprite.py clean.png --name <name> --out games/<id> [--grid WxH] [--colors 12] [--palette pal.json]
```
It writes `games/<id>/<name>_sprite.js` (`const SPRITE_<NAME> = { w, h, pal: [...], rows: [...] }`; add it to the game's
`game.json` "parts" before the code that uses it), `shots/<name>_preview.png` (enlarged) and prints a character map with a
column ruler (for parts and hull points). Look at the preview once: doubled or merged pixels mean the grid is off; a
missing small colour (an eye, a lamp) means the palette needs it.

### 3. Normal map (so lamps model it)

```sh
node tools/normalmap.mjs clean.png --rows [--bevel 3] [--detail .8] [--strength 2.5]
```
Put the printed rows in the sprite as `normals: [...]` (same size as `rows`; base 36 into the engine's direction table,
`.` where there is no pixel). How it works: height from the distance to the silhouette (a rounded `bevel` pixels wide)
plus the paint's brightness (`detail`: light paint stands out, dark lines sink in), slope × `strength` → normal. The
defaults suit 15–60 px sprites with dark outlines: a thinner bevel only tilts the outline, which hardly shows. Tune them
in the PIXEL LAB with the lamp, then use the same numbers here. Skip normals for flat things (signs, decals, UI).
Dark outlines (luminance under .16) take the paint beside them, so they don't carve ridges.

**By hand, for hard shapes** (buildings, machines, anything with flat faces): open the clean PNG in Pixel Art Lighter
(`/lab/lighter/`: Architecture / Character / Object / Terrain presets, faceted surfaces, a brush to fix any area), export
its normal map (green up), check it in the PIXEL LAB ([ LOAD A NORMAL MAP ]), then
`node tools/normalmap.mjs --from-map normals.png --rows` (`--green-down` for maps from tools that point green down).
Keep the exported map in the game's `ref/` with the art.

**Glowing pixels** (a window at night, a screen, eyes, a lamp's bulb): a sprite may carry `emit: [...]` beside `normals` (same size, `.` or a base-36 digit, 9 = the pixel is fully its own
light). The engine draws those pixels unlit and lets them light their surroundings (`engine/API.md`, "Glowing pixels"). Mark them while converting:
`python3 tools/pixelsprite.py ... --emit '#ffe08a,#fff3b0'` (every pixel of those palette colours glows) or `--emit-mask glow.png` (white where it glows), or in the art pipeline
`node tools/art.mjs add ... --emit '#ffe08a'`. Pick the glowing colours as their own palette entries (the same yellow as the lit wall would glow too).

### 4. Scale, origin and parts (game decisions)

- **Scale `k`** (base units per art pixel): pixel art looks best at **one art pixel per world pixel** at the game's
  default detail, so `k = 1 / RES_default` (k = 0.5 at RES 2). At other detail levels it is resampled (nearest colour),
  which is fine for a setting the player chose. If that makes the object the wrong size for the game, resize the *art*
  (snap with another pixel size, or redraw), not `k`: mixed pixel sizes are the classic pixel-art mistake. Then check the
  gameplay constraints: collision size, doorways and overhangs, platform widths.
- **Origin**: the pixel at the centre of mass; rotation and physics use it.
- **Parts**: moving pieces are pixel-region rules on the character map (e.g. the lander's left leg is
  `r >= 36 && c <= (r === 36 ? 9 : 12)`). A part is sampled where it would be before its offset, so it moves as one piece.
- **Contact line**: the pixels that touch the ground; `foot` snaps it to a row boundary when drawn.

### 5. Draw it in the game

```js
const ROBOT = defineSprite(SPRITE_ROBOT, { k: .5, ox: 12, oy: 20, part: (c, r) => r >= 30 && c < 12 ? 1 : r >= 30 ? 2 : 0 });
// GAME.draw:    drawSprite(ROBOT, b.x, b.y, b.a, { shift: [dxL, dyL, dxR, dyR], foot: 6 * RES });
// GAME.markDyn: return markSpriteDyn(ROBOT, b.x, b.y, b.a, sameOptions);
// still things (trees, buildings): drawSprite(TREE, x, y, 0, { cache: true })
```
What the engine does (change a default in `engine/10_sprite.js` only if it is wrong for every sprite, then check the
lander and Space Mouse too):

| Setting | Value | Why |
|---|---|---|
| Samples per cell | 3 × 3 in the object's frame (rotated) | Enough to find the cell's main colour and its average normal. |
| Empty cell | under 45% of the samples on the art | The sky and the world behind show through the silhouette's edge. |
| Colour | on the silhouette: the outline if any sample hit it; inside: the most common paint colour | Drawn small, the shape keeps its dark edge and thin inner lines don't speckle (Space Mouse's mouse at 14 px). |
| Palette in light units | `lin = -ln(1 - min(.93, c/255)) / 1.7` | After the tone map it shows the art's own colours. |
| Lighting | `colour × relief × (0.75 + 0.4·min(1.3, sceneLight))` | Keeps the art's baked shading and never goes black; lamps and sun tint it. |
| Relief (normal maps) | `0.5 + 0.5·sprRelief(n, light direction)`, exactly 1 for a flat pixel | Facing the light up to ×1.35, facing away down to ×0.65; the direction comes from the sun, the lamps (`LDX/LDY`) and a little sky from above. |
| Snapping | x to whole cells; y so the contact line lands on a row boundary | Holds still while moving, stands on the ground. |

Physics from the same art: `spriteHull(spr, step)` gives silhouette points (base units: multiply by RES); for a craft whose
contacts matter, trace them from the character map (`x = (c - ox)·k`, `y = (r - oy)·k`) with the right `kind` (see
`LANDER_HULL0` in `games/regolith/lander.js`). Move every emitter (lights, exhaust) to the art's actual features.

### 6. Verify (one pass)

- `node tools/pixelite.mjs build <id>` prints SYNTAX_OK.
- Render at RES 1/2/3 in both renderers, zoomed (`device_scale_factor=3`, a clip round the object, after
  `Pixelite.test.freeze()`); `games/regolith/tests/test18.py` is a template. Put the clean art next to the RES 2 render
  and look: the same colour regions, the signature details (eyes, window) visible, a clean silhouette, standing on the
  ground. With a normal map, light it from both sides (a lamp left, then right) and see the side facing the lamp brighten.
- Timing: keep a sprite well under 2 ms a frame at RES 3 (`games/regolith/tests/perf_lander_sprite.py` pattern).
- Rerun the game's probes that depend on the object's geometry, and `python3 tests/smoke.py <id>`.

### 7. Self-review (always; this is how the skill improves)

Answer briefly in your final message: how many render iterations (target ≤ 2), what caused each extra one, what took
the most time and what would have been faster, and which default caused a visible problem. Then **improve this file**:
fold reusable fixes into the defaults or the steps, append a dated line to the Lessons log, and keep it short. In Claude
Code edit it directly (`.claude/skills/pixelite-pixel-art/SKILL.md`) and mention the change.

## Lessons log

- 2026-10-14: First conversion (lander, 48×50, k = 0.28, origin (24, 28), legs as parts sliding
  along their struts). Taller than the old lander, so the x3 roof was raised by 1.5·RES rows.
  Landed sprites floated one row up until the contact line snapped to a row boundary and the soles'
  outline counted as paint.
- 2026-10-15: The lander renderer became the engine's `defineSprite` / `drawSprite` (pixel-identical
  output; the dense glyph now comes from each palette entry's 5th field). Second sprite: the starter's
  drone (16×8, k = 0.5, drawn with the defaults, no iterations).
- 2026-10-16: Space Mouse from an art sheet: six mouse frames (26×28 at k = 0.25, origin under the
  helmet), a cheese wedge, ten props. Three rounds: k-means made the suit muddy (curated palette by
  material), then per-material dense glyphs, then the dark helmet glass vanished (display colour,
  now `sprite2ascii.py`'s 6th palette field). Cutting from the sheet needed a flood fill, not a key.
- 2026-10-16: Three more sheets for Space Mouse (ChatGPT cat-bot, 12 frames, k = 0.19; Gemini mouse moves, 13 frames,
  scaled 0.22 to match; Gemini objects). Two rounds each for the cat (tails lost at tolerance 16; dark metal as
  outline) and the wall slides (largest piece only; see-through glass), one for the objects (glow under a lamp).
  Fixes are now in the list under "An art sheet".
- 2026-10-17: Fjordheim, 70 sprites from three Gemini JPEG sheets (isometric buildings, trees, a family, animals). Four
  rounds for the whole set: labels touching drawings were cut in (`drop` boxes), the JPEG's magenta bled into the outlines
  (`unpink` in `games/fjordheim/tools/art.py`: magenta-tinted palette colours become outline or transparent), and dark
  buildings read as dim `#` blocks, fixed by picking the dense glyph by material (thatch `%`, log walls `=`, stone `#`/`@`)
  and lifting the palette by a gamma of .8 in the game. Still sprites use `drawSprite`'s `cache`.
- 2026-11-07: The engine moved to pixels (Pixelite). Sprites are drawn as pixels, not glyphs, so the glyph defaults went;
  Pixel Snapper (`tools/snap.mjs`) and normal maps (`tools/normalmap.mjs`, the PIXEL LAB page) joined the tools. Normal
  maps with a 2 px bevel only tilted the dark outline and hardly showed: the defaults are now bevel 3, detail .8, strength
  2.5, and the direction table has a gentle 20° ring so soft slopes keep their direction.
- 2026-11-07: Pixel Snapper got a lattice fit (fractional pixel sizes, a given size followed exactly; benchmark in
  `docs/LESSONS.md`), the generator merges outlines into the paint beside them, and Pixel Art Lighter (Moonfell RPG's
  tool) joined the PIXEL LAB for hand-made normals, read with `--from-map`.
