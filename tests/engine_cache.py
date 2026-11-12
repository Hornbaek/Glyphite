#!/usr/bin/env python3
"""The lamp cache and the still-frame reuse must not change a single number (engine/API.md, Performance).

  python3 tests/engine_cache.py                      # every built game, both renderers (build first: node tools/pixelite.mjs build)
  python tools/with_chrome.py tests/engine_cache.py regolith --renderers 2d --res 2,3

For each game, renderer and detail level it plays the same scene three times in one page, from the same seed:
  off     both caches switched off (Pixelite.cache.lamps / still = false): every frame worked out from scratch,
  on      caches on, as a player has them,
  audit   caches on and every cached thing re-worked-out and compared (Pixelite.cache.audit): the engine's own check; `bad` must stay 0.
After every frame it takes a checksum of what the frame made, bit for bit: the world and sky pixels, the light buffers (colour and direction), the
checksum of the world, the exposure. `on` and `audit` must equal `off` frame by frame.
The scene: a still stretch with the clock running (flickering lamps, crystals and glints follow it), the camera moving, then a change of
everything the caches depend on, each after a still stretch so the caches are warm: the sun, the ambient light, a block of world built under a
lamp, the back wall written by hand, a material changed, an explosion (sand, chunks, heat), a glowing spark, heat on the ground. Also that the caches
were used: lamps served from the cache, still frames reused (the base for sure; the terrain too in at least one game).
Exits 1 and prints what failed. PIXELITE_BROWSER_CHANNEL=chrome (or tools/with_chrome.py) uses the installed Chrome.
"""
import argparse, asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLAGS = {'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], '2d': ['--disable-gpu']}

SCENE = """([res, keys, mode]) => {
  const fnv = u8 => { let h = 2166136261 | 0; for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619); return h >>> 0; };
  const f32 = a => fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const hashes = () => ({ world: fnv(R.wPix), sky: fnv(R.sPix), lr: f32(LR), lg: f32(LG), lb: f32(LB), ldx: f32(LDX), ldy: f32(LDY), cells: Pixelite.test.hash(), eye: EYE.e });
  const draw1 = t => { clockT = t; Pixelite.test.render(t); };   // (a game may draw its animations from clockT: the frame loop's, which is wall time; so set it too)
  const frames = [], base = [], terr = [], lampHits = [];
  const rec = tag => { const h = hashes(); h.tag = tag; frames.push(h); base.push(Pixelite.cache.baseHit); terr.push(Pixelite.cache.terrainHit); lampHits.push(Pixelite.cache.hit); };
  const C = Pixelite.cache; C.lamps = C.still = mode !== 'off'; C.audit = mode === 'audit'; C.bad = 0;
  Pixelite.seed(7); EYE.e = 1; EYE.t = -1; Beat.v = 0; Beat.t = -1; Beat.last = 0; setDetail(res); EYE.e = 1; EYE.t = -1;
  Pixelite.test.start(); Pixelite.test.step(90, keys); Pixelite.test.freeze();
  for (let i = 0; i < 5; i++) { Pixelite.test.step(3, keys); for (let k = 0; k < 3; k++) { draw1(6 + i * .1); rec('move' + i + '.' + k); } }
  Pixelite.test.step(200);   // let it settle: sparks, dust and the sand's grains die away
  for (let i = 0; i < 14; i++) { draw1(5 + i * .05); rec('clock' + i); }
  // a solid cell with air above it, in view (else the camera goes to one near the middle of the world), to change things at
  const find = (x0, x1, y0, y1) => { for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) if (cells[cy * W + cx] !== EMPTY && cells[(cy - 1) * W + cx] === EMPTY) return [cx, cy]; return null; };
  let at = find(Math.max(4, L_OX + 10), Math.min(W - 4, L_OX + R.RW - 40), Math.max(9, L_OY + 6), Math.min(H - 2, L_OY + R.RH - 30));
  if (!at) { at = find(W >> 1, (W >> 1) + 30, 9, H - 2); if (at) { cam.x = clamp(at[0] - R.cols / 2, 0, Math.max(0, W - R.cols)); cam.y = at[1] - R.rows / 2; for (let k = 0; k < 4; k++) draw1(7); } }
  const sx = at ? at[0] : -1, sy = at ? at[1] : -1;
  const mid = sx >= 0 ? cells[sy * W + sx] : 1, bm = Math.max(1, Math.min(MATS.length - 1, mid));
  const perturb = [
    ['sun', () => setSun(SUN_ON ? SUN_EL + 12 : 40)],
    ['ambient', () => setAmbient([AMB_C[0] + .12, AMB_C[1] + .08, AMB_C[2] + .02])],
    ['block', () => { for (let q = 0; q < 6; q++) for (let r = 0; r < 4; r++) setC(sx + 5 + q, sy - 10 - r, mid); }],
    ['back', () => { for (let j = 10; j < 40; j++) for (let i = 10; i < 60; i++) { const cx = L_OX + i, cy = L_OY + j; if (cx < W && cy < H) backCells[cy * W + cx] = bm; } }],
    ['material', () => setMaterial(bm, { albedo: [.9, .35, .3] })],
    ['heat', () => { for (let q = 0; q < 8; q++) addHeat(sx + q, sy, .9); }, () => { for (let q = 0; q < 8; q++) heat[sy * W + sx + q] = 0; }],
    ['spark', () => spawnP(PT_SPARK, L_OX + R.RW / 2, (L_OY + R.RH / 2) * ASPECT, 0, 0, 4, 42, 0), () => { P.n = 0; }],
    ['blast', () => explode(sx + 12, (sy - 2) * ASPECT, 7 * RES, 1.1, true)]
  ];
  for (const [name, fn, undo] of perturb) {
    if (sx < 0 && !['sun', 'ambient', 'back', 'material', 'spark'].includes(name)) continue;   // (an isometric game has no solid cells to build on or heat)
    for (let k = 0; k < 5; k++) { draw1(7); rec(name + '.warm' + k); }
    fn();
    for (let k = 0; k < 5; k++) { draw1(7); rec(name + '.' + k); }
    if (undo) { undo(); for (let k = 0; k < 4; k++) { draw1(7); rec(name + '.undone' + k); } }
    if (name === 'blast') for (let i = 0; i < 8; i++) { Pixelite.test.step(2); draw1(7); rec('blast.step' + i); draw1(7); rec('blast.step' + i + 'b'); }
  }
  return { frames, base, terr, lampHits, bad: C.bad };
}"""


async def run(p, gid, renderer, res, keys, mode):
    kw = {'channel': os.environ['PIXELITE_BROWSER_CHANNEL']} if os.environ.get('PIXELITE_BROWSER_CHANNEL') else {}
    b = await p.chromium.launch(args=FLAGS[renderer], **kw)
    page = await b.new_page(viewport={'width': 1280, 'height': 800})
    await page.add_init_script('Math.random = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();')   # the 404 game and sound use it
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type in ('warning', 'error') and 'stale' in m.text else None)
    await page.goto(f'file:///{ROOT.as_posix()}/dist/games/{gid}/index.html?seed=7&path=/test#{renderer}')
    await page.wait_for_timeout(700)
    out = await page.evaluate(SCENE, [res, keys, mode])
    await b.close()
    out['errs'] = errs[:3]
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('games', nargs='*')
    ap.add_argument('--renderers', default='2d,gl')
    ap.add_argument('--res', default='2')
    a = ap.parse_args()
    listing = json.loads((ROOT / 'dist' / 'games.json').read_text())
    ids = a.games or [g['id'] for g in listing['games']]
    known = {g['id']: g for g in listing['games']}
    bad, terrain_somewhere = 0, 0
    async with async_playwright() as p:
        for gid in ids:
            if gid not in known: sys.exit(f'no built game "{gid}" (run: node tools/pixelite.mjs build)')
            manifest = json.loads((ROOT / known[gid]['path'] / 'game.json').read_text())
            keys = manifest.get('smoke', {}).get('keys', ['ArrowUp', 'ArrowRight', 'Space'])
            for r in a.renderers.split(','):
                for res in [float(x) for x in a.res.split(',') if x]:
                    off, on, aud = [await run(p, gid, r, res, keys, m) for m in ('off', 'on', 'audit')]
                    problems = []
                    for name, got in (('on', on), ('audit', aud)):
                        d = [f['tag'] for f, g in zip(off['frames'], got['frames']) if any(f[k] != g[k] for k in f if k != 'tag')]
                        if d or len(off['frames']) != len(got['frames']): problems.append(f'{name} differs from off at {d[:6]}')
                    if aud['bad']: problems.append(f"the audit found {aud['bad']} stale cache(s)")
                    if off['errs'] or on['errs'] or aud['errs']: problems.append(f"errors {off['errs'] + on['errs'] + aud['errs']}")
                    base, terr, lamps = sum(on['base']), sum(on['terr']), max(on['lampHits'])
                    if base < 8: problems.append(f'the base was reused in only {base} frames')
                    terrain_somewhere += terr
                    bad += bool(problems)
                    print(f"{'FAIL' if problems else 'ok  '} {gid:10s} {r:3s} res{res:g}  {len(on['frames'])} frames: base reused {base}, terrain reused {terr}, most lamps cached in a frame {lamps}"
                          + (f"\n     {'; '.join(problems)}" if problems else ''), flush=True)
    if not terrain_somewhere: bad += 1; print('FAIL the terrain was never reused in any game')
    print('FAIL: the caches changed output or did not work' if bad else 'PASS: caches change no number')
    sys.exit(1 if bad else 0)

asyncio.run(main())
