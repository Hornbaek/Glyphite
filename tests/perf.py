#!/usr/bin/env python3
"""Where a frame's time goes: the engine's stage timers (Pixelite.perf) for every game, both renderers, two detail levels, two screen sizes.

  python tools/with_chrome.py tests/perf.py                          # every built game (build first: node tools/pixelite.mjs build)
  python tools/with_chrome.py tests/perf.py regolith --renderers 2d --res 2 --sizes 1280x800
  python tools/with_chrome.py tests/perf.py --json before.json       # keep the numbers ...
  python tools/with_chrome.py tests/perf.py --compare before.json    # ... and print the change against them later
  python tools/with_chrome.py tests/perf.py --caches off             # the lamp cache and the still-frame reuse switched off (the same tree, to see what they give)
  python3 tests/perf.py                                              # (where Playwright's own Chromium is installed)

For each game x renderer x RES x viewport it opens the built page, starts the game, steps a scene and times 40 frames, each one
`Pixelite.test.step(1)` plus `Pixelite.test.render()`, in two scenes: PLAY (the game's smoke keys held: the camera and the player move) and
IDLE (no keys, after 300 settled steps: the case the lamp cache and the still-frame reuse are for). It prints the mean milliseconds per
frame of each stage (engine/API.md, Performance):

  step     one fixed step of the simulation        light    skyline, shadow marks, lamps, sun
  scene    terrain, particles, chunks, effects     game     the game's own draw hook
  tone     of which the last pass over the cells: the tone map, the vignette, the bytes (P4's target)
  hud      the HUD (and the F3 overlay)            present  handing the picture to WebGL or the canvas (the CPU's part)
  gpu      present with `Pixelite.perf.sync` on: a pixel is read back, so the wait for the picture is counted too
  draw     light + scene + game + hud + present (tone is inside scene)

The JavaScript stages (step, light, scene, game, hud) mean the same everywhere. `present` and `gpu` do not: headless Chrome has no GPU, so
WebGL is SwiftShader (software) and the 2D canvas is software too. Their absolute numbers say little about a real machine; use them to compare
before and after, and read `light` and `scene` as the real ones. Numbers vary by a few percent from run to run (other processes, the clock).
"""
import argparse, asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLAGS = {'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], '2d': ['--disable-gpu']}
STAGES = ['step', 'light', 'scene', 'tone', 'gameDraw', 'hud', 'present', 'draw']

LOOP = """([n, keys, sync]) => {
  Pixelite.perf.sync = sync; Pixelite.perf.reset();
  for (let i = 0; i < n; i++) { Pixelite.test.step(1, keys); Pixelite.test.render(); }
  const m = Pixelite.perf.mean(); Pixelite.perf.sync = false; return m;
}"""


async def measure(p, gid, renderer, res, size, frames, keys, caches):
    w, h = size
    kw = {'channel': os.environ['PIXELITE_BROWSER_CHANNEL']} if os.environ.get('PIXELITE_BROWSER_CHANNEL') else {}   # tools/with_chrome.py sets one itself
    browser = await p.chromium.launch(args=FLAGS[renderer], **kw)
    page = await browser.new_page(viewport={'width': w, 'height': h})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    out = {}
    try:
        await page.goto(f'file:///{ROOT.as_posix()}/dist/games/{gid}/index.html?seed=7#{renderer}')
        await page.wait_for_timeout(900)
        await page.evaluate(f'setDetail({res})')
        if not caches: await page.evaluate('Pixelite.cache.lamps = Pixelite.cache.still = false')
        await page.evaluate('Pixelite.test.start(); Pixelite.test.freeze()')
        info = await page.evaluate('({ r: Pixelite.test.probe().renderer, cols: R.cols, rows: R.rows, world: [W, H] })')
        out['info'] = info
        await page.evaluate(f'Pixelite.test.step(120, {json.dumps(keys)}); Pixelite.test.render()')   # warm up the JIT on a moving scene
        await page.evaluate(LOOP, [10, keys, False])
        play = await page.evaluate(LOOP, [frames, keys, False])
        play['gpu'] = (await page.evaluate(LOOP, [frames, keys, True]))['present']
        await page.evaluate('Pixelite.test.step(300)')      # let the sand, the dust and the particles settle
        await page.evaluate(LOOP, [10, [], False])
        idle = await page.evaluate(LOOP, [frames, [], False])
        idle['gpu'] = (await page.evaluate(LOOP, [frames, [], True]))['present']
        idle['particles'] = await page.evaluate('P.n')
        out['play'], out['idle'] = play, idle
    except Exception as e:
        out['error'] = f'{type(e).__name__}: {e}'
    if errors: out['errors'] = errors[:3]
    await browser.close()
    return out


def row(label, m, ref=None):
    cells = []
    for s in STAGES[:-1] + ['gpu', 'draw']:
        v = m.get(s, 0)
        cells.append(f'{v:7.2f}' if ref is None else f'{v:7.2f}{(100 * (v - ref[s]) / ref[s] if ref.get(s, 0) > .05 else 0):+5.0f}%')
    return f'  {label:5s}' + ' '.join(cells)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('games', nargs='*')
    ap.add_argument('--renderers', default='2d,gl')
    ap.add_argument('--res', default='2,3')
    ap.add_argument('--sizes', default='1280x800,2560x1440')
    ap.add_argument('--frames', type=int, default=40)
    ap.add_argument('--caches', default='on', choices=['on', 'off'], help='off: the lamp cache and the still-frame reuse switched off')
    ap.add_argument('--json', help='write the numbers here')
    ap.add_argument('--compare', help='a file written by --json: print the change against it')
    a = ap.parse_args()
    listing = json.loads((ROOT / 'dist' / 'games.json').read_text())
    ids = a.games or [g['id'] for g in listing['games']]
    known = {g['id']: g for g in listing['games']}
    for gid in ids:
        if gid not in known: sys.exit(f'no built game "{gid}" (run: node tools/pixelite.mjs build)')
    before = json.loads(pathlib.Path(a.compare).read_text()) if a.compare else {}
    results, failed = {}, 0
    head = '  scene ' + ' '.join(f'{s:>7s}' if a.compare is None else f'{s:>12s}' for s in STAGES[:-1] + ['gpu', 'draw'])
    async with async_playwright() as p:
        for gid in ids:
            manifest = json.loads((ROOT / known[gid]['path'] / 'game.json').read_text())
            keys = manifest.get('smoke', {}).get('keys', ['ArrowUp', 'ArrowRight', 'Space'])
            for renderer in a.renderers.split(','):
                for sz in a.sizes.split(','):
                    size = tuple(int(x) for x in sz.split('x'))
                    for res in [float(x) for x in a.res.split(',') if x]:
                        key = f'{gid}/{renderer}/{sz}/res{res:g}'
                        r = await measure(p, gid, renderer, res, size, a.frames, keys, a.caches == 'on')
                        results[key] = r
                        if 'error' in r or r.get('errors'):
                            failed += 1; print(f'{key}: FAILED {r.get("error") or r["errors"]}', flush=True); continue
                        i = r['info']
                        print(f'{key}   {i["cols"]}x{i["rows"]} cells, world {i["world"][0]}x{i["world"][1]}, {i["r"]}, {r["idle"]["particles"]} particles when idle', flush=True)
                        print(head)
                        for name in ('play', 'idle'):
                            ref = before.get(key, {}).get(name)
                            print(row(name, r[name], ref if ref and a.compare else None), flush=True)
    if a.json: pathlib.Path(a.json).write_text(json.dumps(results, indent=1))
    print(f'{"FAIL" if failed else "done"}: {len(results)} runs, {failed} failed')
    sys.exit(1 if failed else 0)

asyncio.run(main())
