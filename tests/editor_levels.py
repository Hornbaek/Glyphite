#!/usr/bin/env python3
"""The web editor's LEVELS tab, in a real browser against the built site (serves dist/ itself): the maps of a game with a
"levels" legend show up, painting changes the map file's draft (so the CLAUDE tab's patch carries it), undo works, PLAY
THIS MAP and the TEST tool start the preview on that map and tile, CHECK reports the map can be finished, and a map with
the goal walled off is caught.

  python3 tests/editor_levels.py [game id]      (default spacemouse; build first: npm run build)

Screenshots: shots/editor_levels*.png. Exits 1 and prints what failed.
"""
import sys, json, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
GAME = sys.argv[1] if len(sys.argv) > 1 else 'spacemouse'
failures = []

def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {json.dumps(detail)[:400]}' if detail != '' and not ok else ''))
    if not ok: failures.append(name)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'

with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-gpu', '--proxy-bypass-list=<-loopback>'])
    pg = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}/edit/?game={GAME}')
    pg.wait_for_function('() => document.querySelector("#status").textContent.startsWith("running")', timeout=20000)
    check('the LEVELS tab is there for a game with a legend', pg.is_visible('#tab-levels'))
    pg.click('#tab-levels'); pg.wait_for_timeout(400)
    names = pg.eval_on_selector_all('#lvList button', 'bs => bs.map(b => b.textContent)')
    check('every map is listed', len(names) >= 1, names)
    box = pg.eval_on_selector('#lvCanvas', 'c => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }')
    check('the map is drawn', box[2] > 100 and box[3] > 40, box)
    pg.screenshot(path=str(ROOT / 'shots/editor_levels.png'))
    z = pg.evaluate('() => parseInt(document.querySelector("#lvZoom").textContent)')
    path = pg.evaluate('() => [...document.querySelectorAll("#files button")].map(b => b.dataset.p).find(p => p.endsWith("sectors.js"))') or f'games/{GAME}/sectors.js'
    draft = lambda: pg.evaluate(f'() => JSON.parse(localStorage.getItem("glyphite.edit.v1.{GAME}.file:{path}") || "null")')
    # paint a crate with the pen at tile (6, 19) of the first map (inside the start room)
    pg.click('#lvPalette button[data-k="x"]')
    pg.click('#lvTools [data-t="pen"]')
    pg.mouse.click(box[0] + 6.5 * z, box[1] + 19.5 * z)
    d = draft()
    rows = d and d['text'].split('String.raw`\n')[1].split('`')[0].split('\n')
    check('painting writes the map file draft', bool(rows) and rows[19][6] == 'x', rows and rows[19])
    pg.click('#tab-claude'); pg.wait_for_timeout(200)
    prompt = pg.text_content('#promptPreview')
    check('the CLAUDE tab hands the map edit over as a patch', 'sectors.js' in prompt and '```diff' in prompt, prompt[:300])
    pg.click('#tab-levels'); pg.wait_for_timeout(200)
    pg.click('#lvUndo')
    d = draft()
    check('undo puts it back (no draft left)', d is None, d and d['text'][:80])
    # TEST tool: play from a tile in the window room of sector 1
    pg.click('#lvTools [data-t="test"]')
    pg.mouse.click(box[0] + 116.5 * z, box[1] + 12.5 * z)
    pg.wait_for_timeout(2500)
    m = pg.evaluate('() => { const w = document.querySelector("#preview").contentWindow; return w.Glyphite && w.Glyphite.test.probe().game; }')
    check('TEST starts the preview on that map at that tile', m and m['sector'] == 1 and abs(m['mouse']['tx'] - 116.5) < 1.5 and m['mouse']['ty'] <= 14.2, m)
    # PLAY THIS MAP on the second map
    if len(names) > 1:
        pg.click('#lvList button[data-i="1"]'); pg.wait_for_timeout(200)
        pg.click('#lvPlay'); pg.wait_for_timeout(2500)
        m = pg.evaluate('() => document.querySelector("#preview").contentWindow.Glyphite.test.probe().game')
        check('PLAY THIS MAP starts the preview on that map', m and m['sector'] == 2, m)
    # CHECK the first map as it is: it can be finished
    pg.click('#lvList button[data-i="0"]'); pg.wait_for_timeout(200)
    pg.click('#lvCheck')
    pg.wait_for_function('() => /CAN BE FINISHED|CANNOT|NOT EVERYTHING|fix the map|did not answer/.test(document.querySelector("#lvReport").textContent)', timeout=60000)
    rep = pg.text_content('#lvReport')
    check('CHECK says the shipped map can be finished', 'CAN BE FINISHED' in rep and '✗' not in rep, rep)
    pg.screenshot(path=str(ROOT / 'shots/editor_levels_check.png'))
    # wall off the great cheese with hull (a rectangle over its room's entrance) and CHECK again
    pg.click('#lvPalette button[data-k="#"]'); pg.click('#lvTools [data-t="rect"]')
    box = pg.eval_on_selector('#lvCanvas', 'c => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }')
    pg.mouse.move(box[0] + 126.5 * z, box[1] + 2.5 * z); pg.mouse.down(); pg.mouse.move(box[0] + 126.5 * z, box[1] + 13.5 * z, steps=4); pg.mouse.up()
    pg.click('#lvCheck')
    pg.wait_for_function('() => /CAN BE FINISHED|CANNOT|NOT EVERYTHING|fix the map|did not answer/.test(document.querySelector("#lvReport").textContent) && !document.querySelector("#lvCheck").disabled', timeout=60000)
    rep = pg.text_content('#lvReport')
    check('CHECK catches a walled-off goal', 'GOAL CANNOT BE REACHED' in rep, rep)
    pg.screenshot(path=str(ROOT / 'shots/editor_levels_blocked.png'))
    # a second mouse start is refused: the old one moves instead
    pg.click('#lvPalette button[data-k="P"]'); pg.click('#lvTools [data-t="pen"]')
    pg.mouse.click(box[0] + 10.5 * z, box[1] + 19.5 * z)
    d = draft(); txt = d['text'].split('String.raw`\n')[1].split('`')[0]
    check('the mouse start stays one of a kind', txt.count('P') == 1 and txt.split('\n')[19][10] == 'P', txt.count('P'))
    pg.evaluate('() => localStorage.clear()')
    check('no page errors', not errs, errs[:3])
    b.close()
srv.shutdown()
print('FAILED: ' + ', '.join(failures) if failures else 'all level editor checks passed')
sys.exit(1 if failures else 0)
