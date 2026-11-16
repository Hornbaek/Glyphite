# Bake-off: pip-jump

Pip jumps: 8 frames at 12 fps, drawn from pip/001. Made with `node tools/art/bakeoff.mjs spacewhiskers pip-jump`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pixellab-skeleton | pixellab animate-with-skeleton-v3 | 1 | 8/8 | 4 | 1 | 2.1 | 65% |  | 0.11 | 0.0% | 7 |

compare.png: the guides, then pixellab-skeleton (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## pixellab-skeleton

pixellab pixellab animate-with-skeleton-v3, 1 call(s).

- the height changes by 4 pixels across the frames (it pumps)
- the head jumps 2.1 pixels between two frames
- frames 0 → 1: 74% of the pixels change (a pop)
- frames 1 → 2: 77% of the pixels change (a pop)
- frames 3 → 4: 69% of the pixels change (a pop)
- frames 5 → 6: 66% of the pixels change (a pop)
- frames 6 → 7: 81% of the pixels change (a pop)

