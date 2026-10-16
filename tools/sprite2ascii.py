#!/usr/bin/env python3
"""sprite2ascii.py - turn a pixel-art image into a palette-indexed sprite for a Glyphite game.

  python3 tools/sprite2ascii.py games/<id>/ref/robot.png --name robot --out games/<id>
                                [--grid 48x50] [--colors 12] [--palette pal.json] [--outline-lum 45]

Run it from the repo root. Writes
        <out>/<name>_sprite.js   const SPRITE_<NAME> = { w, h, pal: [[r,g,b,ink,glyph],...], rows: [...] }
                                 (add it to the game's game.json "parts" before the code that draws it,
                                 then defineSprite(SPRITE_<NAME>, { k, ox, oy }) and drawSprite: engine/API.md)
        shots/<name>_preview.png the resampled sprite, enlarged, for a quick visual check
and prints a character map with a column ruler (for locating parts and hull points).

Grid: by default the native pixel size is estimated from the median length of flat colour runs;
pass --grid WxH when the preview looks off. Each output pixel is the average of the central half
of its block, so the anti-aliased seams of AI-made pixel art are ignored.
Palette: k-means on the sprite's own pixels, then any pixel still far from every colour (a small
accent such as a window) gets a colour of its own. --palette pal.json ([[r,g,b], ...] or
[[r,g,b,ink,glyph], ...]) fixes the palette instead; an entry's optional 6th field [r,g,b] is the colour to draw
it in (matched against r,g,b, written as that: lifts a dark detail that would vanish in a dark scene). Colours darker than --outline-lum are outline
(ink 0): drawn as dark gaps rather than glyphs. glyph: the dense glyph for solid areas of that colour
('@' for light colours, '#' for the rest; change it in the output for textured materials, e.g. '%').
"""
import argparse, json, os
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('--name', required=True)
ap.add_argument('--grid'); ap.add_argument('--colors', type=int, default=12)
ap.add_argument('--palette'); ap.add_argument('--outline-lum', type=float, default=45)
ap.add_argument('--out', default='.'); ap.add_argument('--alpha', type=float, default=128)
a = ap.parse_args()

img = np.array(Image.open(a.src).convert('RGBA')).astype(float)
rgb, al = img[..., :3], img[..., 3]
ys, xs = np.nonzero(al > a.alpha)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

if a.grid:
    nx, ny = map(int, a.grid.lower().split('x'))
else:   # native pixel size: flat colour runs inside one block, plus the anti-aliased seam between blocks
    runs, gaps = [], []
    for y in range(y0, y1, max(1, (y1 - y0) // 60)):
        row, run, last_end = rgb[y, x0:x1], 1, None
        for i in range(1, len(row) + 1):
            if i < len(row) and np.abs(row[i] - row[i - 1]).sum() < 12: run += 1; continue
            if run >= 3:
                runs.append(run)
                if last_end is not None and i - run - last_end <= 4: gaps.append(i - run - last_end)
                last_end = i
            run = 1
    if runs:
        med = np.median(runs); one = [r for r in runs if r < 1.5 * med]   # runs spanning a single block
        px = float(np.median(one)) + (float(np.median(gaps)) if gaps else 0.0)
    else: px = 1.0
    nx, ny = max(1, round((x1 - x0) / px)), max(1, round((y1 - y0) / px))

# block-centre resampling
cols = np.zeros((ny, nx, 3)); opaque = np.zeros((ny, nx), bool)
for j in range(ny):
    for i in range(nx):
        xa, xb = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
        ya, yb = y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny
        blk = img[int(ya + (yb - ya) * .25):max(int(ya + (yb - ya) * .25) + 1, int(yb - (yb - ya) * .25)),
                  int(xa + (xb - xa) * .25):max(int(xa + (xb - xa) * .25) + 1, int(xb - (xb - xa) * .25))].reshape(-1, 4)
        w = blk[:, 3:4] / 255.
        opaque[j, i] = w.mean() >= a.alpha / 255.
        cols[j, i] = (blk[:, :3] * w).sum(0) / max(w.sum(), 1e-6)

X = cols[opaque]
if a.palette:
    raw = json.load(open(a.palette)); pal = np.array([p[:3] for p in raw], float)
else:   # k-means++, then give far-off pixels (small accents) their own colour
    rng = np.random.default_rng(7)
    def kmeans(C, it=50):
        for _ in range(it):
            lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
            C = np.array([X[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(len(C))])
        return C
    C = [X[rng.integers(len(X))]]
    for _ in range(min(a.colors, len(X)) - 1):
        d = ((X[:, None] - np.array(C)[None]) ** 2).sum(-1).min(1); C.append(X[rng.choice(len(X), p=d / d.sum())])
    pal = kmeans(np.array(C))
    for _ in range(8):
        d = np.sqrt(((X[:, None] - pal[None]) ** 2).sum(-1).min(1))
        if d.max() < 48 or len(pal) >= 20: break
        pal = kmeans(np.vstack([pal, X[np.argmax(d)]]))
    pal = pal[np.argsort(pal @ [.3, .59, .11])]
lum = pal @ [.3, .59, .11]
ink = (lum >= a.outline_lum).astype(int)
glyph = ['@' if l > 158 else '#' for l in lum]
if a.palette and len(raw[0]) >= 5: ink = [p[3] for p in raw]; glyph = [p[4] for p in raw]

DIG = '0123456789abcdefghijklmnopqrstuvwxyz'
idx = np.argmin(((cols[..., None, :] - pal[None, None]) ** 2).sum(-1), -1)
if a.palette: pal = np.array([p[5] if len(p) > 5 else p[:3] for p in raw], float)   # matched by the art's colour, drawn in this one
rows = [''.join(DIG[idx[j, i]] if opaque[j, i] else '.' for i in range(nx)) for j in range(ny)]

os.makedirs(a.out, exist_ok=True); os.makedirs('shots', exist_ok=True)
N = a.name.upper().replace('-', '_')
with open(f'{a.out}/{a.name}_sprite.js', 'w') as f:
    f.write(f'// generated by tools/sprite2ascii.py from {a.src}: {nx} x {ny} pixels, "." is empty, other characters index pal\n')
    f.write(f'const SPRITE_{N} = {{\n  w: {nx}, h: {ny},\n  pal: [\n')
    f.write(',\n'.join(f"    [{int(round(r))}, {int(round(g))}, {int(round(b))}, {int(ink[k])}, '{glyph[k]}']" for k, (r, g, b) in enumerate(pal)))
    f.write('\n  ],\n  rows: [\n' + ',\n'.join(f"    '{r}'" for r in rows) + '\n  ]\n};\n')
prev = np.zeros((ny, nx, 3), np.uint8) + np.array([30, 30, 40], np.uint8)
prev[opaque] = pal[idx[opaque]].astype(np.uint8)
s = max(1, 600 // max(nx, ny))
Image.fromarray(prev).resize((nx * s, ny * s), Image.NEAREST).save(f'shots/{a.name}_preview.png')

print(f'{a.name}: {nx} x {ny} pixels from box {x0},{y0}-{x1},{y1}; {len(pal)} colours; wrote {a.out}/{a.name}_sprite.js, shots/{a.name}_preview.png')
for k, (c, l) in enumerate(zip(pal, lum)): print(f'  {DIG[k]}  rgb{tuple(int(round(v)) for v in c)}  {"outline" if not ink[k] else "paint"}  {glyph[k]}')
print('    ' + ''.join(str(i // 10) for i in range(nx))); print('    ' + ''.join(str(i % 10) for i in range(nx)))
for j, r in enumerate(rows): print(f'{j:3d} {r}')
