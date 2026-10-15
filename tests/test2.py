import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
URL=f'file://{ROOT}/dist/regolith.html'; OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(1200)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        # 1) gentle drop onto pad x1
        r = await page.evaluate('''(() => { const p = LEVEL.pads[0]; const b = L.body;
            b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - 4.6 - 3; b.vx=0; b.vy=1; b.a=0; b.w=0; updateCamera(0,true);
            return {pad:p, y:b.y}; })()''')
        print('PAD', json.dumps(r))
        await page.wait_for_timeout(2500)
        r = await page.evaluate('({state, score, last: lastLanding, feet: L.body.feetDown, y: L.body.y, vy: L.body.vy})')
        print('LAND', json.dumps(r))
        await page.wait_for_timeout(800)
        await page.screenshot(path=OUT+'landed.png')
        # 2) next site, then a hard crash
        await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        r = await page.evaluate('''(() => { const b=L.body; const x=Math.floor(W*0.3); b.x=x; b.y=colTop[x]*ASPECT-30; b.vx=2; b.vy=22; updateCamera(0,true); return {lv:LEVEL.lv, site:LEVEL.site.name}; })()''')
        print('SITE2', json.dumps(r))
        await page.wait_for_timeout(1100)
        await page.screenshot(path=OUT+'crash_moment.png')
        await page.wait_for_timeout(3600)
        r = await page.evaluate('({state, reason: L.reason, lives, n: P.n, stateT})')
        print('CRASH', json.dumps(r))
        await page.screenshot(path=OUT+'crash_msg.png')
        # 3) retry; hover with engine low over regolith to test erosion
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        r = await page.evaluate('''(() => { let n=0; for (let i=0;i<cells.length;i++) if (cells[i]===REGO) n++; const b=L.body; const x=Math.floor(W*0.22); b.x=x; b.y=colTop[x]*ASPECT-14; b.vx=0; b.vy=0; updateCamera(0,true); window.__rego=n; return n; })()''')
        print('REGO_BEFORE', r)
        await page.keyboard.down('ArrowUp')
        for i in range(12):
            await page.wait_for_timeout(250)
            await page.evaluate('(() => { const b=L.body; b.vy = Math.min(b.vy, 0.5); if (b.vy < -2) b.vy=-2; b.vx=0; b.a=0; b.w=0; })()')
        await page.screenshot(path=OUT+'hover_erosion.png')
        await page.keyboard.up('ArrowUp')
        r = await page.evaluate('(() => { let n=0; for (let i=0;i<cells.length;i++) if (cells[i]===REGO) n++; return {now:n, before: window.__rego, particles: P.n, state, reason: L.reason}; })()')
        print('REGO_AFTER', json.dumps(r))
        # 4) rocket into the ground: count solids
        r = await page.evaluate('''(() => { const b=L.body; if(!L.alive) return 'dead'; const x=Math.floor(b.x+30); let n=0; for (let i=0;i<cells.length;i++) if (cells[i]) n++; window.__solid=n; fireRocket([ (x - cam.x)/R.cols, (colTop[x]*ASPECT + 4 - cam.y)/(R.rows*ASPECT) ]); return n; })()''')
        print('SOLID_BEFORE', r)
        await page.wait_for_timeout(700)
        await page.screenshot(path=OUT+'blast.png')
        await page.wait_for_timeout(300)
        await page.screenshot(path=OUT+'blast2.png')
        r = await page.evaluate('(() => { let n=0; for (let i=0;i<cells.length;i++) if (cells[i]) n++; return {now:n, before: window.__solid, particles:P.n, state}; })()')
        print('SOLID_AFTER', json.dumps(r))
        await page.wait_for_timeout(2500)
        r = await page.evaluate('(() => { let n=0; for (let i=0;i<cells.length;i++) if (cells[i]) n++; return {settled:n, particles:P.n}; })()')
        print('SOLID_SETTLED', json.dumps(r))
        await page.screenshot(path=OUT+'blast_after.png')
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
