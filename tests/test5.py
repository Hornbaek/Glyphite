import asyncio, json, sys
from playwright.async_api import async_playwright
import os
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
URL=f'file://{ROOT}/dist/test.html' + os.environ.get('HASH',''); OUT=f'{ROOT}/shots/'
ARGS = sys.argv[1:] or ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') else None)
        await page.goto(URL); await page.wait_for_timeout(1500)
        info = await page.evaluate('({mode: R.mode, RES, cols: R.cols, rows: R.rows, cw: R.cw, hcols: R.hcols, hrows: R.hrows, W, H})')
        print('BOOT', json.dumps(info))
        await page.screenshot(path=OUT+'d_title.png')
        await page.keyboard.press('Enter'); await page.wait_for_timeout(500)
        await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(1500); await page.keyboard.up('ArrowUp')
        await page.wait_for_timeout(300)
        await page.screenshot(path=OUT+'d_play.png')
        # timing per stage
        r = await page.evaluate('''(() => {
          const T = {upd:0, light:0, scene:0, present:0};
          for (let f=0; f<15; f++) {
            let t0=performance.now(); update(DT); let t1=performance.now(); T.upd+=t1-t0;
            const t=performance.now()/1000; updateSkyline(); const dt0=markDyn();
            const ox=Math.floor(cam.x)-1, oy=Math.floor(cam.y/ASPECT)-1;
            t0=performance.now(); computeLighting(ox,oy,gatherLights(t),dt0); t1=performance.now(); T.light+=t1-t0;
            t0=performance.now(); renderScene(ox,oy,t,()=>drawExtras(t)); hudClear(); drawHUD(t); t1=performance.now(); T.scene+=t1-t0;
            t0=performance.now(); presentFrame(0,0,t); if (R.gl) R.gl.finish(); t1=performance.now(); T.present+=t1-t0;
          }
          for (const k in T) T[k] = +(T[k]/15).toFixed(2); T.particles = P.n; return T; })()''')
        print('TIMING', json.dumps(r))
        # land on pad check at this detail
        r = await page.evaluate('''(() => { const p = LEVEL.pads[0]; const b = L.body; b.x = (p.x0+p.x1)/2; b.y = p.row*ASPECT - 4.6*RES - 3*RES; b.vx=0; b.vy=RES; b.a=0; b.w=0; updateCamera(0,true); return {row:p.row, y:b.y}; })()''')
        await page.wait_for_timeout(5000)
        r = await page.evaluate('({state, score, last: lastLanding})')
        print('LAND', json.dumps(r))
        await page.screenshot(path=OUT+'d_landed.png')
        for lv in [1, 3, 5]:
            await page.evaluate(f'setDetail(DETAIL_LEVELS[{lv-1}], true)')
            await page.wait_for_timeout(700)
            info = await page.evaluate('({mode: R.mode, RES, cols: R.cols, rows: R.rows, cw: R.cw, state, W, H, perf: perfAvg})')
            print('DETAIL', json.dumps(info))
            await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(900); await page.keyboard.up('ArrowUp')
            await page.screenshot(path=OUT+f'd_level{lv}.png')
        print('ERRORS', errs[:10])
        await b.close()
asyncio.run(main())
