import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
URL=f'file://{ROOT}/dist/games/regolith/index.html'; OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(1000)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        # boulder test: put the lander near a boulder and fire at it
        r = await page.evaluate('''(() => { const bo = boulders.find(b => !b.dead); if (!bo) return 'none';
            const b=L.body; b.x = bo.x - 40; b.y = bo.y - 30; b.vx=0; b.vy=0; updateCamera(0,true);
            window.__bo = boulders.indexOf(bo); return {bx:bo.x, by:bo.y, r:bo.r, n:boulders.length}; })()''')
        print('BOULDER', json.dumps(r))
        await page.wait_for_timeout(400)
        await page.screenshot(path=OUT+'boulder_before.png')
        await page.evaluate('''(() => { const bo = boulders[window.__bo]; L.body.vx=0; L.body.vy=-1; fireRocket([ (bo.x + 5 - cam.x)/R.cols, (bo.y + 2 - cam.y)/(R.rows*ASPECT) ]); })()''')
        await page.wait_for_timeout(650)
        await page.screenshot(path=OUT+'boulder_blast.png')
        await page.wait_for_timeout(1500)
        r = await page.evaluate('(() => { const bo = boulders[window.__bo]; return {dead: bo.dead, x: bo.x, y: bo.y, vx: bo.vx, sleep: bo.sleep, state}; })()')
        print('BOULDER_AFTER', json.dumps(r))
        await page.screenshot(path=OUT+'boulder_after.png')
        # crash VFX sequence
        await page.evaluate('''(() => { const b=L.body; const x=Math.floor(b.x + 20); b.x=x; b.y=colTop[x]*ASPECT-16; b.vx=4; b.vy=26; b.a=.3; updateCamera(0,true); })()''')
        for i, ms in enumerate([350, 250, 400, 900]):
            await page.wait_for_timeout(ms)
            await page.screenshot(path=OUT+f'crash_{i}.png')
        await page.wait_for_timeout(2200)
        await page.screenshot(path=OUT+'crash_msg.png')
        print('ERRORS', errs)
        # phone title + play
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ph.goto(URL); await ph.wait_for_timeout(1500)
        await ph.screenshot(path=OUT+'phone_title.png')
        await ph.tap('#screen'); await ph.wait_for_timeout(2500)
        await ph.screenshot(path=OUT+'phone_play.png')
        print('PHONE', await ph.evaluate('({cols:R.cols, rows:R.rows, cw:R.cw, touch: !document.getElementById("touch").hidden})'))
        await b.close()
asyncio.run(main())
