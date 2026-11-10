// The SOUND STUDIO's songs API (worker/songs.js) over a real SQLite standing in for D1, and the Sampler's song format.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleSongs, SONG_MAX } from '../../worker/songs.js';
import worker from '../../worker/index.js';
import { d1, skip } from './d1.mjs';

const ROOT = new URL('../../', import.meta.url);
const Sampler = new Function(`${readFileSync(new URL('engine/13_sampler.js', ROOT), 'utf8')}; return Sampler;`)();
const SONG = { format: 'pixelite-song', title: 'Cargo bay', bpm: 100, tracks: [{ instrument: 'strings', notes: [[0, 96, 60, 100]] }] };
let env;
beforeEach(() => { env = { DB: skip ? null : d1() }; });
const user = { email: 'me@example.com' };
const call = (method, path, body, headers = { 'X-Pixelite': '1' }) =>
  handleSongs(new Request(`https://pixelite.hornbaek.org${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env, user);

test('a song is saved, listed, read back and deleted', { skip }, async () => {
  let r = await call('PUT', '/api/songs/cargo-bay', { song: SONG, game: 'spacemouse' });
  assert.equal(r.status, 200);
  const { updated_at } = await r.json();
  const items = (await (await call('GET', '/api/songs')).json()).items;
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].id, items[0].title, items[0].game, items[0].updated_by], ['cargo-bay', 'Cargo bay', 'spacemouse', 'me@example.com']);
  const one = await (await call('GET', '/api/songs/cargo-bay')).json();
  assert.deepEqual(one.song, SONG); assert.equal(one.updated_at, updated_at);
  assert.equal((await call('DELETE', '/api/songs/cargo-bay')).status, 200);
  assert.equal((await call('GET', '/api/songs/cargo-bay')).status, 404);
});

test('saving over a song changed elsewhere since it was opened is refused (409), with base it is not', { skip }, async () => {
  const { updated_at } = await (await call('PUT', '/api/songs/x', { song: SONG })).json();
  assert.equal((await call('PUT', '/api/songs/x', { song: { ...SONG, bpm: 90 } })).status, 409, 'no base: someone else\'s song');
  assert.equal((await call('PUT', '/api/songs/x', { song: { ...SONG, bpm: 90 }, base: 'old' })).status, 409);
  const r = await call('PUT', '/api/songs/x', { song: { ...SONG, bpm: 90 }, base: updated_at });
  assert.equal(r.status, 200);
  assert.equal((await (await call('GET', '/api/songs/x')).json()).song.bpm, 90);
});

test('bad requests are refused and change nothing', { skip }, async () => {
  const cases = [
    [call('PUT', '/api/songs/x', { song: SONG }, {}), 403],
    [call('DELETE', '/api/songs/x', undefined, {}), 403],
    [call('PUT', '/api/songs/Bad_Id', { song: SONG }), 400],
    [call('PUT', '/api/songs/x', 'not json'), 400],
    [call('PUT', '/api/songs/x', { song: { title: 'no format' } }), 400],
    [call('PUT', '/api/songs/x', { song: SONG, game: '../etc' }), 400],
    [call('PUT', '/api/songs/x', { song: { ...SONG, pad: 'x'.repeat(SONG_MAX) } }), 413],
    [call('POST', '/api/songs'), 405]
  ];
  for (const [p, want] of cases) assert.equal((await p).status, want);
  assert.deepEqual((await (await call('GET', '/api/songs')).json()).items, []);
});

test('the Worker serves the songs API only to a signed-in user', { skip }, async () => {
  const res = await worker.fetch(new Request('http://localhost:8787/api/songs/demo', { method: 'PUT', headers: { 'X-Pixelite': '1' }, body: JSON.stringify({ song: SONG }) }), { ...env, DEV_EMAIL: 'dev@example.com' });
  assert.equal(res.status, 200);
  const anon = await worker.fetch(new Request('https://glyphite.hornbaek.org/api/songs'), { ...env, ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal(anon.status, 401);
});

test('Sampler.check fills in a song and keeps only valid notes, sorted', () => {
  const s = Sampler.check({ format: 'pixelite-song', bpm: 999, tracks: [{ instrument: 'nope', notes: [[96, 48, 64, 90], [0, 96, 60, 300], ['x'], [10, 0, 62, 50]] }] });
  assert.equal(s.bpm, 300); assert.equal(s.tracks[0].instrument, 'piano');
  assert.deepEqual(s.tracks[0].notes, [[0, 96, 60, 127], [10, 1, 62, 50], [96, 48, 64, 90]]);
  assert.equal(s.master.echo.fir, 'soft'); assert.equal(s.tracks[0].eq.midFreq, 1000);
  assert.throws(() => Sampler.check({ tracks: [] }), /not a Pixelite song/);
  assert.deepEqual(Sampler.check(Sampler.check(SONG)), Sampler.check(SONG), 'checking twice changes nothing');
});

test('Sampler: the envelope rises, settles at the sustain level, and fades after release', () => {
  const E = { a: .1, d: .3, s: .5, sd: 0, r: .4 };
  assert.equal(Sampler.envAt(E, 1, .05, Infinity), .5);
  assert.ok(Math.abs(Sampler.envAt(E, 1, 2, Infinity) - .5) < 1e-3);
  const atOff = Sampler.envAt(E, 1, 1, Infinity);
  assert.ok(Sampler.envAt(E, 1, 1.1, 1) < atOff && Sampler.envAt(E, 1, 2, 1) < .01);
  assert.ok(Sampler.envAt({ ...E, sd: .5 }, 1, 2, Infinity) < .1, 'with a fall it dies away while held');
});

test('Sampler: BRR keeps a sine to within a few percent (the console\'s 4-bit grit, not noise)', () => {
  const x = Float32Array.from({ length: 3200 }, (_, i) => Math.sin(i / 5) * .8), y = Sampler.brr(x);
  let err = 0; for (let i = 1; i < 3199; i++) err = Math.max(err, Math.abs(.16 * x[i - 1] + .68 * x[i] + .16 * x[i + 1] - y[i]));
  assert.ok(err < .03, err);
});

test('every game\'s songs.js is what tools/song.mjs makes from its music/*.song.json, and the files are tidy', async () => {
  const { songsOf, songsJs, formatSong } = await import('../../tools/song.mjs');
  const { readdirSync } = await import('node:fs');
  for (const game of readdirSync(new URL('games/', ROOT))) {
    const songs = songsOf(game), js = new URL(`games/${game}/songs.js`, ROOT);
    if (!songs.length) continue;   // (Regolith's songs.js is its own: MIDI for the NES chip)
    assert.equal(readFileSync(js, 'utf8'), songsJs(game), `run: node tools/song.mjs ${game}`);
    for (const s of songs) assert.equal(readFileSync(s.file, 'utf8'), formatSong(s.song), `run: node tools/song.mjs ${game}`);
    assert.ok(JSON.parse(readFileSync(new URL(`games/${game}/game.json`, ROOT), 'utf8')).parts.includes('songs.js'), `${game}: songs.js is not in game.json's parts`);
  }
});

test('Space Mouse\'s Cargo Bay is a full song: every track has notes inside the song, every note an instrument can play', () => {
  const s = Sampler.check(JSON.parse(readFileSync(new URL('games/spacemouse/music/cargo-bay.song.json', ROOT), 'utf8')));
  assert.ok(s.tracks.length >= 4 && s.tracks.every(t => t.notes.length));
  const end = Sampler.songEnd(s);
  for (const t of s.tracks) for (const [at, len, note] of t.notes) {
    assert.ok(at >= 0 && at + len <= end, `${t.name}: a note past the end`);
    if (t.instrument === 'kit') assert.ok(Sampler.KIT[note], `${t.name}: no drum on note ${note}`);
  }
});

test('Sampler: BRR is real bytes (9 per 16 samples) that decode to what the encoder heard, and survive base64', () => {
  const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * .7), bytes = Sampler.brrEncode(x);
  assert.equal(bytes.length, Math.ceil(1000 / 16) * 9);
  assert.deepEqual(Array.from(Sampler.brrDecode(bytes)), Array.from(Sampler.brr(x)));
  assert.deepEqual(Array.from(Sampler.fromB64(Sampler.toB64(bytes))), Array.from(bytes));
  for (let b = 0; b < bytes.length; b += 9) assert.ok((bytes[b] >> 4) <= 12, 'a shift the console has');
});

test('Sampler.check keeps a song\'s own samples and places, and drops what is not one', () => {
  const brr = Sampler.toB64(Sampler.brrEncode(new Float32Array(320).fill(.1)));
  const s = Sampler.check({ format: 'pixelite-song', places: { title: true, levels: [2, 0, 2, -1, 'x', 200], note: 'boss' },
    samples: { hum: { name: 'Hum', rate: 16000, root: 61.25, loop: 37, brr }, 'Bad id': { brr }, empty: { brr: '' }, junk: { brr: 'not base64!' } },
    tracks: [{ instrument: 'sample:hum' }, { instrument: 'sample:gone' }] });
  assert.deepEqual(s.places, { title: true, levels: [0, 2], note: 'boss' });
  assert.deepEqual(Object.keys(s.samples), ['hum']);
  assert.deepEqual([s.samples.hum.rate, s.samples.hum.root, s.samples.hum.loop], [16000, 61.25, 32], 'the loop starts on a block');
  assert.deepEqual(s.tracks.map(t => t.instrument), ['sample:hum', 'piano']);
  assert.deepEqual(Sampler.check(s), s, 'checking twice changes nothing');
});

test('tools/song.mjs: SONG_AT says which song plays where; the first song (by id) claiming a place has it', async () => {
  const { songPlaces } = await import('../../tools/song.mjs');
  const song = places => ({ format: 'pixelite-song', places, tracks: [] });
  assert.deepEqual(songPlaces([
    { id: 'a-theme', song: song({ title: true, levels: [0, 1] }) },
    { id: 'b-boss', song: song({ levels: [1, 2] }) },
    { id: 'c-jingle', song: song({ note: 'when you win' }) }]),
  { title: 'a-theme', levels: { 0: 'a-theme', 1: 'a-theme', 2: 'b-boss' }, other: ['c-jingle'] });
});

test('Sampler: tempo changes map ticks to seconds and back; lanes interpolate; check keeps them sane', () => {
  const s = Sampler.check({ format: 'pixelite-song', bpm: 120, tempo: [[384, 60], [0, 90], [768, 999], ['x', 1]],
    tracks: [{ auto: { volume: [[96, 2], [0, .5], [96, .25]], pan: [[0, -3]], filter: 'no' }, sound: { glide: 5 } }] });
  assert.deepEqual(s.tempo, [[384, 60], [768, 300]], 'tick 0 is the song\'s bpm; bpm clamped');
  assert.deepEqual(s.tracks[0].auto, { volume: [[0, .5], [96, .25]], pan: [[0, -1]], filter: [] }, 'one point per tick, the last given wins');
  assert.equal(s.tracks[0].sound.glide, 2);
  assert.equal(Sampler.secAt(s, 384), 2); assert.equal(Sampler.secAt(s, 480), 3); assert.equal(Sampler.secAt(s, -96), -.5, 'a count-in, at the opening tempo');
  for (const k of [-48, 0, 200, 384, 500, 900]) assert.ok(Math.abs(Sampler.tickAt(s, Sampler.secAt(s, k)) - k) < 1e-9, `round trip at ${k}`);
  assert.deepEqual([Sampler.bpmAt(s, 0), Sampler.bpmAt(s, 384), Sampler.bpmAt(s, 1000)], [120, 60, 300]);
  const L = [[96, 0], [192, 1]];
  assert.deepEqual([Sampler.laneAt(L, 0), Sampler.laneAt(L, 144), Sampler.laneAt(L, 500), Sampler.laneAt([], 5)], [0, .5, 1, null]);
});

// ---- loops of their own end, crossfades, multisamples, curves, tempo ramps, more lanes ----
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);

test('Sampler: a tempo ramp glides linearly in ticks; seconds are its integral, ticks its inverse, and the tempo in between is the line', () => {
  const s = Sampler.check({ format: 'pixelite-song', bpm: 120, tempo: [[384, 60, 1], [768, 180, 1], [1000, 100], [1500, 50, 0]] });
  assert.deepEqual(s.tempo, [[384, 60, 1], [768, 180, 1], [1000, 100], [1500, 50]], 'only a ramp keeps its flag');
  near(Sampler.secAt(s, 384), 384 * 60 / 96 / 60 * Math.log(2) * 1, 1e-9, 'a glide from 120 to 60 over 4 beats'); near(Sampler.secAt(s, 384), 2.772588722, 1e-6, 'ln 2 · 4 beats');
  near(Sampler.bpmAt(s, 192), 90, 1e-9, 'halfway along the ramp'); assert.equal(Sampler.bpmAt(s, 384), 60); near(Sampler.bpmAt(s, 576), 120, 1e-9, 'the second ramp, halfway'); assert.equal(Sampler.bpmAt(s, 1200), 100);
  for (const k of [-96, 0, 100, 384, 600, 768, 900, 1000, 1400, 2000]) near(Sampler.tickAt(s, Sampler.secAt(s, k)), k, 1e-6, `round trip at ${k}`);
  // faster at the end of a ramp up: the second half of an accelerando takes less time than the first
  const up = Sampler.check({ format: 'pixelite-song', bpm: 60, tempo: [[384, 180, 1]] });
  assert.ok(Sampler.secAt(up, 192) > Sampler.secAt(up, 384) - Sampler.secAt(up, 192));
  assert.equal(Sampler.check({ format: 'pixelite-song', bpm: 120, tempo: [[96, 90, 1]] }).tempo[0][2], 1);
});

test('Sampler: a lane\'s curve bends the segment that arrives at its point; the engine ramps through it in 1/8-beat pieces', () => {
  const s = Sampler.check({ format: 'pixelite-song', tracks: [{ auto: { volume: [[0, 0], [96, 1, .5], [192, 0, -1], [288, 1, 7], [300, 1, 0]] } }] });
  assert.deepEqual(s.tracks[0].auto.volume, [[0, 0], [96, 1, .5], [192, 0, -1], [288, 1, 1], [300, 1]], 'bend clamped to ±1, zero not kept');
  const v = s.tracks[0].auto.volume;
  near(Sampler.laneAt(v, 48), Math.pow(.5, 2.5), 1e-9, 'a positive bend waits, then rushes'); near(Sampler.laneAt(v, 144), Math.pow(.5, 4), 1e-9, 'a negative bend rushes, then settles');
  const got = []; Sampler.laneRamp(v, 0, 96, (at, val) => got.push([at, val]));
  assert.deepEqual(got.map(g => g[0]), [12, 24, 36, 48, 60, 72, 84], 'a curved segment is cut every 1/8 beat (a window is open at both ends: the point at 96 belongs to the next one)');
  near(got[3][1], Sampler.laneAt(v, 48), 1e-12, 'on the curve');
  const mid = []; Sampler.laneRamp(v, 50, 130, (at, val) => mid.push(at)); assert.deepEqual(mid, [60, 72, 84, 96, 108, 120], 'only what is in the window, and starting on the 12-tick steps');
  const straight = []; Sampler.laneRamp([[0, 0], [96, 1]], -1, 200, (at) => straight.push(at)); assert.deepEqual(straight, [0, 96], 'a straight line needs only its points');
});

test('Sampler.check: the echo, reverb, pitch and loop lanes and the echo\'s own lanes exist only when they have points, so older songs read the same', () => {
  const old = Sampler.check({ format: 'pixelite-song', tracks: [{ auto: { volume: [[0, 1]], echo: [], reverb: 'no', pitch: [['x', 1]], loop: [] } }], auto: { echo: [], feedback: [] } });
  assert.deepEqual(old.tracks[0].auto, { volume: [[0, 1]], pan: [], filter: [] }); assert.equal(old.auto, undefined); assert.equal(old.multis, undefined);
  const s = Sampler.check({ format: 'pixelite-song', auto: { echo: [[0, 2], [96, .1, .5]], feedback: [[0, -5]] }, tracks: [{ auto: { echo: [[0, 1]], reverb: [[0, -1]], pitch: [[0, 40], [96, -40]], loop: [[0, 3]] } }] });
  assert.deepEqual(s.tracks[0].auto, { volume: [], pan: [], filter: [], echo: [[0, 1]], reverb: [[0, 0]], pitch: [[0, 12], [96, -12]], loop: [[0, 1]] }, 'values clamped to each lane\'s range');
  assert.deepEqual(s.auto, { echo: [[0, 1], [96, .1, .5]], feedback: [[0, -.95]] }); assert.deepEqual(Sampler.check(s), s, 'checking twice changes nothing');
});

test('Sampler.check: a sample\'s own loop end and crossfade are kept when they make sense; multisamples are zones over the song\'s samples', () => {
  const brr = Sampler.toB64(Sampler.brrEncode(new Float32Array(640).fill(.1))), mk = sm => Sampler.check({ format: 'pixelite-song', samples: { a: { brr, ...sm } } }).samples.a;
  assert.deepEqual([mk({ loop: 160, loopEnd: 500 }).loopEnd, mk({ loop: 160, loopEnd: 500 }).xfade], [496, undefined], 'on a block');
  for (const bad of [{ loop: 160, loopEnd: 170 }, { loop: 160, loopEnd: 640 }, { loop: 160, loopEnd: 9999 }, { loop: -1, loopEnd: 400 }, { loop: 160, loopEnd: 'x' }]) assert.equal(mk(bad).loopEnd, undefined, JSON.stringify(bad));
  assert.equal(mk({ loop: 160, xfade: 99999 }).xfade, 160, 'no longer than what is before the loop'); assert.equal(mk({ loop: 160, loopEnd: 208, xfade: 99999 }).xfade, 24, 'nor half the loop');
  assert.equal(mk({ loop: -1, xfade: 20 }).xfade, undefined, 'a crossfade needs a loop'); assert.equal(mk({ loop: 160, xfade: .4 }).xfade, undefined);
  const s = Sampler.check({ format: 'pixelite-song', samples: { a: { brr }, b: { brr, root: 72 } },
    multis: { m: { name: 'Two', zones: [{ sample: 'a', lo: 60, hi: 0 }, { sample: 'b', lo: 61, hi: 500 }, { sample: 'gone', lo: 0, hi: 9 }, { lo: 1 }] }, empty: { zones: [{ sample: 'gone', lo: 0, hi: 9 }] }, 'Bad id': { zones: [{ sample: 'a', lo: 0, hi: 9 }] } },
    tracks: [{ instrument: 'multi:m' }, { instrument: 'multi:empty' }, { instrument: 'multi:nope' }] });
  assert.deepEqual(s.multis, { m: { name: 'Two', zones: [{ sample: 'a', lo: 0, hi: 60 }, { sample: 'b', lo: 61, hi: 127 }] } }, 'ranges put in order and clamped; zones of missing samples dropped; a multisample with none is gone');
  assert.deepEqual(s.tracks.map(t => t.instrument), ['multi:m', 'piano', 'piano']); assert.deepEqual(Sampler.check(s), s);
});

test('Sampler: a crossfade makes the end of a loop flow into its start, and a loop end makes the sound after it unreachable', () => {
  const x = Float32Array.from({ length: 640 }, (_, i) => Math.sin(i / 9) * .6), bytes = Sampler.brrEncode(x);
  const jump = d => Math.abs(d[639] - d[160]), plain = Sampler.brrDecode(bytes, 160), faded = Sampler.brrDecode(bytes, 160, 0, 80);
  assert.ok(jump(plain) > .3 && jump(faded) < .05, `the seam jumps ${jump(plain).toFixed(3)} without a crossfade, ${jump(faded).toFixed(3)} with one`);
  const short = Sampler.brrDecode(bytes, 160, 480, 60);
  assert.ok(Math.abs(short[479] - short[160]) < .05, 'the loop ends at 480 now, and flows round from there');
  assert.deepEqual(Array.from(Sampler.brrDecode(bytes, -1, 480, 60)), Array.from(Sampler.brrDecode(bytes)), 'no loop: neither a loop end nor a crossfade does anything');
  assert.deepEqual(Array.from(Sampler.brrDecode(bytes, 160, 9999, 0)), Array.from(plain), 'a loop end past the sound is no loop end');
  // outside the faded stretch the sound is untouched
  for (let i = 0; i < 560; i += 37) assert.equal(faded[i], plain[i]);
  assert.deepEqual([Sampler.loopStep(0), Sampler.loopStep(.5), Sampler.loopStep(1), Sampler.loopStep(7)], [0, 8, 15, 15], 'a loop lane picks one of 16 starts');
  const sm = { brr: Sampler.toB64(bytes), loop: 160, loopEnd: 480 };
  assert.deepEqual([0, 7, 15].map(s => Sampler.loopAtStep(sm, s)), [0, 208, 448], 'on blocks, never nearer than two blocks to the loop end');
});
