// The Sampler's live engine without a browser (tests/node/audio-mock.mjs records the audio graph): instruments made in slices between
// frames, play({ wait }), crossfades, a second deck for stingers, single notes for sound effects, and track layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';
import { makeAudio } from './audio-mock.mjs';

const boot = () => {
  const audio = makeAudio(), E = loadEngine({ audio, now: () => performance.now() });
  E.ctx.__later = f => queueMicrotask(f);   // the slices of instrument building follow one another at once (a timer waits 15 ms on Windows)
  E.run(`Sampler.build.later = __later; Sampler.init(new window.AudioContext(), null);
    globalThis.mk = (...tracks) => Sampler.check({ format: 'pixelite-song', tracks: tracks.map((t, i) => ({ name: t, instrument: i ? 'organ' : 'square', notes: [[0, 96, 60 + i, 100], [96, 96, 64, 100]] })) });`);
  return { E, audio, ctx: audio.ctx, run: E.run };
};
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const data = b => Array.from(b.getChannelData(0));

test('instruments made in slices between frames are the same samples as made at once', async () => {
  const A = boot(), B = boot();
  await A.run("Sampler.prepare(['strings', 'harp'])");
  assert.equal(A.run("Sampler.ready(['strings', 'harp'])"), true);
  assert.equal(B.run("Sampler.ready(['strings'])"), false, 'nothing is made until asked');
  assert.ok(A.run('Sampler.build.slices') > 4, 'the work was cut into slices');
  for (const id of ['strings', 'harp']) {
    const bufA = A.run(`Sampler.note('${id}', 60).src.buffer`), bufB = B.run(`Sampler.note('${id}', 60).src.buffer`);   // B makes it on the spot
    assert.equal(bufA.length, bufB.length);
    assert.deepEqual(data(bufA), data(bufB), `${id}: the same samples`);
  }
});

test('making the heaviest instruments never takes one long stretch (a drum kit used to stall the page for ~130 ms)', async () => {
  let best = Infinity, steps = 0;
  for (let i = 0; i < 3; i++) {   // the fastest of a few tries: another process on the machine can steal any one stretch
    const { run } = boot();
    run('Sampler.build.sliceMs = 0');   // one step per slice: the longest slice is the longest step
    await run("Sampler.prepare(['kit', 'harp'])");
    best = Math.min(best, run('Sampler.build.longest')); steps = run('Sampler.build.slices');
    if (best < 12) break;
  }
  assert.ok(steps > 150, `${steps} steps: the work is cut into many small pieces`);
  assert.ok(best < 60, `the longest step was ${best.toFixed(1)} ms`);
});

test('a song asked to play with wait: true starts when its instruments are made, and the old song plays on until then', async () => {
  const { run } = boot();
  run("globalThis.A = mk('a'); globalThis.B = mk('b', 'c')");
  run('Sampler.play(A)');                                 // made on the spot, as always
  assert.equal(run('Sampler.playing && Sampler.song === A'), true);
  run('Sampler.play(B, { wait: true })');
  assert.equal(run('Sampler.song === A && Sampler.playing'), true, 'A still plays');
  assert.equal(run('Sampler.want !== null'), true);
  await run('Sampler.prepare(B)'); await tick();
  assert.equal(run('Sampler.song === B && Sampler.playing'), true, 'B took over once it was ready');
  assert.equal(run('Sampler.want'), null);
  // already made: wait: true starts at once
  run('Sampler.play(A, { wait: true })');
  assert.equal(run('Sampler.song === A'), true);
});

test('stop() and a later play() cancel a play that is still waiting for its instruments', async () => {
  const { run } = boot();
  run("globalThis.A = mk('a'); globalThis.B = mk('b')");
  run('Sampler.play(A, { wait: true }); Sampler.stop()');
  await run('Sampler.prepare(A)'); await tick();
  assert.equal(run('Sampler.playing'), false, 'stopped before it began: it never begins');
  run('Sampler.play(B, { wait: true }); Sampler.play(A, { wait: true })');
  await tick(); await run('Sampler.prepare(A)'); await tick();
  assert.equal(run('Sampler.song === A'), true, 'the last request wins');
});

test('a crossfade lets the old song fade out in a deck of its own, then lets go of its mixer', async () => {
  const { run, ctx, audio } = boot();
  run("globalThis.A = mk('a'); globalThis.B = mk('b'); Sampler.play(A); Sampler.play(B, { crossfade: .05, fadeIn: .05 }); globalThis.old = Sampler.ghosts[0];");
  assert.equal(run('Sampler.ghosts.length'), 1);
  assert.equal(run('old.song === A && old.playing && old.mix !== Sampler.mix && old.gain !== Sampler.gain'), true, 'A plays on in its own deck');
  assert.equal(run('Sampler.song === B && Sampler.playing'), true);
  const out = run('Sampler.out');
  assert.ok(audio.reaches(run('old.gain'), out) && audio.reaches(run('Sampler.gain'), out), 'both decks feed the same output');
  const t = ctx.currentTime, g = run('old.gain').gain;
  assert.ok(g.events.some(e => e[0] === 'lin' && e[1] === 0 && Math.abs(e[2] - (t + .05)) < 1e-9), 'the old song ramps to silence over the fade');
  assert.ok(run('Sampler.gain').gain.events.some(e => e[0] === 'lin' && e[1] === 1), 'the new one ramps up');
  await tick(600);
  assert.equal(run('Sampler.ghosts.length'), 0, 'the old deck was disposed');
  assert.equal(run('old.mix'), null);
  assert.equal(run('old.playing'), false);
});

test('a second deck plays a stinger over the music, and ducking turns the music down without touching its volume', () => {
  const { run, audio } = boot();
  run("globalThis.A = mk('a'); globalThis.S = mk('s'); Sampler.play(A); Sampler.setVolume(.8); globalThis.d = Sampler.deck(); d.play(S, { loop: false });");
  assert.equal(run('d !== Sampler && d.playing && Sampler.playing && d.song === S && Sampler.song === A'), true, 'two songs at once');
  assert.ok(audio.reaches(run('d.gain'), run('Sampler.dest')) && audio.reaches(run('Sampler.gain'), run('Sampler.dest')));
  run('Sampler.duck(.25, { fade: .3 })');
  const ev = run('Sampler.out').gain.events.at(-1);
  assert.deepEqual([ev[0], ev[1]], ['target', .25]);
  assert.equal(run('Sampler.vol'), .8, 'the music volume the game set is not changed');
  run('d.dispose()');
  assert.equal(run('d.playing || d.mix'), false || null);
  assert.equal(run('Sampler.deck().own'), true);
});

test('a note of an instrument on its own: pitched, panned, with its envelope, cut early on request, and it takes no song', async () => {
  const { run, ctx, audio } = boot();
  assert.equal(run("Sampler.note('nope', 60)"), null, 'an unknown instrument');
  const v = run("Sampler.note('square', 69, { dur: .3, pan: -.6, pitch: 2, vel: 127 })");
  assert.ok(v && v.end > ctx.currentTime + .3);
  const pan = audio.of('stereopanner').at(-1);
  assert.equal(pan.pan.value, -.6);
  assert.ok(audio.reaches(v.src, run('Sampler.out')) && v.src.out[0] === v.gn && v.gn.out[0] === pan, 'source → gain → panner → output');
  const plain = run("Sampler.note('square', 69)");
  assert.ok(Math.abs(v.src.playbackRate.value - 2 * plain.src.playbackRate.value) < 1e-9, 'pitch is a frequency multiplier');
  const dry = run("Sampler.note('square', 60)");
  assert.equal(audio.of('stereopanner').length, 1, 'no pan, no panner');
  assert.ok(dry.gn.gain.events.length >= 3, 'attack, decay and release are scheduled');
  v.cut(ctx.currentTime + .1);
  assert.ok(v.end <= ctx.currentTime + .11, 'cut short');
  const kit = run("Sampler.note('kit', 36)");
  assert.ok(kit && kit.kit && kit.src.buffer.length > 100, 'the drum kit plays one drum');
  assert.equal(run("Sampler.note('kit', 1)"), null, 'a note the kit has no drum for');
});

test('layers: play() can start a song with tracks already out, and track() brings them in and out later', () => {
  const { run } = boot();
  run("globalThis.A = mk('lead', 'drums'); Sampler.play(A, { layers: { drums: 0 } })");
  const strips = run('Sampler.mix.strips');
  assert.equal(strips[1].mute.gain.value, 0, 'drums start out');
  assert.equal(strips[0].mute.gain.value, 1);
  run("Sampler.track('drums', { volume: .5, fade: .2 })");
  const ev = strips[1].mute.gain.events.at(-1);
  assert.deepEqual([ev[0], ev[1]], ['target', .5]);
  run("Sampler.play(mk('lead', 'drums'))");
  assert.equal(run('Sampler.mix.strips[1].layer'), 1, 'a new song starts with every track in');
});
