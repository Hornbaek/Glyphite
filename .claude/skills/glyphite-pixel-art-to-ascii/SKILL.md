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
- The reference implementation of in-game sprite drawing is `src/10a_lander_art.js`, with its data
  in `src/10a_lander_data.js`. It is lander-specific for now (`LM_*` constants, leg rules).
- Ask only what changes the outcome:
  - What the object is.
  - Its real size in game terms (metres, or relative to the lander).
  - Which parts move (legs, doors, turrets, wheels).
  - Where it touches the ground.
  Take everything else from the image.
- Copy the image into `ref/<name>.png`. Never edit the user's original.

## Workflow

### 1. Generate the sprite data (one command)

```sh
python3 tools/sprite2ascii.py ref/<name>.png --name <name>              # auto grid + auto palette
python3 tools/sprite2ascii.py ref/<name>.png --name <name> --grid 48x50 # exact grid when you know it
```

It writes:
- `src/<name>_sprite.js`: `const SPRITE_<NAME> = { w, h, pal: [[r,g,b,ink,glyph],...], rows: [...] }`.
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
  palette is in `tools/art.py`.

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
python3 tools/ascii_preview.py src/<name>_sprite.js --k <k> --res 1,2,3 --origin <ox>,<oy> [--angle 0.4]
```
This prints the glyph grid and writes `shots/<name>_sprite_ascii_<scale>.png`. Iterate here on `k`,
the palette, the dense glyphs and the grid until it reads well at RES 2 (the default) and 3. RES 1
is always coarse.

The preview re-implements the game renderer without scene lighting. The game remains the source of
truth.

### 4. Draw it in the game

If the project already has a generic sprite module (`defineSprite` / `drawSprite`, see
`docs/ROADMAP.md`, phase 3), use it. Otherwise follow `src/10a_lander_art.js`. Generalise it into an
engine sprite module the first time a *second* sprite needs it, instead of copying it. The renderer
defaults below came out of the lander's iterations, and each one fixed a visible problem:

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
- Hull points: trace the silhouette from the character map with `x = (c - ox)·k`, `y = (r - oy)·k`
  (use pixel edges). Space them about 1–2 base units apart, and mark feet, sides and so on with the
  right `kind`.
- Move every emitter (lights, exhaust, muzzle) to the art's actual features.

### 5. Verify (one pass)

- `./build.sh` must print SYNTAX_OK.
- Render at RES 1/2/3 in both renderers, zoomed: start from `tests/test18.py`, freeze the loop with
  `window.update = () => {}`, use `device_scale_factor=3`, and clip around the object.
- Put the reference next to the RES 2 and RES 3 renders with Pillow, and look at them. Ask:
  - Are the main colour regions in the same places?
  - Are the signature details (window, emblem, eyes) visible at RES 3?
  - Is the silhouette clean?
  - Does it stand on the ground?
- Check timing (`tests/perf_lander_sprite.py` pattern). The lander costs about 1.6 ms per frame at
  RES 3 headless; keep a sprite well under 2 ms.
- Rerun the physics probes that depend on the object's geometry (for the lander:
  `tests/dbg_legs.py 1|2|3`, `tests/check_x3_clearance.py`).

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
| A hand-tuned generator script per sprite (`tools/art.py`) | Manual work | Generic `sprite2ascii.py` |
| Lander-specific drawing code | Will repeat for every sprite | Generalise into an engine sprite module on the second sprite (ROADMAP phase 3) |

## Lessons log

- 2026-10-14: First conversion (lander, 48×50, k = 0.28, origin (24, 28), legs as parts sliding
  along their struts). Taller than the old lander, so the x3 roof was raised by 1.5·RES rows.
  Landed sprites floated one row up until the contact line snapped to a row boundary and the soles'
  outline counted as paint.
