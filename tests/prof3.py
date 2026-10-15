import asyncio, json, os
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        await page.goto(f'file://{ROOT}/dist/test.html' + os.environ.get('HASH','')); await page.wait_for_timeout(800)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        for r in [1, 1.5, 2, 3]:
            res = await page.evaluate(f'''(async () => {{ setDetail({r}); L.throttle=1;
              const T = {{light:0, scene:0, present:0, frame:0}};
              await new Promise(r => setTimeout(r, 300));
              for (let f=0; f<10; f++) {{
                const t=performance.now()/1000; updateSkyline(); const dt0=markDyn();
                const ox=Math.floor(cam.x)-1, oy=Math.floor(cam.y/ASPECT)-1;
                let t0=performance.now(); computeLighting(ox,oy,gatherLights(t),dt0); let t1=performance.now(); T.light+=t1-t0;
                t0=performance.now(); renderScene(ox,oy,t,()=>drawExtras(t)); hudClear(); drawHUD(t); t1=performance.now(); T.scene+=t1-t0;
                t0=performance.now(); presentFrame(0,0,t); if (R.gl) R.gl.finish(); else R.ctx.getImageData(0,0,1,1); t1=performance.now(); T.present+=t1-t0;
              }}
              for (const k in T) T[k] = +(T[k]/10).toFixed(1); T.mode=R.mode; T.res=RES; T.cells=R.RW*R.RH; return T; }})()''')
            print(json.dumps(res))
        await b.close()
asyncio.run(main())
