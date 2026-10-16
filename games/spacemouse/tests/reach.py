#!/usr/bin/env python3
"""Can every sector be finished? Runs the game's own search (games/spacemouse/levelcheck.js, the same one as the web
editor's CHECK button) on every sector: from each place the mouse can stand it tries walks and jumps with the real
controller, never landing on a cable or glass. It reports whether the great cheese, every crumb and every checkpoint can be
reached, and fails if one can't.

  python3 games/spacemouse/tests/reach.py [sector ...] [--res 1] [--tune '{"jumpHeight": 2}']   (build first)
"""
import sys, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist' / 'games' / 'spacemouse' / 'index.html').as_uri()
import argparse
ap = argparse.ArgumentParser(); ap.add_argument('sectors', nargs='*', type=int); ap.add_argument('--res', type=float, default=1); ap.add_argument('--tune', default='')
a = ap.parse_args(); res, tune, sectors = a.res, a.tune, a.sectors

SEARCH = "(n) => GAME.levels.check(n - 1)"   # the search lives in the game (levelcheck.js), shared with the editor's CHECK button

failed = False
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-gpu']); pg = b.new_page(viewport={'width': 900, 'height': 560})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    url = PAGE + (('?tune=' + tune) if tune else '') + '#2d'
    pg.goto(url); pg.wait_for_timeout(600)
    pg.evaluate(f'() => {{ setDetail({res}); Glyphite.test.start(); Glyphite.test.freeze(); }}')
    count = pg.evaluate('() => SECTORS.length')
    for n in sectors or range(1, count + 1):
        r = pg.evaluate(SEARCH, n)
        ok = r['ok']
        failed |= not ok
        name = pg.evaluate(f'() => SECTORS[{n - 1}].name')
        print(f"{'ok  ' if ok else 'FAIL'} sector {n} {name}: great cheese {'reached' if r['goal'] else 'NOT reached'}, "
              f"crumbs {r['crumbs'][0]}/{r['crumbs'][1]}, checkpoints {r['checkpoints'][0]}/{r['checkpoints'][1]} "
              f"({len(r['spots'])} tiles to stand on, {r['ms']} ms)" + ('' if ok else f"  missing (tile x, y): {json.dumps(r['missing'])}"))
    if errs: print('page errors:', errs[:3]); failed = True
    b.close()
sys.exit(1 if failed else 0)
