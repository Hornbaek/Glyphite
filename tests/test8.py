import asyncio, json, os
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/test.html#gl'); await page.wait_for_timeout(1000)
        await page.evaluate('setDetail(2)'); await page.wait_for_timeout(200)
        for lv in [7, 1]:
            r = await page.evaluate(f'''(() => {{ startSite({lv}); const p = LEVEL.pads[0]; const b = L.body; b.x = (p.x0+p.x1)/2 + 6*RES; b.y = p.row*ASPECT - 34*RES; b.vx = 0; b.vy = 0; updateCamera(0,true);
               return {{site: LEVEL.site.name, lamps: LEVEL.lamps.length, pads: LEVEL.pads.map(p => [p.x0, p.x1, p.mult])}}; }})()''')
            print('SITE', json.dumps(r))
            await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(500)
            await page.evaluate('(() => { L.body.vy = Math.max(-1, Math.min(L.body.vy, 1)); })()')
            await page.keyboard.up('ArrowUp'); await page.wait_for_timeout(500)
            await page.screenshot(path=OUT+f'spot_lv{lv}.png')
        # land on pad at site 1 to confirm the wider pads still register
        await page.evaluate('''(() => { const p = LEVEL.pads[1]; const b = L.body; b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - 4.6*RES - 2*RES; b.vx=0; b.vy=RES; b.a=0; b.w=0; updateCamera(0,true); })()''')
        await page.wait_for_timeout(6000)
        print('LAND x2', await page.evaluate('({state, last: lastLanding})'))
        await page.screenshot(path=OUT+'spot_landed.png')
        # shoot out a lamp
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        r = await page.evaluate('''(() => { const lp = LEVEL.lamps.find(l => !l.dead); const b = L.body; b.x = lp.x + 40*RES; b.y = lp.y - 10*RES; b.vx=0; b.vy=0; updateCamera(0,true); window.__lp = LEVEL.lamps.indexOf(lp); return {x: lp.x, y: lp.y}; })()''')
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT+'spot_lamp_before.png')
        await page.evaluate('''(() => { const lp = LEVEL.lamps[window.__lp]; fireRocket([(lp.x - cam.x)/R.cols, (lp.y - RES - cam.y)/(R.rows*ASPECT)]); })()''')
        await page.wait_for_timeout(2500)
        print('LAMP', await page.evaluate('({dead: LEVEL.lamps[window.__lp].dead, state})'))
        await page.screenshot(path=OUT+'spot_lamp_after.png')
        print('ERR', errs)
        await b.close()
asyncio.run(main())
