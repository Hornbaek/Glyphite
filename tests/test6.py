import asyncio, json, os
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
OUT=f'{ROOT}/shots/'
async def run(b, hash_, tag):
    page = await b.new_page(viewport={'width': 1440, 'height': 860})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(f'file://{ROOT}/dist/test.html' + hash_); await page.wait_for_timeout(1200)
    await page.evaluate('setDetail(2)')
    await page.wait_for_timeout(400)
    await page.screenshot(path=OUT+f'{tag}_title.png')
    await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
    await page.evaluate('''(() => { const p = LEVEL.pads[0]; const b = L.body; b.x = p.x0 - 40*RES; b.y = p.row*ASPECT - 26*RES; b.vx = 2*RES; b.vy = 0; updateCamera(0,true); })()''')
    await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(1200)
    await page.evaluate('(() => { L.body.vy = Math.min(L.body.vy, 1); })()')
    await page.wait_for_timeout(800)
    await page.screenshot(path=OUT+f'{tag}_hover.png')
    await page.keyboard.up('ArrowUp')
    await page.evaluate('''(() => { const b=L.body; fireRocket([ (b.x + 30*RES - cam.x)/R.cols, (colTop[Math.floor(b.x+30*RES)]*ASPECT + 6*RES - cam.y)/(R.rows*ASPECT) ]); })()''')
    await page.wait_for_timeout(900)
    await page.screenshot(path=OUT+f'{tag}_blast.png')
    await page.wait_for_timeout(1500)
    await page.screenshot(path=OUT+f'{tag}_after.png')
    print(tag, await page.evaluate('({mode:R.mode, RES, state, cols:R.cols})'), errs)
    await page.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        await run(b, '#2d', 'c2d')
        await run(b, '#gl', 'cgl')
        await b.close()
asyncio.run(main())
