import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
OUT=f'{ROOT}/shots/'
MODE = sys.argv[1] if len(sys.argv) > 1 else '2d'
RESL = [float(x) for x in (sys.argv[2].split(',') if len(sys.argv) > 2 else ['2'])]
FIND = '''() => {
  const S = RES, lp = LEVEL.lamps.find(l => !l.dead && getC(l.mount % W, (l.mount / W) | 0) === MAST);
  const mx = lp.mount % W, my = (lp.mount / W) | 0;
  let px = -1; for (let d = 1; d < 8 * S && px < 0; d++) for (const x of [mx - d, mx + d]) if (getC(x, my) === MAST && getC(x, my + 1) === MAST) { px = x; break; }
  let base = my; while (getC(px, base + 1) === MAST) base++;
  const hitY = Math.round((my + base) / 2), side = mx > px ? 1 : -1;
  window.__T = { lp: LEVEL.lamps.indexOf(lp), px, my, base, hitY, hover: [px + side * 18 * S, hitY * ASPECT - 3 * S] };
  return window.__T; }'''
HOLD = '''(n) => { const T = window.__T, out = [];
  for (let i = 0; i < n; i++) { if (L.alive) { const b = L.body; b.x = T.hover[0]; b.y = T.hover[1]; b.vx = b.vy = b.w = 0; b.a = 0; } update(DT); }
  const lp = LEVEL.lamps[T.lp];
  return { chunks: chunks.map(c => ({ n: c.n, x: +c.body.x.toFixed(1), y: +c.body.y.toFixed(1), a: +c.body.a.toFixed(2), v: +Math.hypot(c.body.vx, c.body.vy).toFixed(1) })),
    lamp: { dead: lp.dead, ride: !!lp.chunk, x: +lp.x.toFixed(1), y: +lp.y.toFixed(1), rot: +(lp.rot || 0).toFixed(2), mount: [lp.mount % W, (lp.mount / W) | 0], mountMat: getC(lp.mount % W, (lp.mount / W) | 0) },
    stump: (() => { let t = T.base; while (getC(T.px, t - 1) === MAST) t--; return T.base - t + 1; })(), state }; }'''
async def main():
    async with async_playwright() as p:
        args = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if MODE == 'gl' else ['--disable-gpu']
        b = await p.chromium.launch(args=args)
        page = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#{MODE}'); await page.wait_for_timeout(800)
        for res in RESL:
            await page.evaluate(f'setDetail({res})'); await page.evaluate('startSite(1)')
            T = await page.evaluate(FIND); print(f'== RES {res}', MODE, 'target', json.dumps(T))
            await page.evaluate('(() => { const T = window.__T, b = L.body; b.x = T.hover[0]; b.y = T.hover[1]; b.vx = b.vy = 0; updateCamera(0, true); })()')
            await page.evaluate(HOLD, 30); await page.wait_for_timeout(150)
            await page.screenshot(path=OUT+f'post_{MODE}_{res}_0.png')
            await page.evaluate('(() => { const T = window.__T; L.cool = 0; fireRocket([(T.px + .5 - cam.x) / R.cols, ((T.hitY + .5) * ASPECT - cam.y) / (R.rows * ASPECT)]); })()')
            for k, n in enumerate([26, 12, 12, 16, 20, 30, 40, 60, 90, 120]):
                r = await page.evaluate(HOLD, n); await page.wait_for_timeout(120)
                print(' step', k, json.dumps(r))
                await page.screenshot(path=OUT+f'post_{MODE}_{res}_{k+1}.png')
        print('ERRORS', errs[:6])
        await b.close()
asyncio.run(main())
