#!/usr/bin/env python3
"""The art GALLERY (/art/?game=spacemouse&tab=gallery), in a real browser against the built site (serves dist/ itself): the
tiles of the live versions, the drafts-and-rejected toggle (also for an asset with no approved version, made by editing the index
in flight), an asset's detail (the pictures, the lamp on the lit preview, the version strip, the tree), the compare of two
versions, an imported asset showing the owner's original drawing, the tabs, the link from the game list, and a phone width.
Build first: npm run build.

  python3 tests/art_gallery.py
"""
import json, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else f'  {detail}'))
    if not ok: failures.append(name)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'
G = f'{BASE}/art/?game=spacemouse&tab=gallery'
INDEX = json.loads((ROOT / 'dist/games/spacemouse/art/index.json').read_text())

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/fonts.g*/**', lambda r: r.abort())

    # an extra asset that has only a draft (no approved version), served in the index only
    ghost = json.loads(json.dumps(next(a for a in INDEX['assets'] if a['id'] == 'cheese-crate')))
    ghost.update(id='ghost-lamp', name='Ghost lamp', live=None, versions=[dict(ghost['versions'][2], version='001', parent=None)])
    served = dict(INDEX, assets=INDEX['assets'] + [ghost])
    pg.route('**/games/spacemouse/art/index.json', lambda r: r.fulfill(json=served))

    # ---- the tiles ----
    pg.goto(G); pg.wait_for_selector('.gtile')
    names = pg.eval_on_selector_all('.gtile b', 'bs => bs.map(b => b.textContent)')
    check('one tile per asset that has a live version, grouped by class', len(names) == len([x for x in INDEX['assets'] if x['live']]) and 'Cheese crate' in names and 'Fuel barrel' in names and "Pip's ship" in names and 'Ghost lamp' not in names and pg.locator('.gclass h2').all_text_contents() == ['characters', 'props'], names)
    check('a tile shows the sprite enlarged and at game size', pg.locator('.gtile').first.locator('img').count() == 2)
    tile = pg.locator('.gtile', has_text='Cheese crate')
    check('the tile says how many versions an asset has', '3 versions' in tile.text_content())
    check('the extra versions are counted, hidden by default', 'show drafts and rejected' in pg.text_content('.gtools') and 'with no approved version' in pg.text_content('.gtools'))
    pg.check('#gAll'); pg.wait_for_selector('.gtile:has-text("Ghost lamp")')
    check('show drafts and rejected also lists an asset with no approved version', 'all=1' in pg.url and pg.locator('.gtile', has_text='Ghost lamp').locator('.vbadge.draft').count() == 1)
    pg.uncheck('#gAll'); pg.wait_for_function("!document.body.textContent.includes('Ghost lamp')")

    # ---- an asset ----
    pg.click('.gtile:has-text("Cheese crate")'); pg.wait_for_selector('.vitem')
    check('a tile opens the asset: its address says which', 'asset=cheese-crate' in pg.url)
    check('the detail names the asset and what it is', 'Cheese crate' in pg.text_content('.gback h2') and '12 x 11 px' in pg.text_content('.gback h2') and 'live: 001' in pg.text_content('.gback h2'))
    check('the versions strip hides the rejected version until asked', pg.locator('.vitem').count() == 2 and pg.locator('.vitem b', has_text='002').count() == 0)
    pg.check('#gAll'); pg.wait_for_function("document.querySelectorAll('.vitem').length === 3")
    check('and shows it with its status', pg.locator('.vitem', has_text='002').locator('.vbadge.rejected').count() == 1)
    check('the tree shows 002 and 003 as made from 001', pg.locator('.vtree li').count() == 3 and pg.locator('.vtree li').nth(1).get_attribute('style') == 'margin-left:18px')
    pg.click('.vitem:has-text("003")'); pg.wait_for_function("location.search.includes('v=003')")
    check('a version opens in place: its status and note', pg.locator('.ginfo .vbadge.draft').count() == 1 and 'slat and rivets' in pg.text_content('.ginfo'))
    pg.click('.vitem:has-text("001")'); pg.wait_for_function("location.search.includes('v=001')")

    # the lit preview follows the pointer
    pg.wait_for_function("document.getElementById('litCv') && document.getElementById('litCv').width === 12")
    px = lambda: pg.evaluate("() => { const c = document.getElementById('litCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let l = 0, r = 0; for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const v = d[i] + d[i + 1] + d[i + 2]; if ((i / 4) % c.width < c.width / 2) l += v; else r += v; } return [l, r]; }")
    box = pg.locator('#litCv').bounding_box()
    pg.mouse.move(box['x'] + 1, box['y'] + box['height'] / 2); left = px()
    pg.mouse.move(box['x'] + box['width'] - 1, box['y'] + box['height'] / 2); right = px()
    check('the lamp lights the side it is on (the normal map is read)', left[0] / left[1] > right[0] / right[1] + .01, [left, right])

    # ---- compare ----
    pg.select_option('#cmpA', '002'); pg.select_option('#cmpB', '003'); pg.wait_for_function("document.getElementById('cmpInfo').textContent.includes('12 x 11')")
    diff = pg.text_content('#cmp figure:last-child figcaption')
    n = int(diff.split('(')[1].split(' ')[0])
    check('compare shows both versions and the pixels that differ', pg.locator('#cmp figure').count() == 5 and n > 5, diff)
    pg.select_option('#cmpB', '002'); pg.wait_for_function("document.querySelector('#cmp figure:last-child figcaption').textContent.includes('(0 pixels)')")
    check('a version against itself differs in no pixel', '(0 pixels)' in pg.text_content('#cmp figure:last-child figcaption'))

    # ---- an asset that holds frames: an animation ----
    pg.goto(G); pg.wait_for_selector('.gtile')
    pip = pg.locator('.gtile', has_text='Pip (16 px test)')
    check('an animation has a tile that says it plays and how many frames it has', pip.count() == 1 and '3 frames' in pip.text_content() and 'plays' in pip.text_content(), pip.text_content() if pip.count() else '')
    pip.click(); pg.wait_for_selector('#animCv')
    check('its page names the frames in order and marks the versions that are frames', pg.locator('.ganim .vitem').count() == 3 and pg.locator('.ganim .vitem b').all_text_contents() == ['idle', 'walk1', 'walk2'] and pg.locator('.vitem .livemark', has_text='frame walk1').count() >= 1)
    check('and the head line says frames instead of live', '3 frames' in pg.text_content('.gback h2') and 'live:' not in pg.text_content('.gback h2'))
    seen = set()
    for _ in range(40):
        seen.add(pg.get_attribute('#animCv', 'data-frame')); pg.wait_for_timeout(120)
        if len(seen) == 3: break
    check('the player loops through every frame', seen == {'idle', 'walk1', 'walk2'}, seen)
    pg.select_option('#animFps', '16'); pg.click('#animPlay'); pg.wait_for_timeout(200); stopped = pg.get_attribute('#animCv', 'data-frame'); pg.wait_for_timeout(600)
    check('pause holds a frame', pg.get_attribute('#animCv', 'data-frame') == stopped and 'PLAY' in pg.text_content('#animPlay'))
    check('the canvas is the size of the target', pg.evaluate("(() => { const c = document.getElementById('animCv1'); return [c.width, c.height]; })()") == [14, 16])

    # ---- an imported asset: the owner's original drawing, from ref/ ----
    pg.goto(f'{G}&asset=lockers'); pg.wait_for_selector('.rawimg')
    check('an imported asset shows the owner\'s original drawing', pg.get_attribute('.rawimg', 'src') == '/games/spacemouse/ref/frames/prop_lockers.png' and 'owner' in pg.text_content('.gpics'))
    check('and says it came from the owner\'s sheet', 'prop_lockers.png' in pg.text_content('.ginfo'))
    pg.wait_for_function("document.querySelector('.rawimg').naturalWidth > 0")

    # ---- an address that is not an asset ----
    pg.goto(f'{G}&asset=nope'); pg.wait_for_selector('#gallery .empty')
    check('an unknown asset says so and links back', 'No asset "nope"' in pg.text_content('#gallery .empty') and pg.locator('#gallery .empty a').count() == 1)

    # ---- the page: tabs, the game list, a phone ----
    pg.goto(G); pg.wait_for_selector('.gtile')
    check('both tabs are there, the gallery is the one open', pg.locator('#tabs:not([hidden])').count() == 1 and 'on' in (pg.get_attribute('#tabGallery', 'class') or ''))
    pg.click('#tabRef'); pg.wait_for_selector('.sheet')
    check('the reference sheets tab still shows the owner\'s sheets', pg.locator('.sheet').count() >= 4 and pg.locator('#gallery').is_hidden())
    pg.goto(f'{BASE}/'); pg.wait_for_selector('.card[data-id="spacemouse"]')
    href = pg.get_attribute('.card[data-id="spacemouse"] a:has-text("ART")', 'href')
    check('the game list links its ART button to the gallery', href == '/art/?game=spacemouse&tab=gallery', href)
    pg.goto(f'{BASE}/art/'); pg.wait_for_selector('.games li')
    check('the art index lists the games with what they have', 'assets' in pg.text_content('.games') and 'drawings' in pg.text_content('.games'))
    ph = b.new_page(viewport={'width': 390, 'height': 800}); ph.on('pageerror', lambda e: errs.append(str(e))); ph.route('**/fonts.g*/**', lambda r: r.abort())
    ph.goto(f'{G}&asset=cheese-crate&all=1'); ph.wait_for_selector('.vitem'); ph.wait_for_function("document.querySelectorAll('#cmp figure').length === 5")
    check('on a phone nothing scrolls sideways', ph.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), ph.evaluate('[document.documentElement.scrollWidth, innerWidth]'))
    check('no page errors', not errs, errs)
    b.close()
srv.shutdown()
print('all art gallery checks passed' if not failures else 'FAILED: ' + ', '.join(failures))
raise SystemExit(1 if failures else 0)
