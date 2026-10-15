import asyncio
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ph.goto(f'file://{ROOT}/dist/test.html#gl'); await ph.wait_for_timeout(1200)
        await ph.screenshot(path=f'{ROOT}/shots/music_phone.png')
        dk = await b.new_page(viewport={'width': 1440, 'height': 860})
        await dk.goto(f'file://{ROOT}/dist/test.html#gl'); await dk.wait_for_timeout(800)
        await dk.keyboard.press('Enter'); await dk.wait_for_timeout(600)
        print('desktop touch hidden:', await dk.evaluate('getComputedStyle(document.getElementById("touch")).display'), 'titleBar:', await dk.evaluate('getComputedStyle(document.getElementById("titleBar")).display'))
        await b.close()
asyncio.run(main())
