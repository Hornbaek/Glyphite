#!/usr/bin/env python3
"""The look packages of the engine plan in real pages, in both renderers: the sun from either side (E1), layers in front and far behind (E5), glowing
sprites (E3), the back wall's shadows (E4), the screen palette and post effects (E6), zoom (E7), weather and time of day (E8).

  python3 tests/engine_look.py [2d|gl ...]      (build first: node tools/pixelite.mjs build)
  python tools/with_chrome.py tests/engine_look.py 2d

Each check looks at what the renderer really drew: the engine's own pixel buffers (R.wPix, R.sPix) and a screenshot of the canvas, so a shader that
disagrees with the 2D path shows up. The host is the starter game with its hooks taken away (LT.bare), so every scene is built here. Exits 1 and prints
what failed. PIXELITE_BROWSER_CHANNEL=chrome (or tools/with_chrome.py) uses the installed Chrome.
"""
import io, json, os, pathlib, sys
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'dist' / 'games' / 'starter' / 'index.html'
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


# The helpers every scene uses. LT.bare(w, h) takes the starter's hooks away and builds a bare world: a flat rock ground (its top row is row h - 40), the camera
# at (cx0, h - rows) so the ground is in the lower part of the screen; LT.at(cx, cy) is where a world cell is on the canvas (device pixels).
HELPERS = """() => {
  window.LT = {
    rock: null,
    bare(w = 360, h = 160, opts = {}) {
      Pixelite.test.start(); Pixelite.test.freeze();
      for (const k of ['update', 'camera', 'draw', 'lights', 'markDyn', 'hud', 'chunkStep', 'onBlast', 'sky', 'skyBegin', 'drawFront']) GAME[k] = null;
      GAME.stars = 0; setCamera(null);
      if (!LT.rock) LT.rock = defineMaterial('lt-rock', { albedo: [.6, .56, .5], shades: 6 });
      worldMaterials({ edge: LT.rock, rubble: LT.rock, fill: LT.rock });
      R.bloom = false; worldInit(w, h); setEyeAdaptation(0); EYE.e = 1; setAtmosphere(0); setAmbient([.14, .16, .22]); setSun(35, [1.15, 1.1, 1]);
      for (let y = h - 40; y < h; y++) for (let x = 0; x < w; x++) cells[y * w + x] = LT.rock;
      updateSkyline(); worldChanged();
      LT.cam(opts.cx ?? 60);
      return { cols: R.cols, rows: R.rows, cw: R.cw, w, h };
    },
    cam(cx) { cam.x = cx; cam.y = Math.max(0, H - R.rows); },
    block(x0, y0, x1, y1, m = LT.rock) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * W + x] = m; updateSkyline(); worldChanged(); },
    frame(n = 2) { for (let i = 0; i < n; i++) Pixelite.test.render(); },
    // the colour the world buffer holds at a world cell, and the same cell in the engine's world pixel buffer
    buf(cx, cy) { const i = cx - L_OX, j = cy - L_OY, k = (j * R.RW + i) * 4; return [R.wPix[k], R.wPix[k + 1], R.wPix[k + 2], R.wPix[k + 3]]; },
    at(cx, cy) { return [(cx - cam.x) * R.cw + R.cw / 2, (cy - cam.y) * R.chh + R.chh / 2]; }
  };
  return true;
}"""


def boot(p, mode, query=''):
    b = p.chromium.launch(args=ARGS[mode], channel=os.environ.get('PIXELITE_BROWSER_CHANNEL') or None)
    pg = b.new_page(viewport={'width': 1000, 'height': 700})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(PAGE.as_uri() + query + '#' + mode)
    pg.wait_for_timeout(700)
    pg.evaluate(HELPERS)
    return b, pg, errs


def shot(pg):
    """the canvas as the renderer drew it: an array [rows, cols, 3] in device pixels (the page has a device pixel ratio of 1)"""
    return np.array(Image.open(io.BytesIO(pg.locator('#screen').screenshot())).convert('RGB')).astype(int)


def px(img, pg, cx, cy):
    x, y = pg.evaluate(f'LT.at({cx}, {cy})')
    return img[int(y), int(x)]


def lum(c):
    return .3 * c[0] + .59 * c[1] + .11 * c[2]


def e1_sun_sides(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    ground = pg.evaluate('H - 40')
    pg.evaluate(f'LT.block(170, {ground} - 45, 186, {ground})')   # a pillar of rock on the ground
    pg.evaluate(f'for (let y = {ground} - 80; y < {ground}; y++) for (let x = 0; x < W; x++) if (cells[y * W + x] === 0) backCells[y * W + x] = LT.rock')   # a wall behind it all: its brightness is the sunlight in the air in front of it
    y = ground - 8
    out = {}
    for name, sun in (('left', 55), ('right', 125)):
        pg.evaluate(f'setSun({sun}, [1.15, 1.1, 1]); LT.frame(3)')
        img = shot(pg)
        out[name] = {'west': lum(px(img, pg, 150, y)), 'east': lum(px(img, pg, 200, y)),
                     'bufwest': lum(pg.evaluate(f'LT.buf(150, {y})')), 'bufeast': lum(pg.evaluate(f'LT.buf(200, {y})'))}
    o = out
    check(f'E1 {mode}: sun on the left: the pillar shades the wall to its right', o['left']['east'] < .6 * o['left']['west'], o['left'])
    check(f'E1 {mode}: sun on the right: the shadow is on the left, the right is lit', o['right']['west'] < .6 * o['right']['east'], o['right'])
    check(f'E1 {mode}: the buffers say what the canvas shows', all(abs(o[k][a] - o[k]['buf' + a]) < 3 for k in o for a in ('west', 'east')), o)
    mirror = pg.evaluate('(() => { setSun(35); const a = SUN_L[0]; setSun(145); return [a, SUN_L[0], SUN_EL]; })()')
    check(f'E1 {mode}: 145 degrees is 35 degrees from the other side', abs(mirror[0] + mirror[1]) < 1e-9 and mirror[2] == 145, mirror)
    check(f'E1 {mode}: no page errors', not errs, errs[:2])
    b.close()


def run(mode):
    print(f'--- {mode}')
    with sync_playwright() as p:
        e1_sun_sides(p, mode)


if __name__ == '__main__':
    modes = sys.argv[1:] or ['2d', 'gl']
    for m in modes:
        run(m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all look checks passed')
    sys.exit(1 if failures else 0)
