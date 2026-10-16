#!/usr/bin/env python3
"""Space Mouse mechanics, played headlessly in sector 1: jump height and run speed match the tunables at every detail level,
the mouse eats through a cheese wall, rust gives way under it, catwalks hold it from above and let it drop through,
stomping a cat-bot shorts it out (and touching one from the side does not end well), live cables kill, and the great
cheese clears the sector. Cat-bots are switched off except for the cat-bot checks.

  python3 games/spacemouse/tests/mechanics.py [2d|gl] [res ...]      (build first: node tools/glyphite.mjs build spacemouse)
"""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist' / 'games' / 'spacemouse' / 'index.html').as_uri()
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []

def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {json.dumps(detail)[:300]}' if detail != '' and not ok else ''))
    if not ok: failures.append(name)

# put the mouse with its feet on the floor of tile (tx, ty) (the tile below it is the floor)
SETUP = """
window.tp = (tx, ty) => { const c = MOUSE.ch; c.x = (tx + .5) * SEC.tw; c.y = (ty + 1) * SEC.th * ASPECT; c.vx = c.vy = 0; c.onGround = false; MOUSE.alive = true; setState('play'); updateCamera(0, true); };
window.run = (n, keys) => { for (let i = 0; i < n && state !== 'dead'; i++) Glyphite.test.step(1, keys); return MOUSE; };   // stops when the mouse dies
window.T = () => [MOUSE.ch.x / SEC.tw, MOUSE.ch.y / ASPECT / SEC.th];
"""

def run(mode, res):
    print(f'--- {mode} RES {res}')
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS[mode]); pg = b.new_page(viewport={'width': 1100, 'height': 640})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(PAGE + '#' + mode); pg.wait_for_timeout(600)
        pg.evaluate(f'() => {{ setDetail({res}); Glyphite.test.start(); {SETUP} CATS.forEach(k => k.alive = false); }}')
        # jump: hold for a full jump from the start room floor, measure the apex; a tap goes about half as high
        r = pg.evaluate("""() => { tp(4, 19); run(10, []); const y0 = MOUSE.ch.y; let top = y0;
          for (let i = 0; i < 50; i++) { run(1, ['ArrowUp']); top = Math.min(top, MOUSE.ch.y); }
          run(60, []); const full = (y0 - top) / RES / (MOUSE_H * TUNE.jumpHeight);
          let t2 = y0; run(1, ['ArrowUp']); for (let i = 0; i < 50; i++) { run(1, []); t2 = Math.min(t2, MOUSE.ch.y); }
          run(60, []); return { full, tap: (y0 - t2) / RES / (MOUSE_H * TUNE.jumpHeight), back: MOUSE.ch.y === y0 }; }""")
        check('a held jump rises to the tuned height', abs(r['full'] - 1) < .08, r)
        check('a tapped jump goes much lower', .25 < r['tap'] < .7, r)
        check('lands back on the same floor', r['back'], r)
        r = pg.evaluate("""() => { tp(3, 19); run(30, ['ArrowRight']); const x0 = MOUSE.ch.x; run(30, ['ArrowRight']); return (MOUSE.ch.x - x0) / RES / .5 / (MOUSE_W * TUNE.runSpeed); }""")
        check('runs at the tuned speed', abs(r - 1) < .05, r)
        # cheese wall (tiles 60-62, rows 10-13): walk into it from the left
        r = pg.evaluate("""() => { tp(58, 13); const g0 = grams; run(240, ['ArrowRight']); return { x: T()[0], grams: grams - g0, alive: MOUSE.alive }; }""")
        check('eats through the cheese wall', r['x'] > 63 and r['grams'] > 50 and r['alive'], r)
        # rust floor (tiles 67-73, row 14) gives way into the hall below
        r = pg.evaluate("""() => { tp(70, 13); run(150, []); return { t: T(), ground: MAT_NAME[MOUSE.ch.ground], alive: MOUSE.alive }; }""")
        check('the rusted floor gives way under the mouse', r['t'][1] > 20 and r['alive'], r)
        # catwalks in the shaft (tiles 88-90, row 20): jump up through one from below, stand on it, drop through with down
        r = pg.evaluate("""() => { tp(89, 22); run(20, []); for (let i = 0; i < 40; i++) run(1, ['ArrowUp']); run(40, []);
          const on = { t: T(), ground: MAT_NAME[MOUSE.ch.ground] }; run(30, ['ArrowDown']); run(40, []);
          return { on, after: T(), alive: MOUSE.alive }; }""")
        check('jumps up through a catwalk and stands on it', abs(r['on']['t'][1] - 20) < .05 and r['on']['ground'] == 'catwalk', r)
        check('down drops back through it', r['after'][1] > 22 and r['alive'], r)
        # cat-bot in the hall (tile 82, row 22): from the side it catches the mouse; from above it is stomped
        r = pg.evaluate("""() => { const k = CATS.find(q => q.ch.y / ASPECT / SEC.th > 20); CATS.forEach(q => q.alive = q === k);
          Object.assign(k.ch, { x: SEC.cats[k.id].x, y: SEC.cats[k.id].y, vx: 0, vy: 0 }); k.dir = -1; k.alert = 0;
          tp(0, 22); MOUSE.ch.x = k.ch.x - 9 * RES; run(90, []);
          const side = { alive: MOUSE.alive, reason: MOUSE.reason };
          k.alert = 0; tp(0, 0); MOUSE.ch.x = k.ch.x; MOUSE.ch.y = k.ch.y - k.ch.o.h - 3 * RES; MOUSE.ch.vy = 20 * RES;
          const b0 = bots; run(40, []); return { side, stomped: bots - b0, catAlive: k.alive, alive: MOUSE.alive, vy: MOUSE.ch.vy }; }""")
        check('a cat-bot catches the mouse from the side', not r['side']['alive'] and 'CAT' in r['side']['reason'], r)
        check('landing on a cat-bot shorts it out and the mouse survives', r['stomped'] == 1 and not r['catAlive'] and r['alive'], r)
        # the live cable in the top corridor (tiles 101-103, row 6)
        r = pg.evaluate("""() => { CATS.forEach(q => q.alive = false); tp(98, 6); run(120, ['ArrowRight']); return { alive: MOUSE.alive, reason: MOUSE.reason }; }""")
        check('a live cable kills', not r['alive'] and 'CABLE' in r['reason'], r)
        # the great cheese clears the sector
        r = pg.evaluate("""() => { tp(126, 13); setState('play'); CATS.forEach(k => k.alive = false); run(120, ['ArrowRight']); return { state }; }""")
        check('the great cheese clears the sector', r['state'] in ('cleared', 'won'), r)
        check('no page errors', not errs, errs[:3])
        b.close()

if __name__ == '__main__':
    args = sys.argv[1:]
    modes = [a for a in args if a in ARGS] or ['gl']
    rs = [float(a) for a in args if a not in ARGS] or [1, 2, 3]
    for m in modes:
        for r in rs: run(m, r)
    print('FAILED: ' + ', '.join(failures) if failures else 'all mechanics checks passed')
    sys.exit(1 if failures else 0)
