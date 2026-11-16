# Bake-off: pip-idle

Pip breathes: 4 frames at 6 fps, looping, drawn from pip/001. Made with `node tools/art/bakeoff.mjs spacewhiskers pip-idle`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pixellab-skeleton | pixellab animate-with-skeleton-v3 | 1 | 4/4 | 1 | 1 | 1.0 | 23% | 55% | 0.02 | 0.0% | 0 |

compare.png: the guides, then pixellab-skeleton (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## pixellab-skeleton

pixellab pixellab animate-with-skeleton-v3, 1 call(s).

- no warnings

