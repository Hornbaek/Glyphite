// The speed work must not change a single number: the world's revision counter, the skyline kept up to date from it, the occupancy fill,
// pooled lights, and the lamp cache and the still-frame base (04_light.js), each compared with doing the work from scratch. The engine
// with no game and no browser (tests/node/engine-harness.mjs); the whole frame, both renderers, is tests/engine_cache.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

const world = (E, w = 200, h = 120) => {
  E.run(`setResVars(2); defineMaterial('rock', { tough: 5, anchor: true }); defineMaterial('sand', { granular: true });
    worldMaterials({ edge: 1, rubble: 1 }); worldInit(${w}, ${h});
    for (let y = H - 20; y < H; y++) for (let x = 0; x < W; x++) cells[y * W + x] = 1;
    for (let y = H - 45; y < H - 20; y++) for (let x = 100; x < 112; x++) cells[y * W + x] = 1;           // a pillar
    for (let x = 20; x < 50; x++) cells[(H - 20 - ((x - 20) >> 1)) * W + x] = 1;                          // a ramp
    lightAlloc(120, 70); updateSkyline();`);
};
// a checksum of the light buffers, bit for bit
const lightHash = `(() => { let h = 2166136261 | 0; for (const a of [LR, LG, LB, LDX, LDY]) { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); } return h >>> 0; })()`;
const LAMPS = `[
  { x: 60, y: H - 40, r: 44, c: [1, .9, .8], I: 1.4, shadow: true },
  { x: 130, y: H - 50, r: 50, c: [.6, .8, 1], I: 1.1, shadow: true, dx: -1, dy: .2, cos: Math.cos(.6), skip: 3 },
  { x: 90, y: H - 30, r: 24, c: [1, .5, .3], I: 0.9, shadow: false },
  { x: 150, y: H - 60, r: 30, c: [1, 1, 1], I: 1, shadow: true }]`;

test('the revision counter: setC, the engine writes and worldChanged stamp their chunks; a new world stamps them all', () => {
  const E = loadEngine(); world(E);
  const rev = (x, y) => E.run(`CREV[${y >> 4} * CWn + ${x >> 4}]`);
  const w0 = E.run('WREV'), a = rev(10, 10), b = rev(100, 50);
  E.run('setC(10, 10, 1)');
  assert.ok(rev(10, 10) > w0 && rev(100, 50) === b, 'setC stamps its own chunk and no other');
  const w1 = E.run('WREV'); E.run('setC(10, 10, 1)');
  assert.equal(E.run('WREV'), w1, 'writing the same material changes nothing');
  E.run('cells[50 * W + 100] = 1; worldChanged(100, 50, 100, 50)');
  assert.ok(rev(100, 50) > b, 'worldChanged stamps what code wrote by hand');
  E.run('worldChanged()'); assert.ok(rev(190, 110) > a, 'with no arguments, everything');
  // sand falling stamps the chunks it moves through
  E.run('for (let y = 10; y < 14; y++) setC(150, y, 2); awake.fill(1)'); const r0 = rev(150, 10), r1 = rev(150, 100);
  assert.ok(r0 > 0 && rev(150, 10) === r0);
  E.run('for (let i = 0; i < 400; i++) { frameNo++; simGranular(); stepParticles(DT); }');
  assert.ok(rev(150, 10) > r0, 'the chunk the sand left has a newer number');
  assert.ok(rev(150, 100) > r1, 'and so has the one it landed in');
  const wA = E.run('WREV'); E.run('worldInit(64, 64)');
  assert.ok(E.run('CREV.every(v => v > ' + wA + ')'), 'a new world is newer than anything before');
});

test('the skyline kept from the revision counter equals a full rescan, after setC, sand and worldChanged', () => {
  const E = loadEngine(); world(E);
  const full = () => E.run('(() => { const t = []; for (let x = 0; x < W; x++) { let y = 0; while (y < H && cells[y * W + x] === EMPTY) y++; t.push(y); } return JSON.stringify(t); })()');
  const kept = () => E.run('JSON.stringify(Array.from(colTop))');
  E.run('syncSkyline()'); assert.equal(kept(), full(), 'at the start');
  E.run('for (let i = 0; i < 400; i++) { const x = (rnd() * W) | 0, y = (rnd() * H) | 0; setC(x, y, rnd() < .5 ? 0 : 1); }');
  E.run('syncSkyline()'); assert.equal(kept(), full(), 'after random setC');
  E.run('for (let y = 0; y < 30; y++) setC(33, y, 2); awake.fill(1); for (let i = 0; i < 200; i++) { frameNo++; simGranular(); } syncSkyline()');
  assert.equal(kept(), full(), 'after sand fell');
  E.run('for (let x = 70; x < 90; x++) cells[5 * W + x] = 1; worldChanged(70, 5, 89, 5); syncSkyline()');
  assert.equal(kept(), full(), 'after cells written by hand and announced');
  E.run('for (let x = 70; x < 90; x++) cells[4 * W + x] = 1; syncSkyline()');
  assert.notEqual(kept(), full(), 'written by hand and NOT announced, the kept skyline is stale: that is why worldChanged exists');
  E.run('updateSkyline()'); assert.equal(kept(), full(), 'updateSkyline is the full rescan');
});

test('the occupancy fill equals getC !== EMPTY, inside the world and beyond its sides, top and bottom', () => {
  const E = loadEngine(); world(E);
  for (const [ox, oy] of [[10, 10], [-40, -30], [100, 70], [150, 90], [-5, 60], [60, -50]]) {
    const bad = E.run(`(() => { fillOcc(${ox}, ${oy}); let bad = 0; for (let j = 0; j < LOH; j++) for (let i = 0; i < LOW; i++) if (LOCC[j * LOW + i] !== (getC(${ox} - LMX + i, ${oy} - LMY + j) !== EMPTY ? 1 : 0)) bad++; return bad; })()`);
    assert.equal(bad, 0, `window at ${ox},${oy}`);
  }
});

test('pooled lights carry no cone, skip or flicker left over from an earlier use', () => {
  const E = loadEngine(); world(E);
  E.run(`GAME = { lights(t, out) { out.push(globalThis.mode ? { x: 50, y: 50, r: 30, c: [1, 1, 1], I: 1, shadow: true, flicker: 'candle', seed: 2 } : { x: 60, y: 60, r: 30, c: [1, 1, 1], I: 1, shadow: true, flicker: 'pulse', dx: 1, dy: 0, cos: .8, skip: 3 }); } }; globalThis.mode = 0;`);
  const cone = E.run('(() => { const l = gatherLights(1.5)[0]; return [l.cos, l.skip, l.flicker]; })()');
  assert.deepEqual([...cone], [.8, 3, null], 'a flickering cone keeps its cone, and its copy is no longer flickering');
  E.run('mode = 1');
  const plain = E.run('(() => { const l = gatherLights(1.5)[0]; return [l.cos === undefined, l.skip === undefined, l.dx === undefined, l.flicker]; })()');
  assert.deepEqual([...plain], [true, true, true, null], 'the pooled object was cleaned before it was reused');
  E.run('addLight(40, 40, 20, [1, 0, 0], 1, 2); globalThis.fx = gatherLights(1)'); assert.equal(E.run('fx.length'), 2, 'a game light and an effect light');
  assert.equal(E.run('fx[1].cos'), undefined); assert.equal(E.run('fx[1].c[0]'), 1);
});

test('lamp cache: frames come out bit for bit as without it, through a still scene, a flicker, a wall built in the lamp, a moved camera and a moved lamp', () => {
  const run = (cache, lampsOff = false) => {
    const E = loadEngine(); world(E); E.run(`globalThis.LS = ${LAMPS}; CACHE.lamps = ${cache}; CACHE.still = false; globalThis.out = [];
      globalThis.frame = (ox, oy, k) => { for (const l of LS) l.I0 = l.I0 || l.I; LS[0].I = LS[0].I0 * (1 + .15 * Math.sin(k)); computeLighting(ox, oy, LS, 1e9); out.push(${lightHash}); };`);
    const hits = [];
    const f = (ox, oy, n, k0 = 0) => { for (let k = 0; k < n; k++) { E.run(`frame(${ox}, ${oy}, ${k0 + k})`); hits.push(E.run('CACHE.hit')); } };
    f(10, 10, 5);                                                                    // still: recorded, then used; one lamp flickers
    E.run('setC(75, H - 30, 1); setC(75, H - 31, 1); setC(76, H - 30, 1)');           // a wall grows in the first lamp's reach
    f(10, 10, 4, 5);
    f(11, 10, 3, 9); f(11, 10, 3, 12);                                               // the camera moves one cell, then stays
    E.run('LS[3].x += 7');                                                            // a lamp moves
    f(11, 10, 4, 15);
    E.run('for (let y = H - 60; y < H - 20; y++) cells[y * W + 140] = 1; worldChanged(140, H - 60, 140, H - 21)');   // a wall written by hand, announced
    f(11, 10, 4, 19);
    return { out: E.run('out'), hits };
  };
  const on = run(true), off = run(false);
  assert.deepEqual([...on.out], [...off.out], 'every frame equal');
  assert.ok(Math.max(...on.hits) >= 3, `the cache was used (hits per frame: ${on.hits})`);
  assert.equal(Math.max(...off.hits), 0);
});

test('lamp cache: the audit finds a cast made stale by cells written without telling the engine', () => {
  const E = loadEngine(); world(E);
  E.run(`globalThis.LS = ${LAMPS}; CACHE.still = false; globalThis.go = n => { for (let i = 0; i < n; i++) computeLighting(10, 10, LS, 1e9); };`);
  E.run('go(4); CACHE.audit = true; go(2)'); assert.equal(E.run('CACHE.bad'), 0, 'an honest cache audits clean');
  E.run('for (let y = H - 60; y < H - 20; y++) cells[y * W + 70] = 1');             // written by hand, NOT announced
  E.run('go(1)'); assert.ok(E.run('CACHE.bad') > 0, 'the audit saw the stale cast');
  E.run('CACHE.bad = 0; go(6)'); assert.equal(E.run('CACHE.bad'), 0, 'and the cast was dropped and made again, so it is clean now');
});

test('still-frame base: the sun, ambient and occlusion come back unchanged while nothing moves, and are redone when the camera, the sun, a body or the world changes', () => {
  const run = still => {
    const E = loadEngine(); world(E); E.run(`globalThis.LS = ${LAMPS}; CACHE.lamps = true; CACHE.still = ${still}; globalThis.out = [];
      globalThis.go = (ox, dynTop = 1e9) => { computeLighting(ox, 10, LS, dynTop); out.push(${lightHash}); };`);
    const base = [];
    const g = (ox, n, dynTop) => { for (let i = 0; i < n; i++) { E.run(`go(${ox}, ${dynTop ?? 1e9})`); base.push(E.run('CACHE.baseHit')); } };
    g(10, 5);
    E.run('setSun(35)'); g(10, 4);                                                   // the sun moved
    E.run('setC(50, 20, 1); setC(51, 20, 1)'); g(10, 3);                              // a block of world, far above the ground, under the sun's sweep
    E.run('for (let y = 60; y < 70; y++) { markDynCell(y * W + 55); }'); g(10, 3, 60);   // a moving body (marked this frame only: clearDyn in between)
    E.run('clearDyn()'); g(10, 3);
    g(12, 3);                                                                         // the camera moved
    E.run('setSun(null)'); g(12, 4);                                                  // no sun
    E.run('setSun(35); setAmbient([.2, .2, .3])'); g(12, 3);
    return { out: E.run('out'), base };
  };
  const on = run(true), off = run(false);
  assert.deepEqual([...on.out], [...off.out], 'every frame equal');
  assert.ok(on.base.filter(Boolean).length >= 8, `the base was reused (${on.base})`);
  assert.equal(off.base.filter(Boolean).length, 0);
});
