// ===================== ENGINE · Sampler: a 16-bit (SNES-style) sampled sound engine =====================
// A fantasy Super Nintendo sound: every instrument is a short sample, made here from a recipe (no recordings), run through
// the SNES's 4-bit BRR compression and its soft Gaussian read-out, at 32 kHz or lower for more grit. Notes play it back
// pitched, with an SNES-style envelope (attack, decay, sustain level, a slow fall while held, release) and vibrato.
// Around that sits a small studio: per track a 3-band EQ, a filter, chorus, pan, volume and sends; on the master the
// SNES echo (a delay fed back through its 8-tap FIR filter), a reverb, EQ and a compressor. song.snes (the "SNES limits"
// switch) keeps only what the console could do: 8 voices, echo, no EQ, filter, chorus, reverb or compressor.
// A song's own samples can loop between a start and an end of their own, with a crossfade at the seam, and several play as one
// multisample; lanes automate a track's volume, pan, filter, sends, pitch and loop point, and the song's tempo (in steps or
// ramps) and echo; segments of a lane can be curved. A song can hold patterns (short runs of notes) that a track's clips play over and
// over, and drum kits (pads that are the song's own samples or built-in drum sounds, each with its tune, level, pan and choke group).
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
  // Making a sample takes up to 100 ms, so the builders (this encoder, the instrument recipes and the drum kit below) are generators:
  // they `yield` every millisecond or so of work. Called plainly they run to the end at once (brrEncode, instrument(), brr()); between
  // frames prepare() runs them a slice at a time, so a game's first song does not stall its title screen.
  const drain = g => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
  // samples (-1..1) → BRR bytes: per block a header (shift << 4 | predictor << 2) and eight bytes of two 4-bit steps
  function* brrSteps(x) {
    const nb = Math.ceil(x.length / 16), bytes = new Uint8Array(nb * 9), blk = new Float32Array(16), best = new Float32Array(16), nib = new Int8Array(16), bestNib = new Int8Array(16);
    let p1 = 0, p2 = 0;
    for (let bi = 0, b = 0; bi < nb; bi++, b += 16) {
      if ((bi & 127) === 127) yield;
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
  const brrEncode = x => drain(brrSteps(x));
  // BRR bytes → samples, read through the DSP's 4-point Gaussian kernel: a gentle low-pass (round the loop, from loopAt on, to
  // loopEnd (0: the end), for a sample that loops). xfade samples before loopEnd are first blended with the samples before
  // loopAt, so the loop's end flows into its start (a crossfaded loop: the sound under the seam is the same on both sides)
  function brrDecode(bytes, loopAt = -1, loopEnd = 0, xfade = 0) {
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
    const le = loopAt >= 0 && loopEnd > loopAt + 15 && loopEnd < n ? loopEnd : n;
    const x = loopAt >= 0 ? Math.min(Math.round(xfade) | 0, loopAt, (le - loopAt) >> 1) : 0;
    for (let i = 0; i < x; i++) {   // equal-power blend: the tail of the loop turns into the sound that came before its start
      const w = (i + 1) / (x + 1), a = Math.cos(w * Math.PI / 2), b = Math.sin(w * Math.PI / 2);
      out[le - x + i] = out[le - x + i] * a + out[loopAt - x + i] * b;
    }
    const g = new Float32Array(n), at = i => i < 0 ? out[0] : i < le ? out[i] : loopAt >= 0 ? out[loopAt + (i - le) % (le - loopAt)] : out[n - 1];
    for (let i = 0; i < n; i++) g[i] = .16 * at(i - 1) + .68 * out[i] + .16 * at(i + 1);
    return g;
  }
  const brr = (x, loop = false) => brrDecode(brrEncode(x), loop ? 0 : -1);
  function* brrG(x, loop = false) { return brrDecode(yield* brrSteps(x), loop ? 0 : -1); }
  const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const peakTo = (a, p = .9) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < a.length; i++) a[i] *= p / m; return a; };

  // ---------- instrument recipes ----------
  // A looping "wave" instrument is one cycle built from harmonics, read out by a few slightly detuned copies (det, in cycles
  // per loop: ±1 is ±10 cents) for a chorus that loops seamlessly, at three roots so no note is pitched more than an
  // octave (and its harmonics stay under the sample's Nyquist).
  const LOOP_S = .64;
  function* waveZone(rate, root, amp, det, noise) {
    const T = 4096, cyc = new Float32Array(T), r = rng(root * 7 + 3), f0 = hz(root), hmax = Math.min(96, Math.floor(rate * .45 / (f0 * 2)));
    for (let h = 1; h <= hmax; h++) {
      if ((h & 3) === 0) yield;
      const a = amp(h, h * f0); if (!a) continue;
      const ph = r() * TAU;
      for (let k = 0; k < T; k++) cyc[k] += a * Math.sin(TAU * h * k / T + ph);
    }
    const N = 16 * Math.round(rate * LOOP_S / 16), P = Math.max(1, Math.round(f0 * N / rate)), out = new Float32Array(N);
    for (const d of det) {
      yield;
      const off = r() * T, inc = (P + d) * T / N;
      for (let i = 0; i < N; i++) { const p = (off + i * inc) % T, k = p | 0, fr = p - k; out[i] += cyc[k] + (cyc[(k + 1) % T] - cyc[k]) * fr; }
    }
    if (noise) {   // breath: band-limited noise across the loop
      let lp = 0, hp = 0;
      for (let i = 0; i < N; i++) { const w = r() * 2 - 1; lp += (w - lp) * .35; hp = lp - hp * .2; out[i] += hp * noise * det.length; }
    }
    yield;
    return { root: toMidi(P * rate / N), data: yield* brrG(peakTo(out), true), loop: true, rate };
  }
  // plucked strings (Karplus-Strong): a burst of noise in a delay line that averages itself down; one-shot
  function* ksZone(rate, root, { bright = .6, damp = .998, secs = 2.4, drive = 0, body = 0 }) {
    const L = Math.max(2, Math.round(rate / hz(root))), ring = new Float32Array(L), r = rng(root * 13 + 1), N = Math.round(rate * secs), out = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < L; i++) { lp += (r() * 2 - 1 - lp) * (.1 + bright * .9); ring[i] = lp; }
    let p = 0;
    for (let i = 0; i < N; i++) {
      if ((i & 8191) === 8191) yield;
      const a = ring[p], b = ring[(p + 1) % L];
      out[i] = a; ring[p] = damp * (a + b) * .5; p = (p + 1) % L;
    }
    if (body) for (let i = 0; i < N; i++) { if ((i & 8191) === 8191) yield; out[i] += body * Math.sin(TAU * hz(root) * i / rate) * Math.exp(-i / rate / .6); }
    if (drive) for (let i = 0; i < N; i++) { if ((i & 8191) === 8191) yield; out[i] = Math.tanh(out[i] * drive * 8); }
    return { root: toMidi(rate / (L + .5)), data: yield* brrG(peakTo(out)), loop: false, rate };
  }
  // two-operator FM, decaying (electric piano, bells); one-shot
  function* fmZone(rate, root, { ratio, index, idecay, decay, secs = 2.6 }) {
    const f = hz(root), N = Math.round(rate * secs), out = new Float32Array(N);
    for (let i = 0; i < N; i++) { if ((i & 8191) === 8191) yield; const t = i / rate; out[i] = Math.sin(TAU * f * t + index * Math.exp(-t / idecay) * Math.sin(TAU * ratio * f * t)) * Math.exp(-t / decay); }
    return { root, data: yield* brrG(peakTo(out)), loop: false, rate };
  }
  function* partialsZone(rate, root, parts, secs) {   // struck bars: a few decaying sine partials
    const f = hz(root), N = Math.round(rate * secs), out = new Float32Array(N);
    for (const [m, a, d] of parts) if (f * m < rate * .45) for (let i = 0; i < N; i++) { if ((i & 8191) === 8191) yield; out[i] += a * Math.sin(TAU * f * m * i / rate) * Math.exp(-i / rate / d); }
    return { root, data: yield* brrG(peakTo(out)), loop: false, rate };
  }

  // ---------- the drum kit (General MIDI note numbers) ----------
  function* drum(rate, kind) {
    const r = rng(kind.length * 31 + 7), secs = { kick: .5, snare: .4, clap: .4, hat: .12, open: .5, tom: .5, crash: 1.8, ride: 1.2, rim: .06, shaker: .14 }[kind];
    const N = Math.round(rate * secs), out = new Float32Array(N);
    let ph = 0, lp = 0, hp = 0, prev = 0;
    const noise = () => r() * 2 - 1;
    const metal = t => { let s = 0; for (const f of [205, 304, 369, 523, 540, 800]) s += Math.sign(Math.sin(TAU * f * t * 1.9)); return s / 6; };
    for (let i = 0; i < N; i++) {
      if ((i & 8191) === 8191) yield;
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
    return { data: yield* brrG(peakTo(out, kind === 'kick' || kind === 'snare' ? .95 : .8)), rate };
  }
  // note → [sound, pitch (playback rate), choke group]; the names label the studio's drum rows
  const KIT = {
    35: ['kick', 1, 0, 'Kick 2'], 36: ['kick', 1, 0, 'Kick'], 37: ['rim', 1, 0, 'Rim'], 38: ['snare', 1, 0, 'Snare'], 39: ['clap', 1, 0, 'Clap'],
    40: ['snare', 1.12, 0, 'Snare 2'], 41: ['tom', .75, 0, 'Low tom'], 42: ['hat', 1, 1, 'Closed hat'], 43: ['tom', .85, 0, 'Low tom 2'],
    44: ['hat', .9, 1, 'Pedal hat'], 45: ['tom', 1, 0, 'Mid tom'], 46: ['open', 1, 1, 'Open hat'], 47: ['tom', 1.12, 0, 'Mid tom 2'],
    48: ['tom', 1.3, 0, 'High tom'], 49: ['crash', 1, 0, 'Crash'], 50: ['tom', 1.45, 0, 'High tom 2'], 51: ['ride', 1, 0, 'Ride'],
    54: ['shaker', 1.2, 0, 'Tambourine'], 57: ['crash', .9, 0, 'Crash 2'], 59: ['ride', 1.1, 0, 'Ride 2'], 70: ['shaker', 1, 0, 'Shaker']
  };
  // the built-in drum sounds a pad can be (the generators above), and the drum instruments: the built-in kit, or a kit of the song's own
  // (song.kits[id]: pads, each a note with a sample of the song or one of these sounds, its tune in semitones, level, pan and choke group)
  const DRUM_KINDS = ['kick', 'snare', 'hat', 'open', 'tom', 'crash', 'ride', 'rim', 'clap', 'shaker'];
  const isKit = id => id === 'kit' || id.startsWith('drums:');
  // a song's samples, multisamples, kits and patterns are plain objects keyed by id: only an id the song itself holds counts ('constructor' is no sample)
  const own = (o, k) => o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  const kitOf = (id, song) => id.startsWith('drums:') && song ? own(song.kits, id.slice(6)) : null;
  const padOf = (song, id, note) => { const ki = kitOf(id, song); return ki ? ki.pads.find(p => p.note === note) : undefined; };
  // a new kit's 16 pads: the built-in kit's most played sounds on their General MIDI notes
  const newKit = (name = 'Drum kit') => ({ name, pads: [36, 38, 37, 39, 42, 46, 41, 45, 48, 49, 51, 70, 54, 35, 40, 44].map(note => {
    const [sound, pitch, choke] = KIT[note]; return { note, sound, tune: Math.round(1200 * Math.log2(pitch)) / 100, level: 1, pan: 0, choke };
  }) });

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
  const sampleOf = (id, song) => id.startsWith('sample:') && song ? own(song.samples, id.slice(7)) : null;
  // several samples as one instrument (song.multis[id]): each plays over its own range of notes
  const multiOf = (id, song) => id.startsWith('multi:') && song ? own(song.multis, id.slice(6)) : null;
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i += 7) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length; };
  const sampleKey = (sm, loop = sm.loop) => `${hashStr(sm.brr)}:${sm.rate}:${sm.root}:${loop}:${sm.loopEnd || 0}:${sm.xfade || 0}`;
  // where a pad's sound comes from: a sample of the song (played once), or a built-in drum sound at the track's grit; null when the sample is gone
  const padSource = (p, song, rate) => {
    if (p.sample) { const sm = own(song.samples, p.sample); return sm ? { key: `pad:${sampleKey(sm, -1)}`, sm } : null; }
    return { key: `pad:${p.sound}@${rate}`, sm: null };
  };
  const keyOfPads = (id, pads) => `${id}:${pads.map(p => `${p.note}=${p.q.key}`).join('|')}`;
  // only what makes the pads' buffers is in a kit's key: tune, level, pan and choke are read when a note starts, so turning them
  // makes nothing again
  const keyOf = (id, rate, song) => {
    const sm = sampleOf(id, song), mu = multiOf(id, song), ki = kitOf(id, song);
    if (ki) return keyOfPads(id, ki.pads.map(p => ({ note: p.note, q: padSource(p, song, rate) })).filter(p => p.q));
    return mu ? `${id}:${mu.zones.map(z => `${z.lo}-${z.hi}=${sampleKey(song.samples[z.sample])}`).join('|')}` : sm ? `${id}:${sampleKey(sm)}` : id + '@' + rate;
  };
  const SAMPLE_ENV = { a: .002, d: .1, s: 1, sd: 0, r: .2 };
  const sampleLen = sm => Math.floor(sm.brr.length * 3 / 4 / 9) * 16;
  // where a loop lane's 0..1 puts the loop start in a sample: in 16 steps along it (so at most 16 variants of a sample are made),
  // always on a block, and never closer than two blocks to the loop's end
  const loopStep = p => Math.round(cl(p, 0, 1) * 15);
  const loopAtStep = (sm, s) => { const n = sampleLen(sm), le = sm.loopEnd > 31 && sm.loopEnd < n ? sm.loopEnd : n; return Math.max(0, Math.floor(s / 15 * Math.max(0, le - 32) / 16) * 16); };
  // one zone from a song's sample: it loops from `loop` (the sample's own loop start, unless a loop lane moved it) to its loop end, or plays once
  function sampleZone(sm, loop = sm.loop) {
    const data = brrDecode(fromB64(sm.brr), loop, sm.loopEnd, sm.xfade), n = Math.min(data.length, Math.round(sm.rate * .3));
    let e = 0; for (let i = 0; i < n; i++) e += data[i] * data[i];
    const buffer = new AudioBuffer({ length: Math.max(16, data.length), sampleRate: sm.rate, numberOfChannels: 1 }); buffer.copyToChannel(data, 0);
    const le = loop >= 0 && sm.loopEnd > loop + 15 && sm.loopEnd < data.length ? sm.loopEnd / sm.rate : buffer.duration;
    return { root: sm.root, loop: loop >= 0, loopStart: Math.max(0, loop) / sm.rate, loopEnd: le, buffer, sm, level: Math.min(4, .25 / Math.sqrt(e / n || 1)) };
  }
  // the same zone with its loop start moved (a loop lane); made once per step, then kept
  const loopKey = (z, step) => `zv:${sampleKey(z.sm, loopAtStep(z.sm, step))}`;
  function loopZone(z, step) {
    const ls = loopAtStep(z.sm, step), key = loopKey(z, step);
    if (!made.has(key)) made.set(key, sampleZone(z.sm, ls));
    return { ...made.get(key), gain: z.gain, lo: z.lo, hi: z.hi };
  }
  // An instrument is made in steps (and put in `made` when it is done); instrument() below finishes one at once.
  const jobs = new Map();   // key → the steps of an instrument being made, so whoever needs it first carries on from where it got to
  function* instrumentSteps(key, id, rate, song) {
    const jobKey = key;
    try {
      const sm = sampleOf(id, song), mu = multiOf(id, song);
      if (sm) {
        yield;
        const z = sampleZone(sm);
        made.set(key, { zones: [z], level: z.level, env: SAMPLE_ENV, vib: [0, 5, .3], gain: z.level });
        return;
      }
      if (mu) {   // each zone as loud as the others; the notes pick the zone (lo..hi, in notes)
        const zones = [];
        for (const q of mu.zones) { yield; const z = sampleZone(song.samples[q.sample]); zones.push({ ...z, gain: z.level, lo: q.lo, hi: q.hi }); }
        made.set(key, { zones, level: 1, env: SAMPLE_ENV, vib: [0, 5, .3], gain: 1 });
        return;
      }
      const def = DEFS[isKit(id) ? 'kit' : id] || DEFS.piano, buf = z => { const b = new AudioBuffer({ length: z.data.length, sampleRate: z.rate, numberOfChannels: 1 }); b.copyToChannel(z.data, 0); return b; };
      let inst;
      const ki = kitOf(id, song);
      if (ki) {   // a pad's sound is made once whoever uses it (the same sample on two pads, or in two songs, is one buffer)
        // The pads are read once, now: the studio can change one while this is being made, and what is made must be what it is filed under
        const pads = ki.pads.map(p => ({ note: p.note, sound: p.sound, q: padSource(p, song, rate) })).filter(p => p.q);
        key = keyOfPads(id, pads);
        const kit = {};
        for (const { note, sound, q } of pads) {
          if (!made.has(q.key)) {
            if (q.sm) {
              yield;
              const z = sampleZone(q.sm, -1), d = z.buffer.getChannelData(0); let pk = 0;
              for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
              made.set(q.key, { buffer: z.buffer, norm: pk > 0 ? Math.min(4, .9 / pk) : 1 });   // as loud as the built-in sounds before the pad's level
            } else made.set(q.key, { buffer: buf(yield* drum(rate, sound)), norm: 1 });
          }
          const b = made.get(q.key); kit[note] = { buffer: b.buffer, norm: b.norm, pitch: 1, choke: 0, pad: true };
        }
        inst = { kit, level: 1 };
      } else if (id === 'kit') {
        const sounds = {};
        for (const [n, [kind, pitch, choke]] of Object.entries(KIT)) { if (!sounds[kind]) sounds[kind] = buf(yield* drum(rate, kind)); }
        inst = { kit: Object.fromEntries(Object.entries(KIT).map(([n, [kind, pitch, choke]]) => [n, { buffer: sounds[kind], pitch, choke }])) };
        inst.level = 1;
      } else {
        const zs = [];
        for (const root of ZONES) zs.push(yield* def[2](rate, root));
        const mid = zs[1].data, n = Math.min(mid.length, Math.round(zs[1].rate * .3));
        let e = 0; for (let i = 0; i < n; i++) e += mid[i] * mid[i];
        inst = { zones: zs.map(z => ({ root: z.root, loop: z.loop, loopStart: 0, buffer: buf(z) })), level: Math.min(4, .25 / Math.sqrt(e / n || 1)) };   // as loud as each other
      }
      inst.env = def[3]; inst.vib = def[4] || [0, 5, .3]; inst.gain = (def[5] || 1) * inst.level;
      made.set(key, inst);
    } finally { jobs.delete(jobKey); }
  }
  const jobOf = (key, id, rate, song) => { let g = jobs.get(key); if (!g) jobs.set(key, g = instrumentSteps(key, id, rate, song)); return g; };
  function instrument(id, rate, song) {
    const key = keyOf(id, rate, song);
    if (!made.has(key)) drain(jobOf(key, id, rate, song));
    return made.get(key);
  }

  // ---------- making instruments between frames ----------
  // a list of instruments stands for a song that uses them (prepare, ready): ids, or { instrument, rate } for a grit other than 32 kHz
  const asSong = x => Array.isArray(x) ? check({ format: 'pixelite-song', tracks: x.map(i => typeof i === 'string' ? { instrument: i } : { instrument: i.instrument, sound: { rate: i.rate } }) }) : x;
  // What a song still needs made: its instruments, then (once they exist) the loop starts its loop lanes can pick. An empty list
  // means the song can start without a stall.
  function missing(song) {
    const todo = [];
    for (const tr of song.tracks) {
      const key = keyOf(tr.instrument, tr.sound.rate, song);
      if (!made.has(key)) { if (!todo.some(t => t.key === key)) todo.push({ key, steps: () => jobOf(key, tr.instrument, tr.sound.rate, song) }); continue; }
      const ll = laneOf(tr, 'loop');
      if (!ll.length) continue;
      const vs = ll.map(p => p[1]), lo = loopStep(Math.min(...vs)), hi = loopStep(Math.max(...vs));
      for (const z of made.get(key).zones || []) if (z.sm && z.sm.loop >= 0) for (let st = lo; st <= hi; st++) {
        const k = loopKey(z, st); if (!made.has(k) && !todo.some(t => t.key === k)) todo.push({ key: k, steps: function* () { loopZone(z, st); } });
      }
    }
    return todo;
  }
  // One queue for the whole page, worked a slice at a time between frames (in the browser's idle time where it has some), so the page
  // never stalls for longer than a slice, and the song needed first can be put at the front.
  // sliceMs: how long a slice may work; later: what runs the next slice (a test can put queueMicrotask here); the rest is what has been
  // done so far, in ms: for tests and tuning
  const build = { sliceMs: 4, later: null, slices: 0, longest: 0, work: 0 };
  const queue = [], waiting = new Map();   // the tasks to do, and the promise of each by key
  let working = false;
  const later = f => build.later ? build.later(f) : typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 60 }) : setTimeout(f, 0);
  function enqueue(task, first) {
    let w = waiting.get(task.key);
    if (!w) {
      w = { task, gen: null };
      w.promise = new Promise((res, rej) => { w.res = res; w.rej = rej; });
      waiting.set(task.key, w); queue.push(w);
    } else if (first) { const i = queue.indexOf(w); if (i > 0) { queue.splice(i, 1); queue.unshift(w); } }
    if (!working) { working = true; later(slice); }
    return w.promise;
  }
  function slice(deadline) {
    const t0 = performance.now(), ms = deadline && !deadline.didTimeout ? cl(deadline.timeRemaining() - 1, 2, 8) : build.sliceMs;
    do {
      const w = queue[0]; if (!w) break;
      try { w.gen ??= w.task.steps(); if (w.gen.next().done) { queue.shift(); waiting.delete(w.task.key); w.res(); } }
      catch (e) { queue.shift(); waiting.delete(w.task.key); w.rej(e); }
    } while (queue.length && performance.now() - t0 < ms);
    const d = performance.now() - t0; build.slices++; build.work += d; if (d > build.longest) build.longest = d;
    if (queue.length) later(slice); else working = false;
  }

  // ---------- songs ----------
  const TRACK = () => ({ name: 'Track', instrument: 'piano', volume: .8, pan: 0, mute: false, solo: false,
    sound: { octave: 0, fine: 0, rate: 32000, attack: null, decay: null, sustain: null, fall: null, release: null, vibrato: null, glide: 0 },
    eq: { low: 0, mid: 0, midFreq: 1000, high: 0 }, filter: { type: 'off', freq: 2000, q: .7 }, chorus: { mix: 0, rate: .8, depth: 4 },
    sends: { echo: 0, reverb: .2 }, auto: { volume: [], pan: [], filter: [] }, notes: [] });
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
  // [tick, value] points: whole ticks from 0, values clamped, sorted, one per tick (the last given wins), at most 512.
  // A third number belongs to the segment that arrives at the point: kind 'curve' bends it (-1..1: below 0 it rushes then
  // settles, above 0 it waits then rushes; 0 or none is a straight line), kind 'ramp' (tempo) glides to the point instead of jumping
  function points(list, lo, hi, kind) {
    const m = new Map();
    for (const p of Array.isArray(list) ? list : []) if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      const q = [Math.max(0, Math.round(p[0])), cl(p[1], lo, hi)], c = kind === 'curve' ? Math.round(cl(+p[2] || 0, -1, 1) * 100) / 100 : kind === 'ramp' ? (+p[2] ? 1 : 0) : 0;
      if (c) q.push(c);
      m.set(q[0], q);
    }
    return [...m.values()].sort((a, b) => a[0] - b[0]).slice(0, 512);
  }
  // ---------- time: ticks ↔ seconds through the song's tempo changes ----------
  // The tempo is a list of runs from tick 0 on: it holds a tempo until the next change, or glides (a ramp point) from the
  // one before to the new tempo, linearly in ticks; a glide's seconds are an integral: 60/PPQ · (t1−t0)/(b1−b0) · ln(b1/b0)
  function tempoRuns(song) {
    const P = [[0, song.bpm], ...(song.tempo || [])], runs = [];
    for (let i = 0; i < P.length; i++) {
      const nx = P[i + 1];
      runs.push({ t0: P[i][0], t1: nx ? nx[0] : Infinity, b0: P[i][1], b1: nx && nx[2] ? nx[1] : P[i][1] });
    }
    return runs;
  }
  const runSecs = (r, d) => r.b1 === r.b0 ? d * 60 / r.b0 / PPQ : 60 / PPQ * (r.t1 - r.t0) / (r.b1 - r.b0) * Math.log((r.b0 + (r.b1 - r.b0) * d / (r.t1 - r.t0)) / r.b0);
  function secAt(song, k) {   // seconds from tick 0 to tick k (before 0: at the opening tempo, for a count-in)
    if (k <= 0) return k * 60 / song.bpm / PPQ;
    let s = 0;
    for (const r of tempoRuns(song)) { if (k <= r.t1) return s + runSecs(r, k - r.t0); s += runSecs(r, r.t1 - r.t0); }
    return s;
  }
  function tickAt(song, sec) {
    if (sec <= 0) return sec * song.bpm / 60 * PPQ;
    let s = 0;
    for (const r of tempoRuns(song)) {
      const full = r.t1 === Infinity ? Infinity : runSecs(r, r.t1 - r.t0);
      if (sec <= s + full) {
        const d = sec - s;
        if (r.b1 === r.b0) return r.t0 + d * r.b0 / 60 * PPQ;
        const C = 60 / PPQ * (r.t1 - r.t0) / (r.b1 - r.b0), b = r.b0 * Math.exp(d / C);   // the tempo reached after d seconds
        return r.t0 + (b - r.b0) / (r.b1 - r.b0) * (r.t1 - r.t0);
      }
      s += full;
    }
    return 0;
  }
  const bpmAt = (song, k) => {
    for (const r of tempoRuns(song)) if (k < r.t1) return r.b1 === r.b0 ? r.b0 : r.b0 + (r.b1 - r.b0) * Math.max(0, k - r.t0) / (r.t1 - r.t0);
    return song.bpm;
  };
  // the shape of a curved segment: u in 0..1 along it → how far the value has got
  const shape = (u, c) => !c ? u : c > 0 ? Math.pow(u, 1 + 3 * c) : 1 - Math.pow(1 - u, 1 - 3 * c);
  // an automation lane's value at tick k: lines (or curves) between its points, level before the first and after the last
  function laneAt(pts, k) {
    if (!pts.length) return null;
    if (k <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (k < pts[i][0]) { const [a, va] = pts[i - 1], [b, vb, c] = pts[i]; return va + (vb - va) * shape((k - a) / (b - a), c); }
    return pts[pts.length - 1][1];
  }
  // the ramp targets a lane gives inside (a, b): each point, and along a curved segment one every 1/8 beat (a straight ramp
  // between those is as smooth as the curve needs)
  const LANE_STEP = PPQ / 8;
  function laneRamp(pts, a, b, fn) {
    for (let i = 0; i < pts.length; i++) {
      const [t, v, c] = pts[i];
      if (t <= a) continue;
      if (c && i) {
        let k = pts[i - 1][0] + LANE_STEP; if (a > k) k += Math.ceil((a - k) / LANE_STEP) * LANE_STEP;
        for (; k < t && k < b; k += LANE_STEP) fn(k, laneAt(pts, k));
      }
      if (t >= b) break;
      fn(t, v);
    }
  }
  const filterHz = v => 40 * Math.pow(400, v);   // the filter lane's 0..1, as 40 Hz .. 16 kHz
  const NONE = Object.freeze([]), laneOf = (tr, k) => tr.auto[k] || NONE;   // lanes made after the first songs only exist once they have points

  const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/, round2 = v => Math.round(v * 100) / 100;
  // notes as [tick, length, note, velocity]: whole numbers in range, in time order (then by pitch)
  const normNotes = list => (Array.isArray(list) ? list : []).filter(n => Array.isArray(n) && n.length >= 4 && n.every(Number.isFinite))
    .map(([at, len, note, vel]) => [Math.max(0, Math.round(at)), Math.max(1, Math.round(len)), cl(Math.round(note), 0, 127), cl(Math.round(vel), 1, 127)])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const MAX_CLIP = 512 * 12 * PPQ;   // a clip is no longer than the longest song
  // a song with every field present and sane (missing fields take their defaults); throws on something that is not a song
  function check(s) {
    if (!s || typeof s !== 'object' || s.format !== 'pixelite-song') throw new Error('not a Pixelite song');
    const out = merge({ format: 'pixelite-song', version: 1, title: 'Untitled', bpm: 120, beatsPerBar: 4, bars: 8, snes: false,
      loop: { on: false, start: 0, end: 8 * 4 * PPQ }, places: { title: false, levels: [], note: '' }, master: MASTER(), tracks: [] },
      { ...s, tracks: undefined, samples: undefined, tempo: undefined });
    // tempo changes after the start ([tick, bpm], a step at each): the song's bpm holds until the first
    out.tempo = points(s.tempo, 30, 300, 'ramp').filter(([t]) => t > 0);
    // the echo's own lanes (the song's, not a track's): its level and its feedback; only kept when they have points
    const MA = s.auto && typeof s.auto === 'object' ? s.auto : {}, ma = { echo: points(MA.echo, 0, 1, 'curve'), feedback: points(MA.feedback, -.95, .95, 'curve') };
    for (const k of Object.keys(ma)) if (!ma[k].length) delete ma[k];
    if (Object.keys(ma).length) out.auto = ma;
    // where in its game the song plays: the title screen, levels (by index in the game's level list), and a note for the rest
    out.places.title = !!out.places.title; out.places.note = String(out.places.note).slice(0, 300);
    out.places.levels = [...new Set((Array.isArray(out.places.levels) ? out.places.levels : []).filter(Number.isInteger).filter(l => l >= 0 && l < 100))].sort((a, b) => a - b);
    // the song's own samples (loaded in the studio): BRR bytes in base64, the rate they are at, the note they sound, where they loop
    out.samples = {};
    for (const [id, sm] of Object.entries(s.samples && typeof s.samples === 'object' ? s.samples : {})) {
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) || !sm || typeof sm.brr !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(sm.brr) || !sm.brr.length) continue;
      const len = Math.floor(sm.brr.length * 3 / 4 / 9) * 16;
      const loop = Number.isInteger(sm.loop) && sm.loop >= 0 && sm.loop < len ? sm.loop - sm.loop % 16 : -1, o = { name: String(sm.name || id).slice(0, 40), rate: RATES.includes(sm.rate) ? sm.rate : 32000, root: cl(+sm.root || 60, 0, 127), loop, brr: sm.brr };
      // a loop of its own end (a block, at least a block past where it starts; the sound after it is never played), and a crossfade
      // of that many samples at the seam (at most as long as what is before the loop and half the loop); both only when set
      if (loop >= 0 && Number.isInteger(sm.loopEnd) && sm.loopEnd > loop + 16 && sm.loopEnd < len) o.loopEnd = sm.loopEnd - sm.loopEnd % 16;
      if (loop >= 0 && Number.isFinite(sm.xfade) && sm.xfade >= 1) { const x = Math.min(Math.round(sm.xfade), loop, ((o.loopEnd || len) - loop) >> 1); if (x >= 1) o.xfade = x; }
      out.samples[id] = o;
    }
    // several samples as one instrument: zones of notes (lo..hi) over the song's own samples
    out.multis = {};
    for (const [id, mu] of Object.entries(s.multis && typeof s.multis === 'object' ? s.multis : {})) {
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) || !mu || !Array.isArray(mu.zones)) continue;
      const zones = mu.zones.filter(z => z && own(out.samples, z.sample) && Number.isFinite(z.lo) && Number.isFinite(z.hi)).slice(0, 16)
        .map(z => ({ sample: z.sample, lo: cl(Math.round(Math.min(z.lo, z.hi)), 0, 127), hi: cl(Math.round(Math.max(z.lo, z.hi)), 0, 127) }));
      if (zones.length) out.multis[id] = { name: String(mu.name || id).slice(0, 40), zones };
    }
    if (!Object.keys(out.multis).length) delete out.multis;
    // drum kits: up to 32 pads, each a note (once) with a sample of the song or a built-in sound, a tune (semitones), level, pan and choke
    // group (a pad cuts the others of its group); only there when the song has one
    out.kits = {};
    for (const [id, ki] of Object.entries(s.kits && typeof s.kits === 'object' ? s.kits : {})) {
      if (!ID_RE.test(id) || !ki || !Array.isArray(ki.pads)) continue;
      const seen = new Set(), pads = [];
      for (const p of ki.pads) {
        if (!p || !Number.isFinite(p.note) || pads.length >= 32) continue;
        // a pad names a sample of the song (kept even when the song has no such sample just now: it is silent until it has, and deleting
        // a sample does not quietly empty a kit) or, failing that, a built-in sound
        const note = cl(Math.round(p.note), 0, 127), sample = typeof p.sample === 'string' && ID_RE.test(p.sample) && (own(out.samples, p.sample) || !DRUM_KINDS.includes(p.sound)) ? p.sample : null;
        if (seen.has(note) || !sample && !DRUM_KINDS.includes(p.sound)) continue;
        seen.add(note);
        pads.push({ note, ...(sample ? { sample } : { sound: p.sound }), tune: round2(cl(+p.tune || 0, -24, 24)), level: round2(cl(p.level == null ? 1 : +p.level || 0, 0, 2)), pan: round2(cl(+p.pan || 0, -1, 1)), choke: cl(Math.round(+p.choke || 0), 0, 8) });
      }
      if (pads.length) out.kits[id] = { name: String(ki.name || id).slice(0, 40), pads };
    }
    if (!Object.keys(out.kits).length) delete out.kits;
    // patterns: a run of notes of its own length that clips play over and over (up to 256), with a swing that delays the off-beat
    // 16ths; only there when the song has one. Notes start inside the pattern and end at its end at the latest.
    out.patterns = {}; let nPat = 0, budget = 50000;   // budget: the notes all clips may play in all, when written out (a clip of a short pattern is many)
    for (const [id, pt] of Object.entries(s.patterns && typeof s.patterns === 'object' ? s.patterns : {})) {
      if (!ID_RE.test(id) || !pt) continue;
      if (++nPat > 256) break;
      const len = cl(Math.round(+pt.len) || 4 * PPQ, 24, 64 * 4 * PPQ), o = { name: String(pt.name || id).slice(0, 40), len };   // at least a 16th
      o.notes = normNotes(pt.notes).filter(n => n[0] < len).slice(0, 2048).map(([at, l, note, vel]) => [at, Math.min(l, len - at), note, vel]);
      if (+pt.swing > 0) o.swing = round2(cl(+pt.swing, 0, .75));
      if (typeof pt.color === 'string' && /^#[0-9a-f]{6}$/i.test(pt.color)) o.color = pt.color.toLowerCase();
      out.patterns[id] = o;
    }
    if (!Object.keys(out.patterns).length) delete out.patterns;
    out.bpm = cl(+out.bpm || 120, 30, 300); out.beatsPerBar = cl(Math.round(out.beatsPerBar) || 4, 1, 12); out.bars = cl(Math.round(out.bars) || 8, 1, 512);
    const songLen = out.bars * out.beatsPerBar * PPQ;
    out.tracks = (Array.isArray(s.tracks) ? s.tracks : []).slice(0, 32).map(t => {
      const tr = merge(TRACK(), t);
      if (tr.instrument.startsWith('drums:') && !own(out.kits, tr.instrument.slice(6))) tr.instrument = 'kit';   // a kit that is not there plays as the built-in one
      if (!DEFS[tr.instrument] && !tr.instrument.startsWith('drums:') && !(tr.instrument.startsWith('sample:') && own(out.samples, tr.instrument.slice(7))) && !(tr.instrument.startsWith('multi:') && own(out.multis, tr.instrument.slice(6)))) tr.instrument = 'piano';
      if (!RATES.includes(tr.sound.rate)) tr.sound.rate = 32000;
      tr.sound.glide = cl(+tr.sound.glide || 0, 0, 2);
      const A = t.auto && typeof t.auto === 'object' ? t.auto : {};
      tr.auto = { volume: points(A.volume, 0, 1, 'curve'), pan: points(A.pan, -1, 1, 'curve'), filter: points(A.filter, 0, 1, 'curve') };
      // lanes added later are only there when they have points (so a song made without them reads the same): the sends, the
      // pitch bend in semitones, and the loop point of a sample (0..1 along it) a note picks when it starts
      for (const [k, lo, hi] of [['echo', 0, 1], ['reverb', 0, 1], ['pitch', -12, 12], ['loop', 0, 1]]) { const p = points(A[k], lo, hi, 'curve'); if (p.length) tr.auto[k] = p; }
      tr.notes = normNotes(t.notes);
      // clips (only when there are any): where this track plays a pattern. at: the tick it starts, len: the ticks it runs (longer than the
      // pattern: it repeats), off: where in the pattern it starts (a trimmed start). They play together with the loose notes above.
      const clips = (Array.isArray(t.clips) ? t.clips : []).filter(c => c && typeof c.p === 'string' && own(out.patterns, c.p) && Number.isFinite(c.at) && Number.isFinite(c.len)).slice(0, 1024)
        .map(c => ({ at: Math.max(0, Math.round(c.at)), p: c.p, len: cl(Math.round(c.len), 1, MAX_CLIP), off: cl(Math.round(+c.off || 0), 0, out.patterns[c.p].len - 1) }))
        .sort((a, b) => a.at - b.at || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0))
        .filter(c => {   // what the clip plays within the song, written out, comes out of the song's budget; a clip past it is dropped
          const P = out.patterns[c.p], cost = P.notes.length * (Math.ceil(Math.max(0, Math.min(c.at + c.len, songLen) - c.at) / P.len) + 1);
          if (cost > budget) return false;
          budget -= cost; return true;
        });
      if (clips.length) tr.clips = clips;
      return tr;
    });
    return out;
  }
  const newSong = () => check({ format: 'pixelite-song', title: 'New song', tracks: [{ name: 'Piano' }] });
  const newTrack = (instrument = 'piano') => merge(TRACK(), { name: DEFS[instrument] ? DEFS[instrument][0] : 'Track', instrument });
  const songEnd = s => s.bars * s.beatsPerBar * PPQ;
  // The notes a track's clips play that start in [a, b) ticks, handed to fn(tick, length, note, velocity) in song time (for a song that has been
  // through check()). A clip plays its pattern from `off`, again and again, and ends where the clip does (a note running past it is cut); a
  // pattern's swing delays its notes on the off-beat 16ths of the pattern (so a pattern that is not a whole number of beats long swings differently
  // each time round). A note that began before a trimmed start is not played, swung or not. Nothing is played past the song's end.
  function clipNotes(song, tr, a, b, fn) {
    const limit = songEnd(song);
    for (const c of tr.clips || []) {
      const P = own(song.patterns, c.p), end = c.at + c.len;
      if (!P || !P.notes.length || c.at >= b || end <= a) continue;
      const delay = P.swing ? Math.round(P.swing * 24) : 0, hi = Math.min(end, b, limit);   // (nothing is played past the song's end)
      for (let k = Math.max(0, Math.floor((a - c.at + c.off) / P.len) - 1); c.at - c.off + k * P.len < hi; k++) {
        const base = c.at - c.off + k * P.len;
        for (const [at, len, note, vel] of P.notes) {
          if (base + at < c.at) continue;   // began before a trimmed start (judged before swing moves it)
          const x = base + at + (delay && at % 48 === 24 ? delay : 0);
          if (x >= a && x < hi) fn(x, Math.min(len, end - x), note, vel);
        }
      }
    }
  }
  // all the notes of a track in song time, in order: its loose notes and what its clips play (for a view of the song, an export, a check); with no
  // clips it is the track's own list, which a caller must not change
  function notesOf(song, tr) {
    if (!tr.clips || !tr.clips.length) return tr.notes;
    const out = tr.notes.slice();
    clipNotes(song, tr, 0, Infinity, (at, len, note, vel) => out.push([at, len, note, vel]));
    return out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  }

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
      lfo: c.createOscillator(), lfoAmt: g(0), pan: c.createStereoPanner(), vol: g(.64), av: g(1), mute: g(1), echo: g(0), rev: g(0), layer: 1, marks: [],
      pitch: c.createConstantSource() };   // the pitch lane's bend, in cents, fed into every note's detune (only when the track has the lane)
    S.pitch.offset.value = 0; S.pitch.start();
    S.mid.Q.value = .9; S.cho.delayTime.value = .012;
    S.in.connect(S.lo); S.lo.connect(S.mid); S.mid.connect(S.hi); S.hi.connect(S.filt);
    S.filt.connect(S.dry); S.filt.connect(S.cho); S.cho.connect(S.wet); S.lfo.connect(S.lfoAmt); S.lfoAmt.connect(S.cho.delayTime); S.lfo.start();
    S.dry.connect(S.pan); S.wet.connect(S.pan); S.pan.connect(S.vol); S.vol.connect(S.av); S.av.connect(S.mute);
    S.mute.connect(M.sum); S.mute.connect(S.echo); S.mute.connect(S.rev); S.echo.connect(M.echoIn); S.rev.connect(M.revIn);
    return S;
  }
  // let go of a mixer that is done (a deck faded out or finished): stop what runs on its own, and cut it off from the output
  function disposeMix(M) {
    const off = n => { try { n.disconnect(); } catch (e) { } };
    for (const S of M.strips) { try { S.lfo.stop(); S.pitch.stop(); } catch (e) { } off(S.mute); off(S.in); }
    off(M.vol); off(M.click); off(M.echoVol); off(M.revVol);
  }
  const set = (p, v, now, smooth) => { if (smooth) p.setTargetAtTime(v, now, .02); else p.value = v; };
  function applyMaster(M, song, smooth = true) {
    const m = song.master, now = M.ctx.currentTime, snes = song.snes;
    set(M.vol.gain, m.volume * m.volume, now, smooth);
    set(M.echoDelay.delayTime, cl(Math.round(m.echo.delay), 1, 15) * .016, now, smooth);
    const ma = song.auto || {};   // the echo's lanes, when it has any, set these as the song plays
    if (!(ma.feedback || NONE).length) set(M.echoFb.gain, cl(m.echo.feedback, -.95, .95), now, smooth);
    if (!(ma.echo || NONE).length) set(M.echoVol.gain, cl(m.echo.volume, 0, 1), now, smooth);
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
    const ft = snes ? 'allpass' : tr.filter.type === 'off' ? (tr.auto.filter.length ? 'lowpass' : 'allpass') : tr.filter.type;   // an automated filter is on
    if (S.filt.type !== ft) S.filt.type = ft;
    if (!tr.auto.filter.length) set(S.filt.frequency, cl(tr.filter.freq, 30, 18000), now, smooth); set(S.filt.Q, ft === 'allpass' ? .0001 : cl(tr.filter.q, .1, 18), now, smooth);
    const mix = snes ? 0 : cl(tr.chorus.mix, 0, 1);
    set(S.wet.gain, mix * .8, now, smooth); set(S.dry.gain, 1 - mix * .35, now, smooth);
    set(S.lfo.frequency, cl(tr.chorus.rate, .05, 8), now, smooth); set(S.lfoAmt.gain, cl(tr.chorus.depth, 0, 10) / 1000, now, smooth);
    if (!tr.auto.pan.length) set(S.pan.pan, cl(tr.pan, -1, 1), now, smooth); set(S.vol.gain, tr.volume * tr.volume, now, smooth); if (!tr.auto.volume.length) set(S.av.gain, 1, now, smooth);
    const audible = !tr.mute && (!solo || tr.solo);
    set(S.mute.gain, audible ? S.layer : 0, now, smooth);
    if (!laneOf(tr, 'echo').length) set(S.echo.gain, cl(tr.sends.echo, 0, 1), now, smooth);
    if (snes || !laneOf(tr, 'reverb').length) set(S.rev.gain, snes ? 0 : cl(tr.sends.reverb, 0, 1), now, smooth);
    if (!laneOf(tr, 'pitch').length) set(S.pitch.offset, 0, now, smooth);
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
  // the zone of an instrument that plays note n: a multisample's zone whose notes hold it (the nearest one, when none does), else the
  // sample whose root is nearest
  function zoneFor(inst, n) {
    let z = inst.zones[0];
    if (z.lo !== undefined) {
      let best = Infinity;
      for (const q of inst.zones) { const d = n < q.lo ? q.lo - n : n > q.hi ? n - q.hi : 0; if (d < best) { best = d; z = q; } }
    } else for (const q of inst.zones) if (Math.abs(q.root - n) < Math.abs(z.root - n) - .01) z = q;
    return z;
  }
  // the envelope: attack ramp, decay toward the sustain level, then (fall) toward silence while held; `off` is when the note is let go
  function scheduleEnv(p, E, peak, t, off) {
    p.setValueAtTime(0, t);
    if (off < E.a) p.linearRampToValueAtTime(envAt(E, peak, off, Infinity), t + off);
    else {
      p.linearRampToValueAtTime(peak, t + E.a); p.setTargetAtTime(peak * E.s, t + E.a, Math.max(E.d / 3, 1e-4));
      if (E.sd > 0 && off > E.a + E.d) p.setTargetAtTime(0, t + E.a + E.d, E.sd);
    }
  }
  const MAX_VOICES = 48;
  // start a note at time t on track ti; dur in seconds, or null for a live note (let go later with releaseVoice)
  // loopPos: where along its sample a loop lane puts the loop start for this note (0..1), or null
  function startVoice(M, song, ti, note, vel, t, dur, bend = 0, loopPos = null) {
    const tr = song.tracks[ti], S = M.strips[ti]; if (!tr || !S) return null;
    const inst = instrument(tr.instrument, tr.sound.rate, song), c = M.ctx;
    let buffer, rateMul, loop = false, loopStart = 0, loopEnd = 0, choke = 0, kit = !!inst.kit, zgain = 1, pan = 0, panned = false;
    if (kit) {
      const k = inst.kit[note]; if (!k) return null;
      buffer = k.buffer; rateMul = k.pitch; choke = k.choke;
      if (k.pad) {   // a pad of the song's own kit: its tune, level, pan and choke group as they are now (the buffer only depends on the sound)
        const p = padOf(song, tr.instrument, note) || {};
        rateMul = Math.pow(2, (p.tune || 0) / 12); choke = p.choke | 0; zgain = k.norm * (p.level == null ? 1 : p.level); pan = p.pan || 0;
        panned = true;   // every voice of a kit track goes through a panner, centred or not: mono and stereo voices meeting in one input would not be as loud as each other
      }
    } else {
      const n = note + 12 * tr.sound.octave + tr.sound.fine / 100;
      let z = zoneFor(inst, n);
      if (loopPos != null && z.sm && z.sm.loop >= 0) z = loopZone(z, loopStep(loopPos));
      buffer = z.buffer; rateMul = Math.pow(2, (n - z.root) / 12); loop = z.loop; loopStart = z.loopStart; loopEnd = z.loopEnd || buffer.duration; zgain = z.gain || 1;
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
    // glide (a mono lead): the track's other notes end here, and if one was still held, the new one slides up or down from it
    let from = null;
    if (!kit && tr.sound.glide > 0) {
      const held = M.voices.filter(v => v.ti === ti && !v.kit && v.t0 < t && v.end > t);
      const legato = held.filter(v => v.relAt === undefined || v.relAt > t).sort((a, b) => b.t0 - a.t0)[0];
      if (legato) from = rateMul * Math.pow(2, (legato.n - (note + 12 * tr.sound.octave + tr.sound.fine / 100)) / 12);
      for (const v of held) cut(v, t);
    }
    const E = kit ? { a: .001, d: .001, s: 1, sd: 0, r: .05 } : envOf(inst, tr);
    const peak = Math.pow(vel / 127, 1.5) * inst.gain * zgain * 1.2;
    const src = c.createBufferSource(), gn = c.createGain();
    src.buffer = buffer; src.detune.value = bend * 100;
    if (from) { src.playbackRate.setValueAtTime(from, t); src.playbackRate.exponentialRampToValueAtTime(rateMul, t + tr.sound.glide); }
    else src.playbackRate.value = rateMul;
    if (loop) { src.loop = true; src.loopStart = loopStart; src.loopEnd = loopEnd; }
    src.connect(gn);
    if ((pan || panned) && c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = cl(pan, -1, 1); gn.connect(sp); sp.connect(S.in); } else gn.connect(S.in);
    if (!kit && laneOf(tr, 'pitch').length) { S.pitch.connect(src.detune); src.onended = () => { try { S.pitch.disconnect(src.detune); } catch (e) { } }; }
    // drums ignore note-offs
    const p = gn.gain, off = kit || dur == null ? Infinity : Math.max(.005, dur);
    scheduleEnv(p, E, peak, t, off);
    let lfo = null;
    const vib = tr.sound.vibrato ?? inst.vib;
    if (!kit && vib && vib[0] > 0) {
      lfo = c.createOscillator(); const amt = c.createGain();
      lfo.frequency.value = vib[1]; amt.gain.setValueAtTime(0, t + vib[2]); amt.gain.linearRampToValueAtTime(vib[0], t + vib[2] + .35);
      lfo.connect(amt); amt.connect(src.detune); lfo.start(t);
    }
    const v = { src, gn, lfo, E, peak, t0: t, off, ti, choke, kit, end: Infinity, relAt: undefined, n: note + 12 * tr.sound.octave + tr.sound.fine / 100 };
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
  // notes of every track whose start falls in [a, b) ticks, at the times tickTime gives; and the automation lanes' points
  // there (fresh: the playhead just started or wrapped, so each lane is first set to its value at a)
  function scheduleRange(M, song, a, b, tickTime, loopEnd, clicks, fresh) {
    const dur = (at, len) => secAt(song, Math.min(at + len, loopEnd)) - secAt(song, at);
    // a lane's points in [a, b) as ramps of an audio parameter (a curve as short straight pieces)
    const follow = (param, pts, map) => {
      if (fresh) { const t0 = Math.max(tickTime(a), M.ctx.currentTime); param.cancelScheduledValues(t0); param.setValueAtTime(map(laneAt(pts, Math.max(0, a))), t0); }
      laneRamp(pts, a, b, (at, v) => param.linearRampToValueAtTime(map(v), tickTime(at)));
    };
    for (const [lane, param, map] of [['echo', M.echoVol.gain, v => v], ['feedback', M.echoFb.gain, v => v]]) { const pts = (song.auto || {})[lane]; if (pts && pts.length) follow(param, pts, map); }
    song.tracks.forEach((tr, ti) => {
      const S = M.strips[ti]; if (!S) return;
      for (const [lane, param, map] of [['volume', S.av.gain, v => v * v], ['pan', S.pan.pan, v => v], ['filter', S.filt.frequency, filterHz],
        ['echo', S.echo.gain, v => v], ['reverb', S.rev.gain, v => v], ['pitch', S.pitch.offset, v => v * 100]]) {
        const pts = laneOf(tr, lane); if (!pts.length || song.snes && (lane === 'filter' || lane === 'reverb')) continue;
        follow(param, pts, map);
      }
      const N = tr.notes, loopLane = laneOf(tr, 'loop'); let lo = 0, hi = N.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (N[mid][0] < a) lo = mid + 1; else hi = mid; }
      const play = (at, len, note, vel) => {
        const v = startVoice(M, song, ti, note, vel, tickTime(at), dur(at, len), 0, loopLane.length ? laneAt(loopLane, at) : null);
        if (v && isKit(tr.instrument) && note >= 35 && note <= 40 && M.hits) M.hits.push([tickTime(at), vel / 127]);
      };
      if (tr.clips && tr.clips.length) {   // one list in time order, so a note that cuts another (a choke group) starts after it, whichever it came from
        const all = []; for (let i = lo; i < N.length && N[i][0] < b; i++) all.push(N[i]);
        clipNotes(song, tr, a, b, (at, len, note, vel) => all.push([at, len, note, vel]));
        for (const n of all.sort((x, y) => x[0] - y[0] || x[2] - y[2])) play(...n);
      } else for (let i = lo; i < N.length && N[i][0] < b; i++) play(...N[i]);
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
  const makeEngine = () => ({
    PPQ, INSTRUMENTS, KIT: Object.fromEntries(Object.entries(KIT).map(([n, k]) => [n, k[3]])), RATES, FIRS: Object.keys(FIR),
    ctx: null, dest: null, out: null, mix: null, song: null, playing: false, metronome: false, pending: null, want: null, timer: 0, gain: null, vol: 1, ghosts: [], own: false, build,
    check, newSong, newTrack, songEnd, notesOf, clipNotes, isKit, newKit, DRUM_KINDS, envAt, secAt, tickAt, bpmAt, laneAt, laneRamp, filterHz, brr, brrEncode, brrDecode, toB64, fromB64, sampleLen, loopStep, loopAtStep, forced: null,
    // an instrument's own envelope and vibrato (what a track's sound settings left at null mean)
    defaults: id => id.startsWith('sample:') || id.startsWith('multi:') ?{ env: { ...SAMPLE_ENV }, vib: [0, 5, .3] } : { env: { ...(DEFS[isKit(id) ? 'kit' : id] || DEFS.piano)[3] }, vib: [...((DEFS[isKit(id) ? 'kit' : id] || DEFS.piano)[4] || [0, 5, .3])] },
    // make a song's instruments (or a list of instrument ids) in the idle time between frames, a few milliseconds at a time (build.sliceMs),
    // so the page never stalls; resolves when they are all there. first: ahead of whatever else is waiting. play() makes any that are
    // missing on the spot (a stall of ~0.1 s each), unless it is given wait: true
    async prepare(song, { first = false } = {}) {
      song = asSong(song);
      for (let todo = missing(song); todo.length; todo = missing(song)) await Promise.all((first ? todo.slice().reverse() : todo).map(t => enqueue(t, first)));
    },
    // true when a song (or a list of instrument ids) can play without making anything first
    ready(song) { return missing(asSong(song)).length === 0; },
    init(ctx, dest) {
      if (this.ctx || !ctx) return;
      this.ctx = ctx; this.dest = dest || ctx.destination;
      this.out = ctx.createGain(); this.out.connect(this.dest);   // duck() works on this one; the song's own gain (setVolume) feeds it
      this.gain = ctx.createGain(); this.gain.gain.value = this.vol; this.gain.connect(this.out);
      if (this.pending) { const [s, o] = this.pending; this.pending = null; this.play(s, o); }
    },
    // make `song` the current one (its mixer follows it); call sync() after changing its settings. layers: { track name: 0..1 } (or a function
    // of the song that gives it) sets those tracks' levels from the start (what track() does later)
    use(song, layers = null) {
      if (!this.ctx) return;
      if (typeof layers === 'function') layers = layers(song);
      if (!this.mix) { this.mix = makeMix(this.ctx, this.gain); this.mix.hits = []; }
      const M = this.mix;
      while (M.strips.length < song.tracks.length) M.strips.push(makeStrip(M));
      if (this.song !== song) { for (const S of M.strips) S.layer = 1; this.song = song; }
      if (layers) song.tracks.forEach((t, i) => { if (layers[t.name] !== undefined) M.strips[i].layer = cl(+layers[t.name] || 0, 0, 1); });
      syncMix(M, song, false);
    },
    sync() { if (this.mix && this.song) syncMix(this.mix, this.song); },
    // play from tick `from` (may be negative: a count-in); loops the song's loop region, or the whole song, unless loop: false.
    // crossfade: seconds the song playing now fades out over while this one (give it a fadeIn too) fades in; wait: if its instruments are not
    // all made, make them between frames and start when they are (the song playing now goes on until then) instead of stalling the page
    play(song, { from = 0, loop = true, fadeIn = 0, onEnd = null, crossfade = 0, wait = false, layers = null } = {}) {
      if (this.forced && song !== this.forced) return;   // a page previewing a song in this game has the say
      if (!this.ctx) { this.pending = [song, { from, loop, fadeIn, onEnd, crossfade, wait, layers }]; return; }
      this.want = null;
      if (wait && !this.ready(song)) {
        const want = this.want = { song };
        this.prepare(song, { first: true }).then(() => { if (this.want === want) this.play(song, { from, loop, fadeIn, onEnd, crossfade, layers }); }, e => console.warn('Sampler.play:', e));
        return;
      }
      if (crossfade > 0 && this.playing) this.fadeOut(crossfade); else this.halt();
      this.use(song, layers);
      for (const tr of song.tracks) instrument(tr.instrument, tr.sound.rate, song);
      const now = this.ctx.currentTime + .05, g = this.gain.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(fadeIn ? 0 : this.vol, now); if (fadeIn) g.linearRampToValueAtTime(this.vol, now + fadeIn);
      this.P = { cursor: from, time: now, loop, onEnd, segs: [[now, from]], fresh: true };
      this.playing = true;
      this.pump(); this.timer = setInterval(() => this.pump(), 25);
    },
    // play this song and nothing else (the game's own music stays quiet) until force(null): the SOUND STUDIO previewing a
    // song inside the game; the Chip keeps quiet too
    force(song) {
      this.forced = song ? check(song) : null;
      if (typeof Chip !== 'undefined' && Chip.playing) Chip.stop(.2);
      if (this.forced) { this.pending = null; this.play(this.forced, { fadeIn: .3 }); }
      else { this.stop(.3); if (typeof Music !== 'undefined') Music.resume(); }   // the game's own music (the director's) comes back
    },
    stop(fade = .15) {
      this.want = null;
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
    // The song that plays goes on in a deck of its own, fading out over `fade` seconds, and this deck is free to start another: a crossfade.
    // The old deck lets go of its mixer when it is silent.
    fadeOut(fade) {
      const c = this.ctx, now = c.currentTime, g = makeEngine();
      Object.assign(g, { ctx: c, dest: this.dest, out: this.out, gain: this.gain, mix: this.mix, song: this.song, P: this.P, playing: true, vol: this.vol });
      g.timer = setInterval(() => g.pump(), 25);
      const p = g.gain.gain; p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0, now + Math.max(.02, fade));
      this.ghosts.push(g);
      setTimeout(() => { g.dispose(); this.ghosts = this.ghosts.filter(x => x !== g); }, fade * 1000 + 400);
      while (this.ghosts.length > 2) this.ghosts.shift().dispose();
      clearInterval(this.timer);
      this.gain = c.createGain(); this.gain.gain.value = this.vol; this.gain.connect(this.out);
      this.mix = null; this.P = null; this.song = null; this.playing = false;
    },
    // done with this deck (a stinger's, or a song that has faded out): stop it and let go of its mixer
    dispose() {
      this.want = null;
      if (this.playing) this.stop(.02);
      clearInterval(this.timer); this.timer = 0; this.P = null; this.playing = false; this.song = null;
      const M = this.mix; this.mix = null;
      if (M) disposeMix(M);
      try { if (this.gain) this.gain.disconnect(); if (this.own && this.out) this.out.disconnect(); } catch (e) { }
    },
    // another player on the same output, for something that plays over the music (a stinger): its own song, mixer and volume
    // (dispose() it when it is done). null before the audio has started.
    deck() { if (!this.ctx) return null; const d = makeEngine(); d.init(this.ctx, this.dest); d.own = true; return d; },
    // this whole deck quieter (level 0..1, 1 = as it is) over `fade` seconds, apart from setVolume: music under a stinger
    duck(level = 1, { fade = .2 } = {}) { if (this.out) this.out.gain.setTargetAtTime(cl(+level || 0, 0, 1), this.ctx.currentTime, Math.max(.01, fade / 3)); },
    // One note of a built-in instrument on its own (no song, no mixer): a game's sound effect (Sfx.play). dur: seconds it is held, pitch:
    // a frequency multiplier, pan -1..1, delay: seconds from now, release: seconds (default: the instrument's own). It goes to `dest`
    // (default: this deck's output). prepare([id]) first, or the first call makes the instrument on the spot. Returns the voice
    // ({ end, ... }) or null. Instruments of a song's own samples are not available here.
    note(id, n, { vel = 100, dur = .4, rate = 32000, pitch = 1, gain = 1, pan = 0, delay = 0, release = null, dest = null } = {}) {
      const c = this.ctx; if (!c || !DEFS[id]) return null;
      const inst = instrument(id, RATES.includes(rate) ? rate : 32000, null), kit = !!inst.kit, t = c.currentTime + .005 + Math.max(0, delay);
      let buffer, rateMul, loop = false, loopStart = 0, loopEnd = 0, zgain = 1;
      if (kit) { const k = inst.kit[n]; if (!k) return null; buffer = k.buffer; rateMul = k.pitch; }
      else { const z = zoneFor(inst, n); buffer = z.buffer; rateMul = Math.pow(2, (n - z.root) / 12); loop = z.loop; loopStart = z.loopStart; loopEnd = z.loopEnd || buffer.duration; zgain = z.gain || 1; }
      const E = kit ? { a: .001, d: .001, s: 1, sd: 0, r: .05 } : release == null ? inst.env : { ...inst.env, r: Math.max(.005, release) };
      const peak = Math.pow(cl(vel, 1, 127) / 127, 1.5) * inst.gain * zgain * 1.2 * gain, off = kit ? Infinity : Math.max(.005, dur);
      const src = c.createBufferSource(), gn = c.createGain();
      src.buffer = buffer; src.playbackRate.value = rateMul * pitch;
      if (loop) { src.loop = true; src.loopStart = loopStart; src.loopEnd = loopEnd; }
      src.connect(gn);
      let tail = gn;
      if (pan && c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = cl(pan, -1, 1); gn.connect(sp); tail = sp; }
      tail.connect(dest || this.out);
      scheduleEnv(gn.gain, E, peak, t, off);
      const v = { src, gn, lfo: null, E, peak, t0: t, off, ti: -1, choke: 0, kit, end: Infinity, relAt: undefined };
      src.start(t);
      if (kit) { v.end = t + buffer.duration / (rateMul * pitch); src.stop(v.end + .01); }
      else { gn.gain.setTargetAtTime(0, t + off, Math.max(E.r / 4, 1e-3)); v.relAt = t + off; v.end = v.relAt + E.r * 1.6 + .02; src.stop(v.end); }
      v.cut = at => { cut(v, Math.max(at ?? 0, c.currentTime)); };
      return v;
    },
    pump() {
      const P = this.P, song = this.song; if (!P || !song) return;
      const end = songEnd(song), lp = song.loop, target = this.ctx.currentTime + LEAD, at = k => secAt(song, k);
      const ls = lp.on ? cl(lp.start, 0, end - 1) : 0, le = lp.on ? cl(lp.end, ls + 1, end) : end;
      while (P.time < target) {
        const stopAt = P.loop && P.cursor < le ? le : end;
        let b = Math.min(stopAt, Math.ceil(tickAt(song, at(P.cursor) + target - P.time)) + 1);
        if (b <= P.cursor) b = P.cursor + 1;
        const c0 = P.cursor, t0 = P.time;
        scheduleRange(this.mix, song, c0, b, k => t0 + at(k) - at(c0), P.loop && c0 < le ? le : end, (this.metronome || c0 < 0) ? (t, acc) => click(this.mix, t, acc) : null, P.fresh);
        P.fresh = false; P.time = t0 + at(b) - at(c0); P.cursor = b;
        if (P.cursor >= stopAt) {
          if (P.loop && stopAt === le) { P.cursor = ls; P.fresh = true; P.segs.push([P.time, ls]); if (P.segs.length > 16) P.segs.shift(); }
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
      return tickAt(this.song, secAt(this.song, seg[1]) + now - seg[0]);
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
      const end = songEnd(song), at = k => secAt(song, k);
      const secs = seconds ?? at(end) - at(from) + 2;
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate), M = makeMix(ctx, ctx.destination);
      syncMix(M, song, false);
      const lp = song.loop, ls = lp.on ? lp.start : 0, le = lp.on ? lp.end : end;
      let cursor = from, time = 0;
      while (time < secs) {
        const stopAt = loop && cursor < le ? le : end, c0 = cursor, t0 = time;
        scheduleRange(M, song, c0, stopAt, k => t0 + at(k) - at(c0), stopAt, null, true);
        time += at(stopAt) - at(c0); cursor = stopAt;
        if (loop && stopAt === le && (le - ls) > 0) cursor = ls; else break;
      }
      return ctx.startRendering();
    }
  });
  return makeEngine();
})();
