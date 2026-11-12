#!/usr/bin/env python3
"""The Proving Ground's stations, one by one, with the real game in a real page (both renderers are in tests/smoke.py).

  python3 games/proving/tests/mechanics.py        (build first: node tools/pixelite.mjs build proving)

Each check puts the hero at a station (teleport, then Pixelite.test.step) and looks at what the engine did: walking, ladders, ice, belts,
springs, spikes, the ferry and the lift, the low-gravity zone, slimes, pebbles, bombs, digging, checkpoints and the save, the goal, gamepad input,
rebinding, and that a recorded run replays to the same world.
PIXELITE_BROWSER_CHANNEL=chrome (or tools/with_chrome.py) runs it in the installed Chrome.
"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
URL = f'file:///{ROOT.as_posix()}/dist/games/proving/index.html'
fails = []


def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)


async def new_page(p, query=''):
    b = await p.chromium.launch(args=['--disable-gpu'], channel=os.environ.get('PIXELITE_BROWSER_CHANNEL') or None)
    page = await b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(URL + query + '#2d'); await page.wait_for_timeout(700)
    await page.evaluate('Pixelite.test.start(); Pixelite.test.freeze()')
    return b, page, errs

# JS helpers: tp(col, row) puts the hero's feet on the top of tile row `row` (18 = the ground), at the middle of column col
HELP = """
window.tp = (col, row) => { const c = HERO_E.char; c.x = col * MAP.tc + MAP.tc / 2; c.y = row * MAP.tc; c.vx = c.vy = 0; HERO_E.x = c.x; HERO_E.y = c.y; HERO_E.invuln = 0; };
window.st = (n, keys = []) => Pixelite.test.step(n, keys);
window.hero = () => HERO_E.char;
window.tpOn = pl => { const c = HERO_E.char; c.x = pl.X0 + pl.offX; c.y = pl.oy + pl.offY; c.vx = c.vy = 0; HERO_E.x = c.x; HERO_E.y = c.y; };
0;
"""


async def main():
    async with async_playwright() as p:
        b, page, errs = await new_page(p)
        await page.evaluate(HELP)
        probe = await page.evaluate('st(1)')
        check(probe['game']['stats']['total'] == 35 and probe['entities']['coin'] == 35, f"the level has 35 coins and the hero ({probe['entities']})")
        check(probe['levels'] == [2], 'the game offers one detail level')
        # --- coin ---------------------------------------------------------------------
        await page.evaluate('tp(3, 18)'); await page.evaluate("st(5)")
        c0 = await page.evaluate('STATS.coins'); await page.evaluate("tp(8, 17); st(3)")
        check(await page.evaluate('STATS.coins') > c0, 'a coin is picked up')
        # --- walking and jumping -------------------------------------------------------
        x0 = await page.evaluate('hero().x'); await page.evaluate("st(60, ['ArrowRight'])")
        check(await page.evaluate('hero().x') - x0 > 20, 'walks right')
        h0 = await page.evaluate('hero().y')
        top = await page.evaluate("(() => { let t = hero().y; for (let i = 0; i < 90; i++) { st(1, ['Space']); t = Math.min(t, hero().y); } return t; })()")
        check(14 * 2 * .8 < h0 - top < 14 * 2 * 1.2, f'a full jump is about 14 base units high ({(h0 - top) / 2:.1f})')
        # --- ladder and catwalk -------------------------------------------------------
        await page.evaluate('tp(22, 18); st(5)')
        await page.evaluate("st(260, ['ArrowUp'])")
        check(await page.evaluate('hero().y') < 12 * 8 + 2 and await page.evaluate('hero().onGround'), 'climbs the ladder to the high ledge and stands on it')
        await page.evaluate("tp(16, 18); st(5)")
        await page.evaluate("st(170, ['Space'])")    # jump up through the catwalk (row 15) and land on it
        check(await page.evaluate('hero().ground') > 0 and await page.evaluate('hero().y') < 16 * 8, 'jumps up through a catwalk and lands on it')
        # --- ice, belts -----------------------------------------------------------------
        async def slide(col):
            await page.evaluate(f'tp({col}, 18); st(5)')
            await page.evaluate("st(110, ['ArrowRight'])"); x1 = await page.evaluate('hero().x')
            await page.evaluate('st(30)'); return await page.evaluate('hero().x') - x1
        rock, ice = await slide(10), await slide(34)
        check(ice > rock * 4, f'ice slides far ({ice:.0f} cells against {rock:.0f} on rock)')
        await page.evaluate('tp(44, 18); st(5)'); xb = await page.evaluate('hero().x'); await page.evaluate('st(60)')
        check(await page.evaluate('hero().x') - xb > 12, 'a conveyor belt carries a standing hero')
        # --- spring and spikes ----------------------------------------------------------
        await page.evaluate('tp(54, 18); st(5)'); await page.evaluate("st(300, ['ArrowRight'])")
        check(await page.evaluate('hero().x') > 66 * 8, f"the spring throws the hero over the pit (x {await page.evaluate('hero().x'):.0f})")
        d0 = await page.evaluate('STATS.deaths'); await page.evaluate("tp(61, 14); st(200)")
        check(await page.evaluate('STATS.deaths') > d0 or await page.evaluate('STATS.hp') < 3, 'falling on the spikes hurts or kills')
        # --- ferry and lift -------------------------------------------------------------
        await page.evaluate("for (const e of entities) if (e.type === 'slime') e.dead = true; STATS.hp = 3; st(2)")   # the patrolling slimes would wander onto the platforms (they ride them)
        await page.evaluate('tpOn(FERRY_P); st(3)')
        check(await page.evaluate('hero().platform !== null'), 'the hero stands on the ferry')
        # a platform's phase depends on how long the level has run: ride it and take the furthest the hero was carried
        ride = """(axis) => { let far = 0, on = true; const x0 = hero()[axis]; for (let i = 0; i < 24; i++) { st(20); far = Math.max(far, Math.abs(hero()[axis] - x0)); if (!hero().platform) on = false; } return [far, on]; }"""
        far, on = await page.evaluate(f"({ride})('x')")
        check(far > 30 and on, f"the ferry carries the hero ({far:.0f} cells, stayed on: {on})")
        await page.evaluate('tpOn(LIFT_P); st(3)')
        far, on = await page.evaluate(f"({ride})('y')")
        check(far > 20 and on, f"the lift carries the hero ({far:.0f} cells, stayed on: {on})")
        # --- the low-gravity room ------------------------------------------------------
        async def jump_height(col):
            await page.evaluate(f'tp({col}, 18); st(5)'); y0 = await page.evaluate('hero().y'); t = y0
            for _ in range(160):
                await page.evaluate("st(1, ['Space'])"); t = min(t, await page.evaluate('hero().y'))
            return y0 - t
        normal, low = await jump_height(12), await jump_height(95)
        check(low > normal * 1.6, f'a jump in the low-gravity room goes higher ({low:.0f} against {normal:.0f})')
        # --- slimes, pebbles, bombs, digging ------------------------------------------
        # a slime under a falling hero is stomped; a pebble thrown at one kills it
        await page.evaluate("globalThis.sl = spawn('slime', 27 * 8 + 4, 144); sl.dir = 0; tp(27, 15); st(60)")
        check(await page.evaluate('sl.dead'), 'jumping on a slime stomps it')
        await page.evaluate("globalThis.sl2 = spawn('slime', 38 * 8, 18 * 8); sl2.char.y = sl2.y = 144; sl2.dir = 0; tp(33, 18); HERO_E.facing = HERO_E.char.facing = 1; st(3)")
        await page.evaluate("Pixelite.test.press('KeyJ'); st(60)")
        check(await page.evaluate('sl2.dead'), 'a pebble kills a slime')
        await page.evaluate("globalThis.sl3 = spawn('slime', 31 * 8, 144); sl3.dir = 0; tp(31, 18); HERO_E.invuln = 0; st(3)")
        await page.evaluate("for (let i = 0; i < 6; i++) { st(1); }")
        check(await page.evaluate('STATS.hp') < 3 or await page.evaluate('HERO_E.invuln') > 0, 'walking into a slime hurts')
        await page.evaluate("sl3.dead = true; STATS.hp = 3; st(2)")
        bricks0 = await page.evaluate("(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === BRICK) n++; return n; })()")
        await page.evaluate("HERO_E.char.x = HERO_E.x = 100 * 8; fireProjectile({ x: 106 * 8 + 4, y: 17 * 8, vx: 0, vy: 40, gravity: 0, onHit: p => { blastFrom(p.vx, p.vy); explode(p.x, p.y, 9 * RES, 1.5); } }); st(420)")
        top_left = await page.evaluate("getC(106 * 8 + 4, 12 * 8 + 4)")
        bricks1 = await page.evaluate("(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === BRICK) n++; return n; })()")
        check(top_left == 0 and bricks1 < bricks0, f'a bomb brings the brick tower down (its top row is empty, {bricks0} -> {bricks1} cells)')
        await page.evaluate('tp(128, 18); HERO_E.facing = 1; HERO_E.char.facing = 1; st(3)')
        d0 = await page.evaluate("(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === DIRT) n++; return n; })()")
        for _ in range(8):
            await page.evaluate("Pixelite.test.press('KeyL'); st(14, ['KeyL'])")
        d1 = await page.evaluate("(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === DIRT) n++; return n; })()")
        check(d1 < d0, f'digging removes dirt ({d0} -> {d1})')
        # --- the grappling hook, rewind -----------------------------------------------------
        d0 = await page.evaluate('STATS.deaths')
        await page.evaluate("for (const e of entities) if (e.type === 'slime') e.dead = true; STATS.hp = 3; HERO_E.hook.release(); tp(70, 18); HERO_E.facing = HERO_E.char.facing = 1; st(3)")
        await page.evaluate("Pixelite.test.press('KeyE'); st(1)")
        check(await page.evaluate('HERO_E.hook.rope !== null'), 'the hook catches the beam over the pit')
        await page.evaluate("st(150, ['ArrowRight'])")
        probe = await page.evaluate('({ x: hero().x, y: hero().y, hang: hero().hanging, deaths: STATS.deaths })')
        check(probe['x'] > 72 * 8 and probe['y'] < 21 * 8 and probe['deaths'] == d0, f"the hero swings out over the pit on the rope ({probe})")
        await page.evaluate("Pixelite.test.press('KeyE'); st(2); tp(10, 18); st(60)")
        x1 = await page.evaluate("st(80, ['ArrowRight']); hero().x")
        await page.evaluate("st(12, ['KeyR'])"); x2 = await page.evaluate('hero().x')
        check(x2 < x1 - 20, f'holding rewind puts the hero back ({x1:.0f} -> {x2:.0f})')
        await page.evaluate("st(20)")
        # --- the pool: swimming, buoyancy, a splash, coins under the surface, light that dims with depth, a way out --------------------
        await page.evaluate("for (const e of entities) if (e.type === 'slime') e.dead = true; STATS.hp = 3; HERO_E.hook.release(); tp(109, 18); HERO_E.facing = HERO_E.char.facing = 1; st(3)")
        hp0 = await page.evaluate('STATS.hp')
        fell = await page.evaluate("(() => { let sp = 0, drops = 0; for (let i = 0; i < 100; i++) { st(1, ['ArrowRight']); sp = Math.max(sp, hero().splashed); drops = Math.max(drops, P.n); } return [sp, drops]; })()")
        check(await page.evaluate('hero().swimming && hero().inLiquid > .5') and fell[0] > 0 and fell[1] > 2, f'walking off the edge, the hero falls in and swims, with a splash (speed {fell[0]:.0f}, {fell[1]} droplets)')
        check(await page.evaluate('STATS.hp') == hp0 and await page.evaluate('hero().landed') == 0, 'water is a soft landing')
        await page.evaluate("tp(111, 20); st(2)")
        y0 = await page.evaluate('hero().y'); await page.evaluate('st(30)'); y1 = await page.evaluate('hero().y')
        check(0 < y1 - y0 < 14, f'idle in the water the hero sinks slowly ({y1 - y0:.1f} cells in half a second)')
        tread = await page.evaluate("(() => { st(100, ['Space']); let sw = 0, under = 0; for (let i = 0; i < 60; i++) { st(1, ['Space']); sw += hero().swimming ? 1 : 0; under += hero().submerged ? 1 : 0; } return [sw, under, hero().y]; })()")
        check(tread[1] == 0 and tread[0] > 25 and abs(tread[2] - 19 * 8) < 12, f'holding jump brings the hero up to the surface and it treads water there, head out ({tread})')
        await page.evaluate("st(120, ['ArrowDown'])")
        check(await page.evaluate('hero().onGround') and await page.evaluate('hero().y') > 21 * 8, 'down dives to the bottom of the pool')
        c0 = await page.evaluate('STATS.coins'); await page.evaluate("tp(112, 22); st(6)")
        check(await page.evaluate('STATS.coins') > c0, 'a coin on the bottom of the pool is picked up')
        await page.evaluate("for (const [c, r] of [[112, 22], [114, 21], [116, 22], [118, 21]]) { tp(c, r); st(6); }")
        left = await page.evaluate("entities.filter(e => e.type === 'coin' && e.x > 880 && e.x < 980 && !e.dead).length")
        check(left == 0, 'every coin in the pool, on the bottom and floating in the water, is picked up')
        # the water's own look and light: drawn blue with a brighter top row, and the sun is dimmer (and bluer) at the bottom than at the surface
        await page.evaluate("tp(124, 18); st(2); Pixelite.test.render()")
        lit = await page.evaluate("""(() => {
          const px = (cx, cy) => { const k = (cy - L_OY) * R.RW + (cx - L_OX) , q = k * 4; return [R.wPix[q], R.wPix[q + 1], R.wPix[q + 2]]; };
          const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2], at = (cx, cy) => lightAtCell(cx, cy, [0, 0, 0]);
          // the top row is the first water cell of the column: the surface is not always on row 19 * 8 (it sloshes for a moment after the hero has been thrashing about in it)
          const col = 118 * 8 + 4; let y0 = 17 * 8; while (y0 < 22 * 8 && !MAT_LIQ[getC(col, y0)]) y0++;
          const top = px(col, y0), below = px(col, y0 + 3), deep = px(col, 21 * 8 + 4);
          return { top, below, deep, ltop: at(col, 19 * 8 + 2), ldeep: at(col, 21 * 8 + 4), topRowBrighter: lum(top) > lum(below) };
        })()""")
        check(lit['top'][2] > lit['top'][0] and lit['deep'][2] > lit['deep'][0], f"the water is drawn blue ({lit['top']}, {lit['deep']})")
        check(lit['topRowBrighter'], f"the top row of the water is brighter than the row under it ({lit['top']} over {lit['below']})")
        check(lit['ldeep'][0] < lit['ltop'][0] * .85 and lit['ldeep'][2] / max(lit['ldeep'][0], 1e-4) > lit['ltop'][2] / max(lit['ltop'][0], 1e-4), f"the light is dimmer and bluer at the bottom (red {lit['ltop'][0]:.2f} -> {lit['ldeep'][0]:.2f})")
        # a way out: swim up and across with jump held, then a press at the surface hops out onto the steps and the bank
        await page.evaluate("tp(114, 22); st(2)")
        await page.evaluate("st(260, ['ArrowRight', 'Space'])"); await page.evaluate("st(2)")
        await page.evaluate("st(120, ['ArrowRight', 'Space'])")
        probe = await page.evaluate('({ x: hero().x, y: hero().y, g: hero().onGround, w: hero().swimming })')
        check(probe['x'] > 122 * 8 and probe['g'] and not probe['w'], f'the hero swims across, hops out and stands on the far bank ({probe})')
        # --- checkpoint, save, goal ------------------------------------------------------
        await page.evaluate('tp(31, 18); st(5)')
        check(await page.evaluate('STATS.cp') >= 0 and await page.evaluate("Pixelite.load('run') !== null"), 'a checkpoint is saved')
        await page.evaluate('tp(131, 18); st(5)')
        check(await page.evaluate('state') == 'won', 'touching the goal wins')
        # a better run leaves a ghost for the next one
        await page.evaluate("Pixelite.erase('run'); newLevel(false); setState('play'); st(5)")
        check(await page.evaluate("Pixelite.load('ghost') !== null") and await page.evaluate("entityCounts().ghost") == 1, 'the best run is replayed as a ghost on the next one')
        await b.close()
        # --- the save brings the run back; rebinding is kept; a gamepad plays ---------------
        b, page, errs = await new_page(p)
        await page.evaluate(HELP)
        await page.evaluate('tp(31, 18); st(5)'); await page.evaluate("bindAction('jump', 'KeyV')")
        await page.reload(); await page.wait_for_timeout(700)
        await page.evaluate('Pixelite.test.start(); Pixelite.test.freeze()'); await page.evaluate(HELP)
        probe = await page.evaluate('st(1)')
        check(probe['game']['stats']['cp'] >= 0 and probe['game']['hero']['x'] > 20 * 8, f"after a reload the run continues at its checkpoint (x {probe['game']['hero']['x']})")
        check(await page.evaluate("ACTIONS.jump.tokens.includes('KeyV')"), 'a rebound key is kept')
        await page.evaluate("""navigator.getGamepads = () => [{ connected: true, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 15, value: i === 15 ? 1 : 0 })), axes: [0, 0] }]""")
        x0 = await page.evaluate('hero().x'); await page.evaluate('st(40)')
        check(await page.evaluate('hero().x') - x0 > 10 and await page.evaluate('Input.pointer') == 'pad', 'a gamepad d-pad right walks the hero')
        await b.close()
        # --- a recorded run plays back to the same world ----------------------------------
        async def run(query, fn):
            b, page, errs = await new_page(p, query); await page.evaluate(HELP)
            out = await fn(page); await b.close(); return out
        async def rec(page):
            await page.evaluate("Pixelite.test.record(); st(60, ['ArrowRight']); st(30, ['ArrowRight', 'Space']); st(30, ['ArrowRight', 'KeyJ']); st(60, ['ArrowRight'])")
            return await page.evaluate("[Pixelite.test.stop(), Pixelite.test.hash(), JSON.stringify(hero().x)]")
        log, h1, x1 = await run('?seed=7', rec)
        async def rep(page):
            await page.evaluate('(l) => Pixelite.test.replay(l)', log)
            return await page.evaluate("[Pixelite.test.hash(), JSON.stringify(hero().x)]")
        h2, x2 = await run('?seed=7', rep)
        check(h1 == h2 and x1 == x2, 'a recorded run replays to the same world and position')
        check(not errs, f'no page errors {errs[:2]}')
    print('FAILED: ' + '; '.join(fails) if fails else 'all Proving Ground checks passed')
    sys.exit(1 if fails else 0)

asyncio.run(main())
