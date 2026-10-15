import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#gl'); await page.wait_for_timeout(1000)
        await page.evaluate('setDetail(2)'); await page.wait_for_timeout(200)
        await page.evaluate('''(() => { startSite(7); const p = LEVEL.pads[1]; const b = L.body; b.x = (p.x0+p.x1)/2 - 70*RES; b.y = p.row*ASPECT - 26*RES; b.vx = 0; b.vy = 0; updateCamera(0,true); })()''')
        await page.wait_for_timeout(700)
        await page.screenshot(path=OUT+'spot2_dark.png')
        await page.keyboard.press('KeyL'); await page.wait_for_timeout(300)
        await page.screenshot(path=OUT+'spot2_dark_lightsoff.png')
        print('ERR', errs)
        await b.close()
asyncio.run(main())
