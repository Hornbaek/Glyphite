// Sfx: sounds as data (defineSound / Sfx.play), where a sound is heard from (pan and distance), the cap on voices, and the player's volumes and
// mute, kept per game. Runs the engine's real sound part against a recording Web Audio (tests/node/audio-mock.mjs): nothing is heard, but every
// node, connection and parameter change can be looked at.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';
import { makeAudio } from './audio-mock.mjs';

const json = x => JSON.parse(JSON.stringify(x));
const boot = (storage = new Map(), gameCode = '') => {
  const audio = makeAudio(), E = loadEngine({ audio, storage, now: () => performance.now(), gameCode });
  E.ctx.__later = f => queueMicrotask(f);
  E.run('Sampler.build.later = __later; R.cols = 400; R.rows = 200; cam.x = 0; cam.y = 0');   // a 400 x 200 screen, the camera at the origin: the listener is at (200, 100)
  return { E, audio, storage, run: E.run, ctx: () => audio.ctx };
};

test('the effects play through their own bus, music through another, both into one master; nothing exists before the first input', () => {
  const { run, audio } = boot();
  assert.equal(audio.contexts.length, 0);
  assert.equal(run("Sfx.play('pickup')"), false, 'before the audio has started there is nothing to play on');
  run('Sfx.init()');
  const { master, sfxBus, musicBus } = run('Sfx');
  assert.ok(audio.reaches(sfxBus, master) && audio.reaches(musicBus, master) && audio.reaches(master, audio.ctx.destination));
  assert.equal(master.gain.value, .5, 'the master gain is the constant it always was');
  assert.ok(audio.reaches(run('Sampler.gain'), musicBus) && !audio.reaches(run('Sampler.gain'), sfxBus), 'the Sampler is on the music bus');
  assert.ok(audio.reaches(run('Chip.gain'), musicBus), 'and so is the Chip');
  assert.equal(run("Sfx.play('pickup')"), true);
  const osc = audio.of('oscillator').filter(o => o.frequency.value === 1320)[0];
  assert.ok(osc && audio.reaches(osc, sfxBus) && !audio.reaches(osc, musicBus), 'an effect is on the effects bus');
});

test('the old effects still make the sounds they made: pickup, alarm, win and launch are data now, thud, boom and tone as before', () => {
  const { run, audio } = boot();
  run('Sfx.init()');
  const freqs = () => audio.of('oscillator').filter(o => o.stopped !== undefined).map(o => o.frequency.value);
  run('Sfx.pickup()'); assert.deepEqual(freqs(), [1320, 1760]);
  run('Sfx.alarm()'); assert.deepEqual(freqs().slice(2), [880, 660]);
  run('Sfx.win()'); assert.deepEqual(freqs().slice(4), [523, 659, 784, 1047]);
  const n = audio.of('buffersource').length;
  run('Sfx.launch()'); assert.equal(audio.of('buffersource').length, n + 1);
  const f = audio.of('biquadfilter').at(-1);
  assert.equal(f.type, 'bandpass'); assert.equal(f.Q.value, 1.2);
  run("Sfx.tone(440, .1, .2, 'sine', .3)");
  const o = audio.of('oscillator').at(-1), g = o.out[0];
  assert.equal(o.type, 'sine'); assert.equal(o.started, audio.ctx.currentTime + .3);
  assert.equal(g.gain.events[0][1], .2, 'the volume it was given');
  run('Sfx.boom(2); Sfx.thud(5)');   // no error
});

test('defineSound: a sound is data (tone, noise burst, instrument note), played by name with a pitch and a volume', async () => {
  const { run, audio } = boot();
  run(`defineSound('zap', { vol: .5, layers: [
    { tone: 440, dur: .2, vol: .2, type: 'sine', slide: 880 },
    { burst: .3, from: 3000, to: 200, vol: .4, filter: 'highpass', delay: .05 },
    { note: 72, instrument: 'square', dur: .2, vel: 100, vol: .5 }] })`);
  run('Sfx.init()');
  const noise = () => run('Sfx.noiseBuf'), notes = () => audio.of('buffersource').filter(s => s.buffer !== noise());
  assert.equal(run("Sfx.play('zap')"), true, 'the tone and the noise play at once');
  assert.equal(notes().length, 0, 'but the note layer is silent until its instrument is made, rather than a stall');
  await run("Sampler.prepare([{ instrument: 'square' }])");
  const n = { osc: audio.of('oscillator').length, src: audio.of('buffersource').length };
  assert.equal(run("Sfx.play('zap', { pitch: 2, vol: .8 })"), true);
  const osc = audio.of('oscillator').slice(n.osc).at(-1), now = audio.ctx.currentTime;
  assert.equal(osc.frequency.value, 880, 'pitch is a frequency multiplier: 440 × 2');
  assert.deepEqual(osc.frequency.events.map(e => [e[0], e[1]]), [['set', 880], ['exp', 1760]], 'it slides to 880 × 2');
  assert.ok(Math.abs(osc.out[0].gain.events[0][1] - .2 * .5 * .8) < 1e-9, 'layer vol × sound vol × play vol');
  const srcs = audio.of('buffersource').slice(n.src);
  assert.equal(srcs.length, 2, 'a noise burst and a note');
  const hiss = srcs.find(s => s.buffer === noise()), flt = hiss.out[0];
  assert.equal(flt.type, 'highpass'); assert.ok(Math.abs(hiss.started - (now + .05)) < 1e-9, 'delay');
  const note = srcs.find(s => s !== hiss);
  assert.equal(notes().length, 1);
  assert.ok(audio.reaches(note, run('Sfx.sfxBus')) && !audio.reaches(note, run('Sfx.musicBus')), 'a note is an effect, not music');
  // a recipe can be a list of layers, or one layer, or replace a built-in
  run("defineSound('one', { tone: 300 }); defineSound('two', [{ tone: 300 }, { tone: 400 }]); defineSound('pickup', { tone: 100 })");
  assert.equal(run("Sfx.play('one')"), true); assert.equal(run("Sfx.play('missing')"), false);
  const before = audio.of('oscillator').length; run('Sfx.pickup()');
  assert.equal(audio.of('oscillator').length, before + 1); assert.equal(audio.of('oscillator').at(-1).frequency.value, 100, 'a game can replace pickup()');
});

test('limit and gap keep one sound from stacking up; spread detunes each play', () => {
  const { run, audio, ctx } = boot();
  run(`defineSound('rattle', { limit: 2, layers: [{ tone: 200, dur: .5 }] }); defineSound('tick', { gap: .1, layers: [{ tone: 300, dur: .05 }] });
       defineSound('vary', { spread: .1, layers: [{ tone: 1000, dur: .05 }] }); Sfx.init()`);
  assert.deepEqual([1, 2, 3, 4].map(() => run("Sfx.play('rattle')")), [true, true, false, false], 'two at once');
  ctx().currentTime = 1; assert.equal(run("Sfx.play('rattle')"), true, 'room again once they are over');
  assert.deepEqual([run("Sfx.play('tick')"), run("Sfx.play('tick')")], [true, false], 'the second one came too soon');
  ctx().currentTime = 1.2; assert.equal(run("Sfx.play('tick')"), true);
  const f = Array.from({ length: 16 }, () => { run("Sfx.play('vary')"); return audio.of('oscillator').at(-1).frequency.value; });
  assert.ok(f.every(x => x >= 900 && x <= 1100) && new Set(f).size > 10, 'within ±10% and not all the same');
});

test('place: pan follows how far left or right of the listener a sound is; a vacuum still lets distance fade it; air uses heard()', () => {
  const { run, audio } = boot();
  run('Sfx.init()');
  const at = (x, y) => run(`Sfx.place(${x}, ${y})`);
  assert.equal(at(200, 100).pan, 0, 'in front of the listener: centred');
  assert.ok(at(100, 100).pan < 0 && at(300, 100).pan > 0, 'left is negative, right is positive');
  assert.ok(Math.abs(at(400, 100).pan - .85) < 1e-9 && at(4000, 100).pan === at(400, 100).pan, 'at the edge of the screen and beyond: 85% to that side');
  const g = [0, 200, 600, 2000].map(d => at(200 + d, 100).gain);
  assert.equal(g[0], 1); assert.ok(g[0] > g[1] && g[1] > g[2] && g[2] > g[3], 'quieter the farther it is');
  assert.equal(at(200, 100).delay, 0, 'no air: it arrives at once');
  // with air: the delay and gain of heard()
  run('setAtmosphere(1)');
  const a = at(200 + 400, 100), h = run('Sfx.heard(600, 100)');
  assert.equal(a.gain, h.gain); assert.equal(a.delay, h.delay); assert.ok(a.delay > 0 && a.muffle < 1);
  run('setAtmosphere(0)');
  // GAME.listener moves the listener
  run('GAME.listener = () => [1000, 100]');
  assert.equal(at(1000, 100).pan, 0); assert.ok(at(200, 100).pan < 0);
  run('GAME.listener = null');
  // Sfx.play puts a panner between the sound and the bus, only when the sound is off to a side
  run("defineSound('beep', { tone: 500, dur: .1 })");
  const n = audio.of('stereopanner').length;
  run("Sfx.play('beep')"); run("Sfx.play('beep', { x: 200, y: 100 })");
  assert.equal(audio.of('stereopanner').length, n, 'centred, or with no place: no panner');
  run("Sfx.play('beep', { x: 60, y: 100 })");
  const p = audio.of('stereopanner').at(-1);
  assert.ok(p.pan.value < 0 && audio.reaches(p, run('Sfx.sfxBus')), 'panned left, into the effects bus');
  // a placed sound far away is quieter
  run("Sfx.play('beep', { x: 200, y: 100 })"); const near = audio.of('gain').at(-1).gain.events[0][1];
  run("Sfx.play('beep', { x: 1400, y: 100 })"); const far = audio.of('gain').at(-1).gain.events[0][1];
  assert.ok(far < near / 2, `far ${far.toFixed(4)} near ${near.toFixed(4)}`);
  // the old calls take a heard()/place() result as before, and now a pan too
  run('Sfx.tone(440, .1, .2, "square", 0, Sfx.place(60, 100))');
  assert.ok(audio.of('stereopanner').at(-1).pan.value < 0);
});

test('a cap on voices: a big blast cannot stack dozens of nodes; the quietest goes first', () => {
  const { run, audio } = boot();
  run('Sfx.init(); Sfx.maxVoices = 6');
  for (let i = 0; i < 6; i++) run(`Sfx.burst(2, 900, 40, ${.2 + i * .05}, 'lowpass', 1)`);   // the quietest is .2
  assert.equal(run('Sfx.voices.length'), 6);
  const srcs = audio.of('buffersource').length;
  run('Sfx.burst(2, 900, 40, .1)');   // quieter than all six: dropped
  assert.equal(audio.of('buffersource').length, srcs); assert.equal(run('Sfx.stats.dropped'), 1);
  run('Sfx.burst(2, 900, 40, .9)');   // louder: it takes the place of the quietest, which is cut at once
  assert.equal(run('Sfx.voices.length'), 6); assert.equal(run('Sfx.stats.stolen'), 1);
  const victim = audio.of('buffersource').filter(s => s.buffer === run('Sfx.noiseBuf') && s.stopped !== undefined)[0];
  assert.ok(victim.stopped < audio.ctx.currentTime + .05, 'the quietest voice was stopped');
  // a hundred thuds in one frame (a collapsing wall) end up as 6 voices
  for (let i = 0; i < 100; i++) run('Sfx.thud(10)');
  assert.ok(run('Sfx.voices.length') <= 6);
  const live = audio.of('buffersource').filter(s => s.buffer === run('Sfx.noiseBuf') && s.stopped > audio.ctx.currentTime + .1);
  assert.ok(live.length <= 6 + 1, `${live.length} noise sources still sounding`);
  // time passes: voices that ended free their places
  audio.ctx.currentTime = 10; run('Sfx.burst(.1, 900, 40, .1)'); assert.equal(run('Sfx.voices.length'), 1);
});

test('volumes and mute: music and effects separately, the master stays the constant it was, all remembered per game', () => {
  const store = new Map(), A = boot(store);
  assert.deepEqual(json(A.run('Sfx.getVolumes()')), { music: 1, sfx: 1, muted: false });
  A.run('Sfx.setVolumes({ music: .3, sfx: .6 })');        // before the audio has started: applied when it does
  A.run('Sfx.init()');
  assert.equal(A.run('Sfx.musicBus').gain.value, .3); assert.equal(A.run('Sfx.sfxBus').gain.value, .6); assert.equal(A.run('Sfx.master').gain.value, .5);
  A.run('Sfx.setVolumes({ sfx: .2 })');
  const ev = A.run('Sfx.sfxBus').gain.events.at(-1); assert.deepEqual([ev[0], ev[1]], ['target', .2]);
  assert.deepEqual(json(A.run('Sfx.getVolumes()')), { music: .3, sfx: .2, muted: false }, 'only the one named changes');
  A.run('Sfx.setVolumes({ music: 7, sfx: -1 })'); assert.deepEqual(json(A.run('Sfx.getVolumes()')), { music: 1, sfx: 0, muted: false }, 'clamped to 0..1');
  A.run('Sfx.setVolumes({ music: "loud" })'); assert.equal(A.run('Sfx.volumes.music'), 1, 'not a number: ignored');
  // mute: the master goes to 0 and comes back to .5
  A.run('Sfx.toggle()');
  assert.equal(A.run('Sfx.muted'), true); assert.deepEqual(A.run('Sfx.master').gain.events.at(-1).slice(0, 2), ['target', 0]);
  A.run('Sfx.toggle()'); assert.deepEqual(A.run('Sfx.master').gain.events.at(-1).slice(0, 2), ['target', .5]);
  A.run('Sfx.toggle(); Sfx.setVolumes({ music: .4, sfx: .9 })');
  // another page load of the same game: it is all there at the first input
  assert.match(store.get('harness.sound') ?? store.get('glyphite.sound'), /"muted":true/);
  const B = boot(store);
  B.run('Sfx.init()');
  assert.equal(B.run('Sfx.muted'), true, 'muted stays muted');
  assert.equal(B.run('Sfx.master').gain.value, 0); assert.equal(B.run('Sfx.musicBus').gain.value, .4); assert.equal(B.run('Sfx.sfxBus').gain.value, .9);
  // garbage in storage is ignored
  const C = boot(new Map([['glyphite.sound', '{"music":"x","sfx":5,"muted":"yes"}'], ['harness.sound', 'not json']]));
  assert.deepEqual(json(C.run('Sfx.getVolumes()')), { music: 1, sfx: 1, muted: false });
});

test('the saves are the game\'s own: another game id, another place in storage', () => {
  const store = new Map(), A = boot(store, "GAME.id = 'alpha';");
  A.run('Sfx.setVolumes({ music: .1 })');
  const B = boot(store, "GAME.id = 'beta';");
  assert.equal(B.run('Sfx.getVolumes().music'), 1);
  assert.ok(store.has('alpha.sound') && !store.has('beta.sound'));
});

test('the settings system (SETTINGS, part 16) and Sfx hold the same volumes and mute: its applySettings() calls work, and so do Sfx\'s own', () => {
  const { run, audio } = boot();
  run('Sfx.init()');
  // what part 16 does: assign muted, set the master by hand, hand over the volumes
  run('SETTINGS.music = .3; SETTINGS.sfx = .6; SETTINGS.mute = true; applySettings()');
  assert.deepEqual(json(run('Sfx.getVolumes()')), { music: .3, sfx: .6, muted: true });
  assert.equal(run('Sfx.muted'), true); assert.equal(run('Sfx.master').gain.value, 0, 'its own write to Sfx.master.gain.value is the last word');
  assert.deepEqual(run('Sfx.sfxBus').gain.events.at(-1).slice(0, 2), ['target', .6]);
  run('setSetting("mute", false)'); assert.equal(run('Sfx.muted'), false);
  assert.deepEqual(run('Sfx.master').gain.events.at(-1).slice(0, 2), ['target', .5]);
  // and the other way: Sfx's own calls show up in the settings (and are kept there)
  run('Sfx.setVolumes({ music: .9 }); Sfx.toggle()');
  assert.equal(run('SETTINGS.music'), .9); assert.equal(run('SETTINGS.mute'), true); assert.equal(run('SETTINGS.sfx'), .6);
  assert.match(run("localStorage.getItem('glyphite.settings')"), /"music":0.9/);
  // assigning muted mutes at once, even before a setting is changed
  run('Sfx.muted = false'); assert.equal(run('Sfx.master').gain.events.at(-1)[1], .5);
  // a page load: applySettings() runs before the first input, with the volumes from the last visit; the sound starts with them
  const store = new Map([['glyphite.settings', JSON.stringify({ music: .2, sfx: .4, mute: true })]]);
  const B = boot(store);
  B.run('loadSettings(); applySettings()');
  B.run('Sfx.init()');
  assert.equal(B.run('Sfx.musicBus').gain.value, .2); assert.equal(B.run('Sfx.sfxBus').gain.value, .4); assert.equal(B.run('Sfx.master').gain.value, 0);
});
