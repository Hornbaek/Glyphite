// The look packages of the engine plan (E1, E3 to E8), with no game and no browser (tests/node/engine-harness.mjs); the pictures, both renderers,
// are tests/engine_look.py. Each package keeps its own tests below, under its own heading.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

// ---------- E1: the sun from either side ----------
// A world W cells wide whose window is the whole of it (so mirroring the world mirrors the window too), with a pillar, a ramp, a ledge and a floating slab
const sunWorld = (E, mirror, plain = false) => {
  E.run(`setResVars(2); defineMaterial('rock', { tough: 5, anchor: true }); worldMaterials({ edge: 1, rubble: 1 }); worldInit(120, 70);
    const put = (x, y) => { cells[y * W + (${mirror ? 'W - 1 - x' : 'x'})] = 1; };
    for (let y = H - 12; y < H; y++) for (let x = 0; x < W; x++) put(x, y);
    for (let y = H - 40; y < H - 12; y++) for (let x = 52; x < 60; x++) put(x, y);                                  // a pillar
    if (!${plain}) {
      for (let x = 10; x < 34; x++) put(x, H - 13 - ((x - 10) >> 1));                                                // a ramp
      for (let x = 80; x < 104; x++) for (let y = H - 30; y < H - 27; y++) put(x, y);                                 // a floating slab
      for (let y = H - 22; y < H - 12; y++) for (let x = 100; x < 112; x++) put(x, y);                                // a ledge
    }
    lightAlloc(120, 70); updateSkyline(); CACHE.still = false;`);
};
const lit = E => JSON.parse(E.run('JSON.stringify([Array.from(LSUN), Array.from(LR), Array.from(LG), Array.from(LB)])'));

test('E1 setSun: 1..89 is the left of the sky, 91..179 the right, and the height is the same either side', () => {
  const E = loadEngine();
  E.run('setSun(40)'); assert.ok(E.run('SUN_L[0]') > 0 && E.run('SUN_L[1]') > 0, 'light travels right and down');
  E.run('setSun(140)'); assert.ok(E.run('SUN_L[0]') < 0 && E.run('SUN_L[1]') > 0, 'light travels left and down');
  assert.ok(Math.abs(E.run('SUN_L[0]') + Math.cos(40 * Math.PI / 180)) < 1e-12 && Math.abs(E.run('SUN_L[1]') - Math.sin(40 * Math.PI / 180)) < 1e-12, '140 is the mirror of 40');
  assert.equal(E.run('SUN_EL'), 140, 'the angle given is kept (a game can read it back and setSun(it))');
  for (const [given, kept] of [[0, 1], [90, 89], [89.5, 89], [90.5, 91], [180, 179], [1000, 179], [-5, 1]]) { E.run(`setSun(${given})`); assert.equal(E.run('SUN_EL'), kept, `setSun(${given})`); }
  E.run('setAtmosphere(1); setSun(12, { kelvin: 5772 })'); const a = E.run('[...SUN_C]');
  E.run('setSun(168)'); assert.deepEqual([...E.run('[...SUN_C]')], [...a], 'a low sun in the right half of the sky is as red as one in the left');
});

test('E1 the sweep: the world mirrored and the sun mirrored give the mirrored light, bit for bit, at every angle', () => {
  for (const el of [12, 30, 52, 77, 85]) {
    const A = loadEngine(), B = loadEngine(); sunWorld(A, false); sunWorld(B, true);
    A.run(`setSun(${el}); computeLighting(0, 0, [], 1e9)`); B.run(`setSun(${180 - el}); computeLighting(0, 0, [], 1e9)`);
    const [sa, ra, ga, ba] = lit(A), [sb, rb, gb, bb] = lit(B), RW = 120, RH = 70;
    let bad = 0, lights = 0;
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
      const k = j * RW + i, m = j * RW + (RW - 1 - i);
      if (sa[k] !== sb[m] || ra[k] !== rb[m] || ga[k] !== gb[m] || ba[k] !== bb[m]) bad++;
      lights += sa[k];
    }
    assert.equal(bad, 0, `at ${el} degrees ${bad} cells differ from the mirror`);
    assert.ok(lights > 800 && lights < RW * RH - 800, `some of the world is lit and some is shadow at ${el} (${lights} lit)`);
  }
});

test('E1 the sweep: shadows fall the other way', () => {
  const E = loadEngine(); sunWorld(E, false, true);
  const at = (x, y) => E.run(`LSUN[${y} * 120 + ${x}]`), ground = 70 - 12;
  E.run('setSun(35); computeLighting(0, 0, [], 1e9)');
  assert.equal(at(70, ground - 1), 0, 'sun on the left: the pillar (x 52..59) shades the ground to its right');
  assert.equal(at(44, ground - 1), 1, 'and not the ground to its left');
  E.run('setSun(145); computeLighting(0, 0, [], 1e9)');
  assert.equal(at(44, ground - 1), 0, 'sun on the right: the shadow is on the left');
  assert.equal(at(70, ground - 1), 1, 'and the ground on the right is lit');
  // the sun on the right still lights a column beside the world's right edge: rays that start beyond it are clear
  assert.equal(at(119, 0), 1);
});

test('E1 sunAt follows the sweep from either side (the gameplay query and the picture agree where the sun is not grazing an edge)', () => {
  for (const el of [30, 150]) {
    const E = loadEngine(); sunWorld(E, false);
    E.run(`setSun(${el}); computeLighting(0, 0, [], 1e9)`);
    const sweep = JSON.parse(E.run('JSON.stringify(Array.from(LSUN))')), occ = JSON.parse(E.run('JSON.stringify(Array.from(LOCC))')), LOW = E.run('LOW'), LMX = E.run('LMX'), LMY = E.run('LMY');
    let agree = 0, n = 0;
    for (let y = 2; y < 70; y += 2) for (let x = 2; x < 120; x += 3) {
      if (occ[(y + LMY) * LOW + x + LMX]) continue;
      n++; if ((E.run(`sunAt(${x} + .5, ${y} + .5)`) ? 1 : 0) === sweep[y * 120 + x]) agree++;
    }
    assert.ok(n > 500 && agree / n > .96, `sunAt agrees with the sweep at ${el} degrees on ${agree} of ${n} sampled cells`);
    // beyond the world on the sun's side, and straight above, nothing is in the way
    assert.equal(E.run('sunAt(' + (el < 90 ? 1 : 118) + ', 3)'), true);
  }
  const E = loadEngine(); sunWorld(E, false, true);
  E.run('setSun(145)');
  assert.equal(E.run('sunAt(44, (70 - 12) - 1)'), false, 'in the pillar\'s shadow on its left, with the sun on the right');
  assert.equal(E.run('sunAt(70, (70 - 12) - 1)'), true);
  E.run('setSun(null)'); assert.equal(E.run('sunAt(70, 5)'), false);
});

test('E1 the still-frame base follows a sun that crosses to the other side, and equals doing the work from scratch', () => {
  const run = still => {
    const E = loadEngine(); sunWorld(E, false); const out = [], base = [];
    E.run(`CACHE.still = ${still}; globalThis.go = n => { for (let i = 0; i < n; i++) { computeLighting(0, 0, [], 1e9); globalThis.out.push(JSON.stringify(Array.from(LSUN)) + LR[3000]); } }; globalThis.out = [];`);
    for (const s of [30, 30, 30, 150, 150, 150, 60, 60, 120, 120]) { E.run(`setSun(${s}); go(1)`); base.push(E.run('CACHE.baseHit')); }
    return { out: [...E.run('out')], base };
  };
  const on = run(true), off = run(false);
  assert.deepEqual(on.out, off.out, 'every frame equal');
  assert.ok(on.base.filter(Boolean).length >= 2, `the base was reused (${on.base})`);
});

// ---------- E5: layers in front and far behind ----------
test('E5 a tile map legend entry with front: true puts its prop on the front pass; entities have front too', () => {
  const E = loadEngine();
  E.run(`setResVars(2); defineMaterial('rock', {}); const spr = defineSprite({ w: 2, h: 2, pal: [[255, 0, 0, 1]], rows: ['00', '00'] }, { k: .5 });
    loadTileMap(['.g.t', '####'], { '#': 1, g: { prop: spr, front: true }, t: { prop: spr } }, { tile: 4 });`);
  assert.deepEqual([...E.run('PROPS.map(p => p.front)')], [true, false], 'g is a front prop, t an ordinary one');
  E.run("defineEntity('fg', { front: true }); defineEntity('bg', {})");
  assert.equal(E.run('ENTITY_TYPES.fg.front'), true);
  assert.equal(E.run('ENTITY_TYPES.bg.front'), undefined, 'an entity without it is as before');
});

test('E5 backdrops: at most three, worldInit clears them, the detail rescale keeps them, and the cave layer paints below the skyline', () => {
  const E = loadEngine();
  E.run(`setResVars(2); defineMaterial('rock', {}); worldInit(60, 40); for (let y = 25; y < 40; y++) for (let x = 0; x < 60; x++) cells[y * W + x] = 1; updateSkyline();
    globalThis.a = addBackdrop({ parallax: .2 }); globalThis.b = addBackdrop({ parallax: [.4, .1] }); addBackdrop({ underground: [.1, .1, .2] });`);
  assert.equal(E.run('BACKDROPS.length'), 3);
  assert.throws(() => E.run('addBackdrop({})'), /at most 3/);
  assert.deepEqual([...E.run('[a.px, a.py, b.px, b.py]')], [.2, .2, .4, .1], 'a number is both axes, a pair is x and y');
  E.run('removeBackdrop(a)'); assert.equal(E.run('BACKDROPS.length'), 2);
  E.run('worldInitKeep(60, 40)'); assert.equal(E.run('BACKDROPS.length'), 2, 'the rescale keeps them');
  const paint = (x, y) => [...E.run(`(() => { const o = [0, 0, 0]; const g = BACKDROPS[1].paint(${x}, ${y}, o); return [g, o[0]]; })()`)];
  assert.equal(E.run('BACKDROPS[1].px'), 1, 'the cave layer moves with the world');
  assert.equal(paint(10, 10)[0], 0, 'above the ground: nothing, the sky shows');
  assert.equal(paint(10, 30)[0], 127, 'below the skyline: a solid dark wall');
  assert.equal(paint(-3, 30)[0], 0, 'beside the world: nothing');
  E.run('worldInit(60, 40)'); assert.equal(E.run('BACKDROPS.length'), 0, 'a new world clears them');
});
