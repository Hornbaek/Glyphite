# Bake-off: pip-walk

Pip walks: 8 frames at 10 fps, looping, drawn from pip/001. Made with `node tools/art/bakeoff.mjs spacewhiskers pip-walk`; the numbers come from tools/art/animcheck.mjs.

| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pixellab-skeleton | pixellab animate-with-skeleton-v3 | 1 | 8/8 | 1 | 0 | 1.0 | 45% | 60% | 0.08 | 0.0% | 1 |
| sheet-keys | the approved keys | 0 | 4/8 | 0 | 0 | 0.4 | 100% | 100% | 0.26 | 0.0% | 14 |
| toon-inbetween | fofr/tooncrafter | 1 | 8/8 | 0 | 0 | 0.4 | 42% | 17% | 0.29 | 0.0% | 8 |
| wan-segments | wan-video/wan-2.7-i2v | 4 | 8/8 | 1 | 0 | 0.5 | 51% | 63% | 0.28 | 0.0% | 7 |

compare.png: the guides, then pixellab-skeleton, then sheet-keys, then toon-inbetween, then wan-segments (at 4x, then at game size on the right).

Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame's colours are from the base's (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.

## pixellab-skeleton

pixellab pixellab animate-with-skeleton-v3, 1 call(s).

- the loop's seam (last → first) changes 60% of the pixels

## sheet-keys

the approved keys, 0 call(s).

- frame 1: empty
- frame 2: its colours drift from the anchor's (0.32)
- frame 3: empty
- frame 4: its colours drift from the anchor's (0.27)
- frame 5: empty
- frame 7: empty
- frames 0 → 1: 100% of the pixels change (a pop)
- frames 1 → 2: 100% of the pixels change (a pop)
- frames 2 → 3: 100% of the pixels change (a pop)
- frames 3 → 4: 100% of the pixels change (a pop)
- frames 4 → 5: 100% of the pixels change (a pop)
- frames 5 → 6: 100% of the pixels change (a pop)
- frames 6 → 7: 100% of the pixels change (a pop)
- the loop's seam (last → first) changes 100% of the pixels

## toon-inbetween

replicate fofr/tooncrafter, 1 call(s).

- frame 1: its colours drift from the anchor's (0.32)
- frame 2: its colours drift from the anchor's (0.32)
- frame 3: its colours drift from the anchor's (0.32)
- frame 4: its colours drift from the anchor's (0.27)
- frame 5: its colours drift from the anchor's (0.36)
- frame 7: its colours drift from the anchor's (0.29)
- frames 5 → 6: 61% of the pixels change (a pop)
- frames 6 → 7: 70% of the pixels change (a pop)

## wan-segments

replicate wan-video/wan-2.7-i2v, 4 call(s).

- frame 1: its colours drift from the anchor's (0.33)
- frame 2: its colours drift from the anchor's (0.32)
- frame 4: its colours drift from the anchor's (0.27)
- frame 5: its colours drift from the anchor's (0.34)
- frame 7: its colours drift from the anchor's (0.33)
- frames 5 → 6: 60% of the pixels change (a pop)
- the loop's seam (last → first) changes 63% of the pixels

