import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        await page.goto(f'file://{ROOT}/dist/regolith.html')
        await page.wait_for_timeout(1500)
        await page.keyboard.press('Enter')
        await page.wait_for_timeout(1000)
        r = await page.evaluate('''(() => {
          const T = {comp:0, mainDraw:0, hudLoop:0, hudComp:0, hudDraw:0};
          const ctx=R.ctx, cw=R.cw, chh=R.chh, t=1;
          for (let f=0; f<20; f++) {
            let t0=performance.now();
            composeLayer(R.wG, R.wImg, R.colorCtx, R.colorCv, R.glyphCtx, R.glyph, R.layerCtx, R.layer, R.RW, R.RH, R.wShim, t);
            let t1=performance.now(); T.comp+=t1-t0; t0=t1;
            ctx.fillStyle='#05070c'; ctx.fillRect(0,0,R.canvas.width,R.canvas.height); ctx.drawImage(R.layer, -cw, -chh);
            t1=performance.now(); T.mainDraw+=t1-t0; t0=t1;
            const hn=R.cols*R.rows, HI=R.hImg.data, HG=R.hG, HC=R.hC;
            for (let k=0;k<hn;k++){HI[k*4]=HC[k*3];HI[k*4+1]=HC[k*3+1];HI[k*4+2]=HC[k*3+2];HI[k*4+3]=255;}
            t1=performance.now(); T.hudLoop+=t1-t0; t0=t1;
            composeLayer(HG, R.hImg, R.hColorCtx, R.hColorCv, R.hLayerCtx, R.hLayer, R.layerCtx, R.layer, R.cols, R.rows, null, t);
            t1=performance.now(); T.hudComp+=t1-t0; t0=t1;
            ctx.drawImage(R.layer, 0, 0, R.cols*cw, R.rows*chh, 0, 0, R.cols*cw, R.rows*chh);
            t1=performance.now(); T.hudDraw+=t1-t0;
          }
          for (const k in T) T[k] = +(T[k]/20).toFixed(2);
          return T; })()''')
        print(json.dumps(r))
        await b.close()
asyncio.run(main())
