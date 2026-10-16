#!/usr/bin/env python3
"""The 404 game (games/notfound), in a real page: the missing address becomes rock, the lander crashes into it, and Enter
tries again. Run it on the built page, or against a running site with a URL (a missing path on a live Worker):

  python3 tests/notfound.py [2d|gl ...]
  python3 tests/notfound.py --url http://127.0.0.1:8787/some/missing/page

Exits 1 and prints what failed.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'dist' / 'games' / 'notfound' / 'index.html'
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


FALL = "() => { let t = 0; while (state === 'play' && t < 40) { Glyphite.test.step(1, []); t += DT; } return { t, state, probe: GAME.probe() }; }"


def run(url, mode, expect_text=None):
    print(f'--- {mode} {url if url else ""}')
    with sync_playwright() as p:
        kw = {'proxy': {'server': 'direct://', 'bypass': '<-loopback>,localhost,127.0.0.1'}} if url and url.startswith('http://127.') else {}
        b = p.chromium.launch(args=ARGS[mode], **kw)
        pg = b.new_page(viewport={'width': 1100, 'height': 640})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto((url or PAGE.as_uri() + '?path=/projects/old-demo/index.html') + '#' + mode, wait_until='load')
        pg.wait_for_timeout(900)
        a = pg.evaluate('() => GAME.probe()')
        if expect_text:
            check('the missing address is what the page asked for', a['text'] == expect_text, a['text'])
        check('the address is built as rock', a['letters'] > 500, a)
        check('the lander starts alive and fuelled', a['ship']['alive'] and a['ship']['fuel'] == 100)
        r = pg.evaluate(FALL)
        check('left alone it crashes within 10 seconds', r['state'] == 'crashed' and r['t'] < 10, (r['state'], r['t']))
        check('the crash breaks some of the address', r['probe']['rockNow'] < r['probe']['letters'], r['probe'])
        check('the crash gives a reason', bool(r['probe']['ship']['reason']))
        pg.evaluate("() => Glyphite.test.step(150, [])")   # let the debris settle and the message box come up
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(300)
        b2 = pg.evaluate('() => ({ state, probe: GAME.probe() })')
        check('Enter tries again: a new run, a whole address', b2['state'] == 'play' and b2['probe']['ship']['alive'] and b2['probe']['rockNow'] == b2['probe']['letters'], b2)
        # fuel: a long burn lasts a few seconds and then the lander falls anyway
        pg.evaluate("() => { startRun(); }")
        r2 = pg.evaluate("() => { let t = 0; while (state === 'play' && t < 40) { Glyphite.test.step(1, ['ArrowUp']); t += DT; } return { t, probe: GAME.probe() }; }")
        check('holding the burn runs the tank dry, then it still ends', r2['probe']['ship']['fuel'] == 0 and 6 < r2['t'] < 25, r2)
        # a hostile address is only ever drawn as rock, never read as markup
        pg.goto(PAGE.as_uri() + '?path=' + '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E%E2%82%AC' + '#' + mode)
        pg.wait_for_timeout(700)
        h = pg.evaluate('() => ({ text: GAME.probe().text, imgs: document.querySelectorAll("img").length })')
        check('an address with markup and non-ASCII is drawn as plain text', h['imgs'] == 0 and all(32 <= ord(c) <= 126 for c in h['text']), h)
        check('no page errors', not errs, errs[:2])
        b.close()


if __name__ == '__main__':
    argv = sys.argv[1:]
    if argv[:1] == ['--url']:
        from urllib.parse import urlparse
        run(argv[1], '2d', expect_text=urlparse(argv[1]).path if len(urlparse(argv[1]).path) <= 14 else None)
    else:
        for m in argv or ['2d', 'gl']:
            run(None, m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all 404 game checks passed')
    sys.exit(1 if failures else 0)
