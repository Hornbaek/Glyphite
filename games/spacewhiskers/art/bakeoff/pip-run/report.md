# Bake-off: pip-run

Pip runs: 8 frames at 12 fps, looping, drawn from pip/001. Made with `node tools/art/bakeoff.mjs spacewhiskers pip-run`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pixellab-skeleton | pixellab animate-with-skeleton-v3 | 1 | 8/8 | 2 | 0 | 1.0 | 60% | 53% | 0.10 | 0.0% | 4 |

compare.png: the guides, then pixellab-skeleton (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## pixellab-skeleton

pixellab pixellab animate-with-skeleton-v3, 1 call(s).

- frames 0 → 1: 61% of the pixels change (a pop)
- frames 1 → 2: 61% of the pixels change (a pop)
- frames 3 → 4: 63% of the pixels change (a pop)
- frames 6 → 7: 61% of the pixels change (a pop)

