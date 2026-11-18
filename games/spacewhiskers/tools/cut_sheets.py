#!/usr/bin/env python3
"""Space Whiskers: the Bubbling Moon's sheets cut into single sprites (the repository's rule: keep every drawing at its original pixels).

  python3 games/spacewhiskers/tools/cut_sheets.py [sheet ...] [--check]

Reads ref/bubblingmoon_<sheet>.png (untouched), writes one transparent PNG per item into ref/frames/ (bubblingmoon_<sheet>_<name>.png) and the list of
them into ref/frames_moon.json, which tools/art.py puts into ref.json and the README. --check cuts and reports but writes nothing.

How a props or foreground sheet is cut. The ground is flat magenta (it comes back as about (247, 54, 238), a little noisy), so: the pixels near that
colour that are connected to the picture's edge are the ground (an inner pink that an outline encloses stays); the ground's edge is eaten two pixels
deep where it is still near the key, so no pink halo is left. What is left falls into pieces (8-connected). The label under every item is white text, so
the pieces that are nearly all white, small, and sit in a few long lines are the labels; the lines are the rows. Each other piece belongs to the label
nearest above-to-below it in its row; an item that is made of several pieces (a bubble bursting, a drip falling) comes with all of them. The names are
tools/bubblingmoon_names.json: the row plan of tools/sheets.mjs, with the three things the model left out or split (no "crater cap L", no
"map piece 2", the drip as three frames). A row whose labels do not match its names is reported, and its items are named row<r>_<k>.
The background sheets hold two panels of 3840 x 1080 (the top and the bottom half): an opaque one is cut as it is, one with a magenta ground is keyed.
"""
import json, re, sys
from pathlib import Path

import numpy as np
from PIL import Image

GAME = Path(__file__).resolve().parent.parent
REF = GAME / 'ref'
FRAMES = REF / 'frames'
NAMES = json.loads((Path(__file__).resolve().parent / 'bubblingmoon_names.json').read_text())
NAMES2 = json.loads((Path(__file__).resolve().parent / 'bubblingmoon2_names.json').read_text())   # round 2: per sheet, per row, "group/name"; the background sheets: [{name, opaque}]
USE2 = {'fixes': 'Bubbling Moon round 2, fixes (the gaps, the redraws, white curds)', 'slide': 'Bubbling Moon round 2, the pipe slide and the giant bubble', 'characters': 'Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old)', 'missclou': 'Bubbling Moon round 2, Miss Clou', 'slide2': 'Bubbling Moon round 2, the slide pieces redrawn to the straight piece\'s size',
        'scrapbook': 'Bubbling Moon round 2, the scrapbook', 'ground': 'Bubbling Moon round 2, the ground', 'hall': 'Bubbling Moon round 2, the pump hall',
        'anim_a': 'Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust)', 'anim_b': 'Bubbling Moon round 2, animation frames B (valves, geyser, the pump)'}
# what the model really drew where it left the plan (a row's items in another row, a frame missing): per sheet, the names row by row, as drawn; it replaces the plan
_lay = Path(__file__).resolve().parent / 'bubblingmoon2_layout.json'
if _lay.exists(): NAMES2.update(json.loads(_lay.read_text()))
ROUND2 = set(USE2) | {'bg_outdoor', 'bg_station_a', 'bg_station_b'}

# sheet → what it is, for the "used for" of each drawing
USE = {
    'terrain': 'Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals)', 'milk': 'Bubbling Moon milk and movable props',
    'station': 'Bubbling Moon pumping-station props', 'fg_outdoor': 'Bubbling Moon foreground, outdoors', 'fg_station': 'Bubbling Moon foreground, inside the station'}
# the background sheets: two panels (top, bottom): (name, opaque?, what)
PANELS = {
    'bg_outdoor_1': [('sky', True, 'the sky with the broken Milky Way, opaque, repeats sideways'), ('far-mountains', False, 'the far cheese mountains, on a ground to be keyed, repeats sideways')],
    'bg_outdoor_2': [('middle-plain', False, 'the middle plain with the far pumping station and the pipeline, repeats sideways'), ('near-cliffs', False, 'the near cliffs and pipes behind the platforms, repeats sideways')],
    'bg_station': [('back-wall', True, 'the half-painted back wall of the pump hall, opaque, repeats sideways'), ('deep-hall', False, 'the deep machine hall, repeats sideways')],
}


def runs(mask):
    """the horizontal runs of a boolean image: (y, x0, x1 exclusive), in row order"""
    H, W = mask.shape
    pad = np.zeros((H, W + 2), np.int8); pad[:, 1:-1] = mask
    d = np.diff(pad, axis=1)
    ys, xs = np.nonzero(d == 1); ye, xe = np.nonzero(d == -1)
    return ys, xs, xe


def label(mask, conn8=True):
    """connected pieces of a mask by union-find over runs: (label image with 0 = none, ids' bbox and area)"""
    H, W = mask.shape
    ys, x0, x1 = runs(mask); n = len(ys)
    parent = list(range(n))

    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    first = np.searchsorted(ys, np.arange(H + 1))
    e = 1 if conn8 else 0
    for y in range(1, H):
        p, pe, c, ce = first[y - 1], first[y], first[y], first[y + 1]
        while p < pe and c < ce:
            if x0[c] < x1[p] + e and x0[p] < x1[c] + e:
                ra, rb = find(p), find(c)
                if ra != rb: parent[rb] = ra
            if x1[p] < x1[c]: p += 1
            else: c += 1
    root = np.array([find(i) for i in range(n)]) if n else np.zeros(0, int)
    ids, inv = np.unique(root, return_inverse=True)
    lab = np.zeros((H, W), np.int32)
    for i in range(n): lab[ys[i], x0[i]:x1[i]] = inv[i] + 1
    k = len(ids)
    bx0 = np.full(k, W); bx1 = np.zeros(k, int); by0 = np.full(k, H); by1 = np.zeros(k, int); area = np.zeros(k, int)
    np.minimum.at(bx0, inv, x0); np.maximum.at(bx1, inv, x1); np.minimum.at(by0, inv, ys); np.maximum.at(by1, inv, ys + 1); np.add.at(area, inv, x1 - x0)
    return lab, dict(x0=bx0, x1=bx1, y0=by0, y1=by1, area=area)


def ground(rgb, tol=70, eat=150, passes=4, mode='magenta'):
    """the magenta ground: near the key and connected to the edge, then its edge eaten where it is still pinkish"""
    H, W, _ = rgb.shape
    frame = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3), rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
    # the key is the key colour there is (a panel's edge may be all rock): magenta (round 1), pure green (round 2), or what the frame of the picture is
    if mode == 'green': hit = (rgb[..., 1] > 215) & (rgb[..., 0] < 90) & (rgb[..., 2] < 90)
    elif mode == 'magenta': hit = (rgb[..., 0] > 215) & (rgb[..., 2] > 215) & (rgb[..., 1] < 100)
    else: hit = np.zeros(rgb.shape[:2], bool)
    key = np.median(rgb[hit], axis=0) if hit.sum() > 5000 else np.median(frame, axis=0)
    dist = np.sqrt(((rgb - key) ** 2).sum(2))
    near = dist < tol
    lab, st = label(near, conn8=False)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
    # ground an outline closes in (the hole of a ring, the gaps between ladder rungs, a mug's handle): pieces of near-pure key colour
    k = len(st['area']); mean = np.bincount(lab[near], weights=dist[near], minlength=k + 1)[1:] / np.maximum(st['area'], 1)
    inner = [i + 1 for i in range(k) if (i + 1) not in edge and st['area'][i] >= 12 and mean[i] < 62]
    bg = np.isin(lab, list(edge) + inner)
    for _ in range(passes):   # the halo: ground-adjacent pixels that are still pinkish
        nb = np.zeros_like(bg)
        nb[1:] |= bg[:-1]; nb[:-1] |= bg[1:]; nb[:, 1:] |= bg[:, :-1]; nb[:, :-1] |= bg[:, 1:]
        bg |= nb & (dist < eat) & ~bg
    return bg, key


# (sheet, row) -> groups of drawings to join: [first, others...], counted from 0 left to right among the pieces more than 22 pixels apart
JOIN = {('fixes', 4): [[4, 5], [2, 3], [0, 1]], ('terrain', 7): [[4, 5], [7, 8]],      # the paw prints: two prints a trail
        ('fg_outdoor', 4): [[3, 4]]}          # the bubble group: three bubbles


def save(rgba, path):
    rgba = rgba.copy(); rgba[rgba[..., 3] == 0] = 0   # nothing hides in the clear pixels: smaller files
    Image.fromarray(rgba).save(path, optimize=True)


def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def cut_props(sheet, write=True):
    r2 = sheet in ROUND2; prefix = 'bubblingmoon2_' if r2 else 'bubblingmoon_'
    rgb = np.asarray(Image.open(REF / f'{prefix}{sheet}.png').convert('RGB')).astype(np.int16)
    H, W, _ = rgb.shape
    bg, key = ground(rgb, mode='green' if r2 else 'magenta')
    fg = ~bg
    lab, st = label(fg, conn8=True)
    k = len(st['area'])
    white = (rgb.min(2) >= 205) & ((rgb.max(2) - rgb.min(2)) <= 45)
    wfrac = np.bincount(lab[white], minlength=k + 1)[1:] / np.maximum(st['area'], 1)
    w = st['x1'] - st['x0']; h = st['y1'] - st['y0']; cx = (st['x0'] + st['x1']) / 2; cy = (st['y0'] + st['y1']) / 2
    glyph = (wfrac >= 0.55) & (h <= 70) & (w <= 70) & (st['area'] >= 20)
    # the label lines: where many glyphs share a height
    gi = np.nonzero(glyph)[0]
    bins = np.bincount((cy[gi] // 10).astype(int), minlength=H // 10 + 2)
    bands, cur = [], None
    for b in range(len(bins)):
        if bins[b] >= 4:
            if cur and b - cur[1] <= (12 if sheet in ROUND2 else 3): cur[1] = b   # round 2: labels of one row may sit up to 120 px apart
            else:
                if cur: bands.append(cur)
                cur = [b, b]
    if cur: bands.append(cur)
    out = []
    for b0, b1 in bands:
        sel = [i for i in gi if b0 * 10 <= cy[i] < (b1 + 1) * 10]
        if len(sel) >= 6: out.append((min(st['y0'][i] for i in sel) - 4, max(st['y1'][i] for i in sel) + 4, sel))
    rows = []
    for top, bot, sel in out:
        sel = sorted(sel, key=lambda i: st['x0'][i]); labels, curl = [], None
        for i in sel:
            if curl and st['x0'][i] <= curl['x1'] + 40: curl['x1'] = max(curl['x1'], st['x1'][i]); curl['ids'].append(i)
            else:
                if curl: labels.append(curl)
                curl = dict(x0=st['x0'][i], x1=st['x1'][i], ids=[i])
        if curl: labels.append(curl)
        for lb in labels: lb['cx'] = (lb['x0'] + lb['x1']) / 2
        rows.append(dict(top=top, bot=bot, labels=labels, items={}))
    is_glyph = np.zeros(k, bool)
    for r in rows:
        for i in gi:
            if r['top'] <= cy[i] <= r['bot']: is_glyph[i] = True
    # every other piece belongs to the row whose label line is the next one below it; the pieces of a row are grouped into items by how close
    # they are sideways (a bursting bubble or a falling drip is several pieces, an item is at least 40 pixels from the next)
    for r in rows: r['pieces'] = []
    for i in range(k):
        if is_glyph[i] or st['area'][i] < 40: continue
        if h[i] <= 70 and any(r['top'] <= cy[i] <= r['bot'] for r in rows): continue   # the rest of a garbled label (not white enough to be a letter)
        below = [r for r in rows if r['top'] >= cy[i] - 2]
        if below: min(below, key=lambda r: r['top'])['pieces'].append(i)
    report, frames = [], []
    want = NAMES2[sheet] if r2 else NAMES[sheet]
    if len(rows) != len(want): report.append(f'{sheet}: found {len(rows)} label rows, the plan has {len(want)}')
    for ri, r in enumerate(rows):
        groups = []
        for i in sorted(r['pieces'], key=lambda i: st['x0'][i]):
            if groups and st['x0'][i] <= groups[-1]['x1'] + 22: groups[-1]['x1'] = max(groups[-1]['x1'], int(st['x1'][i])); groups[-1]['ids'].append(i)
            else: groups.append(dict(x1=int(st['x1'][i]), ids=[i]))
        # a few items are several pieces more than 22 pixels apart (a bubble group, a drip with its drop): JOIN lists them, by their order in the row
        for join in sorted(JOIN.get((sheet, ri + 1), []), key=lambda j: -j[0]):
            first = groups[join[0]]
            for j in sorted(join[1:], reverse=True): first['ids'] += groups.pop(j)['ids']
        names = want[ri] if ri < len(want) else []
        if len(names) != len(groups):
            boxes = [(int(min(st['x0'][i] for i in g['ids'])), int(max(st['x1'][i] for i in g['ids'])), int(min(st['y0'][i] for i in g['ids'])), int(max(st['y1'][i] for i in g['ids']))) for g in groups]
            report.append(f'{sheet} row {ri + 1}: {len(groups)} drawings and {len(r["labels"])} labels but {len(names)} names; items are named row{ri + 1}_k; drawings (x0, x1, y0, y1): {boxes}')
            names = [f'row{ri + 1}_{j + 1}' for j in range(len(groups))]
        for name, g in zip(names, groups):
            ids = g['ids']
            x0 = int(min(st['x0'][i] for i in ids)); x1 = int(max(st['x1'][i] for i in ids)); y0 = int(min(st['y0'][i] for i in ids)); y1 = int(max(st['y1'][i] for i in ids))
            sub = lab[y0:y1, x0:x1]; keep = np.isin(sub, [i + 1 for i in ids])
            rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8); rgba[..., :3] = rgb[y0:y1, x0:x1].clip(0, 255); rgba[..., 3] = np.where(keep, 255, 0)
            grp, nm = name.split('/', 1) if '/' in name else (sheet, name)
            fn = f'{prefix}{grp}_{slug(nm)}.png'
            if write: FRAMES.mkdir(exist_ok=True); save(rgba, FRAMES / fn)
            frames.append(dict(file=f'frames/{fn}', name=f'{grp} {nm}', box=[x0, y0, x1, y1], size=[x1 - x0, y1 - y0],
                               use=f'{USE2[sheet] if r2 else USE[sheet]}, row {ri + 1}: not in a game yet', used=False))
    return frames, report


def cut_panels(sheet, folder):
    """the two panels of a background sheet (the top and the bottom half) as PNGs in `folder`: an opaque one as it is, one on its key colour keyed"""
    r2 = sheet in ROUND2; prefix = 'bubblingmoon2_' if r2 else 'bubblingmoon_'
    im = Image.open(REF / f'{prefix}{sheet}.png').convert('RGB'); a = np.asarray(im)
    panels = [(d['name'], d['opaque'], 'the second round') for d in NAMES2[sheet]] if r2 else PANELS[sheet]
    H = a.shape[0] // 2; report = []
    for k, (name, opaque, what) in enumerate(panels):
        y0, y1 = k * H, (k + 1) * H; rgb = a[y0:y1].astype(np.int16)
        rgba = np.zeros((H, a.shape[1], 4), np.uint8); rgba[..., :3] = a[y0:y1]
        if opaque: rgba[..., 3] = 255
        else:
            bg, key = ground(rgb, mode='green' if r2 else 'magenta'); rgba[..., 3] = np.where(bg, 0, 255)
        seam = float(np.abs(rgb[:, :8].astype(float).mean(1) - rgb[:, -8:].astype(float).mean(1)).mean())
        if folder: Path(folder).mkdir(parents=True, exist_ok=True); save(rgba, Path(folder) / f'{prefix}{sheet}_{name}.png')
        report.append(f'{sheet} {name}: {what}; seam difference {seam:.1f} (0 = the left edge continues into the right)')
    return report


def main(argv):
    """cut the props and foregrounds into ref/frames/ and list them in ref/frames_moon.json (round 1) or ref/frames_moon2.json (round 2); --panels DIR also writes
    the background panels there; --check cuts and reports but writes nothing; --round2 means every sheet of the second round"""
    check = '--check' in argv; folder = argv[argv.index('--panels') + 1] if '--panels' in argv else None
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--panels')]
    sheets = args or (sorted(ROUND2) if '--round2' in argv else list(USE) + list(PANELS))
    out1, out2 = {}, {}
    for s in sheets:
        if s in USE or (s in ROUND2 and not isinstance(NAMES2[s][0], dict)):
            frames, report = cut_props(s, write=not check)
            (out2 if s in ROUND2 else out1)[f"{'bubblingmoon2_' if s in ROUND2 else 'bubblingmoon_'}{s}.png"] = frames
            print(f'{s}: {len(frames)} drawings')
        else:
            report = cut_panels(s, None if check else folder)
        for line in report: print('  ' + line)
    for fname, out in (('frames_moon.json', out1), ('frames_moon2.json', out2)):
        if out and not check:
            old = json.loads((REF / fname).read_text()) if (REF / fname).exists() else {}
            old.update(out); (REF / fname).write_text(json.dumps(old, indent=1) + '\n')


if __name__ == '__main__':
    main(sys.argv[1:])
