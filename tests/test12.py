import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.as_posix()   # repo root (tests/ lives one level down)
OUT=f'{ROOT}/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        page = await b.new_page(viewport={'width': 1440, 'height': 860})
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') and 'Failed to load resource' not in m.text else None)
        await page.goto(f'file://{ROOT}/dist/test.html#gl'); await page.wait_for_timeout(800)
        await page.keyboard.press('ArrowDown')   # any key unlocks audio on the title screen
        await page.wait_for_timeout(1500)
        print('TITLE', await page.evaluate('({ctx: Chip.ctx && Chip.ctx.state, playing: Chip.playing, song: Chip.song && Chip.song.title, srcs: Chip.srcs.length, snaps: Chip.snaps.length, beat: musicBeat().toFixed(2)})'))
        await page.screenshot(path=OUT+'music_title.png')
        await page.set_input_files('#midiFile', f'{ROOT}/music/descent.mid')
        await page.wait_for_timeout(1200)
        print('LOADED', await page.evaluate('({playing: Chip.playing, song: Chip.song && Chip.song.title, custom: !!Music.custom, toast: toast && toast.text})'))
        await page.screenshot(path=OUT+'music_loaded.png')
        await page.keyboard.press('Enter'); await page.wait_for_timeout(600)
        await page.keyboard.press('KeyV'); await page.wait_for_timeout(1200)
        print('PLAY', await page.evaluate('({state, playing: Chip.playing, song: Chip.song && Chip.song.title, meters: Music.meters})'))
        await page.screenshot(path=OUT+'music_play.png')
        await page.keyboard.press('KeyN'); await page.wait_for_timeout(800)
        print('OFF', await page.evaluate('({on: Music.on, playing: Chip.playing, srcs: Chip.srcs.length})'))
        await page.keyboard.press('KeyN'); await page.wait_for_timeout(800)
        print('ON', await page.evaluate('({on: Music.on, playing: Chip.playing, song: Chip.song && Chip.song.title})'))
        # crash -> lost jingle, then it should stop by itself
        await page.evaluate('crashLander("TEST")'); await page.wait_for_timeout(1500)
        print('CRASH', await page.evaluate('({state, song: Chip.song && Chip.song.title, playing: Chip.playing, loop: Chip.loop})'))
        await page.wait_for_timeout(7000)
        print('AFTER JINGLE', await page.evaluate('({playing: Chip.playing, busy: Chip.busy(), srcs: Chip.srcs.length})'))
        # live MIDI bytes straight into the chip (what a keyboard would send)
        await page.evaluate('(() => { Chip.midi([0x90, 60, 100]); Chip.midi([0x90, 64, 100]); Chip.midi([0x90, 67, 100]); })()')
        await page.wait_for_timeout(400)
        print('LIVE', await page.evaluate('({busy: Chip.busy(), lane: Chip.live[0].notes.map(n=>n.note), v4: Chip.live[0].v4, cur: Chip.live[0].cur})'))
        await page.evaluate('(() => { for (const n of [60,64,67]) Chip.midi([0x80, n, 0]); })()')
        await page.click('#midiBtn', timeout=2000) if False else None
        print('ERRORS', errs[:8])
        await b.close()
asyncio.run(main())
