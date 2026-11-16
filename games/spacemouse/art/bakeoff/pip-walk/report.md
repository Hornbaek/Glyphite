# Bake-off: pip-walk

Pip walks: 8 frames at 10 fps, looping, drawn from pip/002. Made with `node tools/art/bakeoff.mjs spacemouse pip-walk`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flux-frame | flux-3-image | 8 | 0 | | | | | | | | |
| openai-frame | gpt-image-2.6-sunburst | 8 | 8/8 | 0 | 0 | 0.6 | 43% | 35% | 0.11 | 0.0% | 0 |
| openai-strip | gpt-image-2.6-sunburst | 1 | 8/8 | 0 | 0 | 0.7 | 50% | 45% | 0.18 | 0.0% | 0 |
| pixellab-skeleton | pixellab animate-with-skeleton-v3 | 1 | 8/8 | 0 | 0 | 0.0 | 10% | 14% | 0.04 | 0.0% | 0 |
| rd-animation | retro-diffusion/rd-animation | 1 | 4/8 | 0 | 0 | 0.9 | 100% | 100% | 0.71 | 0.0% | 18 |
| toon-inbetween | fofr/tooncrafter | 1 | 8/8 | 1 | 0 | 1.1 | 36% | 68% | 0.09 | 0.0% | 3 |
| wan-loop | wan-video/wan-2.7-i2v | 1 | 8/8 | 0 | 0 | 0.4 | 24% | 8% | 0.12 | 0.0% | 6 |

compare.png: the guides, then openai-frame, then openai-strip, then pixellab-skeleton, then rd-animation, then toon-inbetween, then wan-loop (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## openai-frame

openai gpt-image-2.6-sunburst, quality low, 8 call(s), 29644 tokens in all (as the API reported).

- no warnings

## openai-strip

openai gpt-image-2.6-sunburst, quality low, 1 call(s), 4450 tokens in all (as the API reported).

- no warnings

## pixellab-skeleton

pixellab pixellab animate-with-skeleton-v3, 1 call(s).

- no warnings

## rd-animation

replicate retro-diffusion/rd-animation, 1 call(s).

- frame 0: touches the left edge of the canvas (cut off?)
- frame 0: its colours drift from the anchor's (0.71)
- frame 1: empty
- frame 2: its colours drift from the anchor's (0.71)
- frame 3: empty
- frame 4: touches the left edge of the canvas (cut off?)
- frame 4: its colours drift from the anchor's (0.69)
- frame 5: empty
- frame 6: its colours drift from the anchor's (0.72)
- frame 7: empty
- frames 0 → 1: 100% of the pixels change (a pop)
- frames 1 → 2: 100% of the pixels change (a pop)
- frames 2 → 3: 100% of the pixels change (a pop)
- frames 3 → 4: 100% of the pixels change (a pop)
- frames 4 → 5: 100% of the pixels change (a pop)
- frames 5 → 6: 100% of the pixels change (a pop)
- frames 6 → 7: 100% of the pixels change (a pop)
- the loop's seam (last → first) changes 100% of the pixels
- frame 1 failed: this model draws 4 frames per walk: no in-between
- frame 3 failed: this model draws 4 frames per walk: no in-between
- frame 5 failed: this model draws 4 frames per walk: no in-between
- frame 7 failed: this model draws 4 frames per walk: no in-between

## toon-inbetween

replicate fofr/tooncrafter, 1 call(s).

- frames 2 → 3: 61% of the pixels change (a pop)
- frames 4 → 5: 65% of the pixels change (a pop)
- the loop's seam (last → first) changes 68% of the pixels

## wan-loop

replicate wan-video/wan-2.7-i2v, 1 call(s).

- frame 1: touches the left edge of the canvas (cut off?)
- frame 2: touches the left edge of the canvas (cut off?)
- frame 3: touches the left edge of the canvas (cut off?)
- frame 4: touches the left edge of the canvas (cut off?)
- frame 5: touches the left edge of the canvas (cut off?)
- frame 6: touches the left edge of the canvas (cut off?)

