#!/usr/bin/env python3
"""Space Whiskers: the Bubbling Moon, art still needed (round 2): one zip for the owner's Godot level.

  python3 games/spacewhiskers/tools/pack_moon2.py out.zip

  README.md, STATUS.md   what is in it, the scale, and every line of the owner's "art still needed" list: done, partly done or not done
  sprites/<group>/       the same layout as the first pack, so tools/prep_moon_assets.py takes it: the redrawn sprites keep their old names (terrain/paws-a, ...);
                         new groups: pipeslide, missclou, cat, pip, ending, scrapbook, ground, hall, anim
  backgrounds/           outdoor (middle-plain-large, near-pipeline, reflected-sky), station (arrival-hall, tank-room, scaffold-hall, deep-hall-2)
  audio/                 sfx/, music/, stinger/ (WAV 44.1 kHz 16-bit, loops also as OGG), the songs they were written as (audio/songs/), manifest.json, INDEX.md
  index/                 contact sheets with the names, the size drawn and the size asked
  manifest.json          every sprite: group, name, file, size drawn, size asked, factor, sheet
Cut the sprites first with tools/cut_sheets.py --round2 and prepare the sounds with tools/sounds_prep.py. The sheets themselves stay in ref/ (not in the zip).
"""
import json, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cut_sheets as C   # noqa: E402

GAME = C.GAME; REF = C.REF; AUDIO = GAME / 'audio'
SKIP = {'missclou_old', 'pipeslide_take1'}   # kept in ref/frames, not delivered: a mouse in a cat suit, and slide pieces that came out too small
DESPILL = {'fg_outdoor/mist-a', 'fg_outdoor/mist-b', 'fg_outdoor/milk-fog', 'fg_outdoor/dust-drift', 'fg_station/steam-a', 'fg_station/steam-b', 'fg_station/dust-beam', 'fg_station/milk-haze'}
BG = {'bg_outdoor': 'outdoor', 'bg_station_a': 'station', 'bg_station_b': 'station'}


def asked_sizes():
    """(group, name) -> (w, h) in art pixels as the sheet prompts asked for them: the "(w x h)" of an item, else of its row"""
    js = subprocess.run(['node', '-e', "import('./games/spacewhiskers/tools/sheets2.mjs').then(m=>console.log(JSON.stringify(m.SHEETS2)))"], capture_output=True, text=True, cwd=GAME.parent.parent)
    sheets = json.loads(js.stdout); out = {}
    for s in sheets.values():
        for r in s.get('rows', []):
            row = re.findall(r'(\d+) x (\d+)(?: each)?', r['head'])
            for name, desc in r['items']:
                m = re.findall(r'\((?:about )?(\d+) x (\d+)\)', desc) or re.findall(r'(?:, |^)(\d+) x (\d+)\b', desc)
                if m: out[(r['group'], name)] = tuple(map(int, m[-1]))
                elif row: out[(r['group'], name)] = tuple(map(int, row[-1]))
    return out


def checker(w, h, s=16):
    im = Image.new('RGB', (w, h), (58, 58, 66)); d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2: d.rectangle([x, y, x + s - 1, y + s - 1], fill=(74, 74, 84))
    return im


def contact(rows, root):
    CW, CH, COLS = 300, 250, 6
    n = (len(rows) + COLS - 1) // COLS
    im = checker(COLS * CW, n * CH); d = ImageDraw.Draw(im)
    for k, m in enumerate(rows):
        sp = Image.open(root / m['file']).convert('RGBA')
        sc = min((CW - 20) / sp.width, (CH - 54) / sp.height, 1.0)
        if sc < 1: sp = sp.resize((max(1, int(sp.width * sc)), max(1, int(sp.height * sc))), Image.LANCZOS)
        x, y = (k % COLS) * CW, (k // COLS) * CH
        im.paste(sp, (x + (CW - sp.width) // 2, y + (CH - 44 - sp.height) // 2 + 4), sp)
        d.text((x + 8, y + CH - 34), f"{m['name']}  {m['size_game_px'][0]}x{m['size_game_px'][1]}" + (f" (asked {m['asked_game_px'][0]}x{m['asked_game_px'][1]})" if m['asked_game_px'] else ''), fill=(255, 255, 255))
    return im


def despill(path):
    """the green ground bleeds a lime tint into pale soft pieces: pull green down to the bigger of red and blue (only where it is the strongest channel)"""
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    g = np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2])); a[..., 1] = np.where(a[..., 3] > 0, g, a[..., 1])
    Image.fromarray(a.astype(np.uint8)).save(path)


def reflected_sky(dst):
    """a glossy crust mirrors the sky: the bottom 108 game pixels of round 1's sky, flipped upside down, washed toward milk white, fading out downwards in steps"""
    sky = Image.open(REF / 'bubblingmoon_bg_outdoor_1.png').convert('RGB').crop((0, 648, 3840, 1080))
    a = np.asarray(sky.transpose(Image.FLIP_TOP_BOTTOM)).astype(float)
    wash = np.array([226, 222, 240.]); a = a * 0.62 + wash * 0.38
    alpha = np.zeros((432, 3840), np.uint8)
    for k, v in enumerate([255, 220, 180, 140, 100, 62, 30, 10]): alpha[k * 54:(k + 1) * 54] = v
    rgba = np.dstack([a.clip(0, 255).astype(np.uint8), alpha]); Image.fromarray(rgba).save(dst)


STATUS = """# Art still needed: what is done, what is partly done, what is not

Every line of your list, in order. **done** = the sprite is in the pack under that name; **partly** = something is there but not all of it, or not what you asked; **not done** = it is not here.
All sizes below are art pixels (one art pixel = a 4 x 4 block of picture pixels), as in `sprites/INDEX.md`.

## First, three things that apply to everything

1. **The model draws bigger than it is asked to.** I asked for your sizes, but the pictures came out larger (Miss Clou stands about 214 art pixels tall, Pip 49; the round-2 ladder is 49 x 91 where the first one is 21 x 57). I did **not**
   resample: the pack lists the size drawn, the size asked and the factor for every sprite (`sprites/INDEX.md`, `manifest.json`), so your prep step can snap them and scale them to the size you want. Where a sprite is cut in a family
   (the pipe slide, Miss Clou) its pieces are drawn at the same scale as each other, except where noted.
2. **The pixels are not on a perfect 4 x 4 grid** (as in the first pack): the Pixel Snapper step still has to put them on the grid and the palette.
3. **I could not listen to any sound**, and I did not have your Miss Clou sheet as a file (only what I could see of it): see below.

## 1. Missing from the pack: done

- `terrain/crater-cap-l` (and `crater-cap-r`, drawn too): done.
- `station/map-piece-2`: done, drawn as a torn blueprint piece of its own (not a flipped piece 1). It came out wide: 133 x 73, where piece 1 is 42 x 43.
- `station/pump-housing`: done: a squat canister with a ring of bolts, a valve wheel and a paw plate. Also `pump-housing-loose` (tilted, bolts floating) and `hiccup-lamp-off`.

## 2. Pink or damaged, redrawn

- `terrain/paws-a, paws-b, paws-c`: done, grey-brown (two prints each).
- `fg_outdoor/mist-a, mist-b, milk-fog, dust-drift` and `fg_station/steam-a, steam-b, dust-beam, milk-haze`: done, pale lavender, cream and white. They came out with a lime tint where the green ground bled into them, which I pulled out in the pack
  (the files in `ref/frames/` are as cut); **`dust-beam` is the weak one**: the green ground ate most of it, what is left is a ragged olive-yellow slab (88 x 45, where 80 x 200 was asked): treat it as not done. **Look at the others too.**
- Curds: the **white curds** are `milk/curd-white, curd-squash-white, curd-stretch-white, curd-tilt-l-white, curd-tilt-r-white, curd-sail-white, curd-small-white, curd-chunk-white`. The rosy ones are not touched: pick which you want.
- Ladders and rope fence: redrawn clean: `station/ladder`, `station/main-ladder`, `milk/short-ladder` (a wooden fence-like piece: it came out as a gate, not a ladder, **check it**), `milk/rope-fence`.

## 3. Needed by the level

- **Pipe slide pieces at Pip's size: partly.** `pipeslide/straight` (tiles end to end), `end-left`, `end-right` (spits, with a drip), `tee-up`, `tee-down`: clear inside about **52 art pixels** tall, a little under the 54 you asked for (Pip is 49).
  `pipeslide/shaft` (tiles), `corner-up`, `corner-down` and `flow-1..4` come from a second try and are about **1.2 times bigger** than the straight piece (clear inside 53-56): scale the first set up by 1.1-1.2 or the second down to match.
  The glass is **not see-through**: tube and milk are one opaque picture; to let Pip show inside, draw him over it and draw the glass highlights over him, or tell me and I will draw a glass-only layer.
- **Miss Clou: done, with a caveat.** `missclou/stand, cool, startled, hover-1, hover-2` (booster flame), `box-open-cat`, `box-closed-cat`, `box-empty`. She is drawn from my reading of your character sheet (orange tabby, white and orange suit,
  cyan chest gauge, pointed ears, green eyes, ion-booster pack, bubble helmet, no cape), **not from the sheet itself**: it was not on disk. Please put the original in `games/spacewhiskers/ref/` and I will match her to it.
- **The helmeted cat on the pump trolley: done.** `cat/trolley`, `helmet-asleep-1`, `helmet-asleep-2` (breathing), `helmet` (cracked open), `freed` (sitting up, surprised).
- **Scrapbook: done.** `scrapbook/polaroid-frame`, the nine photos (`photo-reflection, photo-curd-sail, photo-milkyway-top, photo-missclou-box, photo-plaque, photo-old-ceremony, photo-pipe-map, photo-new-bubble, photo-blank`),
  `camera-icon`, `map-page`, HUD icons `hud-photo-icon, hud-map-icon, hud-camera-icon`. (The cat in `photo-missclou-box` is a ginger tabby in a box: it does not wear the suit, as a photo of her in the box should not.)
- **Ground: done.** `ground/cap-left, cap-right, pit-wall-crust-l/r, pit-wall-cheese-l/r, fill-a..d` (four that do not repeat), `milk-pool-1..3` (three wave frames). The pool came out 281 x 44, about 2.3 times your 123 x 20 (the usual oversize, see above), and a little different in each frame (276 to 281 wide).
- **Pump hall interior: done.** `hall/floor-tile` (+ `floor-end-l`, `floor-end-r`), `ceiling-girder`, `ceiling-pipes`, `wall-partition` (+ `wall-partition-top`), `ladder`, `door-frame`, `door-frame-tall`, `exterior-wall` (zone D to E), `entrance-big` ("PUMP No. 1").
- **Tall pipeline support leg: done.** `station/main-support-tall`.
- **Giant bubble: done.** `milk/bubble-giant`, drawn with finer pixels so it does not look chunky when scaled.

## 4. Animation

- **Bubble swell: partly.** `anim/bubble-swell-1..7`: seven steps, not eight (the model skipped step 5). Soft glow `anim/bubble-glow-s, -m, -l` (the large one has two tiny white ticks under it), crumb bubble `anim/bubble-crumb-1..3` and `bubble-crumb-pop`.
- **Fan: done.** `anim/fan-spin-1..4`, `gust-1..3`.
- **Curd: done.** `anim/curd-landed-1..3`, `curd-wheel-1..2` (the wheel on top).
- **Valves: partly.** `anim/wheel-red-lit, wheel-blue-lit, wheel-yellow-lit` (one lit paw each, **not** a count of 1 to 3), `wheel-<colour>-turn-1..3` for all three colours, `geyser-1..5` (puff and burst), `drain-wheel-1..3`.
- **Pump: done.** `anim/pump-hiccup-1..3`, `pump-off` (dark lamp), `pump-sigh-1..5` (the long steam, then still), `housing-loose-1..3`. Bolting it on the rocket: `ending/bolt-1..3`, `rocket`, `rocket-tank`.
- **Holes, tunnel crawl: partly.** `pip/crawl-1..4` and `pop-out-1..2`. Pip is drawn on hands and knees with the cape; the tunnel is not a picture: let the wall hide him. His size is not matched to your 49-pixel Pip.
- **Milk streaks flowing inside the pipe: done.** `pipeslide/flow-1..4` (they loop).
- **Thin crust: done.** `anim/crust-crack-1..4`, `crust-fall-1..2`.
- **Ending: done.** `ending/rocket, rocket-tank, bolt-1..3` and `anim/bubble-rise-1..4` (the one new bubble).

## 5. Backgrounds

- **Second, larger pumping-station version: done.** `backgrounds/outdoor/middle-plain-large` (a crane, three tanks, a stack, the pipeline on both sides), keyed on green: for zones D and E.
- **Glossy crust mirroring the sky: made, not drawn.** `backgrounds/outdoor/reflected-sky`: the bottom of the first sky, flipped, washed and faded in steps, 3840 x 432 with transparency. It will want a look.
- **Interior back-wall variants: done.** `backgrounds/station/arrival-hall` (a bulletin board, a clock, a locker, a window on the moon), `tank-room` (three tanks, pipes, gauges), `scaffold-hall` (scaffolds, ladders, a window), `deep-hall-2` (gears, a crane, tanks; keyed). Also `backgrounds/outdoor/near-pipeline`.
  The edges of the layers still do not meet exactly (the sky's did): blend them to repeat sideways.

## Sounds and music (you asked in the middle)

`audio/` has what Replicate (Stable Audio 2.5) made, **46 sound effects**, and music I wrote as songs for the repository's own sampler (`audio/music/`, with the songs in `audio/songs/`): the moon theme (D Dorian, 80 BPM: one bar is the 3.0 s hiccup,
16 bars, loops) and the quiet music for the ending, and three short stingers. **No-one has listened to any of it**: `audio/INDEX.md` has the lengths, peaks and levels, which only show nothing is clipped or silent.
**Missing, because the Replicate credit ran out** (HTTP 402): `door-open, fan-spin-loop, housing-loose, great-cheese, hole-crawl`, the three ambiences (`moon-ambience, station-hum, crater-echo`), and the music I had planned for
`pipeline-theme`, `pump-hall-theme` and `miss-clou-jazz`. Add credit at replicate.com and `node games/spacewhiskers/tools/sounds.mjs` makes the rest (it skips what exists); the sampler music is no substitute for the
API's, it is a different thing: a SNES-style tune.
"""


def main(out):
    m2 = json.loads((REF / 'frames_moon2.json').read_text()); asked = asked_sizes()
    tmp = Path(tempfile.mkdtemp(prefix='moonpack2_')); root = tmp / 'bubbling_moon_pack_2'; root.mkdir(parents=True)
    manifest = []
    for sheet_file, frames in m2.items():
        sheet = sheet_file[len('bubblingmoon2_'):-4]
        for f in frames:
            stem = Path(f['file']).stem[len('bubblingmoon2_'):]
            # the file is bubblingmoon2_<group>_<name>.png, and a group may hold a "_"
            group = next((g for g in ('missclou_old', 'pipeslide_take1', 'fg_outdoor', 'fg_station') if stem.startswith(g + '_')), stem.split('_', 1)[0])
            name = stem[len(group) + 1:]
            if group in SKIP: continue
            dst = root / 'sprites' / group / f'{name}.png'; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy(REF / f['file'], dst)
            if f'{group}/{name}' in DESPILL: despill(dst)
            a = asked.get((group, name)); sz = [f['size'][0] // 4, f['size'][1] // 4]
            manifest.append(dict(group=group, name=name, file=f'sprites/{group}/{name}.png', size_px=f['size'], size_game_px=sz, asked_game_px=list(a) if a else None,
                                 factor_to_asked=round(a[1] / sz[1], 2) if a and sz[1] else None, sheet=sheet_file, box_on_sheet=f['box']))
    groups = sorted({m['group'] for m in manifest}); (root / 'index').mkdir()
    md = ['# Sprites (round 2)', '', 'Sizes are art pixels (picture pixels / 4). "Asked" is what the prompt asked for; **factor** is asked / drawn by height: multiply by it to get the asked size. Blank = no size was asked.', '']
    for g in groups:
        rows = [m for m in manifest if m['group'] == g]
        md += [f'## {g}', '', '| sprite | file | drawn | asked | factor |', '|---|---|---|---|---|']
        md += [f"| {m['name']} | `{m['file'].split('/', 1)[1]}` | {m['size_game_px'][0]} x {m['size_game_px'][1]} | {'%d x %d' % tuple(m['asked_game_px']) if m['asked_game_px'] else ''} | {m['factor_to_asked'] or ''} |" for m in rows]
        md.append(''); contact([dict(m, name=m['name']) for m in rows], root).save(root / 'index' / f'{g}.png')
    (root / 'sprites' / 'INDEX.md').write_text('\n'.join(md))
    # the backgrounds
    for sheet, folder in BG.items():
        for line in C.cut_panels(sheet, root / 'backgrounds' / folder): print(line)
    for p in list((root / 'backgrounds').rglob('bubblingmoon2_*.png')): p.rename(p.with_name(re.sub(r'^bubblingmoon2_bg_(outdoor|station_[ab])_', '', p.name)))
    (root / 'backgrounds' / 'outdoor').mkdir(parents=True, exist_ok=True); reflected_sky(root / 'backgrounds' / 'outdoor' / 'reflected-sky.png')
    panels = sorted((root / 'backgrounds').rglob('*.png')); bw = 960
    sheet = checker(bw, sum(int(Image.open(p).height * bw / Image.open(p).width) + 24 for p in panels)); d = ImageDraw.Draw(sheet); y = 0
    for p in panels:
        im = Image.open(p).convert('RGBA'); im = im.resize((bw, max(1, int(im.height * bw / im.width))), Image.LANCZOS)
        d.text((8, y + 6), str(p.relative_to(root / 'backgrounds')), fill=(255, 255, 255)); sheet.paste(im, (0, y + 24), im); y += im.height + 24
    sheet.save(root / 'index' / 'backgrounds.png')
    # the sounds
    (root / 'audio').mkdir()
    for g in ('sfx', 'ambience', 'music', 'stinger'):
        if (AUDIO / g).exists(): shutil.copytree(AUDIO / g, root / 'audio' / g)
    for f in ('manifest.json', 'INDEX.md'): shutil.copy(AUDIO / f, root / 'audio' / f)
    (root / 'audio' / 'songs').mkdir()
    for p in (AUDIO / 'songs').glob('*.song.json'): shutil.copy(p, root / 'audio' / 'songs' / p.name)
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    (root / 'STATUS.md').write_text(STATUS)
    (root / 'README.md').write_text(f"""# The Bubbling Moon: art still needed (round 2)

`STATUS.md` is the answer to your list, line by line. Folders: `sprites/<group>/<name>.png` ({len(manifest)} sprites in {len(groups)} groups: {', '.join(groups)}; the same layout and the same names as the first pack, so
`tools/prep_moon_assets.py <pack>` takes it), `backgrounds/` (two screens wide, 3840 picture pixels), `audio/` (sfx, music, stinger; WAV and OGG; `audio/INDEX.md`), `index/` (contact sheets), `manifest.json`.
One art pixel is a 4 x 4 block of picture pixels; Pip is 49 art pixels tall. The sheets they were cut from, and the prompts, are in the repository (`games/spacewhiskers/ref/bubblingmoon2_*.png`, `ref/prompts/`).
""")
    out = Path(out); out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(root.rglob('*')):
            if p.is_file(): z.write(p, p.relative_to(tmp))
    shutil.rmtree(tmp)
    print(f'{out}: {out.stat().st_size / 1e6:.1f} MB, {len(manifest)} sprites')


if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])
