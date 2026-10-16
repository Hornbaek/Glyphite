#!/usr/bin/env python3
"""tools/thumbnail.py --auto: the frame scoring picks what a person would. Synthetic frames, no browser.

  python3 tests/thumbnail_pick.py
"""
import importlib.util, sys
from pathlib import Path
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('thumbnail', Path(__file__).resolve().parents[1] / 'tools' / 'thumbnail.py')
src = spec.loader.get_data(spec.origin).decode().split('asyncio.run(main())')[0]   # the functions, without running the tool
ns = {'__name__': 'thumbnail', '__file__': spec.origin}
exec(compile(src, spec.origin, 'exec'), ns)
frame_stats, pick_best = ns['frame_stats'], ns['pick_best']
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


rng = np.random.default_rng(3)
def img(a): return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
H, W = 400, 640
black = np.zeros((H, W, 3))
dim = np.full((H, W, 3), 25.0)
flat = np.full((H, W, 3), 90.0)
# a busy, colourful frame: lit ground, coloured specks, a bright flash in the middle
busy = np.zeros((H, W, 3)); busy[250:] = [90, 70, 50]
for _ in range(400): y, x = rng.integers(0, H - 8), rng.integers(0, W - 8); busy[y:y + 6, x:x + 6] = rng.integers(40, 255, 3)
busy[150:260, 250:400] = [255, 230, 180]

frames = [img(black), img(dim), img(flat), img(busy)]
stats, prev = [], None
for f, parts in zip(frames, [0, 0, 5, 300]):
    st = frame_stats(f, prev, parts); prev = st['lum']; stats.append(st)
scores = pick_best(stats)
check('the busy, colourful, flashing frame wins', scores.index(max(scores)) == 3, scores)
check('an all-black frame scores lowest', scores.index(min(scores)) == 0, scores)
check('scores are ordered black < dim < flat < busy', scores[0] < scores[1] < scores[2] < scores[3], scores)

# frames that only differ in motion: the one that changed most since the last candidate wins
a = img(flat); b = img(flat); c = img(np.where(rng.random((H, W, 1)) > .5, 200.0, 60.0) * np.ones((1, 1, 3)))
st2, p2 = [], None
for f in (a, b, c):
    st = frame_stats(f, p2, 0); p2 = st['lum']; st2.append(st)
s2 = pick_best(st2)
check('a frame that changed a lot since the last one beats a still one', s2[2] > s2[1], s2)

# degenerate input must not blow up
check('one candidate: score is finite', all(np.isfinite(pick_best([stats[3]]))))
check('identical candidates: no division by zero', all(np.isfinite(pick_best([stats[2], stats[2]]))))
print('FAILED: ' + ', '.join(failures) if failures else 'thumbnail picking checks passed')
sys.exit(1 if failures else 0)
