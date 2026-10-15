# Lands on the x3 pad (level 2) at every detail level and prints how much room the lander has under
# the roof and under the roof lamps. Both clearances must stay positive.
import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 900})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#2d'); await page.wait_for_timeout(800)
        for res in [1, 1.5, 2, 2.5, 3]:
            await page.evaluate(f'setDetail({res})')
            r = await page.evaluate('''() => { startSite(2); const S = RES, p = LEVEL.pads.find(q => q.mult === 3), b = L.body;
              const cx = (p.x0 + p.x1) / 2; let roofY = p.row - 1; while (roofY > 0 && getC(Math.round(cx), roofY) === EMPTY) roofY--;
              b.x = cx; b.y = p.row * ASPECT - LEG0.fy * S - .5 * S; b.vx = 0; b.vy = .8 / UNIT_M; b.a = 0; b.w = 0;
              for (let i = 0; i < 300 && state === 'play'; i++) update(DT);
              const top = b.y - 7.84 * S, lampY = Math.min(...LEVEL.lamps.filter(l => Math.abs(l.x - cx) < 20 * S).map(l => (l.hy + 1) * ASPECT));
              // clearances in base units (0.5 m each); positive = the antenna is below the roof / lamp heads
              return { state, reason: L.reason, clearanceToRoof: +((top - (roofY + 1) * ASPECT) / S).toFixed(2), clearanceToLamp: +((top - lampY) / S).toFixed(2) }; }''')
            print('RES', res, json.dumps(r))
        await b.close()
asyncio.run(main())
