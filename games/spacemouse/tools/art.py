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
all of them.
Reference art (the owner's rule): every drawing on every sheet is saved at its original pixels in ref/frames/, the ones the
game does not use (yet) too (REFERENCE), and listed in ref/ref.json (which sheet, where on it, what it is used for) and
ref/README.md. The site's ART page for the game shows them.

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
FRAMES_DIR = GAME / 'ref/frames'
SHEETS = {   # name: (file, background colour)
    'a': ('art_sheet.png', (9, 11, 15)), 'act': ('mouse_actions_sheet.jpg', (12, 15, 20)),
    'cat': ('catbot_sheet.png', (6, 8, 14)), 'obj': ('objects_sheet.jpg', (12, 15, 20)),
}
SHEET_FILES = {k: f for k, (f, _) in SHEETS.items()}
SHEETS = {k: (np.array(Image.open(GAME / 'ref' / f).convert('RGB')).astype(int), np.array(bg)) for k, (f, bg) in SHEETS.items()}
SHEET_INFO = {   # for ref.json: what each sheet is and where it came from
    'a': ('The first sheet: station layouts, the mouse, cheese, props, tiles and decoration', 'ChatGPT'),
    'act': ("More of Pip's moves: wall slide, falling, landing, eating, zapped, victory", 'Gemini'),
    'cat': ('The cat-bot: patrol walk, alert, chase run, shorted out', 'ChatGPT'),
    'obj': ('Objects: checkpoint, the great cheese, lamps, alarm beacon, hatches, ladder, lift', 'Gemini'),
}

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
# what each drawing the game uses is for (ref.json)
USE = {
    'idle': 'Pip standing', 'walk': 'Pip walking (with run)', 'run': 'Pip walking (with walk)', 'jump': 'Pip in the air',
    'lookup': 'Pip looking up, standing still', 'lookdown': 'Pip looking down (holding Down)',
    'wall1': 'Pip sliding down a wall', 'wall2': 'Pip sliding down a wall', 'fall1': 'Pip tumbling on a long fall',
    'fall2': 'Pip tumbling on a long fall', 'fall3': 'Pip tumbling on a long fall', 'fall4': 'Pip tumbling on a long fall',
    'land1': 'Pip after a hard landing (squash)', 'land2': 'Pip after a hard landing (getting up)', 'eat1': 'Pip chewing',
    'eat2': 'Pip chewing', 'zap1': 'Pip zapped by a cable', 'zap2': 'Pip zapped: the skeleton flash', 'win': 'Pip clearing a sector',
    'walk1': 'cat-bot on patrol', 'walk2': 'cat-bot on patrol', 'walk3': 'cat-bot on patrol', 'walk4': 'cat-bot on patrol',
    'alert1': 'cat-bot spotting the mouse', 'alert2': 'cat-bot spotting the mouse', 'run1': 'cat-bot chasing', 'run2': 'cat-bot chasing',
    'run3': 'cat-bot chasing', 'run4': 'cat-bot chasing', 'down1': 'shorted cat-bot, sparking', 'down2': 'shorted cat-bot, the wreck',
    'check_off': 'checkpoint, not reached yet', 'check_on': 'checkpoint, reached', 'goal': 'the great cheese (the goal)',
    'lamp_off': 'ceiling lamp, off', 'lamp_on': 'ceiling lamp, on', 'alarm1': 'alarm beacon, turning', 'alarm2': 'alarm beacon, turning',
}
# drawings on the sheets the game does not use (yet), cut and kept as reference art: (sheet, name, box, note[, cut options])
LATER = 'not used yet'
REFERENCE = [
    ('a', 'station_A', (0, 8, 1510, 408), "the station's look: layout A", {'minfrac': .002}),
    ('a', 'station_B', (10, 425, 762, 703), "the station's look: layout B", {'minfrac': .002, 'drop': [(15, 429, 178, 478)]}),
    ('a', 'station_C', (778, 425, 1530, 703), "the station's look: layout C", {'minfrac': .002, 'drop': [(786, 429, 940, 478)]}),
    ('a', 'cheese_2', (88, 913, 145, 965), LATER), ('a', 'cheese_3', (152, 907, 202, 969), LATER), ('a', 'crumb', (204, 943, 233, 969), LATER),
    ('a', 'cheese_pickup', (272, 905, 344, 978), LATER), ('a', 'crate', (364, 905, 435, 971), LATER),
    ('a', 'door_with_red_light', (447, 889, 523, 982), LATER), ('a', 'wall_cabinet', (566, 754, 651, 822), LATER),
    ('a', 'B3_sign_grey', (707, 757, 755, 811), LATER), ('a', 'B3_warning_sign', (757, 753, 826, 831), LATER),
    ('a', 'broken_machine', (827, 761, 938, 822), LATER), ('a', 'vent_panel_and_claw', (856, 824, 990, 980), LATER),
    ('a', 'little_robot', (767, 904, 857, 967), LATER),
    ('a', 'platform_long', (1024, 761, 1152, 808), LATER), ('a', 'platforms_short', (1025, 821, 1152, 866), LATER),
    ('a', 'post', (1157, 761, 1191, 878), LATER), ('a', 'ladder_tall', (1193, 758, 1233, 889), 'not used yet: needs climbing'),
    ('a', 'wall_corner', (1029, 882, 1124, 982), LATER), ('a', 'block', (1029, 936, 1081, 981), LATER),
    ('a', 'lift_door', (1141, 876, 1188, 977), LATER), ('a', 'ladder_short', (1194, 886, 1241, 991), 'not used yet: needs climbing'),
    ('a', 'monitor', (1288, 751, 1355, 814), LATER), ('a', 'cobweb', (1360, 752, 1413, 813), 'drawn by decor.js instead (cobwebs)'),
    ('a', 'moss_and_red_cable', (1417, 751, 1511, 845), 'drawn by decor.js instead (moss strands, cable loops)'),
    ('a', 'vent_box', (1287, 819, 1359, 864), LATER), ('a', 'hanging_lamp', (1362, 818, 1428, 928), LATER),
    ('a', 'fan_unit', (1287, 871, 1362, 964), LATER), ('a', 'broken_panel', (1430, 845, 1516, 907), LATER),
    ('a', 'rubble', (1365, 941, 1408, 977), LATER), ('a', 'window', (1428, 914, 1515, 980), 'the windows are drawn from the map (:)'),
    ('act', 'mouse_wall_slide_middle', (250, 105, 345, 286), LATER + ' (the two others are)', {'also': 'wall', 'fill': True}),
    ('act', 'mouse_landing_in_the_air', (218, 403, 354, 551), LATER), ('act', 'mouse_landing_standing', (860, 403, 995, 551), LATER),
    ('obj', 'lamp_off_2', (944, 64, 1202, 122), 'not used: the same lamp drawn again'),
    ('obj', 'lamp_on_2', (942, 180, 1202, 290), 'not used: the same lamp drawn again', {'tol': 40}),
    ('obj', 'hatch_half_open', (291, 613, 494, 816), 'not used yet: a door that opens needs a switch or a key'),
    ('obj', 'ladder', (853, 613, 929, 824), 'not used yet: needs climbing'),
    ('obj', 'lift', (990, 606, 1206, 822), 'not used yet: needs moving platforms'),
]


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


def cut(sheet, box, tol=13, also=(), minfrac=None, fill=None, drop=()):
    """RGBA of a sheet region with its background flood-filled away from the edges (and any colours in `also`, such as a
    wall drawn behind the mouse). minfrac: keep only the pieces at least that fraction of the biggest (drops labels and
    sweat drops). fill (top, rgb): fill what the outline encloses in the top part of the drawing with rgb (the helmet glass,
    which shows the wall behind it). drop: sheet rectangles to treat as background (a label inside the box)"""
    a, bg = SHEETS[sheet]; x0, y0, x1, y1 = box
    a = a[y0:y1, x0:x1].copy(); h, w, _ = a.shape
    for dx0, dy0, dx1, dy1 in drop: a[max(0, dy0 - y0):max(0, dy1 - y0), max(0, dx0 - x0):max(0, dx1 - x0)] = bg
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


REF = {k: [] for k in SHEETS}   # sheet → the drawings saved from it, for ref.json


def save(im, name, sheet, box, use, used=True):
    """keep a cut drawing as reference art (ref/frames/<name>.png, its original pixels) and list it; returns its path"""
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    p = FRAMES_DIR / f'{name}.png'; im.save(p)
    REF[sheet].append({'file': f'frames/{name}.png', 'name': name.replace('_', ' '), 'box': [int(v) for v in box], 'size': list(im.size), 'use': use, 'used': used})
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
        w, h, pal_a, rows = convert(save(im, f'mouse_{name}', 'a', (a - 3, 745, b + 4, 828), USE[name]), grid_of(im, 2), HERE / 'mouse_palette.json')
        frames[name] = {'w': w, 'h': h, 'ox': helmet_x(im, w), 'oy': h, 'rows': rows}
    for name, box in ACTIONS.items():
        wall = name.startswith('wall')
        im = cut('act', box, tol=24, also=WALL_PANEL if wall else (), minfrac=.12, fill=(.5, GLASS) if wall else None)
        w, h, pal_b, rows = convert(save(im, f'mouse_{name}', 'act', box, USE[name]), grid_of(im, 1 / SCALE_ACT), HERE / 'mouse_palette_actions.json')
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
    w, h, pal, rows = convert(save(im, 'cheese', 'a', (22, 900, 80, 972), 'cheese crumbs'), grid_of(im, 2.4))
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
            w, h, _, rows = convert(save(im, f'cat_{name}', 'cat', CAT[name], USE[name]), grid_of(im, CAT_PX), pp)
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
        w, h, pal, rows = convert(save(im, name, 'obj', box, USE[name]), grid_of(im, OBJ_PX), colors=10)
        out.append(f"  {name}: {{ w: {w}, h: {h}, k: {json.dumps(round(size / h, 4) if size else None)}, pal: {json.dumps(pal)}, rows: [")
        out += js_rows(rows) + ['  ] },']
        print(f'object {name}: {w} x {h}')
    out[-1] = '  ] }'; out.append('};')

    # ---- props: decorations standing on the floor or hanging on the wall of a map tile
    out.append('// props: decorations standing on the floor or hanging on the wall of a map tile (k: base units per pixel)')
    out.append('const PROP_ART = {')
    for tile, (name, sheet, box, height, place) in PROPS.items():
        im = cut(sheet, box, tol=13 if sheet == 'a' else 24, minfrac=None if sheet == 'a' else .05)
        w, h, pal, rows = convert(save(im, f"prop_{name.replace(' ', '_')}", sheet, box, f'prop: map tile "{tile}"'), grid_of(im, 2 if sheet == 'a' else OBJ_PX))
        out.append(f"  {json.dumps(tile)}: {{ name: {json.dumps(name)}, w: {w}, h: {h}, k: {round(height / h, 4)}, place: '{place}', pal: {json.dumps(pal)}, rows: [")
        out += js_rows(rows) + ['  ] },']
        print(f'prop {tile} {name}: {w} x {h}')
    out[-1] = '  ] }'; out.append('};')

    (GAME / 'sprites.js').write_text('\n'.join(out) + '\n')
    print('wrote', GAME / 'sprites.js')

    # ---- reference art: the drawings the game does not use (yet), then the list of everything
    for sheet, name, box, note, *opt in REFERENCE:
        o = opt[0] if opt else {}
        im = cut(sheet, box, tol=o.get('tol', {'a': 13, 'cat': 9}.get(sheet, 24)), minfrac=o.get('minfrac', .05),
                 also=WALL_PANEL if o.get('also') == 'wall' else (), fill=(.5, GLASS) if o.get('fill') else None, drop=o.get('drop', ()))
        save(im, name, sheet, box, note, used=False)
    write_reference()


def write_reference():
    """ref/ref.json (read by the site's ART page) and ref/README.md (for GitHub): each sheet and the drawings cut from it"""
    sheets = []
    for k, frames in REF.items():
        h, w, _ = SHEETS[k][0].shape; title, source = SHEET_INFO[k]
        sheets.append({'file': SHEET_FILES[k], 'title': title, 'source': source, 'size': [w, h], 'frames': frames})
    ref = {'title': 'Space Mouse', 'made_by': 'games/spacemouse/tools/art.py', 'sheets': sheets}
    (GAME / 'ref/ref.json').write_text(json.dumps(ref, indent=1) + '\n')
    md = ['# Space Mouse: reference art', '',
          "The owner's art sheets, untouched, and every drawing cut from them at its original pixels (`frames/`), used in the game",
          'or not. Made by `tools/art.py`, which also writes `ref.json` (the site\'s ART page reads it). Boxes are x0, y0, x1, y1 on',
          'the sheet.', '']
    for sh in sheets:
        md += [f"## {sh['title']}", '', f"`{sh['file']}`, {sh['size'][0]} x {sh['size'][1]}, from {sh['source']}", '',
               f"![{sh['file']}]({sh['file']})", '', '| drawing | name | box | used for |', '|---|---|---|---|']
        md += [f"| ![{f['name']}]({f['file']}) | {f['name']} | {', '.join(map(str, f['box']))} | {f['use']} |" for f in sh['frames']]
        md.append('')
    (GAME / 'ref/README.md').write_text('\n'.join(md))
    print('wrote', GAME / 'ref/ref.json', 'and README.md:', sum(len(f) for f in REF.values()), 'drawings')


if __name__ == '__main__':
    main()
