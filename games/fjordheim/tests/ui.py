#!/usr/bin/env python3
"""Fjordheim: the controls, with real mouse events in real time. The view must stay put until the mouse moves (it once
drifted into the top-left corner: mouseAim gave [0, 0] before any mouse movement), scroll while the mouse rests on an
edge and stop off it; a click on the build bar picks a building, a click on the map places it, a right click cancels.
  python3 games/fjordheim/tests/ui.py [renderer]      (needs the build: node tools/glyphite.mjs build fjordheim)"""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist/games/fjordheim/index.html').as_uri()
r = sys.argv[1] if len(sys.argv) > 1 else '2d'
fail = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fail.append(what)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000)
    # headless frames are slow and uneven: wait for game steps (frameNo) or for the outcome, never a fixed time
    def until(js, ms=5000):
        try: pg.wait_for_function(js, timeout=ms); return True
        except Exception: return False
    steps = lambda n: until(f'frameNo >= {pg.evaluate("frameNo") + n}', 20000)
    pg.keyboard.press('Enter'); until("state === 'play'")
    cam = lambda: pg.evaluate('[CAM[0], CAM[1]]')
    c0 = cam(); steps(60); c1 = cam()
    check(c0 == c1, f'the view stays put before the mouse moves {c0} → {c1}')
    # the canvas's box, for turning canvas fractions into page points
    box = pg.evaluate('(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()')
    at = lambda fx, fy: (box[0] + fx * box[2], box[1] + fy * box[3])
    pg.mouse.move(*at(.5, .5)); steps(5); c2 = cam()
    pg.mouse.move(*at(.999, .5)); steps(30); c3 = cam()   # half a second at 70 units a second
    check(c3[0] > c2[0] + 20, f'the mouse on the right edge scrolls right {c2} → {c3}')
    pg.mouse.move(*at(.5, .5)); steps(5); c4 = cam(); steps(30); c5 = cam()
    check(c4 == c5, 'off the edge the view stops')
    for _ in range(3): pg.mouse.move(*at(.999, .5)); steps(60)   # far past the map's edge...
    pg.mouse.move(*at(.5, .5)); steps(5); c6 = cam(); pg.mouse.move(*at(.001, .5)); steps(15); c7 = cam()
    check(c7[0] < c6[0], f'...and it scrolls back at once (the view is held at the edge, not run on past it) {c6} → {c7}')
    # the build bar: click [1] LONGHOUSE (its hit box from the HUD layout)
    m = pg.evaluate('(() => { const m = MENU.find(m => m.id === "longhouse"); return [(m.c0 + 2) / R.hcols, (m.r + .5) / R.hrows]; })()')
    pg.mouse.click(*at(*m))
    check(until("SEL === 'longhouse'"), 'a click on the build bar picks the longhouse')
    pg.mouse.click(*at(.5, .5), button='right')
    check(until('SEL === null'), 'a right click cancels')
    # pick it again, then click on the map where it fits: the nearest good spot to the camp, as a canvas point
    pg.keyboard.press('Digit1'); until("SEL === 'longhouse'")
    spot = pg.evaluate('''(() => { let best = null, bd = 1e9; const s = store();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = footAt('longhouse', [i, j]); if (placeProblem('longhouse', ...t)) continue;
        const d = Math.hypot(i - s[0], j - s[1]); if (d < bd) { bd = d; best = [i, j]; } }
      centreOn([best[0], best[1], 1, 1]); return best; })()''')
    steps(5)
    pt = pg.evaluate('(t => { const p = isoToWorld(t[0] + .5, t[1] + .5); return [(p[0] - cam.x) / R.cols, (p[1] - cam.y) / (R.rows * ASPECT)]; })', spot)
    pg.mouse.move(*at(*pt)); steps(2)
    check(pg.evaluate('(() => { const t = isoPick(pointer()); return !!t && t[0] === %d && t[1] === %d; })()' % tuple(spot)), f'the tile under the mouse is the one aimed at {spot}')
    pg.mouse.click(*at(*pt))
    check(until("HOME.buildings.some(b => b.type === 'longhouse')"), 'a click on the map places the longhouse')
    g = pg.evaluate('Glyphite.test.probe().game')
    check(g['stock']['wood'] == 4 and g['stock']['stone'] == 0, f"its cost is paid {g['stock']}")
    steps(60)   # a game second: jobs are handed out twice a second
    check(pg.evaluate("FOLK.some(p => p.job && p.job.type === 'build')"), 'someone goes to build it')
    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('FAIL: ' + ' | '.join(fail) if fail else 'OK')
sys.exit(1 if fail else 0)
