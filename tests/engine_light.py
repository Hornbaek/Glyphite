#!/usr/bin/env python3
"""Engine lighting features, checked in a real page: sunAt / isLitBy, the sun's colour from an atmosphere or a blackbody,
star twinkle and lamp glare, and eye adaptation. Uses Regolith as the host game (it has a sun, lamps and a sky).

  python3 tests/engine_light.py [2d|gl ...]      (build first: npm run build)

Exits 1 and prints what failed. Numbers are properties (brighter, redder, steady vs. varying), not exact pixels.
"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'dist' / 'games' / 'regolith' / 'index.html'
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


QUERIES = """() => {
  Glyphite.test.start(); Glyphite.test.step(3, []); const o = {};
  const tp = xx => { let t = 0; while (cells[t * W + xx] === EMPTY) t++; return t; };
  let x = 0, best = 1e9;   // a flat stretch of ground, so the test geometry is the same at every detail level
  for (let xx = 80; xx < W - 40; xx += 4) { let dev = 0; for (let dx = -30; dx <= 30; dx += 3) dev = Math.max(dev, Math.abs(tp(xx + dx) - tp(xx))); if (dev < best) { best = dev; x = xx; } }
  const top = tp(x), px = x, py = top - 12, rock = cells[top * W + x];
  o.open = sunAt(px + .5, 4 * ASPECT);   // high up, nothing can be in the way of a low sun
  for (let dx = -60; dx <= 12; dx++) for (let dy = 1; dy <= 2; dy++) cells[(py - 2 - dy) * W + px + dx] = rock;   // a wide ceiling: the sun is low
  o.shaded = sunAt(px + .5, py * ASPECT);
  setSun(null); o.nosun = sunAt(px + .5, 4 * ASPECT); setSun(21);
  const y = (py + .5) * ASPECT, L1 = { x: px + 6, y, r: 20, c: [1, 1, 1], I: 1, shadow: true };
  o.near = isLitBy(L1, px + .5, y); o.far = isLitBy({ ...L1, r: 3 }, px - 15, y);
  for (let dy = -2; dy <= 2; dy++) cells[(py + dy) * W + px + 3] = rock;
  o.behind_wall = isLitBy(L1, px + .5, y); o.unshadowed = isLitBy({ ...L1, shadow: false }, px + .5, y);
  const cone = dx => isLitBy({ x: px - 8, y, r: 30, c: [1, 1, 1], I: 1, shadow: false, dx, dy: 0, cos: Math.cos(.4) }, px + 5, y);
  o.cone_toward = cone(1); o.cone_away = cone(-1);
  return o;
}"""

COLOURS = """() => {
  const col = (el, atm, c) => { setAtmosphere(atm); setSun(el, c); return [...SUN_C]; };
  const o = { vac_low: col(5, 0), vac_high: col(60, 0), air_high: col(85, 1), air_10: col(10, 1), air_3: col(3, 1), pinned: col(3, 1, [1, 1, 1]),
    k2000: kelvinColor(2000), k5772: kelvinColor(5772), k10000: kelvinColor(10000), air_k: col(8, 1, { kelvin: 5772 }) };
  setSun(8, { kelvin: 5772 }); setAtmosphere(0); o.off = [...SUN_C]; setAtmosphere(1); o.on = [...SUN_C];
  setAtmosphere(0); setSun(21, [1.15, 1.1, 1.0]); SUN_FIXED = false;
  return o;
}"""

SKY = """() => {
  TUNE.atmosphere = 0; startSite(2); Glyphite.test.step(3, []); Glyphite.test.freeze();
  const sky = () => { skyKey = ''; draw(performance.now() / 1000 + Math.random()); };
  sky();
  let base = -1, bk = -1;
  for (let k = 0; k < R.RW * R.RH; k++) if ((R.sG[k] === 42 || R.sG[k] === 43 || R.sG[k] === 46) && k % R.RW < R.RW * .5 && R.sPix[k * 4] > base) { base = R.sPix[k * 4]; bk = k; }
  const si = bk % R.RW, sj = (bk / R.RW) | 0, o = { base };
  const wx = L_OX + si + .5, wy = (L_OY + sj + .5) * ASPECT;
  for (const gl of [1, 0]) { GAME.starGlare = gl; FX.lights.length = 0; addLight(wx, wy, 30 * RES, [1, .9, .8], 2.2, 5); sky(); o['glare' + gl] = R.sPix[bk * 4]; }
  GAME.starGlare = 1; FX.lights.length = 0; sky(); o.normal = R.sPix[bk * 4];
  FX.flash = .7; sky(); o.flash = R.sPix[bk * 4]; FX.flash = 0;
  const series = air => { setAtmosphere(air); const v = []; for (let i = 0; i < 14; i++) { skyKey = ''; draw(1000 + i * .09); v.push(R.sPix[bk * 4]); } return v; };
  o.vacuum = series(0); o.air = series(1); setAtmosphere(0);
  Glyphite.test.unfreeze(); return o;
}"""

EYE = """() => {
  TUNE.atmosphere = 0; startSite(1); Glyphite.test.step(3, []); Glyphite.test.freeze();
  const tp = xx => { let t = 0; while (cells[t * W + xx] === EMPTY) t++; return t; };
  const x = Math.floor(W / 2), top = tp(x), o = {};
  const dark = () => { cam.x = x - R.cols / 2; cam.y = (top + 14) * ASPECT; };
  const sunny = () => { cam.x = x - R.cols / 2; cam.y = top * ASPECT - R.rows * ASPECT * .5; };
  const run = (view, secs, t0) => { for (let i = 0; i <= secs * 60; i++) { view(); draw(t0 + i / 60); } return t0 + secs; };
  setEyeAdaptation(0); let t = run(sunny, .3, 100); o.off = EYE.e;
  setEyeAdaptation(1); t = run(dark, 8, t); o.dark = EYE.e;
  const before = EYE.e; run(dark, .5, t); o.rise_in_half_second = EYE.e - before;
  t = run(sunny, 3, t + .5); o.sunny = EYE.e;
  setEyeAdaptation(0); o.off_again = EYE.e;
  Glyphite.test.unfreeze(); return o;
}"""


def run(mode):
    print(f'--- {mode}')
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS[mode])
        pg = b.new_page(viewport={'width': 1100, 'height': 640})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(PAGE.as_uri() + '#' + mode)
        pg.wait_for_timeout(700)
        q = pg.evaluate(QUERIES)
        check('sunAt: open sky is lit', q['open'] is True)
        check('sunAt: under a ceiling of rock is not', q['shaded'] is False)
        check('sunAt: no sun, no light', q['nosun'] is False)
        check('isLitBy: a light next to the point reaches it', q['near'] > 0.3, q['near'])
        check('isLitBy: out of range is 0', q['far'] == 0)
        check('isLitBy: a wall in between blocks it, unless the light casts no shadows', q['behind_wall'] == 0 and q['unshadowed'] > 0)
        check('isLitBy: a cone lights what it faces and not what is behind it', q['cone_toward'] > 0 and q['cone_away'] == 0)
        c = pg.evaluate(COLOURS)
        check('sun colour: a vacuum leaves it alone at any elevation', c['vac_low'] == c['vac_high'])
        check('sun colour: overhead sun in air is nearly the base colour', all(abs(a - b) < .02 for a, b in zip(c['air_high'], c['vac_high'])))
        check('sun colour: a low sun in air is redder and dimmer', c['air_10'][2] / c['air_10'][0] < .5 and c['air_3'][1] / c['air_3'][0] < c['air_10'][1] / c['air_10'][0] < .75, (c['air_10'], c['air_3']))
        check('sun colour: a pinned [r,g,b] is never reddened', c['pinned'] == [1, 1, 1])
        check('kelvin: 2000 K is orange, 5772 K near white, 10000 K bluish', c['k2000'][2] < .2 * c['k2000'][0] and abs(c['k5772'][0] - c['k5772'][2]) < .2 and c['k10000'][2] > c['k10000'][0], (c['k2000'], c['k5772'], c['k10000']))
        check('kelvin + atmosphere: the base is the blackbody, then dimmed by the air', c['air_k'][2] < c['air_k'][0] < 1.15)
        check('atmosphere set later recolours the sun without another setSun', c['off'][2] > .9 and c['on'][2] < .3, (c['off'], c['on']))
        s = pg.evaluate(SKY)
        near = lambda a, b: abs(a - b) <= .03 * b   # the level's own beacons and lamps pulse a little
        check('stars: a lamp right on a star dims it a lot, and glare 0 leaves it', s['glare1'] < .5 * s['base'] and near(s['glare0'], s['base']), s)
        check('stars: back to normal when the light is gone', near(s['normal'], s['base']), s)
        check('stars: a flash dims them', s['flash'] < .8 * s['base'], s['flash'])
        check('stars: steady in a vacuum', max(s['vacuum']) - min(s['vacuum']) <= .03 * s['base'], s['vacuum'])
        check('stars: twinkle in an atmosphere', max(s['air']) - min(s['air']) > .25 * s['base'], s['air'])
        e = pg.evaluate(EYE)
        check('eye: off means exposure 1', e['off'] == 1 and e['off_again'] == 1)
        check('eye: a dark view is brightened', e['dark'] > 1.5, e['dark'])
        check('eye: it takes time (a second or two, not a frame)', 0 < e['rise_in_half_second'] < .25, e['rise_in_half_second'])
        check('eye: a bright view brings it back down', e['sunny'] < e['dark'], e)
        check('no page errors', not errs, errs[:2])
        b.close()


if __name__ == '__main__':
    modes = sys.argv[1:] or ['2d', 'gl']
    for m in modes:
        run(m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all lighting checks passed')
    sys.exit(1 if failures else 0)
