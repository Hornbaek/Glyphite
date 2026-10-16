#!/usr/bin/env python3
"""Space Mouse art from the owner's art sheets (games/spacemouse/ref/):
  art_sheet.png            the mouse's six moves (idle, walk, run, jump, look up, look down), a cheese wedge, ten props
  mouse_actions_sheet.jpg  more moves: wall slide, falling, landing, eating, zapped, victory
  catbot_sheet.png         the cat-bot: patrol walk, alert, chase run, shorted out
  objects_sheet.jpg        the checkpoint (off, on), the great cheese, a ceiling lamp (off, on), the alarm beacon, hatches
Each drawing is cut out of its sheet: the flat background is flood-filled away from the edges of its box, and stray bits
(labels, sweat drops, motion lines) are dropped. Each is converted with tools/sprite2ascii.py and written to
games/spacemouse/sprites.js. The mouse's frames share one palette (tools/mouse_palette.json, and
tools/mouse_palette_actions.json for the second sheet: the same materials matched against that sheet's colours and drawn
in the first sheet's, so the suit does not change colour between frames). The cat-bot's frames share a palette made from
all of them. The cut pictures are kept in ref/cut/.

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
CUT = GAME / 'ref/cut'
SHEETS = {   # name: (file, background colour)
    'a': ('art_sheet.png', (9, 11, 15)), 'act': ('mouse_actions_sheet.jpg', (12, 15, 20)),
    'cat': ('catbot_sheet.png', (6, 8, 14)), 'obj': ('objects_sheet.jpg', (12, 15, 20)),
}
SHEETS = {k: (np.array(Image.open(GAME / 'ref' / f).convert('RGB')).astype(int), np.array(bg)) for k, (f, bg) in SHEETS.items()}

FRAMES = ['idle', 'walk', 'run', 'jump', 'lookup', 'lookdown']   # the first sheet's mouse row, left to right
# the second sheet's moves: name → box. Its mouse is drawn larger: SCALE_ACT brings it to the first sheet's art pixels.
SCALE_ACT = .22
ACTIONS = {
    'wall1': (30, 105, 160, 286), 'wall2': (420, 105, 532, 286),
    'fall1': (640, 118, 766, 238), 'fall2': (786, 138, 916, 250), 'fall3': (938, 164, 1072, 272), 'fall4': (1090, 176, 1216, 285),
    'land1': (440, 403, 565, 551), 'land2': (640, 403, 765, 551),
    'eat1': (12, 650, 180, 799), 'eat2': (222, 650, 372, 799), 'zap1': (505, 638, 690, 799), 'zap2': (695, 638, 850, 799),
    'win': (1050, 628, 1190, 799),
}
WALL_PANEL = [(45, 48, 58), (52, 54, 67), (40, 47, 55), (58, 58, 68), (30, 34, 44), (65, 69, 80), (22, 25, 34)]   # behind the wall slides
GLASS = (46, 62, 78)   # the helmet glass on the second sheet
CAT = {
    'walk1': (200, 62, 440, 230), 'walk2': (500, 62, 735, 230), 'walk3': (790, 62, 1040, 232), 'walk4': (1092, 60, 1348, 230),
    'alert1': (495, 292, 698, 470), 'alert2': (806, 292, 1000, 470),
    'run1': (110, 535, 382, 686), 'run2': (444, 535, 714, 676), 'run3': (782, 535, 1060, 688), 'run4': (1138, 540, 1407, 686),
    'down1': (470, 736, 703, 924), 'down2': (766, 760, 1046, 926),
}
CAT_PX = 4   # sheet pixels per art pixel on the cat sheet
# objects: name → (box, height in base units (None: the game sizes it), cut tolerance)
OBJ_PX = 4.5
OBJECTS = {
    'check_off': ((60, 30, 200, 320), 8, 24), 'check_on': ((240, 22, 410, 320), 8, 40),
    'goal': ((495, 36, 770, 330), None, 24),
    'lamp_off': ((36, 412, 290, 476), 1.6, 24), 'lamp_on': ((328, 400, 592, 474), 1.8, 40),
    'alarm1': ((730, 388, 862, 546), 3.2, 24), 'alarm2': ((1025, 388, 1156, 546), 3.2, 24),
}
# props: map tile → (name, sheet, box, height in base units, 'floor' or 'wall')
PROPS = {
    'k': ('lockers', 'a', (566, 820, 650, 904), 7, 'floor'),   'm': ('terminal', 'a', (641, 815, 696, 894), 5.5, 'floor'),
    'p': ('plant', 'a', (709, 838, 745, 899), 3.5, 'floor'),   'h': ('sofa', 'a', (753, 833, 851, 897), 3.4, 'floor'),
    'o': ('barrel', 'a', (646, 905, 690, 965), 4, 'floor'),    't': ('toolbox', 'a', (567, 910, 638, 960), 2.6, 'floor'),
    'g': ('wall screen', 'a', (698, 902, 761, 965), 4, 'wall'), 'f': ('fan box', 'a', (927, 832, 993, 908), 6, 'floor'),
    'b': ('B3 sign', 'a', (658, 757, 700, 808), 3.6, 'wall'),  'n': ('gas tank', 'a', (946, 756, 990, 824), 5, 'floor'),
    'd': ('hatch', 'obj', (40, 610, 244, 816), 9, 'floor'),    'e': ('open hatch', 'obj', (546, 610, 750, 816), 9, 'floor'),
}


def flood(free, h, w):
    """the cells of `free` reached from the edges"""
    seen = np.zeros((h, w), bool); q = deque()
    for x in range(w): q.extend([(0, x), (h - 1, x)])
    for y in range(h): q.extend([(y, 0), (y, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not free[y, x]: continue
        seen[y, x] = True; q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    return seen


def cut(sheet, box, tol=13, also=(), minfrac=None, fill=None):
    """RGBA of a sheet region with its background flood-filled away from the edges (and any colours in `also`, such as a
    wall drawn behind the mouse). minfrac: keep only the pieces at least that fraction of the biggest (drops labels and
    sweat drops). fill (top, rgb): fill what the outline encloses in the top part of the drawing with rgb (the helmet glass,
    which shows the wall behind it)"""
    a, bg = SHEETS[sheet]; x0, y0, x1, y1 = box
    a = a[y0:y1, x0:x1].copy(); h, w, _ = a.shape
    free = np.sqrt(((a - bg) ** 2).sum(2)) <= tol
    for c in also: free |= np.sqrt(((a - np.array(c)) ** 2).sum(2)) <= 16
    keep = ~flood(free, h, w)
    if minfrac:
        lab = np.zeros((h, w), int); sizes = {}
        for sy, sx in zip(*np.nonzero(keep)):
            if lab[sy, sx]: continue
            n = len(sizes) + 1; lab[sy, sx] = n; q = deque([(sy, sx)]); cnt = 0
            while q:
                y, x = q.popleft(); cnt += 1
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and keep[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
            sizes[n] = cnt
        big = max(sizes.values())
        keep = np.isin(lab, [n for n, s in sizes.items() if s >= big * minfrac])
    if fill:
        top, rgb = fill; closed = keep.copy()
        for _ in range(4): closed = closed | np.roll(closed, 1, 0) | np.roll(closed, -1, 0) | np.roll(closed, 1, 1) | np.roll(closed, -1, 1)
        for _ in range(4): closed = closed & np.roll(closed, 1, 0) & np.roll(closed, -1, 0) & np.roll(closed, 1, 1) & np.roll(closed, -1, 1)
        ys = np.nonzero(keep)[0]
        hole = ~flood(~closed, h, w) & ~keep & (np.arange(h)[:, None] < ys.min() + (ys.max() - ys.min()) * top)
        a[hole] = rgb; keep |= hole
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = a; rgba[..., 3] = np.where(keep, 255, 0)
    im = Image.fromarray(rgba)
    return im.crop(im.getbbox())


def columns(x0, y0, x1, y1, gap=7):
    """the separate drawings in a row of the first sheet, as column spans"""
    a, bg = SHEETS['a']
    fg = np.sqrt(((a[y0:y1, x0:x1] - bg) ** 2).sum(2)) > 13
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


def save(im, name):
    CUT.mkdir(parents=True, exist_ok=True)
    p = CUT / f'{name}.png'; im.save(p)
    return p


def convert(png, grid, palette=None, colors=7):
    """run sprite2ascii, return (w, h, pal, rows)"""
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ['python3', str(ROOT / 'tools/sprite2ascii.py'), str(png), '--name', 'cut', '--out', tmp, '--grid', f'{grid[0]}x{grid[1]}']
        cmd += ['--palette', str(palette)] if palette else ['--colors', str(colors)]
        subprocess.run(cmd, check=True, cwd=ROOT, capture_output=True)
        js = Path(tmp, 'cut_sprite.js').read_text()
    w, h = int(re.search(r'w: (\d+)', js).group(1)), int(re.search(r'h: (\d+)', js).group(1))
    pal = [[int(r), int(g), int(b), int(i), gl] for r, g, b, i, gl in re.findall(r"\[(\d+), (\d+), (\d+), (\d), '(.)'\]", js)]
    rows = re.findall(r"'([0-9a-z.]+)'", js.split('rows:')[1])
    return w, h, pal, rows


def grid_of(im, per):
    return max(1, round(im.width / per)), max(1, round(im.height / per))


def helmet_x(im, w):
    """the middle of what is drawn in the top 40% of a mouse frame, in sprite pixels: the frames line up on the helmet"""
    al = np.array(im)[..., 3] > 0
    return round(float(np.nonzero(al[: int(al.shape[0] * .4)])[1].mean()) / im.width * w)


def shared_palette(ims, per, n):
    """one palette for several drawings (a character's frames): k-means over all of them at the sprite's resolution"""
    gap = int(8 * per); W = sum(int(np.ceil(im.width / per)) * int(per) + gap for im in ims); H = max(im.height for im in ims)
    sheet = Image.new('RGBA', (W, H)); x = 0
    for im in ims: sheet.paste(im, (x, H - im.height)); x += int(np.ceil(im.width / per)) * int(per) + gap
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp, 'all.png'); sheet.save(p)
        _, _, pal, _ = convert(p, grid_of(sheet, per), colors=n)
    for e in pal:   # only near-black is outline (dark metal is still metal); eyes and highlights '@', orange trim '%', metal '#'
        r, g, b = e[:3]; lum = .3 * r + .59 * g + .11 * b
        e[3] = int(lum >= 25)
        e[4] = '@' if (r > 60 and r > 2 * g) or lum > 200 else '%' if r > 150 and b < 90 else '#'
    return pal


def red_spot(rows, pal, w, h):
    """where a cat-bot frame's eyes are: the red pixels in its front (right) half, in sprite pixels"""
    red = {i for i, (r, g, b, *_) in enumerate(pal) if r > 150 and g < 100 and b < 100}
    pts = [(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch != '.' and int(ch, 36) in red and x > w * .55 and y < h * .7]
    return [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)] if pts else None


def js_rows(rows, ind='    '):
    return [f"{ind}'{r}'," for r in rows[:-1]] + [f"{ind}'{rows[-1]}'"]


def main():
    out = ['// ===================== GAME · sprites cut from the art sheets (generated) =====================',
           '// Made by tools/art.py from the owner\'s art sheets in ref/: cut out, converted with tools/sprite2ascii.py. Edit the',
           '// palettes or the tool and rerun it, not this file.']

    # ---- the mouse: six moves from the first sheet, thirteen from the second, one palette
    frames = {}
    spans = columns(20, 745, 545, 828)
    assert len(spans) == len(FRAMES), f'expected {len(FRAMES)} mouse frames on the sheet, found {len(spans)}'
    for name, (a, b) in zip(FRAMES, spans):
        im = cut('a', (a - 3, 745, b + 4, 828))
        w, h, pal_a, rows = convert(save(im, f'mouse_{name}'), grid_of(im, 2), HERE / 'mouse_palette.json')
        frames[name] = {'w': w, 'h': h, 'ox': helmet_x(im, w), 'oy': h, 'rows': rows}
    for name, box in ACTIONS.items():
        wall = name.startswith('wall')
        im = cut('act', box, tol=24, also=WALL_PANEL if wall else (), minfrac=.12, fill=(.5, GLASS) if wall else None)
        w, h, pal_b, rows = convert(save(im, f'mouse_{name}'), grid_of(im, 1 / SCALE_ACT), HERE / 'mouse_palette_actions.json')
        frames[name] = {'w': w, 'h': h, 'ox': helmet_x(im, w), 'oy': h, 'rows': rows}
    assert pal_b[:len(pal_a)] == pal_a, 'mouse_palette_actions.json must start with the same materials, drawn the same, as mouse_palette.json'
    out.append(f'const MOUSE_PAL = {json.dumps(pal_b)};')
    out.append('const MOUSE_FRAMES = {')
    for name, f in frames.items():
        out.append(f"  {name}: {{ w: {f['w']}, h: {f['h']}, ox: {f['ox']}, oy: {f['oy']}, rows: [")
        out += js_rows(f['rows']) + ['  ] },']
        print(f"mouse {name}: {f['w']} x {f['h']}")
    out[-1] = '  ] }'; out.append('};')

    # ---- a crumb of cheese (first sheet): holes read as o, the lit top as @
    im = cut('a', (22, 900, 80, 972))
    w, h, pal, rows = convert(save(im, 'cheese'), grid_of(im, 2.4))
    for p in pal:
        lum = .3 * p[0] + .59 * p[1] + .11 * p[2]
        p[4] = '@' if lum > 200 else 'o' if lum < 110 else '#'
    out.append(f'const SPRITE_CHEESE = {{ w: {w}, h: {h}, pal: {json.dumps(pal)}, rows: [')
    out += js_rows(rows, '  ') + ['] };']

    # ---- the cat-bot: twelve frames, one palette; the origin under the legs, and where its eyes are
    ims = {name: cut('cat', box, tol=9, minfrac=.01) for name, box in CAT.items()}
    cat_pal = shared_palette(list(ims.values()), CAT_PX, 12)
    with tempfile.TemporaryDirectory() as tmp:
        pp = Path(tmp, 'cat_palette.json'); pp.write_text(json.dumps(cat_pal))
        out.append(f'const CAT_PAL = {json.dumps(cat_pal)};')
        out.append('const CAT_FRAMES = {')
        for name, im in ims.items():
            w, h, _, rows = convert(save(im, f'cat_{name}'), grid_of(im, CAT_PX), pp)
            legs = np.array(im)[int(im.height * .65):, :, 3] > 0
            ox = round(float(np.nonzero(legs)[1].mean()) / im.width * w)
            out.append(f"  {name}: {{ w: {w}, h: {h}, ox: {ox}, oy: {h}, eye: {json.dumps(red_spot(rows, cat_pal, w, h))}, rows: [")
            out += js_rows(rows) + ['  ] },']
            print(f'cat {name}: {w} x {h}')
        out[-1] = '  ] }'; out.append('};')

    # ---- objects: checkpoint, the great cheese, lamps, the alarm beacon (k: base units per pixel; null: the game sizes it)
    out.append('const OBJ_ART = {')
    for name, (box, size, tol) in OBJECTS.items():
        im = cut('obj', box, tol=tol, minfrac=.05)
        w, h, pal, rows = convert(save(im, name), grid_of(im, OBJ_PX), colors=10)
        out.append(f"  {name}: {{ w: {w}, h: {h}, k: {json.dumps(round(size / h, 4) if size else None)}, pal: {json.dumps(pal)}, rows: [")
        out += js_rows(rows) + ['  ] },']
        print(f'object {name}: {w} x {h}')
    out[-1] = '  ] }'; out.append('};')

    # ---- props: decorations standing on the floor or hanging on the wall of a map tile
    out.append('// props: decorations standing on the floor or hanging on the wall of a map tile (k: base units per pixel)')
    out.append('const PROP_ART = {')
    for tile, (name, sheet, box, height, place) in PROPS.items():
        im = cut(sheet, box, tol=13 if sheet == 'a' else 24, minfrac=None if sheet == 'a' else .05)
        w, h, pal, rows = convert(save(im, f"prop_{name.replace(' ', '_')}"), grid_of(im, 2 if sheet == 'a' else OBJ_PX))
        out.append(f"  {json.dumps(tile)}: {{ name: {json.dumps(name)}, w: {w}, h: {h}, k: {round(height / h, 4)}, place: '{place}', pal: {json.dumps(pal)}, rows: [")
        out += js_rows(rows) + ['  ] },']
        print(f'prop {tile} {name}: {w} x {h}')
    out[-1] = '  ] }'; out.append('};')

    (GAME / 'sprites.js').write_text('\n'.join(out) + '\n')
    print('wrote', GAME / 'sprites.js')


if __name__ == '__main__':
    main()
