// Liquids (engine plan D2) with no game and no browser: the flow keeps its mass and settles flat, thick liquids creep, sand sinks or floats by density,
// a Character swims, a Body floats or sinks, particles splash and rejoin, and structures, light and rays treat a liquid as no structure at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

// a world with a rock floor (material 1), water (2, thin), sand (3), steel (4), oil (5, lighter than water), honey (6, thick) and pumice (7, floats)
const world = (res = 2, w = 100, h = 80) => {
  const E = loadEngine(); E.run(`setResVars(${res})`);
  E.run(`defineMaterial('rock', { tough: 5, anchor: true }); defineMaterial('water', { liquid: true, albedo: [.2, .5, .9], viscosity: .05, density: 1 });
    defineMaterial('sand', { granular: true, density: 1.6 }); defineMaterial('steel', { tough: 5, brittle: false, density: 3 });
    defineMaterial('oil', { liquid: true, albedo: [.5, .4, .1], viscosity: .1, density: .7 }); defineMaterial('honey', { liquid: true, albedo: [.9, .6, .1], viscosity: .9, density: 1.4 });
    defineMaterial('pumice', { granular: true, density: .4 });
    worldMaterials({ edge: 1, rubble: 3 }); worldInit(${w} * RES, ${h} * RES);
    globalThis.F = H - 4 * RES; for (let y = F; y < H; y++) for (let x = 0; x < W; x++) setC(x, y, 1);`);
  return E;
};
const count = (E, m) => E.run(`(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === ${m}) n++; return n; })()`);
// a basin of rock walls `w` base units wide with its left wall at x0 (base units), as high as 20 base units
const basin = (E, x0, w) => E.run(`globalThis.bx0 = ${x0} * RES; globalThis.bx1 = bx0 + ${w} * RES; for (let y = F - 30 * RES; y < F; y++) { setC(bx0, y, 1); setC(bx1, y, 1); }`);
const settle = (E, max = 3000) => { let n = 0; for (; n < max; n++) { E.run('frameNo++; stepParticles(DT); simGranular();'); if (n % 10 === 9 && !E.run('awake.some(v => v)') && E.run('P.n') === 0) break; } return n; };
const heights = (E, m, x0, x1) => E.run(`(() => { const t = []; for (let x = ${x0} + 1; x < ${x1}; x++) { let h = 0; for (let y = F - 1; y >= 0 && cells[y * W + x] === ${m}; y--) h++; t.push(h); } return t; })()`);

test('a poured column becomes a flat pool with the same number of cells, at every detail level', () => {
  for (const res of [1, 2, 3]) {
    const E = world(res); basin(E, 20, 14);
    E.run(`for (let y = F - 30 * RES - 2; y < F - 2; y++) setC((bx0 + bx1) >> 1, y, 2);`);   // a single column of 30 base units, floating in the air over the basin's middle
    const n0 = count(E, 2), steps = settle(E);
    assert.ok(steps < 600, `res ${res}: it came to rest (${steps} steps)`);
    assert.equal(count(E, 2), n0, `res ${res}: no cell made or lost`);
    const h = heights(E, 2, E.run('bx0'), E.run('bx1'));
    assert.ok(Math.max(...h) - Math.min(...h) <= 1, `res ${res}: flat to within a row (${h.join(' ')})`);
    assert.ok(Math.min(...h) >= 1, `res ${res}: the whole floor is wet`);
  }
});

test('liquid poured from a height and thrown about by blasts keeps its mass; droplets rejoin it', () => {
  const E = world(2); basin(E, 20, 30);
  E.run('for (let y = 0; y < 8 * RES; y++) for (let x = 30 * RES; x < 36 * RES; x++) setC(x, y, 2);');   // a block of water in the air falls in
  const n0 = count(E, 2); settle(E);
  assert.equal(count(E, 2), n0, 'the fall and the landing lose nothing');
  E.run('for (let i = 0; i < 20; i++) spawnGrain(40 * RES, F - 40 * RES, rr(-5, 5), 0, 2);');   // droplets (grains of liquid) land and become cells again
  settle(E);
  assert.equal(count(E, 2), n0 + 20, 'twenty droplets are twenty cells');
  const h = heights(E, 2, E.run('bx0'), E.run('bx1')); assert.ok(Math.max(...h) - Math.min(...h) <= 1, `still flat (${h.join(' ')})`);
  // a blast inside the pool throws some of it up; what comes down rejoins (a tenth of the blasted cells is allowed to vanish as spray)
  E.run('explode(45 * RES, F - 3 * RES, 6 * RES, 1, true)'); settle(E, 4000);
  assert.ok(count(E, 2) > (n0 + 20) * .93, `most of the water is back (${count(E, 2)} of ${n0 + 20})`);
});

test('a thick liquid creeps and a thin one runs: the same heap spreads far less in the same time', () => {
  const spread = m => { const E = world(2); E.run(`for (let y = F - 12 * RES; y < F; y++) for (let x = 48 * RES; x < 52 * RES; x++) setC(x, y, ${m});`); const n0 = count(E, m); for (let i = 0; i < 60; i++) E.run('frameNo++; simGranular();'); assert.equal(count(E, m), n0, 'mass kept');
    const xs = E.run(`(() => { let lo = 1e9, hi = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cells[y * W + x] === ${m}) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return hi - lo; })()`); return xs; };
  const thin = spread(2), thick = spread(6);
  assert.ok(thin > thick * 2.5, `water spread ${thin} cells in a second, honey ${thick}`);
});

test('sand sinks through water and rests on the floor under it; pumice floats; a heavier liquid sinks through a lighter one; nothing is lost', () => {
  const E = world(2); basin(E, 20, 30);
  E.run('for (let y = F - 8 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2);');   // 8 base units of water
  for (let y = 0; y < 3; y++) E.run('for (let x = 30 * RES; x < 34 * RES; x++) setC(x, F - 14 * RES - 3 * RES + ' + y + ', 3);');   // sand above it
  E.run('for (let x = 40 * RES; x < 44 * RES; x++) setC(x, F - 14 * RES, 7);');                                                    // pumice above it
  const w0 = count(E, 2), s0 = count(E, 3), p0 = count(E, 7); settle(E, 4000);
  assert.equal(count(E, 2), w0, 'water kept'); assert.equal(count(E, 3), s0, 'sand kept'); assert.equal(count(E, 7), p0, 'pumice kept');
  const col = (x, m) => E.run(`(() => { const ys = []; for (let y = 0; y < H; y++) if (cells[y * W + ${x}] === ${m}) ys.push(y); return ys; })()`);
  const sand = E.run('(() => { const out = []; for (let x = bx0 + 1; x < bx1; x++) for (let y = 0; y < H; y++) if (cells[y * W + x] === 3) out.push([x, y]); return out; })()');
  assert.ok(sand.length > 0 && sand.every(([x, y]) => E.run(`getC(${x}, ${y + 1})`) === 1 || E.run(`getC(${x}, ${y + 1})`) === 3), 'every grain of sand rests on the floor or on sand');
  const water = E.run('(() => { const ys = []; for (let x = bx0 + 1; x < bx1; x++) for (let y = 0; y < H; y++) if (cells[y * W + x] === 2) ys.push(y); return ys; })()');
  assert.ok(Math.min(...sand.map(s => s[1])) > Math.min(...water), 'the sand is under the surface of the water');
  const pumice = E.run('(() => { const out = []; for (let x = bx0 + 1; x < bx1; x++) for (let y = 0; y < H; y++) if (cells[y * W + x] === 7) out.push([x, y]); return out; })()');
  assert.ok(pumice.every(([x, y]) => E.run(`getC(${x}, ${y + 1})`) !== 0), 'pumice rests on something'); assert.ok(pumice.every(([, y]) => y <= Math.min(...water) + 1), 'pumice floats at the surface, not at the bottom');
  // oil over water stays over it; water poured over oil goes under
  const E2 = world(2); basin(E2, 20, 30);
  E2.run('for (let y = F - 6 * RES; y < F - 3 * RES; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 5); for (let y = F - 3 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2);');   // oil on water: stable
  const a0 = count(E2, 5), b0 = count(E2, 2); settle(E2); assert.equal(E2.run('getC(bx0 + 5, F - 1)'), 2, 'water stays under the oil'); assert.equal(E2.run('getC(bx0 + 5, F - 3 * RES - 1)'), 5);
  const E3 = world(2); basin(E3, 20, 30);
  E3.run('for (let y = F - 6 * RES; y < F - 3 * RES; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2); for (let y = F - 3 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 5);');   // water on oil: they swap
  settle(E3, 4000); assert.equal(E3.run('getC(bx0 + 5, F - 1)'), 2, 'the heavier water sank to the bottom'); assert.equal(count(E3, 5), a0); assert.equal(count(E3, 2), b0);
  assert.ok(col(30 * 2, 3).length >= 0);
});

test('a liquid is not solid: a Character, a Body and particles pass into it, sunlight reaches the bottom of a pool, and a ray goes through', () => {
  const E = world(2); basin(E, 20, 30);
  E.run('for (let y = F - 12 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2); setSun(80);');
  assert.equal(E.run('solidU(40 * RES, F - 4 * RES)'), false, 'not solid to a point');
  assert.equal(E.run('sunAt(40 * RES, F - 2 * RES)'), true, 'the sun reaches the bottom of the pool (a liquid casts no shadow)');
  assert.equal(E.run('lineClear(25 * RES, F - 8 * RES, 44 * RES, F - 2 * RES, 0)'), true, 'a straight line through the water is clear');
  assert.equal(E.run('raycast(30 * RES, F - 30 * RES, 0, 1, 400) && raycast(30 * RES, F - 30 * RES, 0, 1, 400).material'), 1, 'a ray passes through the water to the floor');
  assert.equal(E.run('raycast(30 * RES, F - 30 * RES, 0, 1, 400, { liquids: true }).material'), 2, 'unless asked to stop at the liquid');
  // a spark is put out, a grain of sand goes in and sinks, a fast one splashes
  E.run('spawnP(PT_SPARK, 40 * RES, F - 20 * RES, 0, 30, 3, 42, 0); spawnGrain(36 * RES, F - 20 * RES, 0, 60 * RES, 3);');
  const sand0 = count(E, 3), water0 = count(E, 2); let splashed = 0;
  for (let i = 0; i < 400; i++) { E.run('frameNo++; stepParticles(DT); simGranular();'); splashed = Math.max(splashed, E.run('P.n')); }
  assert.ok(splashed > 2, `the fast grain sprayed droplets (${splashed} particles at most)`);
  assert.equal(count(E, 3), sand0 + 1, 'the grain of sand became a cell again, in the water'); assert.equal(count(E, 2), water0, 'and moved no water away for good');
});

test('structures never see a liquid: a pool is no island, no support, and a chunk lands in it by moving the water aside', () => {
  const E = world(2); basin(E, 20, 30);
  E.run('worldMaterials({ edge: 1, rubble: 3, fill: 1 });');
  // water floating in mid-air is not a floating island, and the check around it makes no chunk and no fill
  E.run('for (let y = F - 40 * RES; y < F - 30 * RES; y++) for (let x = 60 * RES; x < 70 * RES; x++) setC(x, y, 2);');
  const w0 = count(E, 2);
  E.run('checkSupport(65 * RES, F - 35 * RES, 20 * RES); settleIslands()');
  assert.equal(E.run('chunks.length'), 0, 'no chunk'); assert.equal(count(E, 2), w0, 'the water is where it was'); assert.equal(E.run('getC(65 * RES, F - 20 * RES)'), 0, 'and nothing was filled under it');
  // a steel post standing in a pool, cut at its foot: it falls as a chunk of steel only, and the pool does not come with it
  E.run('for (let y = F - 12 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2);');
  E.run('for (let y = F - 40 * RES; y < F - 6 * RES; y++) for (let x = 30 * RES; x < 32 * RES; x++) setC(x, y, 4);');   // a girder from the floor, standing in the water
  E.run('for (let y = F - 7 * RES; y < F - 6 * RES; y++) for (let x = 30 * RES; x < 32 * RES; x++) setC(x, y, 0);');   // cut: the top falls
  const st0 = count(E, 4), w1 = count(E, 2);
  E.run('checkSupport(31 * RES, F - 7 * RES, 4 * RES)');
  assert.equal(E.run('chunks.length'), 1, 'the cut piece is a chunk'); assert.equal(E.run('chunks[0].n'), st0, 'made of steel only');
  for (let i = 0; i < 1500 && E.run('chunks.length'); i++) E.run('frameNo++; stepChunks(DT); stepParticles(DT); simGranular();');
  assert.equal(E.run('chunks.length'), 0, 'it came to rest and froze');
  settle(E); assert.equal(count(E, 4), st0, 'every cell of steel is back in the grid'); assert.equal(count(E, 2), w1, 'the water is all still there (it moved aside, or rose)');
});

test('a Character swims: it sinks slowly, strokes up and across, breaks the surface and hops out, and reads how deep it is', () => {
  const E = world(2); basin(E, 20, 40);
  E.run('setGravity(9.8); for (let y = F - 20 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2);');   // earth gravity; 20 base units deep
  E.run('globalThis.hero = new Character(40 * RES, F - 30 * RES, { w: 4 * RES, h: 6 * RES, run: 16 * RES, jump: 14 * RES }); hero.step(DT, {});');
  assert.equal(E.run('hero.inLiquid'), 0); assert.equal(E.run('hero.swimming'), false, 'dry in the air');
  // falling in: the fall is slowed, no landing, a splash
  let maxSpeed = 0, splashed = 0, maxP = 0;
  for (let i = 0; i < 90; i++) { E.run('hero.step(DT, {}); frameNo++; stepParticles(DT)'); maxSpeed = Math.max(maxSpeed, E.run('hero.vy')); splashed = Math.max(splashed, E.run('hero.splashed')); maxP = Math.max(maxP, E.run('P.n')); }
  assert.ok(E.run('hero.swimming') && E.run('hero.submerged') && E.run('hero.inLiquid') === 1, 'in the water, head under');
  assert.ok(splashed > 10 && maxP > 3, `a splash (${splashed.toFixed(0)} units/s, ${maxP} droplets)`);
  assert.equal(E.run('hero.landed'), 0, 'water is a soft landing');
  const y0 = E.run('hero.y'); for (let i = 0; i < 60; i++) E.run('hero.step(DT, {})');
  const sink = (E.run('hero.y') - y0) / 1;   // units in a second
  assert.ok(sink > 0 && sink < 12 * 2, `idle, it sinks slowly (${sink.toFixed(1)} units in a second)`);
  // holding jump rises to the surface and stays there with the head out
  for (let i = 0; i < 240; i++) E.run('hero.step(DT, { jump: true })');
  let swimming = 0, under = 0; for (let i = 0; i < 90; i++) { E.run('hero.step(DT, { jump: true })'); swimming += E.run('hero.swimming') ? 1 : 0; under += E.run('hero.submerged') ? 1 : 0; }
  assert.equal(under, 0, 'treading water at the surface: the head stays out'); assert.ok(swimming > 40, `and it is still swimming most of the time (${swimming} of 90 steps)`);
  assert.ok(Math.abs(E.run('hero.y') - (E.run('F') - 20 * 2)) < 8 * 2, `near the surface (y ${E.run('hero.y').toFixed(1)})`);
  // left and right swim; down dives
  const x0 = E.run('hero.x'); for (let i = 0; i < 30; i++) E.run('hero.step(DT, { x: 1 })'); assert.ok(E.run('hero.x') > x0 + 8, `swims right (${(E.run('hero.x') - x0).toFixed(1)})`);
  const y1 = E.run('hero.y'); for (let i = 0; i < 30; i++) E.run('hero.step(DT, { down: true })'); assert.ok(E.run('hero.y') > y1 + 8, 'down dives');
  // from the surface, holding jump after a press hops out: the feet clear a bank one tile (4 base units) above the water
  for (let i = 0; i < 200; i++) E.run('hero.step(DT, { jump: true })');
  E.run('hero.step(DT, {})'); const top = E.run('(() => { let t = hero.y; for (let i = 0; i < 40; i++) { hero.step(DT, { jump: true }); t = Math.min(t, hero.y); } return t; })()');
  assert.ok(E.run('F') - 20 * 2 - top > 4 * 2, `a hop out of the water rises over the surface (${(E.run('F') - 40 - top).toFixed(1)} units)`);
  // a character with swim: false wades and falls through
  E.run('hero.o.swim = false; hero.x = 40 * RES; hero.y = F - 30 * RES; hero.vy = 0; hero.vx = 0; for (let i = 0; i < 120; i++) hero.step(DT, {});');
  assert.ok(E.run('hero.onGround'), 'without swim it goes to the bottom like in air');
});

test('a thick liquid slows a swimmer, and a Body floats or sinks by its density, with drag', () => {
  const E = world(2); basin(E, 20, 40);
  E.run('for (let y = F - 20 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, 2);');
  const swim = m => { const E = world(2); basin(E, 20, 40); E.run(`for (let y = F - 20 * RES; y < F; y++) for (let x = bx0 + 1; x < bx1; x++) setC(x, y, ${m}); globalThis.h = new Character(30 * RES, F - 10 * RES, { w: 4 * RES, h: 6 * RES }); h.step(DT, {}); for (let i = 0; i < 40; i++) h.step(DT, { x: 1 });`); return E.run('h.x') - 30 * 2; };
  assert.ok(swim(2) > swim(6) * 1.3, `water ${swim(2).toFixed(1)} units in 40 steps, honey ${swim(6).toFixed(1)}`);
  const body = dens => { E.run(`globalThis.b = new Body(30 * RES, F - 40 * RES, 1, 1, [{ x: -2, y: 2, kind: 1 }, { x: 2, y: 2, kind: 1 }, { x: -2, y: -2, kind: 0 }, { x: 2, y: -2, kind: 0 }, { x: 0, y: 0, kind: 0 }]); b.dens = ${dens};`);
    let maxIn = 0; for (let i = 0; i < 600; i++) { E.run('b.step(DT)'); maxIn = Math.max(maxIn, E.run('b.inLiquid')); } return { y: E.run('b.y'), inLiquid: E.run('b.inLiquid'), maxIn, vy: E.run('b.vy') }; };
  const heavy = body(3), light = body(.4);
  assert.ok(heavy.maxIn === 1 && heavy.y > E.run('F') - 6 * 2, `a dense body sinks to the floor (y ${heavy.y.toFixed(1)}, floor ${E.run('F')})`);
  assert.ok(light.y < E.run('F') - 20 * 2 + 4 * 2 && light.inLiquid > 0 && light.inLiquid < 1, `a light body floats with part of it out (${light.inLiquid.toFixed(2)} under, y ${light.y.toFixed(1)})`);
  assert.ok(Math.abs(light.vy) < 2, 'and rests there');
});

test('a Body of rock sinks into water without a hit on its way down; the old games are untouched: no liquid, no change', () => {
  const E = world(2);
  assert.equal(E.run('ANY_LIQ'), 1);
  const E0 = loadEngine(); E0.run("defineMaterial('rock', { tough: 5, anchor: true }); worldInit(40, 40)");
  assert.equal(E0.run('ANY_LIQ'), 0, 'a world without a liquid takes none of the liquid paths');
  for (const m of [0, 1]) assert.equal(E0.run(`MAT_SOLID[${m}]`), m, 'solid is exactly "not empty" there');
});
