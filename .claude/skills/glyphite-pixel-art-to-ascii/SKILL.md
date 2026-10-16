---
name: glyphite-pixel-art-to-ascii
description: Convert a 2D pixel-art image (character, vehicle, prop, tile) into an ASCII sprite for a Glyphite game, wire it into the game, verify it at every detail level, then self-review and improve this skill.
---

# Pixel art → Glyphite ASCII sprite

Glyphite draws everything with the 95 printable ASCII characters, one colour per cell. A cell is
1 unit wide and 2 units tall, and the detail scale `RES` ∈ {1, 1.5, 2, 2.5, 3} sets how many cells
show one metre. This skill turns a pixel-art image into a palette sprite and draws it as glyphs whose
shapes follow the art, rotated with the object and lit by the scene.

The first conversion, the Regolith lander from `ref/lander_ref.png`, took about six render
iterations. The defaults below encode what those iterations taught. **Target: two iterations or
fewer.**

## Before you start

- Work in the Glyphite repo; `CLAUDE.md` describes the layout. The tools used here live in `tools/`:
  `sprite2ascii.py` (image → sprite data) and `ascii_preview.py` (sprite → ASCII preview, offline).
- The engine draws sprites: `defineSprite` / `drawSprite` / `markSpriteDyn` / `spriteHull` in
  `engine/10_sprite.js` (documented in `engine/API.md`, "Sprites"). The reference use is the lander:
  data in `games/regolith/lander_sprite.js`, setup (legs as parts, footpad soles) in
  `games/regolith/lander_art.js`. A small one: the drone in `templates/starter/drone.js`.
- Ask only what changes the outcome:
  - What the object is.
  - Its real size in game terms (metres, or relative to the lander).
  - Which parts move (legs, doors, turrets, wheels).
  - Where it touches the ground.
  Take everything else from the image.
- Copy the image into `games/<id>/ref/<name>.png`. Never edit the user's original.

## Workflow

### 1. Generate the sprite data (one command)

```sh
python3 tools/sprite2ascii.py games/<id>/ref/<name>.png --name <name> --out games/<id>              # auto grid + palette
python3 tools/sprite2ascii.py games/<id>/ref/<name>.png --name <name> --out games/<id> --grid 48x50  # exact grid
```

It writes:
- `games/<id>/<name>_sprite.js`: `const SPRITE_<NAME> = { w, h, pal: [[r,g,b,ink,glyph],...], rows: [...] }`.
  Add it to the game's `game.json` "parts" before the code that uses it.
- `shots/<name>_preview.png`: the resampled sprite, enlarged.
- A character map with a column ruler, printed to the terminal.

How it works:
- The drawing's box comes from alpha.
- The pixel size is the median flat-colour run plus the anti-aliased seam width.
- Each output pixel averages the *central half* of its block, which ignores seams.
- The palette comes from k-means, then pixels still far from every colour get their own colour,
  which keeps small accents such as windows.
- Colours darker than `--outline-lum` (45) are outline, `ink 0`.

**Check once, quickly:** look at `shots/<name>_preview.png`.
- Doubled or merged pixels mean the grid is off. Pass `--grid WxH`; the box size divided by the true
  pixel size gives it. The auto estimate tends to oversample AI-made pixel art by about 10%, which
  is harmless but a little blurrier.
- A missing small colour (an eye, a lamp) means a palette problem. Pass `--palette pal.json` with a
  curated list `[[r,g,b,ink,glyph], ...]`. Name colours by role in a comment; the lander's curated
  palette is in `games/regolith/tools/art.py`.
- **A small character with many materials** (under about 30 px: fur, suit, glass, skin): start with a
  curated palette, one entry per material. k-means merges them into muddy greys at that size.
- **A dark detail that matters** (helmet glass, a visor) vanishes in a dark scene: give its entry a
  6th field, the colour to draw it in (`[r, g, b, ink, glyph, [R, G, B]]`); it is still matched by the
  art's own colour.

**An art sheet** (many drawings on one flat background, no alpha, often animation frames in a row):
write a small `games/<id>/tools/art.py` that cuts each drawing out, flood-fills the background away
from the box edges (a plain colour key also eats dark outlines inside the drawing), runs
`sprite2ascii.py` on each with one shared palette, and writes the game's sprite file. Find the frames
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

Then set each palette entry's **dense glyph** (the 5th field) by material:

| Material | Dense glyph |
|---|---|
| metal or stone | `#` |
| bright metal, glass, highlights | `@` |
| foil, fabric, foliage, fur | `%` or `&` |
| outline colours | ink 0; the glyph is unused |

### 2. Choose scale, origin and parts (game decisions)

- **Scale `k`** is base units per sprite pixel. On screen the object is `w·k·RES` cells wide and
  `h·k·RES/2` rows tall. Pick `k` from the object's real size: 1 base unit = 0.5 m. Check against
  gameplay constraints before drawing anything:
  - collision size;
  - doorways and overhangs (for the lander, the x3 roof);
  - pad and platform widths.
- **Origin**: the pixel at the centre of mass. Rotation and physics use it.
- **Parts**: moving pieces are pixel-region rules on the character map; read the column ruler. For
  example the lander's left leg is `r >= 36 && c <= (r === 36 ? 9 : 12)`. A part is sampled where it
  would be before its offset, so it slides or moves as one piece. Draw parts *under* the body: the
  body pixel wins.
- **Contact line**: the pixels that touch the ground (feet, wheels, the bottom of a box). Their
  outline counts as paint, and they snap to a row boundary when drawn (step 4).

### 3. Preview offline before touching the game (seconds, not minutes)

```sh
python3 tools/ascii_preview.py games/<id>/<name>_sprite.js --k <k> --res 1,2,3 --origin <ox>,<oy> [--angle 0.4]
```
This prints the glyph grid and writes `shots/<name>_sprite_ascii_<scale>.png`. Iterate here on `k`,
the palette, the dense glyphs and the grid until it reads well at RES 2 (the default) and 3. RES 1
is always coarse.

The preview re-implements the game renderer without scene lighting. The game remains the source of
truth.

### 4. Draw it in the game

```js
const ROBOT = defineSprite(SPRITE_ROBOT, { k: .3, ox: 12, oy: 20,
  part: (c, r) => r >= 30 && c < 12 ? 1 : r >= 30 ? 2 : 0,      // moving parts (legs, doors), from the character map
  paint: (c, r, p) => p && r >= SPRITE_ROBOT.h - 2 });            // contact-line pixels count as paint
// GAME.draw:    drawSprite(ROBOT, b.x, b.y, b.a, { shift: [dxL, dyL, dxR, dyR], foot: 6 * RES });
// GAME.markDyn: return markSpriteDyn(ROBOT, b.x, b.y, b.a, sameOptions);
```
`foot` is the distance in units from the origin down to the contact line; it snaps to a row boundary. The
engine renderer implements the defaults below; they came out of the lander's iterations, and each one fixed a
visible problem. Change a default in `engine/10_sprite.js` only if it is wrong for every sprite, and then
check the lander too:

| Setting | Value | Why |
|---|---|---|
| Samples per cell | 3 × 6 in the object's frame (rotated) | Enough shape information for glyph matching; cells are 1×2 units. |
| Empty cell | fewer than 4 of 18 samples land on the sprite | Leaves glyph 0, so the sky shows through. |
| Outline cell | fewer than 3 paint samples → glyph 32 (opaque blank) | The silhouette's dark outline becomes a gap that still hides the sky. |
| Paint | palette ink, *or* an outline pixel whose 4 neighbours are all opaque (same part), *or* the contact-line pixels | Treating every outline pixel as a gap broke the hull into fragments; interior outline should only darken the cell. |
| Panel line | if outline is over 60% of a solid cell's paint → blank | Keeps strong interior lines (window frames) as dark lines. |
| Solid cell | 10 or more of 18 paint samples → the palette entry's dense glyph | Colour carries the image; dense glyphs read as filled pixels. |
| Edge cell | least-squares match of the 18 samples to 3×6 coverage masks rendered from the game font | Gives silhouettes their slopes and corners. |
| Edge glyph set | `.,'`-_=:;|/\()[]<>^v+~"!*` | **No letters:** `J L V Y O` made the lander look like random text. |
| Colour | 65% the cell's main paint + 35% the average | A plain average muddied thin bright details (ladder rails, RCS jets). |
| Palette in light units | `lin = -ln(1 - min(.93, c/255)) / 1.7` | After the tone map `1 - e^(-1.7·lin)` it shows the art's own colours. |
| Lighting | `colour × (0.75 + 0.4·min(1.3, sceneLight))` per channel, from `lightAtCell` | Keeps the art's baked shading and never goes black; lamps and sun still tint it. |
| Snapping | x to whole cells; y so the **contact line** lands on a row boundary | Holds still while translating, and stands on the ground instead of floating a row above. |
| Dynamic marking | the same sampler at cell centres → `dyn` cells | The object casts shadows and blocks the sun like other bodies. |

Physics from the same art:
- Hull points: `spriteHull(spr, step)` gives silhouette points in base units (multiply by RES) as a start.
  For a craft whose contacts matter, trace them from the character map with `x = (c - ox)·k`,
  `y = (r - oy)·k` (use pixel edges), about 1–2 base units apart, and mark feet, sides and so on with the
  right `kind` (see `LANDER_HULL0` in `games/regolith/lander.js`).
- Move every emitter (lights, exhaust, muzzle) to the art's actual features.

### 5. Verify (one pass)

- `node tools/glyphite.mjs build <id>` must print SYNTAX_OK.
- Render at RES 1/2/3 in both renderers, zoomed: start from `games/regolith/tests/test18.py`, freeze the
  loop with `Glyphite.test.freeze()`, use `device_scale_factor=3`, and clip around the object.
- Put the reference next to the RES 2 and RES 3 renders with Pillow, and look at them. Ask:
  - Are the main colour regions in the same places?
  - Are the signature details (window, emblem, eyes) visible at RES 3?
  - Is the silhouette clean?
  - Does it stand on the ground?
- Check timing (`games/regolith/tests/perf_lander_sprite.py` pattern). The lander costs about 1.6 ms per
  frame at RES 3 headless; keep a sprite well under 2 ms.
- Rerun the physics probes that depend on the object's geometry (for the lander:
  `games/regolith/tests/dbg_legs.py 1|2|3`, `check_x3_clearance.py`), and `python3 tests/smoke.py <id>`.

### 6. Self-review (always; this is how the skill improves)

After the sprite is done, answer these briefly in your final message:
1. How many render iterations did it take (step 3 previews plus step 5 rounds)? The target is ≤ 2.
2. What caused each extra iteration? Was it something these defaults should have covered?
3. What took the most wall-clock time? Was there a faster path (a script, a better default, an
   earlier check)?
4. Did any default produce a visible problem for this art style? Which value fixed it?

Then **improve this file**:
- Fold reusable fixes into the defaults table or the workflow steps. Add tools when a manual step
  repeated.
- Append a dated line to the Lessons log below.
- Keep the skill short. Replace outdated advice instead of piling on.

In Claude Code this file is part of the repo (`.claude/skills/glyphite-pixel-art-to-ascii/SKILL.md`):
edit it directly and mention the change. In the Claude app, propose the updated skill.

## Efficiency review of the first conversion (2026-10-14, lander)

| What happened | Cost | Fix now built in |
|---|---|---|
| Tried to detect the exact native pixel grid with a periodicity fit; x and y disagreed (AI pixel art is irregular) | 2 tool rounds | Block-centre resampling at an approximate grid; auto estimate from flat runs + seams; `--grid` override |
| Read feature coordinates from a map without a column ruler and misplaced them by 2 px | 1 round | The map always prints a ruler |
| Glyph style took six in-browser iterations (letters, dense threshold, outline rule, colour weighting, brightness, floating feet) | about 6 × 60–90 s builds plus headless screenshots | Defaults table + offline `ascii_preview.py` (about 0.2 s per preview) |
| Screenshots showed a PAUSED box | 1 round | Freeze `window.update` instead of pausing |
| A hand-tuned generator script per sprite (`games/regolith/tools/art.py`) | Manual work | Generic `sprite2ascii.py` |
| Lander-specific drawing code | Would repeat for every sprite | Done: the engine sprite module (`engine/10_sprite.js`), 2026-10-15 |

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
