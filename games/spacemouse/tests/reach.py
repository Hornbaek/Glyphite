#!/usr/bin/env python3
"""Can every sector be finished? A search over where the mouse can stand, using the game's real controller (the engine
Character with the mouse's tunables): from each standing spot it tries walking, and jumps of several lengths with
several ways of steering in the air, and records where it lands (never on a cable or glass). Cheese counts as eaten, rusted
panels and gantries as fallen and cracked walls as broken (by a cat-bot shorted next to them), and low gravity applies; cat-bots are switched off. It reports whether the
great cheese, every crumb and every checkpoint can be reached.

  python3 games/spacemouse/tests/reach.py [sector ...] [--res 1] [--tune '{"jumpHeight": 2}']   (build first)
"""
import sys, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist' / 'games' / 'spacemouse' / 'index.html').as_uri()
import argparse
ap = argparse.ArgumentParser(); ap.add_argument('sectors', nargs='*', type=int); ap.add_argument('--res', type=float, default=1); ap.add_argument('--tune', default='')
a = ap.parse_args(); res, tune, sectors = a.res, a.tune, a.sectors

SEARCH = """(n) => {
  startSector(n); CATS.forEach(k => k.alive = false);
  for (let i = 0; i < W * H; i++) { const m = cells[i]; if (m === CHEESE || m === CRUMBS || m === RUST || m === FLAKES || m === WEAK) cells[i] = EMPTY; }
  for (const g of SEC.gantries) for (const [tx, ty] of g.deck) for (let cy = ty * SEC.th; cy < (ty + 1) * SEC.th; cy++) for (let cx = tx * SEC.tw; cx < (tx + 1) * SEC.tw; cx++) cells[cy * W + cx] = EMPTY;
  const S = RES, opts = mouseOpts(), seen = new Set(), queue = [];
  const crumbs = SEC.crumbs.map(() => false), checks = SEC.checkpoints.map(() => false); let goal = false;
  const key = c => Math.round(c.x / 2) + ',' + Math.round(c.y / ASPECT);
  const add = c => { const k = key(c); if (!seen.has(k)) { seen.add(k); queue.push([c.x, c.y]); } };
  const visit = c => {
    const mx = c.x, my = c.y - c.o.h / 2;
    SEC.crumbs.forEach((cr, i) => { if (!crumbs[i] && Math.abs(cr.x - mx) < 3.2 * S && Math.abs(cr.y - my) < 4.5 * S) crumbs[i] = true; });
    SEC.checkpoints.forEach((cp, i) => { if (!checks[i] && Math.abs(cp.x - c.x) < 3 * S && Math.abs(cp.y - c.y) < 4 * S) checks[i] = true; });
    if (!goal && touching(c, m => m === GREAT)) goal = true;
  };
  // one try: hold dir (switching to dir2 after `sw` steps) and jump for `hold` steps; true if it came to rest somewhere alive
  const sim = (x, y, dir, dir2, sw, hold, maxN, v0 = 0) => {
    const c = new Character(x, y, opts); c.onGround = true; c.ground = HULL; c.vx = v0;
    for (let i = 0; i < maxN; i++) {
      applyGravityZone(c, opts.jump);
      c.step(DT, { x: i < sw ? dir : dir2, jump: i < hold });
      visit(c);
      if (touching(c, m => HAZARD[m]) || c.y > H * ASPECT) return;
      if (i > 2 && c.onGround) { add(c); return; }
    }
  };
  const start = new Character(SEC.start[0], SEC.start[1], opts); for (let i = 0; i < 30; i++) start.step(DT, {}); add(start);
  const t0 = performance.now(); let n0 = 0;
  while (queue.length && n0 < 40000) {
    const [x, y] = queue.shift(); n0++;
    for (const d of [-1, 1]) { sim(x, y, d, d, 99, 0, 8); sim(x, y, d, d, 99, 0, 40); }
    for (const d of [-1, 0, 1]) for (const hold of [6, 14, 40]) {
      sim(x, y, d, d, 999, hold, 150);
      if (d) { sim(x, y, d, 0, 12, hold, 150); sim(x, y, d, -d, 18, hold, 150); sim(x, y, 0, d, 14, hold, 150); sim(x, y, d, d, 999, hold, 150, d * opts.run); }
    }
  }
  return { goal, crumbs, checks, spots: seen.size, ms: Math.round(performance.now() - t0),
    missing: { crumbs: SEC.crumbs.filter((c, i) => !crumbs[i]).map(c => [+(c.x / SEC.tw).toFixed(1), +(c.y / ASPECT / SEC.th).toFixed(1)]),
      checkpoints: SEC.checkpoints.filter((c, i) => !checks[i]).map(c => [+(c.x / SEC.tw).toFixed(1), +(c.y / ASPECT / SEC.th).toFixed(1)]) } };
}"""

failed = False
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-gpu']); pg = b.new_page(viewport={'width': 900, 'height': 560})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    url = PAGE + (('?tune=' + tune) if tune else '') + '#2d'
    pg.goto(url); pg.wait_for_timeout(600)
    pg.evaluate(f'() => {{ setDetail({res}); Glyphite.test.start(); Glyphite.test.freeze(); }}')
    count = pg.evaluate('() => SECTORS.length')
    for n in sectors or range(1, count + 1):
        r = pg.evaluate(SEARCH, n)
        ok = r['goal'] and not r['missing']['crumbs'] and not r['missing']['checkpoints']
        failed |= not ok
        name = pg.evaluate(f'() => SECTORS[{n - 1}].name')
        print(f"{'ok  ' if ok else 'FAIL'} sector {n} {name}: great cheese {'reached' if r['goal'] else 'NOT reached'}, "
              f"crumbs {sum(r['crumbs'])}/{len(r['crumbs'])}, checkpoints {sum(r['checks'])}/{len(r['checks'])} "
              f"({r['spots']} standing spots, {r['ms']} ms)" + ('' if ok else f"  missing (tile x, y): {json.dumps(r['missing'])}"))
    if errs: print('page errors:', errs[:3]); failed = True
    b.close()
sys.exit(1 if failed else 0)
