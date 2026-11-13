// Patterns, clips and drum kits in the Sampler (engine/13_sampler.js): what check() keeps, the notes a clip plays (looped, trimmed, cut,
// swung), a song with clips scheduled exactly like the same song written out as notes, and a kit of the song's own sounds: its pads' tune,
// level, pan and choke groups, and what making them again costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Sampler as S } from '../../tools/song.mjs';
import { loadEngine } from './engine-harness.mjs';
import { makeAudio } from './audio-mock.mjs';

const song = (o = {}) => S.check({ format: 'pixelite-song', bpm: 120, bars: 8, ...o });
const PAT = (o = {}) => ({ name: 'Beat', len: 96, notes: [[0, 24, 36, 100], [48, 24, 38, 100]], ...o });
const notes = (s, i = 0) => S.notesOf(s, s.tracks[i]).map(n => n.slice(0, 3));

test('songs without patterns, clips or kits come out of check() exactly as before', () => {
  for (const g of readdirSync(new URL('../../games', import.meta.url))) {
    let files = []; try { files = readdirSync(new URL(`../../games/${g}/music`, import.meta.url)).filter(f => f.endsWith('.song.json')); } catch { }
    for (const f of files) {
      const c = S.check(JSON.parse(readFileSync(new URL(`../../games/${g}/music/${f}`, import.meta.url), 'utf8')));
      assert.ok(!('patterns' in c) && !('kits' in c) && c.tracks.every(t => !('clips' in t)), `${g}/${f}: no new fields appear by themselves`);
    }
  }
  const t = { name: 'T', instrument: 'piano', notes: [[0, 96, 60, 100]] };
  assert.equal(S.notesOf(song({ tracks: [t] }), song({ tracks: [t] }).tracks[0]).length, 1);
  const one = song({ tracks: [t] }); assert.equal(S.notesOf(one, one.tracks[0]), one.tracks[0].notes, 'no clips: the track\'s own list');
});

test('check(): patterns, clips and kits are made sane, and what cannot work is dropped', () => {
  const s = S.check({ format: 'pixelite-song', bars: 4, samples: { thump: { name: 'Thump', rate: 16000, root: 60, loop: -1, brr: 'AAAAAAAAAAAA' } },
    patterns: {
      a: { name: 'A', len: 96, notes: [[0, 500, 36, 100], [96, 24, 38, 100], [40.6, 10, 200, 0], [-5, 24, 40, 100]], swing: 5, color: '#ABCDEF' },
      b: { len: 99999999, notes: [], swing: 0, color: 'red' }, 'Bad Id': PAT(), c: null, d: { len: 0 }
    },
    kits: { k: { name: 'K', pads: [
      { note: 36, sound: 'kick', tune: 99, level: 9, pan: -3, choke: 99 }, { note: 36, sound: 'snare' }, { note: 38, sample: 'thump' }, { note: 40, sample: 'gone' },
      { note: 41, sound: 'banjo' }, { note: 300, sound: 'tom' }, { sound: 'hat' }, null] }, 'no kit': { pads: [] }, empty: { pads: [] } },
    tracks: [
      { instrument: 'kit', clips: [{ at: 10.4, p: 'a', len: 99999999, off: 500 }, { at: 0, p: 'nope', len: 10 }, { at: 5, p: 'a', len: 0.2 }, { at: 'x', p: 'a', len: 5 }, { at: -9, p: 'b', len: 48 }] },
      { instrument: 'drums:k' }, { instrument: 'drums:nokit' }, { instrument: 'drums:' }
    ] });
  assert.deepEqual(Object.keys(s.patterns), ['a', 'b', 'd'], 'a bad id, a null and nothing else are dropped; an empty pattern is a pattern');
  assert.deepEqual(s.patterns.a.notes, [[0, 96, 36, 100], [0, 24, 40, 100], [41, 10, 127, 1]], 'a note is cut at the pattern\'s end, one starting outside it dropped, a start before 0 is 0, values brought into range, as a track\'s notes are');
  assert.equal(s.patterns.a.swing, .75); assert.equal(s.patterns.a.color, '#abcdef');
  assert.equal(s.patterns.b.len, 64 * 4 * 96, 'at most 64 bars'); assert.ok(!('swing' in s.patterns.b) && !('color' in s.patterns.b));
  assert.equal(s.patterns.d.len, 4 * 96, 'no length: a bar of 4/4');
  assert.deepEqual(s.tracks[0].clips, [{ at: 0, p: 'b', len: 48, off: 0 }, { at: 5, p: 'a', len: 1, off: 0 }, { at: 10, p: 'a', len: 512 * 12 * 96, off: 95 }],
    'sorted, whole numbers, a clip of a pattern that is not there dropped, the offset inside the pattern, a clip no longer than the longest song');
  assert.deepEqual(s.kits.k.pads, [
    { note: 36, sound: 'kick', tune: 24, level: 2, pan: -1, choke: 8 }, { note: 38, sample: 'thump', tune: 0, level: 1, pan: 0, choke: 0 }, { note: 127, sound: 'tom', tune: 0, level: 1, pan: 0, choke: 0 }],
    'a note once, a sample that is there or a sound that is real; a note out of range is brought into it, as a track\'s notes are');
  assert.deepEqual(Object.keys(s.kits), ['k']);
  assert.deepEqual(s.tracks.map(t => t.instrument), ['kit', 'drums:k', 'kit', 'kit'], 'a track on a kit that is not there plays the built-in one');
  assert.deepEqual(S.check(JSON.parse(JSON.stringify(s))), s, 'checking again changes nothing');
  const many = S.check({ format: 'pixelite-song', patterns: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`p${i}`, PAT()])) });
  assert.equal(Object.keys(many.patterns).length, 256);
});

test('a clip plays its pattern again and again from where it starts, and stops where it ends', () => {
  const p = PAT();
  assert.deepEqual(notes(song({ patterns: { b: p }, tracks: [{ instrument: 'kit', clips: [{ at: 192, p: 'b', len: 384, off: 0 }] }] })),
    [192, 240, 288, 336, 384, 432, 480, 528].map((x, i) => [x, 24, i % 2 ? 38 : 36]), 'four repeats of a beat: eight notes');
  assert.deepEqual(notes(song({ patterns: { b: p }, tracks: [{ instrument: 'kit', clips: [{ at: 0, p: 'b', len: 100, off: 0 }] }] })).map(n => n[0]), [0, 48, 96], 'a clip cut inside the pattern: the note after its end is not played');
  const long = song({ patterns: { b: { len: 96, notes: [[0, 96, 60, 100]] } }, tracks: [{ clips: [{ at: 0, p: 'b', len: 60, off: 0 }] }] });
  assert.equal(S.notesOf(long, long.tracks[0])[0][1], 60, 'a note that runs past the clip is cut at the clip\'s end');
});

test('a trimmed start (off) skips what came before it, and the repeats begin from the pattern\'s start', () => {
  const s = song({ patterns: { b: PAT() }, tracks: [{ instrument: 'kit', clips: [{ at: 100, p: 'b', len: 96, off: 48 }] }] });
  assert.deepEqual(notes(s).map(n => n[0]), [100, 148], 'the note at 48 of the pattern plays at the clip start, then the pattern comes round');
  const t = song({ patterns: { b: PAT() }, tracks: [{ instrument: 'kit', clips: [{ at: 100, p: 'b', len: 96, off: 49 }] }] });
  assert.deepEqual(notes(t).map(n => n[0]), [147, 195], 'a note that began before the start of a trimmed clip (at 99) is not played; the next round of the pattern is');
});

test('loose notes and clips play together, clips may overlap, and notesOf is in time order', () => {
  const s = song({ patterns: { b: PAT({ notes: [[0, 24, 60, 100]] }) }, tracks: [{ notes: [[50, 10, 61, 90], [0, 10, 62, 90]],
    clips: [{ at: 0, p: 'b', len: 96, off: 0 }, { at: 0, p: 'b', len: 96, off: 0 }, { at: 96, p: 'b', len: 96, off: 0 }] }] });
  assert.deepEqual(notes(s), [[0, 24, 60], [0, 24, 60], [0, 10, 62], [50, 10, 61], [96, 24, 60]].sort((a, b) => a[0] - b[0] || a[2] - b[2]));
});

test('swing delays the notes on the off-beat 16ths and no others', () => {
  const sixteenths = [0, 24, 48, 72].map(at => [at, 12, 42, 100]);
  const s = song({ patterns: { b: { len: 96, notes: sixteenths, swing: .5 } }, tracks: [{ instrument: 'kit', clips: [{ at: 0, p: 'b', len: 192, off: 0 }] }] });
  assert.deepEqual(notes(s).map(n => n[0]), [0, 36, 48, 84, 96, 132, 144, 180], 'the 2nd and 4th 16th of every beat 12 ticks late (half of a 16th)');
});

test('windows of ticks tile: asking for the notes of [a, b) piece by piece gives exactly the notes of the whole', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  for (let round = 0; round < 40; round++) {
    const patterns = { x: { len: 96 + Math.floor(rnd() * 200), notes: Array.from({ length: 6 }, () => [Math.floor(rnd() * 90), 1 + Math.floor(rnd() * 150), 36 + Math.floor(rnd() * 8), 80]), swing: rnd() < .5 ? .3 : 0 },
      y: { len: 24, notes: [[0, 10, 50, 90], [12, 5, 51, 90]] } };
    const clips = Array.from({ length: 4 }, () => ({ at: Math.floor(rnd() * 900), p: rnd() < .5 ? 'x' : 'y', len: 1 + Math.floor(rnd() * 700), off: Math.floor(rnd() * 90) }));
    const s = song({ bars: 16, patterns, tracks: [{ clips }] }), whole = S.notesOf(s, s.tracks[0]).map(n => n.join());
    const got = []; let a = 0;
    while (a < 2000) { const b = a + 1 + Math.floor(rnd() * 130); S.clipNotes(s, s.tracks[0], a, b, (at, len, note, vel) => { assert.ok(at >= a && at < b, 'a note outside its window'); got.push([at, len, note, vel].join()); }); a = b; }
    assert.deepEqual(got.sort(), whole.slice().sort(), `round ${round}`);
  }
});

// ---- scheduled for real, on the recording Web Audio ----
const boot = () => {
  const audio = makeAudio(), E = loadEngine({ audio, now: () => performance.now() });
  E.ctx.__later = f => queueMicrotask(f); E.ctx.atob = globalThis.atob;   // (the page has atob; the harness's context has not)
  E.run('Sampler.build.later = __later; Sampler.init(new window.AudioContext(), null);');
  return { E, audio, ctx: audio.ctx, run: E.run };
};
// play a song to its end by hand (the page's timer is stubbed): every note's start (s), pitch (a frequency multiplier) and loudness
function schedule(s) {
  const { E, audio, ctx, run } = boot();
  E.ctx.__song = s; run('Sampler.prepare(__song)'); run('Sampler.play(__song, { loop: false })');
  for (let i = 0; i < 400 && run('Sampler.playing'); i++) { ctx.currentTime += .1; run('Sampler.pump()'); }
  const voices = audio.of('buffersource').filter(n => n.started !== undefined).map(n => {
    const g = n.out[0], peak = g.gain.events.find(e => e[0] === 'lin');
    return { t: n.started, rate: n.playbackRate.value, peak: peak ? peak[1] : 0, src: n, g, buffer: n.buffer, pan: g.out[0] && g.out[0].kind === 'stereopanner' ? g.out[0].pan.value : 0 };
  });
  const t0 = Math.min(...voices.map(v => v.t));   // the scheduler starts a song a little ahead of the clock
  for (const v of voices) { v.t -= t0; v.stop = v.src.stopped - t0; }
  return { voices: voices.sort((a, b) => a.t - b.t || a.rate - b.rate || a.peak - b.peak), run, audio, ctx, E };
}
const key = v => `${v.t.toFixed(4)} ${v.rate.toFixed(5)} ${v.peak.toFixed(5)}`;

test('a song with clips is scheduled exactly like the same song written out as notes', () => {
  const patterns = { beat: { len: 192, swing: .25, notes: [[0, 24, 36, 120], [48, 24, 42, 70], [96, 24, 38, 110], [120, 24, 42, 70], [168, 24, 46, 90]] },
    riff: { len: 96, notes: [[0, 48, 60, 100], [48, 48, 67, 80]] } };
  const a = song({ bars: 4, patterns, tracks: [
    { instrument: 'kit', notes: [[0, 24, 49, 127]], clips: [{ at: 0, p: 'beat', len: 576, off: 0 }, { at: 576, p: 'beat', len: 200, off: 24 }] },
    { instrument: 'square', clips: [{ at: 96, p: 'riff', len: 300, off: 0 }] }] });
  const b = song({ bars: 4, tracks: a.tracks.map(t => ({ instrument: t.instrument, notes: S.notesOf(a, t) })) });
  assert.ok(!b.patterns && b.tracks.every(t => !t.clips));
  const A = schedule(a).voices, B = schedule(b).voices;
  assert.ok(A.length > 12, `${A.length} voices`);
  assert.deepEqual(A.map(key), B.map(key));
});

// ---- a kit of the song's own sounds ----
const THUMP = () => ({ name: 'Thump', rate: 16000, root: 60, loop: -1, brr: S.toB64(S.brrEncode(Float32Array.from({ length: 1600 }, (_, i) => Math.sin(i * .2) * Math.exp(-i / 400) * .6))) });
const kitSong = (pads, extra = {}) => song({ bars: 2, samples: { thump: THUMP() }, kits: { k: { name: 'K', pads } },
  tracks: [{ instrument: 'drums:k', notes: [[0, 24, 36, 100]], ...extra }] });

test('a pad plays its sample, tuned, as loud as it is set, and panned', () => {
  const pads = (o = {}) => [{ note: 36, sample: 'thump', tune: 12, level: 1, pan: 0, choke: 0, ...o }];
  const full = schedule(kitSong(pads())).voices[0], half = schedule(kitSong(pads({ level: .5, pan: -.5 }))).voices[0];
  assert.ok(full && half, 'the pad sounds');
  assert.equal(full.rate, 2, 'tuned up an octave');
  assert.ok(Math.abs(half.peak / full.peak - .5) < 1e-9, `level .5 is half the loudness (${half.peak / full.peak})`);
  const d = full.buffer.getChannelData(0); let mx = 0; for (const v of d) mx = Math.max(mx, Math.abs(v));
  assert.ok(Math.abs(mx * full.peak / (Math.pow(100 / 127, 1.5) * 1.2) - .9) < .01, 'a pad\'s sample is brought to the loudness of the built-in sounds before its level');
  assert.equal(full.pan, 0); assert.equal(half.pan, -.5, 'a panner of its own');
  assert.ok(half.src.buffer === full.src.buffer || half.buffer.length === full.buffer.length);
});

test('a built-in sound on a pad, the beat pulse, and a missing sample that makes no sound and no error', () => {
  const s = kitSong([{ note: 36, sound: 'kick', tune: 0, level: 1, pan: 0, choke: 0 }, { note: 38, sample: 'thump', tune: 0, level: 1, pan: 0, choke: 0 }]);
  s.tracks[0].notes.push([48, 24, 38, 100], [96, 24, 99, 100]);
  const r = schedule(s);
  assert.equal(r.voices.length, 2, 'a pad for 36 and 38; note 99 has no pad');
  assert.ok(r.run('Sampler.mix.hits.length') >= 2, 'the beat the visuals follow counts a kit of the song\'s own');
  const gone = kitSong([{ note: 36, sample: 'thump', tune: 0, level: 1, pan: 0, choke: 0 }]); delete gone.samples.thump;
  assert.equal(schedule(gone).voices.length, 0);
});

test('pads in one choke group cut each other: a closed hat ends an open one', () => {
  const hat = (note, sound, choke) => ({ note, sound, tune: 0, level: 1, pan: 0, choke });
  const s = kitSong([hat(42, 'hat', 1), hat(46, 'open', 1), hat(49, 'crash', 0)]);
  s.tracks[0].notes = [[0, 24, 46, 100], [0, 24, 49, 100], [48, 24, 42, 100], [48, 24, 49, 100]];   // in time order, as check() leaves them; the closed hat comes at .25 s, well before the open hat's own end (.5 s)
  const v = schedule(s).voices, open = v.find(x => x.t === 0 && x.buffer.duration > .3 && x.buffer.duration < .6), cutAt = v.find(x => Math.abs(x.t - .25) < 1e-6 && x.buffer.duration < .2).t;
  assert.ok(open && open.stop <= cutAt + .01, `the open hat stopped at ${open && open.stop}, the closed hat began at ${cutAt}`);
  const crash = v.filter(x => x.buffer.duration > 1.5);
  assert.ok(crash[0].stop > cutAt + .5 && open.stop < .5, 'a pad outside the group is left to ring; the open hat did not run out by itself');
});

test('turning a pad\'s tune, level, pan or choke makes nothing again; changing its sound does', async () => {
  const { E, run } = boot(), s = kitSong([{ note: 36, sound: 'kick', tune: 0, level: 1, pan: 0, choke: 0 }, { note: 38, sample: 'thump', tune: 0, level: 1, pan: 0, choke: 0 }]);
  E.ctx.__song = s;
  assert.equal(run('Sampler.ready(__song)'), false);
  await run('Sampler.prepare(__song)');
  assert.equal(run('Sampler.ready(__song)'), true);
  Object.assign(s.kits.k.pads[0], { tune: 7, level: .4, pan: .3, choke: 2 });
  assert.equal(run('Sampler.ready(__song)'), true, 'nothing to make');
  s.kits.k.pads[0].sound = 'snare';
  assert.equal(run('Sampler.ready(__song)'), false, 'a new sound is a new buffer');
  await run('Sampler.prepare(__song)');
  assert.equal(run('Sampler.ready(__song)'), true);
});

test('a new kit has 16 pads on General MIDI notes that all sound, and the kit of a track that is not a kit is not one', () => {
  const k = S.newKit('Mine');
  assert.equal(k.pads.length, 16); assert.equal(k.name, 'Mine');
  assert.deepEqual(S.check({ format: 'pixelite-song', kits: { m: k }, tracks: [{ instrument: 'drums:m' }] }).kits.m.pads, k.pads, 'check() keeps a new kit whole');
  assert.ok(S.isKit('kit') && S.isKit('drums:x') && !S.isKit('piano') && !S.isKit('sample:x'));
  assert.deepEqual(S.DRUM_KINDS.slice().sort(), ['clap', 'crash', 'hat', 'kick', 'open', 'ride', 'rim', 'shaker', 'snare', 'tom']);
});
