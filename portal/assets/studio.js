// The SOUND STUDIO (/studio/): a small DAW for 16-bit (Super Nintendo style) music. The sound is the engine's own Sampler
// (engine/13_sampler.js, loaded before this file), so a game plays a song exactly as it sounds here. Songs are plain data
// (Sampler.check); they save to the site (worker/songs.js, D1) and a draft is kept in this browser as you work.
import { findLevels, toPixels } from './levels-core.mjs';
import { songFromMidi, midiFromSong } from './midi-core.mjs';
import * as B from './beats-core.mjs';
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
  dirty: false, undo: [], redo: [], lane: 'vel', pending: null, clip: null, rec: null, click: false, countIn: true, quant: true,
  keys: false, octave: 4, view: { x: 0, zoom: .7, top: 84 }, live: new Map(), pedal: false, bend: 0, follow: true,
  cs: new Set(), focus: 'roll', open: null, openView: 'grid', patStep: B.STEP, beat: null, rev: 0   // a beat open to edit ({ p }), how, its step in ticks, the beat playing on its own, a count that moves with every change
};
let project = { id: '', title: '' };   // the game this studio is working for (from /games.json)
const song = () => st.song, track = () => st.song.tracks[st.sel];
const end = () => S.songEnd(st.song);
// ---------- beats: a pattern opened to edit stands in for the track's notes ----------
const kitTrack = t => S.isKit(t.instrument);
const pattern = () => (st.open && st.song && st.song.patterns ? st.song.patterns[st.open.p] : null);
// what the roll and its commands edit: the selected track, or, with a beat open, the beat's notes as if they were the track's
function target() {
  const t = track();
  if (!st.open) return t;
  const P = pattern();
  if (!P) { st.open = null; return t; }
  return new Proxy(t, { get: (o, k) => k === 'notes' ? P.notes : o[k], set: (o, k, v) => { if (k === 'notes') P.notes = v; else o[k] = v; return true; } });
}
const rollEnd = () => { const P = pattern(); return P ? P.len : end(); };
const playSong = () => st.beat || st.song;   // the song the Sampler is playing: a beat on its own, or the song
const beatColor = id => { const P = st.song.patterns && st.song.patterns[id]; if (P && P.color) return P.color; return COLORS[Math.max(0, Object.keys(st.song.patterns || {}).indexOf(id)) % COLORS.length]; };
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
// the names of a drum track's rows in the roll: the built-in kit's, or the pads' of a kit of the song's own
function kitNamesOf(t) {
  if (!t.instrument.startsWith('drums:')) return new Map(Object.entries(S.KIT).map(([n, v]) => [+n, v]));
  return new Map(B.rowsOf(S, st.song, t, { notes: [] }).map(r => [r.note, r.name]));
}
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
  for (const P of Object.values(st.song.patterns || {})) B.tidyBeat(P);   // a beat's notes stay inside it
  st.rev++;
  if (S.ctx) { S.use(playSong()); S.sync(); }
  if (rebuild) renderAll(); else { drawArr(); drawRoll(); }
  clearTimeout(changed.t); changed.t = setTimeout(saveDraft, 600);
}
// an edit that undo can take back as one step
function edit(fn, opts) { pushUndo(snap()); st.redo = []; fn(); changed(opts); }
// at most 150 steps, and about 60 MB of them (a song with samples is large)
function pushUndo(j) { st.undo.push(j); let total = st.undo.reduce((n, u) => n + u.length, 0); while (st.undo.length > 150 || (total > 3e7 && st.undo.length > 3)) total -= st.undo.shift().length; }
// slider drags: many small changes, one undo step (settle() when the drag ends)
function tweak(fn) { if (!st.pending) st.pending = snap(); fn(); st.rev++; st.dirty = true; showSaved(); if (S.ctx) S.sync(); clearTimeout(changed.t); changed.t = setTimeout(saveDraft, 600); }
function settle() {
  if (st.pending) { st.undo.push(st.pending); st.redo = []; st.pending = null; }
  for (const P of Object.values(st.song.patterns || {})) B.tidyBeat(P);
  st.rev++; drawArr(); drawRoll();
}
function restore(json) {
  if (st.beat) stopAll();
  st.song = S.check(JSON.parse(json)); st.picked.clear(); st.cs.clear(); st.sel = Math.min(st.sel, st.song.tracks.length - 1);
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
  st.open = null; st.beat = null; st.rev++; st.cs.clear();
  st.song = S.check(s); st.meta = { ...meta }; st.sel = 0; st.picked.clear(); st.undo = []; st.redo = []; st.dirty = dirty; st.start = 0;
  st.view.x = 0; st.view.top = S.isKit(st.song.tracks[0]?.instrument || '') ? 60 : 84;
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
    li.addEventListener('pointerdown', e => { if (st.sel !== i) { closeBeat(); st.sel = i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); drawArr(); drawRoll(); } });
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
  const own = Object.entries(st.song.samples || {}), multi = Object.entries(st.song.multis || {}), kits = Object.entries(st.song.kits || {});
  return S.INSTRUMENTS.map(i => `<option value="${i.id}">${esc(i.group)} · ${esc(i.name)}</option>`).join('')
    + (own.length ? `<optgroup label="This song's samples">${own.map(([id, sm]) => `<option value="sample:${esc(id)}">Sample · ${esc(sm.name)}</option>`).join('')}</optgroup>` : '')
    + (multi.length ? `<optgroup label="This song's multisamples">${multi.map(([id, mu]) => `<option value="multi:${esc(id)}">Multi · ${esc(mu.name)}</option>`).join('')}</optgroup>` : '')
    + (kits.length ? `<optgroup label="This song's drum kits">${kits.map(([id, ki]) => `<option value="drums:${esc(id)}">Drum kit · ${esc(ki.name)}</option>`).join('')}</optgroup>` : '')
    + (load ? '<option value="__load">+ Load a sample…</option><option value="__record">+ Record a sample…</option><option value="__multi">+ New multisample…</option>' : '');
}
const insName = id => id.startsWith('drums:') ? st.song.kits?.[id.slice(6)]?.name : id.startsWith('sample:') ? st.song.samples[id.slice(7)]?.name : id.startsWith('multi:') ? st.song.multis?.[id.slice(6)]?.name : S.INSTRUMENTS.find(x => x.id === id)?.name;
function setInstrument(i, id) {
  if (id === '__load') { renderTracks(); return pickSample(i); }
  if (id === '__record') { renderTracks(); return recordSample(i); }
  if (id === '__multi') { renderTracks(); return newMulti(i); }
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
  const N = target().notes;
  if (N.length) { const lo = Math.min(...N.map(n => n[2])), hi = Math.max(...N.map(n => n[2])); st.view.top = Math.min(127, Math.max(hi + 3, lo + rows() - 3)); }
  else st.view.top = kitTrack(t) ? 60 : t.instrument.includes('bass') ? 60 : 84;
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
    const d = S.defaults(t.instrument), s = t.sound, kit = kitTrack(t);
    const env = (k, dk) => () => s[k] ?? d.env[dk];
    const head = document.createElement('div'); head.className = 'shead';
    head.innerHTML = `<b style="color:${COLORS[st.sel % COLORS.length]}">${esc(t.name)}</b><span class="spacer"></span>
      <button class="btn small" data-a="up" title="Move up">▲</button><button class="btn small" data-a="down" title="Move down">▼</button>
      <button class="btn small" data-a="dup" title="Duplicate the track">DUP</button><button class="btn small" data-a="del" title="Delete the track">DEL</button>`;
    head.querySelectorAll('[data-a]').forEach(b => b.onclick = () => trackAction(b.dataset.a));
    box.append(head);
    const multi = t.instrument.startsWith('multi:'), own = multi || t.instrument.startsWith('sample:');
    if (multi) box.append(multiSection(t.instrument.slice(6)));
    else if (own) box.append(sampleSection(t.instrument.slice(7)));
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
      ctl('Glide', () => s.glide, v => { s.glide = v < .01 ? 0 : v; }, { min: 0, max: 1, step: .01, fmt: v => v ? ms(v) : 'off', title: 'Above off the track plays one note at a time (a lead), sliding from the note still held to the next' }),
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
  if (a === 'del') { const nn = S.notesOf(st.song, T[i]).length; if (T.length < 2 || (nn && !confirm(`Delete the track "${T[i].name}" and its ${nn} notes?`))) return; edit(() => { T.splice(i, 1); st.sel = Math.max(0, i - 1); }, { rebuild: true }); }
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
const A = { cv: $('#arr'), RULER: 18, TH: 26 };
// every note a track plays, its clips' too, kept until the song changes (the overview is drawn every frame while it plays)
const arrCache = { rev: -1, per: [] };
function arrNotes(i) {
  if (arrCache.rev !== st.rev) { arrCache.rev = st.rev; arrCache.per = []; }
  return arrCache.per[i] ??= S.notesOf(st.song, st.song.tracks[i]);
}
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
    for (const c of t.clips || []) {   // a clip: a block in its beat's colour, its start marked
      if (!st.song.patterns || !st.song.patterns[c.p]) continue;
      const col = beatColor(c.p), on = st.open && st.open.p === c.p;
      const cw = Math.max(2, c.len * k);
      x.fillStyle = hexA(col, t.mute ? .1 : on ? .45 : .28); x.fillRect(c.at * k, y + 1, cw, A.TH - 2);
      x.fillStyle = hexA(col, .95); x.fillRect(c.at * k, y + 1, 2, A.TH - 2);
      x.fillStyle = hexA(col, .6); for (const r of B.repeatsOf(st.song, c)) x.fillRect(r * k, y + 3, 1, A.TH - 6);   // where the beat comes round again
      if (st.cs.has(c)) { x.strokeStyle = '#eef3f9'; x.lineWidth = 1.5; x.strokeRect(c.at * k + .5, y + 1.5, cw - 1, A.TH - 3); x.lineWidth = 1; }
      if (cw > 34) { x.save(); x.beginPath(); x.rect(c.at * k + 4, y + 1, cw - 6, A.TH - 2); x.clip(); x.fillStyle = '#eef3f9'; x.font = '9px JetBrains Mono, monospace'; x.textBaseline = 'top'; x.fillText(st.song.patterns[c.p].name, c.at * k + 5, y + 3); x.restore(); }
    }
    x.fillStyle = t.mute ? '#2a3546' : COLORS[i % COLORS.length];
    for (const [at, len, note] of arrNotes(i)) x.fillRect(at * k, y + 4 + (1 - note / 127) * (A.TH - 8), Math.max(1, len * k), 2);
  });
  if (arrDrop) { x.fillStyle = hexA(beatColor(arrDrop.p), .5); x.fillRect(arrDrop.at * k, A.RULER + arrDrop.i * A.TH + 1, Math.max(2, arrDrop.len * k), A.TH - 2); }
  // the piano roll's window, the start mark and the playhead
  const vis = (R.w - R.KEYW) / st.view.zoom;
  x.strokeStyle = 'rgba(238,243,249,.35)'; x.strokeRect(st.view.x * k + .5, A.RULER + st.sel * A.TH + .5, vis * k, A.TH - 1);
  x.fillStyle = '#8ceb96'; x.beginPath(); x.moveTo(st.start * k - 5, 0); x.lineTo(st.start * k + 5, 0); x.lineTo(st.start * k, 7); x.fill();
  const p = S.playing && !st.beat ? S.position() : -1;   // (a beat playing on its own is not a place in the song)
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
  const h = clipHit(e); st.focus = 'arr';
  if (h && h.c) { clipDrag(e, h, r, k); return; }
  const i = h ? h.i : -1;
  if (i >= 0 && i < st.song.tracks.length) {
    if (!e.shiftKey && st.cs.size) { st.cs.clear(); drawArr(); }
    if (i !== st.sel) { closeBeat(); st.sel = i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); }
    st.view.x = Math.max(0, tickAt(e) - (R.w - R.KEYW) / st.view.zoom / 2); drawArr(); drawRoll();
  }
});

// ---------- the arranger: clips as blocks in the lanes ----------
let arrDrop = null;   // where a beat dragged from the list would land: { i, at, len, p }
// what is under the pointer: the lane, and the clip (the one drawn on top) with the part of it: its start, its end, or its body
function clipHit(ev) {
  const r = A.cv.getBoundingClientRect(), k = (r.width - 2) / end(), i = Math.floor((ev.clientY - r.top - A.RULER) / A.TH), t = st.song.tracks[i];
  if (!t) return null;
  const px = ev.clientX - r.left;
  for (let n = (t.clips || []).length - 1; n >= 0; n--) {
    const c = t.clips[n]; if (!st.song.patterns || !st.song.patterns[c.p]) continue;
    const x0 = c.at * k, x1 = (c.at + c.len) * k;
    if (px < x0 - 2 || px > x1 + 2) continue;
    const edge = Math.min(8, (x1 - x0) / 3);
    return { i, t, c, zone: px > x1 - edge ? 'end' : px < x0 + edge ? 'start' : 'body' };
  }
  return { i, t, c: null };
}
// the step a clip's edges move by: its beat's bar if it is a whole number of them, else a beat of the song; Shift: the grid
const clipUnit = (c, shift) => { if (shift) return st.grid; const P = st.song.patterns[c.p]; return P.len % barTicks() === 0 ? barTicks() : PPQ; };
const snapTo = (t, u) => Math.round(t / u) * u;
function clipDrag(e, h, r, k) {
  const { c, zone } = h, t0 = (e.clientX - r.left) / k, before = snap();
  if (e.shiftKey) { if (st.cs.has(c)) st.cs.delete(c); else st.cs.add(c); } else if (!st.cs.has(c)) st.cs = new Set([c]);
  if (h.i !== st.sel) { closeBeat(); st.sel = h.i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); }
  drawArr();
  const group = zone === 'body' ? [...st.cs].map(x => ({ c: x, t: st.song.tracks.find(t => (t.clips || []).includes(x)), at: x.at })) : [{ c, t: h.t, at: c.at }];
  const orig = { at: c.at, len: c.len, off: c.off };
  let moved = false, copied = false;
  const mv = ev => {
    const dx = (ev.clientX - r.left) / k - t0;
    if (!moved && Math.abs(dx) * k < 4) return;
    if (!moved) { moved = true; if (e.altKey && zone === 'body') { copied = true; for (const g of group) { const n = B.addClip(g.t, { at: g.c.at, p: g.c.p, len: g.c.len, off: g.c.off }); g.c = n; } st.cs = new Set(group.map(g => g.c)); } }
    const u = clipUnit(c, ev.shiftKey), E = end();
    if (zone === 'body') {
      const d = Math.max(-Math.min(...group.map(g => g.at)), snapTo(group[0].at + dx, u) - group[0].at);
      for (const g of group) g.c.at = Math.max(0, Math.min(E - 24, g.at + d));
    } else if (zone === 'end') {
      c.len = Math.max(u, Math.min(E - c.at, snapTo(orig.at + orig.len + dx, u) - orig.at));
      if (ev.altKey) c.len = Math.max(24, Math.min(E - c.at, Math.round(orig.len + dx)));
    } else { Object.assign(c, orig); B.trimStart(st.song, c, Math.max(0, Math.min(orig.at + orig.len - u, snapTo(orig.at + dx, u))), 24); }
    st.rev++; drawArr();
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!moved) return;
    for (const tr of st.song.tracks) B.sortClips(tr);
    st.undo.push(before); st.redo = []; changed({ rebuild: true });
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
A.cv.addEventListener('pointermove', e => {
  if (e.buttons) return;
  const h = clipHit(e); A.cv.style.cursor = h && h.c ? (h.zone === 'body' ? 'grab' : 'ew-resize') : 'pointer';
});
A.cv.addEventListener('dblclick', e => {   // a clip opens in the editor below
  const h = clipHit(e); if (!h || !h.c) return;
  if (st.sel !== h.i) { closeBeat(); st.sel = h.i; st.picked.clear(); focusTrack(); renderTracks(); renderStrip(); }
  openBeat(h.c.p);
});
// a beat dragged from the list onto a lane makes a clip there
A.cv.addEventListener('dragover', e => {
  if (!e.dataTransfer.types.includes('text/x-pixelite-beat')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  const r = A.cv.getBoundingClientRect(), k = (r.width - 2) / end(), i = Math.floor((e.clientY - r.top - A.RULER) / A.TH), p = dragBeat;
  if (!p || i < 0 || i >= st.song.tracks.length) { if (arrDrop) { arrDrop = null; drawArr(); } return; }
  const P = st.song.patterns[p], u = clipUnit({ p }, e.shiftKey), at = Math.max(0, Math.min(end() - 24, Math.floor((e.clientX - r.left) / k / u) * u));   // the bar under the pointer
  arrDrop = { i, at, len: Math.min(P.len, end() - at), p }; drawArr();
});
A.cv.addEventListener('dragleave', () => { if (arrDrop) { arrDrop = null; drawArr(); } });
A.cv.addEventListener('drop', e => {
  e.preventDefault(); const d = arrDrop; arrDrop = null;
  if (!d) return;
  let c; edit(() => { c = B.addClip(st.song.tracks[d.i], { at: d.at, p: d.p, len: d.len }); }, { rebuild: true });
  st.cs = new Set([c]); st.focus = 'arr'; drawArr();
});
let dragBeat = null;
// the clip's menu (right-click)
function showMenu(x, y, items) {
  document.querySelector('#ctx')?.remove();
  const m = document.createElement('div'); m.id = 'ctx'; m.className = 'menu ctx'; m.style.cssText = `left:${x}px;top:${y}px;right:auto;min-width:220px;position:fixed`;
  for (const it of items) {
    if (!it) { const hr = document.createElement('hr'); m.append(hr); continue; }
    const b = document.createElement('button'); b.textContent = it.label; b.disabled = !!it.off; if (it.title) b.title = it.title;
    b.onclick = () => { m.remove(); it.run(); }; m.append(b);
  }
  document.body.append(m);
  const rr = m.getBoundingClientRect(); if (rr.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - rr.height - 4) + 'px'; if (rr.right > innerWidth) m.style.left = Math.max(0, innerWidth - rr.width - 4) + 'px';
  const away = ev => { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', away, true); } };
  setTimeout(() => addEventListener('pointerdown', away, true));
}
A.cv.addEventListener('contextmenu', e => {
  const h = clipHit(e); if (!h || !h.c) return;
  e.preventDefault(); st.focus = 'arr';
  if (!st.cs.has(h.c)) { st.cs = new Set([h.c]); drawArr(); }
  const c = h.c, P = st.song.patterns[c.p], n = B.usesOf(st.song, c.p).length, here = [...st.cs];
  showMenu(e.clientX, e.clientY, [
    { label: 'Open the beat', run: () => { if (st.sel !== h.i) { closeBeat(); st.sel = h.i; focusTrack(); renderTracks(); renderStrip(); } openBeat(c.p); } },
    { label: 'Rename the beat…', run: () => { const v = prompt('Name of the beat', P.name); if (v !== null && v.trim() && v.trim() !== P.name) edit(() => { P.name = v.trim().slice(0, 40); }, { rebuild: true }); } },
    null,
    { label: 'Split here (Ctrl+E)', run: splitClips },
    { label: 'Duplicate (Ctrl+D)', run: dupClips },
    { label: 'Loop to the end of the song', run: () => edit(() => { for (const x of here) x.len = Math.max(1, end() - x.at); }, { rebuild: true }) },
    null,
    { label: n > 1 ? `Make unique (a copy of the beat; ${n - 1} other clip${n > 2 ? 's stay' : ' stays'} linked)` : 'Make unique (a copy of the beat)', title: 'Edit this clip\'s beat without changing the others', run: () => { let id; edit(() => { id = B.makeUnique(st.song, c.p, here.filter(x => x.p === c.p)); }, { rebuild: true }); if (st.open) openBeat(id); } },
    { label: 'Select every clip of this beat', run: () => { st.cs = new Set(st.song.tracks.flatMap(t => (t.clips || []).filter(x => x.p === c.p))); drawArr(); } },
    { label: 'Turn into notes (no longer linked)', run: () => edit(() => { for (const x of here) { const t = st.song.tracks.find(t => (t.clips || []).includes(x)); B.flattenClip(S, st.song, t, x); } st.cs.clear(); }, { rebuild: true }) },
    null,
    { label: here.length > 1 ? `Delete ${here.length} clips` : 'Delete the clip', run: deleteClips }
  ]);
});
function dupClips() {
  if (!st.cs.size) return;
  const made = []; edit(() => { for (const c of st.cs) { const t = st.song.tracks.find(t => (t.clips || []).includes(c)); if (t) made.push(B.addClip(t, { at: c.at + c.len, p: c.p, len: c.len, off: c.off })); } }, { rebuild: true });
  st.cs = new Set(made); drawArr();
}
function deleteClips() {
  if (!st.cs.size) return;
  edit(() => { for (const t of st.song.tracks) if (t.clips) { t.clips = t.clips.filter(c => !st.cs.has(c)); if (!t.clips.length) delete t.clips; } st.cs.clear(); }, { rebuild: true });
}
// cut the selected clips (or the clips of the selected track) where the play position is
function splitClips() {
  const tick = Math.round((S.playing && !st.beat ? recTick() : st.start) / st.grid) * st.grid;
  const hit = [...st.cs].filter(c => tick > c.at && tick < c.at + c.len);
  const list = hit.length ? hit : st.cs.size ? [] : (track().clips || []).filter(c => tick > c.at && tick < c.at + c.len);
  if (!list.length) return showSaved('nothing to cut there: put the start mark (or the playhead) inside a clip');
  const made = []; edit(() => { for (const c of list) { const t = st.song.tracks.find(t => (t.clips || []).includes(c)); const r = B.splitClip(st.song, t, c, tick); if (r) made.push(r[1]); } }, { rebuild: true });
  st.cs = new Set(made); drawArr();
}

// ---------- the piano roll ----------
const R = { cv: $('#roll'), KEYW: 54, RULER: 18, VEL: 72, RH: 12, w: 0, h: 0 };
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
  const x = R.cv.getContext('2d'), dpr = devicePixelRatio || 1, t = target(); if (!t) return;
  $('#beatFromSel').disabled = !!st.open || !st.picked.size;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = R.w, H = R.h, gB = H - R.VEL, kit = kitTrack(t), kitNames = kit ? kitNamesOf(t) : null, bar = st.song.beatsPerBar * PPQ, E = rollEnd();
  st.view.top = Math.max(rows() - 1, Math.min(127, st.view.top));
  x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
  // rows
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n);
    x.fillStyle = kit ? (kitNames.has(n) ? '#101622' : '#080b11') : isBlack(n) ? '#080b11' : n % 12 === 0 ? '#121a27' : '#0d121b';
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
  const lp = st.open ? { on: false, start: 0, end: 0 } : st.song.loop;   // (a beat has no loop region or start mark of the song's)
  x.fillStyle = lp.on ? 'rgba(255,179,64,.35)' : 'rgba(93,107,128,.2)'; x.fillRect(Math.max(R.KEYW, xOf(lp.start)), 2, Math.max(0, xOf(lp.end) - Math.max(R.KEYW, xOf(lp.start))), R.RULER - 6);
  x.font = '10px JetBrains Mono, monospace'; x.textBaseline = 'top'; x.fillStyle = '#5d6b80';
  for (let b = Math.floor(st.view.x / bar); b * bar <= t1; b++) { const X = xOf(b * bar); if (X >= R.KEYW) x.fillText(String(b + 1), X + 3, 3); }
  if (!st.open && xOf(st.start) >= R.KEYW) { const X = xOf(st.start); x.fillStyle = '#8ceb96'; x.beginPath(); x.moveTo(X - 5, 0); x.lineTo(X + 5, 0); x.lineTo(X, 8); x.fill(); }
  // other tracks, faint, to compose against
  st.song.tracks.forEach((o, i) => {
    if (st.open || i === st.sel || kitTrack(o) || kit) return;
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
  // the lane: velocity, or an automation line
  x.fillStyle = '#0b0f17'; x.fillRect(R.KEYW, gB, W, R.VEL); x.fillStyle = '#1d2634'; x.fillRect(R.KEYW, gB, W, 1);
  if (st.lane === 'vel') for (const n of t.notes) { const X = xOf(n[0]); if (X < R.KEYW || X > W) continue; const h = (R.VEL - 8) * n[3] / 127; x.fillStyle = st.picked.has(n) ? '#78dcff' : col; x.fillRect(X, H - 3 - h, 3, h); }
  else drawLane(x, W, gB, col);
  // keyboard
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n);
    x.fillStyle = kit ? '#111722' : isBlack(n) ? '#05070c' : '#cdd6e2'; x.fillRect(0, y, R.KEYW - 2, R.RH - 1);
    const held = [...st.live.values()].some(l => l.note === n) || (drag && drag.audition === n);
    if (held) { x.fillStyle = '#ffb340'; x.fillRect(0, y, R.KEYW - 2, R.RH - 1); }
    const label = kit ? (kitNames.get(n) || '') : n % 12 === 0 ? noteName(n) : '';
    if (label) { x.fillStyle = kit ? '#cdd6e2' : '#05070c'; x.font = '9px JetBrains Mono, monospace'; x.textBaseline = 'middle'; x.fillText(label.slice(0, 9), 2, y + R.RH / 2); }
  }
  x.fillStyle = '#0b0f17'; x.fillRect(0, 0, R.KEYW, R.RULER); x.fillRect(0, gB, R.KEYW, R.VEL);

  // playhead
  const p = st.open ? (st.beat && S.playing ? S.position() : -1) : S.playing ? recTick() : -1;
  if (p >= 0 && xOf(p) >= R.KEYW) { x.fillStyle = '#eef3f9'; x.fillRect(xOf(p), 0, 1.5, gB); }
}
const noteAt = (tick, pitch) => { const N = target().notes; for (let i = N.length - 1; i >= 0; i--) { const n = N[i]; if (n[2] === pitch && tick >= n[0] && tick < n[0] + n[1]) return n; } return null; };
let drag = null;
R.cv.addEventListener('contextmenu', e => e.preventDefault());
R.cv.addEventListener('pointerdown', e => {
  st.focus = 'roll';
  audio(); R.cv.focus({ preventScroll: true });
  const r = R.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, t = target(), gB = R.h - R.VEL;
  R.cv.setPointerCapture(e.pointerId);
  if (py < R.RULER) { if (st.open) return; st.start = Math.max(0, snapAt(tOf(px), PPQ)); drawRoll(); drawArr(); showPos(); return; }
  if (px < R.KEYW) { const n = nOf(py); drag = { mode: 'key', audition: n, v: S.noteOn(st.sel, n, 100) }; drawRoll(); return; }
  if (py >= gB) { if (st.lane !== 'vel') return laneDown(px, py, e); drag = { mode: 'vel', before: snap(), changed: false }; velAt(px, py); return; }
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
    if (st.open && tick >= rollEnd()) return;   // not past the end of the beat
    const at = Math.max(0, Math.floor(tick / st.grid) * st.grid), n = [at, kitTrack(t) ? st.grid : st.len, pitch, 100];
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
  if (drag.mode === 'lane') return laneMove(px, py);
  if (drag.mode === 'curve') return curveMove(py);
  if (drag.mode === 'box') {
    Object.assign(drag, { bx: Math.min(drag.x0, px), by: Math.min(drag.y0, py), bw: Math.abs(px - drag.x0), bh: Math.abs(py - drag.y0) });
    const ta = tOf(drag.bx), tb = tOf(drag.bx + drag.bw), pa = nOf(drag.by + drag.bh), pb = nOf(drag.by);
    st.picked = new Set([...drag.add, ...target().notes.filter(n => n[0] < tb && n[0] + n[1] > ta && n[2] >= pa && n[2] <= pb)]);
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
// ---------- automation lanes: a line the track (or, for tempo and the echo, the song) follows as it plays ----------
// points are [tick, value, bend]: the engine draws straight lines between them, or curves (shift-drag a segment to bend the one that
// arrives at a point); the first and last values hold. The tempo steps at each point, or glides to it (shift-click a point).
// pts() reads a lane (without making it); make() gives the array to add to, kept in the song only while it has points.
const NOPTS = [];
const loopRest = () => { const sm = ownSample(track()); if (!sm || sm.loop < 0) return .5; const n = S.sampleLen(sm), le = sm.loopEnd || n; return Math.max(0, Math.min(1, sm.loop / Math.max(1, le - 32))); };
const trackLane = k => ({ pts: () => track().auto[k] || NOPTS, make: () => (track().auto[k] ??= []) });
const songLane = k => ({ pts: () => (st.song.auto || {})[k] || NOPTS, make: () => ((st.song.auto ??= {})[k] ??= []) });
const LANES = {
  volume: { lo: 0, hi: 1, ...trackLane('volume'), rest: () => 1, fmt: v => `${Math.round(v * 100)}%` },
  pan: { lo: -1, hi: 1, ...trackLane('pan'), rest: () => track().pan, fmt: v => Math.abs(v) < .02 ? 'centre' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'left' : 'right'}` },
  filter: { lo: 0, hi: 1, ...trackLane('filter'), rest: () => Math.log(track().filter.freq / 40) / Math.log(400), fmt: v => hzs(S.filterHz(v)) },
  echo: { lo: 0, hi: 1, ...trackLane('echo'), rest: () => track().sends.echo, fmt: pct },
  reverb: { lo: 0, hi: 1, ...trackLane('reverb'), rest: () => track().sends.reverb, fmt: pct },
  pitch: { lo: -12, hi: 12, ...trackLane('pitch'), rest: () => 0, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} semitones`, places: 1 },
  loop: { lo: 0, hi: 1, ...trackLane('loop'), rest: loopRest, fmt: v => `${Math.round(v * 100)}% along the sample`, sample: true },
  mecho: { lo: 0, hi: 1, ...songLane('echo'), rest: () => st.song.master.echo.volume, fmt: pct },
  mfeedback: { lo: -.95, hi: .95, ...songLane('feedback'), rest: () => st.song.master.echo.feedback, fmt: pct },
  tempo: { lo: 30, hi: 300, pts: () => st.song.tempo, make: () => st.song.tempo, rest: () => st.song.bpm, fmt: v => `${Math.round(v)} BPM`, step: true, from: 1 }
};
// the first sample a track plays that loops (a multisample: its first zone that does)
const ownSample = t => t && t.instrument.startsWith('sample:') ? st.song.samples[t.instrument.slice(7)]
  : t && t.instrument.startsWith('multi:') ? (st.song.multis?.[t.instrument.slice(6)]?.zones || []).map(z => st.song.samples[z.sample]).find(sm => sm && sm.loop >= 0) || null : null;
const HINTS = {
  vel: 'Click to add a note, drag it to move, drag its end to lengthen. Shift-drag selects. Right-click deletes.',
  line: 'Click to add a point, drag it, right-click deletes. Shift-drag a stretch of the line to bend it (shift-click a point: straight again).',
  tempo: 'Click to add a tempo change, drag it, right-click deletes. Shift-click a point to glide to it (a ramp) instead of jumping.',
  loop: 'Where along the sample a note\'s loop starts, taken when the note starts (the sample must loop). Click to add a point, drag it, right-click deletes.'
};
const showHint = () => { $('#hint').textContent = st.lane === 'vel' ? HINTS.vel : st.lane === 'tempo' ? HINTS.tempo : st.lane === 'loop' ? HINTS.loop : HINTS.line; };
const laneY = (L, v, gB) => gB + 5 + (1 - (v - L.lo) / (L.hi - L.lo)) * (R.VEL - 10);
const laneV = (L, py, gB) => { const v = L.lo + (1 - (py - gB - 5) / (R.VEL - 10)) * (L.hi - L.lo), d = L.step ? 1 : L.places ? 10 : 100; return Math.max(L.lo, Math.min(L.hi, Math.round(v * d) / d)); };
const laneVal = (L, k) => L.step ? S.bpmAt(st.song, k) : S.laneAt(L.pts(), k) ?? L.rest();
function drawLane(x, W, gB, col) {
  const L = LANES[st.lane], pts = L.pts(), y = v => laneY(L, v, gB), off = L.sample && !ownSample(track());
  x.strokeStyle = pts.length ? col : '#5d6b80'; x.lineWidth = 1.5; x.setLineDash(pts.length ? [] : [4, 4]); x.beginPath();
  for (let X = R.KEYW; X <= W + 2; X += 2) { const Y = y(laneVal(L, tOf(X))); X === R.KEYW ? x.moveTo(X, Y) : x.lineTo(X, Y); }
  x.stroke(); x.setLineDash([]);
  for (const p of pts) { const X = xOf(p[0]); if (X < R.KEYW - 4 || X > W) continue; x.fillStyle = drag && drag.pt === p ? '#eef3f9' : p[2] ? (L.step ? '#c79bff' : '#ffd678') : col; x.fillRect(X - 3, y(p[1]) - 3, 7, 7); }
  x.fillStyle = '#5d6b80'; x.font = '9px JetBrains Mono, monospace'; x.textBaseline = 'top';
  const label = drag && drag.mode === 'lane' ? L.fmt(drag.pt[1]) : drag && drag.mode === 'curve' ? `bend ${Math.round((drag.pt[2] || 0) * 100)}%` : off ? 'the track must play a sample that loops' : pts.length ? '' : `${L.fmt(L.rest())} all along: click to add a point`;
  if (label) x.fillText(label, R.KEYW + 8, gB + 4);
}
function laneDown(px, py, e) {
  const L = LANES[st.lane], pts = L.pts(), gB = R.h - R.VEL;
  const hit = pts.find(p => Math.abs(xOf(p[0]) - px) < 6 && Math.abs(laneY(L, p[1], gB) - py) < 7);
  if (e.button === 2) { if (hit) edit(() => { const a = L.make(); a.splice(a.indexOf(hit), 1); }); return; }
  if (e.shiftKey) {
    // shift on a point: the tempo glides to it (or jumps again); a bent segment goes straight
    if (hit) { if (L.step) edit(() => { if (hit[2]) hit.length = 2; else hit[2] = 1; }); else if (hit[2]) edit(() => { hit.length = 2; }); return; }
    // shift on the line between two points: drag up or down to bend the segment (it belongs to the point it arrives at)
    const tick = tOf(px), i = pts.findIndex(p => p[0] > tick);
    if (!L.step && i > 0) {
      const pt = pts[i], dir = Math.sign(pt[1] - pts[i - 1][1]) || 1;
      drag = { mode: 'curve', pt, pts, L, dir, y0: py, c0: pt[2] || 0, before: snap(), changed: false };
    }
    return;
  }
  const before = snap();
  let pt = hit;
  if (!pt) {
    const at = Math.max(L.from || 0, snapAt(tOf(px))), a = L.make();
    pt = a.find(p => p[0] === at) || (a.push([at, laneVal(L, at)]), a[a.length - 1]);
    pt[1] = laneV(L, py, gB); a.sort((p, q) => p[0] - q[0]);
  }
  drag = { mode: 'lane', pt, pts: L.make(), L, before, changed: !hit };
  if (S.ctx) S.sync();
  drawRoll();
}
function laneMove(px, py) {
  const { pt, pts, L } = drag, gB = R.h - R.VEL, at = Math.max(L.from || 0, snapAt(tOf(px)));
  const other = pts.find(p => p !== pt && p[0] === at);
  if (!other) pt[0] = at;
  pt[1] = laneV(L, py, gB); pts.sort((a, b) => a[0] - b[0]);
  drag.changed = true; drawRoll();
}
function curveMove(py) {
  const c = Math.max(-1, Math.min(1, Math.round((drag.c0 + drag.dir * (py - drag.y0) / 40) * 20) / 20));
  if (c) drag.pt[2] = c; else drag.pt.length = 2;
  drag.changed = true; if (S.ctx) S.sync(); drawRoll();
}
function velAt(px, py) {
  const t = target(), v = Math.max(1, Math.min(127, Math.round((R.h - 3 - py) / (R.VEL - 8) * 127)));
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
  if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'vel' || d.mode === 'lane' || d.mode === 'curve') {
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
function picked() { return target().notes.filter(n => st.picked.has(n)); }
function moveSel(dt, dp) {
  const P = picked(); if (!P.length) return;
  if (dt < 0 && Math.min(...P.map(n => n[0])) + dt < 0) return;
  edit(() => { for (const n of P) { n[0] += dt; n[2] = Math.max(0, Math.min(127, n[2] + dp)); } });
  if (dp && P.length === 1) { const v = S.noteOn(st.sel, P[0][2], P[0][3]); setTimeout(() => S.noteOff(v), 180); }
}
function copySel() { const P = picked(); if (!P.length) return; const a = Math.min(...P.map(n => n[0])); st.clip = P.map(([at, l, p, v]) => [at - a, l, p, v]); }
function pasteAt(at) {
  if (!st.clip) return;
  const t = target(), add = st.clip.map(([o, l, p, v]) => [at + o, l, p, v]);
  edit(() => { t.notes.push(...add); st.picked = new Set(add); });
}
function duplicateSel() {
  const P = picked(); if (!P.length) return;
  const a = Math.min(...P.map(n => n[0])), b = Math.max(...P.map(n => n[0] + n[1])), span = Math.ceil((b - a) / st.grid) * st.grid;
  copySel(); pasteAt(a + span);
}
function quantizeSel() { const P = picked(); if (!P.length) return; edit(() => { for (const n of P) { n[0] = snapAt(n[0]); n[1] = Math.max(st.grid, snapAt(n[1])); } }); }
function deleteSel() { const P = picked(); if (!P.length) return; const t = target(); edit(() => { t.notes = t.notes.filter(n => !st.picked.has(n)); st.picked.clear(); }); }


// ---------- beats: the list, the pattern bar and the step grid ----------
let markedStep = -1;
const barTicks = () => st.song.beatsPerBar * PPQ;
const fmtBars = ticks => String(+(ticks / barTicks()).toFixed(2));
function openBeat(id, view) {
  if (!st.song.patterns || !st.song.patterns[id]) return;
  if (st.beat) stopAll();
  st.open = { p: id }; st.openView = view || (kitTrack(track()) ? 'grid' : 'roll'); st.picked.clear();
  renderBeats(); renderPat(); drawArr(); sizeRoll(); drawRoll();
}
function closeBeat() {
  if (!st.open) return;
  if (st.beat) stopAll();
  st.open = null; st.picked.clear();
  renderBeats(); renderPat(); focusTrack(); drawArr(); sizeRoll(); drawRoll();
}
// a new, empty beat and a clip of it in the selected track: at the start mark's bar, or the first bar after it where the track has no clip
function newBeat() {
  const t = track(); let id, c;
  edit(() => {
    id = B.addBeat(st.song, { len: barTicks() });
    let at = Math.floor(st.start / barTicks()) * barTicks();
    while ((t.clips || []).some(k => k.at < at + barTicks() && k.at + k.len > at)) at += barTicks();
    c = B.addClip(t, { at, p: id, len: barTicks() });
    st.song.bars = Math.max(st.song.bars, Math.ceil((c.at + c.len) / barTicks()));
  }, { rebuild: true });
  openBeat(id);
}
// the selected notes become a beat (a clip plays it where they were)
function beatFromSelection() {
  const P = picked(); if (st.open || !P.length) return;
  let r; edit(() => { r = B.beatFromNotes(st.song, track(), P); st.picked.clear(); }, { rebuild: true });
  openBeat(r.id, 'roll');
}
function renderBeats() {
  const ul = $('#beatList'), list = B.beatsOf(st.song);
  $('#beatFromSel').disabled = !!st.open || !picked().length;
  if (!list.length) { ul.innerHTML = '<li class="empty muted">No beats yet. A beat is a pattern you make once and play wherever you like.</li>'; return; }
  ul.innerHTML = list.map(([id, P]) => {
    const n = B.usesOf(st.song, id).length;
    return `<li class="beat${st.open && st.open.p === id ? ' on' : ''}" data-id="${esc(id)}" style="--c:${beatColor(id)}">
      <button class="bopen" title="Open it to edit (double-click a clip in the overview does the same)"><i></i>${esc(P.name)}</button>
      <span class="muted" title="${n ? `played by ${n} clip${n > 1 ? 's' : ''}` : 'no clip plays it'}">${fmtBars(P.len)} bar${P.len === barTicks() ? '' : 's'} · ×${n}</span>
      <button class="bdel" title="${n ? 'A clip plays it: delete the clips first' : 'Delete the beat'}" ${n ? 'disabled' : ''}>×</button></li>`;
  }).join('');
  ul.querySelectorAll('.beat').forEach(li => {
    const id = li.dataset.id; li.draggable = true;
    li.addEventListener('dragstart', e => { dragBeat = id; e.dataTransfer.setData('text/x-pixelite-beat', id); e.dataTransfer.effectAllowed = 'copy'; });
    li.addEventListener('dragend', () => { dragBeat = null; if (arrDrop) { arrDrop = null; drawArr(); } });
    li.querySelector('.bopen').onclick = () => (st.open && st.open.p === id ? closeBeat() : openBeat(id));
    li.querySelector('.bdel').onclick = () => { if (st.open && st.open.p === id) closeBeat(); edit(() => B.removeBeat(st.song, id), { rebuild: true }); };
  });
}
function renderPat() {
  const bar = $('#patBar'), P = pattern();
  if (!P) { st.open = null; bar.hidden = true; $('#beatGrid').hidden = true; $('.rollWrap').hidden = false; $('#hint').hidden = false; return; }
  const drums = kitTrack(track()), grid = drums && st.openView === 'grid';
  bar.hidden = false; $('#beatGrid').hidden = !grid; $('.rollWrap').hidden = grid; $('#hint').hidden = grid;
  const n = B.usesOf(st.song, st.open.p).length;
  bar.innerHTML = `<label>BEAT <input class="pname" value="${esc(P.name)}" maxlength="40" spellcheck="false" aria-label="Beat name"></label>
    <label title="Length in bars">BARS <input type="number" class="plen" min=".25" max="64" step=".25" value="${fmtBars(P.len)}"></label>
    <label title="Shuffle: every other 16th note comes later">SWING <input type="range" class="pswing" min="0" max=".75" step=".05" value="${P.swing || 0}"></label>
    <label>COLOUR <input type="color" class="pcolor" value="${beatColor(st.open.p)}"></label>
    ${drums ? `<label>STEP <select class="pstep"><option value="48">1/8</option><option value="24">1/16</option><option value="12">1/32</option></select></label>
      <span class="seg"><button class="tog${grid ? ' on' : ''}" data-v="grid" aria-pressed="${grid}">GRID</button><button class="tog${grid ? '' : ' on'}" data-v="roll" aria-pressed="${!grid}">ROLL</button></span>` : ''}
    <button class="btn small${S.playing && st.beat ? ' on' : ''}" id="patPlay" title="Play just this beat, looped (Space)">▶ BEAT</button>
    <span class="muted" id="patUse">${n ? `played by ${n} clip${n > 1 ? 's' : ''}: a change is heard in all of them` : 'no clip plays it yet'}</span>
    <span class="spacer"></span><button class="btn small" id="patClose" title="Close the beat (Esc)">✕</button>`;
  const q = sel => bar.querySelector(sel);
  // (a field that re-draws the bar loses focus and may say 'change' once more: the same value is no new edit)
  q('.pname').onchange = e => { const v = e.target.value.slice(0, 40) || 'Beat'; if (v !== P.name) edit(() => { P.name = v; }, { rebuild: true }); };
  q('.plen').onchange = e => { const len = Math.max(24, Math.round(+e.target.value * barTicks())); if (len !== P.len) edit(() => B.setLength(P, len), { rebuild: true }); };
  q('.pswing').oninput = e => tweak(() => { if (+e.target.value > 0) P.swing = +e.target.value; else delete P.swing; });
  q('.pswing').onchange = settle;
  q('.pcolor').onchange = e => { if (e.target.value !== beatColor(st.open.p)) edit(() => { P.color = e.target.value; }, { rebuild: true }); };
  if (drums) {
    q('.pstep').value = String(st.patStep);
    q('.pstep').onchange = e => { st.patStep = +e.target.value; renderGrid(); };
    bar.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.openView = b.dataset.v; renderPat(); sizeRoll(); drawRoll(); });
  }
  q('#patPlay').onclick = playBeat; q('#patClose').onclick = closeBeat;
  if (grid) renderGrid();
}
// the beat on its own, looped: a copy of the song that shares the live data (the mixer, the instruments, the beat) but plays only the
// selected track, from one clip that is the whole beat; so a step clicked while it plays is heard on the next pass
function playBeat() {
  const P = pattern(); if (!P) return;
  audio();
  if (S.playing) { const was = !!st.beat; stopAll(); if (was) return; }
  const t = track(), sc = Object.create(st.song);
  Object.defineProperties(sc, {
    bars: { value: Math.max(1, Math.ceil(P.len / barTicks())) }, loop: { value: { on: true, start: 0, end: P.len } },
    tracks: { value: st.song.tracks.map(o => Object.create(o, { notes: { value: [] }, clips: { value: o === t ? [{ at: 0, p: st.open.p, len: P.len, off: 0 }] : [] }, mute: { value: false }, solo: { value: false } })) }
  });
  st.beat = sc; S.metronome = st.click;
  S.play(sc, { from: 0, loop: true, onEnd: () => stopAll() });
  setPlaying(true); $('#patPlay').classList.add('on');
}
function markStep(i) {
  if (i === markedStep) return;
  const g = $('#beatGrid');
  if (markedStep >= 0) g.querySelectorAll(`[data-s="${markedStep}"]`).forEach(e => e.classList.remove('now'));
  markedStep = i;
  if (i >= 0) g.querySelectorAll(`[data-s="${i}"]`).forEach(e => e.classList.add('now'));
}
// the step grid: a row for each sound, a cell for each step. Click turns a hit on or off, dragging paints or erases a run of them,
// shift-click goes round soft, medium, hard.
function renderGrid() {
  const box = $('#beatGrid'), P = pattern(), t = track(); markedStep = -1;
  if (!P || box.hidden) return;
  const rows = B.rowsOf(S, st.song, t, P), step = st.patStep, steps = Math.ceil(P.len / step), perBeat = Math.max(1, PPQ / step), perBar = Math.max(1, barTicks() / step);
  const off = P.notes.filter(n => n[0] % step || !rows.some(r => r.note === n[2])).length;
  box.style.setProperty('--steps', steps);
  let h = `<div class="gtop"><span></span>${Array.from({ length: steps }, (_, i) => `<i class="gn${i % perBar === 0 ? ' bar' : ''}">${i % perBeat === 0 ? Math.floor(i / perBeat) % st.song.beatsPerBar + 1 : ''}</i>`).join('')}</div>`;
  for (const r of rows) {
    h += `<div class="grow" data-note="${r.note}"><span class="gname"><button class="gplay" title="Hear it">${esc(r.name)}</button>
      <select class="gfill" title="Fill the row"><option value="">…</option><option value="1">every step</option><option value="2">every 2nd</option><option value="4">every 4th</option><option value="8">every 8th</option><option value="0">clear</option></select></span>`;
    for (let i = 0; i < steps; i++) {
      const v = B.stepVel(P, r.note, i, step);
      h += `<i class="gc${i % perBeat === 0 ? ' q' : ''}${i % perBar === 0 ? ' bar' : ''}${v ? ` on a${B.accentOf(v)}` : ''}" data-s="${i}" data-n="${r.note}"></i>`;
    }
    h += '</div>';
  }
  box.innerHTML = h + (off ? `<p class="muted goff">${off} note${off > 1 ? 's are' : ' is'} off the grid (between steps, or a sound with no row): see ROLL.</p>` : '');
  box.querySelectorAll('.grow').forEach(row => {
    const note = +row.dataset.note;
    const play = row.querySelector('.gplay');
    play.onpointerdown = () => { audio(); const v = S.noteOn(st.sel, note, 100); if (v) setTimeout(() => S.noteOff(v), 400); };
    row.querySelector('.gfill').onchange = e => {
      const k = e.target.value; e.target.value = ''; if (k === '') return;
      edit(() => { for (let i = 0; i < steps; i++) B.setStep(P, note, i, +k && i % +k === 0 ? 100 : 0, step); });
      renderGrid();
    };
  });
}
$('#beatGrid').addEventListener('pointerdown', e => {
  const c = e.target.closest('.gc'); if (!c) return;
  e.preventDefault(); audio();
  const P = pattern(), step = st.patStep, box = $('#beatGrid');
  const at = el => ({ note: +el.dataset.n, i: +el.dataset.s });
  const first = at(c), had = B.stepVel(P, first.note, first.i, step);
  const mode = e.shiftKey ? 'accent' : had ? 'erase' : 'paint';
  const done = new Set();
  const apply = el => {
    const { note, i } = at(el), key = note + ':' + i; if (done.has(key)) return; done.add(key);
    const v = B.stepVel(P, note, i, step);
    const to = mode === 'erase' ? 0 : mode === 'accent' ? B.nextAccent(v) : v || 100;
    if (to === v) return;
    tweak(() => B.setStep(P, note, i, to, step));
    el.className = `gc${el.classList.contains('q') ? ' q' : ''}${el.classList.contains('bar') ? ' bar' : ''}${to ? ` on a${B.accentOf(to)}` : ''}${el.classList.contains('now') ? ' now' : ''}`;
    if (to && !S.playing) { const vv = S.noteOn(st.sel, note, to); if (vv) setTimeout(() => S.noteOff(vv), 200); }   // hear what was put there
  };
  apply(c);
  const mv = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); if (el && el.classList.contains('gc') && mode !== 'accent') apply(el); };
  const up = () => { box.removeEventListener('pointermove', mv); removeEventListener('pointerup', up); settle(); renderBeats(); };
  box.addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
$('#addBeat').onclick = newBeat; $('#beatFromSel').onclick = beatFromSelection;

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
  if (st.open) return showSaved('close the beat (Esc) to record into the song');
  if (S.playing) S.stop(.02);
  st.rec = { track: st.sel, notes: [], before: snap() };
  S.metronome = st.click;
  S.play(st.song, { from: st.start - (st.countIn ? st.song.beatsPerBar * PPQ : 0), loop: st.song.loop.on, onEnd: () => stopAll() });
  setPlaying(true);
}
function stopAll() {
  if (st.rec) finishRec();
  S.stop();
  if (st.beat) { st.beat = null; if (S.ctx) S.use(st.song); }   // the song is the Sampler's again
  setPlaying(false); $('#patPlay')?.classList.remove('on'); showPos(); drawRoll(); drawArr();
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
    if (st.follow && !st.open && p >= 0 && (p > st.view.x + vis * .92 || p < st.view.x)) st.view.x = Math.max(0, p - vis * .08);
    drawRoll(); drawArr();
    markStep(st.beat && !$('#beatGrid').hidden ? Math.floor(S.position() / st.patStep) : -1);
  } else if (markedStep !== -1) markStep(-1);
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
  if (st.focus === 'arr' && (st.cs.size || (ctrl && e.code === 'KeyE'))) {   // the arranger has the keys while its clips are what was last clicked
    if (ctrl && e.code === 'KeyE') { e.preventDefault(); splitClips(); return; }
    if (ctrl && e.code === 'KeyD') { e.preventDefault(); dupClips(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteClips(); return; }
    if (e.code === 'Escape') { st.cs.clear(); drawArr(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); if (st.open) playBeat(); else play(); }
  else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); }
  else if (ctrl && e.code === 'KeyS') { e.preventDefault(); save(); }
  else if (ctrl && e.code === 'KeyC') copySel();
  else if (ctrl && e.code === 'KeyV') { e.preventDefault(); pasteAt(st.start); }
  else if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSel(); }
  else if (ctrl && e.code === 'KeyA') { e.preventDefault(); st.picked = new Set(target().notes); drawRoll(); }
  else if (!ctrl && e.code === 'KeyR') record();
  else if (!ctrl && e.code === 'KeyQ') quantizeSel();
  else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSel(); }
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); moveSel(0, (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)); }
  else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); moveSel((e.code === 'ArrowRight' ? 1 : -1) * st.grid, 0); }
  else if (e.code === 'Escape') { if (st.open) closeBeat(); else { st.picked.clear(); drawRoll(); } }
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
const replaceOk = () => !st.dirty || confirm('Replace the song you are working on? Its unsaved changes will be lost ([ SAVE ] first, or cancel and use "Save as a copy").');
async function importFile(f) {
  try { const s = JSON.parse(await f.text()); if (replaceOk()) load(s, undefined, true); } catch (e) { alert(`That is not a song file: ${e.message}`); }
}
// MIDI files (midi-core.mjs): the notes, instruments, tempo and loop, the volume, pan and pitch-bend lanes and the song's own samples;
// effects, EQ and the other lanes are not in one
function exportMidi() {
  const { bytes, warnings } = midiFromSong(st.song, S);
  download(new Blob([bytes], { type: 'audio/midi' }), `${slug(st.song.title)}.mid`);
  showSaved('MIDI file made'); if (warnings.length) alert(`The MIDI file is made. Notes on it:\n- ${warnings.join('\n- ')}`);
}
// a file with several instruments asks which to open (all ticked); resolves to their indices, or null for cancel
function pickInstruments(candidates) {
  const dlg = $('#midiPick'), list = $('#midiPickList');
  $('#midiPickInfo').textContent = `${candidates.length} instruments in the file. Untick the ones you do not want in the song (a song holds up to 32 tracks).`;
  list.innerHTML = candidates.map(c => `<label class="pickrow"><input type="checkbox" value="${c.index}" checked><b>${esc(c.name)}</b>
    <span class="muted">${S.isKit(c.instrument) ? 'drum kit' : esc(insName(c.instrument) || S.INSTRUMENTS.find(x => x.id === c.instrument)?.name || c.instrument)} · channel ${c.channel} · ${c.notes} notes</span></label>`).join('');
  const boxes = () => [...list.querySelectorAll('input')];
  $('#midiPickAll').onclick = () => boxes().forEach(b => { b.checked = true; });
  $('#midiPickNone').onclick = () => boxes().forEach(b => { b.checked = false; });
  return new Promise(res => {
    dlg.onclose = () => res(dlg.returnValue === 'ok' ? boxes().filter(b => b.checked).map(b => +b.value) : null);
    dlg.returnValue = ''; dlg.showModal();
  });
}
async function importMidi(f) {
  let r;
  const bytes = new Uint8Array(await f.arrayBuffer()), opts = { name: f.name.replace(/\.midi?$/i, '') };
  try {
    r = songFromMidi(bytes, S, opts);
    if (r.info.candidates.length > 1) {
      const only = await pickInstruments(r.info.candidates);
      if (!only) return;
      if (!only.length) { alert('No instrument was ticked: nothing was opened.'); return; }
      if (only.length < r.info.candidates.length) r = songFromMidi(bytes, S, { ...opts, only });
    }
  } catch (e) { alert(`That MIDI file cannot be opened: ${e.message}`); return; }
  if (!replaceOk()) return;
  load(r.song, undefined, true); showSaved(`MIDI file opened: ${r.info.tracks} tracks, ${r.info.notes} notes`);
  if (r.warnings.length) alert(`The MIDI file is open. Notes on it:\n- ${r.warnings.join('\n- ')}`);
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
// a sound (a file's, or a recording's) becomes a new sample, played by track i
async function addSample(src, name, i) {
  let id = slug(name).slice(0, 24) || 'sample'; for (let k = 2; st.song.samples[id]; k++) id = `${slug(name).slice(0, 20)}-${k}`;
  sources.set(id, src);
  const rate = 32000, data = await resample(src, rate, MAX_SECS), root = detectRoot(data, rate) ?? 60;
  edit(() => {
    st.song.samples[id] = { name, rate, root, loop: -1, brr: S.toB64(S.brrEncode(data)) };
    const t = st.song.tracks[i]; t.instrument = `sample:${id}`; t.name = name;
    t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  st.sel = i; renderAll(); S.prepare(st.song);
  showSaved(`sample "${name}": ${(data.length / rate).toFixed(2)} s, plays ${noteName(Math.round(root))}`);
}
// a new sound in place of a sample's (the same name, note and place in the song's tracks)
async function replaceSample(id, src) {
  const sm = st.song.samples[id]; sources.set(id, src);
  const data = await resample(src, sm.rate, MAX_SECS), root = detectRoot(data, sm.rate) ?? sm.root;
  edit(() => { sm.brr = S.toB64(S.brrEncode(data)); sm.root = root; sm.loop = -1; delete sm.loopEnd; delete sm.xfade; }, { rebuild: true }); S.prepare(st.song);
}
$('#sampleFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  audio(); showSaved('loading the sample…');
  try { await addSample(await decodeFile(f), f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'sample', sampleFor); }
  catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
};

// ---------- the microphone: a sound recorded here becomes a sample ----------
// recFor: { track } makes a new sample for that track; { id } puts the recording in place of that sample's sound
let recFor = null;
function recordSample(i) { recFor = { track: i }; openRecorder(); }
function openRecorder() {
  const dlg = $('#recDlg'), go = $('#recGo'), info = $('#recInfo'), cv = $('#recMeter'), x = cv.getContext('2d'), idle = info.textContent;
  let stream = null, rec = null, ac = null, an = null, raf = 0, timer = 0, chunks = [], t0 = 0, keep = false;
  const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (ac) ac.close(); ac = null; };
  const meter = () => {
    const buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf);
    let s = 0; for (const v of buf) s += v * v;
    const lvl = Math.min(1, Math.sqrt(s / buf.length) * 4), secs = (performance.now() - t0) / 1000;
    x.fillStyle = '#05070c'; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = lvl > .9 ? '#ff6048' : '#8ceb96'; x.fillRect(0, 8, lvl * cv.width, 14);
    x.fillStyle = '#ffb340'; x.fillRect(0, 30, Math.min(1, secs / MAX_SECS) * cv.width, 4);
    info.textContent = `recording… ${secs.toFixed(1)} s of ${MAX_SECS}: press STOP when you are done`;
    raf = requestAnimationFrame(meter);
  };
  const reset = () => { go.textContent = '[ ● START ]'; go.disabled = false; info.textContent = idle; x.clearRect(0, 0, cv.width, cv.height); };
  go.onclick = async () => {
    if (rec && rec.state === 'recording') { keep = true; rec.stop(); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (err) { info.textContent = 'The microphone could not be used (it was not allowed, or there is none).'; return; }
    ac = new AudioContext(); an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an);
    chunks = []; rec = new MediaRecorder(stream);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), job = recFor; stop(); dlg.close(); reset();
      if (!keep || !job) return;
      audio(); showSaved('making the sample from the recording…');
      try {
        const src = await decodeFile(blob);
        if (job.id) await replaceSample(job.id, src);
        else { const n = Object.values(st.song.samples).filter(s => /^Recording/.test(s.name)).length + 1; await addSample(src, `Recording ${n}`, job.track); }
      } catch (err) { showSaved(`could not use the recording: ${err.message || err}`); }
    };
    rec.start(); t0 = performance.now(); go.textContent = '[ ■ STOP ]';
    timer = setTimeout(() => { if (rec.state === 'recording') { keep = true; rec.stop(); } }, MAX_SECS * 1000);
    meter();
  };
  dlg.onclose = () => { keep = false; if (rec && rec.state === 'recording') rec.stop(); stop(); reset(); };
  reset(); dlg.showModal();
}

// ---------- samples and multisamples ----------
// a sample taken out of the song: the multisamples that used it lose that zone, and the tracks that played it go back to the piano
function dropSample(id) {
  const s = st.song; delete s.samples[id];
  for (const [mid, mu] of Object.entries(s.multis || {})) { mu.zones = mu.zones.filter(z => z.sample !== id); if (!mu.zones.length) delete s.multis[mid]; }
  if (s.multis && !Object.keys(s.multis).length) delete s.multis;
  for (const t of s.tracks) if ((t.instrument.startsWith('sample:') && !s.samples[t.instrument.slice(7)]) || (t.instrument.startsWith('multi:') && !(s.multis || {})[t.instrument.slice(6)])) t.instrument = 'piano';
}
function newMulti(i) {
  const ids = Object.keys(st.song.samples);
  if (!ids.length) { showSaved('load or record a sample first: a multisample is made of samples'); return; }
  let id = 'multi'; for (let k = 2; st.song.multis?.[id]; k++) id = `multi-${k}`;
  edit(() => {
    (st.song.multis ??= {})[id] = { name: 'Multisample', zones: [{ sample: ids[0], lo: 0, hi: 127 }] };
    const t = st.song.tracks[i]; t.instrument = `multi:${id}`; t.name = 'Multisample';
    t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  st.sel = i; renderAll(); S.prepare(st.song);
}
function multiSection(id) {
  const mu = st.song.multis?.[id], sec = section('MULTISAMPLE');
  if (!mu) return sec;
  const samples = Object.entries(st.song.samples), used = st.song.tracks.filter(t => t.instrument === `multi:${id}`).length;
  const info = document.createElement('p'); info.className = 'meta';
  info.textContent = 'Each zone plays one sample over the notes from its low note to its high note (the nearest zone plays a note no zone holds). The sample sounds at its own note and is pitched from it.';
  const name = document.createElement('label'); name.className = 'ctl';
  name.innerHTML = `<span>Name</span><input value="${esc(mu.name)}" maxlength="40">`;
  name.querySelector('input').onchange = e => edit(() => { mu.name = e.target.value || id; }, { rebuild: true });
  const rows = document.createElement('div'); rows.className = 'zones';
  mu.zones.forEach((z, k) => {
    const row = document.createElement('div'); row.className = 'zrow';
    row.innerHTML = `<select aria-label="Sample">${samples.map(([sid, sm]) => `<option value="${esc(sid)}">${esc(sm.name)}</option>`).join('')}</select>
      <input type="number" min="0" max="127" value="${z.lo}" aria-label="Lowest note" title="Lowest note (MIDI number)"><b>–</b><input type="number" min="0" max="127" value="${z.hi}" aria-label="Highest note" title="Highest note (MIDI number)">
      <output>${noteName(z.lo)}–${noteName(z.hi)}</output><button class="btn small" data-a="hear" title="Hear this zone">▶</button><button class="btn small" data-a="del" title="Remove this zone"${mu.zones.length < 2 ? ' disabled' : ''}>×</button>`;
    const [sel, lo, hi] = row.querySelectorAll('select, input');
    sel.value = z.sample;
    sel.onchange = () => { edit(() => { z.sample = sel.value; }, { rebuild: true }); S.prepare(st.song); };
    lo.onchange = () => { edit(() => { z.lo = Math.max(0, Math.min(127, Math.round(+lo.value) || 0)); if (z.hi < z.lo) z.hi = z.lo; }, { rebuild: true }); S.prepare(st.song); };
    hi.onchange = () => { edit(() => { z.hi = Math.max(0, Math.min(127, Math.round(+hi.value) || 0)); if (z.lo > z.hi) z.lo = z.hi; }, { rebuild: true }); S.prepare(st.song); };
    row.querySelector('[data-a="hear"]').onclick = () => { audio(); const v = S.noteOn(st.sel, Math.round((z.lo + z.hi) / 2), 110); setTimeout(() => S.noteOff(v), 700); };
    row.querySelector('[data-a="del"]').onclick = () => { if (mu.zones.length > 1) { edit(() => { mu.zones.splice(k, 1); }, { rebuild: true }); S.prepare(st.song); } };
    rows.append(row);
  });
  const row = document.createElement('div'); row.className = 'srow';
  row.innerHTML = `<button class="btn small" data-a="add" title="Another sample, over the notes above the last zone">[ + ZONE ]</button>
    <button class="btn small" data-a="roots" title="Divide the notes between the zones halfway between the samples' own notes">[ FROM THEIR NOTES ]</button>
    <button class="btn small" data-a="remove">[ REMOVE ]</button>`;
  row.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'add' && mu.zones.length < 16) {
      const top = Math.max(...mu.zones.map(z => z.hi)), next = samples.find(([sid]) => !mu.zones.some(z => z.sample === sid)) || samples[0];
      edit(() => { mu.zones.push({ sample: next[0], lo: Math.min(127, top + 1), hi: 127 }); }, { rebuild: true }); S.prepare(st.song);
    }
    if (a === 'roots') {
      const order = mu.zones.map((z, k) => [st.song.samples[z.sample].root, k]).sort((p, q) => p[0] - q[0]);
      edit(() => { order.forEach(([root, k], i) => { const z = mu.zones[k]; z.lo = i ? Math.round((order[i - 1][0] + root) / 2) + 1 : 0; z.hi = i < order.length - 1 ? Math.round((root + order[i + 1][0]) / 2) : 127; if (z.hi < z.lo) z.hi = z.lo; }); }, { rebuild: true }); S.prepare(st.song);
    }
    if (a === 'remove') {
      if (!confirm(`Remove the multisample "${mu.name}"?${used ? ` The ${used} track(s) playing it go back to the piano.` : ''} (Its samples stay in the song.)`)) return;
      edit(() => { delete st.song.multis[id]; if (!Object.keys(st.song.multis).length) delete st.song.multis; for (const t of st.song.tracks) if (t.instrument === `multi:${id}`) t.instrument = 'piano'; }, { rebuild: true });
    }
  });
  sec.append(info, name, rows, row);
  return sec;
}
const sampleSecs = sm => Math.floor(sm.brr.length * 3 / 4 / 9) * 16 / sm.rate;
function drawWave(cv, sm) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, d = S.brrDecode(S.fromB64(sm.brr)), n = d.length, X = i => i / n * W;
  x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
  if (sm.loop >= 0) {
    const le = sm.loopEnd || n;
    x.fillStyle = 'rgba(255,179,64,.18)'; x.fillRect(X(sm.loop), 0, X(le) - X(sm.loop), H);
    if (sm.xfade) {   // the crossfade: the end of the loop takes on the sound that came before its start
      x.fillStyle = 'rgba(199,155,255,.30)'; x.fillRect(X(le - sm.xfade), 0, X(sm.xfade), H); x.fillRect(X(sm.loop - sm.xfade), 0, X(sm.xfade), H);
    }
    x.fillStyle = '#ffb340'; x.fillRect(X(sm.loop), 0, 2, H); x.fillRect(X(le) - 2, 0, 2, H);
    if (le < n) { x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(X(le), 0, W - X(le), H); }   // never played while the note holds
  }
  x.fillStyle = '#78dcff';
  for (let c = 0; c < W; c++) {
    let lo = 1, hi = -1; for (let i = Math.floor(c / W * n); i < Math.floor((c + 1) / W * n); i++) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
    if (hi >= lo) x.fillRect(c, H / 2 - hi * H / 2, 1, Math.max(1, (hi - lo) * H / 2));
  }
}
function sampleSection(id) {
  const sm = st.song.samples[id], sec = section('SAMPLE');
  if (!sm) return sec;
  const direct = st.song.tracks.filter(t => t.instrument === `sample:${id}`).length, viaMulti = Object.values(st.song.multis || {}).filter(mu => mu.zones.some(z => z.sample === id)).length, used = direct;
  const n = S.sampleLen(sm), kb = Math.round(sm.brr.length / 1024), total = Math.round(Object.values(st.song.samples).reduce((a, x) => a + x.brr.length, 0) / 1024);
  const cv = document.createElement('canvas'); cv.className = 'wave'; cv.width = 520; cv.height = 90;
  cv.title = 'The sample as the console stores it. With LOOP on, click where the loop should start, shift-click where it should end: the note holds by repeating that part.';
  const info = document.createElement('p'); info.className = 'meta';
  info.textContent = `${sampleSecs(sm).toFixed(2)} s at ${sm.rate / 1000} kHz · ${kb} KB (all samples ${total} KB) · ${direct} track${direct === 1 ? '' : 's'}${viaMulti ? `, ${viaMulti} multisample${viaMulti === 1 ? '' : 's'}` : ''}`;
  // grit and length re-make the sample from the sound as loaded (or, after a reload, from what is kept); the loop follows the sound along
  const remake = async (opts, apply) => {
    showSaved('making the sample…'); const r = await makeSample(id, opts);
    edit(() => { apply(); sm.brr = r.brr; if (sm.loop >= r.length) { sm.loop = -1; delete sm.loopEnd; delete sm.xfade; } else if (sm.loopEnd && sm.loopEnd >= r.length - 15) delete sm.loopEnd; }, { rebuild: true });
    S.prepare(st.song); showSaved();
  };
  // where the loop may end (a block, at least a block past its start), and how long a crossfade it can hold
  const blockOf = at => Math.floor(at / 16) * 16;
  const setEnd = at => { const e = blockOf(at); if (e >= n - 15) delete sm.loopEnd; else sm.loopEnd = Math.max(sm.loop + 16, e); if (sm.xfade) sm.xfade = Math.min(sm.xfade, sm.loop, ((sm.loopEnd || n) - sm.loop) >> 1); if (!sm.xfade) delete sm.xfade; };
  cv.onpointerdown = e => {
    if (sm.loop < 0) return;
    const r = cv.getBoundingClientRect(), at = (e.clientX - r.left) / r.width * n;
    if (e.shiftKey) edit(() => setEnd(at), { rebuild: true });
    else edit(() => { sm.loop = Math.max(0, Math.min((sm.loopEnd || n) - 32, blockOf(at))); if (sm.xfade) sm.xfade = Math.min(sm.xfade, sm.loop, ((sm.loopEnd || n) - sm.loop) >> 1); if (!sm.xfade) delete sm.xfade; }, { rebuild: true });
    S.prepare(st.song);
  };
  const name = document.createElement('label'); name.className = 'ctl';
  name.innerHTML = `<span>Name</span><input value="${esc(sm.name)}" maxlength="40">`;
  name.querySelector('input').onchange = e => edit(() => { sm.name = e.target.value || id; }, { rebuild: true });
  const root = document.createElement('label'); root.className = 'ctl'; root.title = 'The note the sample plays as recorded: notes are pitched from it';
  root.innerHTML = `<span>Its note</span><input type="number" min="0" max="127" step=".01" value="${sm.root}"><output>${noteName(Math.round(sm.root))}</output>`;
  root.querySelector('input').onchange = e => { edit(() => { sm.root = Math.max(0, Math.min(127, +e.target.value || 60)); }, { rebuild: true }); S.prepare(st.song); };
  const row = document.createElement('div'); row.className = 'srow';
  row.innerHTML = `<button class="btn small" data-a="detect" title="Listen for the note it plays">[ DETECT ]</button>
    <button class="btn small${sm.loop >= 0 ? ' on' : ''}" data-a="loop" title="Loop: a held note repeats the part between the loop's start and end (strings, organs); off: it plays once (drums, plucks)">[ LOOP ]</button>
    <button class="btn small" data-a="hear" title="Hear it at its own note">[ ▶ ]</button>
    <button class="btn small" data-a="replace">[ REPLACE… ]</button><button class="btn small" data-a="rerecord" title="Record a new sound with the microphone in its place">[ ● RECORD ]</button><button class="btn small" data-a="remove">[ REMOVE ]</button>`;
  row.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'detect') { const r = detectRoot(S.brrDecode(S.fromB64(sm.brr)), sm.rate); if (r === null) return showSaved('no clear note in it'); edit(() => { sm.root = r; }, { rebuild: true }); S.prepare(st.song); showSaved(`it plays ${noteName(Math.round(r))} (${r.toFixed(2)})`); }
    if (a === 'loop') { edit(() => { if (sm.loop >= 0) { sm.loop = -1; delete sm.loopEnd; delete sm.xfade; } else sm.loop = blockOf(n / 2); }, { rebuild: true }); S.prepare(st.song); }
    if (a === 'hear') { audio(); const v = S.noteOn(st.sel, Math.round(sm.root), 110); setTimeout(() => S.noteOff(v), 900); }
    if (a === 'replace') { sources.delete(id); replaceId = id; $('#replaceFile').click(); }
    if (a === 'rerecord') { sources.delete(id); recFor = { id }; openRecorder(); }
    if (a === 'remove') {
      const inMulti = viaMulti ? ` It is a zone of ${viaMulti} multisample(s), which lose it.` : '';
      if (!confirm(`Remove the sample "${sm.name}" from this song?${used ? ` The ${used} track(s) playing it go back to the piano.` : ''}${inMulti}`)) return;
      edit(() => dropSample(id), { rebuild: true });
    }
  });
  const grit = pick('Grit', S.RATES.map(r => [r, `${r / 1000} kHz${r === 32000 ? ' (SNES)' : ''}`]), () => sm.rate, v => {});
  const length = ctl('Length', () => sm.secs ?? Math.min(sampleSecs(sm), MAX_SECS), v => { sm.secs = v; }, { min: .05, max: MAX_SECS, step: .05, fmt: v => `${v.toFixed(2)} s`, title: 'Shorter keeps the song small; the rest is cut off' });
  grit.querySelector('select').onchange = e => {
    const to = +e.target.value, f = to / sm.rate;
    remake({ rate: to }, () => { if (sm.loop >= 0) sm.loop = blockOf(sm.loop * f); if (sm.loopEnd) sm.loopEnd = blockOf(sm.loopEnd * f); if (sm.xfade) sm.xfade = Math.max(1, Math.round(sm.xfade * f)); sm.rate = to; });
  };
  length.querySelector('input').onchange = () => { const secs = sm.secs; delete sm.secs; st.pending = null; remake({ secs }, () => {}); };
  sec.append(cv, info, name, root, row);
  if (sm.loop >= 0) {   // a loop of its own end, and a crossfade at its seam (a studio extra: the sound under the seam is blended)
    const le = () => sm.loopEnd || n;
    const loopEnd = ctl('Loop end', () => le() / sm.rate, v => setEnd(v * sm.rate), { min: Math.min(sampleSecs(sm), (sm.loop + 16) / sm.rate), max: sampleSecs(sm), step: .01, fmt: v => `${v.toFixed(2)} s`, title: 'Where the loop ends and goes back to its start; what is after it is never played while the note is held (or click the sound with Shift)' });
    const maxX = Math.max(0, Math.min(sm.loop, (le() - sm.loop) >> 1));
    const xfade = ctl('Crossfade', () => (sm.xfade || 0) / sm.rate * 1000, v => { const x = Math.round(v * sm.rate / 1000); if (x >= 1) sm.xfade = Math.min(x, maxX); else delete sm.xfade; },
      { min: 0, max: Math.max(1, Math.floor(maxX / sm.rate * 1000)), step: 1, fmt: v => v ? `${Math.round(v)} ms` : 'off', title: 'Blends the end of the loop with the sound before its start, so a held note has no click or jump where it goes round' });
    for (const c of [loopEnd, xfade]) { c.querySelector('input').addEventListener('change', () => { S.prepare(st.song); drawWave(cv, sm); }); c.querySelector('input').addEventListener('input', () => drawWave(cv, sm)); }
    sec.append(loopEnd, xfade);
  }
  sec.append(grit, length);
  requestAnimationFrame(() => drawWave(cv, sm));
  return sec;
}
let replaceId = null;
const rf = document.createElement('input'); rf.type = 'file'; rf.accept = 'audio/*'; rf.id = 'replaceFile'; rf.hidden = true; document.body.append(rf);
rf.onchange = async () => {
  const f = rf.files[0], id = replaceId; rf.value = ''; if (!f || !id) return;
  try { await replaceSample(id, await decodeFile(f)); } catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
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
function renderAll() { syncTransport(); renderTracks(); renderAddIns(); renderStrip(); renderBeats(); renderPat(); drawArr(); sizeRoll(); drawRoll(); showPos(); if (!$('#where').hidden) renderWhere(); }
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
$('#lane').onchange = e => { st.lane = e.target.value; showHint(); drawRoll(); R.cv.focus({ preventScroll: true }); };
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
$('#midiExportBtn').onclick = exportMidi;
$('#importMidi').onchange = e => { closeMenu(); const f = e.target.files[0]; if (f) importMidi(f); e.target.value = ''; };
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
