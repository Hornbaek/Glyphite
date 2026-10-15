import asyncio
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, device_scale_factor=3, has_touch=True, is_mobile=True)
        errs=[]; ph.on('pageerror', lambda e: errs.append(str(e)))
        await ph.goto(f'file://{ROOT}/dist/test.html#gl'); await ph.wait_for_timeout(1500)
        await ph.screenshot(path=OUT+'p_title.png')
        await ph.tap('#screen'); await ph.wait_for_timeout(300)
        await ph.evaluate('(() => { const b=L.body; const x = Math.floor(b.x + 30*RES); b.y = colTop[x]*ASPECT - 30*RES; b.x = x; b.vx = 0; b.vy = 0; updateCamera(0,true); })()')
        await ph.wait_for_timeout(1200)
        await ph.screenshot(path=OUT+'p_play.png')
        print(await ph.evaluate('({mode:R.mode, RES, cols:R.cols, rows:R.rows, cw:R.cw, hcols:R.hcols, hrows:R.hrows, dpr:R.dpr})'), errs)
        await b.close()
asyncio.run(main())
