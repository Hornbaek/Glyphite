#!/usr/bin/env python3
"""Space Whiskers' test level: does Pip show the right drawings, can every climb be made, and is the screen the agreed size?

  python3 games/spacewhiskers/tests/mechanics.py      (build first: node tools/pixelite.mjs build spacewhiskers)

- the view: about 480 x 270 game pixels on a 1920 x 1080 window, near it on a laptop;
- the frames: idle_0..3 standing, walk_0..7 walking, run_0..7 running (Shift), jump_1..7 over a jump;
- the climbs: from the floor or a platform, a jump while walking toward the next one lands on it (crates, the first catwalk, the deck,
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
  const climb = (c, row, n, dir) => { at(c, row); for (let i = 0; i < n; i++) T.step(1, i < 40 ? ['Space', dir] : [dir]); T.step(20); return +(PIP.c.y / tc).toFixed(2); };
  const r = { frames: {}, climbs: {} };
  r.frames.idle = seen(40, []);
  at(108, 33); r.frames.walk = seen(60, ['ArrowRight']);
  at(108, 33); r.frames.run = seen(60, ['ArrowRight', 'ShiftLeft']);
  at(108, 33); r.frames.jump = seen(70, ['Space']);
  // [name, column, row stood on, steps, direction, the row he should stand on after]
  for (const [name, c, row, n, dir, to] of [['crates', 16, 33, 30, 'ArrowRight', 29], ['catwalk', 24, 33, 30, 'ArrowRight', 26], ['deck', 37, 33, 30, 'ArrowRight', 28],
      ['tower 1', 78, 33, 25, 'ArrowRight', 27], ['tower 2', 90, 27, 25, 'ArrowRight', 21], ['tower 3', 94, 21, 22, 'ArrowLeft', 15], ['tower 4', 90, 15, 25, 'ArrowRight', 9],
      ['out of the pit', 68, 36, 25, 'ArrowRight', 33], ['last crates', 150, 33, 30, 'ArrowRight', 30]])
    r.climbs[name] = { to, got: climb(c, row, n, dir) };
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
    ok = abs(c['got'] - c['to']) < .2
    print(f'{name:15} lands on row {c["got"]:5}  (want {c["to"]})' + ('' if ok else '  FAIL'))
    if not ok: fails.append(f'{name}: landed on row {c["got"]}, not {c["to"]}')
print(f'drop through a catwalk: row {r["drop"]}  (want 33)');
if abs(r['drop'] - 33) > .2: fails.append('Down did not drop through the catwalk')
print(f'the great cheese: {"taken" if r["goal"] else "NOT taken"}')
if not r['goal']: fails.append('the great cheese was not taken')
fails += [f'page error: {e}' for e in errs]
print('PASS' if not fails else 'FAIL:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
