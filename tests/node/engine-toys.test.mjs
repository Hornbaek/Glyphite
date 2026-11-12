// Ropes, the grappling hook, ghosts and echoes, and rewind, on the engine with no game (tests/node/engine-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

const world = (E, w = 200, h = 120, floorRows = 4) => {
  E.run(`defineMaterial('rock', { tough: 5, brittle: false, anchor: true }); defineMaterial('soft', { tough: .2 }); defineMaterial('sand', { granular: true });
    worldMaterials({ edge: 1, rubble: 3 }); worldInit(${w}, ${h}); for (let y = H - ${floorRows}; y < H; y++) for (let x = 0; x < W; x++) setC(x, y, 1);`);
};

test('a rope hangs below its ends, keeps them pinned, and snaps where it is stretched too far', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E);
  E.run('globalThis.r = new Rope(40, 30, 100, 30, 12, { slack: .08 }); for (let i = 0; i < 240; i++) r.step(DT);');
  assert.equal(E.run('r.x[0]'), 40); assert.equal(E.run('r.x[12]'), 100);
  assert.ok(E.run('r.y[6]') > 36, `the middle sags (y ${E.run('r.y[6]').toFixed(1)})`); assert.ok(E.run('r.y[6]') < 80, 'but it holds');
  E.run('globalThis.snaps = []; globalThis.t = new Rope(40, 30, 100, 30, 12, { maxTension: 1.6, onSnap: i => snaps.push(i) }); for (let i = 0; i < 30; i++) t.step(DT); t.b = [200, 30]; for (let i = 0; i < 30; i++) t.step(DT);');
  assert.ok(E.run('snaps.length') >= 1 && E.run('t.snapped.length') >= 1, 'pulled apart, it snaps');
  // a rope lying on a ledge does not sink into it
  E.run('for (let x = 60; x < 80; x++) for (let y = 40; y < 44; y++) setC(x, y, 1); globalThis.l = new Rope(50, 30, 90, 30, 16, { pinA: true, pinB: true, slack: .2 }); for (let i = 0; i < 300; i++) l.step(DT);');
  let inside = 0; for (let i = 0; i <= 16; i++) if (E.run(`solidU(l.x[${i}], l.y[${i}])`)) inside++;
  assert.equal(inside, 0, 'no point is inside rock');
});

test('a grappling hook swings the hero like a pendulum, is let go when the anchor goes, and can rip a weak anchor out', () => {
  const E = loadEngine(); E.run('setResVars(1); setGravity(9.8)'); world(E, 300, 150);
  E.run('for (let x = 100; x < 160; x++) for (let y = 20; y < 24; y++) setC(x, y, 1); globalThis.h = new Character(130, 90, { w: 4, h: 6, run: 20, jump: 12 }); globalThis.g = new Grapple(h, { range: 120 });');
  assert.equal(E.run('g.fire(0, -1)'), true, 'the hook catches the beam above');
  assert.ok(Math.abs(E.run('g.rope.y') - 24) < 1.5 && E.run('g.rope.len') > 40);
  E.run('h.x = 100; h.y = 70; h.vx = 0; h.vy = 0; g.rope.x = 130; g.rope.len = 50; let min = 1e9, max = -1e9, far = 0; for (let i = 0; i < 400; i++) { h.step(DT, { rope: g.rope }); const d = Math.hypot(h.x - g.rope.x, h.y - 6 * .6 - g.rope.y); far = Math.max(far, d); min = Math.min(min, h.x); max = Math.max(max, h.x); } globalThis.swing = [min, max, far];');
  const [min, max, far] = [...E.run('swing')];
  assert.ok(far < 50 + 4, `the rope length holds (${far.toFixed(1)} of 50)`); assert.ok(max - min > 30, `it swings from side to side (${min.toFixed(0)}..${max.toFixed(0)})`);
  E.run('for (let x = 100; x < 160; x++) for (let y = 20; y < 24; y++) setC(x, y, 0); g.update();');
  assert.equal(E.run('g.rope'), null, 'the anchor is gone: the hook lets go');
  // a weak anchor under a hard pull is torn out
  E.run('for (let x = 120; x < 140; x++) setC(x, 30, 2); globalThis.h2 = new Character(110, 100, { w: 4, h: 6 }); globalThis.g2 = new Grapple(h2, { range: 120, rip: 1 }); g2.fire(.2, -1);');
  assert.ok(E.run('g2.rope') !== null, 'hooked a soft block');
  E.run('h2.x = 100; h2.y = 100; h2.vx = 80; h2.vy = 60; for (let i = 0; i < 30 && g2.rope; i++) { g2.update(); h2.step(DT, { rope: g2.rope }); }');
  assert.equal(E.run('g2.rope'), null, 'ripped out');
});

test('a ghost replays a recording, an echo plays your own path delayed', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E);
  E.run(`globalThis.who = { x: 10, y: 50, facing: 1, tag: 'run' }; globalThis.rec = new GhostRecorder(who);
    for (let i = 0; i < 100; i++) { who.x += 1; rec.step(); }
    globalThis.gh = spawnGhost(rec.frames, { sprite: null, onEnd: e => { globalThis.ended = true; } }); cam.x = 0; cam.y = 0;
    globalThis.step = n => { for (let i = 0; i < n; i++) { frameNo++; stepEntities(DT); } };`);
  E.run('step(50)'); assert.equal(E.run('gh.x'), 11 + 49, 'the ghost is where the hero was 50 steps in');
  E.run('step(60)'); assert.equal(E.run('ended'), true); assert.equal(E.run('gh.dead'), true, 'and is gone at the end');
  E.run('globalThis.t = { x: 0, y: 50, facing: 1 }; globalThis.ec = spawnEcho(t, 1, {}); for (let i = 0; i < 200; i++) { t.x += 1; ec.rec.step(); frameNo++; stepEntities(DT); }');
  assert.ok(E.run('t.x - ec.x') > 50 && E.run('t.x - ec.x') < 70, `the echo is a second behind (${E.run('t.x - ec.x')} cells)`);
});

test('rewind puts the grid, entities and platforms back, step by step', () => {
  const E = loadEngine(); E.run('setResVars(1)'); world(E);
  E.run(`defineEntity('mover', { size: [3, 3], always: true, props: { n: 0 }, update(e) { e.x += 1; e.n++; } }); globalThis.m = spawn('mover', 20, 50); globalThis.pf = addPlatform({ x: 60, y: 90, cols: 10, rows: 3, mat: 1, path: [[60, 90], [120, 90]], speed: 10 });
    cam.x = 0; cam.y = 0; Rewind.start({ seconds: 10, every: 6 }); Rewind.keep = { save: () => ({ score: globalThis.score }), load: s => { globalThis.score = s.score; } };
    globalThis.score = 0; globalThis.play = n => { for (let i = 0; i < n; i++) { frameNo++; if (stepRewind()) continue; stepPlatforms(DT); stepEntities(DT); } };`);
  E.run('play(120)'); const x1 = E.run('m.x'), off1 = E.run('pf.offX'), snaps = E.run('Rewind.snaps.length');
  assert.ok(snaps >= 15, `snapshots are kept (${snaps})`);
  E.run('setC(30, 50, 1); setC(31, 50, 1); score = 99; play(120)');
  assert.ok(E.run('m.x') > x1 + 100);
  E.run('Rewind.hold(true); play(30); Rewind.hold(false); play(1)');
  assert.ok(E.run('m.x') < x1 + 50 && E.run('Rewind.rewinding') === false, `the entity went back (${E.run('m.x')} against ${x1} + 120)`);
  E.run('Rewind.hold(true); play(60)'); E.run('Rewind.hold(false)');
  assert.ok(E.run('m.x') < x1, 'further back than the first mark'); assert.ok(E.run('pf.offX') <= off1 + 2, 'the platform went back too');
  assert.equal(E.run('getC(30, 50)'), 0, 'a block placed later is gone again'); assert.equal(E.run('score'), 0, 'the game kept its own state through keep');
});
