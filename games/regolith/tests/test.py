import asyncio, sys, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)

URL = f'file://{ROOT}/dist/games/regolith/index.html'
OUT = f'{ROOT}/shots/'

async def main():
    import os; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs = []
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await page.goto(URL)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=OUT + 'title.png')
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=OUT + 'play_start.png')
        # burn for a while
        await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(900); await page.keyboard.up('ArrowUp')
        await page.wait_for_timeout(2500)
        await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(1200)
        await page.screenshot(path=OUT + 'burn.png')
        await page.keyboard.up('ArrowUp')
        info = await page.evaluate('({state, n:P.n, perf:perfAvg, alt: L && L.alive ? altitude() : -1, x: L.body.x, y: L.body.y, vx:L.body.vx, vy:L.body.vy, cols:R.cols, rows:R.rows})')
        print('INFO1', json.dumps(info))
        # fire rockets downward
        for i in range(3):
            await page.keyboard.press('Space'); await page.wait_for_timeout(350)
        await page.wait_for_timeout(900)
        await page.screenshot(path=OUT + 'rockets.png')
        await page.wait_for_timeout(5000)
        info = await page.evaluate('({state, n:P.n, perf:perfAvg, reason: L.reason, alt: L && L.alive ? altitude() : -1, y: L.body.y, vy:L.body.vy})')
        print('INFO2', json.dumps(info))
        await page.screenshot(path=OUT + 'later.png')
        # timing of one draw
        t = await page.evaluate('(() => { const t0 = performance.now(); for (let i=0;i<10;i++){ update(DT); draw(performance.now()/1000);} return (performance.now()-t0)/10; })()')
        print('MS_PER_FRAME', t)
        print('ERRORS', errs[:20])
        # phone
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
        perr = []
        ph.on('pageerror', lambda e: perr.append(str(e)))
        await ph.goto(URL)
        await ph.wait_for_timeout(2000)
        await ph.screenshot(path=OUT + 'phone_title.png')
        await ph.tap('#screen')
        await ph.wait_for_timeout(2500)
        await ph.screenshot(path=OUT + 'phone_play.png')
        print('PHONE_ERRORS', perr)
        await b.close()

asyncio.run(main())
