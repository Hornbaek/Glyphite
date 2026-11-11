// Entities, timers, rays, projectiles, triggers, tile maps, digging, gravity zones, path finding, the reach search and rescaling,
// on the engine with no game (tests/node/engine-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

const world = (E, w = 96, h = 64, floorRows = 4) => {
  E.run(`defineMaterial('rock', { tough: 5, brittle: false, anchor: true }); defineMaterial('sand', { granular: true }); defineMaterial('steel', { tough: 5, brittle: false });
    worldMaterials({ edge: 1, rubble: 2 }); worldInit(${w}, ${h});
    for (let y = H - ${floorRows}; y < H; y++) for (let x = 0; x < W; x++) setC(x, y, 1);`);
};

test('entities: spawn, update, sleep far away, touch, find near, probe by type; timers, tweens and state machines on the step clock', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E, 400, 100, 4);
  E.run(`defineEntity('coin', { size: [3, 3], props: { value: 1 } });
    defineEntity('bat', { size: [4, 3], always: true, touches: ['coin'], update(e, dt) { e.x += 10 * dt; e.n = (e.n || 0) + 1; }, onTouch(e, c) { c.dead = true; globalThis.got = (globalThis.got || 0) + c.value; } });
    defineEntity('far', { size: [3, 3], update(e) { e.ticks = (e.ticks || 0) + 1; } });
    globalThis.bat = spawn('bat', 10, 50); spawn('coin', 14, 50, { value: 5 }); spawn('coin', 80, 50); globalThis.far = spawn('far', 390, 50);
    cam.x = 0; cam.y = 0; globalThis.step = n => { for (let i = 0; i < n; i++) { frameNo++; stepEntities(DT); stepTimers(DT); stepTriggers(); } };`);
  E.run('step(60)');
  assert.equal(E.run('got'), 5, 'the bat touched the near coin');
  assert.equal(E.run('entityCounts().coin'), 1, 'the touched coin is gone');
  assert.equal(E.run('near(80, 50, 5, "coin").length'), 1); assert.equal(E.run('near(200, 50, 5).length'), 0);
  assert.equal(E.run('far.asleep'), true, 'an entity far from the camera sleeps (no updates)'); assert.ok(!E.run('far.ticks'));
  assert.throws(() => E.run('spawn("bta", 0, 0)'), /did you mean 'bat'/);
  // timers and tweens
  E.run('globalThis.fired = []; after(.5, () => fired.push("a")); globalThis.ev = every(.2, () => fired.push("e")); globalThis.o = { x: 0 }; tween(o, { x: 100 }, 1, "linear", () => fired.push("done")); step(31)');
  assert.equal(E.run('fired.filter(f => f === "e").length'), 2); assert.equal(E.run('fired.includes("a")'), true, 'after fired'); assert.ok(Math.abs(E.run('o.x') - 50) < 3, `tween halfway: ${E.run('o.x')}`);
  E.run('ev.cancel(); step(40)'); assert.equal(E.run('o.x'), 100); assert.equal(E.run('fired.includes("done")'), true);
  assert.equal(E.run('fired.filter(f => f === "e").length'), 2, 'cancelled');
  // fsm
  E.run(`globalThis.me = { sees: false }; me.fsm = fsm({ idle: { to: { chase: e => e.sees } }, chase: { enter(e) { e.chasing = true; }, to: { idle: e => !e.sees } } }, 'idle'); me.fsm.update(me, DT);`);
  assert.equal(E.run('me.fsm.state'), 'idle'); E.run('me.sees = true; me.fsm.update(me, DT)'); assert.equal(E.run('me.fsm.state'), 'chase'); assert.equal(E.run('me.chasing'), true);
});

test('raycast sees terrain, chunks and entities; a projectile cannot tunnel and can bounce; triggers fire; carve and fill dig', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E, 200, 100, 4);
  E.run('for (let y = 20; y < H - 4; y++) setC(100, y, 3)');                     // a one-cell wall
  const hit = E.run('raycast(50.5, 50.5, 1, 0, 200)');
  assert.ok(hit && hit.cell[0] === 100 && hit.nx === -1 && Math.abs(hit.dist - 49.5) < .01, `wall at ${hit && hit.cell}`);
  assert.equal(E.run('raycast(50.5, 50.5, -1, 0, 20)'), null, 'nothing within 20 units to the left');
  E.run(`defineEntity('target', { size: [4, 6] }); globalThis.tg = spawn('target', 70, 60);`);
  const eh = E.run('(() => { const h = raycast(50.5, 55, 1, 0, 200, { entities: true }); return h && h.entity === tg && Math.abs(h.dist - 17.5) < .5; })()');
  assert.equal(eh, true, 'the ray hits the entity before the wall');
  // a fast projectile through the wall: stopped by it
  E.run('globalThis.p = fireProjectile({ x: 60, y: 30, vx: 900, vy: 0, gravity: 0 }); for (let i = 0; i < 10; i++) { frameNo++; stepEntities(DT); }');
  assert.ok(E.run('p.dead && p.x < 101'), `a fast projectile stops at the wall (x ${E.run('p.x')})`);
  E.run('globalThis.b = fireProjectile({ x: 98, y: 30, vx: 200, vy: 0, gravity: 0, bounce: .9 }); for (let i = 0; i < 10; i++) { frameNo++; stepEntities(DT); }');
  assert.ok(E.run('b.vx < 0 && !b.dead'), 'bounces back');
  // triggers
  E.run(`globalThis.log = []; addTrigger({ x: 20, y: 40, w: 10, h: 20 }, { who: ['target'], onEnter: a => log.push('in'), onLeave: a => log.push('out') });
    tg.x = 25; stepTriggers(); tg.x = 60; stepTriggers();`);
  assert.deepEqual([...E.run('log')], ['in', 'out']);
  // carve and fill
  const n = E.run('carve(100, 40, 5, { power: 2 })'); assert.ok(n > 5, `carved ${n}`); assert.equal(E.run('getC(100, 40)'), 0);
  E.run('fill(100, 40, 3, 3)'); assert.equal(E.run('getC(100, 40)'), 3);
});

test('tile maps become worlds with props, spawns and merged triggers; gravity zones change the pull; A* and the reach search find the way', () => {
  const E = loadEngine(); E.run('setResVars(1)');
  E.run(`defineMaterial('rock', { tough: 5, anchor: true }); worldMaterials({ edge: 1 }); defineEntity('slime', { size: [4, 3] });`);
  E.run(`globalThis.map = loadTileMap([
    '..........',
    '..P....e..',
    '#####.ZZ##',
    '#####..ZZ#',
    '##########'], { '#': { mat: 1 }, P: { spawn: 'start' }, e: { entity: 'slime' }, Z: { trigger: 'gap' } }, { tile: 4 });`);
  assert.equal(E.run('map.tc'), 4); assert.equal(E.run('W'), 40); assert.equal(E.run('H'), 20);
  assert.deepEqual([...E.run('map.spawns.start')], [10, 8], 'feet at the bottom middle of the P tile');
  assert.equal(E.run('getC(2, 12)'), 1); assert.equal(E.run('getC(22, 12)'), 0, 'the gap is open');
  assert.equal(E.run('entityCounts().slime'), 1); assert.equal(E.run('entities[0].tile.join()'), '7,1');
  assert.equal(E.run('map.triggers.gap.length'), 1, 'touching Z tiles are one trigger');
  assert.equal(E.run('map.at(10, 7)'), 'P');
  // gravity zones: a body falls half as fast inside
  E.run(`addGravityZone({ x0: 0, y0: 0, x1: 20, y1: 100, scale: .5 });`);
  assert.ok(Math.abs(E.run('gravityAt(10, 10)[1]') - E.run('G') * .5) < 1e-9); assert.equal(E.run('gravityAt(30, 10)[1]'), E.run('G'));
  // A*: around a wall, no corner cutting
  const wall = E.run(`findTilePath(9, 9, (i, j) => !(i === 4 && j < 8), 0, 0, [8, 0])`);
  assert.ok(wall && wall.length >= 8 && wall[wall.length - 1].join() === '8,0', 'goes round the wall'); assert.equal(E.run('findTilePath(5, 5, () => true, 0, 0, [0, 0])').length, 0);
  assert.equal(E.run('findTilePath(5, 5, (i) => i !== 2, 0, 0, [4, 4])'), null, 'a closed wall cannot be crossed');
  // reach search: a hero can reach a ledge a jump away, not one far above
  const E2 = loadEngine(); E2.run('setResVars(1); setGravity(9.8)'); world(E2, 200, 100, 4);
  E2.run('for (let x = 60; x < 90; x++) for (let y = H - 4 - 8; y < H - 4 - 6; y++) setC(x, y, 1); for (let x = 120; x < 150; x++) for (let y = H - 4 - 60; y < H - 4 - 58; y++) setC(x, y, 1);');
  const g = E2.run(`(() => { const r = reachSearch({ x: 20, y: H - 4, opts: { w: 4, h: 6, run: 28, jump: 14 }, max: 40 }); return { n: r.count, hi: r.spots.some(s => s.x > 60 && s.x < 90 && s.y < H - 4 - 5), far: r.spots.some(s => s.y < H - 4 - 50) }; })()`);
  assert.ok(g.n > 3 && g.hi && !g.far, `reach ${JSON.stringify(g)}`);
});

test('the same world at another detail level: rescaleWorld resamples the grid and scales what lives in it', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E, 100, 60, 4);
  E.run(`defineEntity('x', { size: [4, 4] }); globalThis.e = spawn('x', 20, 50); addTrigger({ x: 10, y: 10, w: 10, h: 10 }); globalThis.pf = addPlatform({ x: 30, y: 40, cols: 10, rows: 2, mat: 1, path: [[30, 40], [50, 40]], speed: 10 });`);
  const rock0 = E.run('(() => { let n = 0; for (const c of cells) if (c === 1) n++; return n; })()');
  E.run('setResVars(2); rescaleWorld(2)');
  assert.equal(E.run('W'), 200); assert.equal(E.run('H'), 120);
  const rock1 = E.run('(() => { let n = 0; for (const c of cells) if (c === 1) n++; return n; })()');
  assert.equal(rock1, rock0 * 4, 'solid area scales by k squared');
  assert.equal(E.run('e.x'), 40); assert.equal(E.run('triggers[0].w'), 20); assert.equal(E.run('pf.gw'), 20); assert.equal(E.run('chunks.length'), 1, 'the platform came along');
});
