# Animation: rig-guided AI frames, and the bake-off that picks the method

**The ask (2026-11-15):** the owner, with another tool, wrote a spec for an animation tool for *Star Whiskers: The Holy Cow* (the Space Mouse remake):
pose a simple 2D skeleton, let an image model draw the whole character in each pose, review and approve frames, export aligned sprite sheets. "I'm not 100%
sure it's the smartest way to go, but in the end, we need a workflow to create great looking animations. Perhaps look at other tools online."

**The plan:** prove the drawing method first, on one Pip walk cycle, then build the studio (`/anim/`) around the method that wins. The rig, the pose guides and the
checks are kept whatever wins: they are how any method is told the pose and how its frames are judged.

## What other tools do (researched November 2026)

- **PixelLab** (pixellab.ai, also an Aseprite extension and an API): *animate with skeleton* (a pixel-art model that follows a pose skeleton, up to 128 px,
  forced palette, inpainting), *pose a sprite* (one skeleton per frame, 3 to 15 frames, up to 256 px), pose-to-image. The spec's idea, done by a model trained on
  pixel art, at sprite sizes.
- **Ludo.ai**: pose presets and hundreds of motion presets applied to one sprite, motion transfer, "animate from video", export as sheets with normalised scale.
- **Retro Diffusion** (`rd-animation`, on Replicate): pixel-art models that make a walk or idle as a sprite sheet, with a palette option.
- **Image-to-video, then frames** (Kling, Seedance, MiniMax): animate the reference, pick frames evenly over one cycle, key out the background, snap to the palette.
  The video models keep a silhouette steady over a short clip.
- **One anchor frame, a whole strip in one picture**: how the owner's ChatGPT sheets were made. Practitioners disagree whether a strip or one frame at a time holds
  the character better; all agree on locking one anchor frame, snapping to palette and grid, normalising placement, and a person approving every frame.
- Research: *Sprite Sheet Diffusion* (arXiv 2412.03685) notes that pose estimators (OpenPose, DWPose) do not generalise to sprite illustrations, which is why
  the rig here is drawn by hand, not detected.

## The pieces (built in this branch)

- **`portal/assets/rig-core.mjs`** (browser and Node): a forward-kinematics rig in the sprite's own pixels; poses are local angles plus a root offset;
  `poseAt` interpolates the short way round with an ease per key (linear, smooth, in, out, hold) and wraps loops; `mirror` swaps near and far limbs by world angle
  (the right-foot contact from the left-foot one); `expandKeys` with `mirrorHalf` authors half a cycle; `loopSeam` measures the seam; `renderGuide` draws the pose
  guide (skeleton, silhouette or both; near limbs orange-red, far limbs blue, body and head green, tail purple, a yellow line where the face looks), the same bytes
  every time; `guideStrip` lays guides out in a grid. Tests: `tests/node/rig.test.mjs`.
- **`games/<id>/art/anims/<anim>.json`**: one animation: the asset and base version it draws, a brief, the rig fitted by hand over the base sprite, and the keys
  (frame, label, ease, the action in words, the pose). `pip-walk.json` is Pip's: two keys (contact, passing) and their mirrors, 8 frames at 10 fps, looping.
- **`tools/art/animcheck.mjs`**: deterministic checks of a sequence: box, feet, head, clipping, palette, colour drift from the anchor, height and foot range, head
  jitter, the share of pixels that change between neighbours and at the loop's seam, with warnings naming the frame. Tests: `tests/node/animcheck.test.mjs`.
- **`tools/art.mjs make --guide <png>`**: a pose guide as the second reference picture, named as a guide in the prompt (only with `--pose`, so the words and the
  picture say the same).
- **`tools/art/bakeoff.mjs`**: runs the methods on one animation and writes `games/<id>/art/bakeoff/<anim>/`: `guides/` (every frame's guide in the base
  picture's framing, and the strip), one folder per method (the model's raw pictures in `raw/`, the frames at game size, `meta.json` with prompts, calls and the
  usage the API reported), `compare.png` (guides, then a row per method at 4x and at game size) and `report.md` (the checks). `--dry` writes the guides and prints
  the prompts without a call; `--compare` rebuilds the sheet and report for free. Tests: `tests/node/bakeoff.test.mjs`.

## The bake-off

Methods run so far (the ones whose keys the environment has):

| method | how |
|---|---|
| `openai-frame` | one edit call per frame: Pip's base picture (002) + that frame's guide, drawn in the base picture's own framing so the bones sit where Pip stands; snapped on the base's lattice, so no frame jitters by snapping |
| `openai-strip` | one call: the base picture + a 4 x 2 sheet of all eight guides; cut into cells, snapped at one pixel size, registered (feet on the base's ground row, head over the base's head) |
| `flux-frame` | as `openai-frame`, through FLUX (magenta ground, keyed out) |

Not run yet, waiting for keys (the owner adds them in the environment's settings: Network secrets): **PixelLab** (`api.pixellab.ai`), **Retro Diffusion** and an
**image-to-video** model (both through Replicate, `api.replicate.com`; its downloads come from `replicate.delivery`, already allowed).

### Results (2026-11-16, Pip's walk, quality low)

`games/spacemouse/art/bakeoff/pip-walk/`: `compare.png`, `preview.gif` (both methods playing next to the guide, 6x), `report.md`.

| method | calls | tokens | height range | foot range | head jitter | mean step | seam | colour drift |
|---|---|---|---|---|---|---|---|---|
| openai-frame | 8 | 29 644 | 0 | 0 | 0.6 px | 43% | 35% | 0.11 |
| openai-strip | 1 | 4 450 | 0 | 0 | 0.7 px | 50% | 45% | 0.18 |

What the numbers and the pictures say:
- **The rig and the guide do their job.** Drawn in the base picture's own framing, the guide keeps the character where it stands: no frame of either method grows,
  shrinks or sinks (height and foot range 0), the head moves under a pixel, and the seam is no bigger than an ordinary step, so the loop has no hitch. The contact
  poses follow the guide's stride; Pip's helmet, ear, suit and tail stay his.
- **Per frame: steady, but the details shimmer.** Each frame is a separate drawing, so small things are redrawn differently every time (the chest panel, the
  collar, a teal rim on the helmet in three frames): played at 10 fps the suit flickers. The in-betweens and the passing pose come out close to the contact
  poses (the lifted knee is lost), so the stride reads weakly.
- **Strip: the best walk, at the wrong scale.** One call drew a convincing cycle with one character throughout, but on its own grid of about 48 rows instead of
  the 32 asked for; squeezed to 32 the face loses detail and the tail turns brown in three frames. At its own grid (the snapper finds it) it is clean.
- **FLUX did not run**: its first two jobs were taken, but their regional status host (`api.<region>.bfl.ai`) is not allowed in the environment, and the rest
  were refused while those counted as running (the account's low balance allows one task at a time). Allow the regional hosts before trying it again.

Next experiments, cheapest first:
1. **Strip at its own scale**: ask for 4 frames per picture (bigger cells) or accept the model's grid and make Pip's frames 42 x 48 (the engine draws any k).
2. **Lock what should not move**: in a walk the helmet and head barely change, so paste the base's head over every frame (registered on the head) and let only the
   body and legs come from the model; recolour the suit to the base's colours.
3. **Per frame with a neighbour**: the approved key next to an in-between as a third picture (`role: neighbour` in `make`), only after a person approved it.
4. **The pixel-art specialists** (PixelLab's skeleton animation, Retro Diffusion) and an image-to-video model, when their keys are there.
