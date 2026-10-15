import asyncio
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#gl'); await page.wait_for_timeout(1500)
        await page.evaluate('setDetail(2)')
        await page.evaluate('''() => { startSite(1); const p = LEVEL.pads[0], b = L.body; b.x = (p.x0 + p.x1) / 2 - 10 * RES; b.y = p.row * ASPECT - 16 * RES; b.vx = 1.5 * RES; b.vy = 0; b.a = -.12;
           L.throttle = .8; updateCamera(0, true); window.__upd = update; window.update = () => {}; }''')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{ROOT}/shots/lm_play_normal.png')
        await page.evaluate('''() => { window.update = window.__upd; const p = LEVEL.pads[0], b = L.body; b.x = (p.x0 + p.x1) / 2; b.y = p.row * ASPECT - LEG0.fy * RES - .5 * RES; b.vx = 0; b.vy = 1 / UNIT_M; b.a = 0; L.throttle = 0;
           for (let i = 0; i < 300 && state === 'play'; i++) update(DT); updateCamera(0, true); }''')
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{ROOT}/shots/lm_landed_normal.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
