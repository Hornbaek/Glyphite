import asyncio
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 900})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#2d'); await page.wait_for_timeout(1000)
        for res in [1, 2, 3]:
            await page.evaluate(f'setDetail({res})'); await page.evaluate('startSite(1)')
            r = await page.evaluate('''() => { const b = L.body; let t = performance.now(), n = 200;
              for (let i = 0; i < n; i++) { b.a = i * .01; drawLanderArt(b); } const draw = (performance.now() - t) / n;
              t = performance.now(); for (let i = 0; i < n; i++) { for (const k of dynList) dyn[k] = 0; dynList.length = 0; markLanderDyn(b); } const mark = (performance.now() - t) / n;
              return { draw: +draw.toFixed(3), mark: +mark.toFixed(3) }; }''')
            print('RES', res, 'ms per call', r)
        await b.close()
asyncio.run(main())
