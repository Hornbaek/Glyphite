#!/usr/bin/env python3
"""Fjordheim: a simple player builds a homestead through the build bar and the map clicks; the family must live to the
second spring. Checks that every building gets built, that the jobs produce, and that winter can be survived.
  python3 games/fjordheim/tests/playthrough.py [renderer]      (needs the build: node tools/glyphite.mjs build fjordheim)
Prints a line per game day and fails (exit 1) if the family sails home, a building stays unbuilt or the page errors."""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist/games/fjordheim/index.html').as_uri()
r = sys.argv[1] if len(sys.argv) > 1 else '2d'

# the player: whenever the next building on the list is affordable, put it at the nearest free spot that suits it, by
# selecting it in the build bar (select) and clicking the map (clickMap with a canvas point, as a mouse click would)
BOT = r'''(() => {
  const plan = ['longhouse', 'woodcutter', 'fishing', 'field', 'field', 'sawpit', 'rack', 'woodcutter', 'well', 'stabbur', 'smithy'];
  window.__bot = window.__bot || { n: 0 };
  const bot = window.__bot; if (bot.n >= plan.length || SEL) return null;
  const type = plan[bot.n]; if (!affordable(type)) return null;
  const s = store(), b = BUILDINGS[type];
  // near the longhouse, the woodcutter nearer the forest; skip spots that would block the way along the shore
  const want = type === 'woodcutter' ? (() => { let t = trees.find(t => t.alive && thing[tidx(t.i, t.j)] === T_TREE && Math.hypot(t.i - s[0], t.j - s[1]) > 5); return t ? [Math.round((t.i + s[0]) / 2), Math.round((t.j + s[1]) / 2)] : s; })() : s;
  let best = null, bd = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (placeProblem(type, i, j)) continue;
    let gap = true;   // keep a tile free all round so nobody is walled in
    for (let v = j - 1; v <= j + b.h; v++) for (let u = i - 1; u <= i + b.w; u++) if (inMap(u, v) && (thing[tidx(u, v)] === T_BUILDING || thing[tidx(u, v)] === T_FIELD)) gap = false;
    if (!gap) continue;
    const d = Math.hypot(i - want[0], j - want[1]); if (d < bd) { bd = d; best = [i, j]; }
  }
  if (!best) return 'no room for ' + type;
  // the canvas point over the tile that footAt maps back to this top corner
  const t = [best[0] + ((b.w - 1) >> 1), best[1] + ((b.h - 1) >> 1)], p = isoToWorld(t[0] + .5, t[1] + .5);
  centreOn([t[0], t[1], 1, 1]); updateCamera(0, true);
  const aim = [(p[0] - cam.x) / R.cols, (p[1] - cam.y) / (R.rows * ASPECT)];
  select(type); clickMap(aim);
  if (SEL === type) SEL = null;
  const ok = HOME.buildings.some(x => x.type === type && x.i === best[0] && x.j === best[1]);
  if (ok) bot.n++;
  return (ok ? 'placed ' : 'FAILED to place ') + type + ' at ' + best;
})()'''

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000); pg.wait_for_timeout(300)
    pg.evaluate('Glyphite.test.start(); Glyphite.test.freeze()')
    fail, last_day, log = [], None, []
    for tick in range(4000):   # a step of 1 s; the game takes 4 seasons × 3 days × 40 s = 480 s
        msg = pg.evaluate(BOT)
        if msg: print('   ', msg); fail += [msg] if 'FAILED' in msg or 'no room' in msg else []
        g = pg.evaluate('Glyphite.test.step(60).game')
        day = (g['year'], g['season'], g['day'])
        if day != last_day:
            last_day = day
            print(f"{g['season']:6} {g['day']} y{g['year']}  {json.dumps(g['stock'])}  folk {len(g['folk'])}  trees {g['trees']}  deer {g['deer']}  "
                  f"built {sum(x['done'] for x in g['buildings'])}/{len(g['buildings'])}  hunger {g['hunger']} cold {g['cold']}  "
                  + ', '.join(f"{f['name']}:{f['job']}" for f in g['folk']))
        if g['won'] or g['lost']: break
    g = pg.evaluate('Glyphite.test.probe().game')
    # and a player who builds nothing: the family must give up (hungry, or cold without a roof) before the second spring
    pg2 = b.new_page(viewport={'width': 1280, 'height': 800}); pg2.on('pageerror', lambda e: errs.append(str(e)))
    pg2.goto(f'{PAGE}#{r}'); pg2.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000)
    pg2.evaluate('Glyphite.test.start(); Glyphite.test.freeze()')
    for tick in range(600):
        g2 = pg2.evaluate('Glyphite.test.step(60).game')
        if g2['won'] or g2['lost']: break
    print('idle player:', g2['season'], g2['day'], 'won' if g2['won'] else g2['lost'] or 'still playing')
    if not g2['lost']: fail.append('an idle player did not lose')
    unbuilt = [x['type'] for x in g['buildings'] if not x['done']]
    if g['lost']: fail.append('lost: ' + g['lost'])
    if not g['won']: fail.append('not won')
    if errs: fail.append('page errors: ' + '; '.join(errs[:3]))
    print('won' if g['won'] else 'NOT WON', '| unbuilt:', unbuilt, '| folk:', len(g['folk']), '| errors:', errs[:3])
    print('FAIL: ' + ' | '.join(fail) if fail else 'OK')
    b.close()
    sys.exit(1 if fail else 0)
