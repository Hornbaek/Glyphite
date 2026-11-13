// MIDI files in the SOUND STUDIO (portal/assets/midi-core.mjs): the reader on files built byte by byte (so it is not only tested
// against our own writer), the writer, a round trip of the songs the games ship, and the real files Regolith plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Sampler as S } from '../../tools/song.mjs';
import { readMidi, songFromMidi, midiFromSong, GM_TO_INSTRUMENT, INSTRUMENT_TO_GM } from '../../portal/assets/midi-core.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));

// ---- a tiny Standard MIDI File builder: events are [delta ticks, ...bytes] ----
const vlq = n => { const o = [n & 127]; while ((n >>>= 7) > 0) o.unshift((n & 127) | 128); return o; };
const u32 = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));
const trk = (...evs) => { const body = evs.flatMap(([dt, ...b]) => [...vlq(dt), ...b]).concat([0, 0xFF, 0x2F, 0]); return [...ascii('MTrk'), ...u32(body.length), ...body]; };
const smf = (div, tracks, format = 1) => Uint8Array.from([...ascii('MThd'), 0, 0, 0, 6, 0, format, 0, tracks.length, div >> 8, div & 255, ...tracks.flat()]);
const meta = (type, ...data) => [0xFF, type, data.length, ...data];
const tempo = bpm => { const us = Math.round(6e7 / bpm); return meta(0x51, us >> 16, (us >> 8) & 255, us & 255); };
const name = s => meta(0x03, ...ascii(s));
const on = (ch, n, v = 100) => [0x90 | ch, n, v], off = (ch, n) => [0x80 | ch, n, 64], prog = (ch, p) => [0xC0 | ch, p], cc = (ch, c, v) => [0xB0 | ch, c, v];
const read1 = (bytes, opts) => songFromMidi(bytes, S, opts);

test('a file built by hand: tempo and time signature maps, running status, note-on at velocity 0, names, a General MIDI program', () => {
  const bytes = smf(480, [
    trk([0, ...name('My tune')], [0, ...meta(0x58, 3, 2, 24, 8)], [0, ...tempo(120)], [1920, ...tempo(150)]),
    trk([0, ...name('Violin')], [0, ...prog(0, 40)], [0, ...cc(2, 7, 100)], [0, ...prog(2, 48)], [0, ...on(0, 60, 100)], [480, 60, 0], [0, 62, 90], [480, 62, 0])   // the last four use running status
  ]);
  const { song, warnings, info } = read1(bytes);
  assert.deepEqual(warnings, []);
  assert.equal(song.title, 'My tune'); assert.equal(song.bpm, 120); assert.equal(song.beatsPerBar, 3);
  assert.deepEqual(song.tempo, [[384, 150]], 'a change at beat 4 of a 480 ticks-a-beat file is tick 384 of ours');
  assert.equal(song.tracks.length, 1, 'a channel that only sets a program and a volume is not a track'); assert.equal(song.tracks[0].name, 'Violin'); assert.equal(song.tracks[0].instrument, 'strings');
  assert.deepEqual(song.tracks[0].notes, [[0, 96, 60, 100], [96, 96, 62, 90]]);
  assert.equal(song.bars, 2); assert.deepEqual([info.tracks, info.notes], [1, 2]);
  assert.deepEqual(info.candidates, [{ index: 0, name: 'Violin', instrument: 'strings', channel: 1, notes: 2 }]);
  assert.equal(song.loop.on, false);
});

test('time is scaled from the file\'s ticks to ours, whatever the division', () => {
  for (const div of [96, 192, 480, 960]) {
    const { song } = read1(smf(div, [trk([0, ...on(0, 60)], [div, ...off(0, 60)], [div, ...on(0, 62)], [div * 2, ...off(0, 62)])]));
    assert.deepEqual(song.tracks[0].notes.map(n => n.slice(0, 2)), [[0, 96], [192, 192]], `division ${div}`);
  }
});

test('channel 10 is the drum kit; General MIDI drums the kit lacks play the nearest it has, and the rest are left out and said so', () => {
  const { song, warnings } = read1(smf(96, [trk([0, ...on(9, 36)], [96, ...off(9, 36)], [0, ...on(9, 55)], [96, ...off(9, 55)], [0, ...on(9, 82)], [96, ...off(9, 82)], [0, ...on(9, 80)], [96, ...off(9, 80)], [0, ...on(9, 38)], [1, ...off(9, 38)])]));
  const t = song.tracks[0];
  assert.equal(t.instrument, 'kit'); assert.equal(t.name, 'Drums');
  assert.deepEqual(t.notes.map(n => n[2]), [36, 57, 70, 38], 'splash → crash 2, shaker → shaker, the triangle has no sound');
  assert.ok(t.notes.every(n => n[1] >= 12), 'a one-tick hit is made long enough to see and click in the piano roll');
  assert.ok(warnings.some(w => /left out: 80/.test(w)), warnings);
});

test('the sustain pedal keeps notes ringing until it is released, and a key struck again under it ends the held note', () => {
  const { song } = read1(smf(96, [trk([0, ...cc(0, 64, 127)], [0, ...on(0, 60)], [96, ...off(0, 60)], [96, ...on(0, 60, 80)], [96, ...off(0, 60)], [0, ...on(0, 64)], [96, ...off(0, 64)], [96, ...cc(0, 64, 0)])]));
  const n = song.tracks[0].notes;
  assert.deepEqual(n.map(x => [x[0], x[1], x[2]]), [[0, 192, 60], [192, 288, 60], [288, 192, 64]]);
});

test('same-pitch notes that overlap are paired first in, first out', () => {
  const { song } = read1(smf(96, [trk([0, ...on(0, 60, 90)], [48, ...on(0, 60, 70)], [48, ...off(0, 60)], [96, ...off(0, 60)])]));
  assert.deepEqual(song.tracks[0].notes, [[0, 96, 60, 90], [48, 144, 60, 70]], 'the first note-off ends the first note');
});

test('a program change in the middle starts another track; volume and pan the file sets are kept; several channels are several tracks', () => {
  const { song } = read1(smf(96, [trk(
    [0, ...cc(0, 7, 64)], [0, ...cc(0, 10, 127)], [0, ...prog(0, 73)], [0, ...on(0, 72)], [96, ...off(0, 72)],
    [0, ...prog(0, 56)], [0, ...on(0, 67)], [96, ...off(0, 67)], [0, ...prog(1, 33)], [0, ...on(1, 40)], [96, ...off(1, 40)])]));
  assert.deepEqual(song.tracks.map(t => t.instrument), ['flute', 'trumpet', 'fingerbass']);
  assert.equal(song.tracks[0].name.startsWith('Flute'), true);
  assert.ok(Math.abs(song.tracks[0].volume - 64 / 127) < 1e-9 && song.tracks[0].pan === 1);
});

test('loop markers, a file that ends early, a file with more instruments than a song holds, a file that is too long', () => {
  let r = read1(smf(96, [trk([0, ...meta(0x06, ...ascii('loopStart'))], [0, ...on(0, 60)], [384, ...off(0, 60)], [0, ...meta(0x06, ...ascii('loopEnd'))])]));
  assert.deepEqual(r.song.loop, { on: true, start: 0, end: 384 });
  const whole = smf(96, [trk([0, ...on(0, 60)], [96, ...off(0, 60)], [0, ...on(0, 62)], [96, ...off(0, 62)])]);
  r = read1(whole.subarray(0, whole.length - 9));   // cut inside the last events
  assert.ok(r.warnings.some(w => /ends early/.test(w)) && r.song.tracks[0].notes.length >= 1, r.warnings);
  r = read1(smf(96, [0, 1, 2].map(t => trk(...Array.from({ length: 14 }, (_, c) => [0, ...on(c, 50 + c, 100)]), [96, ...off(0, 50)]))));   // 3 MIDI tracks of 14 channels
  assert.equal(r.song.tracks.length, 32); assert.ok(r.warnings.some(w => /32 with the most notes/.test(w)), r.warnings);
  r = read1(smf(96, [trk([0, ...on(0, 60)], [96, ...off(0, 60)], [96 * 4 * 600, ...on(0, 62)], [96, ...off(0, 62)])]));
  assert.equal(r.song.bars, 512); assert.ok(r.warnings.some(w => /cut/.test(w)), r.warnings);
});

test('what is not a usable file says so in a sentence, and mangled files never hang or crash the reader', () => {
  assert.throws(() => read1(Uint8Array.from(ascii('this is not midi, but it is long enough'))), /not a MIDI file/);
  assert.throws(() => read1(new Uint8Array(3)), /not a MIDI file/);
  assert.throws(() => read1(Uint8Array.from([...ascii('MThd'), 0, 0, 0, 6, 0, 1, 0, 1, 0xE7, 0x28, ...trk()])), /SMPTE/);
  assert.throws(() => read1(smf(96, [trk([0, ...name('empty')])])), /no notes/);
  const good = smf(480, [trk([0, ...tempo(100)], [0, ...name('x')]), trk([0, ...prog(0, 4)], [0, ...on(0, 60)], [480, ...off(0, 60)], [0, ...on(9, 36)], [10, ...off(9, 36)])]);
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  for (let i = 0; i < 400; i++) {
    const b = Uint8Array.from(good);
    for (let k = 0, n = 1 + Math.floor(rnd() * 6); k < n; k++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
    const bytes = rnd() < .3 ? b.subarray(0, Math.floor(rnd() * b.length)) : b;
    try { const { song } = read1(bytes); S.check(song); } catch (e) { assert.ok(e instanceof Error && !(e instanceof RangeError) && !(e instanceof TypeError), `${e.name}: ${e.message}`); }
  }
});

test('every General MIDI program is an instrument the Sampler has, and every instrument can be written and read back as itself', () => {
  const ids = new Set(S.INSTRUMENTS.map(i => i.id));
  assert.equal(GM_TO_INSTRUMENT.length, 128);
  for (const id of ids) if (id !== 'kit') assert.ok(id in INSTRUMENT_TO_GM, `${id} has a General MIDI program`);
  for (const p of Object.values(INSTRUMENT_TO_GM)) assert.ok(Number.isInteger(p) && p >= 0 && p < 128);
  for (let p = 0; p < 128; p++) {
    const ins = read1(smf(96, [trk([0, ...prog(0, p)], [0, ...on(0, 60)], [96, ...off(0, 60)])])).song.tracks[0].instrument;
    assert.ok(ids.has(ins) && ins !== 'kit', `program ${p} → ${ins}`);
  }
  for (const id of ids) {
    const song = S.check({ format: 'pixelite-song', tracks: [{ name: 'T', instrument: id, notes: [[0, 96, id === 'kit' ? 36 : 60, 100]] }] });
    const { bytes } = midiFromSong(song, S);
    assert.equal(read1(bytes).song.tracks[0].instrument, id);
    if (id !== 'kit') assert.ok(readMidi(bytes).tracks[1].events.some(e => e.k === 'prog' && e.a === INSTRUMENT_TO_GM[id]));
  }
});

// ---- round trips ----
function sameSong(a, b, label) {
  assert.equal(b.title, a.title, label); assert.equal(b.bpm, a.bpm, label); assert.equal(b.beatsPerBar, a.beatsPerBar, label);
  assert.equal(b.bars, a.bars, label); assert.deepEqual(b.tempo, a.tempo, label); assert.deepEqual(b.loop, a.loop, label);
  assert.equal(b.tracks.length, a.tracks.length, label);
  a.tracks.forEach((t, i) => {
    const u = b.tracks[i];
    assert.equal(u.name, t.name, `${label}: name of track ${i}`); assert.equal(u.instrument, t.instrument, `${label}: ${t.name}`);
    assert.deepEqual(u.notes, t.notes, `${label}: notes of ${t.name}`);
    assert.ok(Math.abs(u.volume - t.volume) <= 1 / 127 / 2 + 1e-9 && Math.abs(u.pan - t.pan) <= 1 / 63 / 2 + 1e-9, `${label}: volume and pan of ${t.name}`);
  });
}

test('the songs the games ship survive a trip through a MIDI file: every note, name, instrument, tempo, loop', () => {
  for (const f of readdirSync(new URL('games/spacemouse/music/', ROOT)).filter(f => f.endsWith('.song.json'))) {
    const song = S.check(JSON.parse(read(`games/spacemouse/music/${f}`).toString()));
    const { bytes } = midiFromSong(song, S);
    sameSong(song, read1(bytes).song, f);
  }
});

test('tempo changes, three-beat bars and tracks beyond one MIDI channel survive too; things a MIDI file cannot hold are said so', () => {
  const song = S.check({ format: 'pixelite-song', title: 'Waltz', bpm: 90, beatsPerBar: 3, bars: 4, tempo: [[288, 120], [576, 75]], loop: { on: true, start: 288, end: 864 },
    tracks: Array.from({ length: 18 }, (_, i) => ({ name: `T${i}`, instrument: i === 17 ? 'kit' : ['piano', 'flute', 'saw'][i % 3], volume: .3 + i / 40, pan: (i - 9) / 10,
      notes: [[i * 24, 48, i === 17 ? 38 : 50 + i, 60 + i], [288 + i, 96, i === 17 ? 36 : 40 + i, 90]], auto: i === 0 ? { volume: [[0, 1], [100, .5]], filter: [[0, .2], [96, .9]] } : undefined })) });
  song.tracks.push({ ...S.check({ format: 'pixelite-song', tracks: [{}] }).tracks[0], name: 'Mine', instrument: 'sample:boing', notes: [[0, 24, 60, 100]] });
  const { bytes, warnings } = midiFromSong(song, S);
  assert.ok(warnings.some(w => /a sample the song does not hold/.test(w)) && warnings.some(w => /share a MIDI channel/.test(w)), warnings);
  assert.ok(warnings.some(w => /filter, echo, reverb and loop-point lanes/.test(w)), warnings);
  assert.ok(!warnings.some(w => /volume/.test(w)), 'a volume lane is in the file now, so it is not reported as left out');
  const back = read1(bytes).song;
  assert.equal(back.bpm, 90); assert.deepEqual(back.tempo, [[288, 120], [576, 75]]); assert.equal(back.beatsPerBar, 3); assert.deepEqual(back.loop, song.loop);
  assert.deepEqual(back.tracks.slice(0, 18).map(t => t.notes), song.tracks.slice(0, 18).map(t => t.notes));
  assert.equal(back.tracks[18].instrument, 'piano', 'a sample track is written as a piano');
});

test('a track written here keeps its place with no notes in it (the instrument, volume and pan too)', () => {
  const song = S.check({ format: 'pixelite-song', title: 'Sketch', bars: 2, tracks: [
    { name: 'Lead', instrument: 'saw', notes: [[0, 96, 72, 100]] }, { name: 'Pad to come', instrument: 'pad', volume: .35, pan: -.4 }, { name: 'Drums to come', instrument: 'kit', volume: .45 }] });
  const back = read1(midiFromSong(song, S).bytes).song;
  assert.deepEqual(back.tracks.map(t => [t.name, t.instrument, t.notes.length]), [['Lead', 'saw', 1], ['Pad to come', 'pad', 0], ['Drums to come', 'kit', 0]]);
  assert.ok(Math.abs(back.tracks[1].volume - .35) < .005 && Math.abs(back.tracks[1].pan + .4) < .01);
});

test('the engine\'s own MIDI reader (the NES chip\'s) reads what we write: same notes, same tempo', () => {
  const parseMidi = new Function(`${read('engine/08_chip.js')}; return parseMidi;`)();
  const song = S.check(JSON.parse(read('games/spacemouse/music/escape-velocity.song.json').toString()));
  const f = parseMidi(midiFromSong(song, S).bytes.buffer);   // (bytes is a Uint8Array.from(...) of its own, so .buffer is exactly the file)
  assert.equal(f.notes, song.tracks.reduce((n, t) => n + t.notes.length, 0));
  assert.equal(f.div, 96); assert.equal(f.channels, song.tracks.length); assert.equal(f.name, song.title);
  assert.ok(Math.abs(f.dur - S.secAt(song, song.bars * 384)) < .01, `${f.dur} vs ${S.secAt(song, song.bars * 384)}`);
});

test('the MIDI files Regolith plays (made elsewhere) become songs the Sampler accepts', () => {
  for (const f of readdirSync(new URL('games/regolith/music/', ROOT)).filter(f => f.endsWith('.mid'))) {
    const { song, info } = read1(read(`games/regolith/music/${f}`), { name: f });
    assert.ok(info.tracks >= 3 && info.notes > 10, `${f}: ${JSON.stringify(info)}`);
    assert.ok(song.tracks.some(t => t.instrument === 'kit'), `${f}: drums`);
    assert.deepEqual(S.check(song), song, `${f}: a song the Sampler would change is a song with a mistake in it`);
    const chip = new Function(`${read('engine/08_chip.js')}; return parseMidi;`)()(new Uint8Array(read(`games/regolith/music/${f}`)).buffer);
    assert.ok(Math.abs(song.bpm - 6e7 / chip.tempos[chip.tempos.length > 1 ? 1 : 0].us) < 1, `${f}: tempo agrees with the engine's reader`);
  }
});

// ---- pitch bend, volume and pan that move, tempo ramps, a choice of instruments, the song's own samples ----
const bend = (ch, v14) => [0xE0 | ch, v14 & 127, v14 >> 7];
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);

test('pitch bend becomes the track\'s pitch lane, in the range the file\'s sensitivity message sets (2 semitones when it sets none)', () => {
  const file = rpn => smf(96, [trk([0, ...name('x')]), trk([0, ...prog(0, 80)], ...(rpn ? [[0, ...cc(0, 101, 0)], [0, ...cc(0, 100, 0)], [0, ...cc(0, 6, 12)]] : []),
    [0, ...on(0, 60)], [96, ...bend(0, 12288)], [96, ...bend(0, 8192)], [192, ...off(0, 60)])]);
  const wide = read1(file(true)).song.tracks[0].auto.pitch, narrow = read1(file(false)).song.tracks[0].auto.pitch;
  assert.deepEqual(wide.map(p => p[0]), [0, 96, 192]); near(wide[1][1], 6, .001, 'a quarter of the way up a 12-semitone range'); near(wide[2][1], 0, .001, 'centred again');
  near(narrow[1][1], 1, .001, 'the same bend over the default 2 semitones');
  const drums = read1(smf(96, [trk([0, ...on(9, 36)], [96, ...bend(9, 12288)], [96, ...off(9, 36)])])).song.tracks[0];
  assert.equal(drums.auto.pitch, undefined, 'a drum kit is not bent');
  assert.equal(read1(smf(96, [trk([0, ...on(0, 60)], [96, ...bend(0, 8192)], [96, ...off(0, 60)])])).song.tracks[0].auto.pitch, undefined, 'a bend wheel left in the middle is no lane');
});

test('volume (CC 7 with CC 11 on top) and pan that move while the notes play become lanes; a controller is a step, a quick run of them a sweep', () => {
  const { song, warnings } = read1(smf(96, [trk([0, ...name('x')]), trk([0, ...cc(0, 7, 100)], [0, ...cc(0, 10, 64)], [0, ...on(0, 60)], [192, ...cc(0, 7, 50)], [0, ...cc(0, 10, 96)], [8, ...cc(0, 10, 112)], [8, ...cc(0, 10, 127)], [176, ...off(0, 60)])]));
  const t = song.tracks[0];
  near(t.volume, 100 / 127, 1e-9, 'the volume is the loudest the channel gets');
  assert.deepEqual(t.auto.volume.map(p => p[0]), [0, 191, 192], 'held until just before the change');
  assert.deepEqual(t.auto.volume.map(p => Math.round(p[1] * 100) / 100), [1, 1, .5]);
  assert.equal(t.pan, 0); assert.deepEqual(t.auto.pan.map(p => p[0]), [0, 191, 192, 200, 208]);
  near(t.auto.pan[4][1], 1, 1e-9, 'hard right'); assert.ok(warnings.some(w => /2 volume, pan and pitch-bend lanes/.test(w)), warnings);
  assert.deepEqual(S.check(song), song, 'lanes the Sampler would change would be a mistake');
  // a volume that never moves stays a plain number, with no lane
  const flat = read1(smf(96, [trk([0, ...cc(0, 7, 90)], [0, ...on(0, 60)], [96, ...cc(0, 7, 90)], [96, ...off(0, 60)])])).song.tracks[0];
  assert.deepEqual(flat.auto.volume, []); near(flat.volume, 90 / 127, 1e-9, 'flat volume');
});

test('the volume, pan and pitch lanes of a song survive a trip through a MIDI file (curves too), and the file says what it leaves out', () => {
  const song = S.check({ format: 'pixelite-song', title: 'Lanes', bpm: 100, bars: 1, tracks: [{ name: 'Lead', instrument: 'saw', volume: .8, notes: [[0, 384, 60, 100]],
    auto: { volume: [[0, 1], [192, .3, .5], [384, .9]], pan: [[0, -1], [384, 1]], pitch: [[0, 0], [96, 2], [192, -1.5, -.4], [288, 0]], echo: [[0, 0], [96, 1]] } }] });
  const { bytes, warnings } = midiFromSong(song, S), back = read1(bytes).song.tracks[0], was = song.tracks[0];
  assert.ok(warnings.some(w => /echo/.test(w)) && !warnings.some(w => /pitch|pan/.test(w.replace(/loop-point/, ''))), warnings);
  near(back.volume, .8, .01, 'volume');
  for (let k = 0; k <= 384; k += 12) {
    near(S.laneAt(back.auto.volume, k), S.laneAt(was.auto.volume, k), .02, `volume lane at ${k}`);
    near(S.laneAt(back.auto.pan, k), S.laneAt(was.auto.pan, k), .02, `pan lane at ${k}`);
    near(S.laneAt(back.auto.pitch, k), S.laneAt(was.auto.pitch, k), .08, `pitch lane at ${k} (within 8 cents: events every 1/16 note straighten a sharp curve a little)`);
  }
  assert.equal(back.auto.echo, undefined);
});

test('a tempo ramp is written as an even run of tempo events and read back as one ramp', () => {
  const song = S.check({ format: 'pixelite-song', title: 'Ramp', bpm: 120, bars: 8, tempo: [[384, 60, 1], [768, 120], [1152, 90, 1]], tracks: [{ notes: [[0, 96, 60, 100]] }] });
  const { bytes } = midiFromSong(song, S), back = read1(bytes).song;
  assert.deepEqual(back.tempo, song.tempo); assert.equal(back.bpm, 120);
  for (const k of [100, 384, 500, 800, 1000, 1200]) near(S.secAt(back, k), S.secAt(song, k), .005, `time at tick ${k}`);
  // events another program wrote, 48 ticks apart on a straight line, are a ramp as well; a few steps spread far apart are not
  const evs = [[0, ...tempo(100)]]; for (let i = 1; i <= 8; i++) evs.push([48, ...tempo(100 + i * 5)]);
  const ramp = read1(smf(96, [trk(...evs, [0, ...name('t')]), trk([0, ...on(0, 60)], [480, ...off(0, 60)])])).song;
  assert.deepEqual(ramp.tempo, [[384, 140, 1]]);
  const steps = read1(smf(96, [trk([0, ...tempo(100)], [384, ...tempo(120)], [384, ...tempo(140)]), trk([0, ...on(0, 60)], [1000, ...off(0, 60)])])).song;
  assert.deepEqual(steps.tempo, [[384, 120], [768, 140]]);
});

test('a file with several instruments says which it holds; "only" opens some, and the song is only as long as what was opened', () => {
  const bytes = smf(96, [trk([0, ...name('Mix')], [0, ...tempo(120)]),
    trk([0, ...name('Long pad')], [0, ...prog(0, 88)], [0, ...on(0, 48)], [384 * 4, ...off(0, 48)]),
    trk([0, ...name('Blip')], [0, ...prog(1, 80)], [0, ...on(1, 72)], [96, ...off(1, 72)]),
    trk([0, ...on(9, 36)], [24, ...off(9, 36)])]);
  const all = read1(bytes);
  assert.deepEqual(all.info.candidates.map(c => [c.index, c.name, c.instrument, c.notes]), [[0, 'Long pad', 'pad', 1], [1, 'Blip', 'square', 1], [2, 'Drums', 'kit', 1]]);
  assert.equal(all.song.bars, 4);
  const some = read1(bytes, { only: [1, 2] });
  assert.deepEqual(some.song.tracks.map(t => t.name), ['Blip', 'Drums']); assert.equal(some.song.bars, 1, 'the long pad is not in the song, so the song is short');
  assert.deepEqual(some.info.candidates, all.info.candidates, 'the list is always of the whole file');
  assert.throws(() => read1(bytes, { only: [] }), /no instrument was chosen/);
  assert.throws(() => read1(bytes, { only: [7] }), /no instrument was chosen/);
});

test('the song\'s own samples and multisamples travel inside the MIDI file; other programs get a pad (looping) or a marimba', () => {
  const brr = S.toB64(S.brrEncode(Float32Array.from({ length: 640 }, (_, i) => Math.sin(i / 9) * .6)));
  const song = S.check({ format: 'pixelite-song', title: 'Own', bars: 2,
    samples: { boing: { name: 'Boing', rate: 16000, root: 62.5, loop: 160, loopEnd: 480, xfade: 40, brr }, tick: { name: 'Tick', root: 70, brr }, spare: { brr } },
    multis: { m: { name: 'Two-part', zones: [{ sample: 'boing', lo: 0, hi: 59 }, { sample: 'tick', lo: 60, hi: 127 }] } },
    tracks: [{ name: 'Sprong', instrument: 'sample:boing', notes: [[0, 96, 60, 100]] }, { name: 'Both', instrument: 'multi:m', notes: [[0, 96, 50, 100], [96, 96, 80, 100]] }, { name: 'Plain', instrument: 'piano', notes: [[0, 96, 60, 100]] }] });
  const { bytes, warnings } = midiFromSong(song, S);
  assert.ok(warnings.some(w => /2 track\(s\) play the song's own samples/.test(w)), warnings);
  const m = readMidi(bytes);
  assert.deepEqual(m.extras.map(x => x.pixelite + ':' + x.id).sort(), ['multi:m', 'sample:boing', 'sample:tick'], 'what the tracks use, and nothing else');
  const progs = m.tracks.slice(1).map(t => (t.events.find(e => e.k === 'prog') || {}).a);
  assert.deepEqual(progs, [89, 89, 0], 'looping sample → pad; the multisample takes its first zone\'s; the piano is a piano');
  const back = read1(bytes).song;
  assert.deepEqual(back.tracks.map(t => [t.name, t.instrument]), [['Sprong', 'sample:boing'], ['Both', 'multi:m'], ['Plain', 'piano']]);
  assert.deepEqual(back.samples, { boing: song.samples.boing, tick: song.samples.tick }); assert.deepEqual(back.multis, song.multis);
  assert.deepEqual(read1(bytes, { only: [2] }).song.samples, {}, 'a song opened without the tracks that play a sample holds no sample');
  const parseMidi = new Function(`${read('engine/08_chip.js')}; return parseMidi;`)();
  assert.equal(parseMidi(bytes.buffer).notes, 4, 'the NES chip\'s reader skips the sample events and reads the notes');
});

// ---- patterns, clips and drum kits (the song's own) ----
test('a song built of clips is written as the notes they play', () => {
  const song = S.check({ format: 'pixelite-song', title: 'Clips', bars: 4, patterns: { beat: { len: 192, notes: [[0, 24, 36, 120], [96, 24, 38, 100]] } },
    tracks: [{ name: 'Drums', instrument: 'kit', notes: [[0, 24, 49, 127]], clips: [{ at: 0, p: 'beat', len: 576, off: 0 }] }] });
  const back = read1(midiFromSong(song, S).bytes).song;
  assert.deepEqual(back.tracks[0].notes, S.notesOf(song, song.tracks[0]), 'the file holds what the clips play');
  assert.ok(!back.patterns && !back.tracks[0].clips, 'and nothing else of them: a MIDI file has no clips');
  assert.equal(back.tracks[0].notes.length, 7);
});

test('a drum kit of the song\'s own travels in the file: its pads, their samples and the notes they sit on', () => {
  const brr = S.toB64(S.brrEncode(Float32Array.from({ length: 800 }, (_, i) => Math.sin(i * .2) * Math.exp(-i / 300) * .6)));
  const song = S.check({ format: 'pixelite-song', title: 'Kit', bars: 2, samples: { boing: { name: 'Boing', rate: 16000, root: 60, loop: -1, brr } },
    kits: { mine: { name: 'Mine', pads: [{ note: 60, sample: 'boing', tune: 3, level: 1.5, pan: -.4, choke: 2 }, { note: 61, sound: 'snare', tune: -2, level: .8, pan: .3, choke: 0 }] } },
    tracks: [{ name: 'Pads', instrument: 'drums:mine', volume: .6, notes: [[0, 24, 60, 100], [48, 24, 61, 90], [96, 24, 60, 70]] },
    { name: 'Bass', instrument: 'fingerbass', notes: [[0, 96, 36, 100]] }] });
  const { bytes, warnings } = midiFromSong(song, S);
  assert.ok(warnings.some(w => /own samples/.test(w)), warnings);
  const trackBytes = readMidi(bytes).tracks[1];
  assert.ok(trackBytes.events.every(e => e.ch === 9), 'on channel 10, where other programs put drums');
  const back = read1(bytes).song;
  assert.equal(back.tracks[0].instrument, 'drums:mine'); assert.equal(back.tracks[0].name, 'Pads');
  assert.deepEqual(back.tracks[0].notes, song.tracks[0].notes, 'pad notes are not mapped onto General MIDI drums: they stay where they were');
  assert.deepEqual(back.kits, song.kits); assert.deepEqual(back.samples, song.samples);
  const without = read1(bytes, { only: [1] }).song;
  assert.ok(!without.kits, 'a song opened without the track that plays a kit does not hold it');
  const plain = S.check({ format: 'pixelite-song', kits: { k: S.newKit() }, tracks: [{ instrument: 'drums:k', notes: [[0, 24, 36, 100]] }] });
  assert.ok(!midiFromSong(plain, S).warnings.some(w => /own samples/.test(w)), 'a kit of built-in sounds holds no samples to warn about');
  assert.deepEqual(read1(midiFromSong(plain, S).bytes).song.kits, plain.kits);
});
