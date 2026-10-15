import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
URL=f'file://{ROOT}/dist/test.html'; OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(800)
        for lv in [3, 7]:
            r = await page.evaluate(f'''(() => {{ startSite({lv}); const p = LEVEL.pads[LEVEL.pads.length-1]; const b=L.body; b.x=(p.x0+p.x1)/2 - 30; b.y=p.row*ASPECT-40; b.vx=0; b.vy=0; updateCamera(0,true); shower = true; showerT = 6; return {{site: LEVEL.site.name, pads: LEVEL.pads.length, boulders: boulders.length, crystals: LEVEL.crystals.length}}; }})()''')
            print('LV', lv, json.dumps(r))
            await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(700)
            await page.evaluate('(() => { L.body.vy = Math.max(-3, Math.min(L.body.vy, 1)); })()')
            await page.wait_for_timeout(600)
            await page.screenshot(path=OUT+f'lv{lv}.png')
            await page.keyboard.up('ArrowUp')
        await page.keyboard.press('KeyG'); await page.wait_for_timeout(500)
        await page.screenshot(path=OUT+'bloom.png')
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
