#!/usr/bin/env python3
"""Fjordheim: load the built page, start, run a while, screenshot (2D and GL) → shots/fj_<renderer>_<n>.png.
  python3 games/fjordheim/tests/look.py [steps] [res]"""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist/games/fjordheim/index.html').as_uri()
steps = int(sys.argv[1]) if len(sys.argv) > 1 else 300
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for r in ('gl', '2d'):
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000); pg.wait_for_timeout(500)
        if len(sys.argv) > 2: pg.evaluate(f'setDetail({sys.argv[2]})')
        pg.evaluate('Glyphite.test.start()')
        pr = pg.evaluate(f'Glyphite.test.step({steps})')
        pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()')
        pg.screenshot(path=str(ROOT / f'shots/fj_{r}.png'))
        print(r, json.dumps({k: pr[k] for k in ('state', 'frame', 'renderer', 'cols', 'rows', 'perfMs')}), json.dumps(pr['game'])[:600], 'errors:', errs[:3])
    b.close()
