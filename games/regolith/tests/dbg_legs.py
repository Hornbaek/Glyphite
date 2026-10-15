import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
RES = float(sys.argv[1]) if len(sys.argv) > 1 else 2
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1200, 'height': 800})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#2d'); await page.wait_for_timeout(600)
        await page.evaluate(f'setDetail({RES})')
        for v in [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]:
            r = await page.evaluate('''(v) => { startSite(1); const p = LEVEL.pads[0], b = L.body; b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - LEG0.fy*RES - .3*RES; b.vx = 0; b.vy = v/UNIT_M; b.a = 0; b.w = 0;
              const out = []; let maxc = 0, t = 0;
              for (let i = 0; i < 300 && (state === 'play' || state === 'landed'); i++) { update(DT); t += DT; maxc = Math.max(maxc, L.legs[0].c, L.legs[1].c);
                if (i % 6 === 0 && i < 90) out.push([+(t).toFixed(2), +(L.legs[0].c/(LEG0.stroke*RES)).toFixed(2), +(L.body.vy*UNIT_M).toFixed(2), +(L.legs[0].cv*UNIT_M).toFixed(2)]); }
              return {state, reason: L.reason, maxc: +(maxc/(LEG0.stroke*RES)).toFixed(2), rest: +(L.legs[0].c/(LEG0.stroke*RES)).toFixed(2), touch: +(L.touchV*UNIT_M).toFixed(2), a: +L.body.a.toFixed(3), series: out.slice(0, 12)}; }''', v)
            print(v, 'm/s', json.dumps({k: r[k] for k in r if k != 'series'}))
            print('   ', r['series'])
        print('ERR', errs[:5])
        await b.close()
asyncio.run(main())
