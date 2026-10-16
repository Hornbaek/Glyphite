#!/usr/bin/env python3
"""Check an art sheet from ChatGPT or Gemini before cutting it (the glyphite-art-prompt skill, step 5).

  python3 tools/sheetcheck.py games/<id>/ref/sheet.png shots/sheet

It finds the background (the median of the border), splits the sheet into pieces, tells label text (white letters with a
dark rim, short pieces) from drawings, and reports what makes cutting harder:
  - the background: its colour and how flat it is (JPEG noise);
  - the cut tolerance: how close the outline and the drawings' own colours come to the background (colours measured
    inside each drawing, its anti-aliased rim left out), so a flood fill with that tolerance stops at the outlines;
  - labels within 2 px of a drawing (a wide fill could join them; else blank them by hand), and drawings with a lot of
    white (white art, or a label merged into them);
  - drawings that are mostly near-black (anything darker than luminance 45 converts as outline).
It writes <out>_boxes.png (every drawing boxed and numbered, labels boxed in blue) and <out>_drawings.json (id, box,
size, dark, white) to read the boxes for tools/art.py from. Counting what is there against the prompt's list (frames per
animation, facings, missing and extra items) is still done by eye on the boxes image.
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw

if len(sys.argv) != 3: sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int); H, W = a.shape[:2]
border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
bg = np.median(border, 0)
spread = np.sqrt(((border - bg) ** 2).sum(1)); noise = float(np.percentile(spread, 95))
# what counts as drawing: clearly above the background's own noise (a dark outline on a near-black sheet is close to it)
D = np.sqrt(((a - bg) ** 2).sum(2)); fg = D > max(12, 3 * noise)
white = (a.min(2) > 185) & (a.max(2) - a.min(2) < 40)
lum = .3 * a[..., 0] + .59 * a[..., 1] + .11 * a[..., 2]

# pieces: 8-connected regions of non-background
lab = np.zeros((H, W), np.int32); pieces = []
for y0, x0 in zip(*np.nonzero(fg)):
    if lab[y0, x0]: continue
    n = len(pieces) + 1; lab[y0, x0] = n; q = deque([(y0, x0)]); ys, xs = [], []
    while q:
        y, x = q.popleft(); ys.append(y); xs.append(x)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and fg[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
    ys, xs = np.array(ys), np.array(xs)
    pieces.append(dict(id=n, size=len(ys), box=[int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
                       white=float(white[ys, xs].mean()), dark=float((lum[ys, xs] < 45).mean())))
big = [p for p in pieces if p['size'] >= 40]
is_text = lambda p: p['white'] > .18 and p['box'][3] - p['box'][1] <= 45
labels = [p for p in big if is_text(p)]; drawings = [p for p in big if not is_text(p) and p['size'] > 300]
dids = {p['id'] for p in drawings}

print(f'{src}: {W} x {H}, {Image.open(src).format}')
print(f'  background {bg.astype(int).tolist()}, noise p95 {noise:.0f} (0 = perfectly flat; JPEG ~10)')
print(f'  {len(drawings)} drawings, {len(labels)} label pieces')

# the cut tolerance: the closest colour to the background inside each drawing (2 px in from its edge)
def interior(m):
    m = m.copy()
    for _ in range(2): m[1:-1, 1:-1] &= m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:]
    return m
worst = []
for p in drawings:
    x0, y0, x1, y1 = p['box']; m = interior(lab[y0:y1, x0:x1] == p['id']); d = D[y0:y1, x0:x1][m]
    if d.size > 50: worst.append((float(np.percentile(d, .5)), p['id'], p['box']))
worst.sort()
# the outline matters most: if it is close to the background (a dark outline on a near-black sheet), a wide fill leaks
# through it into the drawing. Measure the near-black pixels of every drawing together.
dark_all = D[(lum < 45) & fg & np.isin(lab, list(dids))]
outline = float(np.percentile(dark_all, 5)) if dark_all.size > 200 else 1e9
if worst:
    closest = min(worst[0][0], outline)
    tol = max(6, int(closest * .6))
    why = (f'the outline is only {outline:.0f} from the background' if outline <= worst[0][0] else
           f'the closest drawing colour is {worst[0][0]:.0f} from the background, in drawing {worst[0][1]} at {worst[0][2]}')
    print(f'  cut tolerance: up to {tol} ({why})')
    for d, i, b in worst[1:3]: print(f'    next closest colour: {d:.0f} in drawing {i} at {b}')

# labels touching a drawing: a drawing pixel within 2 px of the label's pixels
for t in labels:
    x0, y0, x1, y1 = t['box']; X0, Y0, X1, Y1 = max(0, x0 - 2), max(0, y0 - 2), min(W, x1 + 2), min(H, y1 + 2)
    m = lab[Y0:Y1, X0:X1] == t['id']; g = m.copy()
    for _ in range(2):
        g[1:, :] |= g[:-1, :]; g[:-1, :] |= g[1:, :]; g[:, 1:] |= g[:, :-1]; g[:, :-1] |= g[:, 1:]
    near = set(np.unique(lab[Y0:Y1, X0:X1][g])) & dids
    if near: print(f'  label at {t["box"]} within 2 px of drawing(s) {sorted(int(i) for i in near)}: keep the cut tolerance low, or blank it (drop)')
for p in drawings:
    if p['white'] > .18: print(f'  drawing {p["id"]} at {p["box"]} is {p["white"]:.0%} white: white art (snow, wool), or a label merged into it')
    if p['dark'] > .5: print(f'  drawing {p["id"]} at {p["box"]} is {p["dark"]:.0%} near-black: it converts as outline (lower --outline-lum for it, or ask again)')

shot = im.copy(); d = ImageDraw.Draw(shot)
for p in drawings: d.rectangle(p['box'], outline=(0, 255, 0)); d.text((p['box'][0] + 2, p['box'][1] + 1), str(p['id']), fill=(255, 255, 0))
for t in labels: d.rectangle(t['box'], outline=(0, 200, 255))
shot.save(out + '_boxes.png')
json.dump(drawings, open(out + '_drawings.json', 'w'), indent=0)
print(f'  wrote {out}_boxes.png and {out}_drawings.json')
