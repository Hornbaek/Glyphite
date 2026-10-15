#!/usr/bin/env python3
"""Smoke test for any Glyphite game: it loads, starts, runs and draws without page errors.

  python3 tests/smoke.py regolith            # one game (build first: node tools/glyphite.mjs build)
  python3 tests/smoke.py --all               # every game in dist/games.json, templates included
  python3 tests/smoke.py mygame --renderers 2d --res 1,2,3 --steps 240

For each game and renderer it opens dist/games/<id>/index.html, checks the title screen, calls
Glyphite.test.start(), steps the simulation (holding the keys listed in game.json "smoke.keys",
default Up / Right / Space), switches detail levels, and saves a screenshot of the frozen frame to
shots/smoke_<id>_<renderer>.png. It prints one JSON line per run and exits 1 on any failure.
Look at the screenshots: passing here means "runs", not "looks right".
"""
import argparse, asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLAGS = {'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], '2d': ['--disable-gpu']}


async def run_one(p, gid, renderer, res_levels, steps, keys):
    browser = await p.chromium.launch(args=FLAGS[renderer])
    page = await browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' and 'fonts.g' not in m.text else None)
    out = {'game': gid, 'renderer': renderer, 'ok': False}
    try:
        await page.goto(f'file://{ROOT}/dist/games/{gid}/index.html#{renderer}')
        await page.wait_for_timeout(1200)
        title = await page.evaluate('Glyphite.test.probe()')
        out['title'] = {k: title[k] for k in ('state', 'renderer', 'cols', 'rows', 'world')}
        await page.evaluate('Glyphite.test.start()')
        third = max(1, steps // 3)
        await page.evaluate(f'Glyphite.test.step({third})')
        for k in keys:   # hold each key for a while, then tap it
            await page.evaluate(f'Glyphite.test.step({third}, {json.dumps([k])})')
            await page.evaluate(f'Glyphite.test.press({json.dumps(k)})')
        probe = await page.evaluate(f'Glyphite.test.step({third})')
        out['play'] = {k: probe[k] for k in ('state', 'frame', 'particles', 'chunks')}
        out['game_probe'] = probe.get('game')
        for r in res_levels:   # every detail level rebuilds the world; it must survive that
            await page.evaluate(f'setDetail({r})')
            await page.evaluate('Glyphite.test.start(); Glyphite.test.step(30)')
        await page.evaluate('setDetail(2); Glyphite.test.start(); Glyphite.test.step(90)')
        await page.evaluate('Glyphite.test.freeze(); Glyphite.test.render()')
        (ROOT / 'shots').mkdir(exist_ok=True)
        shot = ROOT / 'shots' / f'smoke_{gid}_{renderer}.png'
        await page.screenshot(path=str(shot))
        out['shot'] = str(shot.relative_to(ROOT))
        problems = []
        if out['title']['renderer'] != renderer: problems.append(f"renderer is {out['title']['renderer']}")
        if probe['frame'] <= title['frame']: problems.append('the simulation did not advance')
        out['problems'] = problems + errors[:5]
        out['ok'] = not problems and not errors
    except Exception as e:   # a missing Glyphite object, a timeout...
        out['problems'] = [f'{type(e).__name__}: {e}'] + errors[:5]
    await browser.close()
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('games', nargs='*')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--renderers', default='2d,gl')
    ap.add_argument('--res', default='1,3')
    ap.add_argument('--steps', type=int, default=180)
    a = ap.parse_args()
    listing = json.loads((ROOT / 'dist' / 'games.json').read_text())
    ids = [g['id'] for g in listing['games']] if a.all or not a.games else a.games
    known = {g['id']: g for g in listing['games']}
    for gid in ids:
        if gid not in known: sys.exit(f'no built game "{gid}" (run: node tools/glyphite.mjs build)')
    failed = 0
    async with async_playwright() as p:
        for gid in ids:
            manifest = json.loads((ROOT / known[gid]['path'] / 'game.json').read_text())
            keys = manifest.get('smoke', {}).get('keys', ['ArrowUp', 'ArrowRight', 'Space'])
            for r in a.renderers.split(','):
                res = await run_one(p, gid, r, [float(x) for x in a.res.split(',') if x], a.steps, keys)
                print(json.dumps(res), flush=True)
                failed += not res['ok']
    print(f'{"FAIL" if failed else "PASS"}: {failed} failing run(s)')
    sys.exit(1 if failed else 0)

asyncio.run(main())
