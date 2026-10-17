#!/usr/bin/env python3
"""Fjordheim art from the owner's three isometric sheets (games/fjordheim/ref/, made with Gemini):
  sheet_buildings.jpg  ground tiles, buildings, trees and rocks, the barley field in five stages
  sheet_people.jpg     the family (father, mother, child), animals, the knarr and the rowing boat, goods
  sheet_fixes.jpg      what the first two missed: the walks seen from behind (NE), the stag and sheep from behind, slate-grey
                       ravens, the stockfish rack, a meadow tile, a small rock
Each drawing is cut out of its sheet: every label tools/sheetcheck.py finds is blanked first, then the flat raspberry
background is keyed out everywhere in the drawing's box (also where the drawing encloses it: between sawyers, under a
sail), the pink anti-aliased halo along the outline is peeled off, and stray specks are dropped. It is saved at its
original pixels in ref/frames/ and listed in ref/ref.json and ref/README.md
(the owner's rule: every original kept, used or not), and the ones the game uses are converted with tools/sprite2ascii.py
into games/fjordheim/sprites.js. A character's frames share one palette, so it doesn't change colour as it walks. The
ground tiles are not drawn as sprites: their top colours become the ground materials (FJ_GROUND).
Boxes are x0, y0, x1, y1 on the sheet, from `python3 tools/sheetcheck.py <sheet> shots/<name>` (padded here by 4 px).

  python3 games/fjordheim/tools/art.py
"""
import json, re, subprocess, sys, tempfile
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from sheetcheck import analyse, label_mask   # noqa: E402
FRAMES_DIR = GAME / 'ref/frames'
FILES = {'b': 'sheet_buildings.jpg', 'p': 'sheet_people.jpg', 'f': 'sheet_fixes.jpg'}
SHEET_INFO = {   # for ref.json: what each sheet is and where it came from
    'b': ('Ground, buildings, nature and the barley field', 'Gemini'),
    'p': ('The family, animals, boats and goods', 'Gemini'),
    'f': ('The fixes: walks seen from behind, animals from behind, slate ravens, the stockfish rack, meadow, a small rock', 'Gemini'),
}
SHEETS = {}
for k, f in FILES.items():   # each sheet with its labels blanked to the background
    s = analyse(GAME / 'ref' / f); a = s['a'].copy(); a[label_mask(s)] = s['bg']
    SHEETS[k] = (a, s['bg'])
TOL = 20   # sheetcheck: the closest drawing colours are 31..37 from the raspberry background

# every drawing on the sheets: name → (sheet, box, what it is for, used?, options)
# frame names end in _1, _2 ...; groups that share a palette are listed in GROUPS
D = {
    # ---- the family (people sheet; "NE" frames there face the viewer, so they serve as more SE frames)
    'father_stand':     ('p', (57, 27, 105, 148), 'the father standing', True),
    'father_se_1':      ('p', (179, 29, 230, 148), 'the father walking towards the viewer', True),
    'father_se_2':      ('p', (250, 29, 310, 147), 'the father walking towards the viewer', True),
    'father_se_3':      ('p', (338, 29, 392, 148), 'the father walking towards the viewer', True),
    'father_ne_1':      ('p', (433, 29, 488, 148), 'the father walking away', True),
    'father_ne_2':      ('p', (505, 29, 557, 143), 'the father walking away', True),
    'father_ne_3':      ('p', (575, 29, 628, 148), 'the father walking away', True),
    'father_chop':      ('p', (699, 7, 759, 148), 'the father felling a tree (axe raised)', True),
    'chopping_block':   ('p', (802, 70, 867, 148), 'not used: the woodcutter\'s hut has its own block', False),
    'father_log_se_1':  ('p', (954, 21, 1045, 148), 'the father carrying a log towards the viewer', True),
    'father_log_se_2':  ('p', (1118, 21, 1212, 148), 'the father carrying a log towards the viewer (drawn as "NE")', True),
    'father_log_ne_1':  ('f', (308, 32, 426, 199), 'the father carrying a log away', True),
    'father_log_ne_2':  ('f', (440, 33, 558, 205), 'the father carrying a log away', True),
    'father_chop_down': ('f', (38, 26, 266, 251), 'not used: drawn on its own ground tile', False),
    'mother_stand':     ('p', (57, 209, 105, 333), 'the mother standing', True),
    'mother_se_1':      ('p', (160, 212, 215, 332), 'the mother walking towards the viewer', True),
    'mother_se_2':      ('p', (232, 213, 287, 332), 'the mother walking towards the viewer', True),
    'mother_se_3':      ('p', (302, 213, 358, 333), 'the mother walking towards the viewer', True),
    'mother_se_4':      ('p', (383, 215, 440, 333), 'the mother walking towards the viewer (drawn as "NE")', True),
    'mother_ne_1':      ('p', (458, 213, 505, 333), 'the mother walking away', True),
    'mother_ne_2':      ('p', (518, 213, 573, 329), 'the mother walking away', True),
    'mother_ne_3':      ('f', (639, 40, 712, 205), 'the mother walking away', True),
    'mother_ne_4':      ('f', (736, 39, 812, 198), 'the mother walking away', True),
    'mother_reap_1':    ('p', (595, 216, 678, 332), 'the mother harvesting barley', True),
    'mother_reap_2':    ('p', (686, 221, 777, 332), 'the mother harvesting barley', True),
    'mother_basket_se_1': ('p', (803, 210, 869, 333), 'the mother carrying a basket towards the viewer', True),
    'mother_basket_se_2': ('p', (909, 209, 985, 333), 'the mother carrying a basket towards the viewer (drawn as "NE")', True),
    'mother_basket_ne': ('f', (901, 40, 987, 201), 'the mother carrying a basket away', True),
    'child_se_1':       ('p', (1043, 235, 1089, 329), 'the child walking towards the viewer', True),
    'child_se_2':       ('p', (1163, 232, 1212, 332), 'the child walking towards the viewer (drawn as "NE")', True),
    'child_ne_1':       ('f', (1065, 71, 1130, 200), 'the child walking away', True),
    'child_ne_2':       ('f', (1155, 71, 1221, 203), 'the child walking away', True),
    # ---- animals
    'sheep_se_1':       ('p', (45, 415, 141, 499), 'a sheep grazing and wandering', True),
    'sheep_se_2':       ('p', (167, 413, 260, 499), 'a sheep grazing and wandering', True),
    'sheep_se_3':       ('p', (46, 582, 141, 662), 'not used: another sheep pair', False),
    'sheep_se_4':       ('p', (179, 579, 274, 666), 'not used: another sheep pair (labelled "NE", drawn side on)', False),
    'sheep_ne_1':       ('f', (312, 374, 426, 493), 'a sheep wandering away', True),
    'sheep_ne_2':       ('f', (458, 374, 574, 492), 'a sheep wandering away', True),
    'ram_1':            ('p', (315, 397, 422, 498), 'not used: horned rams nobody asked for', False),
    'ram_2':            ('p', (445, 395, 556, 499), 'not used: horned rams nobody asked for', False),
    'deer_se_1':        ('p', (327, 503, 475, 666), 'the red deer stag in the forest', True, {'drop': [(385, 498, 480, 523)]}),   # ANIMALS
    'deer_se_2':        ('p', (464, 519, 571, 665), 'the red deer stag in the forest', True),
    'deer_se_3':        ('p', (608, 395, 713, 499), 'not used: a third stag', False),
    'deer_se_4':        ('p', (616, 546, 711, 667), 'not used: a fourth stag', False),
    'deer_ne_1':        ('f', (623, 323, 752, 513), 'the stag walking away', True),
    'deer_ne_2':        ('f', (793, 323, 922, 513), 'the stag walking away', True),
    'raven_black_1':    ('p', (1028, 398, 1109, 491), 'not used: near-black, it converts as outline (the fixes sheet redrew it)', False),
    'raven_black_2':    ('p', (1132, 421, 1237, 484), 'not used: near-black, it converts as outline (the fixes sheet redrew it)', False),
    'raven_1':          ('f', (1027, 397, 1110, 491), 'ravens flying over', True),
    'raven_2':          ('f', (1130, 420, 1238, 485), 'ravens flying over', True),
    # ---- boats
    'knarr':            ('p', (756, 391, 1013, 667), 'the knarr that brings the family and newcomers', True),
    'rowboat':          ('p', (1051, 544, 1232, 663), 'the fisher\'s rowing boat', True),
    # ---- goods: the stock piles by the storehouse
    'goods_logs':       ('p', (99, 717, 211, 802), 'the wood pile', True),
    'goods_planks':     ('p', (244, 721, 351, 801), 'the plank stack', True),
    'goods_stones':     ('p', (382, 721, 483, 797), 'the stone pile', True),
    'goods_firewood':   ('p', (515, 721, 615, 801), 'not used yet: firewood is wood in this version', False),
    'goods_grain':      ('p', (653, 723, 719, 798), 'the food store (grain)', True),
    'goods_fish':       ('p', (763, 721, 841, 800), 'the food store (fish)', True),
    'goods_wool':       ('p', (880, 727, 960, 796), 'not used yet: no wool in this version', False),
    'goods_iron':       ('p', (997, 733, 1081, 787), 'not used yet: no iron in this version', False),
    'goods_bread':      ('p', (1121, 739, 1192, 784), 'not used yet', False),
    # ---- ground tiles: their top colour becomes a ground material
    'tile_grass':       ('b', (34, 9, 251, 141), 'the colour of the grass', True),
    'tile_soil':        ('b', (279, 9, 496, 140), 'the colour of tilled soil', True),
    'tile_sand':        ('b', (524, 9, 740, 141), 'the colour of the beach', True),
    'tile_water':       ('b', (768, 9, 985, 141), 'the colour of the fjord', True),
    'tile_snow':        ('b', (1013, 9, 1230, 141), 'the colour of snow', True),
    'tile_meadow':      ('f', (605, 623, 886, 794), 'the colour of the flower meadow', True),
    # ---- buildings
    'longhouse':        ('b', (37, 114, 375, 367), 'the longhouse, the family\'s home', True, {'minfrac': .2}),
    'smithy':           ('b', (445, 143, 692, 349), 'the smithy', True, {'drop': [(606, 141, 658, 162)]}),   # the SAND label touches it
    'stabbur':          ('b', (761, 143, 954, 351), 'the storehouse on stilts (stabbur)', True, {'drop': [(844, 141, 908, 161)]}),   # WATER
    'woodcutter':       ('b', (1014, 178, 1219, 349), 'the woodcutter\'s hut', True),
    'sawpit':           ('b', (82, 356, 242, 500), 'the sawpit (two sawyers drawn in)', True),
    'fishing_hut':      ('b', (345, 340, 525, 499), 'the fishing hut', True),
    'well':             ('b', (629, 383, 713, 494), 'the well', True),
    'building_site':    ('b', (795, 374, 989, 498), 'any building under construction', True, {'minfrac': .01}),
    'fence':            ('b', (1061, 386, 1191, 500), 'not used yet: fences around fields', False),
    'drying_rack':      ('f', (104, 511, 365, 795), 'the stockfish drying rack', True),
    # ---- nature
    'pine':             ('b', (28, 473, 144, 666), 'pine trees', True),
    'birch_summer':     ('b', (186, 506, 271, 665), 'birches in spring and summer', True),
    'birch_autumn':     ('b', (325, 503, 454, 665), 'birches in autumn', True, {'drop': [(379, 500, 460, 521)]}),   # the FISHING HUT label touches it
    'birch_winter':     ('b', (464, 511, 554, 666), 'birches in winter', True),
    'sapling':          ('b', (617, 596, 658, 663), 'a young tree growing back', True),
    'stump':            ('b', (710, 608, 787, 668), 'a felled tree\'s stump', True),
    'log':              ('b', (818, 565, 963, 667), 'a felled tree (not drawn yet: the woodcutter carries it off at once)', False),
    'boulders':         ('b', (989, 572, 1109, 666), 'boulders to quarry for stone', True),
    'lingonberry':      ('b', (1133, 600, 1241, 665), 'lingonberry bushes to pick', True),
    'rock':             ('f', (1078, 677, 1151, 740), 'small rocks in the grass', True),
    # ---- the barley field
    'field_0':          ('b', (71, 710, 277, 824), 'a field, ploughed', True),
    'field_1':          ('b', (301, 671, 505, 824), 'a field, sprouting', True, {'drop': [(301, 668, 505, 703)]}),   # BIRCH TREE (AUTUMN)
    'field_2':          ('b', (529, 671, 734, 824), 'a field, growing', True, {'drop': [(529, 668, 734, 690), (529, 668, 560, 703)]}),   # SAPLING
    'field_3':          ('b', (759, 680, 963, 824), 'a field, ripe', True),
    'field_4':          ('b', (987, 704, 1192, 842), 'a field, harvested', True, {'drop': [(1005, 825, 1175, 846)]}),
}
GROUPS = {   # frames that share one palette (prefix → number of colours)
    'father': 12, 'mother': 12, 'child': 10, 'sheep': 7, 'deer': 9, 'raven': 6,
}
# sprite pixels per sheet pixel: the Gemini art has blocks of about 3 px; sampling at 3.2 keeps the detail
PER = 3.2


def cut(sheet, box, tol=TOL, minfrac=.05, drop=()):
    """RGBA of a sheet region (padded by 4 px) with the background keyed out (everywhere: no drawing colour comes within
    `tol` of it) and the pink halo peeled off its edges; minfrac keeps only the pieces at least that fraction of the
    biggest (drops specks); drop: sheet rectangles to treat as background"""
    a, bg = SHEETS[sheet]; H, W, _ = a.shape
    x0, y0, x1, y1 = max(0, box[0] - 4), max(0, box[1] - 4), min(W, box[2] + 4), min(H, box[3] + 4)
    a = a[y0:y1, x0:x1].copy(); h, w, _ = a.shape
    for dx0, dy0, dx1, dy1 in drop: a[max(0, dy0 - y0):max(0, dy1 - y0), max(0, dx0 - x0):max(0, dx1 - x0)] = bg
    keep = np.sqrt(((a - bg) ** 2).sum(2)) > tol
    # the halo: edge pixels blended from the raspberry and the dark outline read pink (red and blue well above green);
    # peeling two layers of them leaves the outline itself (near-black) as the edge
    pink = (a[..., 0] - a[..., 1] > 50) & (a[..., 2] - a[..., 1] > 25)
    for _ in range(2):
        edge = keep & ~(np.roll(keep, 1, 0) & np.roll(keep, -1, 0) & np.roll(keep, 1, 1) & np.roll(keep, -1, 1))
        keep &= ~(edge & pink)
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
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = a; rgba[..., 3] = np.where(keep, 255, 0)
    im = Image.fromarray(rgba)
    return im.crop(im.getbbox())


REF = {k: [] for k in FILES}


def save(im, name, sheet, box, use, used):
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    p = FRAMES_DIR / f'{name}.png'; im.save(p)
    REF[sheet].append({'file': f'frames/{name}.png', 'name': name.replace('_', ' '), 'box': [int(v) for v in box], 'size': list(im.size), 'use': use, 'used': used})
    return p


def convert(png, grid, palette=None, colors=10):
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


def grid_of(im):
    return max(1, round(im.width / PER)), max(1, round(im.height / PER))


def dense(pal, things=False):
    """the glyph a solid area of each colour gets. People and animals: bright → @, green → %, light cloth and wool → &,
    else #. Things (buildings, trees, goods) by what they are made of, so the parts of a building differ in texture as
    well as colour: bright → @, foliage → %, grey stone → # (@ when light), straw and thatch → %, dark wood → = (log
    walls, planks), else #"""
    for e in pal:
        r, g, b = e[:3]; lum = .3 * r + .59 * g + .11 * b; sat = max(r, g, b) - min(r, g, b)
        e[3] = int(lum >= 32)   # only near-black is outline
        if not things: e[4] = '@' if lum > 205 else '%' if g > r * 1.08 and g > b * 1.1 else '&' if lum > 150 and abs(r - g) < 40 else '#'
        else: e[4] = ('@' if lum > 190 else '%' if g > r * 1.08 and g > b * 1.1 else ('@' if lum > 110 else '#') if sat < 22
                      else '%' if r > b * 1.35 and lum > 120 else '=' if lum < 90 else '#')
    return pal


def unpink(pal, rows):
    """the JPEG bled the raspberry background into every drawing's edges, so some palette colours are not the art's but
    magenta-tinted: the dark ones are the outline (made a neutral near-black), the lighter ones the background showing
    through (made transparent: the drying rack's lattice, halo pixels)"""
    keys, gone = '0123456789abcdefghijklmnopqrstuvwxyz', set()
    for i, e in enumerate(pal):
        r, g, b = e[:3]
        if r - g > 25 and b - g > 15:
            if .3 * r + .59 * g + .11 * b < 70: e[:3] = [30, 24, 22]; e[3] = 0
            else: gone.add(keys[i])
    return pal, [''.join('.' if ch in gone else ch for ch in row) for row in rows]


def shared_palette(ims, n):
    """one palette for a character's frames: k-means over all of them side by side"""
    gap = int(8 * PER); W = sum(im.width + gap for im in ims); H = max(im.height for im in ims)
    sheet = Image.new('RGBA', (W, H)); x = 0
    for im in ims: sheet.paste(im, (x, H - im.height)); x += im.width + gap
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp, 'all.png'); sheet.save(p)
        _, _, pal, _ = convert(p, grid_of(sheet), colors=n)
    return dense(pal)


def top_colour(im):
    """the average colour of a ground tile's top face: the upper part of the diamond, its outline left out"""
    a = np.array(im).astype(int); al = a[..., 3] > 0; h = a.shape[0]
    top = al.copy(); top[int(h * .55):] = False
    lum = .3 * a[..., 0] + .59 * a[..., 1] + .11 * a[..., 2]
    pick = top & (lum > 35)
    return [int(v) for v in np.median(a[pick][:, :3], 0)]


def js_rows(rows, ind='    '):
    return [f"{ind}'{r}'," for r in rows[:-1]] + [f"{ind}'{rows[-1]}'"]


def main():
    ims = {}
    for name, (sheet, box, use, used, *opt) in D.items():
        o = opt[0] if opt else {}
        ims[name] = cut(sheet, box, minfrac=o.get('minfrac', .05), drop=o.get('drop', ()))
        save(ims[name], name, sheet, box, use, used)

    out = ['// ===================== GAME · sprites cut from the art sheets (generated) =====================',
           "// Made by tools/art.py from the owner's three Gemini sheets in ref/: cut out, converted with tools/sprite2ascii.py.",
           '// Edit the tool and rerun it, not this file. FJ_ART: name → { w, h, pal, rows, foot } (foot: the row the drawing',
           "// stands on, counted from the top). FJ_GROUND: the ground tiles' top colours, for the ground materials."]
    ground = {n[5:]: top_colour(ims[n]) for n in D if n.startswith('tile_')}
    out.append(f'const FJ_GROUND = {json.dumps(ground)};')
    out.append('const FJ_ART = {')
    pals = {}
    for g, n in GROUPS.items():
        names = [k for k in D if k.startswith(g + '_') and D[k][3]]
        pals[g] = shared_palette([ims[k] for k in names], n)
    for name, (sheet, box, use, used, *opt) in D.items():
        if not used or name.startswith('tile_'): continue
        g = next((g for g in GROUPS if name.startswith(g + '_')), None)
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp, 'x.png'); ims[name].save(p)
            if g:
                pp = Path(tmp, 'pal.json'); pp.write_text(json.dumps(pals[g]))
                w, h, pal, rows = convert(p, grid_of(ims[name]), pp)
            else:
                w, h, pal, rows = convert(p, grid_of(ims[name]), colors=12)
                pal = dense(pal, things=True)
        pal, rows = unpink(pal, rows)
        # the foot: the lowest row with paint near the middle (people and trees stand on their middle)
        mid = [r for r, row in enumerate(rows) if any(ch != '.' for ch in row[w // 3: w - w // 3])]
        foot = (mid[-1] + 1) if mid else h
        out.append(f'  {name}: {{ w: {w}, h: {h}, foot: {foot}, pal: {json.dumps(pal)}, rows: [')
        out += js_rows(rows) + ['  ] },']
        print(f'{name}: {w} x {h}')
    out[-1] = '  ] }'; out.append('};')
    (GAME / 'sprites.js').write_text('\n'.join(out) + '\n')
    print('wrote', GAME / 'sprites.js')
    write_reference()


def write_reference():
    """ref/ref.json (read by the site's ART page) and ref/README.md (for GitHub): each sheet and the drawings cut from it"""
    sheets = []
    for k, frames in REF.items():
        h, w, _ = SHEETS[k][0].shape; title, source = SHEET_INFO[k]
        sheets.append({'file': FILES[k], 'title': title, 'source': source, 'size': [w, h], 'frames': frames})
    ref = {'title': 'Fjordheim', 'made_by': 'games/fjordheim/tools/art.py', 'sheets': sheets}
    (GAME / 'ref/ref.json').write_text(json.dumps(ref, indent=1) + '\n')
    md = ['# Fjordheim: reference art', '',
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
