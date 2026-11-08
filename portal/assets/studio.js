// The SOUND STUDIO (/studio/): a small DAW for 16-bit (Super Nintendo style) music. The sound is the engine's own Sampler
// (engine/13_sampler.js, loaded before this file), so a game plays a song exactly as it sounds here. Songs are plain data
// (Sampler.check); they save to the site (worker/songs.js, D1) and a draft is kept in this browser as you work.
import { findLevels, toPixels } from './levels-core.mjs';
const S = Sampler, PPQ = S.PPQ;
const $ = q => document.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const COLORS = ['#ffb340', '#78dcff', '#8ceb96', '#ffd678', '#ff8a6a', '#c79bff', '#6af0c8', '#ff7ab8'];
// the project: the game the songs are for (?game=<id>), 'none' for sketches, no ?game at all: choose one first
const PROJECT = new URLSearchParams(location.search).get('game');
const GAME_ID = PROJECT && PROJECT !== 'none' && /^[a-z][a-z0-9-]{1,31}$/.test(PROJECT) ? PROJECT : '';
const DRAFT = `pixelite.studio.draft.${GAME_ID || 'none'}`;   // one draft per project

// ---------- state ----------
const st = {
  song: null, meta: { id: null, updated_at: null, game: '' }, sel: 0, picked: new Set(), grid: 24, len: 96, start: 0,
  dirty: false, undo: [], redo: [], pending: null, clip: null, rec: null, click: false, countIn: true, quant: true,
  keys: false, octave: 4, view: { x: 0, zoom: .7, top: 84 }, live: new Map(), pedal: false, bend: 0, follow: true
};
let project = { id: '', title: '' };   // the game this studio is working for (from /games.json)
const song = () => st.song, track = () => st.song.tracks[st.sel];
const end = () => S.songEnd(st.song);
const snapAt = (t, g = st.grid) => Math.round(t / g) * g;

function template() {
  const s = S.check({ format: 'pixelite-song', title: project.title ? `${project.title} song` : 'New song', bpm: 110, bars: 8, loop: { on: true, start: 0, end: 8 * 4 * PPQ }, tracks: [] });
  s.tracks = [
    Object.assign(S.newTrack('piano'), { name: 'Piano' }),
    Object.assign(S.newTrack('fingerbass'), { name: 'Bass', sends: { echo: 0, reverb: .1 } }),
    Object.assign(S.newTrack('strings'), { name: 'Strings', volume: .6, sends: { echo: .2, reverb: .4 } }),
    Object.assign(S.newTrack('kit'), { name: 'Drums', sends: { echo: 0, reverb: .12 } })
  ];
  return S.check(s);
}

// ---------- audio: started on the first click or key (browsers allow sound only after one) ----------
function audio() {
  if (!S.ctx) S.init(new AudioContext({ latencyHint: 'interactive' }));
  if (S.ctx.state === 'suspended') S.ctx.resume();
  S.use(st.song);
}

// ---------- changes, undo, the draft ----------
const snap = () => JSON.stringify(st.song);
function changed({ rebuild = false } = {}) {
  st.dirty = true; showSaved();
  for (const tr of st.song.tracks) tr.notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  if (S.ctx) { S.use(st.song); S.sync(); }
  if (rebuild) renderAll(); else { drawArr(); drawRoll(); }
  clearTimeout(changed.t); changed.t = setTimeout(saveDraft, 600);
}
// an edit that undo can take back as one step
function edit(fn, opts) { pushUndo(snap()); st.redo = []; fn(); changed(opts); }
// at most 150 steps, and about 60 MB of them (a song with samples is large)
function pushUndo(j) { st.undo.push(j); let total = st.undo.reduce((n, u) => n + u.length, 0); while (st.undo.length > 150 || (total > 3e7 && st.undo.length > 3)) total -= st.undo.shift().length; }
// slider drags: many small changes, one undo step (settle() when the drag ends)
function tweak(fn) { if (!st.pending) st.pending = snap(); fn(); st.dirty = true; showSaved(); if (S.ctx) S.sync(); clearTimeout(changed.t); changed.t = setTimeout(saveDraft, 600); }
function settle() { if (st.pending) { st.undo.push(st.pending); st.redo = []; st.pending = null; } drawArr(); drawRoll(); }
function restore(json) {
  st.song = S.check(JSON.parse(json)); st.picked.clear(); st.sel = Math.min(st.sel, st.song.tracks.length - 1);
  changed({ rebuild: true });
}
function undo() { if (!st.undo.length) return; st.redo.push(snap()); restore(st.undo.pop()); }
function redo() { if (!st.redo.length) return; st.undo.push(snap()); restore(st.redo.pop()); }
function saveDraft() { try { localStorage.setItem(DRAFT, JSON.stringify({ song: st.song, meta: st.meta, dirty: st.dirty })); } catch { } }
function showSaved(text) {
  $('#saved').textContent = text ?? (st.dirty ? (st.meta.id ? 'changed since saved' : 'not saved yet') : st.meta.id ? 'saved' : '');
}
function load(s, meta = { id: null, updated_at: null, game: GAME_ID }, dirty = false) {
  if (S.playing) stopAll();
  st.song = S.check(s); st.meta = { ...meta }; st.sel = 0; st.picked.clear(); st.undo = []; st.redo = []; st.dirty = dirty; st.start = 0;
  st.view.x = 0; st.view.top = st.song.tracks[0]?.instrument === 'kit' ? 60 : 84;
  if (S.ctx) S.use(st.song);
  S.prepare(st.song);
  renderAll(); showSaved(); saveDraft();
}

// ---------- the track list ----------
function renderTracks() {
  const opts = insOptions(true);
  $('#trackList').innerHTML = st.song.tracks.map((t, i) => `
    <li class="trk${i === st.sel ? ' sel' : ''}" data-i="${i}" style="--c:${COLORS[i % COLORS.length]}">
      <div class="r1"><input class="tname" value="${esc(t.name)}" aria-label="Track name" spellcheck="false">
        <button class="mbtn${t.mute ? ' on' : ''}" data-k="mute" title="Mute" aria-pressed="${t.mute}">M</button>
        <button class="sbtn${t.solo ? ' on' : ''}" data-k="solo" title="Solo" aria-pressed="${t.solo}">S</button></div>
      <select class="tins" aria-label="Instrument">${opts}</select>
      <div class="r3"><input type="range" class="tvol" min="0" max="1" step=".01" value="${t.volume}" aria-label="Volume" title="Volume">
        <input type="range" class="tpan" min="-1" max="1" step=".05" value="${t.pan}" aria-label="Pan" title="Pan (double-click: centre)"></div>
      <span class="meter"><i></i></span>
    </li>`).join('');
  $('#trackList').querySelectorAll('.trk').forEach((li, i) => {
    const t = st.song.tracks[i];
    li.querySelector('.tins').value = t.instrument;
    li.addEventListener('pointerdown', e => { if (st.sel !== i) { st.sel = i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); drawArr(); drawRoll(); } });
    li.querySelector('.tname').onchange = e => edit(() => { t.name = e.target.value.slice(0, 40) || 'Track'; }, { rebuild: true });
    li.querySelector('.tins').onchange = e => setInstrument(i, e.target.value);
    li.querySelectorAll('[data-k]').forEach(b => b.onclick = () => edit(() => { t[b.dataset.k] = !t[b.dataset.k]; }, { rebuild: true }));
    const vol = li.querySelector('.tvol'), pan = li.querySelector('.tpan');
    vol.oninput = () => tweak(() => { t.volume = +vol.value; }); vol.onchange = settle;
    pan.oninput = () => tweak(() => { t.pan = +pan.value; }); pan.onchange = settle;
    pan.ondblclick = () => edit(() => { t.pan = 0; }, { rebuild: true });
  });
}
function insOptions(load) {
  const own = Object.entries(st.song.samples || {});
  return S.INSTRUMENTS.map(i => `<option value="${i.id}">${esc(i.group)} · ${esc(i.name)}</option>`).join('')
    + (own.length ? `<optgroup label="This song's samples">${own.map(([id, sm]) => `<option value="sample:${esc(id)}">Sample · ${esc(sm.name)}</option>`).join('')}</optgroup>` : '')
    + (load ? '<option value="__load">+ Load a sample…</option>' : '');
}
const insName = id => id.startsWith('sample:') ? st.song.samples[id.slice(7)]?.name : S.INSTRUMENTS.find(x => x.id === id)?.name;
function setInstrument(i, id) {
  if (id === '__load') { renderTracks(); return pickSample(i); }
  edit(() => {
    const t = st.song.tracks[i], was = insName(t.instrument);
    if (!t.name || t.name === 'Track' || t.name === was) t.name = insName(id) || 'Track';
    t.instrument = id; t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  if (i === st.sel) focusTrack();
  S.prepare(st.song);
}
// show the part of the keyboard the track uses
function focusTrack() {
  const t = track(); if (!t) return;
  if (t.notes.length) { const lo = Math.min(...t.notes.map(n => n[2])), hi = Math.max(...t.notes.map(n => n[2])); st.view.top = Math.min(127, Math.max(hi + 3, lo + rows() - 3)); }
  else st.view.top = t.instrument === 'kit' ? 60 : t.instrument.includes('bass') ? 60 : 84;
}

// ---------- the strip: the selected track's sound and effects, and the master ----------
function ctl(label, get, set, { min = 0, max = 1, step = .01, fmt = v => v.toFixed(2), log = false, title = '' } = {}) {
  const el = document.createElement('label'); el.className = 'ctl'; if (title) el.title = title;
  const toUI = v => log ? 1000 * Math.log(v / min) / Math.log(max / min) : v, fromUI = u => log ? min * Math.pow(max / min, u / 1000) : u;
  el.innerHTML = `<span>${esc(label)}</span><input type="range" min="${log ? 0 : min}" max="${log ? 1000 : max}" step="${log ? 1 : step}"><output></output>`;
  const inp = el.querySelector('input'), out = el.querySelector('output');
  const show = () => { const v = get(); inp.value = toUI(v); out.textContent = fmt(v); };
  inp.oninput = () => { tweak(() => set(fromUI(+inp.value))); out.textContent = fmt(get()); if (el.closest('.eqbox')) drawEq(); };
  inp.onchange = settle;
  show(); return el;
}
function pick(label, options, get, set) {
  const el = document.createElement('label'); el.className = 'ctl';
  el.innerHTML = `<span>${esc(label)}</span><select>${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`;
  const s = el.querySelector('select'); s.value = String(get()); s.onchange = () => { edit(() => set(s.value)); if (el.closest('.eqbox')) drawEq(); };
  return el;
}
function section(title, ...kids) {
  const d = document.createElement('section'); d.className = 'sec';
  d.innerHTML = `<h3>${esc(title)}</h3>`; d.append(...kids); return d;
}
const ms = v => v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`, db = v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, pct = v => `${Math.round(v * 100)}%`;
const hzs = v => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
function renderStrip() {
  const box = $('#strip'); box.textContent = '';
  const t = track(), m = st.song.master;
  if (t) {
    const d = S.defaults(t.instrument), s = t.sound, kit = t.instrument === 'kit';
    const env = (k, dk) => () => s[k] ?? d.env[dk];
    const head = document.createElement('div'); head.className = 'shead';
    head.innerHTML = `<b style="color:${COLORS[st.sel % COLORS.length]}">${esc(t.name)}</b><span class="spacer"></span>
      <button class="btn small" data-a="up" title="Move up">▲</button><button class="btn small" data-a="down" title="Move down">▼</button>
      <button class="btn small" data-a="dup" title="Duplicate the track">DUP</button><button class="btn small" data-a="del" title="Delete the track">DEL</button>`;
    head.querySelectorAll('[data-a]').forEach(b => b.onclick = () => trackAction(b.dataset.a));
    box.append(head);
    const own = t.instrument.startsWith('sample:');
    if (own) box.append(sampleSection(t.instrument.slice(7)));
    const sound = section('SOUND');
    if (!own) sound.append(pick('Grit', S.RATES.map(r => [r, `${r / 1000} kHz${r === 32000 ? ' (SNES)' : ''}`]), () => s.rate, v => { s.rate = +v; S.prepare(st.song); }));
    if (!kit) sound.append(
      ctl('Octave', () => s.octave, v => { s.octave = Math.round(v); }, { min: -3, max: 3, step: 1, fmt: v => (v > 0 ? '+' : '') + v }),
      ctl('Fine', () => s.fine, v => { s.fine = Math.round(v); }, { min: -100, max: 100, step: 1, fmt: v => `${v} ct` }),
      ctl('Attack', env('attack', 'a'), v => { s.attack = v; }, { min: .001, max: 3, log: true, fmt: ms }),
      ctl('Decay', env('decay', 'd'), v => { s.decay = v; }, { min: .001, max: 4, log: true, fmt: ms }),
      ctl('Sustain', env('sustain', 's'), v => { s.sustain = v; }, { fmt: pct }),
      ctl('Fall', env('fall', 'sd'), v => { s.fall = v < .02 ? 0 : v; }, { min: 0, max: 8, step: .01, fmt: v => v ? `${v.toFixed(2)} s` : 'holds', title: 'How fast a held note fades (the SNES "sustain rate"); off: it holds' }),
      ctl('Release', env('release', 'r'), v => { s.release = v; }, { min: .005, max: 4, log: true, fmt: ms }),
      ctl('Vibrato', () => (s.vibrato ?? d.vib)[0], v => { s.vibrato = [v, (s.vibrato ?? d.vib)[1], (s.vibrato ?? d.vib)[2]]; }, { min: 0, max: 60, step: 1, fmt: v => `${v} ct` }),
      ctl('Vib. speed', () => (s.vibrato ?? d.vib)[1], v => { s.vibrato = [(s.vibrato ?? d.vib)[0], v, (s.vibrato ?? d.vib)[2]]; }, { min: 1, max: 10, step: .1, fmt: v => `${v.toFixed(1)} Hz` }));
    const reset = document.createElement('button'); reset.className = 'btn small'; reset.textContent = '[ INSTRUMENT\'S OWN ]'; reset.title = 'Back to the instrument\'s own envelope and vibrato';
    reset.onclick = () => edit(() => { s.attack = s.decay = s.sustain = s.fall = s.release = s.vibrato = null; s.octave = 0; s.fine = 0; }, { rebuild: true });
    if (!kit) sound.append(reset);
    const eqc = document.createElement('canvas'); eqc.id = 'eqCurve'; eqc.className = 'eqc'; eqc.width = 520; eqc.height = 120;
    const eq = section('EQ', eqc,
      ctl('Low', () => t.eq.low, v => { t.eq.low = v; }, { min: -15, max: 15, step: .5, fmt: db }),
      ctl('Mid', () => t.eq.mid, v => { t.eq.mid = v; }, { min: -15, max: 15, step: .5, fmt: db }),
      ctl('Mid at', () => t.eq.midFreq, v => { t.eq.midFreq = Math.round(v); }, { min: 150, max: 6000, log: true, fmt: hzs }),
      ctl('High', () => t.eq.high, v => { t.eq.high = v; }, { min: -15, max: 15, step: .5, fmt: db }),
      pick('Filter', [['off', 'off'], ['lowpass', 'low-pass'], ['highpass', 'high-pass'], ['bandpass', 'band-pass']], () => t.filter.type, v => { t.filter.type = v; }),
      ctl('Cutoff', () => t.filter.freq, v => { t.filter.freq = Math.round(v); }, { min: 40, max: 16000, log: true, fmt: hzs }),
      ctl('Resonance', () => t.filter.q, v => { t.filter.q = v; }, { min: .1, max: 12, step: .1, fmt: v => v.toFixed(1) }));
    eq.classList.add('eqbox');
    const fx = section('CHORUS AND SENDS',
      ctl('Chorus', () => t.chorus.mix, v => { t.chorus.mix = v; }, { fmt: pct }),
      ctl('Ch. speed', () => t.chorus.rate, v => { t.chorus.rate = v; }, { min: .1, max: 6, step: .05, fmt: v => `${v.toFixed(2)} Hz` }),
      ctl('Ch. depth', () => t.chorus.depth, v => { t.chorus.depth = v; }, { min: 0, max: 10, step: .1, fmt: v => `${v.toFixed(1)} ms` }),
      ctl('Echo', () => t.sends.echo, v => { t.sends.echo = v; }, { fmt: pct, title: 'How much of this track goes into the SNES echo' }),
      ctl('Reverb', () => t.sends.reverb, v => { t.sends.reverb = v; }, { fmt: pct }));
    box.append(sound, eq, fx);
    if (st.song.snes) [eq, fx].forEach(sec => { sec.classList.add('off'); sec.title = 'SNES LIMITS is on: the console had no EQ, filter, chorus or reverb (the echo still works)'; });
  }
  const master = section('MASTER',
    ctl('Volume', () => m.volume, v => { m.volume = v; }, { fmt: pct }),
    ctl('Echo delay', () => m.echo.delay, v => { m.echo.delay = Math.round(v); }, { min: 1, max: 15, step: 1, fmt: v => `${v * 16} ms` }),
    ctl('Echo feedback', () => m.echo.feedback, v => { m.echo.feedback = v; }, { min: -.9, max: .9, step: .01, fmt: pct }),
    pick('Echo filter', S.FIRS.map(f => [f, f]), () => m.echo.fir, v => { m.echo.fir = v; }),
    ctl('Echo level', () => m.echo.volume, v => { m.echo.volume = v; }, { fmt: pct }),
    ctl('Reverb size', () => m.reverb.size, v => { m.reverb.size = v; }, { min: .3, max: 5, step: .1, fmt: v => `${v.toFixed(1)} s` }),
    ctl('Reverb damp', () => m.reverb.damp, v => { m.reverb.damp = v; }, { fmt: pct }),
    ctl('Reverb level', () => m.reverb.volume, v => { m.reverb.volume = v; }, { fmt: pct }),
    ctl('Bass', () => m.eq.low, v => { m.eq.low = v; }, { min: -12, max: 12, step: .5, fmt: db }),
    ctl('Treble', () => m.eq.high, v => { m.eq.high = v; }, { min: -12, max: 12, step: .5, fmt: db }),
    ctl('Glue', () => m.comp, v => { m.comp = v; }, { fmt: pct, title: 'The compressor: holds the mix together and louder' }));
  box.append(master);
  drawEq();
}
function trackAction(a) {
  const T = st.song.tracks, i = st.sel;
  if (a === 'del') { if (T.length < 2 || (T[i].notes.length && !confirm(`Delete the track "${T[i].name}" and its ${T[i].notes.length} notes?`))) return; edit(() => { T.splice(i, 1); st.sel = Math.max(0, i - 1); }, { rebuild: true }); }
  if (a === 'dup' && T.length < 32) edit(() => { const c = JSON.parse(JSON.stringify(T[i])); c.name += ' 2'; T.splice(i + 1, 0, c); st.sel = i + 1; }, { rebuild: true });
  if (a === 'up' && i > 0) edit(() => { [T[i - 1], T[i]] = [T[i], T[i - 1]]; st.sel = i - 1; }, { rebuild: true });
  if (a === 'down' && i < T.length - 1) edit(() => { [T[i + 1], T[i]] = [T[i], T[i + 1]]; st.sel = i + 1; }, { rebuild: true });
}
// the EQ and filter's response, drawn from real filters of the same kind (an offline context, so it works before sound starts)
const eqCtx = new OfflineAudioContext(1, 128, 44100);
const eqNodes = ['lowshelf', 'peaking', 'highshelf', 'allpass'].map(type => { const b = eqCtx.createBiquadFilter(); b.type = type; return b; });
function drawEq() {
  const cv = $('#eqCurve'), t = track(); if (!cv || !t) return;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, n = 200, fs = new Float32Array(n), mag = new Float32Array(n), ph = new Float32Array(n), tot = new Float32Array(n).fill(0);
  for (let i = 0; i < n; i++) fs[i] = 30 * Math.pow(16000 / 30, i / (n - 1));
  const [lo, mid, hi, f] = eqNodes, off = st.song.snes;
  lo.frequency.value = 200; lo.gain.value = off ? 0 : t.eq.low; mid.frequency.value = t.eq.midFreq; mid.Q.value = .9; mid.gain.value = off ? 0 : t.eq.mid; hi.frequency.value = 4000; hi.gain.value = off ? 0 : t.eq.high;
  f.type = off || t.filter.type === 'off' ? 'allpass' : t.filter.type; f.frequency.value = t.filter.freq; f.Q.value = t.filter.q;
  for (const b of eqNodes) { b.getFrequencyResponse(fs, mag, ph); for (let i = 0; i < n; i++) tot[i] += 20 * Math.log10(Math.max(mag[i], 1e-4)); }
  x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1d2634'; x.lineWidth = 1;
  for (const db of [-12, 0, 12]) { const y = H / 2 - db / 30 * H; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  for (const f0 of [100, 1000, 10000]) { const X = W * Math.log(f0 / 30) / Math.log(16000 / 30); x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke(); }
  x.strokeStyle = '#ffb340'; x.lineWidth = 2; x.beginPath();
  for (let i = 0; i < n; i++) { const X = i / (n - 1) * W, Y = Math.min(H - 1, Math.max(1, H / 2 - tot[i] / 30 * H)); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
  x.stroke();
}

// ---------- the song overview: bar ruler, loop, start mark, every track's notes ----------
const A = { cv: $('#arr'), RULER: 18, TH: 14 };
function drawArr() {
  if (!st.song) return;
  const cv = A.cv, dpr = devicePixelRatio || 1, T = st.song.tracks, H = A.RULER + T.length * A.TH + 4;
  const W = cv.clientWidth; cv.style.height = H + 'px';
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const E = end(), k = (W - 2) / E, bar = st.song.beatsPerBar * PPQ, lp = st.song.loop;
  x.fillStyle = '#0b0f17'; x.fillRect(0, 0, W, H);
  x.fillStyle = lp.on ? 'rgba(255,179,64,.35)' : 'rgba(93,107,128,.25)'; x.fillRect(lp.start * k, 0, (lp.end - lp.start) * k, A.RULER - 4);
  x.font = '10px JetBrains Mono, monospace'; x.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(28 / (bar * k)));
  for (let b = 0; b <= st.song.bars; b++) {
    const X = Math.round(b * bar * k) + .5;
    x.fillStyle = b % every ? '#1d2634' : '#2a3546'; x.fillRect(X, A.RULER - 4, 1, H);
    if (b % every === 0 && b < st.song.bars) { x.fillStyle = '#5d6b80'; x.fillText(String(b + 1), X + 3, 2); }
  }
  T.forEach((t, i) => {
    const y = A.RULER + i * A.TH;
    if (i === st.sel) { x.fillStyle = 'rgba(120,220,255,.08)'; x.fillRect(0, y, W, A.TH); }
    x.fillStyle = t.mute ? '#2a3546' : COLORS[i % COLORS.length];
    for (const [at, len, note] of t.notes) x.fillRect(at * k, y + 2 + (1 - note / 127) * (A.TH - 5), Math.max(1, len * k), 2);
  });
  // the piano roll's window, the start mark and the playhead
  const vis = (R.w - R.KEYW) / st.view.zoom;
  x.strokeStyle = 'rgba(238,243,249,.35)'; x.strokeRect(st.view.x * k + .5, A.RULER + st.sel * A.TH + .5, vis * k, A.TH - 1);
  x.fillStyle = '#8ceb96'; x.beginPath(); x.moveTo(st.start * k - 5, 0); x.lineTo(st.start * k + 5, 0); x.lineTo(st.start * k, 7); x.fill();
  const p = S.playing ? S.position() : -1;
  if (p >= 0) { x.fillStyle = '#eef3f9'; x.fillRect(p * k, 0, 1.5, H); }
}
A.cv.addEventListener('pointerdown', e => {
  audio();
  const r = A.cv.getBoundingClientRect(), k = (r.width - 2) / end(), bar = st.song.beatsPerBar * PPQ;
  const tickAt = ev => Math.max(0, Math.min(end(), (ev.clientX - r.left) / k));
  const y = e.clientY - r.top;
  if (y < A.RULER) {   // click: the start mark; drag: the loop
    const t0 = tickAt(e); let moved = false, before = snap();
    const mv = ev => { const t1 = tickAt(ev); if (Math.abs(t1 - t0) * k > 4) moved = true; if (!moved) return;
      const a = Math.floor(Math.min(t0, t1) / bar) * bar, b = Math.ceil(Math.max(t0, t1) / bar) * bar;
      st.song.loop = { on: true, start: a, end: Math.max(a + bar, b) }; syncTransport(); drawArr(); drawRoll(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { st.undo.push(before); st.redo = []; changed(); } else { st.start = Math.floor(t0 / bar) * bar; drawArr(); drawRoll(); showPos(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  const i = Math.floor((y - A.RULER) / A.TH);
  if (i >= 0 && i < st.song.tracks.length) {
    if (i !== st.sel) { st.sel = i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); }
    st.view.x = Math.max(0, tickAt(e) - (R.w - R.KEYW) / st.view.zoom / 2); drawArr(); drawRoll();
  }
});

// ---------- the piano roll ----------
const R = { cv: $('#roll'), KEYW: 54, RULER: 18, VEL: 54, RH: 12, w: 0, h: 0 };
const rows = () => Math.floor((R.h - R.RULER - R.VEL) / R.RH);
const xOf = t => R.KEYW + (t - st.view.x) * st.view.zoom, tOf = x => st.view.x + (x - R.KEYW) / st.view.zoom;
const yOf = n => R.RULER + (st.view.top - n) * R.RH, nOf = y => st.view.top - Math.floor((y - R.RULER) / R.RH);
function sizeRoll() {
  const dpr = devicePixelRatio || 1, wrap = R.cv.parentElement;
  R.w = wrap.clientWidth; R.h = Math.max(220, wrap.clientHeight);
  R.cv.width = Math.round(R.w * dpr); R.cv.height = Math.round(R.h * dpr); R.cv.style.width = R.w + 'px'; R.cv.style.height = R.h + 'px';
}
function drawRoll() {
  if (!st.song) return;
  const x = R.cv.getContext('2d'), dpr = devicePixelRatio || 1, t = track(); if (!t) return;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = R.w, H = R.h, gB = H - R.VEL, kit = t.instrument === 'kit', bar = st.song.beatsPerBar * PPQ, E = end();
  st.view.top = Math.max(rows() - 1, Math.min(127, st.view.top));
  x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
  // rows
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n);
    x.fillStyle = kit ? (S.KIT[n] ? '#101622' : '#080b11') : isBlack(n) ? '#080b11' : n % 12 === 0 ? '#121a27' : '#0d121b';
    x.fillRect(R.KEYW, y, W - R.KEYW, R.RH - 1);
  }
  // beyond the song's end
  const xe = xOf(E); if (xe < W) { x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(Math.max(R.KEYW, xe), R.RULER, W, gB - R.RULER); }
  // grid lines: the grid, beats, bars
  const t0 = Math.max(0, Math.floor(st.view.x / st.grid) * st.grid), t1 = tOf(W);
  for (let g = t0; g <= t1; g += st.grid) {
    const X = Math.round(xOf(g)) + .5; if (X < R.KEYW) continue;
    const isBar = g % bar === 0, isBeat = g % PPQ === 0;
    if (!isBar && !isBeat && st.grid * st.view.zoom < 5) continue;
    x.fillStyle = isBar ? '#2f3b4e' : isBeat ? '#1c2533' : '#121822'; x.fillRect(X, R.RULER, 1, gB - R.RULER);
  }
  // ruler: bars, the loop, the start mark
  x.fillStyle = '#0b0f17'; x.fillRect(R.KEYW, 0, W, R.RULER);
  const lp = st.song.loop;
  x.fillStyle = lp.on ? 'rgba(255,179,64,.35)' : 'rgba(93,107,128,.2)'; x.fillRect(Math.max(R.KEYW, xOf(lp.start)), 2, Math.max(0, xOf(lp.end) - Math.max(R.KEYW, xOf(lp.start))), R.RULER - 6);
  x.font = '10px JetBrains Mono, monospace'; x.textBaseline = 'top'; x.fillStyle = '#5d6b80';
  for (let b = Math.floor(st.view.x / bar); b * bar <= t1; b++) { const X = xOf(b * bar); if (X >= R.KEYW) x.fillText(String(b + 1), X + 3, 3); }
  if (xOf(st.start) >= R.KEYW) { const X = xOf(st.start); x.fillStyle = '#8ceb96'; x.beginPath(); x.moveTo(X - 5, 0); x.lineTo(X + 5, 0); x.lineTo(X, 8); x.fill(); }
  // other tracks, faint, to compose against
  st.song.tracks.forEach((o, i) => {
    if (i === st.sel || o.instrument === 'kit' || kit) return;
    x.fillStyle = 'rgba(93,107,128,.28)';
    for (const [at, len, n] of o.notes) { const X = xOf(at); if (X > W || X + len * st.view.zoom < R.KEYW) continue; x.fillRect(X, yOf(n) + 3, len * st.view.zoom, R.RH - 7); }
  });
  // the track's notes
  const col = COLORS[st.sel % COLORS.length];
  const drawNote = (n, fill, stroke) => {
    const [at, len, p, v] = n, X = xOf(at), Y = yOf(p), w = Math.max(3, len * st.view.zoom - 1);
    if (X > W || X + w < R.KEYW || Y < R.RULER - R.RH || Y > gB) return;
    x.globalAlpha = .45 + .55 * v / 127; x.fillStyle = fill; x.fillRect(X, Y, w, R.RH - 1); x.globalAlpha = 1;
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.5; x.strokeRect(X + .75, Y + .75, w - 1.5, R.RH - 2.5); }
  };
  for (const n of t.notes) drawNote(n, st.picked.has(n) ? '#78dcff' : col, st.picked.has(n) ? '#eef3f9' : null);
  if (st.rec && st.rec.track === st.sel) for (const n of st.rec.notes) drawNote([n.at, (n.len ?? Math.max(1, recTick() - n.at)), n.note, n.vel], '#ff6048');
  if (drag && drag.mode === 'box') { x.strokeStyle = '#eef3f9'; x.setLineDash([4, 3]); x.strokeRect(drag.bx, drag.by, drag.bw, drag.bh); x.setLineDash([]); }
  // velocity lane
  x.fillStyle = '#0b0f17'; x.fillRect(R.KEYW, gB, W, R.VEL); x.fillStyle = '#1d2634'; x.fillRect(R.KEYW, gB, W, 1);
  for (const n of t.notes) { const X = xOf(n[0]); if (X < R.KEYW || X > W) continue; const h = (R.VEL - 8) * n[3] / 127; x.fillStyle = st.picked.has(n) ? '#78dcff' : col; x.fillRect(X, H - 3 - h, 3, h); }
  // keyboard
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n);
    x.fillStyle = kit ? '#111722' : isBlack(n) ? '#05070c' : '#cdd6e2'; x.fillRect(0, y, R.KEYW - 2, R.RH - 1);
    const held = [...st.live.values()].some(l => l.note === n) || (drag && drag.audition === n);
    if (held) { x.fillStyle = '#ffb340'; x.fillRect(0, y, R.KEYW - 2, R.RH - 1); }
    const label = kit ? (S.KIT[n] || '') : n % 12 === 0 ? noteName(n) : '';
    if (label) { x.fillStyle = kit ? '#cdd6e2' : '#05070c'; x.font = '9px JetBrains Mono, monospace'; x.textBaseline = 'middle'; x.fillText(label.slice(0, 9), 2, y + R.RH / 2); }
  }
  x.fillStyle = '#0b0f17'; x.fillRect(0, 0, R.KEYW, R.RULER); x.fillRect(0, gB, R.KEYW, R.VEL);
  x.fillStyle = '#5d6b80'; x.font = '9px JetBrains Mono, monospace'; x.textBaseline = 'top'; x.fillText('VEL', 6, gB + 6);
  // playhead
  const p = S.playing ? recTick() : -1;
  if (p >= 0 && xOf(p) >= R.KEYW) { x.fillStyle = '#eef3f9'; x.fillRect(xOf(p), 0, 1.5, gB); }
}
const noteAt = (tick, pitch) => { const N = track().notes; for (let i = N.length - 1; i >= 0; i--) { const n = N[i]; if (n[2] === pitch && tick >= n[0] && tick < n[0] + n[1]) return n; } return null; };
let drag = null;
R.cv.addEventListener('contextmenu', e => e.preventDefault());
R.cv.addEventListener('pointerdown', e => {
  audio(); R.cv.focus({ preventScroll: true });
  const r = R.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, t = track(), gB = R.h - R.VEL;
  R.cv.setPointerCapture(e.pointerId);
  if (py < R.RULER) { st.start = Math.max(0, snapAt(tOf(px), PPQ)); drawRoll(); drawArr(); showPos(); return; }
  if (px < R.KEYW) { const n = nOf(py); drag = { mode: 'key', audition: n, v: S.noteOn(st.sel, n, 100) }; drawRoll(); return; }
  if (py >= gB) { drag = { mode: 'vel', before: snap(), changed: false }; velAt(px, py); return; }
  const tick = tOf(px), pitch = nOf(py), hit = noteAt(tick, pitch);
  if (e.button === 2) { if (hit) edit(() => { t.notes.splice(t.notes.indexOf(hit), 1); st.picked.delete(hit); }); return; }
  if (!hit && e.shiftKey) { drag = { mode: 'box', x0: px, y0: py, bx: px, by: py, bw: 0, bh: 0, add: new Set(st.picked) }; return; }
  if (hit && e.shiftKey) { st.picked.has(hit) ? st.picked.delete(hit) : st.picked.add(hit); drawRoll(); return; }
  if (hit) {
    if (!st.picked.has(hit)) { st.picked.clear(); st.picked.add(hit); }
    const nearEnd = px > xOf(hit[0] + hit[1]) - 6;
    drag = { mode: nearEnd ? 'resize' : 'move', before: snap(), changed: false, t0: tick, p0: pitch, orig: new Map([...st.picked].map(n => [n, [...n]])), audition: hit[2] };
    if (!nearEnd) drag.v = S.noteOn(st.sel, hit[2], hit[3]);
  } else {
    const at = Math.max(0, Math.floor(tick / st.grid) * st.grid), n = [at, t.instrument === 'kit' ? st.grid : st.len, pitch, 100];
    st.undo.push(snap()); st.redo = []; t.notes.push(n); t.notes.sort((a, b) => a[0] - b[0]);
    st.picked.clear(); st.picked.add(n);
    drag = { mode: 'resize', created: true, changed: true, t0: tick, orig: new Map([[n, [...n]]]), audition: pitch, v: S.noteOn(st.sel, pitch, 100) };
  }
  drawRoll();
});
R.cv.addEventListener('pointermove', e => {
  if (!drag) { const r = R.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, gB = R.h - R.VEL;
    const hit = py > R.RULER && py < gB && px > R.KEYW ? noteAt(tOf(px), nOf(py)) : null;
    R.cv.style.cursor = hit ? (px > xOf(hit[0] + hit[1]) - 6 ? 'ew-resize' : 'grab') : px < R.KEYW ? 'pointer' : 'crosshair'; return; }
  const r = R.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, tick = tOf(px);
  if (drag.mode === 'vel') return velAt(px, py);
  if (drag.mode === 'box') {
    Object.assign(drag, { bx: Math.min(drag.x0, px), by: Math.min(drag.y0, py), bw: Math.abs(px - drag.x0), bh: Math.abs(py - drag.y0) });
    const ta = tOf(drag.bx), tb = tOf(drag.bx + drag.bw), pa = nOf(drag.by + drag.bh), pb = nOf(drag.by);
    st.picked = new Set([...drag.add, ...track().notes.filter(n => n[0] < tb && n[0] + n[1] > ta && n[2] >= pa && n[2] <= pb)]);
    return drawRoll();
  }
  if (drag.mode === 'key') { const n = nOf(py); if (n !== drag.audition) { S.noteOff(drag.v); drag.audition = n; drag.v = S.noteOn(st.sel, n, 100); drawRoll(); } return; }
  if (drag.mode === 'move') {
    const dt = snapAt(tick - drag.t0), dp = nOf(py) - drag.p0;
    const minAt = Math.min(...[...drag.orig.values()].map(o => o[0])), dtc = Math.max(-minAt, dt);
    for (const [n, o] of drag.orig) { n[0] = o[0] + dtc; n[2] = Math.max(0, Math.min(127, o[2] + dp)); }
    const lead = [...drag.orig.keys()][0];
    if (lead && lead[2] !== drag.audition) { S.noteOff(drag.v); drag.audition = lead[2]; drag.v = S.noteOn(st.sel, lead[2], lead[3]); }
    drag.changed = drag.changed || dtc !== 0 || dp !== 0;
  }
  if (drag.mode === 'resize') {
    const g = st.grid;
    for (const [n, o] of drag.orig) { const e2 = drag.created ? Math.max(o[0] + g, Math.ceil((tick + 1) / g) * g) : Math.max(o[0] + Math.min(g, o[1]), snapAt(o[0] + o[1] + (tick - drag.t0))); n[1] = Math.max(1, e2 - o[0]); }
    drag.changed = true;
  }
  drawRoll();
});
function velAt(px, py) {
  const t = track(), v = Math.max(1, Math.min(127, Math.round((R.h - 3 - py) / (R.VEL - 8) * 127)));
  let near = t.notes.filter(n => Math.abs(xOf(n[0]) - px) < 5);
  if (near.some(n => st.picked.has(n))) near = [...st.picked];
  for (const n of near) n[3] = v;
  if (near.length) drag.changed = true;
  drawRoll();
}
addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.v) S.noteOff(d.v);
  if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'vel') {
    if (d.changed) { if (d.before) { st.undo.push(d.before); st.redo = []; } if (d.mode === 'resize') st.len = [...d.orig.keys()][0]?.[1] || st.len; changed(); }
  }
  drawRoll();
});
R.cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const r = R.cv.getBoundingClientRect(), px = e.clientX - r.left, at = tOf(px);
    st.view.zoom = Math.max(.05, Math.min(6, st.view.zoom * Math.exp(-e.deltaY * .002)));
    st.view.x = Math.max(0, at - (px - R.KEYW) / st.view.zoom);
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) st.view.x = Math.max(0, st.view.x + (e.deltaX || e.deltaY) / st.view.zoom);
  else st.view.top = Math.max(rows() - 1, Math.min(127, st.view.top - Math.sign(e.deltaY) * 3));
  drawRoll(); drawArr();
}, { passive: false });

// ---------- editing commands ----------
function picked() { return track().notes.filter(n => st.picked.has(n)); }
function moveSel(dt, dp) {
  const P = picked(); if (!P.length) return;
  if (dt < 0 && Math.min(...P.map(n => n[0])) + dt < 0) return;
  edit(() => { for (const n of P) { n[0] += dt; n[2] = Math.max(0, Math.min(127, n[2] + dp)); } });
  if (dp && P.length === 1) { const v = S.noteOn(st.sel, P[0][2], P[0][3]); setTimeout(() => S.noteOff(v), 180); }
}
function copySel() { const P = picked(); if (!P.length) return; const a = Math.min(...P.map(n => n[0])); st.clip = P.map(([at, l, p, v]) => [at - a, l, p, v]); }
function pasteAt(at) {
  if (!st.clip) return;
  const t = track(), add = st.clip.map(([o, l, p, v]) => [at + o, l, p, v]);
  edit(() => { t.notes.push(...add); st.picked = new Set(add); });
}
function duplicateSel() {
  const P = picked(); if (!P.length) return;
  const a = Math.min(...P.map(n => n[0])), b = Math.max(...P.map(n => n[0] + n[1])), span = Math.ceil((b - a) / st.grid) * st.grid;
  copySel(); pasteAt(a + span);
}
function quantizeSel() { const P = picked(); if (!P.length) return; edit(() => { for (const n of P) { n[0] = snapAt(n[0]); n[1] = Math.max(st.grid, snapAt(n[1])); } }); }
function deleteSel() { const P = picked(); if (!P.length) return; const t = track(); edit(() => { t.notes = t.notes.filter(n => !st.picked.has(n)); st.picked.clear(); }); }

// ---------- transport ----------
const latencyTicks = () => (S.ctx ? (S.ctx.outputLatency || S.ctx.baseLatency || 0) : 0) * st.song.bpm / 60 * PPQ;
// the tick being heard (what a player hears, so a recorded note lands where it was played)
const recTick = () => S.playing ? S.position() - latencyTicks() : st.start;
function setPlaying(on) {
  $('#playBtn').classList.toggle('on', on); $('#playBtn').textContent = on ? '❚❚' : '▶';
  $('#recBtn').classList.toggle('on', !!st.rec);
}
function play() {
  audio();
  if (S.playing) return stopAll();
  S.metronome = st.click;
  S.play(st.song, { from: st.start, loop: st.song.loop.on, onEnd: () => stopAll() });
  setPlaying(true);
}
function record() {
  audio();
  if (st.rec) return stopAll();
  if (S.playing) S.stop(.02);
  st.rec = { track: st.sel, notes: [], before: snap() };
  S.metronome = st.click;
  S.play(st.song, { from: st.start - (st.countIn ? st.song.beatsPerBar * PPQ : 0), loop: st.song.loop.on, onEnd: () => stopAll() });
  setPlaying(true);
}
function stopAll() {
  if (st.rec) finishRec();
  S.stop(); setPlaying(false); showPos(); drawRoll(); drawArr();
}
function finishRec() {
  const R0 = st.rec; st.rec = null;
  const now = recTick(), lp = st.song.loop, g = st.grid;
  const notes = R0.notes.map(n => {
    let at = n.at, e2 = n.len !== undefined ? n.at + n.len : now;
    if (e2 < at) e2 = lp.on ? lp.end : end();   // held across the loop's end
    if (st.quant) { at = snapAt(at); e2 = Math.max(at + g, snapAt(e2)); }
    return [Math.max(0, Math.round(at)), Math.max(1, Math.round(e2 - at)), n.note, n.vel];
  }).filter(n => n[0] < end());
  if (!notes.length) return;
  st.undo.push(R0.before); st.redo = [];
  st.song.tracks[R0.track].notes.push(...notes); st.picked = new Set(notes);
  changed();
}
function showPos() {
  const p = Math.max(0, S.playing ? recTick() : st.start), bar = st.song.beatsPerBar * PPQ;
  const b = Math.floor(p / bar), beat = Math.floor((p % bar) / PPQ), tk = Math.floor(p % PPQ);
  $('#pos').textContent = S.playing && S.position() < 0 ? 'count-in' : `${b + 1}.${beat + 1}.${String(tk).padStart(2, '0')}`;
}
function frame() {
  if (S.playing) {
    showPos();
    const p = recTick(), vis = (R.w - R.KEYW) / st.view.zoom;
    if (st.follow && p >= 0 && (p > st.view.x + vis * .92 || p < st.view.x)) st.view.x = Math.max(0, p - vis * .08);
    drawRoll(); drawArr();
  }
  const m = S.meter();
  if (m) $('#trackList').querySelectorAll('.trk .meter i').forEach((el, i) => { el.style.width = `${Math.round(100 * Math.min(1, (m.tracks[i] || 0) * 1.2))}%`; });
  requestAnimationFrame(frame);
}

// ---------- playing live: a MIDI keyboard or the computer keyboard ----------
function liveOn(note, vel, id = note) {
  audio();
  if (st.live.has(id)) liveOff(id, true);
  const v = S.noteOn(st.sel, note, vel, st.bend);
  const rec = st.rec && st.rec.track === st.sel ? { at: Math.max(0, recTick()), note, vel } : null;
  if (rec && S.position() < -PPQ / 2) rec.at = null;   // played during the count-in: not recorded
  if (rec && rec.at !== null) st.rec.notes.push(rec);
  st.live.set(id, { v, note, rec, held: false });
  drawRoll();
}
function liveOff(id, now = false) {
  const l = st.live.get(id); if (!l) return;
  if (st.pedal && !now) { l.held = true; return; }
  S.noteOff(l.v); st.live.delete(id);
  if (l.rec && l.rec.at !== null) l.rec.len = Math.max(1, recTick() - l.rec.at);
  drawRoll();
}
function pedal(down) { st.pedal = down; if (!down) for (const [id, l] of [...st.live]) if (l.held) liveOff(id, true); }
async function connectMidi() {
  audio();
  if (!navigator.requestMIDIAccess) { $('#midiInfo').textContent = 'this browser has no Web MIDI (try Chrome or Edge)'; return; }
  try {
    const acc = await navigator.requestMIDIAccess(), names = new Set();
    const hook = inp => { names.add(inp.name || 'MIDI'); inp.onmidimessage = e => midiIn(e.data); };
    acc.inputs.forEach(hook);
    acc.onstatechange = e => { if (e.port.type === 'input' && e.port.state === 'connected') { hook(e.port); show(); } };
    const show = () => { $('#midiInfo').textContent = names.size ? `MIDI: ${[...names].join(', ')}` : 'MIDI ready: plug in a keyboard'; };
    show(); $('#midiBtn').classList.add('on');
  } catch (e) { $('#midiInfo').textContent = 'MIDI was not allowed'; }
}
function midiIn(d) {
  const hi = d[0] & 0xF0, a = d[1], b = d[2];
  if (hi === 0x90 && b > 0) liveOn(a, b);
  else if (hi === 0x80 || hi === 0x90) liveOff(a);
  else if (hi === 0xB0 && a === 64) pedal(b >= 64);
  else if (hi === 0xE0) { st.bend = (((b << 7) | a) - 8192) / 8192 * 2; for (const l of st.live.values()) S.bend(l.v, st.bend); }
}
const QWERTY = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };

// ---------- keys ----------
const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range';
addEventListener('keydown', e => {
  if (typing(e) || document.querySelector('dialog[open]')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (st.keys && !ctrl && !e.altKey) {
    if (e.code in QWERTY) { e.preventDefault(); if (!e.repeat) liveOn((st.octave + 1) * 12 + QWERTY[e.code], 100, e.code); return; }
    if (e.code === 'KeyZ' || e.code === 'KeyX') { st.octave = Math.max(0, Math.min(8, st.octave + (e.code === 'KeyX' ? 1 : -1))); $('#keysBtn').textContent = `KEYS C${st.octave}`; return; }
  }
  if (e.code === 'Space') { e.preventDefault(); play(); }
  else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); }
  else if (ctrl && e.code === 'KeyS') { e.preventDefault(); save(); }
  else if (ctrl && e.code === 'KeyC') copySel();
  else if (ctrl && e.code === 'KeyV') { e.preventDefault(); pasteAt(st.start); }
  else if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSel(); }
  else if (ctrl && e.code === 'KeyA') { e.preventDefault(); st.picked = new Set(track().notes); drawRoll(); }
  else if (!ctrl && e.code === 'KeyR') record();
  else if (!ctrl && e.code === 'KeyQ') quantizeSel();
  else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSel(); }
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); moveSel(0, (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)); }
  else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); moveSel((e.code === 'ArrowRight' ? 1 : -1) * st.grid, 0); }
  else if (e.code === 'Escape') { st.picked.clear(); drawRoll(); }
});
addEventListener('keyup', e => { if (st.keys && e.code in QWERTY) liveOff(e.code); });
addEventListener('blur', () => { for (const id of [...st.live.keys()]) liveOff(id, true); });

// ---------- saving: the site (worker/songs.js), a file, a WAV ----------
const slug = s => (String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'song');
async function api(path, opts = {}) {
  const r = await fetch(path, { cache: 'no-store', ...opts, headers: { 'X-Pixelite': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}
async function save(copy = false) {
  if (!st.meta.id || copy) st.meta = { id: `${slug(st.song.title)}-${Math.random().toString(36).slice(2, 6)}`, updated_at: null, game: st.meta.game || GAME_ID };
  showSaved('saving…');
  try {
    const r = await api(`/api/songs/${st.meta.id}`, { method: 'PUT', body: JSON.stringify({ song: st.song, game: st.meta.game, base: st.meta.updated_at }) });
    st.meta.updated_at = r.updated_at; st.dirty = false; showSaved(); saveDraft(); listSongs();
  } catch (e) {
    if (e.status === 409 && confirm(`"${st.song.title}" was saved ${e.body.updated_by ? 'by ' + e.body.updated_by + ' ' : ''}somewhere else since you opened it (${new Date(e.body.updated_at).toLocaleString()}). Save yours over it?`)) {
      st.meta.updated_at = e.body.updated_at; return save();
    }
    showSaved(e.status === 409 ? 'not saved (kept here)' : `not saved: ${e.message} (kept in this browser)`);
  }
}
async function listSongs() {
  try {
    const { items } = await api('/api/songs');
    const mine = items.filter(s => (s.game || '') === GAME_ID);   // this project's songs
    $('#songs').innerHTML = `<option value="">${mine.length ? `songs (${mine.length})…` : 'no songs saved yet'}</option>` + mine.map(s => `<option value="${esc(s.id)}">${esc(s.title)} · ${new Date(s.updated_at).toLocaleDateString()}</option>`).join('');
    return items;
  } catch { $('#songs').innerHTML = '<option value="">no saved songs here</option>'; }
}
async function openSong(id) {
  if (!id) return;
  if (st.dirty && !confirm('This song has changes that are not saved to the site (a draft is kept in this browser). Open the other one anyway?')) { $('#songs').value = ''; return; }
  try { const r = await api(`/api/songs/${encodeURIComponent(id)}`); load(r.song, { id: r.id, updated_at: r.updated_at, game: r.game }); }
  catch (e) { showSaved(`could not open it: ${e.message}`); }
  $('#songs').value = '';
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
function wav(buf) {   // 16-bit stereo PCM
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)], out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < 2; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
  return new Blob([out], { type: 'audio/wav' });
}
async function exportWav() {
  showSaved('rendering…');
  const buf = await S.render(st.song, { loop: false });
  download(wav(buf), `${slug(st.song.title)}.wav`); showSaved();
}
function exportFile() { download(new Blob([JSON.stringify(st.song, null, 1)], { type: 'application/json' }), `${slug(st.song.title)}.song.json`); }
async function importFile(f) {
  try { load(JSON.parse(await f.text()), undefined, true); } catch (e) { alert(`That is not a song file: ${e.message}`); }
}

// the prompt that hands a saved song to a Claude session, to put it into a game
async function promptDialog() {
  await games();
  const sel = $('#gameSel');
  sel.innerHTML = '<option value="">choose…</option>' + gamesList.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('');
  sel.value = st.meta.game || '';
  const text = () => {
    const g = sel.value, id = st.meta.id;
    if (!id || st.dirty) return 'Save the song first ([ SAVE ]): the session reads the saved one.';
    if (!g) return 'Choose the game it is for.';
    return [`Put the song "${st.song.title}" from the SOUND STUDIO into ${gamesList.find(x => x.id === g)?.title || g} (games/${g}/):`,
      `1. Read it with the D1 connector: SELECT data FROM songs WHERE id = '${id}';`,
      `   and save it as games/${g}/music/${id}.song.json`,
      `2. node tools/song.mjs ${g}   (writes games/${g}/songs.js; add it to game.json's parts if it is new)`,
      `3. It plays ${placesText()} (its places, set under WHERE IT PLAYS, are in the song: tools/song.mjs writes them to SONG_AT).`,
      `   Make sure the game plays SONG_AT's songs there (engine/API.md, Sampler; Space Mouse's stationMusic() is an example).`,
      `4. Verify it (pixelite-verify) and open a pull request.`].join('\n');
  };
  sel.onchange = () => { if (st.meta.game !== sel.value) { st.meta.game = sel.value; st.dirty = true; showSaved(); } $('#promptText').textContent = text(); };
  $('#promptText').textContent = text();
  $('#copyPrompt').onclick = async () => { try { await navigator.clipboard.writeText($('#promptText').textContent); $('#copyPrompt').textContent = '[ COPIED ]'; } catch { } };
  $('#promptDlg').showModal();
}

// ---------- projects: the games songs are for ----------
let gamesList = [];
async function games() {
  if (!gamesList.length) try { gamesList = (await (await fetch('/games.json', { cache: 'no-store' })).json()).games.filter(g => g.listed && !g.template); } catch { }
  return gamesList;
}
async function showProjects() {
  let items = []; try { items = (await api('/api/songs')).items; } catch { }
  const count = id => items.filter(s => (s.game || '') === id).length, n = c => `${c} song${c === 1 ? '' : 's'}`;
  $('#projList').innerHTML = gamesList.map(g => `<a class="proj" href="/studio/?game=${esc(g.id)}">
      ${g.thumbnail ? `<img src="/${esc(g.thumbnail)}" alt="">` : '<span class="ph"></span>'}<b>${esc(g.title)}</b><span class="muted">${n(count(g.id))}</span></a>`).join('')
    + `<a class="proj" href="/studio/?game=none"><span class="ph">♪</span><b>Sketches</b><span class="muted">${n(count(''))} · for no game yet</span></a>`;
  $('#projects').hidden = false;
}

// ---------- samples: your own sounds, kept in the song as SNES BRR ----------
const MAX_SECS = 6, sources = new Map();   // sample id → the sound as loaded ({ pcm, sr }): re-made from it at another rate or length
let sampleFor = 0;
function pickSample(i) { sampleFor = i; $('#sampleFile').value = ''; $('#sampleFile').click(); }
async function decodeFile(file) {
  const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
  const n = b.length, pcm = new Float32Array(n);
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) pcm[i] += d[i] / b.numberOfChannels; }
  let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  if (!peak) throw new Error('it is silent');
  let a = 0; while (a < n - 1 && Math.abs(pcm[a]) < peak * .02) a++;   // from where it starts sounding
  return { pcm: pcm.slice(a), sr: b.sampleRate };
}
// the source at `rate` (the browser's own resampler), `secs` long at most, its peak at .95
async function resample({ pcm, sr }, rate, secs) {
  const n = Math.max(16, Math.min(pcm.length, Math.round(secs * sr))), oc = new OfflineAudioContext(1, Math.max(16, Math.round(n * rate / sr)), rate);
  const b = oc.createBuffer(1, n, sr); b.copyToChannel(pcm.subarray(0, n), 0);
  const src = oc.createBufferSource(); src.buffer = b; src.connect(oc.destination); src.start();
  const out = (await oc.startRendering()).getChannelData(0);
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak) for (let i = 0; i < out.length; i++) out[i] *= .95 / peak;
  return out;
}
// the note a sound plays (autocorrelation: the first lag nearly as alike as the best one), as a MIDI note with cents
function detectRoot(x, sr) {
  const a = Math.floor(x.length * .1), N = Math.min(4096, x.length - a);
  if (N < 256) return null;
  const lo = Math.floor(sr / 1800), hi = Math.min(Math.floor(sr / 35), N >> 1), r = new Float32Array(hi + 2);
  for (let L = lo; L <= hi + 1; L++) { let s = 0; for (let i = 0; i < N - L; i++) s += x[a + i] * x[a + i + L]; r[L] = s / (N - L); }
  let m = 0; for (let L = lo; L <= hi; L++) m = Math.max(m, r[L]);
  if (m <= 0) return null;
  for (let L = lo + 1; L <= hi; L++) if (r[L] >= .9 * m && r[L] >= r[L - 1] && r[L] >= r[L + 1]) {
    const d = (r[L - 1] - r[L + 1]) / (2 * (r[L - 1] - 2 * r[L] + r[L + 1]) || 1), f = sr / (L + d);
    return Math.round((69 + 12 * Math.log2(f / 440)) * 100) / 100;
  }
  return null;
}
async function makeSample(id, opts = {}) {
  const sm = st.song.samples[id], src = sources.get(id) || { pcm: S.brrDecode(S.fromB64(sm.brr)), sr: sm.rate };
  const data = await resample(src, opts.rate ?? sm.rate, opts.secs ?? sm.secs ?? MAX_SECS);
  return { brr: S.toB64(S.brrEncode(data)), length: data.length };
}
$('#sampleFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  audio(); showSaved('loading the sample…');
  try {
    const src = await decodeFile(f), name = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'sample';
    let id = slug(name).slice(0, 24) || 'sample'; for (let k = 2; st.song.samples[id]; k++) id = `${slug(name).slice(0, 20)}-${k}`;
    sources.set(id, src);
    const rate = 32000, data = await resample(src, rate, MAX_SECS), root = detectRoot(data, rate) ?? 60;
    edit(() => {
      st.song.samples[id] = { name, rate, root, loop: -1, brr: S.toB64(S.brrEncode(data)) };
      const t = st.song.tracks[sampleFor]; t.instrument = `sample:${id}`; t.name = name;
      t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
    }, { rebuild: true });
    st.sel = sampleFor; renderAll(); S.prepare(st.song);
    showSaved(`sample "${name}": ${(data.length / rate).toFixed(2)} s, plays ${noteName(Math.round(root))}`);
  } catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
};
const sampleSecs = sm => Math.floor(sm.brr.length * 3 / 4 / 9) * 16 / sm.rate;
function drawWave(cv, sm) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, d = S.brrDecode(S.fromB64(sm.brr)), n = d.length;
  x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
  if (sm.loop >= 0) { x.fillStyle = 'rgba(255,179,64,.18)'; x.fillRect(sm.loop / n * W, 0, W, H); x.fillStyle = '#ffb340'; x.fillRect(sm.loop / n * W, 0, 2, H); }
  x.fillStyle = '#78dcff';
  for (let c = 0; c < W; c++) {
    let lo = 1, hi = -1; for (let i = Math.floor(c / W * n); i < Math.floor((c + 1) / W * n); i++) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
    if (hi >= lo) x.fillRect(c, H / 2 - hi * H / 2, 1, Math.max(1, (hi - lo) * H / 2));
  }
}
function sampleSection(id) {
  const sm = st.song.samples[id], sec = section('SAMPLE');
  if (!sm) return sec;
  const used = st.song.tracks.filter(t => t.instrument === `sample:${id}`).length;
  const kb = Math.round(sm.brr.length / 1024), total = Math.round(Object.values(st.song.samples).reduce((n, x) => n + x.brr.length, 0) / 1024);
  const cv = document.createElement('canvas'); cv.className = 'wave'; cv.width = 520; cv.height = 90;
  cv.title = 'The sample as the console stores it. With LOOP on, click where the loop should start: the note holds by repeating from there to the end.';
  const info = document.createElement('p'); info.className = 'meta';
  info.textContent = `${sampleSecs(sm).toFixed(2)} s at ${sm.rate / 1000} kHz · ${kb} KB (all samples ${total} KB) · ${used} track${used === 1 ? '' : 's'}`;
  const remake = async (opts, apply) => { showSaved('making the sample…'); const r = await makeSample(id, opts); edit(() => { apply(); sm.brr = r.brr; if (sm.loop >= r.length) sm.loop = -1; }, { rebuild: true }); S.prepare(st.song); showSaved(); };
  cv.onpointerdown = e => {
    if (sm.loop < 0) return;
    const r = cv.getBoundingClientRect(), n = Math.floor(sm.brr.length * 3 / 4 / 9) * 16, at = Math.floor((e.clientX - r.left) / r.width * n / 16) * 16;
    edit(() => { sm.loop = Math.max(0, Math.min(n - 16, at)); }, { rebuild: true }); S.prepare(st.song);
  };
  const name = document.createElement('label'); name.className = 'ctl';
  name.innerHTML = `<span>Name</span><input value="${esc(sm.name)}" maxlength="40">`;
  name.querySelector('input').onchange = e => edit(() => { sm.name = e.target.value || id; }, { rebuild: true });
  const root = document.createElement('label'); root.className = 'ctl'; root.title = 'The note the sample plays as recorded: notes are pitched from it';
  root.innerHTML = `<span>Its note</span><input type="number" min="0" max="127" step=".01" value="${sm.root}"><output>${noteName(Math.round(sm.root))}</output>`;
  root.querySelector('input').onchange = e => { edit(() => { sm.root = Math.max(0, Math.min(127, +e.target.value || 60)); }, { rebuild: true }); S.prepare(st.song); };
  const row = document.createElement('div'); row.className = 'srow';
  row.innerHTML = `<button class="btn small" data-a="detect" title="Listen for the note it plays">[ DETECT ]</button>
    <button class="btn small${sm.loop >= 0 ? ' on' : ''}" data-a="loop" title="Loop: a held note repeats the end part (strings, organs); off: it plays once (drums, plucks)">[ LOOP ]</button>
    <button class="btn small" data-a="hear" title="Hear it at its own note">[ ▶ ]</button>
    <button class="btn small" data-a="replace">[ REPLACE… ]</button><button class="btn small" data-a="remove">[ REMOVE ]</button>`;
  row.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'detect') { const r = detectRoot(S.brrDecode(S.fromB64(sm.brr)), sm.rate); if (r === null) return showSaved('no clear note in it'); edit(() => { sm.root = r; }, { rebuild: true }); S.prepare(st.song); showSaved(`it plays ${noteName(Math.round(r))} (${r.toFixed(2)})`); }
    if (a === 'loop') { const n = Math.floor(sm.brr.length * 3 / 4 / 9) * 16; edit(() => { sm.loop = sm.loop >= 0 ? -1 : Math.floor(n / 2 / 16) * 16; }, { rebuild: true }); S.prepare(st.song); }
    if (a === 'hear') { audio(); const v = S.noteOn(st.sel, Math.round(sm.root), 110); setTimeout(() => S.noteOff(v), 900); }
    if (a === 'replace') { sources.delete(id); replaceId = id; $('#replaceFile').click(); }
    if (a === 'remove') {
      if (!confirm(`Remove the sample "${sm.name}" from this song?${used ? ` The ${used} track(s) playing it go back to the piano.` : ''}`)) return;
      edit(() => { delete st.song.samples[id]; for (const t of st.song.tracks) if (t.instrument === `sample:${id}`) t.instrument = 'piano'; }, { rebuild: true });
    }
  });
  sec.append(cv, info, name, root, row,
    pick('Grit', S.RATES.map(r => [r, `${r / 1000} kHz${r === 32000 ? ' (SNES)' : ''}`]), () => sm.rate, v => {}),
    ctl('Length', () => sm.secs ?? Math.min(sampleSecs(sm), MAX_SECS), v => { sm.secs = v; }, { min: .05, max: MAX_SECS, step: .05, fmt: v => `${v.toFixed(2)} s`, title: 'Shorter keeps the song small; the rest is cut off' }));
  // grit and length re-make the sample from the sound as loaded (or, after a reload, from what is kept)
  const gritSel = sec.querySelector('select');
  gritSel.onchange = () => remake({ rate: +gritSel.value }, () => { sm.rate = +gritSel.value; });
  const len = sec.querySelector('.ctl:last-child input');
  len.onchange = () => { const secs = sm.secs; delete sm.secs; st.pending = null; remake({ secs }, () => {}); };
  requestAnimationFrame(() => drawWave(cv, sm));
  return sec;
}
let replaceId = null;
const rf = document.createElement('input'); rf.type = 'file'; rf.accept = 'audio/*'; rf.id = 'replaceFile'; rf.hidden = true; document.body.append(rf);
rf.onchange = async () => {
  const f = rf.files[0], id = replaceId; rf.value = ''; if (!f || !id) return;
  try {
    const src = await decodeFile(f), sm = st.song.samples[id]; sources.set(id, src);
    const data = await resample(src, sm.rate, MAX_SECS), root = detectRoot(data, sm.rate) ?? sm.root;
    edit(() => { sm.brr = S.toB64(S.brrEncode(data)); sm.root = root; sm.loop = -1; }, { rebuild: true }); S.prepare(st.song);
  } catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
};

// ---------- WHERE IT PLAYS: the places in the game, its levels to look at, and a live preview with the song inside ----------
let LEVELS = [], LEGEND = {}, preview = { ready: false, want: null };
async function loadLevels() {
  if (!GAME_ID) return renderWhere();
  try {
    const m = await (await fetch(`/games/${GAME_ID}/game.json`, { cache: 'no-store' })).json();
    if (m.levels) { LEGEND = m.levels.legend || {}; LEVELS = findLevels(await (await fetch(`/src/games/${GAME_ID}/${m.levels.file}`, { cache: 'no-store' })).text()); }
  } catch { }
  renderWhere();
}
const levelName = i => LEVELS[i] ? LEVELS[i].name.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) : `level ${i + 1}`;
function placesText() {
  const p = st.song.places, at = [p.title && 'on the title screen', ...p.levels.map(l => `in ${levelName(l)}`)].filter(Boolean);
  return (at.length ? at.join(', ') : 'nowhere yet') + (p.note ? ` (${p.note})` : '');
}
function renderWhere() {
  const box = $('#where');
  if (!GAME_ID) { box.innerHTML = `<p class="muted pad">A sketch belongs to no game. Open a project (<a href="/studio/">SOUND STUDIO</a>) to place a song in its game and play it there.</p>`; return; }
  const p = st.song.places;
  box.innerHTML = `<div class="places">
      <h3>WHERE "${esc(st.song.title)}" PLAYS IN ${esc(project.title.toUpperCase())}</h3>
      <label class="place"><input type="checkbox" data-place="title"${p.title ? ' checked' : ''}><span class="pname">Title screen</span>
        <button class="btn small" data-go="title" title="Open the game's title screen with this song">[ ▶ HERE ]</button></label>
      ${LEVELS.map((l, i) => `<label class="place"><input type="checkbox" data-place="${i}"${p.levels.includes(i) ? ' checked' : ''}>
        <canvas class="mini" data-mini="${i}" title="${esc(l.name)}"></canvas><span class="pname">${esc(levelName(i))}</span>
        <button class="btn small" data-go="${i}" title="Play this level with this song">[ ▶ HERE ]</button></label>`).join('')}
      ${LEVELS.length ? '' : '<p class="muted">This game has no level maps; say where in the note.</p>'}
      <label class="pnote"><span>When exactly? (for the session that wires it in)</span>
        <textarea maxlength="300" placeholder="e.g. when a cat-bot chases Pip; quieter in the spacewalk">${esc(p.note)}</textarea></label>
    </div>
    <div class="pv">
      <div class="pvbar"><span class="muted" id="pvInfo">Pick a place and press ▶ HERE: the game opens there and plays this song (click the game once for sound).</span>
        <button class="btn small" id="pvOwn" title="Give the game its own music back">[ GAME'S OWN MUSIC ]</button></div>
      <iframe id="pvFrame" title="The game, playing this song" allow="autoplay"></iframe>
    </div>`;
  box.querySelectorAll('[data-place]').forEach(c => c.onchange = () => edit(() => {
    const k = c.dataset.place;
    if (k === 'title') p.title = c.checked;
    else { const i = +k; p.levels = c.checked ? [...new Set([...p.levels, i])].sort((a, b) => a - b) : p.levels.filter(l => l !== i); }
  }));
  box.querySelector('textarea').onchange = e => edit(() => { p.note = e.target.value.slice(0, 300); });
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); previewAt(b.dataset.go === 'title' ? null : +b.dataset.go); });
  box.querySelector('#pvOwn').onclick = () => send({ type: 'pixelite:music', song: null });
  // each level as a little picture, one pixel per tile
  box.querySelectorAll('[data-mini]').forEach(cv => {
    const rows = LEVELS[+cv.dataset.mini].rows, w = rows[0].length, h = rows.length;
    cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(toPixels(rows, LEGEND), w, h), 0, 0);
  });
  preview.ready = false;
}
const send = msg => { const f = $('#pvFrame'); if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*'); };
function previewAt(level) {
  if (S.playing) stopAll();
  const f = $('#pvFrame');
  preview.want = level;
  $('#pvInfo').textContent = level === null ? 'The title screen, with this song. Click the game for sound; Enter starts it.' : `${levelName(level)}, with this song. Click the game for sound, then play.`;
  const go = () => {
    if (level !== null) send({ type: 'pixelite:level', action: 'play', level });
    send({ type: 'pixelite:music', song: JSON.parse(JSON.stringify(st.song)) });
    try { f.contentWindow.focus(); } catch { }
  };
  if (preview.ready && level !== null) return go();
  preview.go = go; preview.ready = false;
  f.src = `/games/${GAME_ID}/?studio=${Date.now()}`;   // a fresh game (the title screen) each time
}
addEventListener('message', e => {
  const f = $('#pvFrame');
  if (!f || e.source !== f.contentWindow || !e.data || e.data.type !== 'pixelite:ready') return;
  preview.ready = true; if (preview.go) { const g = preview.go; preview.go = null; g(); }
});
function showTab(where) {
  $('#where').hidden = !where; $('#arr').hidden = where; $('.rollWrap').hidden = where; $('#hint').hidden = where;
  $('#tabWhere').classList.toggle('on', where); $('#tabNotes').classList.toggle('on', !where);
  $('#tabWhere').setAttribute('aria-selected', String(where)); $('#tabNotes').setAttribute('aria-selected', String(!where));
  if (where) renderWhere(); else { send({ type: 'pixelite:music', song: null }); const f = $('#pvFrame'); if (f) f.src = 'about:blank'; drawArr(); drawRoll(); }
}
$('#tabNotes').onclick = () => showTab(false);
$('#tabWhere').onclick = () => showTab(true);

// ---------- the transport bar ----------
function syncTransport() {
  const s = st.song;
  $('#title').value = s.title; $('#bpm').value = s.bpm; $('#bars').value = s.bars; $('#beats').value = s.beatsPerBar;
  const tog = (id, on) => { $(id).setAttribute('aria-pressed', String(on)); $(id).classList.toggle('on', on); };
  tog('#loopBtn', s.loop.on); tog('#clickBtn', st.click); tog('#countBtn', st.countIn); tog('#quantBtn', st.quant); tog('#snesBtn', s.snes); tog('#keysBtn', st.keys);
  $('#grid').value = String(st.grid);
}
function renderAll() { syncTransport(); renderTracks(); renderAddIns(); renderStrip(); drawArr(); sizeRoll(); drawRoll(); showPos(); if (!$('#where').hidden) renderWhere(); }
$('#title').onchange = e => edit(() => { st.song.title = e.target.value.slice(0, 80) || 'Untitled'; });
$('#bpm').onchange = e => edit(() => { st.song.bpm = Math.max(30, Math.min(300, +e.target.value || 120)); }, { rebuild: true });
$('#bars').onchange = e => edit(() => { const s = st.song; s.bars = Math.max(1, Math.min(512, Math.round(+e.target.value) || 8)); const E = S.songEnd(s); s.loop.end = Math.min(s.loop.end, E); s.loop.start = Math.min(s.loop.start, s.loop.end - PPQ); }, { rebuild: true });
$('#beats').onchange = e => edit(() => { st.song.beatsPerBar = Math.max(1, Math.min(12, Math.round(+e.target.value) || 4)); }, { rebuild: true });
$('#loopBtn').onclick = () => edit(() => { st.song.loop.on = !st.song.loop.on; if (st.song.loop.end <= st.song.loop.start) st.song.loop = { on: true, start: 0, end: end() }; }, { rebuild: true });
$('#snesBtn').onclick = () => edit(() => { st.song.snes = !st.song.snes; }, { rebuild: true });
$('#clickBtn').onclick = () => { st.click = !st.click; S.metronome = st.click; syncTransport(); };
$('#countBtn').onclick = () => { st.countIn = !st.countIn; syncTransport(); };
$('#quantBtn').onclick = () => { st.quant = !st.quant; syncTransport(); };
$('#keysBtn').onclick = () => { audio(); st.keys = !st.keys; syncTransport(); $('#keysBtn').textContent = st.keys ? `KEYS C${st.octave}` : 'KEYS'; };
$('#grid').onchange = e => { st.grid = +e.target.value; st.len = Math.max(st.grid, st.len); drawRoll(); };
$('#playBtn').onclick = play; $('#recBtn').onclick = record; $('#stopBtn').onclick = () => { if (S.playing) stopAll(); else { st.start = 0; showPos(); drawRoll(); drawArr(); } };
$('#midiBtn').onclick = connectMidi;
$('#helpBtn').onclick = () => $('#help').showModal();
function renderAddIns() { const v = $('#addIns').value || 'strings'; $('#addIns').innerHTML = insOptions(false); $('#addIns').value = v; if (!$('#addIns').value) $('#addIns').value = 'strings'; }
$('#addTrack').onclick = () => { if (st.song.tracks.length >= 32) return; const id = $('#addIns').value; edit(() => { st.song.tracks.push(Object.assign(S.newTrack(id), { name: insName(id) || 'Track' })); st.sel = st.song.tracks.length - 1; }, { rebuild: true }); focusTrack(); drawRoll(); S.prepare(st.song); };
$('#newBtn').onclick = () => { if (st.dirty && !confirm('Start a new song? This one has changes that are not saved to the site.')) return; load(template()); };
$('#saveBtn').onclick = () => save();
const menu = $('#more');
$('#moreBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#moreBtn').setAttribute('aria-expanded', String(!menu.hidden)); };
const closeMenu = () => { menu.hidden = true; $('#moreBtn').setAttribute('aria-expanded', 'false'); };
addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
menu.addEventListener('click', e => { if (e.target.closest('button')) closeMenu(); });
$('#wavBtn').onclick = exportWav; $('#exportBtn').onclick = exportFile; $('#promptBtn').onclick = promptDialog;
$('#importFile').onchange = e => { closeMenu(); const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; };
$('#dupSongBtn').onclick = () => save(true);
$('#delSongBtn').onclick = async () => {
  if (!st.meta.id || !confirm(`Delete "${st.song.title}" from the site? (This page keeps it as an unsaved draft.)`)) return;
  try { await api(`/api/songs/${st.meta.id}`, { method: 'DELETE' }); st.meta = { id: null, updated_at: null, game: st.meta.game }; st.dirty = true; showSaved(); saveDraft(); listSongs(); } catch (e) { showSaved(`not deleted: ${e.message}`); }
};
$('#songs').onchange = e => openSong(e.target.value);
// the roll fills whatever room the window and the overview above it leave
new ResizeObserver(() => { sizeRoll(); drawRoll(); }).observe(R.cv.parentElement);
addEventListener('resize', () => drawArr());
addEventListener('beforeunload', e => { saveDraft(); });
document.addEventListener('pointerdown', () => { if (!S.ctx) audio(); }, { once: true, capture: true });

// ---------- start: the project, then the draft from last time, else a new song ----------
(async () => {
  await games();
  project = gamesList.find(g => g.id === GAME_ID) || { id: '', title: GAME_ID ? GAME_ID : 'Sketches' };
  $('#projName').textContent = project.title;
  document.title = `${project.title} · Sound studio · Pixelite`;
  let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT)); } catch { }
  let loaded = false;
  try { if (d && d.song) { load(d.song, d.meta, !!d.dirty); loaded = true; } } catch { }
  if (!loaded) load(template());
  if (PROJECT === null) showProjects();
  listSongs();
  loadLevels();
})();
requestAnimationFrame(frame);
window.studio = { st, S };   // for tests and curious hands in the console
