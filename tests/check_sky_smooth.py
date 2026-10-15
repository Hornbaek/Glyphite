import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1200, 'height': 750})
        await page.goto(f'file://{ROOT}/dist/test.html#2d'); await page.wait_for_timeout(800)
        await page.evaluate('setDetail(2)'); await page.evaluate('startSite(1)')
        r = await page.evaluate('''() => { state = 'paused'; const cw = R.cw, x0 = Math.floor(cam.x) + .5, out = { newX: [], oldX: [] };
          // pick the sky cell of a star near screen centre, then follow it while the camera glides right at 0.1 cell per frame
          const s0 = Math.floor(x0 * SKY_PAR) + Math.floor(R.cols / 2);
          for (let k = 0; k < 200; k++) {
            const cx = x0 + k * .1;
            // new: sky layer with its own sub-cell offset
            const sx = cx * SKY_PAR, ix = Math.floor(sx), fx = sx - ix, sdx = Math.round(-(1 + fx) * cw), i = s0 - (ix - 1);
            out.newX.push(i * cw + sdx);
            // old: star pinned to a world-grid cell (12% parallax, whole cells) and shifted with the world's fraction
            const ox = Math.floor(cx) - 1, frac = cx - Math.floor(cx), dx = Math.round(-(1 + frac) * cw), spx = Math.floor(ox * .12), io = s0 - spx;
            out.oldX.push(io * cw + dx);
          }
          const steps = a => a.slice(1).map((v, i) => v - a[i]);
          const sn = steps(out.newX), so = steps(out.oldX);
          return { cw, newSteps: [Math.min(...sn), Math.max(...sn)], oldSteps: [Math.min(...so), Math.max(...so)], newPath: out.newX.slice(0, 40).join(' '), oldPath: out.oldX.slice(0, 40).join(' ') }; }''')
        print(json.dumps(r, indent=1))
        await b.close()
asyncio.run(main())
