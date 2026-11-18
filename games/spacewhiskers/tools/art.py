#!/usr/bin/env python3
"""Space Whiskers: the owner's reference art, cut and recorded (the repository's rule: keep every original).

  python3 games/spacewhiskers/tools/art.py

Reads the sheets in ref/ (untouched), cuts every drawing of the sprite sheet (pip.png) at its original pixels into ref/frames/
(the baked-in checkerboard made transparent), and writes ref/ref.json (the site's ART page reads it) and ref/README.md.

How the sprite sheet is cut: its "transparent" ground is a light grey checkerboard painted into the picture, and every drawing
has a dark outline, so a flood fill from the edges through light neutral greys is the ground and stops at the outlines (the
white of the suit, inside the outline, stays). The drawings are then the 8-connected pieces that are left; the labels are left
out by where they are. The wall-sliding drawing touches the wall drawn next to it, so it is cut by a box and the wall's
columns are left out.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

GAME = Path(__file__).resolve().parent.parent
REF = GAME / 'ref'
FRAMES = REF / 'frames'

SHEETS = [
    dict(file='pip.png', title='SNES sprites: the mouse, side view (idle, walking, running, sliding, crouching, jumping, wall sliding)',
         source='the owner (an image model)', note='Its pixel grid sets the scale of the whole game: one art pixel of this sheet is one game pixel '
         '(about 2.86 picture pixels; Pip stands about 49 game pixels tall).'),
    dict(file='levelinspiration.png', title='Level inspiration: the Whiskerworks shipyard with the SS Mewoh-1',
         source='the owner (an image model)', use='the look of a level: platforms, scaffolding, signs, sleeping cats, cheese (not cut yet)'),
    dict(file='levelinspirationprops.png', title='Level props: platforms, girders, pipes, machines, crates, signs, cats and ship parts',
         source='the owner (an image model)', use='props for the levels, on a green ground (not cut yet)'),
    dict(file='StarWhiskers-theholycow_cover.png', title='Cover: Pip, the cat, the Holy Cow and MEGA-MJAU\'s fortress (title art still reads "Star Whiskers")',
         source='the owner (an image model)', use='the cover and title screen; the look of the cast'),
    # ---- the Bubbling Moon (chapter 9): made through the image API by tools/sheets.mjs, one big picture each, to be cut up later ----
    # (the prompts and what the API answered are in ref/prompts/; the level design that asks for them is story/BUBBLING_MOON.md)
    dict(file='bubblingmoon_terrain.png', title='Bubbling Moon props 1: ground and platforms (glossy, thin and matte crust, floating chunks, Swiss ledges), craters and holes, rocks, plants, decals',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the level\'s ground, platforms, pits and holes (not cut yet)',
         note='7 rows. Missing: "crater cap L" (row 3 has 6 of 7). Two labels are garbled ("hole oval", "wall cap"). The paw prints came out pink-purple: they would be eaten by the magenta key. (A first take, made at medium quality with a looser style block, was softer and noisier and is not kept.)'),
    dict(file='bubblingmoon_milk.png', title='Bubbling Moon props 2: milk bubbles (every state of the pop), the curd boat, milk things, pickups and movables, signs, the builders\' leftovers',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the bubble platforms, the curd, cheese pickups, the pushable wheels, the box and the cat bed, signs (not cut yet)',
         note='6 rows, every item there. The curds have a rosy tint in their shading (check against the magenta key). One label reads "nug" for "mug".'),
    dict(file='bubblingmoon_station.png', title='Bubbling Moon props 3: the pumping station: pipes, the main pipeline, valves and controls, pumps and tanks, doors, the inside, lights, tools',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the pumping station and its puzzles: valve wheels, levers, plates, gauges, pumps and tanks, the pump housing, the pipe map and its torn pieces, the plaque and the old photo (not cut yet)',
         note='8 rows. Missing: "map piece 2" (three of the four pieces are there). The piston caps and the tanks\' sight glass are tinted pink.'),
    dict(file='bubblingmoon_bg_outdoor_1.png', title='Bubbling Moon backgrounds, outdoors 1: the sky with the broken Milky Way (top panel) and the far cheese mountains (bottom panel)',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the slowest background layers outdoors: each panel is two screens wide (3840 x 1080), the sky is opaque, the mountains stand on magenta (not cut yet)',
         note='Two panels of 3840 x 1080 picture pixels (960 x 270 game pixels). The seams (left edge into right edge) are not checked yet.'),
    dict(file='bubblingmoon_bg_outdoor_2.png', title='Bubbling Moon backgrounds, outdoors 2: the middle plain with the far pumping station (top panel) and the near cliffs and pipes (bottom panel)',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the middle and near layers outdoors, on magenta (not cut yet)',
         note='Two panels of 3840 x 1080 picture pixels. The seams are not checked yet; the middle panel\'s ground and the near panel\'s top edge meet at the middle of the sheet.'),
    dict(file='bubblingmoon_bg_station.png', title='Bubbling Moon backgrounds, inside the pumping station: the half-painted back wall (top panel) and the deep machine hall (bottom panel)',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the interior layers of the pumping station: the wall is opaque, the deep hall stands on magenta (not cut yet)',
         note='Two panels of 3840 x 1080 picture pixels. The seams are not checked yet.'),
    dict(file='bubblingmoon_fg_outdoor.png', title='Bubbling Moon foregrounds, outdoors: hanging stalactites, corner rocks, pillars, big low shapes, mist',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the front pass outdoors: pieces drawn in front of Pip, which fade where he walks behind them (not cut yet)',
         note='5 rows, all 31 pieces. The mist banks are pale lavender-pink and would be eaten by the magenta key: they need a cleaner cut (or a redraw).'),
    dict(file='bubblingmoon_fg_station.png', title='Bubbling Moon foregrounds, inside the pumping station: hanging pipes and cables, machine edges, beams, railings, steam',
         source='Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs)', use='the front pass inside the pumping station: close pipes, cables, machine edges, beams, railings, steam (not cut yet)',
         note='5 rows, all 31 pieces. The steam, the dust beam and the milk haze are pink-tinted (they would be eaten by the magenta key): they need a cleaner cut or a redraw.'),
]

# the drawings of pip.png: name, what it is for, and where it is (a box that holds exactly one piece, or for the wall slide the
# box it is cut by); the order is the animations' order
PIP = [
    ('pip_idle', 'idle', (25, 184, 142, 325)),
    ('pip_walk1', 'walking, frame 1 of 4', (181, 186, 285, 327)),
    ('pip_walk2', 'walking, frame 2 of 4', (285, 186, 385, 326)),
    ('pip_walk3', 'walking, frame 3 of 4', (389, 185, 493, 326)),
    ('pip_walk4', 'walking, frame 4 of 4', (493, 184, 597, 325)),
    ('pip_run1', 'running, frame 1 of 4', (620, 190, 747, 322)),
    ('pip_run2', 'running, frame 2 of 4', (733, 189, 852, 325)),
    ('pip_run3', 'running, frame 3 of 4', (846, 190, 957, 323)),
    ('pip_run4', 'running, frame 4 of 4', (943, 190, 1064, 325)),
    ('pip_slide', 'sliding', (110, 460, 272, 553)),
    ('pip_slide_dust', 'sliding: the dust behind him', (36, 503, 108, 555)),
    ('pip_crouch', 'crouching', (345, 448, 476, 554)),
    ('pip_jump', 'jumping', (571, 397, 699, 542)),
    ('pip_wall_slide', 'wall sliding (the wall left out)', (925, 392, 1031, 553)),
]
WALL_X = 1031   # the wall next to the wall slide starts here


def pieces(mask):
    """8-connected pieces of a mask → label array"""
    H, W = mask.shape; lab = np.zeros((H, W), np.int32); n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
    return lab


def ground(a):
    """the checkerboard: light neutral greys reached from the sheet's edges without crossing an outline"""
    light = (a.min(2) >= 205) & (a.max(2) - a.min(2) <= 14)
    H, W = light.shape; seen = np.zeros_like(light); q = deque()
    for y in range(H):
        for x in (0, W - 1):
            if light[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for x in range(W):
        for y in (0, H - 1):
            if light[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < H and 0 <= xx < W and light[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; q.append((yy, xx))
    return seen


def cut_pip():
    im = Image.open(REF / 'pip.png').convert('RGBA'); a = np.asarray(im).astype(int)
    fg = ~ground(a[..., :3]); lab = pieces(fg); FRAMES.mkdir(exist_ok=True); out = []
    for name, use, (x0, y0, x1, y1) in PIP:
        ids = set(np.unique(lab[y0:y1, x0:x1]).tolist()) - {0}
        if name == 'pip_wall_slide':
            keep = np.zeros_like(fg); keep[y0:y1, x0:min(x1, WALL_X)] = fg[y0:y1, x0:min(x1, WALL_X)]
            # bits of the wall's crumbling edge come along in the box: Pip is the biggest piece in it
            sub = pieces(keep); sizes = np.bincount(sub.ravel()); sizes[0] = 0; keep = sub == sizes.argmax()
        else:
            # the pieces whose box lies inside this one (a neighbour's cape or tail may reach into it, but not all of it)
            keep = np.zeros_like(fg)
            for i in ids:
                ys, xs = np.nonzero(lab == i)
                if xs.min() >= x0 - 1 and xs.max() < x1 + 1 and ys.min() >= y0 - 1 and ys.max() < y1 + 1: keep |= lab == i
        ys, xs = np.nonzero(keep); bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        rgba = np.asarray(im).copy(); rgba[..., 3] = np.where(keep, 255, 0)
        Image.fromarray(rgba[by0:by1, bx0:bx1].astype(np.uint8)).save(FRAMES / f'{name}.png')
        out.append(dict(file=f'frames/{name}.png', name=name.replace('_', ' '), box=[bx0, by0, bx1, by1], size=[bx1 - bx0, by1 - by0],
                        use=f'Pip {use}: snapped to the game grid in art/ (the animations)', used=True))
    return out


def main():
    frames = {'pip.png': cut_pip()}
    ref = dict(title='Space Whiskers: The Holy Cow', made_by='games/spacewhiskers/tools/art.py', sheets=[])
    md = ['# Space Whiskers: reference art', '',
          'The owner\'s sheets, untouched, and every drawing cut from them at its original pixels (`frames/`). Made by `tools/art.py`, which also',
          'writes `ref.json` (the site\'s ART page reads it). Boxes are x0, y0, x1, y1 on the sheet.', '']
    for s in SHEETS:
        w, h = Image.open(REF / s['file']).size
        e = dict(file=s['file'], title=s['title'], source=s['source'], size=[w, h], frames=frames.get(s['file'], []))
        if s.get('use'): e['use'] = s['use']
        if s.get('note'): e['note'] = s['note']
        ref['sheets'].append(e)
        md += [f"## {s['title']}", '', f"`{s['file']}`, {w} x {h}, from {s['source']}" + (f". {s['note']}" if s.get('note') else '') + (f" Used for: {s['use']}." if s.get('use') else ''), '',
               f"![{s['file']}]({s['file']})", '']
        if e['frames']:
            md += ['| drawing | name | box | used for |', '|---|---|---|---|']
            md += [f"| ![{f['name']}]({f['file']}) | {f['name']} | {', '.join(map(str, f['box']))} | {f['use']} |" for f in e['frames']]
            md.append('')
    (REF / 'ref.json').write_text(json.dumps(ref, indent=1) + '\n')
    (REF / 'README.md').write_text('\n'.join(md))
    print(f"{sum(len(f) for f in frames.values())} drawings cut; ref.json and README.md written")


if __name__ == '__main__':
    main()
