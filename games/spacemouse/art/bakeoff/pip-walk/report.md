# Bake-off: pip-walk

Pip walks: 8 frames at 10 fps, looping, drawn from pip/002. Made with `node tools/art/bakeoff.mjs spacemouse pip-walk`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flux-frame | flux-3-image | 8 | 0 | | | | | | | | |
| openai-frame | gpt-image-2.6-sunburst | 8 | 8/8 | 0 | 0 | 0.6 | 43% | 35% | 0.11 | 0.0% | 0 |
| openai-strip | gpt-image-2.6-sunburst | 1 | 8/8 | 0 | 0 | 0.7 | 50% | 45% | 0.18 | 0.0% | 0 |

compare.png: the guides, then openai-frame, then openai-strip (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## openai-frame

openai gpt-image-2.6-sunburst, quality low, 8 call(s), 29644 tokens in all (as the API reported).

- no warnings

## openai-strip

openai gpt-image-2.6-sunburst, quality low, 1 call(s), 4450 tokens in all (as the API reported).

- no warnings

