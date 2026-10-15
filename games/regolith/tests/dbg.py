import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html'); await page.wait_for_timeout(800)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        await page.evaluate('''(() => { const p = LEVEL.pads[0]; const b = L.body; b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - 4.6*RES - 3*RES; b.vx=0; b.vy=RES; b.a=0; b.w=0; updateCamera(0,true); })()''')
        for i in range(6):
            await page.wait_for_timeout(400)
            r = await page.evaluate('''(() => { const b=L.body; return {state, landedT:L.landedT, throttle:L.throttle, v:Math.hypot(b.vx,b.vy).toFixed(3), w:b.w.toFixed(3), a:b.a.toFixed(3), feet:b.feetDown, body:b.bodyDown, hits:b.hits.map(h=>[h.kind,h.p.side,h.mat,+h.vn.toFixed(2)]), pad:LEVEL.pads[0]}; })()''')
            print(json.dumps(r))
        await b.close()
asyncio.run(main())
