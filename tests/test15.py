import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
OUT=f'{ROOT}/shots/'
MODE = sys.argv[1] if len(sys.argv) > 1 else '2d'
RES = float(sys.argv[2]) if len(sys.argv) > 2 else 2
async def main():
    async with async_playwright() as p:
        args = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if MODE == 'gl' else ['--disable-gpu']
        b = await p.chromium.launch(args=args)
        page = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(f'file://{ROOT}/dist/test.html#{MODE}'); await page.wait_for_timeout(800)
        await page.evaluate(f'setDetail({RES})')
        T = await page.evaluate('''() => { startSite(2); const S = RES, p = LEVEL.pads.find(q => q.mult === 3);
          const cx = (p.x0 + p.x1) / 2, rx = (p.x1 - p.x0) * .9 + 5 * S, pl0 = Math.floor(cx + rx - 5 * S), pl1 = Math.floor(cx + rx);
          const roof = p.row - Math.round(9 * S);
          // pillar middle row: halfway between the roof underside and the ground
          let g = roof + 2; while (g < H && getC(pl0 - 1, g) === EMPTY) g++;
          const mid = Math.round((roof + S + p.row) / 2);
          window.__T = { pad: [p.x0, p.x1, p.row], pl: [pl0, pl1], roof, mid, hover: [(p.x0 + p.x1) / 2 - 14 * S, (roof - 12 * S) * ASPECT] };
          return window.__T; }''')
        print('target', json.dumps(T))
        HOLD = '''(n) => { const T = window.__T;
          for (let i = 0; i < n; i++) { if (L.alive) { const b = L.body; b.x = T.hover[0]; b.y = T.hover[1]; b.vx = b.vy = b.w = 0; b.a = 0; } update(DT); }
          let roofCells = 0; for (let x = T.pad[0]; x < T.pad[1]; x++) for (let y = T.roof - 3 * RES; y <= T.roof + RES; y++) if (getC(x, y) === ROCK) roofCells++;
          return { chunks: chunks.map(c => ({ n: c.n, x: +c.body.x.toFixed(0), y: +c.body.y.toFixed(0), a: +c.body.a.toFixed(2), v: +Math.hypot(c.body.vx, c.body.vy).toFixed(1) })), roofCells, state, reason: L.reason,
            padDeck: (() => { let n = 0; for (let x = T.pad[0]; x < T.pad[1]; x++) if (getC(x, T.pad[2]) === METAL) n++; return n; })(),
            lamps: LEVEL.lamps.filter(l => Math.abs(l.x - (T.pad[0] + T.pad[1]) / 2) < 30 * RES).map(l => [l.dead ? 'dead' : 'on', l.chunk ? 'ride' : '-']) }; }'''
        await page.evaluate('(() => { const T = window.__T, b = L.body; b.x = T.hover[0]; b.y = T.hover[1]; b.vx = b.vy = 0; updateCamera(0, true); })()')
        print('before', json.dumps(await page.evaluate(HOLD, 20)))
        await page.wait_for_timeout(150); await page.screenshot(path=OUT+f'roof_{MODE}_{RES}_0.png')
        for shot in range(6):
            await page.evaluate('(() => { const T = window.__T; blastFrom(-1, 0); explode((T.pl[0] + T.pl[1]) / 2 + (window.__k = (window.__k || 0) + 1) % 2 * 4 - 2, (T.mid + .5) * ASPECT, 6.5 * RES, 1.15); })()')
            r = await page.evaluate(HOLD, 40)
            print('shot', shot, json.dumps(r))
            if any(c['n'] > 100 for c in r['chunks']): break
        await page.wait_for_timeout(100); await page.screenshot(path=OUT+f'roof_{MODE}_{RES}_1.png')
        for k, n in enumerate([20, 30, 40, 60, 120]):
            r = await page.evaluate(HOLD, n); await page.wait_for_timeout(100)
            print(' step', k, json.dumps(r))
            await page.screenshot(path=OUT+f'roof_{MODE}_{RES}_{k+2}.png')
        print('ERRORS', errs[:6])
        await b.close()
asyncio.run(main())
