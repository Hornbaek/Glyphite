#!/usr/bin/env python3
"""Fjordheim on a phone (a Pixel 7: 412 x 915, touch), with real touch events: tap to begin, drag the map to scroll, tap
BUILD and the build menu, tap the map to see where a building would stand and tap there again to build it, tap the
site and [CALL OFF] twice, [?] and [>>] on the top row. No on-screen arrow buttons, and the texts fit; the build menu has
two columns. Screenshots: shots/fj_phone_*.png.
  python3 games/fjordheim/tests/phone.py [renderer]      (needs the build: node tools/glyphite.mjs build fjordheim)"""
import sys
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
    ctx = b.new_context(**p.devices['Pixel 7'])
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000)
    cdp = ctx.new_cdp_session(pg)
    def until(js, ms=5000):
        try: pg.wait_for_function(js, timeout=ms); return True
        except Exception: return False
    steps = lambda n: until(f'frameNo >= {pg.evaluate("frameNo") + n}', 20000)
    box = pg.evaluate('(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()')
    at = lambda fx, fy: (box[0] + fx * box[2], box[1] + fy * box[3])
    def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y} for x, y in pts]})
    def tap(fx, fy): x, y = at(fx, fy); touch('touchStart', [(x, y)]); touch('touchEnd', []); steps(3)
    def drag(f0, f1, n=8):
        (x0, y0), (x1, y1) = at(*f0), at(*f1)
        touch('touchStart', [(x0, y0)])
        for k in range(1, n + 1): touch('touchMove', [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)]); steps(1)
        touch('touchEnd', []); steps(2)
    hud = lambda m: [(m[0] + .5) / pg.evaluate('R.hcols'), (m[1] + .5) / pg.evaluate('R.hrows')]
    spot_of = lambda id: pg.evaluate('(id => { const m = MENU.find(m => m.id === id); return [(m.c0 + m.c1) / 2 - .5, (m.r0 + m.r1) / 2]; })', id)

    steps(10); pg.screenshot(path=str(ROOT / 'shots/fj_phone_title.png'))
    check(pg.evaluate('R.hcols') < 64, f"a narrow HUD ({pg.evaluate('R.hcols')} columns)")
    tap(.5, .5)
    check(until("state === 'play'"), 'a tap begins')
    check(pg.evaluate("Input.pointer") == 'touch', 'the game knows it is a touch screen')
    check(pg.evaluate("(() => { const t = document.getElementById('touch'); return !t || t.hidden || !t.childElementCount; })()"), 'no on-screen arrow buttons')
    steps(30)   # the tap that began the game is not a tap on the map
    check(pg.evaluate('SEL === null && HOME.buildings.length === 0'), 'the tap that began the game did nothing else')
    # drag the map a quarter of the screen to the left: the view moves right by about that much
    c0 = pg.evaluate('[...CAM]'); drag((.7, .5), (.45, .5)); c1 = pg.evaluate('[...CAM]')
    want = .25 * pg.evaluate('R.cols / RES')
    check(abs((c1[0] - c0[0]) - want) < want * .3 and abs(c1[1] - c0[1]) < 2, f'a drag pans the view ({c1[0] - c0[0]:.1f} of {want:.1f} base units)')
    check(pg.evaluate('HOME.buildings.length === 0 && SEL === null'), 'a drag is not a tap')
    # BUILD opens the build menu; tap LONGHOUSE in it
    check(pg.evaluate('!MENU.some(m => m.id === "longhouse")'), 'the build menu starts closed: only the BUILD button')
    tap(*hud(spot_of('build')))
    check(until('BUILDMENU === true'), 'a tap on BUILD opens the build menu')
    steps(2); pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()'); pg.screenshot(path=str(ROOT / 'shots/fj_phone_menu.png')); pg.evaluate('Glyphite.test.unfreeze()')
    check(pg.evaluate('PANELS.every(([c0, r0, c1, r1]) => c1 <= R.hcols && r1 <= R.hrows - 1)'), 'the menu fits the screen, clear of the gesture bar')
    check(pg.evaluate('new Set(MENU.filter(m => BUILDINGS[m.id]).map(m => m.c0)).size') == 2, f"in two columns ({pg.evaluate('R.hcols')} columns wide)")
    tap(*hud(spot_of('longhouse')))
    check(until("SEL === 'longhouse' && !BUILDMENU"), 'a tap on its entry picks the longhouse and closes the menu')
    # tap the map where it fits: the first tap shows it, the second builds it
    spot = pg.evaluate('''(() => { let best = null, bd = 1e9; const s = store();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (placeProblem('longhouse', ...footAt('longhouse', [i, j]))) continue;
        const d = Math.hypot(i - s[0], j - s[1]); if (d < bd) { bd = d; best = [i, j]; } }
      centreOn([best[0], best[1], 1, 1]); return best; })()''')
    steps(3)
    pt = pg.evaluate('(t => { const p = isoToWorld(t[0] + .5, t[1] + .5); return [(p[0] - cam.x) / R.cols, (p[1] - cam.y) / (R.rows * ASPECT)]; })', spot)
    tap(*pt)
    check(pg.evaluate('!!PEND && HOME.buildings.length === 0'), 'the first tap on the map shows where it would stand')
    pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()'); pg.screenshot(path=str(ROOT / 'shots/fj_phone_place.png')); pg.evaluate('Glyphite.test.unfreeze()')
    tap(*pt)
    check(until("HOME.buildings.some(b => b.type === 'longhouse')"), 'a second tap there builds it')
    check(pg.evaluate('SEL === null && PEND === null'), 'and the choice is done')
    # a tap on the site opens its panel (on its drawing, where nobody walks in front of it); [CALL OFF] asks, then does it
    pt = pg.evaluate('''(() => { const b = HOME.buildings[0];
      for (let v = b.j; v < b.j + b.h; v++) for (let u = b.i; u < b.i + b.w; u++) { const p = isoToWorld(u + .5, v + .5), a = [(p[0] - cam.x) / R.cols, (p[1] - cam.y) / (R.rows * ASPECT)];
        const h = hoverAt(a); if (h && h.building === b) return a; } })()''')
    tap(*pt)
    check(until("PICK && PICK.type === 'longhouse'"), 'a tap on the site opens its panel')
    steps(2); pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()'); pg.screenshot(path=str(ROOT / 'shots/fj_phone_panel.png')); pg.evaluate('Glyphite.test.unfreeze()')
    tap(*hud(spot_of('raze'))); check(until('RAZE === PICK'), '[CALL OFF] asks first')
    tap(*hud(spot_of('raze'))); check(until('!HOME.buildings.length && PICK === null'), 'a second tap calls it off')
    check(pg.evaluate('HOME.stock.wood === 12 && HOME.stock.stone === 4'), 'and its cost comes back')
    # the top row: [?] opens the help, any tap closes it; [>>] runs time faster
    help_ = pg.evaluate('(() => { const m = MENU.find(m => m.id === "help"); return [m.c0 + 1, m.r0]; })()')
    tap(*hud(help_)); check(until('HELP === true'), '[?] opens the help')
    pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()'); pg.screenshot(path=str(ROOT / 'shots/fj_phone_help.png')); pg.evaluate('Glyphite.test.unfreeze()')
    tap(.5, .5); check(until('HELP === false'), 'a tap closes it')
    fast = pg.evaluate('(() => { const m = MENU.find(m => m.id === "fast"); return [m.c0 + 2, m.r0]; })()')
    tap(*hud(fast)); check(until('FAST === 3'), '[>>] runs time three times as fast')
    pg.evaluate('Glyphite.test.freeze(); Glyphite.test.render()'); pg.screenshot(path=str(ROOT / 'shots/fj_phone_play.png'))
    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('FAIL: ' + ' | '.join(fail) if fail else 'OK')
sys.exit(1 if fail else 0)
