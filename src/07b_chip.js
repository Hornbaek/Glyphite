// ===================== ENGINE · Chip: an 8-bit sound chip driven by MIDI =====================
// A fantasy NES (2A03-style) chip, rendered sample by sample in JavaScript:
//   pulse lanes – 12.5 / 25 / 50 / 75 % duty, 4-bit volume, 11-bit period quantisation
//   triangle    – the 32-step, 4-bit stepped triangle (no volume control, gate only)
//   noise       – 15-bit LFSR, long or short (metallic) mode, 16 NTSC periods
// mixed through the 2A03's non-linear DAC curve and high-passed like the console's output.
// MIDI drives it the way an NES sound driver would: one chip lane per MIDI channel, chords
// become 60 Hz arpeggios, channel 10 becomes noise drums. Audio is rendered in short blocks
// just ahead of the play head and scheduled back to back, so no AudioWorklet is needed.
const CHIP_CPU = 1789773;
const CHIP_NOISE = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const CHIP_TRI = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = n => n < 0 ? '---' : NOTE_NAMES[n % 12] + Math.max(0, Math.floor(n / 12) - 1);

// ---------- Standard MIDI File (format 0/1) → time-sorted event list ----------
function parseMidi(buf) {
  const d = new Uint8Array(buf); let p = 0;
  const str4 = () => String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]);
  const u32 = () => ((d[p++] << 24) | (d[p++] << 16) | (d[p++] << 8) | d[p++]) >>> 0;
  const u16 = () => (d[p++] << 8) | d[p++];
  const vlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 127); } while ((b & 128) && p < d.length); return v; };
  if (d.length < 14 || str4() !== 'MThd') throw new Error('not a Standard MIDI File');
  p = 4; const hlen = u32(); u16(); const ntr = u16(), div = u16(); p = 8 + hlen;
  if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');
  const ev = []; let name = '', endTick = 0;
  for (let t = 0; t < ntr && p + 8 <= d.length; t++) {
    while (p + 8 <= d.length && str4() !== 'MTrk') { p += 4; const l = u32(); p += l; }
    if (p + 8 > d.length) break;
    p += 4; const len = u32(), end = Math.min(d.length, p + len);
    let tick = 0, st = 0;
    while (p < end) {
      tick += vlq();
      if (d[p] & 0x80) st = d[p++]; else if (!st) { p++; continue; }
      const hi = st & 0xF0, ch = st & 15;
      if (st === 0xFF) {
        const type = d[p++], l = vlq();
        if (type === 0x51 && l === 3) ev.push({ tick, k: 'tempo', us: (d[p] << 16) | (d[p + 1] << 8) | d[p + 2] });
        else if (type === 0x03 && !name && l) name = String.fromCharCode(...d.subarray(p, p + Math.min(l, 48))).replace(/[^\x20-\x7e]/g, '').trim();
        else if (type === 0x2F) endTick = Math.max(endTick, tick);
        p += l; st = 0;
      } else if (st === 0xF0 || st === 0xF7) { p += vlq(); st = 0; }
      else if (hi === 0xC0 || hi === 0xD0) { const a = d[p++]; if (hi === 0xC0) ev.push({ tick, k: 'prog', ch, v: a }); }
      else {
        const a = d[p++], b = d[p++];
        if (hi === 0x90 && b > 0) ev.push({ tick, k: 'on', ch, note: a, vel: b });
        else if (hi === 0x80 || hi === 0x90) ev.push({ tick, k: 'off', ch, note: a });
        else if (hi === 0xB0) ev.push({ tick, k: 'cc', ch, cc: a, v: b });
        else if (hi === 0xE0) ev.push({ tick, k: 'bend', ch, v: ((b << 7) | a) - 8192 });
      }
      endTick = Math.max(endTick, tick);
    }
    p = end;
  }
  const rank = { off: 0, tempo: 1, prog: 1, cc: 1, bend: 1, on: 2 };
  ev.sort((a, b) => a.tick - b.tick || rank[a.k] - rank[b.k]);
  // tempo map: ticks → seconds
  const tempos = [{ t: 0, tick: 0, us: 500000 }]; let us = 500000, lt = 0, sec = 0;
  for (const e of ev) {
    sec += (e.tick - lt) * us / 1e6 / div; lt = e.tick; e.t = sec;
    if (e.k === 'tempo') { us = e.us; tempos.push({ t: sec, tick: e.tick, us }); }
  }
  const dur = sec + (endTick - lt) * us / 1e6 / div;
  const notes = ev.filter(e => e.k === 'on').length;
  if (!notes) throw new Error('the file has no notes');
  return { name, events: ev.filter(e => e.k !== 'tempo'), dur, tempos, div, notes, channels: new Set(ev.filter(e => e.k === 'on').map(e => e.ch)).size };
}

// ---------- General MIDI program → chip instrument ----------
// kind, duty, mode (arp: chords cycle at 60 Hz, mono: last note wins), ADSR in 60 Hz frames
function chipInstrument(prog) {
  if (prog >= 32 && prog <= 39) return { kind: 'tri', duty: 0, mode: 'mono', a: 0, d: 0, s: 1, r: 1 };                       // basses
  if (prog >= 80 && prog <= 87) return { kind: 'pulse', duty: prog === 80 ? .5 : .25, mode: 'mono', a: 0, d: 8, s: .72, r: 6, vib: 1 }; // synth leads
  if ((prog >= 48 && prog <= 55) || (prog >= 88 && prog <= 95)) return { kind: 'pulse', duty: .5, mode: 'arp', a: 5, d: 10, s: .66, r: 12 }; // strings, pads
  if (prog >= 56 && prog <= 63) return { kind: 'pulse', duty: .25, mode: 'mono', a: 1, d: 8, s: .6, r: 6, vib: 1 };          // brass
  if (prog >= 64 && prog <= 79) return { kind: 'pulse', duty: .125, mode: 'mono', a: 2, d: 6, s: .78, r: 6, vib: 1 };        // reeds, pipes
  if (prog >= 24 && prog <= 31) return { kind: 'pulse', duty: .25, mode: 'arp', a: 0, d: 12, s: .32, r: 6 };                // guitars
  if (prog >= 8 && prog <= 15) return { kind: 'pulse', duty: .125, mode: 'arp', a: 0, d: 14, s: 0, r: 4 };                  // chromatic percussion
  return { kind: 'pulse', duty: .25, mode: 'arp', a: 0, d: 16, s: .45, r: 8 };                                              // pianos and the rest
}
// General MIDI drum note → noise period index, mode, volume, decay frames, optional triangle "thump"
function chipDrum(n) {
  if (n === 35 || n === 36) return { p: 12, m: 0, v: 9, d: 5, f0: 150, f1: 46, tl: 7 };
  if (n === 38 || n === 40) return { p: 7, m: 0, v: 14, d: 11, f0: 240, f1: 160, tl: 3 };
  if (n === 37 || n === 39) return { p: 6, m: 0, v: 11, d: 5 };
  if (n === 42 || n === 44) return { p: 2, m: 0, v: 7, d: 3 };
  if (n === 46) return { p: 2, m: 0, v: 7, d: 14 };
  if (n === 49 || n === 52 || n === 55 || n === 57) return { p: 4, m: 0, v: 11, d: 45 };
  if (n === 51 || n === 53 || n === 59) return { p: 1, m: 1, v: 6, d: 12 };
  if (n >= 41 && n <= 50) { const f = 95 + (n - 41) * 16; return { p: 10, m: 0, v: 5, d: 6, f0: f, f1: f * .6, tl: 9 }; }
  return { p: 5, m: 0, v: 8, d: 6 };
}

function chipLane(ch) {
  return { ch, prog: -1, ins: chipInstrument(ch === 9 ? 0 : 0), notes: [], sus: false, vol: 1, expr: 1, bend: 0, bendRange: 2,
    env: 0, st: 0, rel: 0, vel: 1, cur: -1, arp: 0, age: 0, phase: 0, inc: 0, v4: 0, used: false };
}

const Chip = {
  ctx: null, gain: null, sr: 48000, frameLen: 800, block: 2048, lead: .16, vol: .5,
  lanes: [], live: [], drum: null, act: [], song: null, pos: 0, ev: 0, loop: true, playing: false, onEnd: null,
  frameAcc: 0, x1: 0, y1: 0, lp: 0, hpR: 0, lpA: 0, nextTime: 0, srcs: [], snaps: [], liveT: -1e9, buf: null, tok: 0,

  init(ctx, dest) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx; this.sr = ctx.sampleRate; this.frameLen = Math.round(this.sr / 60);
    this.hpR = Math.exp(-2 * Math.PI * 37 / this.sr); this.lpA = 1 - Math.exp(-2 * Math.PI * 14000 / this.sr);
    this.gain = ctx.createGain(); this.gain.gain.value = this.vol; this.gain.connect(dest || ctx.destination);
    for (let c = 0; c < 16; c++) { this.lanes.push(chipLane(c)); this.live.push(chipLane(c)); }
    this.drum = { v4: 0, vol: 0, dec: 0, rate: 0, mode: 0, lfsr: 1, acc: 0, tlen: 0, tk: 0, f0: 0, f1: 0, tph: 0, tinc: 0 };
    setInterval(() => this.pump(), 25);
  },
  load(buf) { return parseMidi(buf); },
  // play a parsed song; loop by default; onEnd fires when a non-looping song finishes playing
  play(song, opts = {}) {
    if (!this.ctx) return;
    this.halt(); this.tok++;
    const sr = this.sr;
    for (const e of song.events) e.s = Math.round(e.t * sr);
    song.durS = Math.max(1, Math.round(song.dur * sr));
    this.song = song; this.loop = opts.loop !== false; this.onEnd = opts.onEnd || null; this.playing = true;
    const g = this.gain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(opts.fadeIn ? 0 : this.vol, t); if (opts.fadeIn) g.linearRampToValueAtTime(this.vol, t + opts.fadeIn);
  },
  stop(fade = .4) {
    if (!this.ctx || !this.playing) return;
    const g = this.gain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    const tok = ++this.tok;
    setTimeout(() => { if (this.tok === tok) { this.halt(); g.setValueAtTime(this.vol, this.ctx.currentTime); } }, fade * 1000 + 30);
    this.playing = false;
  },
  setVolume(v) { this.vol = v; if (this.gain) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, .05); },
  // silence everything already scheduled and reset the chip
  halt() {
    for (const s of this.srcs) { try { s.stop(); } catch (e) { } }
    this.srcs.length = 0; this.snaps.length = 0; this.playing = false; this.song = null; this.pos = 0; this.ev = 0;
    for (const L of this.lanes) Object.assign(L, chipLane(L.ch));
    this.drum.vol = this.drum.v4 = 0; this.drum.tlen = 0; this.nextTime = 0;
  },

  // ----- live MIDI bytes (Web MIDI keyboards, or anything else that speaks MIDI) -----
  midi(data) {
    if (!this.ctx) return;
    const st = data[0], hi = st & 0xF0, ch = st & 15, a = data[1], b = data[2];
    const e = hi === 0x90 && b > 0 ? { k: 'on', ch, note: a, vel: b } : (hi === 0x80 || hi === 0x90) ? { k: 'off', ch, note: a }
      : hi === 0xB0 ? { k: 'cc', ch, cc: a, v: b } : hi === 0xC0 ? { k: 'prog', ch, v: a } : hi === 0xE0 ? { k: 'bend', ch, v: ((b << 7) | a) - 8192 } : null;
    if (e) { this.apply(e, this.live); this.liveT = performance.now(); }
  },
  async connectMidi() {
    if (!navigator.requestMIDIAccess) throw new Error('this browser has no Web MIDI');
    const acc = await navigator.requestMIDIAccess({ sysex: false }), names = [];
    const hook = inp => { inp.onmidimessage = e => this.midi(e.data); names.push(inp.name || 'MIDI input'); };
    acc.inputs.forEach(hook);
    acc.onstatechange = e => { if (e.port.type === 'input' && e.port.state === 'connected') hook(e.port); };
    this.lead = .07; this.block = 1024;             // tighter scheduling while playing live
    return names;
  },

  apply(e, lanes) {
    if (e.ch === 9) { if (e.k === 'on') this.hit(e.note, e.vel); return; }     // channel 10: noise drums
    const L = lanes[e.ch];
    switch (e.k) {
      case 'prog': L.prog = e.v; L.ins = chipInstrument(e.v); break;
      case 'on': {
        const I = L.ins;
        L.notes = L.notes.filter(n => n.note !== e.note); L.notes.push({ note: e.note, vel: e.vel / 127, off: false });
        L.vel = I.mode === 'arp' ? Math.max(...L.notes.map(n => n.vel)) : e.vel / 127;
        if (I.mode === 'mono' || L.st === 0 || L.st === 4) { L.st = I.a ? 1 : 2; L.env = I.a ? 0 : 1; L.age = 0; }
        L.cur = e.note; L.used = true; this.tune(L); break;
      }
      case 'off': {
        const n = L.notes.find(q => q.note === e.note); if (!n) break;
        if (L.sus) { n.off = true; break; }
        L.notes = L.notes.filter(q => q !== n);
        if (!L.notes.length) { L.st = L.st ? 4 : 0; L.rel = L.env; }
        break;
      }
      case 'cc':
        if (e.cc === 7) L.vol = e.v / 127;
        else if (e.cc === 11) L.expr = e.v / 127;
        else if (e.cc === 64) { L.sus = e.v >= 64; if (!L.sus) { L.notes = L.notes.filter(q => !q.off); if (!L.notes.length && L.st) { L.st = 4; L.rel = L.env; } } }
        else if (e.cc === 120 || e.cc === 123) { L.notes = []; L.st = 0; L.env = 0; }
        break;
      case 'bend': L.bend = e.v / 8192 * L.bendRange; break;
    }
  },
  hit(note, vel) {
    const D = this.drum, P = chipDrum(note);
    D.vol = P.v * (.45 + .55 * vel / 127); D.dec = D.vol / P.d; D.v4 = Math.round(D.vol);
    D.rate = CHIP_CPU / CHIP_NOISE[P.p] / this.sr; D.mode = P.m;
    if (P.f0) { D.f0 = P.f0; D.f1 = P.f1; D.tlen = P.tl; D.tk = 0; D.tinc = P.f0 / this.sr; }
  },
  // one 60 Hz driver tick: envelopes, arpeggios, vibrato, period quantisation
  tune(L) {
    const I = L.ins;
    let semis = L.cur + L.bend;
    if (I.vib && L.age > 18) semis += Math.sin(L.age * .58) * .2;
    const k = I.kind === 'tri' ? 32 : 16, f = 440 * Math.pow(2, (semis - 69) / 12);
    const t = clamp(Math.round(CHIP_CPU / (k * f) - 1), I.kind === 'tri' ? 2 : 8, 2047);
    L.inc = CHIP_CPU / (k * (t + 1)) / this.sr;
    L.v4 = L.st ? Math.round(clamp(L.env * L.vel * L.vol * L.expr, 0, 1) * 15) : 0;
  },
  laneFrame(L) {
    const I = L.ins;
    if (L.st === 1) { L.env += 1 / I.a; if (L.env >= 1) { L.env = 1; L.st = 2; } }
    else if (L.st === 2) { L.env -= I.d ? (1 - I.s) / I.d : 1; if (L.env <= I.s) { L.env = I.s; L.st = 3; } }
    else if (L.st === 4) { L.env -= I.r ? Math.max(L.rel, .05) / I.r : 1; if (L.env <= 0) { L.env = 0; L.st = 0; } }
    const n = L.notes.length;
    if (n > 1 && I.mode === 'arp') { const s = L.notes.map(q => q.note).sort((a, b) => a - b); L.arp = (L.arp + 1) % n; L.cur = s[L.arp]; }
    else if (n) L.cur = L.notes[n - 1].note;
    L.age++;
    if (L.st || L.v4) this.tune(L);
  },
  frame(t) {
    for (const L of this.lanes) this.laneFrame(L);
    for (const L of this.live) this.laneFrame(L);
    const D = this.drum;
    if (D.vol > 0) { D.vol = Math.max(0, D.vol - D.dec); D.v4 = Math.round(D.vol); }
    if (D.tlen) { D.tk++; if (D.tk >= D.tlen) D.tlen = 0; else D.tinc = D.f0 * Math.pow(D.f1 / D.f0, D.tk / D.tlen) / this.sr; }
    this.act = [...this.lanes, ...this.live].filter(L => L.v4 > 0 || (L.ins.kind === 'tri' && L.used));
    // snapshot for meters / beat-synced effects, stamped with the time it will be heard
    const songT = this.pos / this.sr;
    this.snaps.push({ t, beat: this.song ? this.beatAt(songT) : -1, lanes: this.lanes.map(L => [L.st && L.v4 ? L.cur : -1, L.v4, L.ins.kind === 'tri' ? 0 : L.ins.duty, L.used]), drum: D.v4 });
    if (this.snaps.length > 90) this.snaps.splice(0, this.snaps.length - 90);
  },
  beatAt(sec) {
    const T = this.song.tempos; let seg = T[0];
    for (const s of T) { if (s.t <= sec) seg = s; else break; }
    return seg.tick / this.song.div + (sec - seg.t) * 1e6 / seg.us;
  },
  // the snapshot that matches what the listener hears right now
  meter() {
    if (!this.ctx) return null; const now = this.ctx.currentTime; let best = null;
    for (const s of this.snaps) { if (s.t <= now) best = s; else break; }
    return best;
  },
  synth(out, o, n) {
    const act = this.act, D = this.drum, hpR = this.hpR, lpA = this.lpA;
    let x1 = this.x1, y1 = this.y1, lp = this.lp;
    for (let s = 0; s < n; s++) {
      let p = 0, t = 0, nz = 0;
      for (let k = 0; k < act.length; k++) {
        const L = act[k];
        if (L.ins.kind === 'tri') { if (L.v4 > 0) { L.phase += L.inc; if (L.phase >= 1) L.phase -= 1; } t += CHIP_TRI[(L.phase * 32) | 0]; }
        else { L.phase += L.inc; if (L.phase >= 1) L.phase -= 1; if (L.phase < L.ins.duty) p += L.v4; }
      }
      if (D.v4) {
        D.acc += D.rate;
        while (D.acc >= 1) { D.acc -= 1; const fb = (D.lfsr ^ (D.lfsr >> (D.mode ? 6 : 1))) & 1; D.lfsr = (D.lfsr >> 1) | (fb << 14); }
        if (!(D.lfsr & 1)) nz += D.v4;
      }
      if (D.tlen) { D.tph += D.tinc; if (D.tph >= 1) D.tph -= 1; t += CHIP_TRI[(D.tph * 32) | 0]; }
      let x = p ? 95.88 / (8128 / p + 100) : 0;                // 2A03 pulse DAC
      const tn = t / 8227 + nz / 12241; if (tn > 0) x += 159.79 / (1 / tn + 100);   // triangle/noise DAC
      const hp = x - x1 + hpR * y1; x1 = x; y1 = hp;           // console's DC-blocking high-pass
      lp += (hp - lp) * lpA;                                   // and its gentle low-pass
      out[o + s] = lp * 1.7;
    }
    this.x1 = x1; this.y1 = y1; this.lp = lp;
  },
  render(n, t0) {
    if (!this.buf || this.buf.length !== n) this.buf = new Float32Array(n);
    const out = this.buf; let i = 0;
    while (i < n) {
      let run = Math.min(n - i, this.frameLen - this.frameAcc);
      if (this.playing && this.song) {
        const evs = this.song.events;
        while (this.ev < evs.length && evs[this.ev].s <= this.pos) this.apply(evs[this.ev++], this.lanes);
        if (this.pos >= this.song.durS) {
          if (this.loop) { this.pos = 0; this.ev = 0; for (const L of this.lanes) { L.notes = []; if (L.st) { L.st = 4; L.rel = L.env; } } continue; }
          this.playing = false; for (const L of this.lanes) { L.notes = []; if (L.st) { L.st = 4; L.rel = L.env; } }
          const cb = this.onEnd; this.onEnd = null;
          if (cb) setTimeout(cb, Math.max(0, (t0 + i / this.sr - this.ctx.currentTime) * 1000));
        } else run = Math.min(run, Math.max(1, (this.ev < evs.length ? evs[this.ev].s : this.song.durS) - this.pos));
      }
      this.synth(out, i, run);
      i += run; this.frameAcc += run; if (this.playing) this.pos += run;
      if (this.frameAcc >= this.frameLen) { this.frameAcc = 0; this.frame(t0 + i / this.sr); }
    }
    return out;
  },
  busy() { return this.playing || performance.now() - this.liveT < 4000 || this.act.some(L => L.v4 > 0) || this.drum.v4 > 0; },
  pump() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (!this.busy()) { this.nextTime = 0; return; }
    const now = c.currentTime;
    if (this.nextTime < now + .01) this.nextTime = now + .03;           // first block, or recovering from a stall
    while (this.nextTime < now + this.lead) {
      const n = this.block, data = this.render(n, this.nextTime);
      const b = c.createBuffer(1, n, this.sr); b.copyToChannel(data, 0);
      const s = c.createBufferSource(); s.buffer = b; s.connect(this.gain); s.start(this.nextTime);
      this.srcs.push(s); s.onended = () => { const k = this.srcs.indexOf(s); if (k >= 0) this.srcs.splice(k, 1); };
      this.nextTime += n / this.sr;
    }
  }
};
