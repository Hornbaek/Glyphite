import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
FNS = ['stepChunks','drawChunks','markChunksDyn','computeLighting','renderScene','stepParticles','simGranular','structuralCheck','presentFrame','drawHUD','gatherLights','updateSkyline','markDyn','stepBoulders','drawExtras']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#2d'); await page.wait_for_timeout(1500)
        await page.evaluate('setDetail(2)')
        await page.evaluate('''(fns) => { window.__pt = {}; for (const f of fns) { const o = window[f]; if (typeof o !== 'function') continue; window.__pt[f] = 0; window[f] = function (...a) { const t = performance.now(); const r = o.apply(this, a); window.__pt[f] += performance.now() - t; return r; }; } }''', FNS)
        await page.evaluate('''() => { startSite(2); const S = RES, p = LEVEL.pads.find(q => q.mult === 3), cx = (p.x0 + p.x1) / 2, rx = (p.x1 - p.x0) * .9 + 5 * S;
           const b = L.body; b.x = cx - 14 * S; b.y = (p.row - 21 * S) * ASPECT; b.vx = b.vy = 0; updateCamera(0, true);
           window.__pl = [Math.floor(cx + rx - 2.5 * S), Math.round((p.row - 8 * S + p.row) / 2)]; }''')
        async def window(label, ms):
            await page.evaluate('(() => { for (const k in window.__pt) window.__pt[k] = 0; window.__f0 = frameNo; window.__t0 = performance.now(); })()')
            for k in range(ms // 200):
                await page.evaluate('(() => { const b = L.body; if (L.alive) { b.vy = Math.min(b.vy, 0); b.vx = 0; } })()'); await page.wait_for_timeout(200)
            r = await page.evaluate('(() => { const dt = performance.now() - window.__t0, o = {}; for (const k in window.__pt) if (window.__pt[k] > 1) o[k] = +(window.__pt[k] / dt * 1000).toFixed(1); return { secs: +(dt/1000).toFixed(1), updates: frameNo - window.__f0, msPerSec: o, chunks: chunks.map(c => c.n), parts: P.n }; })()')
            print(label, json.dumps(r))
        await window('baseline', 2000)
        for k in range(2):
            await page.evaluate('(() => { const q = window.__pl; blastFrom(-1, 0); explode(q[0] + (Math.random() * 4 - 2), (q[1] + .5) * ASPECT, 6.5 * RES, 1.15); L.body.vy = -2 * RES; })()')
            await page.wait_for_timeout(250)
        await window('falling', 2000)
        await window('after', 3000)
        await b.close()
asyncio.run(main())
