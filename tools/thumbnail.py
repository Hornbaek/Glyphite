#!/usr/bin/env python3
"""Make a game's thumbnail for the game list: games/<id>/thumb.png (640 x 400).

  python3 tools/thumbnail.py regolith                  # the title screen
  python3 tools/thumbnail.py regolith --play --steps 150 --keys ArrowUp
  python3 tools/thumbnail.py regolith --eval "startSite(2)"   # set up any scene first
  python3 tools/thumbnail.py regolith --play --keys ArrowUp --auto 24 --every 15   # let it pick the frame

Build first (node tools/glyphite.mjs build). Uses the 2D renderer in headless Chromium, freezes the
loop and takes a 1280 x 800 screenshot, scaled down. Set "thumbnail": "thumb.png" in game.json.
Look at the result before committing it.

--auto N plays on instead of stopping at a fixed step: it takes N candidate frames, one every --every steps
(frames before --steps are skipped), scores each for visual interest and keeps the best. The score is the sum
of, each scaled 0..1 across the candidates: how much of the picture is lit, its contrast, its colour, its bright
highlights (flashes, glow), how much it changed since the last candidate, and the particle count. Only frames
in the game's 'play' state count while any exist. The top frames go into a contact sheet in shots/ to look at.
"""
import argparse, asyncio, json, pathlib
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEIGHTS = {'lit': 1.0, 'contrast': 1.0, 'colour': .8, 'bright': .6, 'motion': .6, 'particles': .5}


def frame_stats(im, prev, particles):
    """Raw interest measures of one candidate (a PIL image), before they are scaled against the other candidates."""
    a = np.asarray(im.convert('RGB').resize((320, 200)), dtype=np.float32)
    lum = a @ np.array([.299, .587, .114], dtype=np.float32)
    lit = lum > 40
    return {
        'lit': float(lit.mean()),
        'contrast': float(lum.std()),
        'colour': float((a.max(axis=2) - a.min(axis=2))[lit].mean()) if lit.any() else 0.0,
        'bright': float((lum > 200).mean()),
        'motion': float(np.abs(lum - prev).mean()) if prev is not None else 0.0,
        'particles': float(particles),
        'lum': lum,
    }


def pick_best(stats, weights=WEIGHTS):
    """Scores for a list of frame_stats() dicts: each measure scaled 0..1 across the candidates, then weighted."""
    scores = [0.0] * len(stats)
    for k, w in weights.items():
        v = np.array([s[k] for s in stats], dtype=np.float64)
        span = v.max() - v.min()
        if span > 1e-9:
            for i, x in enumerate((v - v.min()) / span):
                scores[i] += w * x
    return scores

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('game')
    ap.add_argument('--play', action='store_true', help='start the game first (Glyphite.test.start())')
    ap.add_argument('--steps', type=int, default=90, help='simulation steps before the shot')
    ap.add_argument('--keys', default='', help='comma-separated KeyboardEvent codes held while stepping')
    ap.add_argument('--eval', default='', help='JavaScript to run before stepping')
    ap.add_argument('--wait', type=int, default=1500, help='ms to let the page settle (fonts, title)')
    ap.add_argument('--auto', type=int, default=0, help='take this many candidate frames and keep the most interesting')
    ap.add_argument('--every', type=int, default=15, help='with --auto: simulation steps between candidates')
    ap.add_argument('--out', default='', help='write here instead of games/<id>/thumb.png')
    a = ap.parse_args()
    listing = json.loads((ROOT / 'dist' / 'games.json').read_text())
    entry = next(g for g in listing['games'] if g['id'] == a.game)
    out = pathlib.Path(a.out).resolve() if a.out else ROOT / entry['path'] / 'thumb.png'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(f'file://{ROOT}/dist/games/{a.game}/index.html#2d')
        await page.wait_for_timeout(a.wait)
        if a.play: await page.evaluate('Glyphite.test.start()')
        if a.eval: await page.evaluate(a.eval)
        keys = [k for k in a.keys.split(',') if k]
        await page.evaluate(f'Glyphite.test.step({a.steps}, {json.dumps(keys)})')
        tmp = ROOT / 'shots' / f'thumb_{a.game}_full.png'
        tmp.parent.mkdir(exist_ok=True)
        cands = []   # (image, state, particles)
        for i in range(max(1, a.auto)):
            if i: await page.evaluate(f'Glyphite.test.step({a.every}, {json.dumps(keys)})')
            await page.evaluate('Glyphite.test.freeze(); Glyphite.test.render()')
            await page.screenshot(path=str(tmp))
            info = await page.evaluate('({ state: typeof state === "string" ? state : "", particles: typeof P !== "undefined" ? P.n : 0 })')
            cands.append((Image.open(tmp).convert('RGB').copy(), info['state'], info['particles']))
            if a.auto: await page.evaluate('Glyphite.test.unfreeze()')
        await b.close()
    best = cands[0][0]
    if a.auto:
        pool = [i for i, c in enumerate(cands) if c[1] == 'play'] or list(range(len(cands)))
        stats, prev = [], None
        for i in pool:
            st = frame_stats(cands[i][0], prev, cands[i][2]); prev = st['lum']; stats.append(st)
        scores = pick_best(stats)
        order = sorted(range(len(pool)), key=lambda j: -scores[j])
        for rank, j in enumerate(order[:3]):
            s = stats[j]
            print(f"  #{rank + 1}: frame {pool[j] + 1}/{len(cands)}  score {scores[j]:.2f}  lit {s['lit']:.2f}  contrast {s['contrast']:.0f}  colour {s['colour']:.0f}  bright {s['bright']:.3f}  motion {s['motion']:.1f}  particles {s['particles']:.0f}")
        best = cands[pool[order[0]]][0]
        top = [cands[pool[j]][0].resize((320, 200), Image.LANCZOS) for j in order[:6]]
        sheet = Image.new('RGB', (960, 400), (5, 7, 12))
        for k, im in enumerate(top): sheet.paste(im, ((k % 3) * 320, (k // 3) * 200))
        sheet_path = ROOT / 'shots' / f'thumb_{a.game}_candidates.png'
        sheet.save(sheet_path)
        print(f'  best six, best first: {sheet_path.relative_to(ROOT)}')
    best.save(tmp)
    best.resize((640, 400), Image.LANCZOS).save(out, optimize=True)
    print(f'wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} (full size: {tmp.relative_to(ROOT)})')

asyncio.run(main())
