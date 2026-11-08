// ===================== ENGINE · Sampler: a 16-bit (SNES-style) sampled sound engine =====================
// A fantasy Super Nintendo sound: every instrument is a short sample, made here from a recipe (no recordings), run through
// the SNES's 4-bit BRR compression and its soft Gaussian read-out, at 32 kHz or lower for more grit. Notes play it back
// pitched, with an SNES-style envelope (attack, decay, sustain level, a slow fall while held, release) and vibrato.
// Around that sits a small studio: per track a 3-band EQ, a filter, chorus, pan, volume and sends; on the master the
// SNES echo (a delay fed back through its 8-tap FIR filter), a reverb, EQ and a compressor. song.snes (the "SNES limits"
// switch) keeps only what the console could do: 8 voices, echo, no EQ, filter, chorus, reverb or compressor.
// Songs are plain data (Sampler.check describes them), made in the SOUND STUDIO (/studio/), which runs this same file.
// Self-contained on purpose (nothing from the other engine parts), so the studio page can load it on its own.
const Sampler = (() => {
  const PPQ = 96, TAU = Math.PI * 2, ZONES = [36, 60, 84];   // ticks per beat; sample roots C2, C4, C6
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  const hz = n => 440 * Math.pow(2, (n - 69) / 12), toMidi = f => 69 + 12 * Math.log2(f / 440);
  const rng = seed => { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

  // ---------- BRR: the SNES's 4-bit sample format, 16 samples per 9-byte block ----------
  // Each block keeps a shift and one of four predictors; the encoder picks the pair with the least error, the decoder
  // adds 4-bit steps to the prediction. What comes back carries the console's quantisation hiss and grit.
  const BRR_F = [[0, 0], [15 / 16, 0], [61 / 32, -15 / 16], [115 / 64, -13 / 16]];
  // samples (-1..1) → BRR bytes: per block a header (shift << 4 | predictor << 2) and eight bytes of two 4-bit steps
  function brrEncode(x) {
    const nb = Math.ceil(x.length / 16), bytes = new Uint8Array(nb * 9), blk = new Float32Array(16), best = new Float32Array(16), nib = new Int8Array(16), bestNib = new Int8Array(16);
    let p1 = 0, p2 = 0;
    for (let bi = 0, b = 0; bi < nb; bi++, b += 16) {
      let bestErr = Infinity, bestHead = 0;
      // (on the console the first block may not predict, which caps it near half volume; decoded once here, it may)
      for (let f = 0; f < 4; f++) {
        // only the shifts near the one this predictor's largest step needs (the rest lose anyway)
        const [c1, c2] = BRR_F[f]; let big = 0;
        for (let k = 0; k < 16; k++) big = Math.max(big, Math.abs((x[b + k] || 0) - (c1 * (k ? x[b + k - 1] || 0 : p1 / 32767) + c2 * (k > 1 ? x[b + k - 2] || 0 : (k ? p1 : p2) / 32767))) * 32767);
        const need = cl(Math.ceil(Math.log2(big / 7 + 1e-9)) + 1, 0, 12);
        for (let sh = Math.max(0, need - 1); sh <= Math.min(12, need + 1); sh++) {
          const step = Math.pow(2, sh - 1);
          let q1 = p1, q2 = p2, err = 0;
          for (let k = 0; k < 16 && err < bestErr; k++) {
            const target = (x[b + k] || 0) * 32767, pred = q1 * c1 + q2 * c2;
            const v = cl(Math.round((target - pred) / step), -8, 7), sv = cl(pred + v * step, -32768, 32767);
            err += (target - sv) * (target - sv); blk[k] = sv; nib[k] = v; q2 = q1; q1 = sv;
          }
          if (err < bestErr) { bestErr = err; best.set(blk); bestNib.set(nib); bestHead = sh << 4 | f << 2; }
        }
      }
      bytes[bi * 9] = bestHead;
      for (let k = 0; k < 8; k++) bytes[bi * 9 + 1 + k] = (bestNib[2 * k] & 15) << 4 | (bestNib[2 * k + 1] & 15);
      p1 = best[15]; p2 = best[14];
    }
    return bytes;
  }
  // BRR bytes → samples, read through the DSP's 4-point Gaussian kernel: a gentle low-pass (round the loop, from loopAt on,
  // for a sample that loops)
  function brrDecode(bytes, loopAt = -1) {
    const nb = Math.floor(bytes.length / 9), n = nb * 16, out = new Float32Array(n);
    let p1 = 0, p2 = 0;
    for (let bi = 0; bi < nb; bi++) {
      const h = bytes[bi * 9], step = Math.pow(2, (h >> 4) - 1), [c1, c2] = BRR_F[(h >> 2) & 3];
      for (let k = 0; k < 16; k++) {
        const byte = bytes[bi * 9 + 1 + (k >> 1)], u = k & 1 ? byte & 15 : byte >> 4, v = u > 7 ? u - 16 : u;
        const sv = cl(p1 * c1 + p2 * c2 + v * step, -32768, 32767);
        out[bi * 16 + k] = sv / 32768; p2 = p1; p1 = sv;
      }
    }
    const g = new Float32Array(n), at = i => i < 0 ? out[0] : i < n ? out[i] : loopAt >= 0 ? out[loopAt + (i - n) % (n - loopAt)] : out[n - 1];
    for (let i = 0; i < n; i++) g[i] = .16 * at(i - 1) + .68 * out[i] + .16 * at(i + 1);
    return g;
  }
  const brr = (x, loop = false) => brrDecode(brrEncode(x), loop ? 0 : -1);
  const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const peakTo = (a, p = .9) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < a.length; i++) a[i] *= p / m; return a; };

  // ---------- instrument recipes ----------
  // A looping "wave" instrument is one cycle built from harmonics, read out by a few slightly detuned copies (det, in cycles
  // per loop: ±1 is ±10 cents) for a chorus that loops seamlessly, at three roots so no note is pitched more than an
  // octave (and its harmonics stay under the sample's Nyquist).
  const LOOP_S = .64;
  function waveZone(rate, root, amp, det, noise) {
    const T = 4096, cyc = new Float32Array(T), r = rng(root * 7 + 3), f0 = hz(root), hmax = Math.min(96, Math.floor(rate * .45 / (f0 * 2)));
    for (let h = 1; h <= hmax; h++) {
      const a = amp(h, h * f0); if (!a) continue;
      const ph = r() * TAU;
      for (let k = 0; k < T; k++) cyc[k] += a * Math.sin(TAU * h * k / T + ph);
    }
    const N = 16 * Math.round(rate * LOOP_S / 16), P = Math.max(1, Math.round(f0 * N / rate)), out = new Float32Array(N);
    for (const d of det) {
      const off = r() * T, inc = (P + d) * T / N;
      for (let i = 0; i < N; i++) { const p = (off + i * inc) % T, k = p | 0, fr = p - k; out[i] += cyc[k] + (cyc[(k + 1) % T] - cyc[k]) * fr; }
    }
    if (noise) {   // breath: band-limited noise across the loop
      let lp = 0, hp = 0;
      for (let i = 0; i < N; i++) { const w = r() * 2 - 1; lp += (w - lp) * .35; hp = lp - hp * .2; out[i] += hp * noise * det.length; }
    }
    return { root: toMidi(P * rate / N), data: brr(peakTo(out), true), loop: true, rate };
  }
  // plucked strings (Karplus-Strong): a burst of noise in a delay line that averages itself down; one-shot
  function ksZone(rate, root, { bright = .6, damp = .998, secs = 2.4, drive = 0, body = 0 }) {
    const L = Math.max(2, Math.round(rate / hz(root))), ring = new Float32Array(L), r = rng(root * 13 + 1), N = Math.round(rate * secs), out = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < L; i++) { lp += (r() * 2 - 1 - lp) * (.1 + bright * .9); ring[i] = lp; }
    let p = 0;
    for (let i = 0; i < N; i++) {
      const a = ring[p], b = ring[(p + 1) % L];
      out[i] = a; ring[p] = damp * (a + b) * .5; p = (p + 1) % L;
    }
    if (body) for (let i = 0; i < N; i++) out[i] += body * Math.sin(TAU * hz(root) * i / rate) * Math.exp(-i / rate / .6);
    if (drive) for (let i = 0; i < N; i++) out[i] = Math.tanh(out[i] * drive * 8);
    return { root: toMidi(rate / (L + .5)), data: brr(peakTo(out)), loop: false, rate };
  }
  // two-operator FM, decaying (electric piano, bells); one-shot
  function fmZone(rate, root, { ratio, index, idecay, decay, secs = 2.6 }) {
    const f = hz(root), N = Math.round(rate * secs), out = new Float32Array(N);
    for (let i = 0; i < N; i++) { const t = i / rate; out[i] = Math.sin(TAU * f * t + index * Math.exp(-t / idecay) * Math.sin(TAU * ratio * f * t)) * Math.exp(-t / decay); }
    return { root, data: brr(peakTo(out)), loop: false, rate };
  }
  function partialsZone(rate, root, parts, secs) {   // struck bars: a few decaying sine partials
    const f = hz(root), N = Math.round(rate * secs), out = new Float32Array(N);
    for (const [m, a, d] of parts) if (f * m < rate * .45) for (let i = 0; i < N; i++) out[i] += a * Math.sin(TAU * f * m * i / rate) * Math.exp(-i / rate / d);
    return { root, data: brr(peakTo(out)), loop: false, rate };
  }

  // ---------- the drum kit (General MIDI note numbers) ----------
  function drum(rate, kind) {
    const r = rng(kind.length * 31 + 7), secs = { kick: .5, snare: .4, clap: .4, hat: .12, open: .5, tom: .5, crash: 1.8, ride: 1.2, rim: .06, shaker: .14 }[kind];
    const N = Math.round(rate * secs), out = new Float32Array(N);
    let ph = 0, lp = 0, hp = 0, prev = 0;
    const noise = () => r() * 2 - 1;
    const metal = t => { let s = 0; for (const f of [205, 304, 369, 523, 540, 800]) s += Math.sign(Math.sin(TAU * f * t * 1.9)); return s / 6; };
    for (let i = 0; i < N; i++) {
      const t = i / rate; let v = 0;
      if (kind === 'kick') { ph += TAU * (44 + 110 * Math.exp(-t / .035)) / rate; v = Math.sin(ph) * Math.exp(-t / .3) + (t < .004 ? noise() * .5 : 0); }
      else if (kind === 'tom') { ph += TAU * (98 + 70 * Math.exp(-t / .05)) / rate; v = Math.sin(ph) * Math.exp(-t / .28) + noise() * .08 * Math.exp(-t / .03); }
      else if (kind === 'snare') { ph += TAU * 185 / rate; lp += (noise() - lp) * .55; hp = lp - prev * .7; prev = lp; v = Math.sin(ph) * .55 * Math.exp(-t / .06) + hp * .8 * Math.exp(-t / .13); }
      else if (kind === 'clap') { const n = noise(); lp += (n - lp) * .4; const env = [0, .011, .022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / .007) : 0), 0) * .6 + Math.exp(-Math.max(0, t - .022) / .1) * .5; v = (lp - prev * .9) * env; prev = lp; }
      else if (kind === 'hat' || kind === 'open' || kind === 'shaker') { const n = noise(); v = (n - prev) * .5 + metal(t) * .25; prev = n; v *= kind === 'shaker' ? Math.min(1, t / .012) * Math.exp(-t / .045) : Math.exp(-t / (kind === 'hat' ? .035 : .28)); }
      else if (kind === 'crash' || kind === 'ride') { const n = noise(); v = ((n - prev) * .6 + metal(t) * .4) * Math.exp(-t / (kind === 'crash' ? .7 : .45)); prev = n; if (kind === 'ride') v += Math.sin(TAU * 3100 * t) * .15 * Math.exp(-t / .4); }
      else if (kind === 'rim') v = Math.sin(TAU * 1700 * t) * Math.exp(-t / .012) + noise() * .2 * Math.exp(-t / .004);
      out[i] = v;
    }
    return { data: brr(peakTo(out, kind === 'kick' || kind === 'snare' ? .95 : .8)), rate };
  }
  // note → [sound, pitch (playback rate), choke group]; the names label the studio's drum rows
  const KIT = {
    35: ['kick', 1, 0, 'Kick 2'], 36: ['kick', 1, 0, 'Kick'], 37: ['rim', 1, 0, 'Rim'], 38: ['snare', 1, 0, 'Snare'], 39: ['clap', 1, 0, 'Clap'],
    40: ['snare', 1.12, 0, 'Snare 2'], 41: ['tom', .75, 0, 'Low tom'], 42: ['hat', 1, 1, 'Closed hat'], 43: ['tom', .85, 0, 'Low tom 2'],
    44: ['hat', .9, 1, 'Pedal hat'], 45: ['tom', 1, 0, 'Mid tom'], 46: ['open', 1, 1, 'Open hat'], 47: ['tom', 1.12, 0, 'Mid tom 2'],
    48: ['tom', 1.3, 0, 'High tom'], 49: ['crash', 1, 0, 'Crash'], 50: ['tom', 1.45, 0, 'High tom 2'], 51: ['ride', 1, 0, 'Ride'],
    54: ['shaker', 1.2, 0, 'Tambourine'], 57: ['crash', .9, 0, 'Crash 2'], 59: ['ride', 1.1, 0, 'Ride 2'], 70: ['shaker', 1, 0, 'Shaker']
  };

  // id → name, group, how to make it, its envelope (seconds; s = sustain level; sd = how fast it falls while held, 0 = holds),
  // vibrato (cents, Hz, delay s) and loudness
  const W = (amp, det = [0], noise = 0) => (rate, root) => waveZone(rate, root, amp, det, noise);
  const formant = (F, h, f) => F.reduce((s, [c, g, bw]) => s + g * Math.exp(-(((f - c) / bw) ** 2)), 0) + .04 / h;
  const CHORUS3 = [-1, 0, 1], CHORUS5 = [-2, -1, 0, 1, 2];
  const DEFS = {
    piano: ['Piano', 'Keys', (r, n) => ksZone(r, n, { bright: .75, damp: .9988, secs: 3, body: .25 }), { a: .002, d: .1, s: 1, sd: 0, r: .25 }],
    epiano: ['Electric piano', 'Keys', (r, n) => fmZone(r, n, { ratio: 1, index: 1.6, idecay: .45, decay: 1.4 }), { a: .002, d: .1, s: 1, sd: 0, r: .3 }],
    organ: ['Organ', 'Keys', W(h => ({ 1: 1, 2: .75, 3: .5, 4: .35, 6: .2, 8: .15 }[h] || 0)), { a: .006, d: .05, s: 1, sd: 0, r: .06 }],
    bell: ['Bell', 'Keys', (r, n) => fmZone(r, n, { ratio: 3.5, index: 2.6, idecay: .9, decay: 1.6, secs: 3 }), { a: .001, d: .1, s: 1, sd: 0, r: .8 }, null, .8],
    marimba: ['Marimba', 'Keys', (r, n) => partialsZone(r, n, [[1, 1, .5], [3.93, .35, .12], [9.98, .12, .04]], 1.4), { a: .001, d: .1, s: 1, sd: 0, r: .2 }],
    harp: ['Harp', 'Keys', (r, n) => ksZone(r, n, { bright: .85, damp: .999, secs: 2.6 }), { a: .001, d: .1, s: 1, sd: 0, r: .5 }],
    strings: ['Strings', 'Strings', W((h, f) => 1 / h / (1 + (h / 14) ** 2), CHORUS5), { a: .12, d: .3, s: .85, sd: 0, r: .35 }, [12, 5.5, .25]],
    slowstr: ['Slow strings', 'Strings', W((h, f) => 1 / h / (1 + (h / 10) ** 2), CHORUS5), { a: .6, d: .4, s: .9, sd: 0, r: .9 }, [10, 5, .4]],
    pizz: ['Pizzicato', 'Strings', (r, n) => ksZone(r, n, { bright: .5, damp: .995, secs: 1 }), { a: .001, d: .1, s: 1, sd: 0, r: .15 }],
    choir: ['Choir', 'Strings', W((h, f) => formant([[700, 1, 160], [1220, .5, 180], [2600, .25, 260]], h, f), CHORUS5), { a: .25, d: .3, s: .9, sd: 0, r: .5 }, [10, 5, .3]],
    brass: ['Brass', 'Winds', W((h, f) => Math.pow(h, -.75) * (1 + 1.5 * Math.exp(-(((f - 1200) / 700) ** 2))), CHORUS3), { a: .04, d: .2, s: .8, sd: 0, r: .12 }, [15, 5.5, .3]],
    trumpet: ['Trumpet', 'Winds', W((h, f) => Math.pow(h, -.5) * Math.exp(-f / 4000)), { a: .03, d: .15, s: .85, sd: 0, r: .1 }, [20, 5.8, .25]],
    flute: ['Flute', 'Winds', W(h => [1, .12, .06, .02][h - 1] || 0, [0], .05), { a: .05, d: .2, s: .9, sd: 0, r: .12 }, [18, 5, .2], .9],
    oboe: ['Oboe', 'Winds', W((h, f) => Math.pow(h, -.4) * (1 + 2 * Math.exp(-(((f - 1400) / 500) ** 2))) * (h === 1 ? .5 : 1)), { a: .03, d: .15, s: .85, sd: 0, r: .1 }, [16, 5.5, .25]],
    square: ['Square lead', 'Synth', W(h => h % 2 ? 1 / h : 0), { a: .003, d: .2, s: .7, sd: 0, r: .08 }, [14, 6, .3], .7],
    saw: ['Saw lead', 'Synth', W(h => 1 / h, CHORUS3), { a: .003, d: .2, s: .75, sd: 0, r: .1 }, [14, 6, .3], .7],
    pulse: ['Pulse lead', 'Synth', W(h => Math.abs(Math.sin(Math.PI * h * .25)) / h), { a: .003, d: .2, s: .7, sd: 0, r: .08 }, [14, 6, .3], .7],
    pad: ['Warm pad', 'Synth', W(h => 1 / h / (1 + (h / 6) ** 2), CHORUS5), { a: .5, d: .5, s: .9, sd: 0, r: 1.2 }],
    fingerbass: ['Finger bass', 'Bass', (r, n) => ksZone(r, n, { bright: .3, damp: .9985, secs: 2.4, body: .5 }), { a: .002, d: .1, s: 1, sd: 0, r: .12 }],
    synthbass: ['Synth bass', 'Bass', W(h => 1 / h / (1 + (h / 10) ** 2)), { a: .003, d: .25, s: .55, sd: 0, r: .06 }],
    guitar: ['Guitar', 'Guitar', (r, n) => ksZone(r, n, { bright: .55, damp: .998, secs: 2.4 }), { a: .002, d: .1, s: 1, sd: 0, r: .2 }],
    overdrive: ['Overdrive guitar', 'Guitar', (r, n) => ksZone(r, n, { bright: .6, damp: .9995, secs: 3, drive: 1 }), { a: .002, d: .1, s: 1, sd: 0, r: .15 }, null, .55],
    kit: ['Drum kit', 'Drums', null, { a: 0, d: 0, s: 1, sd: 0, r: .05 }]
  };
  const INSTRUMENTS = Object.entries(DEFS).map(([id, d]) => ({ id, name: d[0], group: d[1] }));
  const RATES = [32000, 16000, 11025, 8000];

  // made on first use, then kept: one entry per instrument and sample rate (AudioBuffers work in any audio context)
  const made = new Map();
  // a song's own sample (song.samples[id]): what it is, so a changed sample makes a new instrument
  const sampleOf = (id, song) => id.startsWith('sample:') && song && song.samples ? song.samples[id.slice(7)] : null;
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i += 7) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length; };
  const keyOf = (id, rate, song) => { const sm = sampleOf(id, song); return sm ? `${id}:${hashStr(sm.brr)}:${sm.rate}:${sm.root}:${sm.loop}` : id + '@' + rate; };
  const SAMPLE_ENV = { a: .002, d: .1, s: 1, sd: 0, r: .2 };
  function instrument(id, rate, song) {
    const key = keyOf(id, rate, song);
    if (made.has(key)) return made.get(key);
    const sm = sampleOf(id, song);
    if (sm) {   // one zone at the sample's own root; it loops from sm.loop to its end, or plays once
      const data = brrDecode(fromB64(sm.brr), sm.loop), n = Math.min(data.length, Math.round(sm.rate * .3));
      let e = 0; for (let i = 0; i < n; i++) e += data[i] * data[i];
      const buffer = new AudioBuffer({ length: Math.max(16, data.length), sampleRate: sm.rate, numberOfChannels: 1 }); buffer.copyToChannel(data, 0);
      const level = Math.min(4, .25 / Math.sqrt(e / n || 1));
      const inst = { zones: [{ root: sm.root, loop: sm.loop >= 0, loopStart: Math.max(0, sm.loop) / sm.rate, buffer }], level, env: SAMPLE_ENV, vib: [0, 5, .3], gain: level };
      made.set(key, inst);
      return inst;
    }
    const def = DEFS[id] || DEFS.piano, buf = z => { const b = new AudioBuffer({ length: z.data.length, sampleRate: z.rate, numberOfChannels: 1 }); b.copyToChannel(z.data, 0); return b; };
    let inst;
    if (id === 'kit') {
      const sounds = {};
      for (const [n, [kind, pitch, choke]] of Object.entries(KIT)) { sounds[kind] ??= buf(drum(rate, kind)); }
      inst = { kit: Object.fromEntries(Object.entries(KIT).map(([n, [kind, pitch, choke]]) => [n, { buffer: sounds[kind], pitch, choke }])) };
      inst.level = 1;
    } else {
      const zs = ZONES.map(root => def[2](rate, root)), mid = zs[1].data, n = Math.min(mid.length, Math.round(zs[1].rate * .3));
      let e = 0; for (let i = 0; i < n; i++) e += mid[i] * mid[i];
      inst = { zones: zs.map(z => ({ root: z.root, loop: z.loop, loopStart: 0, buffer: buf(z) })), level: Math.min(4, .25 / Math.sqrt(e / n || 1)) };   // as loud as each other
    }
    inst.env = def[3]; inst.vib = def[4] || [0, 5, .3]; inst.gain = (def[5] || 1) * inst.level;
    made.set(key, inst);
    return inst;
  }

  // ---------- songs ----------
  const TRACK = () => ({ name: 'Track', instrument: 'piano', volume: .8, pan: 0, mute: false, solo: false,
    sound: { octave: 0, fine: 0, rate: 32000, attack: null, decay: null, sustain: null, fall: null, release: null, vibrato: null },
    eq: { low: 0, mid: 0, midFreq: 1000, high: 0 }, filter: { type: 'off', freq: 2000, q: .7 }, chorus: { mix: 0, rate: .8, depth: 4 },
    sends: { echo: 0, reverb: .2 }, notes: [] });
  const MASTER = () => ({ volume: .8, echo: { delay: 6, feedback: .35, fir: 'soft', volume: .25 }, reverb: { size: 1.6, damp: .5, volume: .35 },
    eq: { low: 0, high: 0 }, comp: .3 });
  function merge(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    for (const k of Object.keys(dst)) {
      const v = src[k];
      if (v === undefined) continue;
      if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], v);
      else if (typeof v === typeof dst[k] || dst[k] === null || Array.isArray(dst[k])) dst[k] = v;
    }
    return dst;
  }
  // a song with every field present and sane (missing fields take their defaults); throws on something that is not a song
  function check(s) {
    if (!s || typeof s !== 'object' || s.format !== 'pixelite-song') throw new Error('not a Pixelite song');
    const out = merge({ format: 'pixelite-song', version: 1, title: 'Untitled', bpm: 120, beatsPerBar: 4, bars: 8, snes: false,
      loop: { on: false, start: 0, end: 8 * 4 * PPQ }, places: { title: false, levels: [], note: '' }, master: MASTER(), tracks: [] },
      { ...s, tracks: undefined, samples: undefined });
    // where in its game the song plays: the title screen, levels (by index in the game's level list), and a note for the rest
    out.places.title = !!out.places.title; out.places.note = String(out.places.note).slice(0, 300);
    out.places.levels = [...new Set((Array.isArray(out.places.levels) ? out.places.levels : []).filter(Number.isInteger).filter(l => l >= 0 && l < 100))].sort((a, b) => a - b);
    // the song's own samples (loaded in the studio): BRR bytes in base64, the rate they are at, the note they sound, where they loop
    out.samples = {};
    for (const [id, sm] of Object.entries(s.samples && typeof s.samples === 'object' ? s.samples : {})) {
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) || !sm || typeof sm.brr !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(sm.brr) || !sm.brr.length) continue;
      const len = Math.floor(sm.brr.length * 3 / 4 / 9) * 16;
      out.samples[id] = { name: String(sm.name || id).slice(0, 40), rate: RATES.includes(sm.rate) ? sm.rate : 32000, root: cl(+sm.root || 60, 0, 127),
        loop: Number.isInteger(sm.loop) && sm.loop >= 0 && sm.loop < len ? sm.loop - sm.loop % 16 : -1, brr: sm.brr };
    }
    out.bpm = cl(+out.bpm || 120, 30, 300); out.beatsPerBar = cl(Math.round(out.beatsPerBar) || 4, 1, 12); out.bars = cl(Math.round(out.bars) || 8, 1, 512);
    out.tracks = (Array.isArray(s.tracks) ? s.tracks : []).slice(0, 32).map(t => {
      const tr = merge(TRACK(), t);
      if (!DEFS[tr.instrument] && !(tr.instrument.startsWith('sample:') && out.samples[tr.instrument.slice(7)])) tr.instrument = 'piano';
      if (!RATES.includes(tr.sound.rate)) tr.sound.rate = 32000;
      tr.notes = (Array.isArray(t.notes) ? t.notes : []).filter(n => Array.isArray(n) && n.length >= 4 && n.every(Number.isFinite))
        .map(([at, len, note, vel]) => [Math.max(0, Math.round(at)), Math.max(1, Math.round(len)), cl(Math.round(note), 0, 127), cl(Math.round(vel), 1, 127)])
        .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      return tr;
    });
    return out;
  }
  const newSong = () => check({ format: 'pixelite-song', title: 'New song', tracks: [{ name: 'Piano' }] });
  const newTrack = (instrument = 'piano') => merge(TRACK(), { name: DEFS[instrument] ? DEFS[instrument][0] : 'Track', instrument });
  const songEnd = s => s.bars * s.beatsPerBar * PPQ;

  // ---------- the mixer: a graph per audio context ----------
  // the SNES echo's FIR presets (taps of 1/128, as the console's registers), scaled so no frequency gains: any feedback < 1 dies away
  const FIR = { flat: [127, 0, 0, 0, 0, 0, 0, 0], soft: [-1, 8, 23, 36, 36, 23, 8, -1], dark: [12, 16, 20, 20, 20, 16, 12, 12], bright: [96, -40, 20, -8, 0, 0, 0, 0] };
  function firBuffer(ctx, name) {
    const taps = FIR[name] || FIR.soft;
    let peak = 0;
    for (let k = 0; k <= 64; k++) { let re = 0, im = 0; taps.forEach((c, i) => { re += c * Math.cos(Math.PI * k / 64 * i); im -= c * Math.sin(Math.PI * k / 64 * i); }); peak = Math.max(peak, Math.hypot(re, im)); }
    const step = ctx.sampleRate / 32000, b = ctx.createBuffer(1, Math.ceil(8 * step) + 1, ctx.sampleRate), d = b.getChannelData(0);
    taps.forEach((c, i) => { d[Math.round(i * step)] += c / peak; });
    return b;
  }
  const irs = new Map();
  function reverbIR(ctx, size, damp) {
    const key = `${ctx.sampleRate}:${size.toFixed(2)}:${damp.toFixed(2)}`;
    if (irs.has(key)) return irs.get(key);
    const sr = ctx.sampleRate, n = Math.round(sr * size), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), r = rng(17 + c * 101); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, k = Math.min(.95, .15 + damp * .8 * t / size); lp += (r() * 2 - 1 - lp) * (1 - k); d[i] = lp * Math.exp(-6.9 * t / size) * (i < sr * .008 ? i / (sr * .008) : 1); }
    }
    irs.set(key, b);
    return b;
  }
  function makeMix(ctx, out) {
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; }, bq = (type, f) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; return n; };
    const M = { ctx, strips: [], voices: [], sum: g(1), eqL: bq('lowshelf', 150), eqH: bq('highshelf', 6000), lp: bq('lowpass', 20000), comp: ctx.createDynamicsCompressor(), vol: g(.64),
      echoIn: g(1), echoDelay: ctx.createDelay(.5), fir: ctx.createConvolver(), echoFb: g(.3), echoVol: g(.25), revIn: g(1), rev: ctx.createConvolver(), revVol: g(.3), click: g(.25), firName: '', revKey: '' };
    M.fir.normalize = false; M.lp.Q.value = .5;
    M.sum.connect(M.eqL); M.eqL.connect(M.eqH); M.eqH.connect(M.lp); M.lp.connect(M.comp); M.comp.connect(M.vol); M.vol.connect(out); M.click.connect(out);
    M.echoIn.connect(M.echoDelay); M.echoDelay.connect(M.fir); M.fir.connect(M.echoFb); M.echoFb.connect(M.echoDelay); M.fir.connect(M.echoVol); M.echoVol.connect(M.sum);
    M.revIn.connect(M.rev); M.rev.connect(M.revVol); M.revVol.connect(M.sum);
    return M;
  }
  function makeStrip(M) {
    const c = M.ctx, g = v => { const n = c.createGain(); n.gain.value = v; return n; }, bq = (type, f) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; return n; };
    const S = { in: g(1), lo: bq('lowshelf', 200), mid: bq('peaking', 1000), hi: bq('highshelf', 4000), filt: bq('allpass', 1000), dry: g(1), wet: g(0), cho: c.createDelay(.05),
      lfo: c.createOscillator(), lfoAmt: g(0), pan: c.createStereoPanner(), vol: g(.64), mute: g(1), echo: g(0), rev: g(0), layer: 1, marks: [] };
    S.mid.Q.value = .9; S.cho.delayTime.value = .012;
    S.in.connect(S.lo); S.lo.connect(S.mid); S.mid.connect(S.hi); S.hi.connect(S.filt);
    S.filt.connect(S.dry); S.filt.connect(S.cho); S.cho.connect(S.wet); S.lfo.connect(S.lfoAmt); S.lfoAmt.connect(S.cho.delayTime); S.lfo.start();
    S.dry.connect(S.pan); S.wet.connect(S.pan); S.pan.connect(S.vol); S.vol.connect(S.mute);
    S.mute.connect(M.sum); S.mute.connect(S.echo); S.mute.connect(S.rev); S.echo.connect(M.echoIn); S.rev.connect(M.revIn);
    return S;
  }
  const set = (p, v, now, smooth) => { if (smooth) p.setTargetAtTime(v, now, .02); else p.value = v; };
  function applyMaster(M, song, smooth = true) {
    const m = song.master, now = M.ctx.currentTime, snes = song.snes;
    set(M.vol.gain, m.volume * m.volume, now, smooth);
    set(M.echoDelay.delayTime, cl(Math.round(m.echo.delay), 1, 15) * .016, now, smooth);
    set(M.echoFb.gain, cl(m.echo.feedback, -.95, .95), now, smooth); set(M.echoVol.gain, cl(m.echo.volume, 0, 1), now, smooth);
    if (M.firName !== m.echo.fir) { M.firName = m.echo.fir; M.fir.buffer = firBuffer(M.ctx, m.echo.fir); }
    const rk = `${m.reverb.size}:${m.reverb.damp}`;
    if (M.revKey !== rk) { M.revKey = rk; M.rev.buffer = reverbIR(M.ctx, cl(m.reverb.size, .2, 6), cl(m.reverb.damp, 0, 1)); }
    set(M.revVol.gain, snes ? 0 : m.reverb.volume, now, smooth);
    set(M.eqL.gain, snes ? 0 : m.eq.low, now, smooth); set(M.eqH.gain, snes ? 0 : m.eq.high, now, smooth);
    set(M.lp.frequency, snes ? 15000 : Math.min(20000, M.ctx.sampleRate * .45), now, smooth);
    const k = snes ? 0 : cl(m.comp, 0, 1);
    M.comp.threshold.value = -26 * k; M.comp.ratio.value = 1 + 7 * k; M.comp.knee.value = 12; M.comp.attack.value = .006; M.comp.release.value = .2;
  }
  function applyTrack(M, S, tr, song, solo, smooth = true) {
    const now = M.ctx.currentTime, snes = song.snes;
    set(S.lo.gain, snes ? 0 : tr.eq.low, now, smooth); set(S.mid.gain, snes ? 0 : tr.eq.mid, now, smooth); set(S.hi.gain, snes ? 0 : tr.eq.high, now, smooth);
    set(S.mid.frequency, cl(tr.eq.midFreq, 100, 8000), now, smooth);
    const ft = snes || tr.filter.type === 'off' ? 'allpass' : tr.filter.type;
    if (S.filt.type !== ft) S.filt.type = ft;
    set(S.filt.frequency, cl(tr.filter.freq, 30, 18000), now, smooth); set(S.filt.Q, ft === 'allpass' ? .0001 : cl(tr.filter.q, .1, 18), now, smooth);
    const mix = snes ? 0 : cl(tr.chorus.mix, 0, 1);
    set(S.wet.gain, mix * .8, now, smooth); set(S.dry.gain, 1 - mix * .35, now, smooth);
    set(S.lfo.frequency, cl(tr.chorus.rate, .05, 8), now, smooth); set(S.lfoAmt.gain, cl(tr.chorus.depth, 0, 10) / 1000, now, smooth);
    set(S.pan.pan, cl(tr.pan, -1, 1), now, smooth); set(S.vol.gain, tr.volume * tr.volume, now, smooth);
    const audible = !tr.mute && (!solo || tr.solo);
    set(S.mute.gain, audible ? S.layer : 0, now, smooth);
    set(S.echo.gain, cl(tr.sends.echo, 0, 1), now, smooth); set(S.rev.gain, snes ? 0 : cl(tr.sends.reverb, 0, 1), now, smooth);
  }
  function syncMix(M, song, smooth = true) {
    while (M.strips.length < song.tracks.length) M.strips.push(makeStrip(M));
    const solo = song.tracks.some(t => t.solo);
    song.tracks.forEach((tr, i) => applyTrack(M, M.strips[i], tr, song, solo, smooth));
    for (let i = song.tracks.length; i < M.strips.length; i++) M.strips[i].mute.gain.value = 0;
    applyMaster(M, song, smooth);
  }

  // ---------- voices ----------
  // the envelope's level `dt` seconds after the note began, for a note let go at `off` (seconds after it began, or Infinity)
  function envAt(E, peak, dt, off) {
    const lvl = t => {
      if (t <= 0) return 0;
      if (t < E.a) return peak * t / E.a;
      const S = peak * E.s, k = Math.max(E.d / 3, 1e-4), d = Math.min(t, E.a + E.d) - E.a;
      let v = S + (peak - S) * Math.exp(-d / k);
      if (t > E.a + E.d) v = E.sd > 0 ? v * Math.exp(-(t - E.a - E.d) / E.sd) : S + (peak - S) * Math.exp(-(t - E.a) / k);
      return v;
    };
    return dt <= off ? lvl(dt) : lvl(off) * Math.exp(-(dt - off) / Math.max(E.r / 4, 1e-3));
  }
  function envOf(inst, tr) {
    const s = tr.sound, E = inst.env;
    return { a: Math.max(.001, s.attack ?? E.a), d: Math.max(.001, s.decay ?? E.d), s: cl(s.sustain ?? E.s, 0, 1), sd: Math.max(0, s.fall ?? E.sd), r: Math.max(.005, s.release ?? E.r) };
  }
  const MAX_VOICES = 48;
  // start a note at time t on track ti; dur in seconds, or null for a live note (let go later with releaseVoice)
  function startVoice(M, song, ti, note, vel, t, dur, bend = 0) {
    const tr = song.tracks[ti], S = M.strips[ti]; if (!tr || !S) return null;
    const inst = instrument(tr.instrument, tr.sound.rate, song), c = M.ctx;
    let buffer, rateMul, loop = false, loopStart = 0, choke = 0, kit = !!inst.kit;
    if (kit) {
      const k = inst.kit[note]; if (!k) return null;
      buffer = k.buffer; rateMul = k.pitch; choke = k.choke;
    } else {
      const n = note + 12 * tr.sound.octave + tr.sound.fine / 100;
      let z = inst.zones[0]; for (const q of inst.zones) if (Math.abs(q.root - n) < Math.abs(z.root - n) - .01) z = q;
      buffer = z.buffer; rateMul = Math.pow(2, (n - z.root) / 12); loop = z.loop; loopStart = z.loopStart;
    }
    // voice limit (8 with SNES limits): end the voice that matters least (one already let go, else the oldest), quickly
    const cap = song.snes ? 8 : MAX_VOICES;
    M.voices = M.voices.filter(v => v.end > t);
    if (kit && choke) for (const v of M.voices) if (v.choke === choke && v.ti === ti && v.t0 < t) cut(v, t);
    for (;;) {
      const live = M.voices.filter(v => v.end > t + .006);
      if (live.length < cap) break;
      const let_go = live.filter(v => v.relAt !== undefined && v.relAt <= t), pool = let_go.length ? let_go : live;
      cut(pool.reduce((a, b) => a.t0 <= b.t0 ? a : b), t);
    }
    const E = kit ? { a: .001, d: .001, s: 1, sd: 0, r: .05 } : envOf(inst, tr);
    const peak = Math.pow(vel / 127, 1.5) * inst.gain * 1.2;
    const src = c.createBufferSource(), gn = c.createGain();
    src.buffer = buffer; src.playbackRate.value = rateMul; src.detune.value = bend * 100;
    if (loop) { src.loop = true; src.loopStart = loopStart; src.loopEnd = buffer.duration; }
    src.connect(gn); gn.connect(S.in);
    // the envelope: attack ramp, decay toward the sustain level, then (fall) toward silence while held; drums ignore note-offs
    const p = gn.gain, off = kit || dur == null ? Infinity : Math.max(.005, dur);
    p.setValueAtTime(0, t);
    if (off < E.a) p.linearRampToValueAtTime(envAt(E, peak, off, Infinity), t + off);
    else {
      p.linearRampToValueAtTime(peak, t + E.a); p.setTargetAtTime(peak * E.s, t + E.a, Math.max(E.d / 3, 1e-4));
      if (E.sd > 0 && off > E.a + E.d) p.setTargetAtTime(0, t + E.a + E.d, E.sd);
    }
    let lfo = null;
    const vib = tr.sound.vibrato ?? inst.vib;
    if (!kit && vib && vib[0] > 0) {
      lfo = c.createOscillator(); const amt = c.createGain();
      lfo.frequency.value = vib[1]; amt.gain.setValueAtTime(0, t + vib[2]); amt.gain.linearRampToValueAtTime(vib[0], t + vib[2] + .35);
      lfo.connect(amt); amt.connect(src.detune); lfo.start(t);
    }
    const v = { src, gn, lfo, E, peak, t0: t, off, ti, choke, kit, end: Infinity, relAt: undefined };
    src.start(t);
    if (kit) { v.end = t + buffer.duration / rateMul; src.stop(v.end + .01); }
    else if (off !== Infinity) {   // a note of known length (a song): its release is scheduled now, from where the envelope will be
      p.setTargetAtTime(0, t + off, Math.max(E.r / 4, 1e-3));
      v.relAt = t + off; v.end = v.relAt + E.r * 1.6 + .02; src.stop(v.end); if (lfo) lfo.stop(v.end);
    }
    M.voices.push(v);
    S.marks.push([t, vel / 127]); if (S.marks.length > 32) S.marks.shift();
    return v;
  }
  // let a live note go at `at`
  function release(v, at) {
    if (v.relAt !== undefined) return;
    v.relAt = at; v.off = at - v.t0;
    const p = v.gn.gain;
    p.cancelScheduledValues(at); p.setValueAtTime(envAt(v.E, v.peak, v.off, Infinity), at); p.setTargetAtTime(0, at, Math.max(v.E.r / 4, 1e-3));
    v.end = at + v.E.r * 1.6 + .02;
    v.src.stop(v.end); if (v.lfo) v.lfo.stop(v.end);
  }
  function cut(v, at) {   // a stolen or choked voice, or the music stopping: down in 5 ms
    const p = v.gn.gain, lvl = envAt(v.E, v.peak, at - v.t0, v.relAt !== undefined ? v.relAt - v.t0 : Infinity);
    p.cancelScheduledValues(at); p.setValueAtTime(lvl, at); p.linearRampToValueAtTime(0, at + .005);
    v.end = at + .006; v.relAt ??= at;
    try { v.src.stop(at + .008); if (v.lfo) v.lfo.stop(at + .008); } catch (e) { }
  }

  // ---------- scheduling a song ----------
  // notes of every track whose start falls in [a, b) ticks, at the times the playhead `seg` puts them
  function scheduleRange(M, song, a, b, tickTime, loopEnd, clicks) {
    const spt = 60 / song.bpm / PPQ;
    song.tracks.forEach((tr, ti) => {
      const N = tr.notes; let lo = 0, hi = N.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (N[mid][0] < a) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < N.length && N[i][0] < b; i++) {
        const [at, len, note, vel] = N[i];
        const v = startVoice(M, song, ti, note, vel, tickTime(at), Math.min(len, loopEnd - at) * spt);
        if (v && tr.instrument === 'kit' && note >= 35 && note <= 40 && M.hits) M.hits.push([tickTime(at), vel / 127]);
      }
    });
    if (clicks) for (let k = Math.ceil(a / PPQ) * PPQ; k < b; k += PPQ) clicks(tickTime(k), Math.round(k / PPQ) % song.beatsPerBar === 0);
  }
  function click(M, t, accent) {
    const c = M.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = accent ? 1760 : 1320; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.5, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .05);
    o.connect(g); g.connect(M.click); o.start(t); o.stop(t + .06);
  }

  // ---------- the live engine (one audio context: a game's, or the studio's) ----------
  const LEAD = .12;
  const E = {
    PPQ, INSTRUMENTS, KIT: Object.fromEntries(Object.entries(KIT).map(([n, k]) => [n, k[3]])), RATES, FIRS: Object.keys(FIR),
    ctx: null, out: null, mix: null, song: null, playing: false, metronome: false, pending: null, timer: 0, gain: null, vol: 1,
    check, newSong, newTrack, songEnd, envAt, brr, brrEncode, brrDecode, toB64, fromB64, forced: null,
    // an instrument's own envelope and vibrato (what a track's sound settings left at null mean)
    defaults: id => id.startsWith('sample:') ? { env: { ...SAMPLE_ENV }, vib: [0, 5, .3] } : { env: { ...(DEFS[id] || DEFS.piano)[3] }, vib: [...((DEFS[id] || DEFS.piano)[4] || [0, 5, .3])] },
    // make a song's instruments now, one at a time between frames (making one takes ~0.1 s), so its first notes don't stall;
    // play() makes any that are missing on the spot
    async prepare(song) {
      for (const tr of song.tracks) if (!made.has(keyOf(tr.instrument, tr.sound.rate, song))) { instrument(tr.instrument, tr.sound.rate, song); await new Promise(r => setTimeout(r, 0)); }
    },
    init(ctx, dest) {
      if (this.ctx || !ctx) return;
      this.ctx = ctx; this.gain = ctx.createGain(); this.gain.gain.value = this.vol; this.gain.connect(dest || ctx.destination);
      if (this.pending) { const [s, o] = this.pending; this.pending = null; this.play(s, o); }
    },
    // make `song` the current one (its mixer follows it); call sync() after changing its settings
    use(song) {
      if (!this.ctx) return;
      if (!this.mix) { this.mix = makeMix(this.ctx, this.gain); this.mix.hits = []; }
      if (this.song !== song) { for (const S of this.mix.strips) S.layer = 1; this.song = song; }
      syncMix(this.mix, song, false);
    },
    sync() { if (this.mix && this.song) syncMix(this.mix, this.song); },
    // play from tick `from` (may be negative: a count-in); loops the song's loop region, or the whole song, unless loop: false
    play(song, { from = 0, loop = true, fadeIn = 0, onEnd = null } = {}) {
      if (this.forced && song !== this.forced) return;   // a page previewing a song in this game has the say
      if (!this.ctx) { this.pending = [song, { from, loop, fadeIn, onEnd }]; return; }
      this.halt();
      this.use(song);
      for (const tr of song.tracks) instrument(tr.instrument, tr.sound.rate, song);
      const now = this.ctx.currentTime + .05, g = this.gain.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(fadeIn ? 0 : this.vol, now); if (fadeIn) g.linearRampToValueAtTime(this.vol, now + fadeIn);
      this.P = { cursor: from, time: now, loop, onEnd, segs: [[now, from]] };
      this.playing = true;
      this.pump(); this.timer = setInterval(() => this.pump(), 25);
    },
    // play this song and nothing else (the game's own music stays quiet) until force(null): the SOUND STUDIO previewing a
    // song inside the game; the Chip keeps quiet too
    force(song) {
      this.forced = song ? check(song) : null;
      if (typeof Chip !== 'undefined' && Chip.playing) Chip.stop(.2);
      if (this.forced) { this.pending = null; this.play(this.forced, { fadeIn: .3 }); } else this.stop(.3);
    },
    stop(fade = .15) {
      if (!this.playing) return;
      this.playing = false; clearInterval(this.timer);
      const now = this.ctx.currentTime;
      for (const v of this.mix.voices) {
        if (v.end <= now) continue;
        if (v.t0 >= now) cut(v, v.t0);
        else { release(v, now); if (v.end > now + fade) cut(v, now + fade); }
      }
      this.P = null;
    },
    halt() { if (this.playing) this.stop(.02); },
    pump() {
      const P = this.P, song = this.song; if (!P || !song) return;
      const spt = 60 / song.bpm / PPQ, end = songEnd(song), lp = song.loop, target = this.ctx.currentTime + LEAD;
      const ls = lp.on ? cl(lp.start, 0, end - 1) : 0, le = lp.on ? cl(lp.end, ls + 1, end) : end;
      while (P.time < target) {
        const stopAt = P.loop && P.cursor < le ? le : end;
        let b = Math.min(stopAt, P.cursor + Math.ceil((target - P.time) / spt) + 1);
        if (b <= P.cursor) b = P.cursor + 1;
        const c0 = P.cursor, t0 = P.time;
        scheduleRange(this.mix, song, c0, b, k => t0 + (k - c0) * spt, P.loop && c0 < le ? le : end, (this.metronome || c0 < 0) ? (t, acc) => click(this.mix, t, acc) : null);
        P.time = t0 + (b - c0) * spt; P.cursor = b;
        if (P.cursor >= stopAt) {
          if (P.loop && stopAt === le) { P.cursor = ls; P.segs.push([P.time, ls]); if (P.segs.length > 16) P.segs.shift(); }
          else { const cb = P.onEnd, at = P.time; this.playing = false; clearInterval(this.timer); this.P = null;
            if (cb) setTimeout(cb, Math.max(0, (at - this.ctx.currentTime) * 1000)); return; }
        }
      }
    },
    // the tick being heard now (-1 when nothing plays)
    position() {
      const P = this.P; if (!P || !this.song) return -1;
      const now = this.ctx.currentTime; let seg = P.segs[0];
      for (const s of P.segs) if (s[0] <= now) seg = s;
      return seg[1] + (now - seg[0]) * this.song.bpm / 60 * PPQ;
    },
    // live notes (a MIDI keyboard, the studio's keys): noteOn returns the voice to give noteOff
    noteOn(ti, note, vel = 100, bend = 0) {
      if (!this.ctx || !this.song) return null;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return startVoice(this.mix, this.song, ti, note, vel, this.ctx.currentTime + .005, null, bend);
    },
    noteOff(v) { if (v && !v.kit && this.ctx) release(v, Math.max(this.ctx.currentTime, v.t0 + .001)); },
    bend(v, semis) { if (v && !v.kit) v.src.detune.setTargetAtTime(semis * 100, this.ctx.currentTime, .01); },
    // games: bring a track (by name or index) in or out, e.g. drums when the danger starts
    track(which, { volume = 1, fade = .5 } = {}) {
      const s = this.song; if (!s || !this.mix) return;
      const i = typeof which === 'number' ? which : s.tracks.findIndex(t => t.name === which);
      const S = this.mix.strips[i]; if (!S) return;
      S.layer = cl(volume, 0, 1);
      const solo = s.tracks.some(t => t.solo), tr = s.tracks[i], aud = !tr.mute && (!solo || tr.solo);
      S.mute.gain.setTargetAtTime(aud ? S.layer : 0, this.ctx.currentTime, Math.max(.01, fade / 3));
    },
    setVolume(v) { this.vol = cl(v, 0, 1); if (this.gain) this.gain.gain.setTargetAtTime(this.vol, this.ctx.currentTime, .05); },
    // what is heard now: musical position in beats, drum hits (0..14, like the NES chip's meter) and each track's level 0..1
    meter() {
      if (!this.mix || !this.song) return null;
      const now = this.ctx.currentTime, pos = this.position();
      const hits = this.mix.hits; while (hits.length && hits[0][0] < now - .2) hits.shift();
      const h = hits.find(([t]) => t <= now && now - t < .06);
      return { beat: pos < 0 ? -1 : pos / PPQ, drum: h ? Math.round(14 * h[1]) : 0,
        tracks: this.mix.strips.map(S => S.marks.reduce((m, [t, v]) => t <= now ? Math.max(m, v * Math.exp(-(now - t) * 4)) : m, 0)) };
    },
    // render `seconds` of a song from tick `from` into an AudioBuffer (offline: exports and tests), looping like play()
    async render(song, { from = 0, seconds = null, sampleRate = 44100, loop = true } = {}) {
      song = check(song);
      const spt = 60 / song.bpm / PPQ, end = songEnd(song);
      const secs = seconds ?? (end - from) * spt + 2;
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate), M = makeMix(ctx, ctx.destination);
      syncMix(M, song, false);
      const lp = song.loop, ls = lp.on ? lp.start : 0, le = lp.on ? lp.end : end;
      let cursor = from, time = 0;
      while (time < secs) {
        const stopAt = loop && cursor < le ? le : end, c0 = cursor, t0 = time;
        scheduleRange(M, song, c0, stopAt, k => t0 + (k - c0) * spt, stopAt, null);
        time += (stopAt - c0) * spt; cursor = stopAt;
        if (loop && stopAt === le && (le - ls) > 0) cursor = ls; else break;
      }
      return ctx.startRendering();
    }
  };
  return E;
})();
