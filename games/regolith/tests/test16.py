import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
OUT=f'{ROOT}/shots/'
async def run(p, mode):
    args = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if mode == 'gl' else ['--disable-gpu']
    b = await p.chromium.launch(args=args)
    page = await b.new_page(viewport={'width': 1280, 'height': 800})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load' not in m.text and 'ERR_' not in m.text else None)
    await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#{mode}'); await page.wait_for_timeout(2500)
    # title with meteors for a while
    t = await page.evaluate('({state, chunks: chunks.length, renderer: R.gl ? "gl" : "2d"})'); print(mode, 'title', t)
    await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
    await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(1500); await page.keyboard.up('ArrowUp')
    for k in range(3):
        await page.mouse.click(640, 700); await page.wait_for_timeout(500)
    await page.wait_for_timeout(2500)
    s = await page.evaluate('({state, reason: L.reason, rockets: L.rockets, chunks: chunks.length, perf: +perfAvg.toFixed(1), legs: L.legs.map(l => +l.c.toFixed(2))})'); print(mode, 'play', s)
    await page.screenshot(path=OUT+f'smoke_{mode}.png')
    # level 2 roof drop under real-time frames: blast the pillar twice and keep rendering
    await page.evaluate('''() => { startSite(2); const S = RES, p = LEVEL.pads.find(q => q.mult === 3), cx = (p.x0 + p.x1) / 2, rx = (p.x1 - p.x0) * .9 + 5 * S;
       const b = L.body; b.x = cx - 14 * S; b.y = (p.row - 21 * S) * ASPECT; b.vx = b.vy = 0; updateCamera(0, true);
       window.__pl = [Math.floor(cx + rx - 2.5 * S), Math.round((p.row - 8 * S + p.row) / 2)]; }''')
    for k in range(2):
        await page.evaluate('(() => { const q = window.__pl; blastFrom(-1, 0); explode(q[0] + (Math.random() * 4 - 2), (q[1] + .5) * ASPECT, 6.5 * RES, 1.15); L.body.vy = -2 * RES; })()')
        await page.wait_for_timeout(300)
    t0 = await page.evaluate('performance.now()'); f0 = await page.evaluate('frameNo')
    for k in range(10):
        await page.evaluate('(() => { const b = L.body; if (L.alive) { b.vy = Math.min(b.vy, 0); b.vx = 0; } })()'); await page.wait_for_timeout(200)
    t1 = await page.evaluate('performance.now()'); f1 = await page.evaluate('frameNo')
    r = await page.evaluate('({chunks: chunks.map(c => c.n), state, perf: +perfAvg.toFixed(1)})')
    print(mode, 'roof drop', r, 'sim updates/s', round((f1 - f0) / ((t1 - t0) / 1000)))
    await page.screenshot(path=OUT+f'smoke_roof_{mode}.png')
    print(mode, 'ERRORS', errs[:6])
    await b.close()
async def main():
    async with async_playwright() as p:
        for mode in (sys.argv[1:] or ['gl', '2d']): await run(p, mode)
asyncio.run(main())
