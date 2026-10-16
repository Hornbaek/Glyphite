---
name: glyphite-art-prompt
description: Write the prompt the owner pastes into ChatGPT or Gemini to generate a pixel-art sheet for a Glyphite game (characters and their animation frames, buildings, props, nature, animals, vehicles, goods), so the sheet converts into ASCII sprites cleanly the first time. Use when a new game needs art, when the owner asks what art to make or for a prompt for an image model, when a follow-up sheet must match an earlier one, and to check a sheet that came back before converting it.
---

# Write an art-sheet prompt for a Glyphite game

The owner makes the art in ChatGPT or Gemini from a prompt we write, then gives us the sheet. The
`glyphite-pixel-art-to-ascii` skill turns it into sprites and keeps every original (CLAUDE.md, "Reference art"). A loose
prompt costs hours later: hand-cut labels, tolerances tuned per drawing, palettes remapped between sheets. Every rule
below fixes something that went wrong on the four Space Mouse sheets (`games/spacemouse/ref/`, `tools/art.py`).
**Target: the sheet converts with default settings.**

## 1. Decide the game before the art

- **The art list follows the mechanics.** Work out who acts and what each does: every action is a row of frames. Then
  list what can be built or placed, and what changes state (on and off, growth stages, damage, seasons). Pin the idea
  down with the owner first, as `glyphite-new-game` says; ask only what changes the art.
- **The view.** Side view (orthographic profile, every item on a ground line) is the engine's home: gravity, falling
  sand, collapsing structures, sun shadows, the sky.

  **Isometric** works too, and the owner chose it for the Viking homestead. But say what it costs before the prompt:
  - none of the side-view physics or sun shadows;
  - the game needs an isometric ground grid and sprites drawn back to front (general engine features);
  - every moving thing needs two facings.

  Lamps, particles, sprites and sound still work. Use the isometric lines in the fixed block (section 3).
- **Leave out what the engine draws itself:**
  - terrain: rock, soil, sand, snow and ice are materials (`defineMaterial`, glyph ramps), not art;
  - sky, sun, stars, light and shadow;
  - smoke, fire, sparks, dust and blasts;
  - HUD text.

  At most, ask for a row of colour swatches for the game's materials; in isometric, one flat diamond per ground type,
  which also fixes the tile size. There is no water in the engine yet: draw boats without water (and, in isometric,
  water as a ground swatch).
- **One scale for everything:** the main character's height, A. On screen it is small. 1 m is 2·RES units, and a cell
  is 1 unit wide and 2 tall, so at RES 2 a 1.8 m person is about 4 rows by 2 cells. So:
  - people need strong silhouettes and one clear colour per role;
  - detail pays off on big things (buildings, ships, machines).
- **Draw one way, flip for the other.** `drawSprite(..., { flip: true })` mirrors a sprite.
  - Side view: everything faces right.
  - Isometric: two facings, down-right (towards the viewer, SE) and up-right (away, NE); the flip gives SW and NW.
  - Never ask for mirrored frames.

## 2. Budget the sheet

- **Sheet size:**
  - ChatGPT gives one PNG, at most 1536 × 1024 (landscape).
  - Gemini often gives a JPEG of about 1264 × 843. The JPEG noise needs a cut tolerance of 24 instead of 13, so ask for
    PNG anyway.
- **About 50 drawings per sheet.** The first Space Mouse sheet held 49 and converted well. With more, split the list by
  group into several sheets. Isometric buildings take about three times the area of side views, so an isometric game
  usually needs two sheets. Make the ground, buildings and nature first (they fix the tile and the camera), then the
  people, animals, boats and goods, matched to the first.
- **Fix the art pixel.** Every art pixel is a 2 × 2 block of image pixels. Use 3 × 3 or 4 × 4 for fewer, bigger
  drawings; the cat-bot sheet used 4. Give sizes in A, and in art and image pixels.
- **Plan the rows, and check they fit:**
  - per row, the widths plus a 24 px gap each must come to about 1450 px or less;
  - the row heights plus labels and gaps must come to about 950 px or less.

  Put the row plan in the prompt: the model follows a plan much better than a loose list. Work it out in a small table
  first (see the example).

## 3. Write the prompt

Open with one paragraph on the game: setting, mood, what the player does, anything it must *not* contain. Then paste
the fixed block below, filling in the `<…>` parts, and the game's list as numbered groups, one per row of the plan. For
every item, give:
- its size in A;
- what it is made of and its colours;
- its frames ("walk cycle, 4 frames") or states ("4 stages: …").

Name characters by role and clothing colour, and reuse those words on every later sheet.

```
FORMAT
- One PNG image, 1536 x 1024, landscape.
- Background: one flat, solid magenta (#FF00FF) everywhere behind the sprites. No checkerboard, no scenery, no ground
  strip, no boxes or frames around items, no title, no legend.
- Follow the row plan below. Leave at least 24 pixels of empty magenta around every item; no item may touch another
  item or the edge of the image.
- Under each item, a short label in small plain white text, with a clear gap so it never touches or overlaps the sprite.

STYLE (important: a program converts this art into coloured ASCII characters)
- True pixel art on a fixed grid: every art pixel is a square block of <2 x 2> image pixels. Flat colours. No
  anti-aliasing, no gradients, no blur, no glow halos, no dithering, no drop shadows.
<VIEW: the side-view or isometric lines below>
- A 1-art-pixel near-black outline (#1A1410) around every sprite. Use that near-black ONLY for outlines. No fill colour
  may be darker than #40382F: draw dark things (tar, iron, black fur or feathers, shadowed openings) in dark browns and
  greys, never black.
- 2-3 shades per material. No cast shadows on the ground, no smoke, no flames, no
  sparkles, no motion lines, no sweat drops (the game adds its own light, shadow and effects).
- Windows, glass and visors are opaque colours. Nothing is see-through, and nothing (no wall, no scenery) is drawn
  behind a character.
- A muted palette of about 32 colours: <the game's materials and clothing colours>. No pink or magenta anywhere in the
  sprites.
- Thin parts (legs, tails, antennae, handles, ropes) at least 2 art pixels thick.
- The frames of one animation are the same size, side by side in one row, on the same ground line, and identical in
  colours and proportions.
- No text, letters or runes inside the sprites.

SCALE: one scale for the whole sheet. <The main character> (A) is <24> art pixels (<48> image pixels) tall; every
size below is given in A.
```

The view lines. **Side view:**
```
- Strictly side view (profile, like a 2D platformer). NOT isometric, NOT top-down. Every item stands on an invisible
  flat ground line at its bottom edge.
- Soft light from the upper left.
- Everything that moves faces RIGHT.
```
**Isometric:**
```
- Standard 2:1 pixel-art isometric: every edge that runs along the ground steps exactly 2 pixels across for 1 pixel up
  or down. NOT side view, NOT top-down, no perspective. The same camera corner for every item: we see the top, the
  left face and the right face.
- Ground tiles are flat diamonds of <64 x 32> image pixels. Every building and object stands exactly on a diamond
  footprint of whole tiles, given below as <a x b> tiles.
- Light from the upper left: tops lightest, left faces middle, right faces darkest, on every item.
- Everything that moves is drawn facing two ways: down-right (towards the viewer, "SE") and up-right (away from the
  viewer, "NE"). Never draw the left-facing directions: the game mirrors these.
```
On an isometric sheet, size buildings and objects by footprint in tiles and height in A. A footprint of a × b tiles is
(a + b) × 32 image pixels wide; use that for the row plan.

## 4. Follow-up sheets

- **Match the first sheet.** Attach it as a reference image and write: "Match the attached sheet exactly: the same
  scale, pixel block size, outline, palette and characters." The second Space Mouse sheet drew the mouse bigger and its
  suit in other colours; `art.py` then needed a rescale (`SCALE_ACT`) and a palette mapped by hand.
- **One group per sheet** (people, buildings, …), each with its own row plan.

## 5. Check the sheet when it comes back, before converting

Save it untouched in `games/<id>/ref/` first (the reference-art rule). Then make a zoomed contact sheet with Pillow and
look at it:
- the background is one flat colour (sample the corners and a few gaps), with no checkerboard;
- labels sit clear of every drawing, and there is no title;
- the frames of one animation have the same size and ground line;
- no black fills (anything below luminance 45 becomes outline), and no pink;
- no effects, see-through glass or scenery behind characters.

If something is off, the cheapest fix is a reply in the same chat ("the same sheet, but …"); keep both images. Then
continue with `glyphite-pixel-art-to-ascii`. With a magenta background the flood fill in the cut can use a wide
tolerance (40–60) without eating into dark outlines.

## Why each rule

| Rule | What happened on Space Mouse |
|---|---|
| Flat magenta background | The sheets came on near-black (9, 11, 15), next to the outline colour. The cat-bot needed a cut tolerance of 9: at 16 its tail vanished. |
| Labels under the items, with a gap | Labels inside the station layouts B and C had to be blanked by hand (`drop` rectangles in `cut`). |
| 24 px gaps | The mouse row was split by hunting for empty columns (`columns()`, gap 7). |
| No effects | Motion lines and sweat drops had to be dropped as small stray pieces (`minfrac`). |
| Opaque glass, nothing behind characters | The helmet glass showed the wall behind it (`fill`); the wall-slide frames had a wall panel drawn behind the mouse (`also=WALL_PANEL`). |
| No fill darker than #40382F | The cat-bot's dark metal read as outline; its threshold had to drop from 45 to 25. |
| Same scale and palette on every sheet | The second sheet's mouse was bigger and recoloured (`SCALE_ACT`, `mouse_palette_actions.json`). |
| Thin parts at least 2 art pixels | One-pixel tails and handles fall between the converter's samples. |
| PNG | Gemini's JPEGs needed a tolerance of 24 against JPEG noise. |
| A row plan | Without one, the model packs items unevenly and cuts some off at the edges. |

## Lessons log

Add a dated line each time a sheet comes back: what the prompt should have said. Fold it into the rules above, and
keep the skill short.

- 2026-10-16: written from the four Space Mouse sheets. First prompt written with it: the Viking homestead
  (`example-viking-homestead.md`). The owner then chose an isometric view for it, so the skill gained the isometric lines
  and the two-sheet split (ground, buildings and nature first, then people, animals, boats and goods).
