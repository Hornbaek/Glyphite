import asyncio, json, sys
from playwright.async_api import async_playwright
from PIL import Image
import io
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
OUT=f'{ROOT}/shots/'
async def run(p, mode):
    args = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if mode == 'gl' else ['--disable-gpu']
    b = await p.chromium.launch(args=args)
    page = await b.new_page(viewport={'width': 1200, 'height': 750})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#{mode}'); await page.wait_for_timeout(1200)
    await page.evaluate('setDetail(2)'); await page.evaluate('setEyeAdaptation(0); setBeatPulse(0)'); await page.evaluate('startSite(1)');   # the Earth is found by colour, so keep the exposure and the bloom fixed await page.wait_for_timeout(300)
    info = await page.evaluate('(() => { state = "paused"; const x0 = Math.floor(cam.x), y0 = cam.y; window.__c0 = [x0, y0]; return { cw: R.cw, chh: R.chh, dpr: R.dpr, cols: R.cols, rows: R.rows, renderer: R.mode, canvas: [R.canvas.width, R.canvas.height], left: R.canvas.style.left, top: R.canvas.style.top }; })()')
    print(mode, info)
    pos = []
    for k in range(14):
        await page.evaluate(f'(() => {{ cam.x = window.__c0[0] + {k} * .37; cam.y = window.__c0[1] + {k} * .23; }})()')
        await page.wait_for_timeout(160)
        png = await page.screenshot()
        im = Image.open(io.BytesIO(png)).convert('RGB'); W, H = im.size
        # Earth: blue/green dominant pixels in the upper right quadrant
        sx = sy = n = 0
        px = im.load()
        for y in range(int(H * .05), int(H * .45)):
            for x in range(int(W * .55), int(W * .98)):
                r, g, bl = px[x, y]
                if bl > 90 and bl > r + 25: sx += x; sy += y; n += 1
        pos.append((round(sx / max(n, 1), 2), round(sy / max(n, 1), 2), n))
        if k in (0, 13): im.save(OUT + f'sky_{mode}_{k}.png')
    print(mode, 'earth centroid per step:', pos)
    dxs = [round(pos[i + 1][0] - pos[i][0], 2) for i in range(len(pos) - 1)]
    print(mode, 'step dx:', dxs, 'max |dx|', max(abs(d) for d in dxs))
    print(mode, 'ERR', errs[:4])
    await b.close()
async def main():
    async with async_playwright() as p:
        for mode in (sys.argv[1:] or ['2d', 'gl']): await run(p, mode)
asyncio.run(main())
