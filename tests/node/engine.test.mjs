// The engine's physics with no game and no browser (tests/node/engine-harness.mjs): sand, bodies, characters, structures, the seeded random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

const world = (E, w = 96, h = 64, floorRows = 4) => {
  E.run(`defineMaterial('rock', { tough: 5, brittle: false, anchor: true }); defineMaterial('sand', { granular: true }); defineMaterial('steel', { tough: 5, brittle: false });
    worldMaterials({ edge: 1, rubble: 2 }); worldInit(${w}, ${h});
    for (let y = H - ${floorRows}; y < H; y++) for (let x = 0; x < W; x++) setC(x, y, 1);`);
};
const sum = E => E.run('(() => { let h = 0; for (let i = 0; i < cells.length; i++) h = (Math.imul(h, 31) + cells[i]) | 0; return h; })()');
const count = (E, m) => E.run(`(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === ${m}) n++; return n; })()`);

test('the seeded random: the same seed gives the same sand, another seed another sand, mass is kept', () => {
  const run = seed => {
    const E = loadEngine(); world(E, 64, 64);
    E.run(`seedRandom(${seed}); for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) setC(x, y, 2);`);
    const n0 = count(E, 2);
    E.run('for (let i = 0; i < 1500; i++) { frameNo++; stepParticles(DT); simGranular(); }');
    return { h: sum(E), n0, n1: count(E, 2), p: E.run('P.n') };
  };
  const a = run(5), b = run(5), c = run(6);
  assert.equal(a.h, b.h, 'same seed, same world');
  assert.notEqual(a.h, c.h, 'another seed, another pile');
  assert.equal(a.p, 0); assert.equal(a.n1, a.n0, 'sand is neither made nor lost');
});

test('a Character jumps as high at every detail level and steps up a one-row bump', () => {
  for (const res of [1, 2, 3]) {
    const E = loadEngine(); E.run(`setResVars(${res})`); world(E, 160 * res, 64 * res, 4 * res);
    E.run('globalThis.hero = new Character(20 * RES, (H - 4 * RES), { w: 4 * RES, h: 6 * RES, run: 28 * RES, jump: 14 * RES })');
    E.run('for (let i = 0; i < 20; i++) hero.step(DT, {})');                  // settle onto the floor
    assert.ok(E.run('hero.onGround'), `res ${res}: stands`);
    const y0 = E.run('hero.y');
    const rise = E.run(`(() => { let top = hero.y; for (let i = 0; i < 400; i++) { hero.step(DT, { jump: i < 320 }); top = Math.min(top, hero.y); } return ${y0} - top; })()`);
    assert.ok(Math.abs(rise / res - 14) < 2.2, `res ${res}: jumped ${(rise / res).toFixed(1)} base units, wanted 14`);
    // a bump one row high in the way
    E.run(`for (let y = H - 4 * RES - 1; y < H - 4 * RES; y++) for (let x = 40 * RES; x < 60 * RES; x++) setC(x, y, 1)`);
    E.run('hero.x = 30 * RES; for (let i = 0; i < 20; i++) hero.step(DT, {})');
    E.run('for (let i = 0; i < 90; i++) hero.step(DT, { x: 1 })');
    assert.ok(E.run('hero.x') > 45 * res, `res ${res}: walked up and over the bump (x ${E.run('hero.x').toFixed(1)})`);
  }
});

test('a fast Body does not tunnel through a one-cell wall, and a Body comes to rest', () => {
  const E = loadEngine(); E.run('setResVars(1)');
  E.run(`defineMaterial('rock', { tough: 5, anchor: true }); worldMaterials({ edge: 1 }); worldInit(80, 80); for (let x = 0; x < 80; x++) setC(x, 50, 1);`);
  E.run(`globalThis.b = new Body(40, 10, 1, 1, [{ x: -2, y: 2, kind: 1 }, { x: 2, y: 2, kind: 1 }, { x: -2, y: -2, kind: 0 }, { x: 2, y: -2, kind: 0 }]); b.vy = 400;`);
  E.run('for (let i = 0; i < 120; i++) b.step(DT)');
  assert.ok(E.run('b.y') < 50, `still above the wall (y ${E.run('b.y').toFixed(1)})`);
  assert.ok(Math.hypot(E.run('b.vx'), E.run('b.vy')) < 2, 'at rest');
});

test('a cut post falls and freezes back with its mass; a floating hillside sinks as a slab instead of hanging', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E, 120, 90, 4);
  // a post of 3 x 20 steel standing on the floor, cut at its foot
  E.run(`for (let y = H - 4 - 20; y < H - 4; y++) for (let x = 50; x < 53; x++) setC(x, y, 3);`);
  const m0 = count(E, 3);
  E.run('for (let x = 50; x < 53; x++) setC(x, H - 5, 0); checkSupport(51, H - 5, 4)');
  assert.ok(E.run('chunks.length') >= 1, 'a chunk broke off');
  E.run('for (let i = 0; i < 1200 && chunks.length; i++) { frameNo++; stepChunks(DT); stepParticles(DT); }');
  assert.equal(E.run('chunks.length'), 0, 'it came to rest');
  assert.ok(Math.abs(count(E, 3) - (m0 - 3)) <= 3, `mass kept: ${count(E, 3)} of ${m0 - 3}`);
  // a slab of 60 x 50 = 3000 cells (more than 2600) hanging 12 rows over the floor
  const E2 = loadEngine(); E2.run('setResVars(1)'); world(E2, 120, 120, 4);
  E2.run(`for (let y = H - 4 - 12 - 50; y < H - 4 - 12; y++) for (let x = 30; x < 90; x++) setC(x, y, 3);`);
  const n0 = count(E2, 3);
  E2.run('checkSupport(60, H - 40, 20)');
  assert.equal(E2.run('slabs.length'), 1, 'it started to sink');
  E2.run('for (let i = 0; i < 40 && slabs.length; i++) stepChunks(DT)');
  assert.equal(E2.run('slabs.length'), 0, 'it landed');
  assert.equal(count(E2, 3), n0, 'no cell lost');
  assert.equal(E2.run('getC(60, H - 5)'), 3, 'it rests on the floor');
});

test('forced freeze lifts a chunk out of the ground and keeps the cells that do not fit as grains', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E, 80, 60, 4);
  E.run(`for (let y = 10; y < 14; y++) for (let x = 30; x < 36; x++) setC(x, y, 3);`);
  E.run('checkSupport(33, 12, 4)');
  assert.ok(E.run('chunks.length') >= 1);
  E.run('chunks[0].body.y = H - 4 - 1; freezeChunk(chunks[0], true)');   // pushed into the floor
  assert.equal(count(E, 3) + E.run('P.n') >= 24 - 0, true, 'every cell is either in the grid or flying as a grain');
  assert.equal(E.run('getC(32, H - 4)'), 1, 'the floor was not overwritten');
});

test('pause is a flag any state can use, and the built-in key toggles it', () => {
  const E = loadEngine();
  E.run("state = 'build'; Pixelite.pause(true)");
  assert.equal(E.run('Pixelite.paused'), true); assert.equal(E.run('state'), 'build', 'the game keeps its own state name');
  E.run('Pixelite.pause(false)'); assert.equal(E.run('Pixelite.paused'), false);
  E.run("state = 'play'; Pixelite.pause(true)"); assert.equal(E.run('state'), 'paused', 'old games keep their paused state');
  E.run('Pixelite.pause(false)'); assert.equal(E.run('state'), 'play');
});
