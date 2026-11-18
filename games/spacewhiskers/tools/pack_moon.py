#!/usr/bin/env python3
"""Space Whiskers: the Bubbling Moon pack: one zip with everything about the level for the owner.

  python3 games/spacewhiskers/tools/pack_moon.py out.zip

  README.md            what is where, the scale, what is known to be off
  level/               the design (BUBBLING_MOON.md), the five zones with layout sketches and their sprites (BUBBLING_MOON_LAYOUTS.md), what the review notes
                       decided (BUBBLING_MOON_DECISIONS.md), STORY_V2's Chapter 9
  sprites/<group>/     every sprite on its own, transparent, at its original pixels (terrain, milk, station, fg_outdoor, fg_station), INDEX.md lists them
  backgrounds/         the layers, two screens wide each: outdoor (sky, far-mountains, middle-plain, near-cliffs), station (back-wall, deep-hall)
  index/               contact sheets with the names
  sheets/              the eight sheets as the image API made them, and the prompts (sheets/prompts/)
  manifest.json        every sprite: group, name, file, size, where it was cut from
Everything is built from the repository (ref/, story/, tools/): cut the sprites first with tools/cut_sheets.py.
"""
import json, re, shutil, sys, tempfile, zipfile
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cut_sheets as C   # noqa: E402

GAME = C.GAME; REF = C.REF; STORY = GAME / 'story'
GROUPS = {'terrain': 'terrain: ground, platforms, craters, holes, rocks, plants, decals', 'milk': 'milk: bubbles, the curd, milk things, pickups and movables, signs, the builders\' leftovers',
          'station': 'station: pipes, the main pipeline, valves and controls, pumps and tanks, doors, the inside, lights, tools',
          'fg_outdoor': 'fg_outdoor: foreground pieces of the open moon', 'fg_station': 'fg_station: foreground pieces inside the station'}
BG_NAMES = {'bg_outdoor_1': 'outdoor', 'bg_outdoor_2': 'outdoor', 'bg_station': 'station'}


def checker(w, h, s=16):
    im = Image.new('RGB', (w, h), (58, 58, 66)); d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2: d.rectangle([x, y, x + s - 1, y + s - 1], fill=(74, 74, 84))
    return im


def contact(frames, ref):
    CW, CH, COLS = 300, 250, 6
    rows = (len(frames) + COLS - 1) // COLS
    im = checker(COLS * CW, rows * CH); d = ImageDraw.Draw(im)
    for n, f in enumerate(frames):
        sp = Image.open(ref / f['file']).convert('RGBA')
        sc = min((CW - 20) / sp.width, (CH - 54) / sp.height, 1.0)
        if sc < 1: sp = sp.resize((max(1, int(sp.width * sc)), max(1, int(sp.height * sc))), Image.LANCZOS)
        x, y = (n % COLS) * CW, (n // COLS) * CH
        im.paste(sp, (x + (CW - sp.width) // 2, y + (CH - 44 - sp.height) // 2 + 4), sp)
        d.text((x + 8, y + CH - 34), f"{f['name'].split(' ', 1)[1]}   {f['size'][0] // 4} x {f['size'][1] // 4}", fill=(255, 255, 255))
    return im


def chapter9():
    t = (STORY / 'STORY_V2.md').read_text()
    a = t.index('### Chapter 9'); b = t.index('### Chapter 10')
    return '# STORY_V2, Chapter 9 (copied from story/STORY_V2.md)\n\n' + t[a:b].rstrip() + '\n'


def readme(manifest, gaps):
    n = {g: sum(1 for m in manifest if m['group'] == g) for g in GROUPS}
    return f"""# The Bubbling Moon: art and level pack (Space Whiskers: The Holy Cow, chapter 9)

Everything about the Bubbling Moon in one place. It is a **first version** ("not the final final version"): the sprites are cut from the image model's sheets at their original
pixels and are not yet snapped to the game grid and palette; the level is a design, not a map in the game.

## What is in the pack

| Folder | What |
|---|---|
| `level/BUBBLING_MOON.md` | the design: what the review notes decided, **the hook (the moon has hiccups)**, the route in five zones, **ten puzzles to pick from**, the scrapbook photos, six questions for you, the art plan |
| `level/BUBBLING_MOON_LAYOUTS.md` | **each zone as a place to build**: mood, what happens, a layout sketch, the exact sprites, the background and foreground layers, technical notes |
| `level/BUBBLING_MOON_DECISIONS.md` | what the Review Notes Docs page says about this world (copied 2026-11-18) |
| `level/STORY_V2_chapter_9.md` | the story's own Chapter 9 |
| `sprites/` | **{len(manifest)} single sprites**, transparent PNGs: `terrain` {n['terrain']}, `milk` {n['milk']}, `station` {n['station']}, `fg_outdoor` {n['fg_outdoor']}, `fg_station` {n['fg_station']}; `sprites/INDEX.md` lists every one with its size |
| `backgrounds/` | the six background layers, each **two screens wide** (3840 x 1080 picture pixels = 960 x 270 game pixels): `outdoor/sky` (opaque), `outdoor/far-mountains`, `outdoor/middle-plain`, `outdoor/near-cliffs`, `station/back-wall` (opaque), `station/deep-hall`; the ones that are not opaque have a transparent ground |
| `index/` | contact sheets with the name and the game-pixel size under every sprite, and the backgrounds side by side |
| `sheets/` | the eight sheets as the image API made them (magenta ground, labels), and `sheets/prompts/` with the exact prompt of each |
| `manifest.json` | every sprite: group, name, file, size, the sheet it was cut from and the box on it |

## The scale

One art pixel is a **4 x 4 block** of picture pixels, so a sprite's size in game pixels is its picture size divided by 4 (`sprites/INDEX.md` has both). The screen is 480 x 270 game pixels
(1920 x 1080 picture pixels); Pip is 49 game pixels tall (196 picture pixels). The model draws on a 4 x 4 grid but not perfectly, so the sprites are a little soft until they are snapped.

## The sprites are named from the sheets' row plan

`terrain/glossy-crust.png`, `milk/curd-squash.png`, `station/wheel-red.png`, `fg_outdoor/stalactite-a.png`. The names are the labels the sheets were asked to carry.

## What is known to be off

{gaps}

## How it was made, and what next

The prompts and the cutting are scripts in the repository (`games/spacewhiskers/tools/sheets.mjs`, `cut_sheets.py`, `pack_moon.py`); the sheets, the sprites and these documents are in
`games/spacewhiskers/` (`ref/`, `story/`). Next, when you have picked the hook and the puzzles: put the sprites on the true grid and the master palette (the Pixel Snapper, as for Pip), ask the model
again for what is missing or pink, and build the moon as a level.
"""


GAPS = """- **Missing:** `crater cap L` (terrain), `map piece 2` and a separate **pump housing** (station; the three `tank` canisters are the nearest thing: the story's fuel tank). `swiss edge R` was drawn twice (`swiss-edge-r-2`).
- **Pink:** the paw prints (terrain) came out pink-purple, so only fragments are left; the curds are tinted rosy; the mist banks, steam, dust beam and milk haze are pale pink-lavender and partly eaten when the magenta ground is removed:
  those want a redraw. A few tiny gaps (ladders, the rope fence) keep pink specks.
- **Backgrounds:** the left and right edges of the layers do not quite meet (the sky almost does), so they need a blend to repeat sideways; the keyed layers have a few eaten pixels at their skylines.
- **Soft pixels:** not yet snapped to the game grid and palette.
- **Some labels on the sheets are garbled** (the names in this pack come from the row plan, not from reading the labels)."""


def main(out):
    ref = json.loads((REF / 'frames_moon.json').read_text())
    tmp = Path(tempfile.mkdtemp(prefix='moonpack_')); root = tmp / 'bubbling_moon_pack'
    (root / 'level').mkdir(parents=True)
    for f in ('BUBBLING_MOON.md', 'BUBBLING_MOON_LAYOUTS.md', 'BUBBLING_MOON_DECISIONS.md'): shutil.copy(STORY / f, root / 'level' / f)
    (root / 'level' / 'STORY_V2_chapter_9.md').write_text(chapter9())
    manifest, index = [], {g: [] for g in GROUPS}
    for sheet_file, frames in ref.items():
        group = sheet_file[len('bubblingmoon_'):-4]
        for f in frames:
            name = Path(f['file']).stem[len(f'bubblingmoon_{group}_'):]
            dst = root / 'sprites' / group / f'{name}.png'; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy(REF / f['file'], dst)
            manifest.append(dict(group=group, name=name, file=f'sprites/{group}/{name}.png', size_px=f['size'], size_game_px=[f['size'][0] // 4, f['size'][1] // 4],
                                 sheet=sheet_file, box_on_sheet=f['box']))
            index[group].append(f)
    # the index: lists and contact sheets
    (root / 'index').mkdir()
    md = ['# Sprites', '', 'Size is width x height; game pixels are picture pixels divided by 4 (the screen is 480 x 270 game pixels, Pip is 49 tall).', '']
    for g, desc in GROUPS.items():
        md += [f'## {desc}', '', '| sprite | file | picture px | game px |', '|---|---|---|---|']
        md += [f"| {m['name']} | `{m['file'].split('/', 1)[1]}` | {m['size_px'][0]} x {m['size_px'][1]} | {m['size_game_px'][0]} x {m['size_game_px'][1]} |" for m in manifest if m['group'] == g]
        md.append('')
        contact(index[g], REF).save(root / 'index' / f'{g}.png')
    (root / 'sprites' / 'INDEX.md').write_text('\n'.join(md))
    # the backgrounds
    for sheet, folder in BG_NAMES.items():
        for line in C.cut_panels(sheet, root / 'backgrounds' / folder): print(line)
    for p in list((root / 'backgrounds').rglob('*.png')): p.rename(p.with_name(p.name.replace('bubblingmoon_', '').replace('bg_outdoor_1_', '').replace('bg_outdoor_2_', '').replace('bg_station_', '')))
    panels = sorted((root / 'backgrounds').rglob('*.png'))
    bw = 960; sheet = checker(bw, sum(int(Image.open(p).height * bw / Image.open(p).width) + 24 for p in panels)); d = ImageDraw.Draw(sheet); y = 0
    for p in panels:
        im = Image.open(p).convert('RGBA'); im = im.resize((bw, int(im.height * bw / im.width)), Image.LANCZOS)
        d.text((8, y + 6), str(p.relative_to(root / 'backgrounds')), fill=(255, 255, 255)); sheet.paste(im, (0, y + 24), im); y += im.height + 24
    sheet.save(root / 'index' / 'backgrounds.png')
    # the sheets and the prompts
    (root / 'sheets').mkdir()
    for p in sorted(REF.glob('bubblingmoon_*.png')): shutil.copy(p, root / 'sheets' / p.name)
    if (REF / 'prompts').exists(): shutil.copytree(REF / 'prompts', root / 'sheets' / 'prompts')
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    (root / 'README.md').write_text(readme(manifest, GAPS))
    out = Path(out); out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(root.rglob('*')):
            if p.is_file(): z.write(p, p.relative_to(tmp))
    shutil.rmtree(tmp)
    print(f'{out}: {out.stat().st_size / 1e6:.1f} MB, {len(manifest)} sprites')


if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])
