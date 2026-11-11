#!/usr/bin/env python3
"""Engine behaviour that needs a real page: pause and input, the error overlay, the simulation clock, record and replay.

  python3 tests/engine_browser.py            (build first: node tools/pixelite.mjs build)

Uses the starter game. PIXELITE_BROWSER_CHANNEL=chrome runs it in the installed Chrome where Playwright's Chromium is missing.
"""
import asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = f'file:///{ROOT.as_posix()}/dist/games/starter/index.html'
FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fails = []


def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)


async def open_page(p, query=''):
    b = await p.chromium.launch(args=FLAGS, channel=os.environ.get('PIXELITE_BROWSER_CHANNEL') or None)
    page = await b.new_page(viewport={'width': 1000, 'height': 700})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(URL + query + '#2d'); await page.wait_for_timeout(800)
    return b, page, errs


async def main():
    manifest = json.loads((ROOT / 'engine/engine.json').read_text())
    async with async_playwright() as p:
        # --- version, pause, input -------------------------------------------------
        b, page, errs = await open_page(p)
        v = await page.evaluate('Pixelite.test.probe().version')
        check(v == manifest['version'], f'the page reports engine {v} (engine.json says {manifest["version"]})')
        await page.evaluate('Pixelite.test.start(); Pixelite.test.step(5)')
        await page.evaluate("Pixelite.pause(true); Input.pressed.add('Space'); Input.pressed.add('Tap'); Input.fireQueued = true")
        await page.wait_for_timeout(250)    # frames run while paused: the presses must be dropped, not saved up
        left = await page.evaluate("[Input.pressed.size, Input.fireQueued, Pixelite.paused]")
        check(left == [0, False, True], f'presses made while paused are dropped ({left})')
        await page.evaluate('Pixelite.pause(false)'); await page.wait_for_timeout(100)
        check(not await page.evaluate('Pixelite.paused'), 'resumes')
        # the page pauses itself when hidden
        await page.evaluate("Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'))")
        check(await page.evaluate('Pixelite.paused'), 'a hidden page pauses itself')
        await page.evaluate("Object.defineProperty(document, 'hidden', { value: false, configurable: true }); Pixelite.pause(false)")
        # --- errors: dev overlay names the file, a player sees one line ---------------
        await page.evaluate("setTimeout(() => { throw new Error('boom') }, 0)"); await page.wait_for_timeout(200)
        n = await page.evaluate('Pixelite.errors.length')
        check(n >= 1, 'a thrown error is recorded (Pixelite.errors)')
        check(await page.evaluate("!!document.getElementById('pixeliteError')") is False, 'a player page shows no overlay (the HUD line instead)')
        await b.close()
        b, page, errs = await open_page(p, '?dev')
        await page.evaluate("setTimeout(() => { throw new Error('boom') }, 0)"); await page.wait_for_timeout(200)
        check(await page.evaluate("document.getElementById('pixeliteError')?.textContent.includes('boom')"), '?dev shows an overlay with the message')
        await page.evaluate("defineMaterial('x', { colour: 1 })")
        await b.close()
        # --- the clock, record and replay -------------------------------------------
        async def run(query, steps_fn):
            b, page, errs = await open_page(p, query)
            await page.evaluate('Pixelite.test.start(); Pixelite.test.freeze()')   # frozen: only the test steps the game
            out = await steps_fn(page)
            await b.close(); return out
        async def recorded(page):
            await page.evaluate("Pixelite.test.record()")
            await page.evaluate("Pixelite.test.step(30, ['ArrowUp']); Pixelite.test.step(60, ['ArrowRight']); Pixelite.test.tap(100, 40); Pixelite.test.step(90, ['ArrowRight', 'Space'])")
            log = await page.evaluate("Pixelite.test.stop()")
            return log, await page.evaluate('Pixelite.test.hash()'), await page.evaluate('JSON.stringify(Pixelite.test.probe().game)')
        log, h1, g1 = await run('?seed=1234', recorded)
        check(len(log['steps']) == 4 and log['seed'] == 1234, 'the log has the steps and the seed')
        async def replayed(page):
            await page.evaluate('(log) => Pixelite.test.replay(log)', log)
            return await page.evaluate('Pixelite.test.hash()'), await page.evaluate('JSON.stringify(Pixelite.test.probe().game)')
        h2, g2 = await run('?seed=1234', replayed)
        check(h1 == h2 and g1 == g2, f'the same seed and inputs give the same world and game state ({h1} {h2})')
        h3, g3 = await run('?seed=99', replayed)
        check(h3 != h1, 'another seed gives another world')
        # draw time is the simulation clock: two renders of a frozen frame are identical
        b, page, errs = await open_page(p, '?seed=5')
        await page.evaluate('Pixelite.test.start(); Pixelite.test.step(40); Pixelite.test.freeze()')
        a = await page.evaluate("(() => { Pixelite.test.render(); const c = document.getElementById('screen'); return c.toDataURL ? c.toDataURL().length : 0 })()")
        await page.wait_for_timeout(300)
        c2 = await page.evaluate("(() => { Pixelite.test.render(); const c = document.getElementById('screen'); return c.toDataURL ? c.toDataURL().length : 0 })()")
        check(a == c2, 'a frozen frame renders the same later (the draw clock is the simulation clock)')
        await b.close()
        # --- the stage timers (Pixelite.perf), the F3 box -----------------------------
        b, page, errs = await open_page(p, '?seed=5')
        await page.evaluate('Pixelite.test.start(); Pixelite.test.freeze(); Pixelite.perf.reset()')
        m = await page.evaluate("(() => { for (let i = 0; i < 12; i++) { Pixelite.test.step(1); Pixelite.test.render(); } return Pixelite.perf.mean(); })()")
        check(all(k in m for k in ('step', 'light', 'scene', 'gameDraw', 'hud', 'present', 'draw')), f'perf.mean() has every stage ({sorted(m)})')
        check(m['light'] > 0 and m['scene'] > 0 and m['step'] >= 0, f'the stages measure work ({m})')   # a step can be under the clock's 0.1 ms tick
        check(abs(m['draw'] - (m['light'] + m['scene'] + m['gameDraw'] + m['hud'] + m['present'])) < .05, 'draw is the sum of its stages')
        pr = await page.evaluate('Pixelite.test.probe().perf')
        check(set(pr) == set(m), 'probe().perf carries the same stages')
        await page.keyboard.press('F3')
        shown = await page.evaluate('Pixelite.perf.show')
        await page.evaluate('Pixelite.test.render()')
        text = await page.evaluate("(() => { let s = ''; for (let r = 0; r < R.hrows; r++) { for (let c = 0; c < R.hcols; c++) { const g = R.hG[r * R.hcols + c]; s += g >= 32 && g < 127 ? String.fromCharCode(g) : ' '; } s += '\\n'; } return s; })()")
        check(shown and 'PERF (F3)' in text and 'present' in text, 'F3 shows the stage times on the HUD')
        await page.keyboard.press('F3')
        check(not await page.evaluate('Pixelite.perf.show'), 'F3 again hides them')
        await b.close()
    print('FAILED: ' + '; '.join(fails) if fails else 'PASS: engine in the browser')
    sys.exit(1 if fails else 0)

asyncio.run(main())
