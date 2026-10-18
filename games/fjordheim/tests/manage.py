#!/usr/bin/env python3
"""Fjordheim: pausing and tearing down buildings, and the news under the top rows, probed step by step.
A paused workplace loses its worker to other work and makes nothing until it is resumed (a paused sawpit leaves the logs
alone); a fisher out in the boat comes in. With every field paused there is no farmer. Tearing down gives back half of
what a building cost (all of a site), frees its tiles, lets go of whoever worked or built there, and keeps the tile grid
pointing at the right buildings. A message stays at least six seconds, and longer ones longer.
  python3 games/fjordheim/tests/manage.py [renderer]      (needs the build: node tools/glyphite.mjs build fjordheim)"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist/games/fjordheim/index.html').as_uri()
r = sys.argv[1] if len(sys.argv) > 1 else '2d'
fail = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fail.append(what)

# a homestead in summer: the longhouse, a woodcutter, a sawpit, a fishing hut by the water, two fields; four adults
SETUP = r'''(() => {
  Glyphite.test.start(); Glyphite.test.freeze();
  const L = LANDING; HOME.season = 1; HOME.stock = { wood: 40, planks: 0, stone: 20, food: 60 };
  for (let j = L[1] - 12; j < L[1] + 1; j++) for (let i = L[0] - 8; i < L[0] + 9; i++) if (inMap(i, j)) { const k = tidx(i, j); if (thing[k] === T_ROCK || thing[k] === T_BUSH) { thing[k] = 0; ref[k] = -1; } }
  const put = (t, i, j) => { const o = placeBuilding(t, i, j); finishBuilding(o); return o; };
  const spot = (t, near) => { let best = null, bd = 1e9; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (placeProblem(t, i, j)) continue;
    let gap = true; const b = BUILDINGS[t]; for (let v = j - 1; v <= j + b.h; v++) for (let u = i - 1; u <= i + b.w; u++) if (inMap(u, v) && (thing[tidx(u, v)] === T_BUILDING || thing[tidx(u, v)] === T_FIELD)) gap = false;
    const d = Math.hypot(i - near[0], j - near[1]); if (gap && d < bd) { bd = d; best = [i, j]; } } return best; };
  for (const t of ['longhouse', 'woodcutter', 'sawpit', 'fishing', 'field', 'field']) put(t, ...spot(t, [L[0], L[1] - 5]));
  newPerson('father', L[0], L[1] - 1); newPerson('mother', L[0] + 1, L[1] - 1);
  Glyphite.test.step(120);
  return HOME.buildings.map(b => b.type);
})()'''
B = "(t => HOME.buildings.find(b => b.type === t))"
job = lambda t: f"FOLK.filter(p => p.job && p.job.type === '{t}').length"

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000)
    ev = pg.evaluate
    print('built:', ev(SETUP))
    step = lambda s: ev(f'Glyphite.test.step({int(s * 60)})')
    check(ev(f"{B}('sawpit').worker !== null && {B}('woodcutter').worker !== null && {B}('fishing').worker !== null && {job('farmer')} === 1"),
          'every workplace has its worker, and there is a farmer')
    # the longhouse's roof rises far above its footprint: pointing at the roof finds the longhouse, not the tile behind it
    roof = ev(f'''(() => {{ const b = {B}('longhouse'), a = buildingArt(b), s = a.spr, k = s.k * RES, fl = a.flip ? -1 : 1; centreOn([b.i, b.j, b.w, b.h]); updateCamera(0, true);
      let r = 0; while (![...Array(s.w).keys()].some(c => s.idx[r * s.w + c] !== 255)) r++;
      const cs = [...Array(s.w).keys()].filter(c => s.idx[(r + 2) * s.w + c] !== 255), c = cs[cs.length >> 1], p = isoToWorld(b.i + b.w, b.j + b.h);
      const x = p[0] + (c + .5 - s.ox) * k * fl, y = p[1] + (r + 2.5 - s.oy) * k, aim = [(x - cam.x) / R.cols, (y - cam.y) / (R.rows * ASPECT)];
      const t = isoPick(aim), h = hoverAt(aim);
      return [!!t && thingAt(t[0], t[1]) === T_BUILDING, !!h && h.building === b]; }})()''')
    check(not roof[0] and roof[1], f'pointing at the longhouse roof finds the longhouse (on its footprint: {roof[0]}, found: {roof[1]})')

    # pause the sawpit: the sawyer turns to other work, the planks stop, the logs are left alone
    sawyer = ev(f"{B}('sawpit').worker.name")
    ev(f"togglePause({B}('sawpit'))"); step(1)
    check(ev(f"{B}('sawpit').paused && {B}('sawpit').worker === null && {job('sawyer')} === 0"), 'a paused sawpit has no sawyer')
    check(ev(f"(() => {{ const p = FOLK.find(p => p.name === '{sawyer}'); return !!p.job && p.job.type !== 'sawyer'; }})()"), f'{sawyer} turned to other work')
    check(any('SAWPIT PAUSED' in m for m in ev('NEWS.map(m => m.text)')), 'the news says so')
    pl = ev('HOME.stock.planks'); step(20)   # at work it would saw a plank every 6 s
    check(ev('HOME.stock.planks') == pl, f'no planks while it is paused ({pl} → {ev("HOME.stock.planks")})')
    ev(f"togglePause({B}('sawpit'))"); step(1)
    check(ev(f"{job('sawyer')} === 1"), 'resumed, it gets a sawyer again')
    step(15); check(ev('HOME.stock.planks') > pl, f'and planks come again ({pl} → {ev("HOME.stock.planks")})')

    # pause the fishing hut while the fisher is out: the boat comes in, the fisher is back on the shore
    for _ in range(60):
        if ev('BOATS.length'): break
        step(.5)
    check(ev('BOATS.length') == 1, 'the fisher rowed out')
    ev(f"togglePause({B}('fishing'))"); step(.2)
    check(ev(f"BOATS.length === 0 && FOLK.every(p => !p.hidden) && {job('fisher')} === 0"), 'paused, the boat comes in and nobody fishes')
    ev(f"togglePause({B}('fishing'))")

    # pause both fields: no farmer; resume one: a farmer again
    ev("HOME.buildings.filter(b => b.type === 'field').forEach(togglePause)"); step(1)
    check(ev(f"{job('farmer')} === 0"), 'every field paused: no farmer')
    ev("togglePause(HOME.buildings.find(b => b.type === 'field'))"); step(1)
    check(ev(f"{job('farmer')} === 1"), 'one field resumed: a farmer again')

    # tear down the woodcutter's hut: half its cost back, its tiles free, its woodcutter let go, the tile grid still right
    w0 = ev('HOME.stock.wood'); cutter = ev(f"{B}('woodcutter').worker.name"); foot = ev(f"(b => [b.i, b.j])({B}('woodcutter'))")
    ev(f"tearDown({B}('woodcutter'))"); step(1)
    check(ev('HOME.stock.wood') == w0 + 2, f'tearing down the woodcutter gives back 2 of its 4 wood ({w0} → {ev("HOME.stock.wood")})')
    check(ev(f"!{B}('woodcutter') && thingAt({foot[0]}, {foot[1]}) === 0 && thingAt({foot[0] + 1}, {foot[1] + 1}) === 0"), 'it is gone and its tiles are free')
    check(ev(f"(() => {{ const p = FOLK.find(p => p.name === '{cutter}'); return !!p.job && p.job.type !== 'woodcutter'; }})()"), f'{cutter} turned to other work')
    grid = "HOME.buildings.every((b, n) => { for (let v = b.j; v < b.j + b.h; v++) for (let u = b.i; u < b.i + b.w; u++) if (ref[tidx(u, v)] !== n) return false; return true; })"
    check(ev(grid), 'every building tile still points at its building')

    # call off a building site: all of it back; its builder goes back to work
    ev("HOME.stock.planks = 10; HOME.stock.stone = 20")
    site = ev("(() => { const L = LANDING; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!placeProblem('smithy', i, j) && Math.hypot(i - L[0], j - L[1] + 5) < 8) return [i, j]; })()")
    s0 = ev('({ ...HOME.stock })'); ev(f"placeBuilding('smithy', {site[0]}, {site[1]})")
    for _ in range(30):
        if ev(f"!!{B}('smithy').builder"): break
        step(.5)
    builder = ev(f"{B}('smithy').builder && {B}('smithy').builder.name")
    check(bool(builder), f'someone builds the smithy ({builder})')
    ev(f"tearDown({B}('smithy'))"); step(1)
    s1 = ev('({ ...HOME.stock })')
    check(s1['planks'] == s0['planks'] and s1['stone'] >= s0['stone'], f'calling off the site gives all of it back {s0} → {s1}')
    check(ev(f"(() => {{ const p = FOLK.find(p => p.name === '{builder}'); return !p.job || p.job.type !== 'build'; }})()"), f'{builder} stops building')
    check(ev(grid), 'the tile grid is still right')

    # tear down a field: free, nothing back, the soil turns back to grass
    f = ev("(b => [b.i, b.j])(HOME.buildings.find(b => b.type === 'field'))")
    ev("tearDown(HOME.buildings.find(b => b.type === 'field'))")
    check(ev(f"thingAt({f[0]}, {f[1]}) === 0 && groundMat({f[0]}, {f[1]}, HOME.season) !== GROUND_MAT[G_SOIL]"), 'a field torn down is grass again')

    # through the building's panel: two presses of [TEAR DOWN]
    ev(f"pickBuilding({B}('fishing')); Glyphite.test.render()")
    check(ev("MENU.some(m => m.id === 'pause') && MENU.some(m => m.id === 'raze')"), 'the panel has [PAUSE] and [TEAR DOWN]')
    ev("MENU.find(m => m.id === 'raze').act(); Glyphite.test.render()")
    check(ev(f"RAZE === {B}('fishing') && !!{B}('fishing')"), 'the first press only asks')
    ev("MENU.find(m => m.id === 'raze').act()")
    check(ev(f"!{B}('fishing') && PICK === null"), 'the second tears it down and closes the panel')
    check(ev(grid), 'the tile grid is still right')

    # a well built over a stump, then torn down: a tree planted there is counted once (the stump's entry is gone for good)
    once = ev('''(() => { HOME.stock.stone += 4;
      const felled = t => { const k = tidx(t.i, t.j); if (!t.alive || thing[k] !== T_TREE) return false; thing[k] = T_STUMP; if (!placeProblem('well', t.i, t.j)) return true; thing[k] = T_TREE; return false; };
      const t = trees.find(felled); tearDown(placeBuilding('well', t.i, t.j)); addTree(t.i, t.j, 'pine', 1);
      return trees.filter(q => q.alive && q.i === t.i && q.j === t.j).length; })()''')
    check(once == 1, f'a stump built over and then planted again is one tree ({once})')

    # the longhouse too: everyone carries on, the store moves to the landing
    ev(f"tearDown({B}('longhouse'))"); step(10)
    check(ev("store()[0] === LANDING[0] && HOME.buildings.every(b => b.type !== 'longhouse')"), 'without the longhouse the store is at the landing')

    # the news: at least six seconds, longer for a longer one, held while the game is paused
    ev("NEWS = []; news('SHORT'); news('A MUCH LONGER MESSAGE THAT TAKES SOME TIME TO READ ALL THE WAY TO THE END')")
    step(5.5); check(ev('NEWS.length') == 2, 'after 5.5 s both messages are still there')
    step(1); check(ev("NEWS.map(m => m.text)") == ['A MUCH LONGER MESSAGE THAT TAKES SOME TIME TO READ ALL THE WAY TO THE END'], 'after 6.5 s the short one is gone, the long one stays')
    ev("news('A MUCH LONGER MESSAGE THAT TAKES SOME TIME TO READ ALL THE WAY TO THE END')")
    check(ev('NEWS.length === 1 && NEWS[0].age === 0'), 'the same message again starts its time over')
    ev("NEWS = []; for (let k = 0; k < 6; k++) news('MESSAGE ' + k)")
    check(ev("NEWS.length === 4 && NEWS[0].text === 'MESSAGE 2'"), 'at most four at once, the oldest go first')
    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('FAIL: ' + ' | '.join(fail) if fail else 'OK')
sys.exit(1 if fail else 0)
