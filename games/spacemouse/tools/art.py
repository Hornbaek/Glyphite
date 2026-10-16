#!/usr/bin/env python3
"""Space Mouse art from the art sheet (games/spacemouse/ref/art_sheet.png, the owner's reference):
cuts the mouse's six frames (idle, walk, run, jump, look up, look down), a cheese wedge and ten props out of the sheet, drops the dark
background (a flood fill from the edges), converts each with tools/sprite2ascii.py (the mouse with the curated palette in
tools/mouse_palette.json, one dense glyph per material), lines the frames up on the helmet, and writes
games/spacemouse/mouse_sprite.js. The cut frames are kept in ref/ as mouse_<frame>.png and cheese.png.

  python3 games/spacemouse/tools/art.py
"""
import json, re, subprocess, tempfile
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
SHEET = np.array(Image.open(GAME / 'ref/art_sheet.png').convert('RGB')).astype(int)
BG = np.array([9, 11, 15])            # the sheet's background
FRAMES = ['idle', 'walk', 'run', 'jump', 'lookup', 'lookdown']
# props: map tile → (name, sheet box x0, y0, x1, y1, height in base units, 'floor' or 'wall')
PROPS = {
  'k': ('lockers', 566, 820, 650, 904, 7, 'floor'),   'm': ('terminal', 641, 815, 696, 894, 5.5, 'floor'),
  'p': ('plant', 709, 838, 745, 899, 3.5, 'floor'),   'h': ('sofa', 753, 833, 851, 897, 3.4, 'floor'),
  'o': ('barrel', 646, 905, 690, 965, 4, 'floor'),    't': ('toolbox', 567, 910, 638, 960, 2.6, 'floor'),
  'g': ('wall screen', 698, 902, 761, 965, 4, 'wall'), 'f': ('fan box', 927, 832, 993, 908, 6, 'floor'),
  'b': ('B3 sign', 658, 757, 700, 808, 3.6, 'wall'),  'n': ('gas tank', 946, 756, 990, 824, 5, 'floor'),
}


def cut(x0, y0, x1, y1, tol=13):
    """RGBA of a sheet region, with the background flood-filled away from the edges"""
    a = SHEET[y0:y1, x0:x1]; h, w, _ = a.shape
    d = np.sqrt(((a - BG) ** 2).sum(2))
    bg = np.zeros((h, w), bool); q = deque()
    for x in range(w): q.extend([(0, x), (h - 1, x)])
    for y in range(h): q.extend([(y, 0), (y, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or bg[y, x] or d[y, x] > tol: continue
        bg[y, x] = True; q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = a; rgba[..., 3] = np.where(bg, 0, 255)
    im = Image.fromarray(rgba)
    return im.crop(im.getbbox())


def columns(x0, y0, x1, y1, gap=7):
    """the separate drawings in a row of the sheet, as column spans"""
    a = SHEET[y0:y1, x0:x1]; fg = np.sqrt(((a - BG) ** 2).sum(2)) > 13
    cols = fg.any(0); spans, x = [], 0
    while x < len(cols):
        if cols[x]:
            s = x
            while x < len(cols) and cols[x]: x += 1
            spans.append([s, x - 1])
        x += 1
    out = [spans[0]]
    for s in spans[1:]:
        if s[0] - out[-1][1] < gap: out[-1][1] = s[1]
        else: out.append(s)
    return [(x0 + a, x0 + b) for a, b in out]


def convert(png, name, grid, palette=None):
    """run sprite2ascii, return (w, h, pal, rows)"""
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ['python3', str(ROOT / 'tools/sprite2ascii.py'), str(png), '--name', name, '--out', tmp, '--grid', f'{grid[0]}x{grid[1]}']
        if palette: cmd += ['--palette', str(palette)]
        else: cmd += ['--colors', '7']
        subprocess.run(cmd, check=True, cwd=ROOT, capture_output=True)
        js = Path(tmp, f'{name}_sprite.js').read_text()
    w, h = int(re.search(r'w: (\d+)', js).group(1)), int(re.search(r'h: (\d+)', js).group(1))
    pal = [[int(r), int(g), int(b), int(i), gl] for r, g, b, i, gl in re.findall(r"\[(\d+), (\d+), (\d+), (\d), '(.)'\]", js)]
    rows = re.findall(r"'([0-9a-z.]+)'", js.split('rows:')[1])
    return w, h, pal, rows


def main():
    frames = {}
    spans = columns(20, 745, 545, 828)
    assert len(spans) == len(FRAMES), f'expected {len(FRAMES)} mouse frames on the sheet, found {len(spans)}'
    for name, (a, b) in zip(FRAMES, spans):
        im = cut(a - 3, 745, b + 4, 828)
        png = GAME / f'ref/mouse_{name}.png'; im.save(png)
        grid = (round(im.width / 2), round(im.height / 2))   # the sheet draws about 2 x 2 screen pixels per art pixel
        w, h, pal, rows = convert(png, f'mouse_{name}', grid, HERE / 'mouse_palette.json')
        # line the frames up on the helmet: the middle of what is drawn in the top 40% of the frame
        al = np.array(im)[..., 3] > 0
        top = al[: int(al.shape[0] * .4)]
        ox = round(float(np.nonzero(top)[1].mean()) / im.width * w)
        frames[name] = {'w': w, 'h': h, 'ox': ox, 'oy': h, 'rows': rows}
        mouse_pal = pal   # the same for every frame (the palette file's display colours already applied)
        print(f'{name}: {w} x {h}, origin {ox},{h}')
    cheese = cut(22, 900, 80, 972)
    cheese.save(GAME / 'ref/cheese.png')
    cw, ch, cpal, crows = convert(GAME / 'ref/cheese.png', 'cheese', (round(cheese.width / 2.4), round(cheese.height / 2.4)))
    for p in cpal:   # holes read as o, the lit top as @
        lum = .3 * p[0] + .59 * p[1] + .11 * p[2]
        p[4] = '@' if lum > 200 else 'o' if lum < 110 else '#'
    print(f'cheese: {cw} x {ch}')

    props = {}
    for tile, (name, x0, y0, x1, y1, height, place) in PROPS.items():
        im = cut(x0, y0, x1, y1)
        png = GAME / f"ref/prop_{name.replace(' ', '_')}.png"; im.save(png)
        w, h, pal, rows = convert(png, 'prop', (round(im.width / 2), round(im.height / 2)))
        props[tile] = {'name': name, 'w': w, 'h': h, 'k': round(height / h, 4), 'place': place, 'pal': pal, 'rows': rows}
        print(f'prop {tile} {name}: {w} x {h}')

    js = ['// ===================== GAME · mouse, cheese and prop sprites (generated) =====================',
          '// Made by tools/art.py from ref/art_sheet.png (the owner\'s art sheet): the frames are cut out, converted with',
          '// tools/sprite2ascii.py and tools/mouse_palette.json, and lined up on the helmet. Edit the palette or the tool, not this.',
          f'const MOUSE_PAL = {json.dumps(mouse_pal)};',
          'const MOUSE_FRAMES = {']
    for name, f in frames.items():
        js.append(f"  {name}: {{ w: {f['w']}, h: {f['h']}, ox: {f['ox']}, oy: {f['oy']}, rows: [")
        js += [f"    '{r}'," for r in f['rows']]
        js[-1] = js[-1].rstrip(',')
        js.append('  ] },')
    js[-1] = js[-1].rstrip(',')
    js.append('};')
    js.append(f'const SPRITE_CHEESE = {{ w: {cw}, h: {ch}, pal: {json.dumps(cpal)}, rows: [')
    js += [f"  '{r}'," for r in crows]
    js[-1] = js[-1].rstrip(',')
    js.append('] };')
    js.append('// props: decorations standing on the floor or hanging on the wall of a map tile (k: base units per pixel)')
    js.append('const PROP_ART = {')
    for tile, p in props.items():
        js.append(f"  {json.dumps(tile)}: {{ name: {json.dumps(p['name'])}, w: {p['w']}, h: {p['h']}, k: {p['k']}, place: '{p['place']}', pal: {json.dumps(p['pal'])}, rows: [")
        js += [f"    '{r}'," for r in p['rows']]
        js[-1] = js[-1].rstrip(',')
        js.append('  ] },')
    js[-1] = js[-1].rstrip(',')
    js.append('};')
    (GAME / 'mouse_sprite.js').write_text('\n'.join(js) + '\n')
    print('wrote', GAME / 'mouse_sprite.js')


if __name__ == '__main__':
    main()
