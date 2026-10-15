import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
OUT=f'{ROOT}/shots/'
MODE = sys.argv[1] if len(sys.argv) > 1 else '2d'
async def main():
    async with async_playwright() as p:
        args = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if MODE == 'gl' else ['--disable-gpu']
        b = await p.chromium.launch(args=args)
        page = await b.new_page(viewport={'width': 1200, 'height': 750}, device_scale_factor=3)
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#{MODE}'); await page.wait_for_timeout(1200)
        for res in [1, 2, 3]:
            await page.evaluate(f'setDetail({res})')
            # landed on pad 1
            await page.evaluate('''() => { startSite(1); const p = LEVEL.pads[0], b = L.body; b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - LEG0.fy*RES - .5*RES; b.vx = 0; b.vy = 1/UNIT_M; b.a = 0; b.w = 0;
              for (let i = 0; i < 240 && state === 'play'; i++) update(DT); updateCamera(0, true); window.__upd = window.__upd || update; window.update = () => {}; }''')
            await page.wait_for_timeout(250)
            CLIP = '(() => { const b = L.body, ux = R.cw / R.dpr, uy = R.chh / R.dpr / ASPECT, x = (b.x - cam.x) * ux + parseFloat(R.canvas.style.left), y = (b.y - cam.y) * uy + parseFloat(R.canvas.style.top); return { x: x - 10 * RES * ux, y: y - 9.5 * RES * uy, width: 20 * RES * ux, height: 17 * RES * uy }; })()'
            clip = await page.evaluate(CLIP)
            await page.screenshot(path=OUT + f'lm_{MODE}_{res}_landed.png', clip=clip)
            # tilted, in flight, engine on
            await page.evaluate('''() => { window.update = window.__upd; startSite(1); const b = L.body; b.y -= 20 * RES; b.a = .45; b.vx = 0; b.vy = 0; L.throttle = 1; updateCamera(0, true); window.update = () => {}; }''')
            await page.wait_for_timeout(250)
            clip = await page.evaluate(CLIP)
            await page.screenshot(path=OUT + f'lm_{MODE}_{res}_tilt.png', clip=clip)
            print(res, 'clip', {k: round(v) for k, v in clip.items()})
            await page.evaluate('() => { window.update = window.__upd; }')
        print('ERR', errs[:5])
        await b.close()
asyncio.run(main())
