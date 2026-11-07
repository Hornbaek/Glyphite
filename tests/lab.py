#!/usr/bin/env python3
"""The PIXEL LAB page (/lab/), in a real browser against the built site (serves dist/ itself): pick a drawing from a game's
reference art, snap it with a given pixel size (Pixel Snapper in WebAssembly), make its normal map, move the lamp over the
lit preview, and get a prompt with the exact commands. Build first: npm run build.

  python3 tests/lab.py
"""
import json, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
failures = []

def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {json.dumps(detail)[:400]}' if detail != '' and not ok else ''))
    if not ok: failures.append(name)

class Quiet(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.mjs': 'text/javascript'}
    def log_message(self, *a): pass

srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}/lab/')
    pg.wait_for_function("() => document.querySelectorAll('#game option').length > 1")
    games = pg.eval_on_selector_all('#game option', 'os => os.map(o => o.value)')
    check('lists the games with reference art', 'spacemouse' in games, games)
    pg.select_option('#game', 'spacemouse')
    pg.wait_for_function("() => document.querySelectorAll('#frame option').length > 10")
    pg.fill('#pixelSize', '4'); pg.fill('#colors', '12')   # the cat-bot sheet: 4 sheet pixels per art pixel
    pg.select_option('#frame', 'frames/cat_walk1.png')
    pg.wait_for_function("() => /art pixels/.test(document.querySelector('#snapInfo').textContent)", timeout=20000)
    info = pg.text_content('#snapInfo')
    w, h = [int(v) for v in info.split(' art pixels')[0].split(' x ')]
    check('snaps the 218 x 144 drawing to about 54 x 36 art pixels', 50 <= w <= 58 and 32 <= h <= 40, info)
    check('the snapped picture can be downloaded', not pg.is_hidden('#snapDl'))
    pg.wait_for_function("() => document.querySelector('#litPic canvas') && document.querySelector('#nrmPic canvas')")
    check('makes a normal map and a lit preview', pg.evaluate("() => document.querySelector('#nrmPic canvas').width") == w)
    # the lamp on the left, then on the right: the lit picture changes
    # how much brighter the right half of the lit picture is than its left half
    lit = lambda: pg.evaluate("() => { const c = document.querySelector('#litPic canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let l = 0, r = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if ((i / 4) % c.width < c.width / 2) l += v; else r += v; } return (r - l) / (r + l); }")
    pg.locator('#litPic').scroll_into_view_if_needed(); box = pg.locator('#litPic canvas').bounding_box()
    pg.mouse.move(box['x'] + 2, box['y'] + box['height'] / 2); left = lit()
    pg.mouse.move(box['x'] + box['width'] - 2, box['y'] + box['height'] / 2); right = lit()
    check('moving the lamp lights the other side', right > left + .01, [left, right])
    pg.check('#flat')
    pg.mouse.move(box['x'] + 2, box['y'] + box['height'] / 2); flat_l = lit()
    pg.mouse.move(box['x'] + box['width'] - 2, box['y'] + box['height'] / 2); flat_r = lit()
    check('compare flat: without normals the lamp makes no difference', flat_l == flat_r, [flat_l, flat_r])
    pg.uncheck('#flat')
    prompt = pg.text_content('#prompt')
    check('the prompt names the exact commands and settings',
          'node tools/snap.mjs games/spacemouse/ref/frames/cat_walk1.png' in prompt and '--pixel-size 4' in prompt and '--colors 12' in prompt
          and 'node tools/normalmap.mjs' in prompt and '--bevel 3' in prompt, prompt)
    pg.evaluate("() => { const r = document.querySelector('#bevel'); r.value = 4; r.dispatchEvent(new Event('input')); }")
    pg.wait_for_function("() => document.querySelector('#prompt').textContent.includes('--bevel 4')", timeout=5000)
    check('a new bevel goes into the prompt', '--bevel 4' in pg.text_content('#prompt'))
    check('no page errors', not errs, errs)
    b.close()
srv.shutdown()
print('all pixel lab checks passed' if not failures else 'FAILED: ' + ', '.join(failures))
raise SystemExit(1 if failures else 0)
