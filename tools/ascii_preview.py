#!/usr/bin/env python3
"""ascii_preview.py - see how a sprite will look as Glyphite ASCII, in a second, without a browser.

  python3 tools/ascii_preview.py src/robot_sprite.js --scale 0.56 [--angle 0.3] [--font path.ttf]
  python3 tools/ascii_preview.py src/10a_lander_data.js --k 0.28 --res 1,2,3

--scale is world units per sprite pixel (k * RES; a character cell is 1 unit wide and 2 tall).
--k with --res previews several detail levels at once. Writes shots/<name>_ascii_<scale>.png (coloured
glyphs on the game background) and prints the glyph grid. This re-implements the in-game sprite
renderer (src/10a_lander_art.js) without scene lighting: use it to iterate on scale, palette and glyph
choices, then confirm in the game, which stays the source of truth.

Accepts the generic format written by tools/sprite2ascii.py (pal: [[r,g,b,ink,glyph]], rows: [...])
and the lander's LM_PAL / LM_ROWS.
"""
import argparse, math, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont

EDGE = ".,'`-_=:;|/\\()[]<>^v+~\"!*"
SX, SY, DENSE = 3, 6, 10
FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
         '/System/Library/Fonts/Menlo.ttc', 'C:/Windows/Fonts/consolab.ttf', 'C:/Windows/Fonts/consola.ttf']

ap = argparse.ArgumentParser()
ap.add_argument('sprite'); ap.add_argument('--scale', type=float); ap.add_argument('--k', type=float, default=.28)
ap.add_argument('--res', default='2'); ap.add_argument('--angle', type=float, default=0); ap.add_argument('--font')
ap.add_argument('--origin', help='origin pixel "x,y" (default: centre)')
a = ap.parse_args()

src = open(a.sprite).read()
p0 = src.index('pal:') if 'pal:' in src else src.index('LM_PAL')
p1 = src.index('rows:') if 'rows:' in src else src.index('LM_ROWS')
pal = [[float(v) for v in m.group(1).split(',')[:4]] + [m.group(2) or ''] for m in
       re.finditer(r"\[\s*(\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+)\s*(?:,\s*'(.)')?\s*\]", src[p0:p1])]
rows = re.findall(r"'([0-9a-z.]+)'", src[p1:])
H, W = len(rows), len(rows[0])
DIG = '0123456789abcdefghijklmnopqrstuvwxyz'
idx = np.full((H, W), -1)
for r, row in enumerate(rows):
    for c, ch in enumerate(row):
        if ch != '.': idx[r, c] = DIG.index(ch)
ink = np.array([p[3] for p in pal]); col = np.array([p[:3] for p in pal]) / 255.
lum = col @ [.3, .59, .11]
dense = [p[4] if p[4] else ('@' if l > .62 else '#') for p, l in zip(pal, lum)]
# interior outline counts as paint; outline on the silhouette is a gap
op = idx >= 0
paint = np.zeros_like(op)
for r in range(H):
    for c in range(W):
        if not op[r, c]: continue
        nb = all(0 <= r + dr < H and 0 <= c + dc < W and op[r + dr, c + dc] for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        paint[r, c] = ink[idx[r, c]] or nb
ox, oy = (map(float, a.origin.split(','))) if a.origin else (W / 2, H / 2)

font_path = a.font or next((f for f in FONTS if os.path.exists(f)), None)
def shapes():
    bw = 6; im = Image.new('L', (SX * bw, SY * bw)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(font_path, int(SY * bw * .8)) if font_path else ImageFont.load_default()
    out = []
    for ch in EDGE:
        d.rectangle([0, 0, SX * bw, SY * bw], fill=0); d.text((SX * bw / 2, SY * bw * .54), ch, fill=255, font=f, anchor='mm')
        m = np.array(im, float).reshape(SY, bw, SX, bw).mean((1, 3)) / 255.; mx = m.max()
        out.append((ch, (m / mx if mx > 0 else m).reshape(-1)))
    return out
SH = shapes()

def render(scale):
    """scale = world units per sprite pixel; returns rows of (glyph, rgb) per cell"""
    ca, sa = math.cos(a.angle), math.sin(a.angle)
    rad = math.hypot(W, H) * .6 * scale + 1
    x0, x1, y0, y1 = math.floor(-rad), math.ceil(rad), math.floor(-rad / 2), math.ceil(rad / 2)
    grid = []
    for cy in range(y0, y1 + 1):
        line = []
        for cx in range(x0, x1 + 1):
            V = np.zeros(SX * SY); occ = 0; acc = np.zeros(3); hist = {}
            for j in range(SY):
                for i in range(SX):
                    wx, wy = cx + (i + .5) / SX, (cy + (j + .5) / SY) * 2
                    lx, ly = wx * ca + wy * sa, -wx * sa + wy * ca
                    c, r = math.floor(lx / scale + ox), math.floor(ly / scale + oy)
                    if not (0 <= c < W and 0 <= r < H) or idx[r, c] < 0: continue
                    occ += 1
                    if not paint[r, c]: continue
                    p = idx[r, c]; V[j * SX + i] = 1; acc += col[p]; hist[p] = hist.get(p, 0) + 1
            n = int(V.sum())
            if occ < 4: line.append((' ', None)); continue
            if n < 3: line.append((' ', (0, 0, 0))); continue
            outline = sum(v for p, v in hist.items() if not ink[p])
            pnt = {p: v for p, v in hist.items() if ink[p]}
            if outline > n * .6:
                if n >= DENSE: line.append((' ', (0, 0, 0))); continue
                dom = max(hist, key=hist.get)
            else: dom = max(pnt, key=pnt.get)
            rgb = acc / n * .35 + col[dom] * .65
            g = dense[dom] if n >= DENSE else min(SH, key=lambda s: ((V - s[1]) ** 2).sum())[0]
            line.append((g, tuple(rgb)))
        grid.append(line)
    # trim empty border
    keep_r = [k for k, ln in enumerate(grid) if any(cell[1] is not None for cell in ln)]
    keep_c = [k for k in range(len(grid[0])) if any(ln[k][1] is not None for ln in grid)]
    return [[grid[r][c] for c in range(keep_c[0], keep_c[-1] + 1)] for r in range(keep_r[0], keep_r[-1] + 1)]

scales = [a.scale] if a.scale else [a.k * float(r) for r in a.res.split(',')]
os.makedirs('shots', exist_ok=True)
name = os.path.splitext(os.path.basename(a.sprite))[0]
for s in scales:
    g = render(s)
    print(f'--- scale {s:.3f} units/px: {len(g[0])} x {len(g)} cells')
    for ln in g: print(''.join(c for c, _ in ln))
    if font_path:
        cw, chh = 10, 20; f = ImageFont.truetype(font_path, 17)
        im = Image.new('RGB', (len(g[0]) * cw, len(g) * chh), (5, 7, 12)); d = ImageDraw.Draw(im)
        for r, ln in enumerate(g):
            for c, (ch, rgb) in enumerate(ln):
                if rgb is None or ch == ' ': continue
                d.text((c * cw + cw / 2, r * chh + chh * .54), ch, fill=tuple(int(min(1, v) * 255) for v in rgb), font=f, anchor='mm')
        out = f'shots/{name}_ascii_{s:.2f}.png'; im.save(out); print('wrote', out)
