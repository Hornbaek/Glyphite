import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html')
        await page.wait_for_timeout(1500)
        await page.keyboard.press('Enter')
        await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(2500)
        r = await page.evaluate('''(() => {
          const T = {upd:0, sky:0, light:0, scene:0, hud:0, present:0, compW:0};
          for (let f=0; f<20; f++) {
            let t0=performance.now(); update(DT); let t1=performance.now(); T.upd+=t1-t0;
            const t=performance.now()/1000;
            t0=performance.now(); updateSkyline(); const dt0=markDyn(); t1=performance.now(); T.sky+=t1-t0;
            const ox=Math.floor(cam.x)-1, oy=Math.floor(cam.y/ASPECT)-1;
            t0=performance.now(); computeLighting(ox,oy,gatherLights(t),dt0); t1=performance.now(); T.light+=t1-t0;
            t0=performance.now(); renderScene(ox,oy,t,()=>drawExtras(t)); t1=performance.now(); T.scene+=t1-t0;
            t0=performance.now(); hudClear(); drawHUD(t); t1=performance.now(); T.hud+=t1-t0;
            t0=performance.now(); presentFrame(0,0,t); t1=performance.now(); T.present+=t1-t0;
            t0=performance.now(); composeLayer(R.wG, R.wImg, R.colorCtx, R.colorCv, R.glyphCtx, R.glyph, R.layerCtx, R.layer, R.RW, R.RH, R.wShim, t); t1=performance.now(); T.compW+=t1-t0;
          }
          for (const k in T) T[k] = +(T[k]/20).toFixed(2);
          T.particles = P.n; T.cols = R.cols; T.rows=R.rows;
          return T; })()''')
        print(json.dumps(r))
        await b.close()
asyncio.run(main())
