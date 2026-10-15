#!/usr/bin/env python3
"""Make a game's thumbnail for the game list: games/<id>/thumb.png (640 x 400).

  python3 tools/thumbnail.py regolith                  # the title screen
  python3 tools/thumbnail.py regolith --play --steps 150 --keys ArrowUp
  python3 tools/thumbnail.py regolith --eval "startSite(2)"   # set up any scene first

Build first (node tools/glyphite.mjs build). Uses the 2D renderer in headless Chromium, freezes the
loop and takes a 1280 x 800 screenshot, scaled down. Set "thumbnail": "thumb.png" in game.json.
Look at the result before committing it.
"""
import argparse, asyncio, json, pathlib
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('game')
    ap.add_argument('--play', action='store_true', help='start the game first (Glyphite.test.start())')
    ap.add_argument('--steps', type=int, default=90, help='simulation steps before the shot')
    ap.add_argument('--keys', default='', help='comma-separated KeyboardEvent codes held while stepping')
    ap.add_argument('--eval', default='', help='JavaScript to run before stepping')
    ap.add_argument('--wait', type=int, default=1500, help='ms to let the page settle (fonts, title)')
    a = ap.parse_args()
    listing = json.loads((ROOT / 'dist' / 'games.json').read_text())
    entry = next(g for g in listing['games'] if g['id'] == a.game)
    out = ROOT / entry['path'] / 'thumb.png'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(f'file://{ROOT}/dist/games/{a.game}/index.html#2d')
        await page.wait_for_timeout(a.wait)
        if a.play: await page.evaluate('Glyphite.test.start()')
        if a.eval: await page.evaluate(a.eval)
        keys = [k for k in a.keys.split(',') if k]
        await page.evaluate(f'Glyphite.test.step({a.steps}, {json.dumps(keys)})')
        await page.evaluate('Glyphite.test.freeze(); Glyphite.test.render()')
        tmp = ROOT / 'shots' / f'thumb_{a.game}_full.png'
        tmp.parent.mkdir(exist_ok=True)
        await page.screenshot(path=str(tmp))
        await b.close()
    Image.open(tmp).convert('RGB').resize((640, 400), Image.LANCZOS).save(out, optimize=True)
    print(f'wrote {out.relative_to(ROOT)} (full size: {tmp.relative_to(ROOT)})')

asyncio.run(main())
