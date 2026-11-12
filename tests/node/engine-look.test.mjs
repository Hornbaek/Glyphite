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

// ---------- a frame with no browser: the engine's own buffers (what the renderers are handed) ----------
// A 100 x 60 window on a 160 x 90 world with a rock floor (its top row is 76), no sun and no ambient light, so only what a test adds is lit.
const frameEnv = (E, extra = '') => {
  E.run(`seedRandom(7); setResVars(2); defineMaterial('rock', { tough: 5, anchor: true, albedo: [.5, .5, .5] }); worldMaterials({ edge: 1, rubble: 1 }); worldInit(160, 90);
    R.RW = 100; R.RH = 60; R.cols = 98; R.rows = 58; R.cw = 4; R.chh = 4;
    { const n = 6000; R.wG = new Uint8Array(n); R.wZ = new Float32Array(n); R.wShim = new Float32Array(n); R.wPix = new Uint8ClampedArray(n * 4); R.bloomPix = new Uint8ClampedArray(n * 4); R.sG = new Uint8Array(n); R.sPix = new Uint8ClampedArray(n * 4); }
    lightAlloc(100, 60); for (let y = H - 14; y < H; y++) for (let x = 0; x < W; x++) cells[y * W + x] = 1; updateSkyline();
    setSun(null); setAmbient([0, 0, 0]); setEyeAdaptation(0); cam.x = 20; cam.y = 20; CACHE.still = true; CACHE.lamps = true;
    globalThis.frame = (draw, mark, lights = []) => { syncSkyline(); clearDyn(); if (mark) mark(); const ox = Math.floor(cam.x) - 1, oy = Math.floor(cam.y) - 1; computeLighting(ox, oy, lights, 1e9); renderScene(ox, oy, 0, draw); };
    globalThis.pixel = (cx, cy) => { const k = ((cy - L_OY) * R.RW + (cx - L_OX)) * 4; return [R.wPix[k], R.wPix[k + 1], R.wPix[k + 2], R.wPix[k + 3]]; };
    globalThis.lightAt = (cx, cy) => { const k = (cy - L_OY) * R.RW + (cx - L_OX); return [LR[k], LG[k], LB[k]]; };
    ${extra}`);
};
const frameHash = `(() => { let h = 2166136261 | 0; for (const a of [R.wPix, LR, LG, LB]) { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); } return h >>> 0; })()`;
const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];

// ---------- E3: sprites that glow and cast light ----------
const GLOW = `globalThis.spr = defineSprite({ w: 6, h: 4, pal: [[200, 60, 40, 1], [60, 90, 200, 1]], rows: ['000000', '001100', '001100', '000000'], emit: ['......', '..99..', '......', '......'] }, { k: 1 / RES, glow: 4, glowGain: .2 });
  globalThis.plain = defineSprite({ w: 6, h: 4, pal: [[200, 60, 40, 1], [60, 90, 200, 1]], rows: ['000000', '001100', '001100', '000000'] }, { k: 1 / RES });`;

test('E3 the emit layer: a glowing pixel is its own colour, brighter than the same colour lit, and a sprite without one is as it was', () => {
  const E = loadEngine(); frameEnv(E, GLOW);
  E.run('globalThis.at = [60, 50]; globalThis.d = (o = {}) => () => drawSprite(spr, at[0], at[1], 0, o)');
  assert.ok(E.run('spr.emit'), 'defineSprite read the layer'); assert.equal(E.run('plain.emit'), null, 'a sprite without one has none');
  // cells: x 57..62, rows 48..51; the glowing pixels are the two at (59, 49) and (60, 49). (An empty frame or two between draws lets last frame's glow light go.)
  const clear = () => E.run('frame(() => {}); frame(() => {})');
  E.run('frame(() => drawSprite(plain, at[0], at[1], 0))'); const flat = E.run('pixel(59, 49)'), flatEdge = E.run('pixel(57, 48)');
  clear(); E.run('frame(d())'); const glow = E.run('pixel(59, 49)'), edge = E.run('pixel(57, 48)');
  assert.ok(lum(glow) > lum(flat) * 1.08, `the glowing pixel is brighter than the same pixel lit (${glow} against ${flat})`);
  assert.deepEqual([...edge], [...flatEdge], 'a pixel with no emission in the same sprite is as the plain sprite draws it');
  clear(); E.run('frame(d({ emit: 0 }))'); assert.deepEqual([...E.run('pixel(59, 49)')], [...flat], 'emit: 0 is the lamp switched off: an ordinary lit pixel');
  clear(); const hot = (E.run('frame(d({ emit: 3 }))'), E.run('pixel(59, 49)'));
  assert.ok(lum(hot) > lum(glow), 'emit: 3 glows brighter than the art');
  // a sprite whose emit layer is empty is a plain sprite
  assert.equal(E.run("defineSprite({ w: 2, h: 1, pal: [[9, 9, 9, 1]], rows: ['00'], emit: ['..'] }, {}).emit"), null);
});

test('E3 a glowing sprite lights its surroundings from the next frame on, in its own colour, and stops when it stops', () => {
  const E = loadEngine(); frameEnv(E, GLOW);
  E.run('globalThis.at = [60, 50]; globalThis.d = () => drawSprite(spr, at[0], at[1], 0)');
  E.run('frame(d)'); const first = E.run('lightAt(60, 43)');
  E.run('frame(d)'); const second = E.run('lightAt(60, 43)'), far = E.run('lightAt(100, 43)');
  assert.deepEqual([...first], [0, 0, 0], 'the first frame has no light yet: it is poured in one frame behind');
  assert.ok(second[2] > .004 && second[2] > second[0] * 2, `the second frame is lit, in the colour of the glowing pixels (blue: ${second})`);
  assert.deepEqual([...far], [0, 0, 0], 'beyond the radius it is dark');
  E.run('frame(() => {})'); E.run('frame(() => {})');
  assert.deepEqual([...E.run('lightAt(60, 43)')], [0, 0, 0], 'a frame without the sprite, and its light is gone one frame later');
  // the same physical sprite (k: .5 units a pixel) gives the same light at RES 1 and 3: it is per base cell of glow, not per cell
  const a = loadEngine(), b = loadEngine();
  for (const [E2, res] of [[a, 1], [b, 3]]) { frameEnv(E2, GLOW); E2.run(`setResVars(${res}); lightAlloc(100, 60); globalThis.spr = defineSprite({ w: 6, h: 4, pal: [[200, 60, 40, 1]], rows: ['000000', '000000', '000000', '000000'], emit: ['999999', '999999', '999999', '999999'] }, { k: .5, glow: 4, glowGain: .2 }); globalThis.at = [60, 50]; frame(() => drawSprite(spr, at[0], at[1], 0)); frame(() => drawSprite(spr, at[0], at[1], 0))`); }
  const la = a.run('lightAt(60, 50 - 3 * RES)')[0], lb = b.run('lightAt(60, 50 - 3 * RES)')[0];
  assert.ok(la > .05 && Math.abs(la - lb) / la < .35, `a glow is about as strong at RES 1 and 3 (${la.toFixed(3)} and ${lb.toFixed(3)})`);
});

test('E3 the still-frame terrain cache follows a glowing sprite: frames equal with the caches on and off, and a still sprite lets the cache work', () => {
  const run = on => {
    const E = loadEngine(); frameEnv(E, GLOW); E.run(`CACHE.still = ${on}; CACHE.lamps = ${on}; globalThis.at = [60, 50]; globalThis.d = () => drawSprite(spr, at[0], at[1], 0); globalThis.out = [];`);
    const hits = [];
    const go = (n, draw = 'd') => { for (let i = 0; i < n; i++) { E.run(`frame(${draw}); out.push(${frameHash})`); hits.push(E.run('CACHE.terrainHit')); } };
    go(3, '() => {}');                      // nothing: the cache settles
    go(6);                                   // the sprite stands still: its light comes in, then stays
    E.run('at = [64, 50]'); go(3);           // it moves
    E.run('at = [64, 50]'); go(4);           // and stands again
    go(4, '() => {}');                      // and goes away
    return { out: [...E.run('out')], hits };
  };
  const on = run(true), off = run(false);
  assert.deepEqual(on.out, off.out, 'every frame equal');
  assert.ok(on.hits.filter(Boolean).length >= 3, `the terrain was reused (${on.hits})`);
});

test('E3 a sprite that blocks lamp light casts a shadow from a lamp, and the lamp cache steps around it, bit for bit', () => {
  const lamp = '[{ x: 50, y: 60, r: 40, c: [1, 1, 1], I: 1.5, shadow: true }]';
  const setup = `${GLOW} globalThis.blocker = defineSprite({ w: 4, h: 8, pal: [[90, 90, 90, 1]], rows: ['0000', '0000', '0000', '0000', '0000', '0000', '0000', '0000'] }, { k: 1 / RES });
    for (let y = 40; y < H - 14; y++) for (let x = 80; x < 85; x++) cells[y * W + x] = 1; updateSkyline(); globalThis.bx = 65; globalThis.blocks = true; globalThis.here = false;
    globalThis.mark = () => { if (here) markSpriteDyn(blocker, bx, 60, 0, blocks ? { blocksLamps: true } : {}); };`;
  const run = on => {
    const E = loadEngine(); frameEnv(E, setup); E.run(`CACHE.still = ${on}; CACHE.lamps = ${on}; globalThis.out = [];`);
    const seen = [];
    const go = (n, here = false) => { for (let i = 0; i < n; i++) { E.run(`here = ${here}; frame(() => {}, mark, ${lamp}); out.push(${frameHash})`); seen.push([E.run('lightAt(80, 60)')[0], E.run('CACHE.hit')]); } };
    go(5);                         // the lamp stands still and is cached
    go(3, true);                   // a blocker stands between the lamp and the wall
    E.run('bx = 70'); go(3, true); // it moves
    E.run('blocks = false'); go(2, true);   // it is the sort that does not block lamps
    go(3);                         // and goes
    return { out: [...E.run('out')], seen };
  };
  const on = run(true), off = run(false), s = on.seen;
  assert.deepEqual(on.out, off.out, 'every frame equal with the cache on and off');
  assert.ok(s[0][0] > .05, `the wall is lit without it (${s[0][0]})`);
  assert.ok(Math.max(...s.slice(0, 5).map(x => x[1])) >= 1, 'the lamp was cached before the blocker came');
  assert.ok(s[5][0] < s[0][0] * .2 && s[8][0] < s[0][0] * .2, `behind the blocker the wall is in shadow (${s[5][0]}, ${s[8][0]})`);
  assert.equal(Math.max(...s.slice(5, 11).map(x => x[1])), 0, 'a lamp the blocker stands in is cast again, not served from the cache');
  assert.ok(Math.abs(s[11][0] - s[0][0]) < 1e-6 && Math.abs(s[12][0] - s[0][0]) < 1e-6, 'a sprite that does not block lamps leaves the light as it was');
  assert.ok(Math.abs(s[13][0] - s[0][0]) < 1e-6, 'and when it is gone the wall is lit again, the same');
});

// ---------- E6: a screen palette and post effects the game controls ----------
const PAL = "['#101820', '#346856', '#88c070', '#e0f8d0']";
const floorRow = 77;   // the rock floor's top row is 76: this row is floor all the way across the window (cells 20..119)
const row = (E, x0, x1) => { const out = []; for (let x = x0; x < x1; x++) out.push(E.run(`pixel(${x}, ${floorRow})`)); return out; };
const avgLum = px => px.reduce((s, c) => s + lum(c), 0) / px.length;
const lit6 = E => { frameEnv(E); E.run('setAmbient([.7, .7, .75]); GAME.stars = 40;'); return E; };

test('E6 setPost: reads colours as #rgb, #rrggbb and [r, g, b], refuses what is not a palette, and getPost says what is set', () => {
  const E = loadEngine();
  assert.deepEqual(JSON.parse(JSON.stringify(E.run('getPost()'))), { vignette: .42, bloom: true, palette: null, dither: 0, scanlines: 0 }, 'the defaults are the look every game had');
  E.run("setPost({ palette: ['#000', '#ff8000', [10, 20, 300]], dither: 2, vignette: -1, scanlines: .5 })");
  const p = JSON.parse(JSON.stringify(E.run('getPost()')));
  assert.deepEqual(p.palette, [[0, 0, 0], [255, 128, 0], [10, 20, 255]]); assert.equal(p.dither, 1, 'clamped to 0..1'); assert.equal(p.vignette, 0); assert.equal(p.scanlines, .5);
  assert.throws(() => E.run("setPost({ palette: ['#000'] })"), /2 to 255/);
  assert.throws(() => E.run("setPost({ palette: ['#000', 'red'] })"), /not '#rrggbb'/);
  assert.throws(() => E.run("setPost({ palette: ['#000', [1, 2]] })"), /#rrggbb/);
  assert.throws(() => E.run('setPost({ palette: new Array(256).fill("#fff") })'), /2 to 255/);
  E.run('setPost({ palette: null })'); assert.equal(E.run('getPost().palette'), null, 'null takes it off');
  E.run('setPost({ vignette: .2 })'); assert.equal(E.run('getPost().vignette'), .2, 'one option leaves the others as they were');
  assert.equal(E.run('getPost().scanlines'), .5);
});

test('E6 the palette: every pixel the world draws is a palette colour, and taking it off gives the old frame back bit for bit', () => {
  const E = lit6(loadEngine());
  E.run('frame(() => {})'); const before = E.run(frameHash);
  E.run(`setPost({ palette: ${PAL} })`); E.run('frame(() => {})');
  const want = new Set([[0x10, 0x18, 0x20], [0x34, 0x68, 0x56], [0x88, 0xc0, 0x70], [0xe0, 0xf8, 0xd0]].map(c => c.join()));
  const D = E.run('Array.from(R.wPix)'); let drawn = 0; const off = [];
  for (let q = 0; q < D.length; q += 4) if (D[q + 3]) { drawn++; if (!want.has(`${D[q]},${D[q + 1]},${D[q + 2]}`)) off.push(D.slice(q, q + 3).join()); }
  assert.ok(drawn >= 300, `the floor is drawn (${drawn} pixels: three rows of the window)`); assert.deepEqual(off.slice(0, 3), [], 'nothing outside the palette');
  const S = E.run('Array.from(R.sPix)'); let stars = 0;
  for (let q = 0; q < S.length; q += 4) if (S[q + 3]) { stars++; assert.ok(want.has(`${S[q]},${S[q + 1]},${S[q + 2]}`), 'a star is a palette colour too'); }
  assert.ok(stars > 0, `the sky had stars to check (${stars})`);
  E.run('setPost({ palette: null }); frame(() => {})');
  assert.equal(E.run(frameHash), before, 'the same frame as before the palette, bit for bit');
  const S2 = E.run('Array.from(R.sPix)'); let back = 0; for (let q = 0; q < S2.length; q += 4) if (S2[q + 3] && !want.has(`${S2[q]},${S2[q + 1]},${S2[q + 2]}`)) back++;
  assert.ok(back > 0, 'the sky is rebuilt without the palette (it is cached, and the cache heard of the change)');
});

test('E6 nearest colour: a pixel takes the palette colour closest to it, whatever the palette order', () => {
  const E = loadEngine();
  E.run("setPost({ palette: ['#ffffff', '#000000', '#ff0000', '#00ff00'] })");
  const at = (r, g, b) => [...E.run(`(() => { const i = postIndex(${r}, ${g}, ${b}) * 3; return [POST_PAL[i], POST_PAL[i + 1], POST_PAL[i + 2]]; })()`)];
  assert.deepEqual(at(250, 240, 250), [255, 255, 255]); assert.deepEqual(at(10, 12, 8), [0, 0, 0]);
  assert.deepEqual(at(200, 40, 30), [255, 0, 0]); assert.deepEqual(at(40, 190, 60), [0, 255, 0]);
});

test('E6 the dither: a flat grey between two palette colours is the nearer one without it and a pattern of both with it, anchored to world cells', () => {
  const E = loadEngine();
  // a 16 x 16 window of flat grey 100 (alpha 255) that shows world cells from (ox, oy); the palette holds 70 and 118, so 100 is nearer 118
  const go = (d, ox = 0, oy = 0) => [...E.run(`(() => { setPost({ palette: [[70, 70, 70], [118, 118, 118]], dither: ${d} }); const D = new Uint8ClampedArray(16 * 16 * 4);
    for (let q = 0; q < D.length; q += 4) { D[q] = D[q + 1] = D[q + 2] = 100; D[q + 3] = 255; } postLock(D, 16, 256, ${ox}, ${oy});
    const out = []; for (let k = 0; k < 256; k++) out.push(D[k * 4]); return out; })()`)];
  const flat = go(0), mixed = go(1);
  assert.deepEqual([...new Set(flat)], [118], 'no dither: every pixel is the nearer colour');
  assert.deepEqual([...new Set(mixed)].sort((a, b) => a - b), [70, 118], 'full dither: both colours appear');
  const share = mixed.filter(v => v === 70).length / 256;
  assert.ok(share > .25 && share < .5, `about the share the offset allows (${share.toFixed(2)} of the pixels are the darker one)`);
  assert.deepEqual(go(1), mixed, 'the pattern is the same every time: it does not shimmer');
  const sideways = go(1, 1, 0), down = go(1, 0, 1); let bad = 0;
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) { if (sideways[j * 16 + i] !== mixed[j * 16 + i + 1]) bad++; if (down[j * 16 + i] !== mixed[(j + 1) * 16 + i]) bad++; }
  assert.equal(bad, 0, 'a window one world cell to the right shows the pattern one cell to the left: it is fixed to the world, not to the screen');
  const half = go(.5), halfDark = half.filter(v => v === 70).length;
  assert.ok(halfDark > 0 && halfDark < mixed.filter(v => v === 70).length, `half the dither moves fewer pixels to the darker colour (${halfDark} of 256)`);
  const empty = [...E.run(`(() => { const D = new Uint8ClampedArray(16); D[0] = 100; D[1] = 100; D[2] = 100; D[3] = 0; postLock(D, 2, 4, 0, 0); return Array.from(D.slice(0, 4)); })()`)];
  assert.deepEqual(empty, [100, 100, 100, 0], 'a pixel with nothing in it is left as it was');
});

test('E6 vignette: 0 leaves the corners as bright as the middle, the default darkens them, and the old value is bit for bit the old frame', () => {
  const E = lit6(loadEngine());
  E.run('frame(() => {})'); const old = E.run(frameHash), edge = avgLum(row(E, 22, 34)), mid = avgLum(row(E, 64, 76));
  assert.ok(edge < mid * .93, `the default darkens the edge (${edge.toFixed(1)} against ${mid.toFixed(1)})`);
  E.run('setPost({ vignette: 0 }); frame(() => {})');
  const edge0 = avgLum(row(E, 22, 34)), mid0 = avgLum(row(E, 64, 76));
  assert.ok(Math.abs(edge0 - mid0) < mid0 * .03, `none: the same (${edge0.toFixed(1)} and ${mid0.toFixed(1)})`);
  E.run('setPost({ vignette: .42 }); frame(() => {})'); assert.equal(E.run(frameHash), old, 'back to .42 is the frame every game had');
  E.run('setPost({ vignette: 1 }); frame(() => {})'); assert.ok(avgLum(row(E, 22, 34)) < edge, 'a stronger value darkens it more');
});

// ---------- E7: zoom ----------
// no canvas here: resizeNow is a stand-in that makes the numbers a real resize does (a 800 x 480 px screen, cells of R.cw device pixels)
const zoomEnv = (E, game = '') => {
  E.run(`worldInit(400, 240); GAME.zoom = ${game || 'null'}; R.cw1 = 8; R.cw = 8; R.zoom = 1; R.cols = 100; R.rows = 60; cam.x = 50; cam.y = 30;
    resizeNow = () => { R.cw = R.zoom === 1 ? R.cw1 : zoomCw(R.cw1, R.zoom); R.chh = R.cw * ASPECT; R.cols = Math.floor(800 / R.cw); R.rows = Math.floor(480 / R.chh); };`);
};

test('E7 the cell size: whole device pixels, scaled from the size at zoom 1, never below 2, and zoom 1 is exactly what it was', () => {
  const E = loadEngine();
  assert.deepEqual([[8, 1], [8, 2], [8, .5], [5, 1.5], [4, .25], [8, .1], [12, 3]].map(([c, z]) => E.run(`zoomCw(${c}, ${z})`)), [8, 16, 4, 8, 2, 2, 36]);
  assert.equal(E.run('getZoom()'), 1, 'before any picture it is 1');
});

test('E7 setZoom: clamped to the game\'s limits (default .5 to 4), met as closely as whole pixels allow, and getZoom says what it came to', () => {
  const E = loadEngine(); zoomEnv(E);
  assert.equal(E.run('setZoom(2)'), 2); assert.equal(E.run('[R.cw, R.cols, R.rows]').join(), '16,50,30');
  assert.equal(E.run('setZoom(100)'), 4, 'the default top is 4'); assert.equal(E.run('R.zoom'), 4);
  assert.equal(E.run('setZoom(.01)'), .5, 'and the bottom .5'); assert.equal(E.run('R.cw'), 4);
  assert.equal(E.run('setZoom(NaN)'), 1, 'a number that is not one means no zoom'); assert.equal(E.run('R.cw'), 8);
  assert.equal(E.run('setZoom(1.3)'), 10 / 8, 'cell 8 x 1.3 = 10.4: ten pixels, which is a zoom of 1.25'); assert.equal(E.run('R.zoom'), 1.3, 'what was asked is kept for the next resize');
  E.run('GAME.zoom = { min: 1, max: 1.5 }'); assert.equal(E.run('setZoom(3)'), 1.5); assert.equal(E.run('setZoom(.2)'), 1, 'the game\'s limits');
});

test('E7 setZoom keeps the point you name where it was, and a request that changes no pixel remakes nothing', () => {
  const E = loadEngine(); zoomEnv(E);
  // the middle of the screen is world cell 50 + 50 = 100, row (30 + 30 * ASPECT)
  const mid = [E.run('cam.x + R.cols / 2'), E.run('cam.y + R.rows * ASPECT / 2')];
  E.run('setZoom(2)');
  assert.ok(Math.abs(E.run('cam.x + R.cols / 2') - mid[0]) < 1e-9 && Math.abs(E.run('cam.y + R.rows * ASPECT / 2') - mid[1]) < 1e-9, 'the middle stays the middle');
  E.run('setZoom(1)'); assert.deepEqual([E.run('cam.x'), E.run('cam.y')], [50, 30], 'and back out it is where it began');
  E.run('setZoom(2, [0, 0])'); assert.deepEqual([E.run('cam.x'), E.run('cam.y')], [50, 30], 'the top left corner named: it does not move');
  E.run('setZoom(1, [0, 0])'); E.run('setZoom(2, [1, 1])');
  assert.ok(Math.abs(E.run('cam.x + R.cols') - 150) < 1e-9, 'the bottom right corner named: it does not move');
  E.run('setZoom(1, [0, 0])'); E.run('globalThis.n = 0; resizeNow = () => { n++; }'); E.run('setZoom(1.01)');
  assert.equal(E.run('n'), 0, '1.01 of an 8 pixel cell is still 8 pixels: no new buffers'); assert.equal(E.run('R.zoom'), 1.01);
});

test('E7 zoomStep: about 15 percent a step, never less than a device pixel, inside the limits', () => {
  const E = loadEngine(); zoomEnv(E);
  const cw = (d) => (E.run(`zoomStep(${d})`), E.run('R.cw'));
  assert.deepEqual([cw(1), cw(1), cw(1)], [9, 10, 12], 'in: a pixel while 15 percent of the cell rounds to one, then two (15 percent of 10 is 1.5)');
  assert.deepEqual([cw(-1), cw(-1)], [10, 8], 'and out the same way'); E.run('setZoom(1)');
  for (let i = 0; i < 30; i++) E.run('zoomStep(1)'); assert.equal(E.run('R.cw'), 32, 'stops at the top (4 x 8)');
  for (let i = 0; i < 60; i++) E.run('zoomStep(-1)'); assert.equal(E.run('R.cw'), 4, 'and at the bottom (.5 x 8)');
  E.run('R.cw1 = 4; setZoom(1)'); for (let i = 0; i < 20; i++) E.run('zoomStep(-1)'); assert.ok(E.run('R.cw') >= 2, 'never below two device pixels');
});

test('E7 the wheel and the pinch: only for a game with a zoom, in notches of 100, at the pointer', () => {
  const E = loadEngine(); zoomEnv(E);
  E.run('Input.wheel = -250; Input.wheelAt = [.25, .5]; stepZoom()'); assert.equal(E.run('R.cw'), 8, 'a game with no zoom object ignores the wheel');
  zoomEnv(E, '{ default: 1 }');
  E.run('Input.wheel = -250; Input.wheelAt = [.25, .5]; const x0 = cam.x + R.cols * .25; stepZoom(); globalThis.x1 = cam.x + R.cols * .25; globalThis.x0 = x0');
  assert.equal(E.run('R.cw'), 10, 'two notches up: 8 -> 9 -> 10'); assert.equal(E.run('Input.wheel'), -50, 'the rest waits for the next notch');
  assert.ok(Math.abs(E.run('x1 - x0')) < 1e-9, 'and the point under the pointer stayed');
  E.run('Input.wheel = 100; stepZoom()'); assert.equal(E.run('R.cw'), 8, 'a notch the other way zooms out');
  E.run('Input.wheel = 0; setZoom(1); Input.pinch = .1; stepZoom(); Input.pinch = 0'); assert.ok(E.run('R.cw') > 8, 'fingers apart zoom in');
  E.run('setZoom(1); Input.pinch = -.1; stepZoom(); Input.pinch = 0'); assert.ok(E.run('R.cw') < 8, 'and together zoom out');
  E.run('setZoom(1)'); for (let i = 0; i < 4; i++) E.run('Input.pinch = .01; stepZoom()'); assert.ok(E.run('R.zoom') > 1.1, 'tiny pinches add up even before they are a whole pixel');
  zoomEnv(E, '{ wheel: false, pinch: false }'); E.run('Input.wheel = -300; Input.pinch = .3; stepZoom(); Input.pinch = 0; Input.wheel = 0'); assert.equal(E.run('R.cw'), 8, 'wheel: false and pinch: false keep them off');
});

// ---------- E8: weather and time of day ----------
const sun = E => JSON.parse(JSON.stringify(E.run('({ on: SUN_ON, el: SUN_EL, c: [...SUN_C], amb: [...AMB_C] })')));
const skyHash = `(() => { let h = 2166136261 | 0; const u = new Uint8Array(R.sPix.buffer, R.sPix.byteOffset, R.sPix.byteLength); for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; })()`;

test('E8 the time of day: the sun climbs from the left and sets on the right, red at the horizon and white overhead, and is off at night', () => {
  const E = loadEngine();
  const at = h => { E.run(`setTimeOfDay(${h})`); return sun(E); };
  const noon = at(12), dawn = at(6.6), dusk = at(17.4), night = at(0);
  assert.equal(noon.on, true); assert.equal(noon.el, 89, 'noon: straight up, taken as 89');
  assert.ok(noon.c[0] < 1.2 && noon.c[2] > .9 && noon.c[0] > noon.c[2] * .95, `noon is a white sun (${noon.c.map(v => v.toFixed(2))})`);
  assert.ok(dawn.el < 30 && dusk.el > 150, `it rises on the left (${dawn.el.toFixed(0)}) and sets on the right (${dusk.el.toFixed(0)})`);
  assert.ok(dawn.c[0] > dawn.c[2] * 2.5, `low in the sky it is red (${dawn.c.map(v => v.toFixed(2))})`);
  assert.ok(Math.abs(at(9).el + at(15).el - 180) < 1e-9, 'the morning and the afternoon are mirrors');
  assert.ok(lum(at(6.1).c) < lum(noon.c) * .75, 'and weaker, near the horizon (by what the eye sees: a red sun has more red than a white one has of any colour)'); at(12);
  assert.equal(night.on, false, 'at night the sun is off');
  assert.ok(noon.amb[2] > night.amb[2] * 3, `the ambient light goes from night blue to day (${noon.amb.map(v => v.toFixed(2))}, ${night.amb.map(v => v.toFixed(2))})`);
  assert.ok(dawn.amb[0] / dawn.amb[2] > noon.amb[0] / noon.amb[2], 'warm around sunrise');
  E.run('setTimeOfDay(36)'); assert.equal(E.run('TOD.h'), 12, 'it wraps'); E.run('setTimeOfDay(-6)'); assert.equal(E.run('TOD.h'), 18);
  assert.equal(E.run('setTimeOfDay(12).daylight'), 1); assert.equal(E.run('getTimeOfDay().daylight'), 1); E.run('setTimeOfDay(2)'); assert.equal(E.run('getTimeOfDay().daylight'), 0);
});

test('E8 the time of day: options stay, sky and ambient can be left to the game, and the engine runs a clock by itself', () => {
  const E = loadEngine();
  E.run('setTimeOfDay(5.5, { sunrise: 5, sunset: 21 })'); assert.ok(E.run('SUN_ON'), 'a long day: the sun is already up at 5:30'); E.run('setTimeOfDay(20.9)'); assert.ok(E.run('SUN_ON'));
  assert.equal(E.run('setTimeOfDay(22).sunAngle'), null);
  E.run('setAmbient([.7, .7, .7]); setTimeOfDay(12, { ambient: false })'); assert.deepEqual([...E.run('AMB_C')].map(v => +v.toFixed(2)), [.7, .7, .7], 'ambient: false leaves the ambient light alone');
  E.run('setSkyGradient(null); setTimeOfDay(12, { sky: false })'); assert.equal(E.run('SKYG.on'), false, 'sky: false leaves the sky alone');
  E.run('setTimeOfDay(12, { sky: true, rate: 2 })'); E.run('stepWeather(.5)'); assert.equal(E.run('TOD.h'), 13, 'rate: 2 hours a second: half a second is an hour');
  E.run('setTimeOfDay(12, { rate: 0 })'); E.run('stepWeather(5)'); assert.equal(E.run('TOD.h'), 12, 'rate 0 stops it');
});

test('E8 a game that never calls any of it is untouched: no sky, no fog, no wind, no weather, and no particle types made', () => {
  const E = loadEngine();
  assert.deepEqual(JSON.parse(JSON.stringify(E.run('[SKYG.on, FOG.on, WIND.speed, WEATHER.kind, TOD.on, WEATHER.pt, PTYPES.length]'))), [false, false, 0, null, false, null, 0]);
  E.run('setWeather("rain")'); assert.equal(E.run('PTYPES.length'), 2, 'rain and snow are made the first time a game asks');
  E.run('setWeather(null)'); assert.equal(E.run('WEATHER.kind'), null); assert.throws(() => E.run('setWeather("hail")'), /not a kind of weather/);
});

test('E8 the sky gradient: the sky layer is its colours, stars show on it as bright as the hour lets them, and clearing it gives the old sky back', () => {
  const E = loadEngine(); frameEnv(E); E.run('GAME.stars = 40');
  E.run('frame(() => {})'); const before = E.run(skyHash), nStars0 = E.run('(() => { let n = 0; for (let k = 0; k < R.RW * R.RH; k++) if (R.sPix[k * 4 + 3]) n++; return n; })()');
  assert.ok(nStars0 > 0 && nStars0 < 800, `the plain sky has only stars (${nStars0} of ${100 * 60} pixels)`);
  E.run('setSkyGradient({ top: [.1, .2, .5], horizon: [.7, .8, 1], stars: 0 }); frame(() => {})');
  const px = (x, y) => [...E.run(`[R.sPix[${(y * 100 + x) * 4}], R.sPix[${(y * 100 + x) * 4 + 1}], R.sPix[${(y * 100 + x) * 4 + 2}], R.sPix[${(y * 100 + x) * 4 + 3}]]`)];
  assert.equal(px(50, 30)[3], 255, 'every sky cell is drawn now'); assert.ok(lum(px(50, 55)) > lum(px(50, 3)) * 1.5, 'lighter toward the horizon (the bottom of the screen)');
  assert.ok(px(50, 3)[2] > px(50, 3)[0] * 1.5, 'blue at the top');
  const plainGrad = E.run(skyHash);
  E.run('setSkyGradient({ top: [.1, .2, .5], horizon: [.7, .8, 1], stars: 1 }); frame(() => {})');
  assert.notEqual(E.run(skyHash), plainGrad, 'with stars on, stars show on it (and the cache heard of the change)');
  E.run('setSkyGradient({ top: [.9, .2, .1], horizon: [1, .5, .2], stars: 0 }); frame(() => {})'); assert.ok(px(50, 30)[0] > px(50, 30)[2], 'a new colour is drawn at once');
  E.run('setSkyGradient(null); frame(() => {})'); assert.equal(E.run(skyHash), before, 'cleared: the old sky, bit for bit');
  assert.throws(() => E.run('setSkyGradient({ top: [1, 2] })'), /\[r, g, b\]/);
});

test('E8 fog: the world and the sky move toward its colour, more of it over the sky, lit by the scene, and off gives the old frame back bit for bit', () => {
  const E = lit6(loadEngine());
  E.run('frame(() => {})'); const old = E.run(frameHash), skyOld = E.run(skyHash), mid = lum(E.run('pixel(60, 77)')), skyPx = () => lum(E.run('[R.sPix[(5 * 100 + 50) * 4], R.sPix[(5 * 100 + 50) * 4 + 1], R.sPix[(5 * 100 + 50) * 4 + 2]]'));
  E.run('setFog({ colour: [.9, .9, .9], density: .5 }); frame(() => {})');
  const fogged = lum(E.run('pixel(60, 77)')), b = E.run('[...FOG.bytes]'), fogLum = lum(b);
  assert.ok(Math.abs(fogged - (mid + (fogLum - mid) * .5)) < 2, `a density of .5 puts the world halfway to the fog's colour (${mid.toFixed(0)} -> ${fogged.toFixed(0)}, fog ${fogLum.toFixed(0)})`);
  E.run('setFog({ colour: [.9, .9, .9], density: 1 }); frame(() => {})'); assert.deepEqual([...E.run('pixel(60, 77)')].slice(0, 3), [...b].map(v => v), 'density 1 is the fog\'s colour, exactly');
  E.run('setFog(null); frame(() => {})'); assert.equal(E.run(frameHash), old, 'no fog: the old frame');
  assert.equal(E.run(skyHash), skyOld, 'and the old sky');
  // the ground bias: thicker at the bottom of the screen than the top
  E.run('setFog({ density: .5, ground: 1 }); frame(() => {})'); const top = E.run('(() => { const D = R.wPix; return [D[(3 * 100 + 10) * 4 + 3], D[(40 * 100 + 10) * 4 + 3]]; })()');
  const lo = E.run('FOG.ground'); assert.equal(lo, 1);
  // lit by the scene: the same fog in a dark scene is darker
  E.run('setFog({ colour: [.9, .9, .9], density: .5, ground: 0 }); setAmbient([.7, .7, .75]); frame(() => {})'); const day = lum(E.run('[...FOG.bytes]'));
  E.run('setAmbient([.05, .05, .08]); frame(() => {})'); const night = lum(E.run('[...FOG.bytes]'));
  assert.ok(night < day * .5, `at night the fog is dark (${night.toFixed(0)} against ${day.toFixed(0)})`);
  // the sky is further away than the world: at the same density more of the fog covers it (the plain sky has no cells to tint, so give it a colour)
  E.run('setFog(null); setSkyGradient({ top: [.1, .2, .5], horizon: [.2, .3, .6], stars: 0 }); setAmbient([.7, .7, .75]); frame(() => {})'); const skyBase = skyPx(), worldBase = lum(E.run('pixel(60, 77)'));
  E.run('setFog({ colour: [.9, .9, .9], density: .4 }); frame(() => {})');
  const fl = lum(E.run('[...FOG.bytes]')), left = (v, base) => Math.abs(v - fl) / Math.abs(base - fl);   // the share of the colour's distance from the fog that is left
  assert.ok(left(skyPx(), skyBase) < left(lum(E.run('pixel(60, 77)')), worldBase) - .1, `more fog over the sky than over the world at one density (${left(skyPx(), skyBase).toFixed(2)} of the sky is left against ${left(lum(E.run('pixel(60, 77)')), worldBase).toFixed(2)} of the world)`);
  assert.throws(() => E.run('setFog({ density: .5, colour: [1] })'), /\[r, g, b\]/);
});

test('E8 wind: pulls smoke, vapour, dust and types with a coupling toward its speed, leaves the rest, and no wind changes nothing, bit for bit', () => {
  const run = wind => {
    const E = loadEngine(); frameEnv(E);
    E.run(`defineParticle({ wind: 3 }); defineParticle({});   // two game types, one coupled
      globalThis.ids = [PT_SMOKE, PT_VAPOR, PT_DUST, PT_GRAIN, PT_CUSTOM, PT_CUSTOM + 1].map(t => spawnP(t, 60, 40, 0, 0, 20, 46, 1));
      ${wind ? `setWind(${wind});` : ''}`);
    for (let i = 0; i < 40; i++) E.run('stepParticles(DT)');
    return JSON.parse(JSON.stringify(E.run('ids.map(i => P.vx[i])')));
  };
  const none = run(0), blown = run(30);
  assert.ok(blown[0] > 10 && blown[1] > 10 && blown[2] > 10, `smoke, vapour and dust are blown (${blown.slice(0, 3).map(v => v.toFixed(1))})`);
  assert.ok(blown[4] > 10, 'a type with wind: 3 is'); assert.equal(blown[5], none[5], 'a type with no coupling is not'); assert.equal(blown[3], none[3], 'nor is a grain');
  assert.deepEqual(run(0), none, 'no wind: the same run again');
  assert.ok(blown[0] < 30 * 2, 'it never goes much past the wind (a pull toward its speed, not a push)');
  const E = loadEngine(); E.run('setWind(10, 1)'); const seen = []; for (const t of [0, 1.3, 2.9, 4.1, 6.7]) { E.run(`clockT = ${t}`); seen.push(E.run('windNow()')); }
  assert.ok(Math.max(...seen) - Math.min(...seen) > 4 && seen.every(v => v >= 0 && v <= 2 * 10 * E.run('RES') + 1e-9), `gusts swell and drop the wind (${seen.map(v => v.toFixed(1))})`);
  E.run('setWind(10, 0); clockT = 3'); assert.equal(E.run('windNow()'), 10 * E.run('RES'), 'no gust: steady');
});

test('E8 rain and snow: an emitter above the view that never starves the game, cools what it hits, and ends in a liquid', () => {
  const E = loadEngine(); frameEnv(E);
  E.run('setWeather("rain", { amount: .5 })'); const t0 = E.run('P.n'); E.run('for (let i = 0; i < 30; i++) stepWeather(DT)');   // half a second at 60 steps a second
  const n = E.run('P.n'), want = 2.4 * 98 * .5 * 30 * E.run('DT'); assert.equal(t0, 0);
  assert.ok(Math.abs(n - want) <= 2, `about ${want.toFixed(0)} drops a half second at .5 (${n})`);
  assert.ok(E.run('(() => { let up = 0; for (let i = 0; i < P.n; i++) if (P.y[i] < cam.y) up++; return up; })()') > n * .9, 'they start above the view');
  E.run('seedRandom(1); for (let i = 0; i < 200; i++) { stepWeather(DT); stepParticles(DT); }');
  const steady = E.run('P.n'); E.run('for (let i = 0; i < 100; i++) { stepWeather(DT); stepParticles(DT); }'); const later = E.run('P.n');
  assert.ok(later < steady * 1.4 && later > steady * .6, `drops end on the ground: the count is steady (${steady}, ${later})`);
  E.run('setWeather("rain", { amount: 1 }); PMAX = P.n + 40; for (let i = 0; i < 60; i++) stepWeather(DT)'); assert.ok(E.run('P.n') <= E.run('PMAX') * .75 + 1, 'the emitter stops at three quarters of the budget');
  E.run('PMAX = 9000');
  // it cools what it hits
  const F = loadEngine(); frameEnv(F); F.run('seedRandom(3); for (let x = 20; x < 120; x++) heat[(H - 14) * W + x] = 1; setWeather("rain", { amount: 1 }); for (let i = 0; i < 240; i++) { stepWeather(DT); stepParticles(DT); }');
  assert.ok(F.run('(() => { let s = 0, n = 0; for (let x = 20; x < 120; x++) { s += heat[(H - 14) * W + x]; n++; } return s / n; })()') < .8, 'hot ground is cooled by rain');
  // it stops when asked
  E.run('setWeather(null); P.n = 0; for (let i = 0; i < 60; i++) stepWeather(DT)'); assert.equal(E.run('P.n'), 0);
  // the same seed makes the same rain
  const sig = () => { const G2 = loadEngine(); frameEnv(G2); G2.run('seedRandom(11); setWeather("snow", { amount: .8 }); setWind(6, .5); for (let i = 0; i < 120; i++) { stepWeather(DT); stepParticles(DT); }'); return JSON.stringify([G2.run('P.n'), Array.from(G2.run('P.x.slice(0, 20)')).map(v => +v.toFixed(3))]); };
  assert.equal(sig(), sig(), 'one seed, one storm');
});

test('E8 rain slants with the wind and still lands in the view', () => {
  const E = loadEngine(); frameEnv(E); E.run('seedRandom(5); setWind(40); setWeather("rain", { amount: 1 }); for (let i = 0; i < 90; i++) { stepWeather(DT); stepParticles(DT); }');
  const mean = E.run('(() => { let s = 0, n = 0; for (let i = 0; i < P.n; i++) { s += P.vx[i]; n++; } return n ? s / n : 0; })()');
  assert.ok(mean > 20, `drops are blown to the right (${mean.toFixed(1)} units a second)`);
  const xs = E.run('Array.from(P.x.slice(0, P.n))'), inView = xs.filter(x => x > E.run('cam.x') && x < E.run('cam.x') + E.run('R.cols')).length;
  assert.ok(inView > xs.length * .6, `and they fall over the view, not to one side of it (${inView} of ${xs.length}: the rest are still coming in from upwind)`);
});

test('E8 snow that piles: a share of the drops become cells of the material, which sand rules then settle; without a pile material nothing is added', () => {
  const run = pile => {
    const E = loadEngine(); frameEnv(E);
    E.run(`defineMaterial('snow', { albedo: [.95, .96, 1], granular: true }); globalThis.SN = MATS.findIndex(m => m && m.name === 'snow'); seedRandom(2);
      setWeather('snow', { amount: 1, ${pile ? 'pile: SN, pileChance: 1' : ''} }); for (let i = 0; i < 900; i++) { stepWeather(DT); stepParticles(DT); simGranular(); }`);
    return E.run('(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === SN) n++; return n; })()');
  };
  const none = run(false), some = run(true);
  assert.equal(none, 0, 'no pile material: no cells'); assert.ok(some > 50, `with one the snow settles on the ground (${some} cells)`);
});

test('E8 rain into a liquid ends there and splashes back as a few drops that do not splash again', () => {
  const E = loadEngine(); frameEnv(E);
  E.run(`defineMaterial('lt-water', { albedo: [.2, .4, .8], liquid: true }); globalThis.WT = MATS.findIndex(m => m && m.name === 'lt-water');
    for (let y = H - 20; y < H - 14; y++) for (let x = 20; x < 120; x++) cells[y * W + x] = WT; seedRandom(4); setWeather('rain', { amount: 1 });
    globalThis.maxSplash = 0; for (let i = 0; i < 300; i++) { stepWeather(DT); stepParticles(DT); let s = 0; for (let j = 0; j < P.n; j++) if (P.rest[j]) s++; maxSplash = Math.max(maxSplash, s); }`);
  const n = E.run('P.n'), inWater = E.run('(() => { let k = 0; for (let i = 0; i < P.n; i++) { const c = getC(Math.floor(P.x[i]), Math.floor(P.y[i] / ASPECT)); if (MAT_LIQ[c]) k++; } return k; })()');
  assert.equal(inWater, 0, `no drop is left in the water (${n} in the air)`);
  assert.ok(E.run('maxSplash') >= 3, `drops that land in it throw up splash droplets (at most ${E.run('maxSplash')} at once)`);
  assert.ok(E.run('(() => { let r = 0; for (let j = 0; j < P.n; j++) if (!P.rest[j]) r++; return r; })()') > E.run('maxSplash'), 'and most of what is in the air is still rain');
});

test('E6 bloom: a game can switch the glow off, the player still can, and neither undoes the other', () => {
  const E = loadEngine();
  E.run("setSetting('bloom', true)"); assert.equal(E.run('R.bloom'), true);
  E.run('setPost({ bloom: false })'); assert.equal(E.run('R.bloom'), false, 'the game switched it off');
  E.run("setSetting('bloom', false)"); E.run('setPost({ bloom: true })'); assert.equal(E.run('R.bloom'), false, 'the player has it off: the game allowing it does not turn it on');
  E.run("setSetting('bloom', true)"); assert.equal(E.run('R.bloom'), true, 'and when both allow it, it is on');
});
