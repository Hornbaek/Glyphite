import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
RES = float(sys.argv[1]) if len(sys.argv) > 1 else 2
CASES = [('tilt .2 rad', 1.5, 0, .2), ('tilt -.35 rad', 1.0, 0, -.35), ('drift 1.5 m/s', 1.5, 1.5, 0), ('drift 3 m/s', 1.0, 3.0, 0), ('tilt .5 + drift', 1.0, -1.5, .5)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1000, 'height': 700})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/test.html#2d'); await page.wait_for_timeout(600)
        await page.evaluate(f'setDetail({RES})')
        for name, vy, vx, a in CASES:
            r = await page.evaluate('''([vy, vx, a]) => { startSite(1); const p = LEVEL.pads[0], b = L.body; b.x = (p.x0+p.x1)/2 - vx/UNIT_M * .5; b.y = p.row*ASPECT - LEG0.fy*RES - 1.2*RES; b.vx = vx/UNIT_M; b.vy = vy/UNIT_M; b.a = a; b.w = 0;
              let t = 0; const cs = [];
              for (let i = 0; i < 420 && (state === 'play' || state === 'landed'); i++) { update(DT); t += DT; if (i > 300) cs.push(L.legs[0].c, L.legs[1].c); }
              const m = cs.length ? cs.reduce((s, x) => s + x, 0) / cs.length : 0, sd = cs.length ? Math.sqrt(cs.reduce((s, x) => s + (x - m) ** 2, 0) / cs.length) : 0;
              return { state, reason: L.reason, a: +L.body.a.toFixed(3), x: +(L.body.x - (p.x0 + p.x1) / 2).toFixed(1), jitter: +(sd / (LEG0.stroke * RES)).toFixed(4), touch: +(L.touchV * UNIT_M).toFixed(2) }; }''', [vy, vx, a])
            print(f'{name:18s}', json.dumps(r))
        # slope landing: find steepest spot near spawn where the lander can come down
        r = await page.evaluate('''() => { startSite(1); const S = RES; let best = null;
            for (let x = 40 * S; x < W - 40 * S; x += 2) { const p = LEVEL.pads.some(q => x > q.x0 - 30 * S && x < q.x1 + 30 * S); if (p) continue;
              const h0 = colTop[Math.round(x - 6 * S)], h1 = colTop[Math.round(x + 6 * S)]; const sl = Math.abs(h1 - h0) * ASPECT / (12 * S);
              if (sl > .25 && sl < .45 && (!best || Math.abs(sl - .35) < Math.abs(best.sl - .35))) best = { x, sl }; }
            if (!best) return 'no slope';
            const b = L.body; b.x = best.x; b.y = Math.min(colTop[Math.round(best.x - 6 * S)], colTop[Math.round(best.x + 6 * S)]) * ASPECT - 9 * S; b.vx = 0; b.vy = 1 / UNIT_M; b.a = 0; b.w = 0;
            for (let i = 0; i < 400 && state === 'play'; i++) update(DT);
            return { slope: +best.sl.toFixed(2), state, reason: L.reason, a: +L.body.a.toFixed(2), offsite: L.offsiteShown, legs: L.legs.map(l => l.touch) }; }''')
        print('slope landing     ', json.dumps(r))
        print('ERR', errs[:4])
        await b.close()
asyncio.run(main())
