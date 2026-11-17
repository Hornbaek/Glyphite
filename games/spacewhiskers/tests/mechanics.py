#!/usr/bin/env python3
"""Space Whiskers' test level: does Pip show the right drawings, can every climb be made, and is the screen the agreed size?

  python3 games/spacewhiskers/tests/mechanics.py      (build first: node tools/pixelite.mjs build spacewhiskers)

- the view: about 480 x 270 game pixels on a 1920 x 1080 window, near it on a laptop;
- the frames: idle_0..3 standing, walk_0..7 walking slowly (C held), run_0..7 at his normal pace, jump_1..7 over a jump;
- the camera: locked to Pip on whole cells (he stays within a few cells of the same screen place while running, the view does not bob on a jump,
  his feet stay in view through a fall into the pit and a drop from the top of the tower);
- the test lights: a click drops one, the number keys choose the kind, at most SW_TL_MAX stay, K clears, H toggles the helmet lamp, F the torch;
- the climbs: from the floor or a platform, some jump toward the next one lands on it (crates, the first catwalk, the deck,
  the four catwalks of the tower, out of the pit, the last crates); Down drops through a catwalk; the great cheese can be taken.
Pip is put at the foot of each climb (not walked there), so a failure names the jump that broke. Fails on any page error.
"""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist' / 'games' / 'spacewhiskers' / 'index.html').as_uri() + '#2d'

PROBE = """() => {
  const T = Pixelite.test, tc = SW_MAP.tc; T.start(); T.step(30);
  const seen = (n, keys) => { const s = new Set(); for (let i = 0; i < n; i++) s.add(T.step(1, keys).game.pip.frame); return [...s]; };
  const at = (c, row) => { PIP.c.x = (c + .5) * tc; PIP.c.y = row * tc; PIP.c.vx = PIP.c.vy = 0; T.step(5); };
  // a jump from the foot of a climb: hold jump and a direction for n steps, let go, wait to land; where does he stand (a row)?
  const jumpFrom = (c, row, n, dir) => { at(c, row); for (let i = 0; i < n; i++) T.step(1, ['Space', dir]); T.step(45); return +(PIP.c.y / tc).toFixed(2); };
  // can the climb be made at all: some push length from 4 to 40 steps lands him on the platform at row `to` (his pace and jump are tunable, so the
  // test does not fix how long he must run)
  const climb = (c, row, dir, to) => { const ok = []; for (let n = 4; n <= 40; n += 2) if (Math.abs(jumpFrom(c, row, n, dir) - to) < .2) ok.push(n); return { to, ok: ok.length, first: ok[0] }; };
  const r = { frames: {}, climbs: {} };
  r.frames.idle = seen(40, []);
  at(108, 33); r.frames.walk = seen(60, ['ArrowRight', 'KeyC']);
  at(108, 33); r.frames.run = seen(60, ['ArrowRight']);
  at(108, 33); r.frames.jump = seen(70, ['Space']);
  // [name, column, row stood on, direction, the row he should be able to stand on]
  for (const [name, c, row, dir, to] of [['crates', 16, 33, 'ArrowRight', 29], ['catwalk', 24, 33, 'ArrowRight', 26], ['deck', 37, 33, 'ArrowRight', 28],
      ['tower 1', 78, 33, 'ArrowRight', 27], ['tower 2', 90, 27, 'ArrowRight', 21], ['tower 3', 94, 21, 'ArrowLeft', 15], ['tower 4', 90, 15, 'ArrowRight', 9],
      ['out of the pit', 68, 36, 'ArrowRight', 33], ['last crates', 150, 33, 'ArrowRight', 30]])
    r.climbs[name] = climb(c, row, dir, to);
  // the camera
  const stats = (a, i) => { const v = a.map(q => q[i]); return [Math.min(...v), Math.max(...v)]; };
  const rec = (n, keys) => { const a = []; for (let i = 0; i < n; i++) { T.step(1, keys); a.push([PIP.c.x - cam.x, PIP.c.y - cam.y, cam.x, cam.y]); } return a; };
  at(100, 33); updateCamera(0, true); T.step(20);
  let a = rec(60, ['ArrowRight']);
  r.camera = { whole: a.every(q => Math.abs(q[2] - Math.round(q[2])) < 1e-3 && Math.abs(q[3] - Math.round(q[3])) < 1e-3), runX: stats(a, 0) };
  at(100, 33); updateCamera(0, true); T.step(30);
  a = rec(50, ['Space']); r.camera.jumpCamY = stats(a, 3);
  at(59.5, 33); updateCamera(0, true); T.step(20);
  a = rec(60, ['ArrowRight']); r.camera.pitFeet = stats(a, 1);
  at(98, 9); updateCamera(0, true); T.step(30);
  a = rec(120, ['ArrowDown']); r.camera.dropFeet = stats(a, 1); r.camera.viewH = R.rows;
  // the test lights
  at(100, 33); updateCamera(0, true); T.step(30);
  const tap = (x, y) => { T.tap(x, y); T.step(2); }, n = () => SW_TEST.list.length;
  r.lights = {};
  tap(cam.x + 100, cam.y + 80); r.lights.one = n();
  T.press('Digit3'); tap(cam.x + 200, cam.y + 80); r.lights.kinds = SW_TEST.list.map(l => l.kind).join();
  for (let i = 0; i < 6; i++) tap(cam.x + 50 + i * 20, cam.y + 60); r.lights.capped = n();
  const h = SW_TEST.helmet; T.press('KeyH'); T.step(1); r.lights.helmetToggled = SW_TEST.helmet !== h;
  T.press('KeyF'); T.step(1); r.lights.torch = SW_TEST.torch;
  T.press('KeyK'); T.step(1); r.lights.cleared = n();
  // a frame with every light on still draws (lights, markers, the torch) without an error
  tap(cam.x + 100, cam.y + 80); T.step(5); T.render(); r.lights.drawn = true;
  at(85, 27); T.step(40, ['ArrowDown']); r.drop = +(PIP.c.y / tc).toFixed(2);
  at(165, 33); T.step(60, ['ArrowRight']); r.goal = SW_GOAL.got;
  return r;
}"""

fails, errs = [], []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-gpu'])
    for (w, h), (lo, hi) in [((1920, 1080), (440, 520)), ((1366, 768), (400, 520))]:
        pg = b.new_page(viewport={'width': w, 'height': h}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(PAGE); pg.wait_for_timeout(600)
        cols, rows = pg.evaluate('() => { Pixelite.test.start(); const r = Pixelite.test.step(2); return [r.cols, r.rows]; }')
        print(f'view at {w}x{h}: {cols} x {rows}')
        if not lo <= cols <= hi: fails.append(f'the view at {w}x{h} is {cols} wide, not near 480')
        pg.close()
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(PAGE); pg.wait_for_timeout(600)
    r = pg.evaluate(PROBE)
    b.close()

want = {'idle': [f'idle_{i}' for i in range(4)], 'walk': [f'walk_{i}' for i in range(8)], 'run': [f'run_{i}' for i in range(8)], 'jump': [f'jump_{i}' for i in range(1, 8)]}
for k, names in want.items():
    missing = [n for n in names if n not in r['frames'][k]]
    print(f'{k:5} frames: {len(set(r["frames"][k]) & set(names))}/{len(names)}' + (f'  missing {missing}' if missing else ''))
    if missing: fails.append(f'{k}: never showed {missing}')
for name, c in r['climbs'].items():
    ok = c['ok'] > 0
    print(f'{name:15} row {c["to"]:2}: {c["ok"]:2} of 19 jumps land on it' + (f' (the first after {c["first"]} steps of push)' if ok else '  FAIL'))
    if not ok: fails.append(f'{name}: no jump lands on row {c["to"]}')
cam = r['camera']
lo, hi = cam['runX']; print(f'camera: runs with Pip {lo:.0f}..{hi:.0f} cells from the left edge, whole cells: {cam["whole"]}; a jump moves it {cam["jumpCamY"][1] - cam["jumpCamY"][0]:.0f} cells; feet in the pit {cam["pitFeet"][0]:.0f}..{cam["pitFeet"][1]:.0f}, in the drop {cam["dropFeet"][0]:.0f}..{cam["dropFeet"][1]:.0f} of {cam["viewH"]}')
if not cam['whole']: fails.append('the camera is not on whole cells')
if hi - lo > 40: fails.append(f'Pip wanders {hi - lo:.0f} cells across the screen while running')
if cam['jumpCamY'][1] - cam['jumpCamY'][0] > 1: fails.append('the view bobs on a jump on flat ground')
for k in ('pitFeet', 'dropFeet'):
    if cam[k][0] < 0 or cam[k][1] > cam['viewH']: fails.append(f'Pip left the view ({k} {cam[k]})')
L = r['lights']
print(f'test lights: one click {L["one"]}, kinds {L["kinds"]}, capped at {L["capped"]}, helmet toggled {L["helmetToggled"]}, torch {L["torch"]}, cleared {L["cleared"]}')
if L['one'] != 1 or L['kinds'] != '0,2' or L['capped'] != 4 or not L['helmetToggled'] or not L['torch'] or L['cleared'] != 0: fails.append(f'the test lights misbehave: {L}')
print(f'drop through a catwalk: row {r["drop"]}  (want 33)');
if abs(r['drop'] - 33) > .2: fails.append('Down did not drop through the catwalk')
print(f'the great cheese: {"taken" if r["goal"] else "NOT taken"}')
if not r['goal']: fails.append('the great cheese was not taken')
fails += [f'page error: {e}' for e in errs]
print('PASS' if not fails else 'FAIL:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
