// MIDI files for the SOUND STUDIO, the CLI (tools/midi.mjs) and the tests: a Standard MIDI File → a Pixelite song, and a song → a
// file. No DOM; the Sampler (engine/13_sampler.js) is handed in, so the same code runs in the page and in Node.
// (The engine's own reader, parseMidi in engine/08_chip.js, is built for playing on the NES chip; this one is for editing: it keeps
// track names, time signatures, loop markers, the sustain pedal and the volume and pan a file sets.)
//
// What goes in: notes, the instrument (General MIDI program → the nearest Sampler instrument; channel 10 → the drum kit), each
// channel's volume (CC 7) and pan (CC 10), the sustain pedal (CC 64, held notes ring on), tempo changes, the first time
// signature, loop markers named loopStart / loopEnd, track names. What stays behind: pitch bends, other controllers, lyrics.
// What goes out: the same, plus the song's name, and the exact instrument in a text event ("pixelite:instrument=saw"), so a song
// written here and read back is the same song. Automation lanes, effects, EQ and a song's own samples are not in a MIDI file.

const PPQ = 96;   // the Sampler's ticks per beat
const MAX_BARS = 512, MAX_TRACKS = 32;

// ---------- General MIDI ----------
// program (0-127) → Sampler instrument
const GM_TO_INSTRUMENT = (() => {
  const t = new Array(128).fill('piano');
  const set = (a, b, id) => t.fill(id, a, b + 1);
  set(0, 3, 'piano'); set(4, 5, 'epiano'); set(6, 6, 'harp'); set(7, 7, 'epiano');                              // pianos, harpsichord, clavinet
  set(8, 10, 'bell'); set(11, 13, 'marimba'); set(14, 15, 'bell');                                              // chromatic percussion
  set(16, 21, 'organ'); set(22, 22, 'oboe'); set(23, 23, 'organ');                                              // organs, accordion, harmonica
  set(24, 28, 'guitar'); set(29, 30, 'overdrive'); set(31, 31, 'guitar');                                       // guitars
  set(32, 35, 'fingerbass'); set(36, 39, 'synthbass');                                                          // basses
  set(40, 44, 'strings'); set(45, 45, 'pizz'); set(46, 46, 'harp'); set(47, 47, 'fingerbass');                  // violin..contrabass, tremolo, pizzicato, harp, timpani
  set(48, 48, 'strings'); set(49, 51, 'slowstr'); set(52, 54, 'choir'); set(55, 55, 'brass');                   // ensembles, voices, orchestra hit
  set(56, 56, 'trumpet'); set(57, 58, 'brass'); set(59, 59, 'trumpet'); set(60, 63, 'brass');                   // brass
  set(64, 71, 'oboe'); set(72, 79, 'flute');                                                                    // reeds, pipes
  set(80, 80, 'square'); set(81, 81, 'saw'); set(82, 83, 'pulse'); set(84, 84, 'saw'); set(85, 85, 'choir'); set(86, 87, 'pulse');   // synth leads
  set(88, 103, 'pad');                                                                                          // synth pads and effects
  set(104, 106, 'guitar'); set(107, 107, 'harp'); set(108, 108, 'marimba'); set(109, 109, 'oboe'); set(110, 110, 'strings'); set(111, 111, 'oboe');   // ethnic
  set(112, 119, 'marimba'); set(112, 112, 'bell'); set(120, 127, 'pad');                                         // percussive, sound effects
  return t;
})();
// Sampler instrument → the program written to a file (the exact instrument travels in a text event as well)
const INSTRUMENT_TO_GM = { piano: 0, epiano: 4, organ: 19, bell: 9, marimba: 12, harp: 46, strings: 48, slowstr: 49, pizz: 45, choir: 52, brass: 61,
  trumpet: 56, flute: 73, oboe: 68, square: 80, saw: 81, pulse: 80, pad: 89, fingerbass: 33, synthbass: 38, guitar: 25, overdrive: 29 };
// General MIDI drum notes the kit has no sound for, played by the nearest one it has
const DRUM_ALIASES = { 52: 49, 53: 51, 55: 57, 56: 54, 58: 70, 60: 48, 61: 45, 62: 50, 63: 47, 64: 43, 65: 48, 66: 45, 67: 37, 68: 37, 69: 70,
  75: 37, 76: 37, 77: 37, 82: 70, 83: 54, 84: 54, 85: 39, 86: 41, 87: 41 };
const TAG = 'pixelite:instrument=';
export { GM_TO_INSTRUMENT, INSTRUMENT_TO_GM };

// ---------- reading ----------
// bytes → { div, tempos: [{ tick, bpm }], timeSigs: [{ tick, num, den }], markers: [{ tick, text }], tracks: [{ name, texts, end, events }], warnings }
// events are { tick, k: 'on' | 'off' | 'prog' | 'cc', ch, a, b } in file order. Lenient: a file that ends early gives what it holds.
export function readMidi(input) {
  const d = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings = [];
  const u16 = p => (d[p] << 8) | d[p + 1], u32 = p => ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0;
  const tag = p => String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]);
  if (d.length < 14 || tag(0) !== 'MThd') throw new Error('not a MIDI file (it does not start with "MThd")');
  const div = u16(12);
  if (div & 0x8000) throw new Error('this MIDI file counts time in SMPTE frames, not beats; only beat-timed files can be opened');
  if (!div) throw new Error('this MIDI file has no time division');
  const text = body => new TextDecoder().decode(body).replace(/[\x00-\x1f\x7f]/g, '').trim();
  const out = { div, tempos: [], timeSigs: [], markers: [], tracks: [], warnings };
  let p = 8 + Math.max(6, u32(4)), truncated = false;
  while (p + 8 <= d.length && out.tracks.length < 256) {
    const id = tag(p), len = u32(p + 4), start = p + 8, end = Math.min(d.length, start + len);
    if (start + len > d.length) truncated = true;
    p = start + len;
    if (id !== 'MTrk') continue;
    const trk = { name: '', texts: [], end: 0, events: [] };
    let q = start, tick = 0, status = 0;
    const vlq = () => { let v = 0; for (let i = 0; i < 4 && q < end; i++) { const b = d[q++]; v = v * 128 + (b & 127); if (!(b & 128)) break; } return v; };
    while (q < end) {
      tick += vlq();
      if (q >= end) break;
      if (d[q] & 0x80) status = d[q++]; else if (!status) { q++; continue; }   // running status needs a status to run on
      if (status === 0xFF) {
        const type = d[q++], len = vlq(), body = d.subarray(q, Math.min(end, q + len));
        q += len; status = 0;
        if (type === 0x51 && body.length === 3) out.tempos.push({ tick, bpm: 6e7 / ((body[0] << 16) | (body[1] << 8) | body[2]) });
        else if (type === 0x58 && body.length >= 2) out.timeSigs.push({ tick, num: body[0], den: 2 ** body[1] });
        else if (type === 0x03 && !trk.name) trk.name = text(body);
        else if (type === 0x01) trk.texts.push(text(body));
        else if (type === 0x06) out.markers.push({ tick, text: text(body) });
        else if (type === 0x2F) trk.end = Math.max(trk.end, tick);
      } else if (status === 0xF0 || status === 0xF7) { q += vlq(); status = 0; }
      else {
        const hi = status & 0xF0, ch = status & 15, n = hi === 0xC0 || hi === 0xD0 ? 1 : 2;
        if (q + n > end) { truncated = true; break; }
        const a = d[q++] & 127, b = n === 2 ? d[q++] & 127 : 0;
        if (hi === 0x90 && b > 0) trk.events.push({ tick, k: 'on', ch, a, b });
        else if (hi === 0x80 || hi === 0x90) trk.events.push({ tick, k: 'off', ch, a, b });
        else if (hi === 0xC0) trk.events.push({ tick, k: 'prog', ch, a, b });
        else if (hi === 0xB0 && (a === 7 || a === 10 || a === 64)) trk.events.push({ tick, k: 'cc', ch, a, b });
      }
      trk.end = Math.max(trk.end, tick);
    }
    out.tracks.push(trk);
  }
  if (truncated) warnings.push('the file ends early: what is in it was read');
  return out;
}

// ---------- a file → a song ----------
// S is the Sampler; opts: { title, name }. -> { song, warnings, info: { tracks, notes } }; throws a plain sentence for something that is not a usable file.
export function songFromMidi(input, S, opts = {}) {
  const m = readMidi(input), warnings = [...m.warnings], k = S.PPQ / m.div, T = t => Math.round(t * k);
  const ids = new Set(S.INSTRUMENTS.map(i => i.id)), nameOf = Object.fromEntries(S.INSTRUMENTS.map(i => [i.id, i.name]));
  const parts = new Map();   // "midi track:channel:program" → one Sampler track
  const skipped = new Set();
  let end = 0;
  m.tracks.forEach((trk, ti) => {
    const forced = trk.texts.map(t => t.startsWith(TAG) ? t.slice(TAG.length) : '').find(id => ids.has(id));
    // per channel: the program, the pedal, and the notes sounding by pitch. Notes of one pitch overlap now and then; each note-off ends
    // the one that began first (what most MIDI tools do), and `held` counts the note-offs the sustain pedal is holding back
    const chans = Array.from({ length: 16 }, () => ({ prog: 0, pedal: false, held: new Map(), open: new Map(), vol: null, pan: null }));
    const partOf = (ch, prog) => {
      const key = `${ti}:${ch}:${ch === 9 ? 'd' : prog}`;
      if (!parts.has(key)) parts.set(key, { ti, ch, ins: forced || (ch === 9 ? 'kit' : GM_TO_INSTRUMENT[prog]), vol: chans[ch].vol, pan: chans[ch].pan, notes: [] });
      return parts.get(key);
    };
    const close = (c, pitch, tick) => {
      const o = (c.open.get(pitch) || []).shift(); if (!o) return;
      let note = pitch;
      if (o.part.ins === 'kit') { note = S.KIT[pitch] ? pitch : DRUM_ALIASES[pitch]; if (!note) { skipped.add(pitch); return; } }
      const at = T(o.start), len = Math.max(T(tick) - at, o.part.ins === 'kit' ? 12 : 1);   // a one-tick drum hit is a speck in the piano roll
      o.part.notes.push([at, len, note, o.vel]); end = Math.max(end, at + len);
    };
    for (const e of trk.events) {
      const c = chans[e.ch];
      if (e.k === 'prog') c.prog = e.a;
      else if (e.k === 'on') {
        const n = c.held.get(e.a);
        if (n) { close(c, e.a, e.tick); n > 1 ? c.held.set(e.a, n - 1) : c.held.delete(e.a); }   // struck again under the pedal: the held one ends
        if (!c.open.has(e.a)) c.open.set(e.a, []);
        c.open.get(e.a).push({ part: partOf(e.ch, c.prog), start: e.tick, vel: e.b });
      } else if (e.k === 'off') {
        if (!(c.open.get(e.a) || []).length) continue;
        if (c.pedal) c.held.set(e.a, (c.held.get(e.a) || 0) + 1); else close(c, e.a, e.tick);
      } else if (e.a === 64) {
        c.pedal = e.b >= 64;
        if (!c.pedal) { for (const [pitch, n] of c.held) for (let i = 0; i < n; i++) close(c, pitch, e.tick); c.held.clear(); }
      } else if (e.a === 7) c.vol = e.b;
      else c.pan = e.b;
    }
    for (const c of chans) for (const [pitch, list] of c.open) while (list.length) close(c, pitch, trk.end);   // still sounding when the track ends
    // a track this studio wrote keeps its place even with no notes in it (the instrument tag says it is meant); a channel in another
    // program's file that has only controllers is not a track
    if (forced && ![...parts.values()].some(p => p.ti === ti)) {
      const c = chans.find(c => c.vol != null) || chans[0];
      parts.set(`${ti}:empty`, { ti, ch: forced === 'kit' ? 9 : 0, ins: forced, vol: c.vol, pan: c.pan, notes: [], keep: true });
    }
    end = Math.max(end, T(trk.end));
  });
  if (skipped.size) warnings.push(`drum notes with no sound in the kit were left out: ${[...skipped].sort((a, b) => a - b).join(', ')}`);

  // the song's own numbers: tempo, time signature, length, loop
  const tempos = m.tempos.slice().sort((a, b) => a.tick - b.tick);
  const bpm = tempos.length && tempos[0].tick === 0 ? tempos[0].bpm : 120;
  const tempo = []; let last = bpm;
  for (const t of tempos) if (t.tick > 0 && Math.abs(t.bpm - last) > 0.005) { tempo.push([T(t.tick), Math.round(t.bpm * 100) / 100]); last = t.bpm; }
  const ts = m.timeSigs.slice().sort((a, b) => a.tick - b.tick)[0];
  const beatsPerBar = ts ? Math.min(12, Math.max(1, Math.round(ts.num * 4 / ts.den))) : 4;
  if (m.timeSigs.some(t => t.num !== ts.num || t.den !== ts.den)) warnings.push('the time signature changes in the file; only the first is kept (bar lines may not match later on)');
  const barTicks = beatsPerBar * S.PPQ;
  if (!end) throw new Error('this MIDI file has no notes');
  let bars = Math.max(1, Math.ceil(end / barTicks));
  if (bars > MAX_BARS) { warnings.push(`longer than ${MAX_BARS} bars: the rest was cut`); bars = MAX_BARS; }
  const limit = bars * barTicks;

  // the Sampler tracks: in file order, the busiest 32 if there are more
  let list = [...parts.values()].filter(p => p.notes.length || p.keep).sort((a, b) => a.ti - b.ti || a.ch - b.ch);
  if (list.length > MAX_TRACKS) {
    const keep = new Set([...list].sort((a, b) => b.notes.length - a.notes.length).slice(0, MAX_TRACKS));
    warnings.push(`${list.length} instruments in the file: the ${MAX_TRACKS} with the most notes were kept`);
    list = list.filter(p => keep.has(p));
  }
  const perTrack = new Map(); for (const p of list) perTrack.set(p.ti, (perTrack.get(p.ti) || 0) + 1);
  let cut = 0;
  const tracks = list.map(p => {
    // one instrument to a MIDI track: the track's name; several (a format 0 file): the instrument and the channel
    const name = perTrack.get(p.ti) > 1 ? `${nameOf[p.ins]} (ch ${p.ch + 1})` : m.tracks[p.ti].name || (p.ins === 'kit' ? 'Drums' : `Track ${p.ti + 1}`);
    const notes = p.notes.filter(n => n[0] < limit || (cut++, false)).map(([at, len, nt, v]) => [at, Math.min(len, limit - at), nt, v]);
    return { name: name.slice(0, 40), instrument: p.ins,
      volume: p.vol == null ? (p.ins === 'kit' ? 0.5 : 0.7) : Math.max(0.05, p.vol / 127), pan: p.pan == null ? 0 : Math.max(-1, Math.min(1, (p.pan - 64) / 63)), notes };
  });
  if (cut) warnings.push(`${cut} notes after bar ${MAX_BARS} were cut`);

  // loop markers: loopStart and loopEnd
  const at = re => m.markers.find(x => re.test(x.text));
  const ls = at(/^loop[ _-]?start$/i), le = at(/^loop[ _-]?end$/i);
  const loop = ls && le && T(ls.tick) < T(le.tick) && T(le.tick) <= limit ? { on: true, start: T(ls.tick), end: T(le.tick) } : { on: false, start: 0, end: limit };
  const first = m.tracks[0];
  // opts.title wins; else the sequence name (the first track's name, when it holds no notes); else opts.name (the file's name)
  const title = (opts.title || (first && first.name && !first.events.some(e => e.k === 'on') ? first.name : opts.name) || 'Imported MIDI').slice(0, 60);
  const song = S.check({ format: 'pixelite-song', title, bpm: Math.round(bpm * 100) / 100, beatsPerBar, bars, loop, tempo, tracks });
  return { song, warnings, info: { tracks: song.tracks.length, notes: song.tracks.reduce((n, t) => n + t.notes.length, 0) } };
}

// ---------- a song → a file ----------
// -> { bytes: Uint8Array (format 1, 96 ticks a beat), warnings }
export function midiFromSong(song) {
  const warnings = [];
  const vlq = n => { const o = [n & 127]; while ((n >>>= 7) > 0) o.unshift((n & 127) | 128); return o; };
  const meta = (type, data) => [0xFF, type, ...vlq(data.length), ...data];
  const str = s => [...new TextEncoder().encode(s)];
  const u32 = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const chunk = (events, endTick) => {
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body = []; let t = 0;
    for (const e of events) { body.push(...vlq(e.tick - t), ...e.bytes); t = e.tick; }
    body.push(...vlq(Math.max(0, endTick - t)), 0xFF, 0x2F, 0);
    return [...str('MTrk'), ...u32(body.length), ...body];
  };
  const barTicks = song.beatsPerBar * PPQ, endTick = song.bars * barTicks;
  const ev = (tick, order, bytes) => ({ tick, order, bytes });   // order: 0 setup, 1 note off, 2 note on (at one tick, a note ends before the next begins)

  const conductor = [ev(0, 0, meta(0x03, str(song.title))), ev(0, 0, meta(0x58, [song.beatsPerBar, 2, 24, 8]))];
  const us = bpm => { const v = Math.round(6e7 / bpm); return [v >> 16, (v >> 8) & 255, v & 255]; };
  conductor.push(ev(0, 0, meta(0x51, us(song.bpm))));
  for (const [tick, bpm] of song.tempo || []) conductor.push(ev(tick, 0, meta(0x51, us(bpm))));
  if (song.loop && song.loop.on) { conductor.push(ev(song.loop.start, 0, meta(0x06, str('loopStart')))); conductor.push(ev(song.loop.end, 0, meta(0x06, str('loopEnd')))); }

  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; let next = 0, shared = false;
  const chunks = [chunk(conductor, endTick)];
  const lanes = song.tracks.some(t => ['volume', 'pan', 'filter'].some(l => t.auto && t.auto[l] && t.auto[l].length));
  const samples = song.tracks.filter(t => t.instrument.startsWith('sample:')).length;
  for (const t of song.tracks) {
    const drums = t.instrument === 'kit', ch = drums ? 9 : channels[next++ % channels.length];
    if (!drums && next > channels.length) shared = true;
    const known = t.instrument in INSTRUMENT_TO_GM || drums;
    const e = [ev(0, 0, meta(0x03, str(t.name)))];
    if (known) e.push(ev(0, 0, meta(0x01, str(TAG + t.instrument))));
    e.push(ev(0, 0, [0xB0 | ch, 7, Math.round(Math.max(0, Math.min(1, t.volume)) * 127)]));
    e.push(ev(0, 0, [0xB0 | ch, 10, Math.round(64 + Math.max(-1, Math.min(1, t.pan)) * 63)]));
    if (!drums) e.push(ev(0, 0, [0xC0 | ch, INSTRUMENT_TO_GM[t.instrument] ?? 0]));
    for (const [at, len, note, vel] of t.notes) { e.push(ev(at, 2, [0x90 | ch, note, vel])); e.push(ev(at + len, 1, [0x80 | ch, note, 64])); }
    chunks.push(chunk(e, t.notes.reduce((m, n) => Math.max(m, n[0] + n[1]), endTick)));
  }
  if (samples) warnings.push(`${samples} track(s) play the song's own samples, which a MIDI file cannot hold: they are written as pianos`);
  if (lanes) warnings.push('automation lanes (volume, pan, filter) are not in a MIDI file');
  if (shared) warnings.push('more than 15 pitched tracks: some share a MIDI channel');
  const header = [...str('MThd'), ...u32(6), 0, 1, 0, chunks.length, 0, PPQ];
  return { bytes: Uint8Array.from([...header, ...chunks.flat()]), warnings };
}
