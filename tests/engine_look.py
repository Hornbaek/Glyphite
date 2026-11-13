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
      say = () => {}; FEED.length = 0;   // (the feed's message box lives on the wall clock, 1.6 s: on a slow machine it was in some of a test's pictures and not in others)
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


def e3_glow(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    # a dark scene with a glowing window sprite standing on the ground: its pixels are its own colour, and it lights the ground beside it
    pg.evaluate(f"""(() => {{
      setSun(null); setAmbient([.03, .03, .04]);
      const rows = ['111111', '100001', '100001', '100001', '100001', '111111'], emit = ['......', '.9999.', '.9999.', '.9999.', '.9999.', '......'];
      window.LT.win = defineSprite({{ w: 6, h: 6, pal: [[255, 215, 110, 1], [60, 40, 30, 1]], rows, emit }}, {{ k: 1 / RES, glow: 8, glowGain: .6 }});
      window.LT.plain = defineSprite({{ w: 6, h: 6, pal: [[255, 215, 110, 1], [60, 40, 30, 1]], rows }}, {{ k: 1 / RES }});
      window.LT.on = 1; GAME.draw = () => drawSprite(LT.win, 160, {g} - 4, 0, {{ foot: 0, emit: LT.on }});
      LT.frame(4); }})()""")
    def ground(cx):
        return lum(px(shot(pg), pg, cx, g))
    img = shot(pg)
    near, far = lum(px(img, pg, 168, g)), lum(px(img, pg, 250, g))
    check(f'E3 {mode}: a glowing sprite lights the ground beside it (near {near:.0f}, far {far:.0f})', near > far * 1.5 and near > far + 25, (near, far))
    core = px(img, pg, 160, g - 6)
    check(f'E3 {mode}: its glowing pixels are bright, in its own colour', lum(core) > 120 and core[0] > core[2] * 1.3, core)
    pg.evaluate('LT.on = 0; LT.frame(4)')
    img = shot(pg)
    near0, far0 = lum(px(img, pg, 168, g)), lum(px(img, pg, 250, g))
    core0 = px(img, pg, 160, g - 6)
    check(f'E3 {mode}: emit: 0 switches the lamp off: no light on the ground ({near0:.0f}, {far0:.0f}) and a dimmer pixel', abs(near0 - far0) < 12 and lum(core0) < lum(core), (near0, far0, core0))
    pg.evaluate("GAME.draw = () => drawSprite(LT.plain, 160, " + str(g) + " - 4, 0, { foot: 0 }); LT.frame(4)")
    img = shot(pg)
    check(f'E3 {mode}: the same sprite without an emit layer gives no light', abs(lum(px(img, pg, 168, g)) - lum(px(img, pg, 250, g))) < 12)
    # a sprite that blocks lamp light between a lamp and a wall
    pg.evaluate(f"""(() => {{
      GAME.draw = null; LT.block(200, {g} - 50, 206, {g});
      window.LT.blocker = defineSprite({{ w: 4, h: 8, pal: [[90, 90, 100, 1]], rows: Array(8).fill('0000') }}, {{ k: 1 / RES }});
      window.LT.blocks = true;
      GAME.lights = (t, out) => out.push({{ x: 150, y: {g} - 15, r: 80, c: [1, 1, 1], I: 1.6, shadow: true }});
      GAME.markDyn = () => markSpriteDyn(LT.blocker, 175, {g} - 15, 0, LT.blocks ? {{ blocksLamps: true }} : {{}});
      GAME.draw = () => drawSprite(LT.blocker, 175, {g} - 15, 0);
      LT.frame(4); }})()""")
    shadowed = lum(px(shot(pg), pg, 200, g - 15))
    pg.evaluate('LT.blocks = false; LT.frame(4)')
    lit = lum(px(shot(pg), pg, 200, g - 15))
    pg.evaluate('LT.blocks = true; LT.frame(4)')
    again = lum(px(shot(pg), pg, 200, g - 15))
    check(f'E3 {mode}: a sprite that blocks lamps shades the wall behind it ({shadowed:.0f} against {lit:.0f} when it does not)', lit > shadowed * 1.5 and lit > shadowed + 20 and abs(again - shadowed) < 6, (shadowed, lit, again))
    check(f'E3 {mode}: no page errors (glow)', not errs, errs[:2])
    b.close()


def e4_back_shadows(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    # a rock pillar standing in front of a back wall, lit only by a lamp to its right whose light goes through the rock (shadow: false), so any difference between
    # the two ways of shading comes from the back wall's drop shadow alone
    y = g - 20
    pg.evaluate(f"""(() => {{
      setSun(null); setAmbient([.3, .3, .36]);
      LT.block(170, {g} - 45, 186, {g});
      for (let y = {g} - 80; y < {g}; y++) for (let x = 0; x < W; x++) if (cells[y * W + x] === 0) backCells[y * W + x] = LT.rock;
      window.LT.lampX = 215;
      GAME.lights = (t, out) => out.push({{ x: LT.lampX, y: {y}, r: 90, c: [1, 1, 1], I: 1.2, shadow: false }});
      LT.frame(4); }})()""")
    def cells(lamps):
        pg.evaluate(f'setBackdrop({{ lamps: {str(lamps).lower()} }}); LT.frame(4)')
        img = shot(pg)
        return lum(px(img, pg, 169, y)), lum(px(img, pg, 186, y))   # the wall just left of the pillar and just right of it
    (l_off, r_off), (l_on, r_on) = cells(False), cells(True)
    check(f'E4 {mode}: the fixed direction shades the wall right of the pillar, not the left (left {l_off:.0f}, right {r_off:.0f})', r_off < .8 * l_off, (l_off, r_off))
    check(f'E4 {mode}: with lamps the shadow falls away from the lamp: the left of the pillar is shaded (left {l_on:.0f} against {l_off:.0f})', l_on < .8 * l_off, (l_off, l_on))
    check(f'E4 {mode}: and the right, toward the lamp, is lit (right {r_on:.0f} against {r_off:.0f})', r_on > 1.25 * r_off, (r_off, r_on))
    pg.evaluate('LT.lampX = 400')   # a lamp that does not reach the pillar: both ways of shading must then agree
    f_off, f_on = cells(False), cells(True)
    check(f'E4 {mode}: where no lamp reaches, both ways draw the same wall (off {f_off[0]:.0f}/{f_off[1]:.0f}, on {f_on[0]:.0f}/{f_on[1]:.0f})', abs(f_off[0] - f_on[0]) < 1 and abs(f_off[1] - f_on[1]) < 1, (f_off, f_on))
    pg.evaluate('LT.lampX = 215')
    again = cells(False)
    check(f'E4 {mode}: switching it off again gives the fixed shadow back', abs(again[0] - l_off) < 1 and abs(again[1] - r_off) < 1, (again, l_off, r_off))
    check(f'E4 {mode}: no page errors', not errs, errs[:2])
    b.close()


def e6_post(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare()')
    g = pg.evaluate('H - 40')
    # a lit rock ground under a sky with stars, and a backdrop of hills, so the world, backdrops and sky are all in the picture
    pg.evaluate(f"""(() => {{
      setSun(40, [1.15, 1.1, 1]); setAmbient([.3, .32, .4]); GAME.stars = 30; skyKey = '';   // (the star density is not in the sky's cache key: make it look again)
      addBackdrop({{ parallax: .3, horizon: {g} - 20, paint(gx, dy, out) {{ if (dy < -10 - 6 * Math.sin(gx * .08)) return 0; out[0] = .1; out[1] = .3; out[2] = .35; return SOLID; }} }});
      LT.frame(4); }})()""")
    plain = shot(pg)
    n_plain = len({tuple(c) for c in plain.reshape(-1, 3)})
    pal = ['#05070c', '#1b2a3a', '#3e6f5a', '#a8c070', '#f4f0d0']
    pw = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in pal}
    pg.evaluate(f'setPost({{ palette: {json.dumps(pal)} }}); LT.frame(4)')
    locked = shot(pg)
    seen = {tuple(c) for c in locked.reshape(-1, 3)}
    check(f'E6 {mode}: without a palette the picture has many colours ({n_plain})', n_plain > 40, n_plain)
    check(f'E6 {mode}: with one the whole picture (world, backdrop, sky) is in it ({len(seen)} colours)', seen <= pw and len(seen) >= 3, sorted(seen - pw)[:5])
    pg.evaluate('setPost({ palette: null }); LT.frame(4)')
    check(f'E6 {mode}: taking it off gives the picture back, pixel for pixel', (shot(pg) == plain).all())
    # dither: the same scene with a two colour palette has a pattern of both, and the pattern holds still
    pg.evaluate("setPost({ palette: ['#05070c', '#c8d8a0'], dither: 1 }); LT.frame(3)")
    d1 = shot(pg); pg.evaluate('LT.frame(3)'); d2 = shot(pg)
    check(f'E6 {mode}: a dithered picture does not shimmer between frames', (d1 == d2).all())
    pg.evaluate("setPost({ dither: 0 }); LT.frame(3)")
    check(f'E6 {mode}: the dither changes the picture', (shot(pg) != d1).any())
    pg.evaluate('setPost({ palette: null, dither: 0 }); LT.frame(3)')
    # vignette: the corners against the middle on the ground row
    y = g + 12
    left, mid = pg.evaluate('cam.x + 2'), pg.evaluate('cam.x + Math.floor(R.cols / 2)')   # world cells at the screen's left edge and in its middle
    def edge_mid():
        img = shot(pg)   # the average of a 16 x 6 block of ground cells at each place: one cell of rock texture is too noisy to compare
        block = lambda x0: np.mean([lum(px(img, pg, x0 + i, y + j)) for i in range(16) for j in range(6)])
        return block(left), block(mid - 8)
    e0, m0 = edge_mid()
    pg.evaluate('setPost({ vignette: 0 }); LT.frame(3)')
    e1, m1 = edge_mid()
    check(f'E6 {mode}: the default vignette darkens the edge ({e0:.0f} against {m0:.0f}); none does not ({e1:.0f} against {m1:.0f})', e0 < .9 * m0 and abs(e1 - m1) < .06 * m1 + 2, (e0, m0, e1, m1))
    pg.evaluate('setPost({ vignette: .42 }); LT.frame(3)')
    check(f'E6 {mode}: the old value gives the old picture back, pixel for pixel', (shot(pg) == plain).all())
    # scanlines: the pixel rows whose centre is in the bottom third of a cell row are darker by the amount asked, every other row is as it was
    chh = pg.evaluate('R.chh')
    pg.evaluate('setPost({ scanlines: .5 }); LT.frame(3)')
    sl = shot(pg)
    import math
    p0 = math.ceil(.667 * chh - .5)
    rows_line = [r for r in range(sl.shape[0]) if (r % chh) >= p0]
    rows_other = [r for r in range(sl.shape[0]) if (r % chh) < p0]
    x0, x1, y0, y1 = 400, 900, 300, 560   # away from the HUD
    a, bb = plain[y0:y1, x0:x1], sl[y0:y1, x0:x1]
    mask_line = np.array([(r % chh) >= p0 for r in range(y0, y1)])
    same = (np.abs(a[~mask_line] - bb[~mask_line]) <= 1).all()
    dark = np.abs(bb[mask_line] - a[mask_line] * .5) <= 2.5
    check(f'E6 {mode}: scanlines leave the other pixel rows alone (cell {chh} px, line from row {p0})', same)
    check(f'E6 {mode}: and take half the light from the line rows ({dark.mean() * 100:.1f}% of the pixels agree)', dark.mean() > .99, dark.mean())
    pg.evaluate('setPost({ scanlines: 0 }); LT.frame(3)')
    check(f'E6 {mode}: scanlines off gives the picture back, pixel for pixel', (shot(pg) == plain).all())
    # bloom: the game's switch turns the glow off whatever the player's setting is
    pg.evaluate('setSetting("bloom", true); setPost({ bloom: false })')
    check(f'E6 {mode}: setPost bloom false switches the glow off', pg.evaluate('R.bloom') is False)
    pg.evaluate('setPost({ bloom: true })')
    check(f'E6 {mode}: and true gives the player their setting back', pg.evaluate('R.bloom') is True)
    check(f'E6 {mode}: no page errors', not errs, errs[:2])
    b.close()


def e7_zoom(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare(1200, 420)')   # a world bigger than the zoomed-out view, so the camera has room to move
    cols = pg.evaluate('R.cols')
    pg.evaluate(f'LT.cam(600 - {cols} / 2)')
    g = pg.evaluate('H - 40')
    bx = int(pg.evaluate('cam.x') + cols // 2 - 6)   # a 12 cell wide pillar of rock in the middle of the screen
    at = '[.5, 1]'   # zoom around the middle of the bottom edge, where the pillar stands
    pg.evaluate(f"""(() => {{ setSun(null); setAmbient([.7, .72, .8]); LT.block({bx}, {g} - 20, {bx} + 12, {g}); LT.frame(3); }})()""")
    py = g - 10   # a cell row through the pillar

    def width():
        """the pillar as drawn: the run of bright pixels across the middle of its rows, and where its middle is (device pixels)"""
        img = shot(pg)
        y = int(pg.evaluate(f'LT.at({bx}, {py})')[1])
        row = np.array([lum(c) for c in img[y]])
        cx = img.shape[1] // 2
        if row[cx] < 30:
            return 0, None
        lo = hi = cx
        while lo > 0 and row[lo - 1] >= 30: lo -= 1
        while hi < len(row) - 1 and row[hi + 1] >= 30: hi += 1
        return hi - lo + 1, (lo + hi) / 2

    cw1 = pg.evaluate('R.cw1')
    w1, c1 = width()
    check(f'E7 {mode}: at zoom 1 the 12 cell pillar is 12 cells wide ({w1} px for a {cw1} px cell)', abs(w1 - 12 * cw1) <= 1, (w1, cw1))
    check(f'E7 {mode}: and getZoom is 1', pg.evaluate('getZoom()') == 1)
    for z in (2, 3, .5):
        pg.evaluate(f'setZoom({z}, {at}); LT.frame(3)')
        cw, cols_now = pg.evaluate('[R.cw, R.cols]')
        w, c = width()
        canvas_w = pg.evaluate('R.canvas.width')
        check(f'E7 {mode}: zoom {z}: the cell is {cw} px (asked {cw1 * z:.1f}) and the pillar {w} px wide ({12 * cw} expected)', abs(cw - cw1 * z) <= .51 and abs(w - 12 * cw) <= 1, (cw, w))
        check(f'E7 {mode}: zoom {z}: it stays in the middle of the screen (middle {c} of {canvas_w})', c is not None and abs(c - canvas_w / 2) <= 1.5 * cw, (c, canvas_w))
        check(f'E7 {mode}: zoom {z}: the view holds {cols_now} cells across (zoom 1 held {cols})', abs(cols_now * cw - canvas_w) <= cw and (cols_now < cols if z > 1 else cols_now > cols), (cols_now, cols))
    pg.evaluate(f'setZoom(1, {at}); LT.frame(3)')
    w, c = width()
    check(f'E7 {mode}: back at 1 it is as it was ({w} px, middle {c} against {c1})', abs(w - w1) <= 1 and abs(c - c1) <= 1, (w, w1, c, c1))
    # the wheel: only for a game with a zoom; the page's event reaches Input.wheel and one notch is one step
    pg.mouse.move(500, 350)
    pg.mouse.wheel(0, -100); pg.wait_for_timeout(100)
    check(f'E7 {mode}: a game with no zoom ignores the wheel', pg.evaluate('Input.wheel') == 0)
    pg.evaluate('GAME.zoom = { wheel: true }')
    pg.mouse.wheel(0, -100); pg.wait_for_timeout(100)
    got = pg.evaluate('Input.wheel')
    check(f'E7 {mode}: with one the wheel is counted ({got})', got == -100, got)
    pg.evaluate('stepZoom(); LT.frame(2)')
    check(f'E7 {mode}: a notch up zooms in by a step ({pg.evaluate("R.cw")} px from {cw1})', pg.evaluate('R.cw') > cw1 and pg.evaluate('Input.wheel') == 0)
    for z in (.5, 4):
        pg.evaluate(f'setZoom({z}); LT.frame(3)')
        img = shot(pg)
        check(f'E7 {mode}: zoom {z} draws a picture of the full canvas ({img.shape[1]} x {img.shape[0]})', img.mean() > 3 and img.shape[1] == pg.evaluate('R.canvas.width'))
    check(f'E7 {mode}: no page errors', not errs, errs[:2])
    b.close()


def e8_weather(p, mode):
    b, pg, errs = boot(p, mode)
    pg.evaluate('LT.bare(900, 300)')
    g = pg.evaluate('H - 40')
    cols = pg.evaluate('R.cols')
    pg.evaluate(f'LT.cam(450 - {cols} / 2)')
    px_x = 450   # a rock pillar in the middle of the screen, 30 cells tall, to read the sun's side from its shadow
    # a back wall behind the pillar (as E1 does): its brightness is the sunlight in the air in front of it, which is where a shadow can be read
    pg.evaluate(f"""(() => {{ GAME.stars = 40; skyKey = ''; LT.block({px_x - 3}, {g} - 30, {px_x + 3}, {g});
      for (let y = {g} - 50; y < {g}; y++) for (let x = 0; x < W; x++) if (cells[y * W + x] === 0) backCells[y * W + x] = LT.rock;
      setTimeOfDay(12, {{ horizon: .78 }}); LT.frame(3); }})()""")
    W_, H_ = pg.evaluate('[R.canvas.width, R.canvas.height]')
    sky = lambda img: img[10:int(H_ * .30), 100:W_ - 100]   # the sky, above the back wall (the back wall starts 50 rows over the ground)
    def air_lum(img, cx0, cx1):
        return np.mean([lum(px(img, pg, x, g - 8)) for x in range(cx0, cx1)])
    shots = {}
    for h in (12, 6.2, 17.8, 0, 9, 15):
        pg.evaluate(f'setTimeOfDay({h}); LT.frame(4)')
        shots[h] = shot(pg)
    noon, dawn, dusk, night = (sky(shots[h]).reshape(-1, 3).mean(axis=0) for h in (12, 6.2, 17.8, 0))
    check(f'E8 {mode}: noon sky is blue and bright (rgb {noon.round().astype(int).tolist()})', noon[2] > noon[0] * 1.2 and lum(noon) > 90, noon)
    check(f'E8 {mode}: midnight is dark (rgb {night.round().astype(int).tolist()}), much darker than noon', lum(night) < 30 and lum(night) < lum(noon) * .3, night)
    lowsky = lambda img: img[int(H_ * .36):int(H_ * .46), 100:W_ - 100].reshape(-1, 3).mean(axis=0)   # the sky just over the back wall, nearest the horizon
    ld, lu = lowsky(shots[17.8]), lowsky(shots[12])
    check(f'E8 {mode}: at sunset the sky near the horizon is orange (rgb {ld.round().astype(int).tolist()}), at noon it is not ({lu.round().astype(int).tolist()})', ld[0] > ld[2] * 1.5 and lu[0] < lu[2], (ld, lu))
    # the stars: at night some pixels are brighter than the sky's colour in their own row, at noon none are
    def star_pixels(img):
        s = sky(img)[::2, ::2]; l = np.array([[lum(c) for c in row] for row in s]); return int((l > np.median(l, axis=1, keepdims=True) + 25).sum())
    sn, sd = star_pixels(shots[0]), star_pixels(shots[12])
    check(f'E8 {mode}: stars show at night ({sn} bright pixels) and not at noon ({sd})', sn > 5 and sd == 0, (sn, sd))
    # the sun's side: at 9 the shadow of the pillar falls to its right, at 15 to its left
    am = (air_lum(shots[9], px_x - 14, px_x - 7), air_lum(shots[9], px_x + 7, px_x + 14))
    pm = (air_lum(shots[15], px_x - 14, px_x - 7), air_lum(shots[15], px_x + 7, px_x + 14))
    check(f'E8 {mode}: at 9 the pillar shades the air to its right ({am[1]:.0f} against {am[0]:.0f}), at 15 to its left ({pm[0]:.0f} against {pm[1]:.0f})', am[1] < am[0] * .75 and pm[0] < pm[1] * .75, (am, pm))
    check(f'E8 {mode}: no page errors (time of day)', not errs, errs[:2])
    # fog
    pg.evaluate('setTimeOfDay(12); LT.frame(4)'); clear = shot(pg)
    pg.evaluate("setFog({ colour: [.9, .9, .9], density: .5 }); LT.frame(4)"); half = shot(pg)
    fb = pg.evaluate('[...FOG.bytes]')
    gx, gy = pg.evaluate(f'LT.at({px_x + 20}, {g} + 5)')
    c0, c1 = clear[int(gy), int(gx)], half[int(gy), int(gx)]
    want = [(a + (f - a) * .5) for a, f in zip(c0, fb)]
    check(f'E8 {mode}: fog at .5 puts the ground halfway to its colour ({c0.tolist()} -> {c1.tolist()}, fog {fb})', all(abs(a - w) <= 3 for a, w in zip(c1, want)), (c0, c1, fb))
    pg.evaluate("setFog({ colour: [.9, .9, .9], density: 1 }); LT.frame(4)"); full = shot(pg)
    region = full[int(H_ * .85):int(H_ * .95), 100:W_ - 100].reshape(-1, 3)
    check(f'E8 {mode}: at density 1 the ground is one colour, the fog\'s ({len({tuple(c) for c in region})} colours)', len({tuple(c) for c in region}) == 1 and list(region[0]) == fb, (region[0], fb))
    pg.evaluate('setFog(null); LT.frame(4)')
    check(f'E8 {mode}: fog off gives the picture back, pixel for pixel', (shot(pg) == clear).all())
    check(f'E8 {mode}: no page errors (fog)', not errs, errs[:2])
    # rain: the drops are in the picture, slant with the wind, and are gone when it stops
    pg.evaluate('setTimeOfDay(12); LT.frame(3)'); dry = shot(pg)
    pg.evaluate("setWeather('rain', { amount: 1 }); Pixelite.test.step(80); LT.frame(2)"); wet = shot(pg)
    changed = int((np.abs(wet.astype(int) - dry.astype(int)).sum(axis=2) > 30)[:int(H_ * .8)].sum())
    check(f'E8 {mode}: rain is drawn ({changed} pixels differ from the dry picture)', changed > 150, changed)
    check(f'E8 {mode}: probe reports it', pg.evaluate('Pixelite.test.probe().weather') == 'rain')
    pg.evaluate('setWind(40); Pixelite.test.step(80)')
    vx = pg.evaluate('(() => { let s = 0; for (let i = 0; i < P.n; i++) s += P.vx[i]; return s / Math.max(1, P.n); })()')
    check(f'E8 {mode}: in a wind the rain slants (mean sideways speed {vx:.1f})', vx > 20, vx)
    pg.evaluate("setWind(0); setWeather(null); Pixelite.test.step(240)")
    left = pg.evaluate('P.n')
    check(f'E8 {mode}: when it stops the sky clears ({left} particles left)', left == 0, left)
    pg.evaluate('LT.frame(3)')
    check(f'E8 {mode}: and the picture is dry again, pixel for pixel', (shot(pg) == dry).all())
    # snow that piles
    pg.evaluate("""(() => { defineMaterial('lt-snow', { albedo: [.95, .96, 1], granular: true }); window.SNOWM = MATS.findIndex(m => m && m.name === 'lt-snow');
      setWeather('snow', { amount: 1, pile: SNOWM, pileChance: .5 }); Pixelite.test.step(400); })()""")
    piled = pg.evaluate('(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === SNOWM) n++; return n; })()')
    check(f'E8 {mode}: snow piles up as cells ({piled})', piled > 30, piled)
    check(f'E8 {mode}: no page errors', not errs, errs[:2])
    b.close()


def run(mode):
    print(f'--- {mode}')
    with sync_playwright() as p:
        e1_sun_sides(p, mode)
        e5_front_and_backdrops(p, mode)
        e3_glow(p, mode)
        e4_back_shadows(p, mode)
        e6_post(p, mode)
        e7_zoom(p, mode)
        e8_weather(p, mode)


if __name__ == '__main__':
    modes = sys.argv[1:] or ['2d', 'gl']
    for m in modes:
        run(m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all look checks passed')
    sys.exit(1 if failures else 0)
