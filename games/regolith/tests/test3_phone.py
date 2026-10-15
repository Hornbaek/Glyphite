import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
URL=f'file://{ROOT}/dist/games/regolith/index.html'; OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(1000)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        await page.close()
        # phone title + play
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ph.goto(URL); await ph.wait_for_timeout(1500)
        await ph.screenshot(path=OUT+'phone_title.png')
        await ph.tap('#screen'); await ph.wait_for_timeout(2500)
        await ph.screenshot(path=OUT+'phone_play.png')
        print('PHONE', await ph.evaluate('({cols:R.cols, rows:R.rows, cw:R.cw, touch: !document.getElementById("touch").hidden})'))
        await b.close()
asyncio.run(main())
