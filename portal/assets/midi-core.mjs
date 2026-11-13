// MIDI files for the SOUND STUDIO, the CLI (tools/midi.mjs) and the tests: a Standard MIDI File → a Pixelite song, and a song → a
// file. No DOM; the Sampler (engine/13_sampler.js) is handed in, so the same code runs in the page and in Node.
// (The engine's own reader, parseMidi in engine/08_chip.js, is built for playing on the NES chip; this one is for editing: it keeps
// track names, time signatures, loop markers, the sustain pedal, the controllers and the pitch bend.)
//
// What goes in: notes, the instrument (General MIDI program → the nearest Sampler instrument; channel 10 → the drum kit), each
// channel's volume (CC 7, with CC 11 expression on top) and pan (CC 10) as the track's volume and pan, and, when they move while
// the notes play, as the track's volume and pan LANES; the pitch bend (in the range a "pitch bend sensitivity" RPN sets, 2 semitones
// otherwise) as the pitch lane; the sustain pedal (CC 64, held notes ring on); tempo changes (an even run of them is a tempo ramp);
// the first time signature; loop markers named loopStart / loopEnd; track names. What stays behind: other controllers, lyrics.
// A file with several instruments can be opened in part: `opts.only` lists the ones wanted (`info.candidates` lists them all).
// What goes out: the same, plus the song's name, and the exact instrument in a text event ("pixelite:instrument=saw"), so a song
// written here and read back is the same song. The song's own samples and multisamples travel inside the file (a sequencer-specific
// event each, which other programs ignore) and play as a General MIDI instrument of the same character there, a pad for a sample
// that loops, a marimba for one that does not. Effects, EQ, the filter, send and echo lanes and the loop-point lane are not in a MIDI file.

const PPQ = 96;   // the Sampler's ticks per beat
const MAX_BARS = 512, MAX_TRACKS = 32, MAX_POINTS = 512;
const RAMP_STEP = PPQ / 4;   // a lane or a tempo ramp is written as one event every 1/16 note: events that close read back as a ramp, not a jump

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
const MAKER = 0x7D;   // the manufacturer id "non-commercial / educational": the first byte of the sequencer-specific events that carry samples
export { GM_TO_INSTRUMENT, INSTRUMENT_TO_GM };

// ---------- reading ----------
// bytes → { div, tempos: [{ tick, bpm }], timeSigs: [{ tick, num, den }], markers: [{ tick, text }], extras: [object], tracks: [{ name, texts, end, events }], warnings }
// events are { tick, k: 'on' | 'off' | 'prog' | 'cc' | 'bend', ch, a, b } in file order (a bend: a the low 7 bits, b the high 7).
// Lenient: a file that ends early gives what it holds.
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
  const out = { div, tempos: [], timeSigs: [], markers: [], extras: [], tracks: [], warnings };
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
        else if (type === 0x7F && body[0] === MAKER) { try { const o = JSON.parse(new TextDecoder().decode(body.subarray(1))); if (o && typeof o === 'object') out.extras.push(o); } catch (e) { } }
        else if (type === 0x2F) trk.end = Math.max(trk.end, tick);
      } else if (status === 0xF0 || status === 0xF7) { q += vlq(); status = 0; }
      else {
        const hi = status & 0xF0, ch = status & 15, n = hi === 0xC0 || hi === 0xD0 ? 1 : 2;
        if (q + n > end) { truncated = true; break; }
        const a = d[q++] & 127, b = n === 2 ? d[q++] & 127 : 0;
        if (hi === 0x90 && b > 0) trk.events.push({ tick, k: 'on', ch, a, b });
        else if (hi === 0x80 || hi === 0x90) trk.events.push({ tick, k: 'off', ch, a, b });
        else if (hi === 0xC0) trk.events.push({ tick, k: 'prog', ch, a, b });
        else if (hi === 0xE0) trk.events.push({ tick, k: 'bend', ch, a, b });
        else if (hi === 0xB0 && (a === 7 || a === 10 || a === 11 || a === 64 || a === 6 || a === 100 || a === 101)) trk.events.push({ tick, k: 'cc', ch, a, b });
      }
      trk.end = Math.max(trk.end, tick);
    }
    out.tracks.push(trk);
  }
  if (truncated) warnings.push('the file ends early: what is in it was read');
  return out;
}

// ---------- lanes from controller events ----------
// events [tick, value] (in the file's ticks, in file order) → the value the notes start with, and, when it moves while they play, a
// lane [tick, value] in the Sampler's ticks. Between two events a beat or more apart the value jumps (a controller is a step: the
// lane holds the old value until just before); closer ones are a sweep, which the lane follows as a line. `first`/`last`: the
// part's first note and the end of its last (file ticks); `initial`: the value before any event; `always`: a lane even if constant
function laneFrom(series, T, first, last, initial, always = false) {
  const ev = new Map();
  for (const [t, v] of series) if (t <= last) ev.set(t, v);
  let s = [...ev].sort((a, b) => a[0] - b[0]);
  if (!s.length) return always ? null : { rest: initial, pts: null };
  if (s[0][0] > 0) s.unshift([0, initial]);
  let rest = initial; for (const [t, v] of s) if (t <= first) rest = v;
  if (!always && !s.some(([t, v]) => t > first && Math.abs(v - rest) > 1e-9)) return { rest, pts: null };
  if (always && s.every(([, v]) => Math.abs(v) < 1e-3)) return null;
  let pts = [];
  for (const [t, v] of s) {
    const at = T(t), prev = pts[pts.length - 1];
    if (prev && at - prev[0] > PPQ && Math.abs(v - prev[1]) > 1e-9) pts.push([at - 1, prev[1]]);
    if (!prev || at > prev[0]) pts.push([at, v]); else prev[1] = v;
  }
  pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || Math.abs(p[1] - pts[i - 1][1]) > 1e-9 || Math.abs(p[1] - pts[i + 1][1]) > 1e-9);   // the middle of a flat run says nothing
  if (pts.length > MAX_POINTS) { const keep = new Set(Array.from({ length: MAX_POINTS }, (_, i) => Math.round(i * (pts.length - 1) / (MAX_POINTS - 1)))); pts = pts.filter((_, i) => keep.has(i)); }
  return { rest, pts };
}
// tempo events → points, with an even run of changes (a ramp written by another program, or by midiFromSong) as one ramp point
function tempoPoints(seq) {
  const out = [];
  let i = 0, ramped = false;
  while (i < seq.length) {
    let j = i + 1, dir = 0, best = 0;
    for (; j < seq.length; j++) {
      const dt = seq[j].t - seq[j - 1].t, db = seq[j].b - seq[j - 1].b;
      if (dt > PPQ || !db || (dir && Math.sign(db) !== dir)) break;
      dir = Math.sign(db);
      let fit = true;   // every point on the straight line from the run's start to here, within half a BPM
      for (let k = i + 1; k < j; k++) if (Math.abs(seq[k].b - (seq[i].b + (seq[j].b - seq[i].b) * (seq[k].t - seq[i].t) / (seq[j].t - seq[i].t))) > .5) { fit = false; break; }
      if (!fit) break;
      if (j - i >= 2) best = j;
    }
    if (!ramped && i > 0) out.push([seq[i].t, seq[i].b]);
    if (best) { out.push([seq[best].t, seq[best].b, 1]); i = best; ramped = true; } else { i++; ramped = false; }
  }
  return out;
}

// ---------- a file → a song ----------
// S is the Sampler; opts: { title, name, only }. -> { song, warnings, info: { tracks, notes, candidates } }; throws a plain sentence for something
// that is not a usable file. info.candidates lists every instrument the file holds ({ index, name, instrument, channel, notes }); `only` is
// the indices of the ones to open (all, when it is left out).
export function songFromMidi(input, S, opts = {}) {
  const m = readMidi(input), warnings = [...m.warnings], k = S.PPQ / m.div, T = t => Math.round(t * k);
  const ids = new Set(S.INSTRUMENTS.map(i => i.id)), nameOf = Object.fromEntries(S.INSTRUMENTS.map(i => [i.id, i.name]));
  // the song's own sounds that a file written here carries
  const samples = Object.create(null), multis = Object.create(null), kits = Object.create(null);   // (no prototype: a file's id can be 'constructor')
  for (const x of m.extras) {
    if (x.pixelite === 'sample' && typeof x.id === 'string' && x.brr) samples[x.id] = { name: x.name, rate: x.rate, root: x.root, loop: x.loop, loopEnd: x.loopEnd, xfade: x.xfade, brr: x.brr };
    else if (x.pixelite === 'multi' && typeof x.id === 'string' && Array.isArray(x.zones)) multis[x.id] = { name: x.name, zones: x.zones };
    else if (x.pixelite === 'kit' && typeof x.id === 'string' && Array.isArray(x.pads)) kits[x.id] = { name: x.name, pads: x.pads };
  }
  const own = id => (id.startsWith('sample:') && samples[id.slice(7)]) || (id.startsWith('multi:') && multis[id.slice(6)]) || (id.startsWith('drums:') && kits[id.slice(6)]);
  const parts = new Map();   // "midi track:channel:program" → one Sampler track
  const skipped = new Set();
  let end = 0;
  m.tracks.forEach((trk, ti) => {
    const forced = trk.texts.map(t => t.startsWith(TAG) ? t.slice(TAG.length) : '').find(id => ids.has(id) || own(id));
    // per channel: the program, the pedal, the controllers, and the notes sounding by pitch. Notes of one pitch overlap now and then; each
    // note-off ends the one that began first (what most MIDI tools do), and `held` counts the note-offs the sustain pedal is holding back
    const chans = Array.from({ length: 16 }, () => ({ prog: 0, pedal: false, held: new Map(), open: new Map(), cc7: null, cc11: null, vol: [], pan: [], bend: [], range: 2, rpn: [127, 127] }));
    const partOf = (ch, prog) => {
      const key = `${ti}:${ch}:${ch === 9 ? 'd' : prog}`;
      if (!parts.has(key)) parts.set(key, { ti, ch, c: chans[ch], ins: forced || (ch === 9 ? 'kit' : GM_TO_INSTRUMENT[prog]), notes: [], first: Infinity, last: 0 });
      return parts.get(key);
    };
    const close = (c, pitch, tick) => {
      const o = (c.open.get(pitch) || []).shift(); if (!o) return;
      let note = pitch;
      if (o.part.ins === 'kit') { note = S.KIT[pitch] ? pitch : DRUM_ALIASES[pitch]; if (!note) { skipped.add(pitch); return; } }
      const at = T(o.start), len = Math.max(T(tick) - at, S.isKit(o.part.ins) ? 12 : 1);   // a one-tick drum hit is a speck in the piano roll
      o.part.notes.push([at, len, note, o.vel]); end = Math.max(end, at + len);
      o.part.first = Math.min(o.part.first, o.start); o.part.last = Math.max(o.part.last, tick);
    };
    const level = c => (c.cc7 ?? 127) / 127 * (c.cc11 ?? 127) / 127;
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
      } else if (e.k === 'bend') c.bend.push([e.tick, ((e.b << 7 | e.a) - 8192) / 8192 * c.range]);
      else if (e.a === 64) {
        c.pedal = e.b >= 64;
        if (!c.pedal) { for (const [pitch, n] of c.held) for (let i = 0; i < n; i++) close(c, pitch, e.tick); c.held.clear(); }
      } else if (e.a === 7) { c.cc7 = e.b; c.vol.push([e.tick, level(c)]); c.sawVol = true; }
      else if (e.a === 11) { c.cc11 = e.b; c.vol.push([e.tick, level(c)]); }
      else if (e.a === 10) c.pan.push([e.tick, Math.max(-1, Math.min(1, (e.b - 64) / 63))]);
      else if (e.a === 101) c.rpn[0] = e.b;
      else if (e.a === 100) c.rpn[1] = e.b;
      else if (e.a === 6 && c.rpn[0] === 0 && c.rpn[1] === 0) c.range = e.b;   // pitch bend sensitivity, in semitones
    }
    for (const c of chans) for (const [pitch, list] of c.open) while (list.length) close(c, pitch, trk.end);   // still sounding when the track ends
    // a track this studio wrote keeps its place even with no notes in it (the instrument tag says it is meant); a channel in another
    // program's file that has only controllers is not a track
    if (forced && ![...parts.values()].some(p => p.ti === ti)) {
      const c = chans.find(c => c.vol.length) || chans[0];
      parts.set(`${ti}:empty`, { ti, ch: forced && S.isKit(forced) ? 9 : 0, c, ins: forced, notes: [], first: 0, last: trk.end, keep: true });
    }
    end = Math.max(end, T(trk.end));
  });
  if (skipped.size) warnings.push(`drum notes with no sound in the kit were left out: ${[...skipped].sort((a, b) => a - b).join(', ')}`);

  // the Sampler tracks, in file order; with `only`, the ones asked for
  const all = [...parts.values()].filter(p => p.notes.length || p.keep).sort((a, b) => a.ti - b.ti || a.ch - b.ch);
  const perTrack = new Map(); for (const p of all) perTrack.set(p.ti, (perTrack.get(p.ti) || 0) + 1);
  // one instrument to a MIDI track: the track's name; several (a format 0 file): the instrument and the channel
  const nameFor = p => (perTrack.get(p.ti) > 1 ? `${nameOf[p.ins] || (own(p.ins) || {}).name || p.ins} (ch ${p.ch + 1})` : m.tracks[p.ti].name || (S.isKit(p.ins) ? 'Drums' : `Track ${p.ti + 1}`)).slice(0, 40);
  const candidates = all.map((p, index) => ({ index, name: nameFor(p), instrument: p.ins, channel: p.ch + 1, notes: p.notes.length }));
  let list = all;
  if (opts.only) {
    const want = new Set(opts.only);
    list = all.filter((p, i) => want.has(i));
    if (!list.length) throw new Error('no instrument was chosen');
    const kept = new Set(list.map(p => p.ti));
    end = 0; for (const p of list) for (const [at, len] of p.notes) end = Math.max(end, at + len);
    for (const ti of kept) end = Math.max(end, T(m.tracks[ti].end));
  }

  // the song's own numbers: tempo, time signature, length, loop
  const tempos = m.tempos.slice().sort((a, b) => a.tick - b.tick);
  const bpm = tempos.length && tempos[0].tick === 0 ? tempos[0].bpm : 120;
  const seq = [{ t: 0, b: Math.round(bpm * 100) / 100 }]; let last = bpm;
  for (const t of tempos) if (t.tick > 0 && Math.abs(t.bpm - last) > 0.005) { seq.push({ t: T(t.tick), b: Math.round(t.bpm * 100) / 100 }); last = t.bpm; }
  const tempo = tempoPoints(seq);
  const ts = m.timeSigs.slice().sort((a, b) => a.tick - b.tick)[0];
  const beatsPerBar = ts ? Math.min(12, Math.max(1, Math.round(ts.num * 4 / ts.den))) : 4;
  if (m.timeSigs.some(t => t.num !== ts.num || t.den !== ts.den)) warnings.push('the time signature changes in the file; only the first is kept (bar lines may not match later on)');
  const barTicks = beatsPerBar * S.PPQ;
  if (!end) throw new Error('this MIDI file has no notes');
  let bars = Math.max(1, Math.ceil(end / barTicks));
  if (bars > MAX_BARS) { warnings.push(`longer than ${MAX_BARS} bars: the rest was cut`); bars = MAX_BARS; }
  const limit = bars * barTicks;

  if (list.length > MAX_TRACKS) {
    const keep = new Set([...list].sort((a, b) => b.notes.length - a.notes.length).slice(0, MAX_TRACKS));
    warnings.push(`${list.length} instruments in the file: the ${MAX_TRACKS} with the most notes were kept`);
    list = list.filter(p => keep.has(p));
  }
  let cut = 0, lanes = 0;
  const tracks = list.map(p => {
    const notes = p.notes.filter(n => n[0] < limit || (cut++, false)).map(([at, len, nt, v]) => [at, Math.min(len, limit - at), nt, v]);
    // volume (CC 7 × CC 11) and pan: a number when they hold, a lane too when they move while the notes play
    const c = p.c, def = S.isKit(p.ins) ? 0.5 : 0.7, tr = { name: nameFor(p), instrument: p.ins, notes, auto: {} };
    const vol = c.vol.length ? laneFrom(c.vol, T, p.first, p.last, 1) : null;
    if (!vol) tr.volume = def;
    else {
      const peak = Math.max(vol.rest, ...(vol.pts || []).map(q => q[1]), 1e-3);
      tr.volume = Math.max(0.05, Math.min(1, peak * (c.sawVol ? 1 : def)));
      if (vol.pts) { tr.auto.volume = vol.pts.map(([t, v]) => [t, Math.min(1, v / peak)]); lanes++; }
    }
    const pan = c.pan.length ? laneFrom(c.pan, T, p.first, p.last, 0) : null;
    tr.pan = pan ? pan.rest : 0;
    if (pan && pan.pts) { tr.auto.pan = pan.pts; lanes++; }
    const bend = c.bend.length ? laneFrom(c.bend, T, p.first, p.last, 0, true) : null;
    if (bend && bend.pts && p.ins !== 'kit') { tr.auto.pitch = bend.pts.map(([t, v]) => [t, Math.max(-12, Math.min(12, v))]); lanes++; }
    return tr;
  });
  if (cut) warnings.push(`${cut} notes after bar ${MAX_BARS} were cut`);
  if (lanes) warnings.push(`${lanes} volume, pan and pitch-bend lanes were made from the file's controllers`);

  // loop markers: loopStart and loopEnd
  const at = re => m.markers.find(x => re.test(x.text));
  const ls = at(/^loop[ _-]?start$/i), le = at(/^loop[ _-]?end$/i);
  const loop = ls && le && T(ls.tick) < T(le.tick) && T(le.tick) <= limit ? { on: true, start: T(ls.tick), end: T(le.tick) } : { on: false, start: 0, end: limit };
  const first = m.tracks[0];
  // opts.title wins; else the sequence name (the first track's name, when it holds no notes); else opts.name (the file's name)
  const title = (opts.title || (first && first.name && !first.events.some(e => e.k === 'on') ? first.name : opts.name) || 'Imported MIDI').slice(0, 60);
  // the samples the kept tracks play (and the ones a multisample of theirs is made of)
  const useSamples = Object.create(null), useMultis = Object.create(null), useKits = Object.create(null);
  for (const t of tracks) {
    if (t.instrument.startsWith('drums:') && kits[t.instrument.slice(6)]) { const id = t.instrument.slice(6); useKits[id] = kits[id]; for (const p of kits[id].pads || []) if (p && samples[p.sample]) useSamples[p.sample] = samples[p.sample]; }
    if (t.instrument.startsWith('multi:') && multis[t.instrument.slice(6)]) { const id = t.instrument.slice(6); useMultis[id] = multis[id]; for (const z of multis[id].zones || []) if (samples[z.sample]) useSamples[z.sample] = samples[z.sample]; }
    else if (t.instrument.startsWith('sample:') && samples[t.instrument.slice(7)]) useSamples[t.instrument.slice(7)] = samples[t.instrument.slice(7)];
  }
  const song = S.check({ format: 'pixelite-song', title, bpm: Math.round(bpm * 100) / 100, beatsPerBar, bars, loop, tempo, tracks, samples: useSamples, multis: useMultis, kits: useKits });
  return { song, warnings, info: { tracks: song.tracks.length, notes: song.tracks.reduce((n, t) => n + t.notes.length, 0), candidates } };
}

// ---------- a song → a file ----------
// S is the Sampler (it evaluates the lanes). -> { bytes: Uint8Array (format 1, 96 ticks a beat), warnings }
export function midiFromSong(song, S) {
  const warnings = [];
  const vlq = n => { const o = [n & 127]; while ((n >>>= 7) > 0) o.unshift((n & 127) | 128); return o; };
  const meta = (type, data) => [0xFF, type, ...vlq(data.length), ...data];
  const str = s => [...new TextEncoder().encode(s)];
  const u32 = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const chunk = (events, endTick) => {
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body = []; let t = 0;
    for (const e of events) { for (const b of vlq(e.tick - t)) body.push(b); for (const b of e.bytes) body.push(b); t = e.tick; }
    body.push(...vlq(Math.max(0, endTick - t)), 0xFF, 0x2F, 0);
    return [...str('MTrk'), ...u32(body.length), ...body];
  };
  const barTicks = song.beatsPerBar * PPQ, endTick = song.bars * barTicks;
  const ev = (tick, order, bytes) => ({ tick, order, bytes });   // order: 0 setup, 1 note off, 2 note on (at one tick, a note ends before the next begins)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const conductor = [ev(0, 0, meta(0x03, str(song.title))), ev(0, 0, meta(0x58, [song.beatsPerBar, 2, 24, 8]))];
  const us = bpm => { const v = Math.round(6e7 / bpm); return meta(0x51, [v >> 16, (v >> 8) & 255, v & 255]); };
  conductor.push(ev(0, 0, us(song.bpm)));
  // tempo: a step is one event; a glide to a point (its third number) is an event every 1/16 note on the way
  let prev = [0, song.bpm];
  for (const [tick, bpm, glide] of song.tempo || []) {
    if (glide) for (let k = prev[0] + RAMP_STEP; k < tick; k += RAMP_STEP) conductor.push(ev(k, 0, us(prev[1] + (bpm - prev[1]) * (k - prev[0]) / (tick - prev[0]))));
    conductor.push(ev(tick, 0, us(bpm))); prev = [tick, bpm];
  }
  if (song.loop && song.loop.on) { conductor.push(ev(song.loop.start, 0, meta(0x06, str('loopStart')))); conductor.push(ev(song.loop.end, 0, meta(0x06, str('loopEnd')))); }

  // the song's own sounds travel in the file (and are the nearest General MIDI sound elsewhere)
  const sampleProgram = sm => sm && sm.loop >= 0 ? 89 : 12;
  const carried = new Set();
  const carry = (kind, id, o) => { if (carried.has(kind + id)) return; carried.add(kind + id); conductor.push(ev(0, 0, meta(0x7F, [MAKER, ...str(JSON.stringify({ pixelite: kind, id, ...o }))]))); };
  const ownProgram = t => {
    const ki = t.instrument.startsWith('drums:') ? (song.kits || {})[t.instrument.slice(6)] : null;
    if (ki) {   // a kit of the song's own: its pads travel (and the samples on them); other programs play the drums by note number
      for (const p of ki.pads) if (p.sample && song.samples && song.samples[p.sample]) carry('sample', p.sample, song.samples[p.sample]);
      carry('kit', t.instrument.slice(6), ki); kitTracks++; return 0;
    }
    const sm = t.instrument.startsWith('sample:') ? (song.samples || {})[t.instrument.slice(7)] : null, mu = t.instrument.startsWith('multi:') ? (song.multis || {})[t.instrument.slice(6)] : null;
    if (sm) { carry('sample', t.instrument.slice(7), sm); return sampleProgram(sm); }
    if (mu) {
      for (const z of mu.zones) if (song.samples && song.samples[z.sample]) carry('sample', z.sample, song.samples[z.sample]);
      carry('multi', t.instrument.slice(6), mu); return sampleProgram(song.samples && song.samples[mu.zones[0].sample]);
    }
    return null;
  };

  // a lane as controller events: one every 1/16 note along it (a line or a curve), so that opening the file makes the same lane
  const laneEvents = (pts, f) => {
    const out = [], end = Math.max(endTick, pts[pts.length - 1][0]);
    for (let k = 0; k < end; k += RAMP_STEP) out.push([k, S.laneAt(pts, k)]);
    for (const [t, v] of pts) if (t > 0 && t % RAMP_STEP) out.push([t, v]);   // and each point itself, where it falls between
    out.push([end, S.laneAt(pts, end)]);
    return out.sort((x, y) => x[0] - y[0]).map(([t, v]) => ev(t, 0, f(v)));
  };

  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; let next = 0, shared = false;
  const trackChunks = [];
  let missing = false, lanesLeft = false, customs = 0, kitTracks = 0;
  for (const t of song.tracks) {
    const drums = S.isKit(t.instrument), ch = drums ? 9 : channels[next++ % channels.length];
    const notes = S.notesOf(song, t);   // a track's clips as the notes they play
    if (!drums && next > channels.length) shared = true;
    const A = t.auto || {};
    const mine = ownProgram(t);
    const known = t.instrument in INSTRUMENT_TO_GM || drums || mine !== null;
    if (mine !== null && !drums) customs++;   // (a kit is counted apart: it is not a pad or a marimba elsewhere, it is drums)
    const e = [ev(0, 0, meta(0x03, str(t.name)))];
    if (known) e.push(ev(0, 0, meta(0x01, str(TAG + t.instrument))));
    e.push(ev(0, 0, [0xB0 | ch, 7, Math.round(clamp(t.volume, 0, 1) * 127)]));
    if (!(A.pan && A.pan.length)) e.push(ev(0, 0, [0xB0 | ch, 10, Math.round(64 + clamp(t.pan, -1, 1) * 63)]));
    if (!drums) e.push(ev(0, 0, [0xC0 | ch, mine ?? INSTRUMENT_TO_GM[t.instrument] ?? 0]));
    // volume lane → expression (CC 11, which multiplies the channel volume), pan lane → CC 10, pitch lane → pitch bend over ±12 semitones
    if (A.volume && A.volume.length) e.push(...laneEvents(A.volume, v => [0xB0 | ch, 11, Math.round(clamp(v, 0, 1) * 127)]));
    if (A.pan && A.pan.length) e.push(...laneEvents(A.pan, v => [0xB0 | ch, 10, Math.round(64 + clamp(v, -1, 1) * 63)]));
    if (A.pitch && A.pitch.length && !drums) {
      for (const [c, v] of [[101, 0], [100, 0], [6, 12], [38, 0], [101, 127], [100, 127]]) e.push(ev(0, 0, [0xB0 | ch, c, v]));
      e.push(...laneEvents(A.pitch, v => { const n = Math.round(8192 + clamp(v, -12, 12) / 12 * 8191); return [0xE0 | ch, n & 127, n >> 7]; }));
    }
    for (const [at, len, note, vel] of notes) { e.push(ev(at, 2, [0x90 | ch, note, vel])); e.push(ev(at + len, 1, [0x80 | ch, note, 64])); }
    trackChunks.push(chunk(e, notes.reduce((m, n) => Math.max(m, n[0] + n[1]), endTick)));
    if ((t.instrument.startsWith('sample:') || t.instrument.startsWith('multi:')) && mine === null) missing = true;
    if (['filter', 'echo', 'reverb', 'loop'].some(l => A[l] && A[l].length)) lanesLeft = true;
  }
  // the conductor is written last, once the sounds the tracks carry are in it
  const chunks = [chunk(conductor, endTick), ...trackChunks];
  if (kitTracks) warnings.push(`${kitTracks} track(s) play a drum kit of the song's own: the kit and its samples are in the file for Pixelite, and other programs play those notes as General MIDI drums`);
  if (customs) warnings.push(`${customs} track(s) play the song's own samples: they are in the file for Pixelite, and other programs play them as a pad (looping) or a marimba`);
  if (missing) warnings.push('a track plays a sample the song does not hold: it is written as a piano');
  if (lanesLeft) warnings.push('filter, echo, reverb and loop-point lanes are not in a MIDI file');
  if (song.auto && ((song.auto.echo || []).length || (song.auto.feedback || []).length)) warnings.push('the echo lanes (level and feedback) are not in a MIDI file');
  if (shared) warnings.push('more than 15 pitched tracks: some share a MIDI channel');
  const header = [...str('MThd'), ...u32(6), 0, 1, 0, chunks.length, 0, PPQ];
  return { bytes: Uint8Array.from([...header, ...chunks.flat()]), warnings };
}
