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
        # find a shadowed, fairly flat stretch of regolith away from pads
        r = await page.evaluate('''(() => { startSite(7);
            updateSkyline(); let best = null;
            for (let x = 120*RES; x < W - 120*RES; x += 4) {
              if (LEVEL.pads.some(p => x > p.x0 - 60*RES && x < p.x1 + 60*RES)) continue;
              const y = colTop[x]; if (cells[y*W+x] !== REGO) continue;
              let flat = true; for (let k = -20; k <= 20; k += 4) if (Math.abs(colTop[x+k] - y) > 3*RES) flat = false;
              if (!flat) continue;
              let px = x + .5, py = y*ASPECT - .1, lit = true;
              while (py > 0 && px > 0) { px -= SUN_L[0]*.7; py -= SUN_L[1]*.7; if (getC(Math.floor(px), Math.floor(py/ASPECT)) !== EMPTY) { lit = false; break; } }
              if (!lit) { best = x; break; }
            }
            const x = best || LEVEL.pads[0].x0 - 80*RES; const b = L.body; b.x = x; b.y = colTop[x]*ASPECT - 26*RES; b.vx = 0; b.vy = 0; updateCamera(0,true); return {x, found: !!best}; })()''')
        print('SPOT', r)
        for name, lights in [('on', True), ('off', False)]:
            await page.evaluate(f'(() => {{ L.lights = {str(lights).lower()}; }})()')
            for i in range(3):
                await page.wait_for_timeout(250)
                await page.evaluate(f'(() => {{ const b = L.body; b.y = colTop[Math.floor(b.x)]*ASPECT - 26*RES; b.vy = 0; b.vx = 0; }})()')
            await page.screenshot(path=OUT+f'spot4_{name}.png')
        print('ERR', errs)
        await b.close()
asyncio.run(main())
