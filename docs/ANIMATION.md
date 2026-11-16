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

**A proof of concept.** Pip's look here is not final (the owner will update him), so the bake-off judges *methods*, not the art: when the new Pip
exists, his approved base frame replaces `pip/002`, the rig is fitted to it again (`anims/pip-walk.json`), and the chosen method runs from there.

| method | how |
|---|---|
| `openai-frame` | one edit call per frame: Pip's base picture (002) + that frame's guide, drawn in the base picture's own framing so the bones sit where Pip stands; snapped on the base's lattice, so no frame jitters by snapping |
| `openai-strip` | one call: the base picture + a 4 x 2 sheet of all eight guides; cut into cells, snapped at one pixel size, registered (feet on the base's ground row, head over the base's head) |
| `flux-frame` | as `openai-frame`, through FLUX (magenta ground, keyed out) |
| `rd-animation` | Retro Diffusion's pixel animation model (Replicate): Pip's sprite as its reference; it makes 4-frame walks in four directions at 48 x 48 and follows no guide (the right-facing row, on the key frames) |
| `toon-inbetween` | OpenAI's four key frames (from `openai-frame`) go to ToonCrafter (Replicate), a model made for cartoon in-betweens, which draws the motion between them as a looping clip; 8 frames picked, snapped at the base's pixel size, registered |
| `wan-loop` | Wan 2.7 image-to-video (Replicate): Pip's base picture is both the first and the last frame of a 2-second clip, so it loops; 8 frames picked, keyed off a green ground, snapped, registered |

| `pixellab-skeleton` | PixelLab's skeleton animation (`animate-with-skeleton-v3`): Pip's sprite at game size + the rig's 8 poses as PixelLab's 18 joints (the `pixellab` map in `anims/pip-walk.json`: near = RIGHT, the face points follow the head); the frames come back at game size, on Pip's own pixels |

PixelLab's key is a network secret since 2026-11-16 (a trial: 40 generations; an 8-frame clip costs 3, a skeleton estimate 0.1). Its own skeleton estimate
is unreliable on a 28 x 32 sprite (it put the far arm in front), so the rig is mapped by hand. Replicate's key is a network secret since 2026-11-16 (the account needs credit before a model runs,
and below $5 of credit it starts one prediction at a time: `tools/art/gen/replicate.mjs` waits out the 429). `--reuse` cuts a Replicate method's saved output
again without a call.

### Results (2026-11-16, Pip's walk)

`games/spacemouse/art/bakeoff/pip-walk/`: `compare.png`, `preview.gif` (four methods playing next to the guide), `report.md`.

| method | calls | cost reported | height range | foot range | head jitter | mean step | seam | colour drift |
|---|---|---|---|---|---|---|---|---|
| openai-frame | 8 | 29 644 tokens (low) | 0 | 0 | 0.6 px | 43% | 35% | 0.11 |
| openai-strip | 1 | 4 450 tokens (low) | 0 | 0 | 0.7 px | 50% | 45% | 0.18 |
| rd-animation | 1 | 6 s of GPU | 0 | 0 | 0.9 px | 100% | 100% | 0.71 |
| toon-inbetween | 1 (+ the 4 keys) | 70 s of GPU | 1 | 0 | 1.1 px | 36% | 68% | 0.09 |
| wan-loop | 1 | 163 s, a 2 s clip at 720p | 0 | 0 | 0.4 px | 24% | 8% | 0.12 |
| pixellab-skeleton | 1 | 3 generations | 0 | 0 | 0.0 px | 10% | 14% | 0.04 |

(Mean step: the share of pixels that change from one frame to the next; seam: the same from the last frame back to the first. Drift: how far a frame's colours are
from the base's. The prices of each run are on the owner's Replicate and OpenAI dashboards; the APIs report time and tokens, not money.)

What the numbers and the pictures say:
- **The rig and the guide do their job.** Drawn in the base picture's own framing, the guide keeps the character where it stands: no OpenAI frame grows,
  shrinks or sinks, the head moves under a pixel, and the loop has no hitch. The contact poses follow the guide's stride.
- **OpenAI per frame: steady, but the details shimmer.** Each frame is a separate drawing, so small things are redrawn differently every time (the chest panel, the
  collar, a teal rim on the helmet): played at 10 fps the suit flickers. The in-betweens come out close to the contact poses, so the stride reads weakly.
- **OpenAI strip: the best walk of the drawn ones, at the wrong scale.** One call drew a convincing cycle, but on its own grid of about 48 rows instead of 32;
  squeezed to 32 the face loses detail and the tail turns brown in three frames.
- **Retro Diffusion: not Pip.** A generic top-down RPG mouse in an orange suit, 4 frames, its own proportions. A pixel model with fixed styles cannot hold a
  given character; out of the running.
- **OpenAI keys + ToonCrafter: the steadiest suit.** The in-betweens carry the keys' details over instead of redrawing them (the lowest colour drift), so the
  first half of the cycle is the smoothest drawn motion of all. Its last segment drifts: Pip comes out softer and a little bigger, which is the pop at 4 → 5
  and the big seam.
- **Wan 2.7 loop: the most Pip, the smoothest loop.** A video model moves the base picture instead of drawing new ones, so Pip stays exactly Pip, pixel blocks
  included, and first = last makes a seamless loop (seam 8%, the smallest step of all). But it does not follow the rig: its motion is its own (a bouncy march,
  the tail swinging out of the canvas), and it took the longest.
- **PixelLab: the most faithful Pip, too little walk.** A pixel-art model that redraws the sprite itself: the helmet, face and suit are Pip's own pixels in every
  frame (no shimmer at all, colour drift 0.04, head jitter 0). But at 28 x 32 Pip's legs are about four pixels long, and the model barely moves them: one frame
  has a clear step, the rest stay close to the idle pose. The size a character is drawn at matters as much as the method: a bigger sprite (48 to 64 px tall) gives
  the legs room to stride, which is the next test, with the new Pip.
- **FLUX did not run**: its regional status host (`api.<region>.bfl.ai`) is not allowed in the environment.

**What this says about the spec's plan.** Drawing every frame separately from a guide (the spec's method) holds the pose but not the details. The two best
results did the opposite: they *moved* existing drawings (ToonCrafter between keys, Wan from the base). So the workflow that fits is a hybrid:
1. **Keys from the rig**: the artist poses the key frames on the rig; the image model draws only those (with the guide), and the artist approves them.
2. **In-betweens by a video model between approved keys**: Wan 2.7's first-and-last-frame mode (or ToonCrafter) gets two approved keys at a time and draws the
   motion between them, so every in-between is made from approved art and the pose of both ends is fixed by the rig.
3. **Snap, register, check**: frames at the game's pixel size, feet and helmet registered, animcheck warns about pops and seams; the artist approves frame by frame.

Next experiments, cheapest first:
1. **Wan between keys**: `first_frame` = an approved contact key, `last_frame` = the next key (passing), a 1-second clip per segment; the rig then decides the pose
   at every key and the video model only the motion between.
2. **ToonCrafter per segment** (two keys at a time, at 512 x 512 cells cut from the base framing), to avoid its drift over a long loop.
3. **Lock what should not move**: paste the base's helmet and head over every frame (registered on the head), recolour the suit to the base's colours.
4. **PixelLab's skeleton animation**, when its key is there.
