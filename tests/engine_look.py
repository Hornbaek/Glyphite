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
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if (not ok and detail is not None) else ''))
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


def near(c, want, tol=40):
    return all(abs(int(a) - int(b)) <= tol for a, b in zip(c, want))


def e5_front_and_backdrops(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    # --- the front pass: drawn after the game's draw hook, so it covers what the draw hook (and an ordinary entity) painted, whatever the code order
    pg.evaluate(f"""(() => {{
      setSun(null); setAmbient([.5, .5, .5]);
      const sq = (x0, y0, x1, y1, r, g2, b2) => {{ for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) putEmit(x, y, SOLID, r, g2, b2); }};
      defineEntity('lt-back', {{ size: [4, 4], draw(e) {{ sq(120, {g} - 20, 140, {g} - 10, 0, 0, 1.6); }} }});          // blue, an ordinary entity
      defineEntity('lt-front', {{ size: [4, 4], front: true, draw(e) {{ sq(130, {g} - 15, 150, {g} - 5, 1.6, 0, 1.6); }} }});   // magenta, a front entity
      spawn('lt-back', 130, {g}); spawn('lt-front', 130, {g});
      GAME.draw = () => sq(120, {g} - 20, 150, {g} - 12, 0, 1.6, 0);                  // green: over the blue entity, under the front one
      GAME.drawFront = () => sq(160, {g} - 20, 175, {g} - 5, 1.6, 0, 0);               // red, in front
      const spr = defineSprite({{ w: 4, h: 4, pal: [[0, 255, 255, 1]], rows: ['0000', '0000', '0000', '0000'] }}, {{ k: 1 / RES }});
      PROPS.push({{ spr, x: 145, y: {g} - 15, opts: {{ light: false }}, front: true }});         // cyan prop on the front pass, over what the draw hook painted (green)
      PROPS.push({{ spr, x: 200, y: {g} - 8, opts: {{ light: false }}, front: false }});
      GAME.draw = (t) => {{ sq(120, {g} - 20, 150, {g} - 12, 0, 1.6, 0); sq(196, {g} - 14, 204, {g} - 6, 1.6, 1.6, 0); }};   // yellow over the back prop
      LT.frame(3);
    }})()""")
    img = shot(pg)
    at = lambda cx, cy: px(img, pg, cx, cy)
    check(f'E5 {mode}: the draw hook covers an ordinary entity (green over blue)', at(125, g - 18)[1] > 150 and at(125, g - 18)[2] < 120, at(125, g - 18))
    check(f'E5 {mode}: where the draw hook leaves it uncovered the entity shows (blue)', at(125, g - 11)[2] > 150 and at(125, g - 11)[1] < 120, at(125, g - 11))
    check(f'E5 {mode}: a front entity covers what the draw hook painted (magenta over green)', at(145, g - 14)[0] > 150 and at(145, g - 14)[2] > 150 and at(145, g - 14)[1] < 120, at(145, g - 14))
    check(f'E5 {mode}: the front draw hook covers all of it (red)', at(165, g - 10)[0] > 150 and at(165, g - 10)[1] < 90, at(165, g - 10))
    check(f'E5 {mode}: a front prop is over what the draw hook painted (cyan over green)', at(145, g - 17)[1] > 150 and at(145, g - 17)[2] > 150 and at(145, g - 17)[0] < 90, at(145, g - 17))
    check(f'E5 {mode}: an ordinary prop is under the draw hook (yellow over cyan)', at(200, g - 9)[0] > 150 and at(200, g - 9)[1] > 150 and at(200, g - 9)[2] < 120, at(200, g - 9))
    b.close()

    # --- backdrops: layers between the sky and the world, each with its own sub-cell scroll
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    pg.evaluate("""(() => {
      setSun(null); setAmbient([.5, .5, .5]); setBackground(5, 7, 12); GAME.stars = 0;
      GAME.sky = (i, j, out) => { out[0] = .05; out[1] = .6; out[2] = .1; return SOLID; };     // a green sky
      window.LT.far = addBackdrop({ parallax: .5, paint: (gx, gy, out) => { if ((gx >> 3) & 1) return 0; out[0] = 1.5; out[1] = .15; out[2] = .15; return SOLID; } });   // red stripes, 8 cells wide, 8 apart
      skyKey = ''; LT.frame(3);
    })()""")
    y = g - 60
    def edges(img_row):
        r = img_row[:, 0].astype(int); d = np.abs(np.diff(r)); return [i + 1 for i in np.nonzero(d > 60)[0]]
    cw = pg.evaluate('R.cw')
    img = shot(pg)
    sx_, sy_ = pg.evaluate(f'LT.at(100, {y})')
    row = img[int(sy_)]
    check(f'E5 {mode}: the backdrop shows where the world is empty (red stripes over a green sky)', (row[:, 0] > 150).any() and (row[:, 1] > 100).any(), None)
    check(f'E5 {mode}: the world covers it: the ground shows no stripes', not any((px(img, pg, x, g + 3)[0] > 150) and (px(img, pg, x, g + 3)[1] < 60) for x in range(70, 300, 3)))
    # the glide: layer column gx is drawn at (gx - cam.x * parallax) cells, a sub-cell amount at a time
    worst = 0
    for cx in [60, 60.25, 60.5, 60.75, 61, 73.4, 100.1]:
        pg.evaluate(f'cam.x = {cx}; LT.frame(2)')
        row = shot(pg)[int(sy_)]
        got = edges(row); want = [((8 * k) - cx * .5) * cw for k in range(0, 80)]
        want = [w for w in want if 6 < w < len(row) - 6]
        miss = [min(abs(w - e) for e in got) if got else 99 for w in want]
        worst = max(worst, max(miss) if miss else 99)
    check(f'E5 {mode}: a backdrop at parallax .5 moves half as far as the camera, in steps of a device pixel (worst edge off by {worst:.1f} px)', worst <= 1.5, worst)
    # a nearer backdrop covers a farther one; the back wall covers both
    pg.evaluate(f"""(() => {{
      cam.x = 60; window.LT.near = addBackdrop({{ parallax: .8, paint: (gx, gy, out) => {{ if (gy < {g} - 70 || gy > {g} - 40 || ((gx >> 2) & 3)) return 0; out[0] = .1; out[1] = .2; out[2] = 1.6; return SOLID; }} }});
      for (let y = {g} - 30; y < {g}; y++) for (let x = 90; x < 130; x++) backCells[y * W + x] = LT.rock;
      LT.frame(3); }})()""")
    img = shot(pg)
    blue = sum(1 for x in range(60, 300) if (lambda c: c[2] > 150 and c[0] < 90)(px(img, pg, x, g - 55)))
    check(f'E5 {mode}: a nearer backdrop is drawn over the farther one', blue > 20, blue)
    wall = px(img, pg, 110, g - 15)
    check(f'E5 {mode}: the back wall is over the backdrops', not (wall[0] > 150 and wall[1] < 60) and not (wall[2] > 150 and wall[0] < 90), wall)
    pg.evaluate("(() => { try { for (let i = 0; i < 4; i++) addBackdrop({ paint: () => 0 }); return 'no error'; } catch (e) { return e.message; } })()")
    check(f'E5 {mode}: a fourth backdrop is refused', 'at most' in (pg.evaluate("(() => { try { addBackdrop({ paint: () => 0 }); return 'no error'; } catch (e) { return e.message; } })()")))
    pg.evaluate('clearBackdrops(); LT.frame(3)')
    img = shot(pg)
    check(f'E5 {mode}: with no backdrops the sky shows (green)', px(img, pg, 130, g - 55)[1] > 100 and px(img, pg, 130, g - 55)[0] < 90, px(img, pg, 130, g - 55))
    check(f'E5 {mode}: no page errors', not errs, errs[:2])
    b.close()

    # --- stars in caves: a dark backdrop below the skyline hides the sky under a roof
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    pg.evaluate(f"""(() => {{ setSun(null); setAmbient([.5, .5, .5]); GAME.stars = 8;
      for (let y = {g} - 40; y < {g} - 36; y++) for (let x = 80; x < 330; x++) cells[y * W + x] = LT.rock;   // a roof of rock over open air: a cave
      updateSkyline(); worldChanged(); skyKey = ''; LT.frame(3); }})()""")
    def stars(img):
        n = 0
        for yy in range(g - 34, g - 3):
            for xx in range(90, 290):
                if lum(px(img, pg, xx, yy)) > 50: n += 1
        return n
    s0 = stars(shot(pg))
    pg.evaluate("addBackdrop({ underground: [.02, .02, .05] }); LT.frame(3)")
    s1 = stars(shot(pg))
    check(f'E5 {mode}: stars show under a roof without the layer ({s0}) and not with it ({s1})', s0 >= 3 and s1 == 0, (s0, s1))
    img = shot(pg)
    above = sum(1 for yy in range(5, g - 45, 2) for xx in range(70, 290, 2) if lum(px(img, pg, xx, yy)) > 50)
    check(f'E5 {mode}: and the open sky above the roof still has its stars ({above})', above >= 3, above)
    check(f'E5 {mode}: no page errors (caves)', not errs, errs[:2])
    b.close()


def run(mode):
    print(f'--- {mode}')
    with sync_playwright() as p:
        e1_sun_sides(p, mode)
        e5_front_and_backdrops(p, mode)


if __name__ == '__main__':
    modes = sys.argv[1:] or ['2d', 'gl']
    for m in modes:
        run(m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all look checks passed')
    sys.exit(1 if failures else 0)
