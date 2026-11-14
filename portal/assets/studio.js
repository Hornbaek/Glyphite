// The SOUND STUDIO (/studio/): a small DAW for 16-bit (Super Nintendo style) music. The sound is the engine's own Sampler
// (engine/13_sampler.js, loaded before this file), so a game plays a song exactly as it sounds here. Songs are plain data
// (Sampler.check); they save to the site (worker/songs.js, D1) and a draft is kept in this browser as you work.
// The page: a top bar (transport, the position, tempo), views (ARRANGE with the note editor docked under the tracks, TRACK SOUND,
// SAMPLES, DRUM KITS, MIXER, WHERE IT PLAYS), a side panel for beats, markers and what you play with, and a status bar.
import { findLevels, toPixels } from './levels-core.mjs';
import { songFromMidi, midiFromSong } from './midi-core.mjs';
import * as B from './beats-core.mjs';
import { PadHost } from './padlink.mjs';
import { qrSvg } from './qr.mjs';
const S = Sampler, PPQ = S.PPQ;
const $ = q => document.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
// muted colours: a clip's name stays readable on its own tint
const COLORS = ['#C8553D', '#2F8A8A', '#8A5A9E', '#4A6FB5', '#B8862B', '#5E8A3A', '#B05674', '#9C7A52'];
const INK = '#1C1C1A', SEL = '#1F4FD1', REC = '#D9480F';
// the project: the game the songs are for (?game=<id>), 'none' for sketches, no ?game at all: choose one first
const PROJECT = new URLSearchParams(location.search).get('game');
const GAME_ID = PROJECT && PROJECT !== 'none' && /^[a-z][a-z0-9-]{1,31}$/.test(PROJECT) ? PROJECT : '';
const DRAFT = `pixelite.studio.draft.${GAME_ID || 'none'}`;   // one draft per project
const SNAPS = `pixelite.studio.snaps.${GAME_ID || 'none'}`;   // the snapshots, per project and song

// ---------- state ----------
const st = {
  song: null, meta: { id: null, updated_at: null, game: '' }, sel: 0, picked: new Set(), grid: 24, len: 96, start: 0,
  dirty: false, undo: [], redo: [], lane: 'vel', pending: null, clip: null, rec: null, click: false, countIn: true, quant: true,
  keys: false, octave: 4, view: { x: 0, zoom: .7, top: 84 }, live: new Map(), pedal: false, bend: 0, follow: true,
  cs: new Set(), focus: 'roll', pad: null, page: 'arrange', open: null, openView: 'grid', patStep: B.STEP, beat: null, rev: 0,   // a beat open to edit ({ p }), how, its step in ticks, the beat playing on its own, a count that moves with every change
  ghost: true, scale: '', chord: '', smp: null, kit: null, fam: null   // the editor's view: other tracks faint, a scale shaded, a chord stamped; what the SAMPLES and KITS views show
};
let project = { id: '', title: '' };   // the game this studio is working for (from /games.json)
const track = () => st.song.tracks[st.sel];
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
const trackColor = i => (st.song.tracks[i] && st.song.tracks[i].color) || COLORS[i % COLORS.length];
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
// the names of a drum track's rows in the roll: the built-in kit's, or the pads' of a kit of the song's own
function kitNamesOf(t) {
  if (!t.instrument.startsWith('drums:')) return new Map(Object.entries(S.KIT).map(([n, v]) => [+n, v]));
  return new Map(B.rowsOf(S, st.song, t, { notes: [] }).map(r => [r.note, r.name]));
}
const snapAt = (t, g = st.grid) => Math.round(t / g) * g;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

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
  S.use(st.beat || st.song);   // (every click calls this: it must not hand the Sampler the song while a beat plays on its own)
}
// one note of any instrument, heard on the selected track's channel (a sample, a pad or a kit no track plays yet)
function audition(instrument, note, vel = 110, ms = 700) {
  audio(); const t = track(); if (!t) return;
  const was = [t.instrument, t.sound.octave, t.sound.fine];
  t.instrument = instrument; t.sound.octave = 0; t.sound.fine = 0;
  let v = null;
  try { v = S.noteOn(st.sel, note, vel); } finally { [t.instrument, t.sound.octave, t.sound.fine] = was; }
  if (v) setTimeout(() => S.noteOff(v), ms);
}

// ---------- a question in a dialog of the page's own (never the browser's): resolves to the value of the button pressed ----------
function ask({ title, text = '', buttons = [['Cancel', null], ['OK', true, 'dark']], input = null }) {
  const d = $('#askDlg'), inp = $('#askInput');
  $('#askTitle').textContent = title; $('#askText').textContent = text; $('#askText').hidden = !text;
  inp.hidden = input === null; inp.value = input ?? '';
  const box = $('#askBtns'); box.textContent = '';
  return new Promise(res => {
    let done = false;
    const finish = v => { if (done) return; done = true; if (d.open) d.close(); res(input !== null && v ? (inp.value.trim() || null) : v); };
    buttons.forEach(([label, v, kind], k) => {
      if (k === 1 && buttons.length > 2) box.append(el('span', 'grow'));
      const b = el('button', `b${kind ? ' ' + kind : ''}`); b.type = 'button'; b.textContent = label; b.onclick = () => finish(v); box.append(b);
    });
    if (buttons.length <= 2) box.prepend(el('span', 'grow'));
    d.oncancel = e => { e.preventDefault(); finish(null); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); finish(buttons[buttons.length - 1][1]); } };
    d.showModal(); (input !== null ? inp : box.lastElementChild).focus(); if (input !== null) inp.select();
  });
}
const tell = (title, text = '') => ask({ title, text, buttons: [['OK', true, 'dark']] });

// ---------- changes, undo, the draft ----------
const snap = () => JSON.stringify(st.song);
function changed({ rebuild = false } = {}) {
  st.dirty = true; showSaved();
  for (const tr of st.song.tracks) tr.notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  for (const P of Object.values(st.song.patterns || {})) B.tidyBeat(P);   // a beat's notes stay inside it
  st.rev++;
  if (st.cs.size) st.cs = new Set([...st.cs].filter(c => st.song.tracks.some(t => (t.clips || []).includes(c))));   // (a deleted track's clips are no longer there to be chosen)
  if (S.ctx) { S.use(playSong()); S.sync(); }
  if (rebuild) renderAll(); else { drawArr(); drawRoll(); renderBeats(); }
  showUndo();
  clearTimeout(changed.t); changed.t = setTimeout(() => { saveDraft(); showSizes(); }, 600);
}
// an edit that undo can take back as one step
function edit(fn, opts) { pushUndo(snap()); st.redo = []; fn(); changed(opts); }
// at most 150 steps, and about 60 MB of them (a song with samples is large)
function pushUndo(j) { st.undo.push(j); let total = st.undo.reduce((n, u) => n + u.length, 0); while (st.undo.length > 150 || (total > 3e7 && st.undo.length > 3)) total -= st.undo.shift().length; }
// slider drags: many small changes, one undo step (settle() when the drag ends)
function tweak(fn) { if (!st.pending) st.pending = snap(); fn(); st.rev++; st.dirty = true; showSaved(); if (S.ctx) S.sync(); clearTimeout(changed.t); changed.t = setTimeout(saveDraft, 600); }
function settle() {
  if (st.pending) { pushUndo(st.pending); st.redo = []; st.pending = null; }
  for (const P of Object.values(st.song.patterns || {})) B.tidyBeat(P);
  st.rev++; drawArr(); drawRoll(); showUndo();
}
function restore(json) {
  if (st.beat) stopAll();
  st.song = S.check(JSON.parse(json)); st.picked.clear(); st.cs.clear(); st.sel = Math.min(st.sel, st.song.tracks.length - 1);
  changed({ rebuild: true });
}
function undo() { if (!st.undo.length) return; st.redo.push(snap()); restore(st.undo.pop()); }
function redo() { if (!st.redo.length) return; st.undo.push(snap()); restore(st.redo.pop()); }
function showUndo() { $('#undoBtn').disabled = !st.undo.length; $('#redoBtn').disabled = !st.redo.length; $('#undoInfo').textContent = st.undo.length ? `${st.undo.length} step${st.undo.length > 1 ? 's' : ''} to undo` : ''; }
function saveDraft() { try { localStorage.setItem(DRAFT, JSON.stringify({ song: st.song, meta: st.meta, dirty: st.dirty })); } catch { } }
function showSaved(text) {
  const msg = text ?? (st.dirty ? (st.meta.id ? 'changed since saved' : 'not saved yet') : st.meta.id ? 'saved' : '');
  $('#saved').textContent = msg; $('#saveState').title = msg;
  $('#saveState').dataset.s = text ? '' : st.dirty ? 'dirty' : st.meta.id ? 'saved' : '';
}
// what the song weighs: its notes (all clips written out), its samples, and the whole of it as saved
function showSizes() {
  if (!st.song) return;
  const notes = st.song.tracks.reduce((n, t) => n + S.notesOf(st.song, t).length, 0);
  const smp = Math.round(Object.values(st.song.samples || {}).reduce((a, x) => a + x.brr.length, 0) / 1024), all = snap().length;
  $('#sizeNotes').textContent = `notes ${notes.toLocaleString('en')} / 50,000`;
  $('#sizeSamples').textContent = `samples ${smp} KB`;
  $('#sizeSong').textContent = `song ${Math.round(all / 1024)} KB / 1.5 MB`;
  $('#sizeSong').classList.toggle('warn', all > 1.2e6);
}
function load(s, meta = { id: null, updated_at: null, game: GAME_ID }, dirty = false) {
  if (S.playing) stopAll();
  st.open = null; st.beat = null; st.rev++; st.cs.clear(); sources.clear(); padOwned.clear(); st.smp = null; st.kit = null;   // (another song's sounds are not this one's)
  st.song = S.check(s); st.meta = { ...meta }; st.sel = 0; st.picked.clear(); st.undo = []; st.redo = []; st.dirty = dirty; st.start = 0;
  st.view.x = 0; st.view.top = S.isKit(st.song.tracks[0]?.instrument || '') ? 60 : 84;
  if (S.ctx) S.use(st.song);
  S.prepare(st.song);
  renderAll(); showSaved(); saveDraft(); showSizes();
}

// ---------- the track headers (beside the lanes) ----------
function selectTrack(i) {
  if (i === st.sel || !st.song.tracks[i]) return;
  closeBeat(); st.sel = i; st.picked.clear(); focusTrack(); markSel(); renderDock(); phoneSend();
  drawArr(); drawRoll();
  if (st.page === 'sound') renderSound();
  if (st.page === 'mixer') $('#mixer').querySelectorAll('.chan:not(.master)').forEach((x, k) => x.classList.toggle('sel', k === i));
}
// show which track is selected without rebuilding the list (a click on its colour box or name must reach them)
function markSel() {
  $('#trackList').querySelectorAll('.trk').forEach((x, k) => x.classList.toggle('sel', k === st.sel));
  $('#inTrack').textContent = track()?.name || '';
}
function renderTracks() {
  const opts = insOptions(true);
  $('#trackCount').textContent = `${st.song.tracks.length}/32`;
  $('#addTrack').disabled = st.song.tracks.length >= 32;
  $('#trackList').innerHTML = st.song.tracks.map((t, i) => `
    <li class="trk${i === st.sel ? ' sel' : ''}${t.mute ? ' muted' : ''}" data-i="${i}" style="--c:${trackColor(i)}">
      <div class="tb">
        <div class="r1"><input type="color" class="tcol" value="${trackColor(i)}" aria-label="Track colour" title="The track's colour">
          <input class="tname" value="${esc(t.name)}" aria-label="Track name" spellcheck="false" maxlength="40">
          <button class="mbtn${t.mute ? ' on' : ''}" data-k="mute" title="Mute" aria-pressed="${t.mute}">M</button>
          <button class="sbtn${t.solo ? ' on' : ''}" data-k="solo" title="Solo" aria-pressed="${t.solo}">S</button></div>
        <div class="r2"><select class="tins" aria-label="Instrument" title="The instrument">${opts}</select>
          <input type="range" class="tvol" min="0" max="1" step=".01" value="${t.volume}" aria-label="Volume" title="Volume">
          <input type="range" class="tpan" min="-1" max="1" step=".05" value="${t.pan}" aria-label="Pan" title="Pan (double-click: centre)"></div>
      </div>
      <span class="meter"><i></i></span>
    </li>`).join('');
  $('#trackList').querySelectorAll('.trk').forEach((li, i) => {
    const t = st.song.tracks[i];
    li.querySelector('.tins').value = t.instrument;
    li.addEventListener('pointerdown', () => selectTrack(i));
    li.addEventListener('contextmenu', e => { e.preventDefault(); selectTrack(i); trackMenu(e.clientX, e.clientY); });
    li.querySelector('.tcol').onchange = e => { if (e.target.value !== trackColor(i)) edit(() => { t.color = e.target.value; }, { rebuild: true }); };
    li.querySelector('.tname').onchange = e => edit(() => { t.name = e.target.value.slice(0, 40) || 'Track'; }, { rebuild: true });
    li.querySelector('.tins').onchange = e => setInstrument(i, e.target.value);
    li.querySelectorAll('[data-k]').forEach(b => b.onclick = () => edit(() => { t[b.dataset.k] = !t[b.dataset.k]; }, { rebuild: true }));
    const vol = li.querySelector('.tvol'), pan = li.querySelector('.tpan');
    vol.oninput = () => tweak(() => { t.volume = +vol.value; }); vol.onchange = () => { settle(); if (st.page === 'mixer') renderMixer(); };
    pan.oninput = () => tweak(() => { t.pan = +pan.value; }); pan.onchange = settle;
    pan.ondblclick = () => edit(() => { t.pan = 0; }, { rebuild: true });
  });
  markSel();
}
function trackMenu(x, y) {
  const n = st.song.tracks.length;
  showMenu(x, y, [
    { label: 'Track sound…', run: () => showView('sound') },
    { label: 'Duplicate', off: n >= 32, run: () => trackAction('dup') },
    { label: 'Move up', off: st.sel === 0, run: () => trackAction('up') },
    { label: 'Move down', off: st.sel >= n - 1, run: () => trackAction('down') },
    null,
    { label: 'Delete the track…', off: n < 2, run: () => trackAction('del') }
  ]);
}
function insOptions(load) {
  const own = Object.entries(st.song.samples || {}), multi = Object.entries(st.song.multis || {}), kits = Object.entries(st.song.kits || {});
  const groups = [...new Set(S.INSTRUMENTS.map(i => i.group))];
  return groups.map(g => `<optgroup label="${esc(g)}">${S.INSTRUMENTS.filter(i => i.group === g).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</optgroup>`).join('')
    + (own.length ? `<optgroup label="This song's samples">${own.map(([id, sm]) => `<option value="sample:${esc(id)}">${esc(sm.name)}</option>`).join('')}</optgroup>` : '')
    + (multi.length ? `<optgroup label="This song's multisamples">${multi.map(([id, mu]) => `<option value="multi:${esc(id)}">${esc(mu.name)}</option>`).join('')}</optgroup>` : '')
    + (kits.length ? `<optgroup label="This song's drum kits">${kits.map(([id, ki]) => `<option value="drums:${esc(id)}">${esc(ki.name)}</option>`).join('')}</optgroup>` : '')
    + (load ? '<optgroup label="Your own"><option value="__load">+ Load a sample…</option><option value="__record">+ Record a sample…</option><option value="__multi">+ New multisample…</option><option value="__kit">+ New drum kit…</option></optgroup>' : '');
}
const insName = id => id.startsWith('drums:') ? st.song.kits?.[id.slice(6)]?.name : id.startsWith('sample:') ? st.song.samples[id.slice(7)]?.name : id.startsWith('multi:') ? st.song.multis?.[id.slice(6)]?.name : S.INSTRUMENTS.find(x => x.id === id)?.name;
function setInstrument(i, id) {
  if (id === '__load') { renderTracks(); return pickSample(i); }
  if (id === '__record') { renderTracks(); return recordSample(i); }
  if (id === '__multi') { renderTracks(); return newMulti(i); }
  if (id === '__kit') { renderTracks(); return newKitFor(i); }
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
async function trackAction(a) {
  const T = st.song.tracks, i = st.sel;
  if (st.beat) stopAll();   // a beat playing on its own holds a copy of the song's tracks: it would play the old ones
  if (a === 'del') {
    if (T.length < 2) return;
    const nn = S.notesOf(st.song, T[i]).length, nc = (T[i].clips || []).length;
    if (nn && !await ask({ title: `Delete the track “${T[i].name}”?`, text: `It holds ${nn} note${nn > 1 ? 's' : ''}${nc ? ` and ${nc} clip${nc > 1 ? 's' : ''} (the beats stay in the song)` : ''}. You can undo this.`, buttons: [['Cancel', null], ['Delete track', true, 'danger dark']] })) return;
    edit(() => { T.splice(i, 1); st.sel = Math.max(0, i - 1); }, { rebuild: true });
  }
  if (a === 'dup' && T.length < 32) edit(() => { const c = JSON.parse(JSON.stringify(T[i])); c.name += ' 2'; T.splice(i + 1, 0, c); st.sel = i + 1; }, { rebuild: true });
  if (a === 'up' && i > 0) edit(() => { [T[i - 1], T[i]] = [T[i], T[i - 1]]; st.sel = i - 1; }, { rebuild: true });
  if (a === 'down' && i < T.length - 1) edit(() => { [T[i + 1], T[i]] = [T[i], T[i + 1]]; st.sel = i + 1; }, { rebuild: true });
}

// ---------- small controls shared by the views ----------
function ctl(label, get, set, { min = 0, max = 1, step = .01, fmt = v => v.toFixed(2), log = false, title = '', redraw = null } = {}) {
  const c = el('label', 'ctl'); if (title) c.title = title;
  const toUI = v => log ? 1000 * Math.log(v / min) / Math.log(max / min) : v, fromUI = u => log ? min * Math.pow(max / min, u / 1000) : u;
  c.innerHTML = `<span>${esc(label)}</span><output></output><input type="range" min="${log ? 0 : min}" max="${log ? 1000 : max}" step="${log ? 1 : step}">`;
  const inp = c.querySelector('input'), out = c.querySelector('output');
  inp.value = toUI(get()); out.textContent = fmt(get());
  inp.oninput = () => { tweak(() => set(fromUI(+inp.value))); out.textContent = fmt(get()); if (redraw) redraw(); };
  inp.onchange = settle;
  return c;
}
function pick(label, options, get, set, { redraw = null, title = '' } = {}) {
  const c = el('label', 'ctl'); if (title) c.title = title;
  c.innerHTML = `<span>${esc(label)}</span><select>${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`;
  const s = c.querySelector('select'); s.value = String(get()); s.onchange = () => { edit(() => set(s.value)); if (redraw) redraw(); };
  return c;
}
// a module: a titled box of controls
function mod(title, cls = '', note = '') {
  const m = el('section', `mod ${cls}`); m.append(el('h3', '', `${esc(title)}${note ? ` <small>${esc(note)}</small>` : ''}`));
  const body = el('div', 'mb'); m.append(body); m.body = body; return m;
}
function segs(options, get, set) {
  const box = el('div', 'segs');
  for (const [v, label] of options) {
    const b = el('button', `b${String(get()) === String(v) ? ' on' : ''}`); b.type = 'button'; b.textContent = label;
    b.onclick = () => { if (String(get()) !== String(v)) set(v); }; box.append(b);
  }
  return box;
}
const ms = v => v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`, db = v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, pct = v => `${Math.round(v * 100)}%`;
const hzs = v => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
const panFmt = v => (v < -.02 ? `L ${Math.round(-v * 100)}` : v > .02 ? `R ${Math.round(v * 100)}` : 'C');
const rates = S.RATES.map(r => [r, `${r === 11025 ? 11 : r / 1000} kHz${r === 32000 ? ' (SNES)' : ''}`]);

// ---------- TRACK SOUND: the selected track's instrument, pitch, envelope, vibrato, sends and tone ----------
function sideTracks(onPick) {
  const side = el('nav', 'side'); side.setAttribute('aria-label', 'Tracks'); side.append(el('div', 'lb', 'Tracks'));
  st.song.tracks.forEach((t, i) => {
    const b = el('button', `sitem${i === st.sel ? ' on' : ''}`, `<span class="chip" style="background:${trackColor(i)}"></span><span class="nm">${esc(t.name)}</span><small>${esc(insName(t.instrument) || '')}</small>`);
    b.onclick = () => { selectTrack(i); onPick(); }; side.append(b);
  });
  return side;
}
function renderSound() {
  const box = $('#soundView'); box.textContent = '';
  const t = track(); if (!t) return;
  phoneSend();
  box.append(sideTracks(renderSound));
  const main = el('div', 'smain'); box.append(main);
  const d = S.defaults(t.instrument), s = t.sound, kit = kitTrack(t), multi = t.instrument.startsWith('multi:'), own = multi || t.instrument.startsWith('sample:'), snes = st.song.snes;
  const env = (k, dk) => () => s[k] ?? d.env[dk];
  // the header: name, colour, order
  const head = el('header', 'vhead');
  head.innerHTML = `<input class="nm" value="${esc(t.name)}" maxlength="40" aria-label="Track name" spellcheck="false">
    <div class="swatches" role="group" aria-label="Track colour">${COLORS.map(c => `<button type="button" style="background:${c}" data-c="${c}" class="${trackColor(st.sel) === c ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <span class="lb">Volume</span><span class="mono">${pct(t.volume)}</span><span class="lb">Pan</span><span class="mono">${panFmt(t.pan)}</span>
    <span class="grow"></span>
    <button class="b s" data-a="up" title="Move up" aria-label="Move up"${st.sel ? '' : ' disabled'}>↑</button><button class="b s" data-a="down" title="Move down" aria-label="Move down"${st.sel < st.song.tracks.length - 1 ? '' : ' disabled'}>↓</button>
    <button class="b s" data-a="dup">Duplicate</button><button class="b s danger" data-a="del"${st.song.tracks.length > 1 ? '' : ' disabled'}>Delete…</button>`;
  head.querySelector('.nm').onchange = e => edit(() => { t.name = e.target.value.slice(0, 40) || 'Track'; }, { rebuild: true });
  head.querySelectorAll('[data-c]').forEach(b => b.onclick = () => edit(() => { t.color = b.dataset.c; }, { rebuild: true }));
  head.querySelectorAll('[data-a]').forEach(b => b.onclick = () => trackAction(b.dataset.a));
  main.append(head);
  if (snes) {
    const bar = el('div', 'snesbar', '<b>SNES limits on</b><span>8 voices and the console\'s echo only: EQ, filter, chorus and reverb are kept but not heard.</span>');
    const off = el('button', 'b s'); off.textContent = 'Turn off'; off.onclick = () => edit(() => { st.song.snes = false; }, { rebuild: true }); bar.append(off); main.append(bar);
  }
  const mods = el('div', 'mods'); main.append(mods);
  // the instrument: families, their instruments, the song's own sounds
  const inst = mod('Instrument', 'inst');
  const fams = [...new Set(S.INSTRUMENTS.map(i => i.group)), 'Your own'];
  const cur = S.INSTRUMENTS.find(i => i.id === t.instrument);
  const fam = st.fam && fams.includes(st.fam) ? st.fam : cur ? cur.group : 'Your own';
  const hear = el('button', 'b s'); hear.innerHTML = '<svg width="9" height="9"><use href="#i-play"/></svg>Hear'; hear.title = 'Hear a note of it';
  hear.onclick = () => { audio(); const v = S.noteOn(st.sel, kit ? 38 : 60, 100); if (v) setTimeout(() => S.noteOff(v), 600); };
  inst.querySelector('h3').append(el('span', 'grow'), hear);
  inst.body.remove();
  const fl = el('div', 'fams'), nav = el('nav'), list = el('div', 'ilist');
  for (const f of fams) { const b = el('button', f === fam ? 'on' : ''); b.type = 'button'; b.textContent = f; b.onclick = () => { st.fam = f; renderSound(); }; nav.append(b); }
  const item = (id, label) => { const b = el('button', id === t.instrument ? 'on' : '', `<i></i>${esc(label)}`); b.type = 'button'; b.onclick = () => { if (id !== t.instrument) setInstrument(st.sel, id); }; list.append(b); };
  if (fam === 'Your own') {
    for (const [id, sm] of Object.entries(st.song.samples || {})) item(`sample:${id}`, `${sm.name} · sample`);
    for (const [id, mu] of Object.entries(st.song.multis || {})) item(`multi:${id}`, `${mu.name} · multisample`);
    for (const [id, ki] of Object.entries(st.song.kits || {})) item(`drums:${id}`, `${ki.name} · drum kit`);
    for (const [v, label] of [['__load', '+ Load a sample…'], ['__record', '+ Record a sample…'], ['__multi', '+ New multisample…'], ['__kit', '+ New drum kit…']]) {
      const b = el('button', 'add'); b.type = 'button'; b.textContent = label; b.onclick = () => setInstrument(st.sel, v); list.append(b);
    }
  } else for (const i of S.INSTRUMENTS.filter(x => x.group === fam)) item(i.id, i.name);
  fl.append(nav, list); inst.append(fl);
  const foot = el('div', 'foot');
  if (own) { const b = el('button', 'b s'); b.textContent = multi ? 'Edit the multisample →' : 'Edit the sample →'; b.onclick = () => { st.smp = { k: multi ? 'm' : 's', id: t.instrument.slice(multi ? 6 : 7) }; showView('samples'); }; foot.append(b); }
  if (t.instrument.startsWith('drums:')) { const b = el('button', 'b s'); b.textContent = 'Edit the pads →'; b.onclick = () => { st.kit = t.instrument.slice(6); showView('kits'); }; foot.append(b); }
  if (!kit) {
    const reset = el('button', 'b s'); reset.textContent = 'Back to the instrument\'s own'; reset.title = 'Resets envelope, vibrato, octave and fine tune';
    reset.onclick = () => edit(() => { s.attack = s.decay = s.sustain = s.fall = s.release = s.vibrato = null; s.octave = 0; s.fine = 0; }, { rebuild: true });
    foot.append(reset, el('span', 'muted small', 'Resets envelope, vibrato, octave and fine tune.'));
  }
  if (foot.childElementCount) inst.append(foot);
  mods.append(inst);
  // pitch and grit
  const pitch = mod(kit ? 'Grit' : 'Pitch and grit');
  if (!kit) {
    const oc = el('div'); oc.append(el('div', 'lb', 'Octave'), segs([-3, -2, -1, 0, 1, 2, 3].map(v => [v, v > 0 ? '+' + v : String(v)]), () => s.octave, v => edit(() => { s.octave = v; }, { rebuild: true })));
    pitch.body.append(oc, ctl('Fine', () => s.fine, v => { s.fine = Math.round(v); }, { min: -100, max: 100, step: 1, fmt: v => `${v > 0 ? '+' : ''}${v} cents` }));
  }
  if (!own) pitch.body.append(pick('Grit', rates, () => s.rate, v => { s.rate = +v; S.prepare(st.song); }, { title: 'The sample rate the instrument is made at: lower is grittier' }));
  if (!kit) pitch.body.append(ctl('Glide', () => s.glide, v => { s.glide = v < .01 ? 0 : v; }, { min: 0, max: 1, step: .01, fmt: v => v ? ms(v) : 'off', title: 'Above off the track plays one note at a time (a lead), sliding from the note still held to the next' }));
  if (kit) pitch.body.append(el('p', 'meta', 'A drum track plays its kit\'s pads; their tune, level, pan and choke are under DRUM KITS.'));
  mods.append(pitch);
  if (!kit) {
    // the envelope, drawn
    const e = mod('Envelope', 'env', s.attack != null || s.decay != null || s.sustain != null || s.fall != null || s.release != null ? 'changed from the instrument\'s own' : 'the instrument\'s own');
    e.body.remove();
    const eb = el('div', 'envbox'), cv = el('canvas'); cv.id = 'envCurve'; cv.width = 300; cv.height = 140; cv.style.width = '300px'; cv.style.height = '140px';
    const redraw = () => drawEnv(cv, t);
    const ec = el('div', 'envctl');
    ec.append(
      ctl('Attack', env('attack', 'a'), v => { s.attack = v; }, { min: .001, max: 3, log: true, fmt: ms, redraw }),
      ctl('Decay', env('decay', 'd'), v => { s.decay = v; }, { min: .001, max: 4, log: true, fmt: ms, redraw }),
      ctl('Sustain', env('sustain', 's'), v => { s.sustain = v; }, { fmt: pct, redraw }),
      ctl('Fall', env('fall', 'sd'), v => { s.fall = v < .02 ? 0 : v; }, { min: 0, max: 8, step: .01, fmt: v => v ? `${v.toFixed(2)} s` : 'holds', title: 'How fast a held note fades (the SNES "sustain rate"); off: it holds', redraw }),
      ctl('Release', env('release', 'r'), v => { s.release = v; }, { min: .005, max: 4, log: true, fmt: ms, redraw }));
    eb.append(cv, ec); e.append(eb); mods.append(e);
    requestAnimationFrame(redraw);
  }
  // vibrato and the sends
  const vib = mod(kit ? 'Sends' : 'Vibrato and sends');
  if (!kit) vib.body.append(
    ctl('Vibrato depth', () => (s.vibrato ?? d.vib)[0], v => { s.vibrato = [v, (s.vibrato ?? d.vib)[1], (s.vibrato ?? d.vib)[2]]; }, { min: 0, max: 60, step: 1, fmt: v => `${v} cents` }),
    ctl('Vibrato speed', () => (s.vibrato ?? d.vib)[1], v => { s.vibrato = [(s.vibrato ?? d.vib)[0], v, (s.vibrato ?? d.vib)[2]]; }, { min: 1, max: 10, step: .1, fmt: v => `${v.toFixed(1)} Hz` }),
    el('p', 'meta', `Vibrato delay: the instrument's own, ${Math.round(((s.vibrato ?? d.vib)[2] || 0) * 1000)} ms.`));
  const rv = ctl(snes ? 'Reverb · off in SNES mode' : 'Reverb', () => t.sends.reverb, v => { t.sends.reverb = v; }, { fmt: pct });
  if (snes) rv.classList.add('off');
  vib.body.append(ctl('Echo', () => t.sends.echo, v => { t.sends.echo = v; }, { fmt: pct, title: 'How much of this track goes into the SNES echo' }), rv);
  mods.append(vib);
  // tone: EQ, filter, chorus (the console had none of them)
  const tone = mod('Tone', 'tone', snes ? 'off in SNES limits mode' : 'EQ, filter and chorus');
  if (snes) { tone.classList.add('off'); tone.title = 'SNES LIMITS is on: the console had no EQ, filter, chorus or reverb (the echo still works)'; }
  tone.body.remove();
  const cols = el('div', 'cols'), c1 = el('div'), c2 = el('div'), c3 = el('div');
  const eqc = el('canvas', 'eqc'); eqc.id = 'eqCurve'; eqc.width = 520; eqc.height = 140;
  c1.append(el('span', 'lb', 'EQ'), eqc,
    ctl('Low', () => t.eq.low, v => { t.eq.low = v; }, { min: -15, max: 15, step: .5, fmt: db, redraw: drawEq }),
    ctl('Mid', () => t.eq.mid, v => { t.eq.mid = v; }, { min: -15, max: 15, step: .5, fmt: db, redraw: drawEq }),
    ctl('Mid at', () => t.eq.midFreq, v => { t.eq.midFreq = Math.round(v); }, { min: 150, max: 6000, log: true, fmt: hzs, redraw: drawEq }),
    ctl('High', () => t.eq.high, v => { t.eq.high = v; }, { min: -15, max: 15, step: .5, fmt: db, redraw: drawEq }));
  c2.append(el('span', 'lb', 'Filter'),
    pick('Type', [['off', 'off'], ['lowpass', 'low-pass'], ['highpass', 'high-pass'], ['bandpass', 'band-pass']], () => t.filter.type, v => { t.filter.type = v; }, { redraw: drawEq }),
    ctl('Cutoff', () => t.filter.freq, v => { t.filter.freq = Math.round(v); }, { min: 40, max: 16000, log: true, fmt: hzs, redraw: drawEq }),
    ctl('Resonance', () => t.filter.q, v => { t.filter.q = v; }, { min: .1, max: 12, step: .1, fmt: v => v.toFixed(1), redraw: drawEq }));
  c3.append(el('span', 'lb', 'Chorus'),
    ctl('Amount', () => t.chorus.mix, v => { t.chorus.mix = v; }, { fmt: pct }),
    ctl('Speed', () => t.chorus.rate, v => { t.chorus.rate = v; }, { min: .1, max: 6, step: .05, fmt: v => `${v.toFixed(2)} Hz` }),
    ctl('Depth', () => t.chorus.depth, v => { t.chorus.depth = v; }, { min: 0, max: 10, step: .1, fmt: v => `${v.toFixed(1)} ms` }));
  cols.append(c1, c2, c3); tone.append(cols); mods.append(tone);
  drawEq();
}
// the envelope as a picture: attack, decay to the sustain level, the fall while held, the release after the key is let go
function drawEnv(cv, t) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, d = S.defaults(t.instrument), s = t.sound;
  const a = s.attack ?? d.env.a, dc = s.decay ?? d.env.d, su = s.sustain ?? d.env.s, fall = s.fall ?? d.env.sd, r = s.release ?? d.env.r;
  const span = v => 10 + 60 * Math.min(1, Math.log1p(v * 8) / Math.log1p(24));
  const top = 14, base = H - 22, y = v => base - v * (base - top);
  const xa = 10 + span(a), xd = xa + span(dc), xk = Math.max(xd + 60, W - 90), held = fall ? Math.max(0, su * Math.exp(-(xk - xd) / 60 / Math.max(.05, fall))) : su, xr = Math.min(W - 6, xk + span(r));
  x.fillStyle = '#F3F2EE'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#CBC7BF'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, base + .5); x.lineTo(W, base + .5); x.stroke();
  x.setLineDash([3, 3]); x.beginPath(); x.moveTo(xk + .5, 6); x.lineTo(xk + .5, base); x.stroke(); x.setLineDash([]);
  x.beginPath(); x.moveTo(10, base); x.lineTo(xa, y(1)); x.lineTo(xd, y(su));
  if (fall) x.quadraticCurveTo((xd + xk) / 2, y(su) + (y(held) - y(su)) * .2, xk, y(held)); else x.lineTo(xk, y(su));
  x.lineTo(xr, base);
  x.fillStyle = 'rgba(200,85,61,.12)'; x.fill(); x.strokeStyle = trackColor(st.sel); x.lineWidth = 2; x.stroke();
  x.font = '10px IBM Plex Mono, monospace'; x.fillStyle = '#4A4843'; x.textBaseline = 'alphabetic';
  x.fillText('A', 10, H - 6); x.fillText('D', xa + 2, H - 6); x.fillText(fall ? 'S · fall' : 'S', xd + 6, H - 6); x.fillText('R', xk + 4, H - 6); x.fillText('key up', xk + 4, 12);
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
  x.fillStyle = '#F3F2EE'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#DDDAD3'; x.lineWidth = 1;
  for (const d of [-12, 0, 12]) { const y = H / 2 - d / 30 * H; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  for (const f0 of [100, 1000, 10000]) { const X = W * Math.log(f0 / 30) / Math.log(16000 / 30); x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke(); }
  x.strokeStyle = trackColor(st.sel); x.lineWidth = 3; x.beginPath();
  for (let i = 0; i < n; i++) { const X = i / (n - 1) * W, Y = Math.min(H - 1, Math.max(1, H / 2 - tot[i] / 30 * H)); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
  x.stroke();
}

// ---------- the lanes: bar ruler with markers and the loop, every track's clips and notes, the whole song at once ----------
const A = { cv: $('#arr'), MK: 18, RULER: 44, TH: 56 };   // MK: the strip of section markers; RULER: where the lanes start; TH: a track's height (its header's)
// every note a track plays, its clips' too, kept until the song changes (the overview is drawn every frame while it plays)
const arrCache = { rev: -1, per: [] };
function arrNotes(i) {
  if (arrCache.rev !== st.rev) { arrCache.rev = st.rev; arrCache.per = []; }
  return arrCache.per[i] ??= S.notesOf(st.song, st.song.tracks[i]);
}
function drawArr() {
  if (!st.song || st.page !== 'arrange') return;
  const cv = A.cv, dpr = devicePixelRatio || 1, T = st.song.tracks, H = A.RULER + T.length * A.TH;
  const W = cv.parentElement.clientWidth; if (!W) return;
  cv.style.height = H + 'px';
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const E = end(), k = (W - 2) / E, bar = st.song.beatsPerBar * PPQ, lp = st.song.loop;
  x.fillStyle = '#F3F2EE'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ECEAE5'; x.fillRect(0, A.MK, W, A.RULER - A.MK);
  // the loop, on the ruler
  x.fillStyle = lp.on ? 'rgba(31,79,209,.14)' : 'rgba(28,28,26,.06)'; x.fillRect(lp.start * k, A.MK, (lp.end - lp.start) * k, A.RULER - A.MK);
  if (lp.on) { x.fillStyle = SEL; x.fillRect(lp.start * k, A.MK, 2, A.RULER - A.MK); x.fillRect(lp.end * k - 2, A.MK, 2, A.RULER - A.MK); }
  // the tracks' rows
  T.forEach((t, i) => { x.fillStyle = i === st.sel ? '#FBFAF7' : i % 2 ? '#EFEDE8' : '#F3F2EE'; x.fillRect(0, A.RULER + i * A.TH, W, A.TH); });
  // bars
  x.font = '500 10px IBM Plex Mono, monospace'; x.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(30 / (bar * k)));
  for (let b = 0; b <= st.song.bars; b++) {
    const X = Math.round(b * bar * k) + .5, big = b % every === 0;
    x.fillStyle = big ? '#D3CFC7' : '#E2DFD8'; x.fillRect(X, A.RULER, 1, H);
    x.fillStyle = big ? '#8A867E' : '#C4BFB6'; x.fillRect(X, big ? A.MK : A.RULER - 8, 1, big ? A.RULER - A.MK : 8);
    if (big && b < st.song.bars) { x.fillStyle = '#4A4843'; x.fillText(String(b + 1), X + 4, A.MK + 4); }
  }
  x.fillStyle = '#CBC7BF'; x.fillRect(0, A.MK, W, 1); x.fillRect(0, A.RULER - 1, W, 1);
  T.forEach((t, i) => {
    const y = A.RULER + i * A.TH;
    x.fillStyle = '#DDDAD3'; x.fillRect(0, y + A.TH - 1, W, 1);
    x.globalAlpha = t.mute ? .4 : 1;
    for (const c of t.clips || []) {   // a clip: a block in its beat's colour, its name, a mark where the beat comes round again
      if (!st.song.patterns || !st.song.patterns[c.p]) continue;
      const col = beatColor(c.p), on = st.open && st.open.p === c.p, X = c.at * k, cw = Math.max(3, c.len * k), y0 = y + 5, h = A.TH - 11;
      x.fillStyle = hexA(col, on ? .34 : .2); x.fillRect(X + .5, y0, cw - 1, h);
      x.fillStyle = hexA(col, .75); for (const r of B.repeatsOf(st.song, c)) for (let yy = y0 + 2; yy < y0 + h - 2; yy += 4) x.fillRect(r * k, yy, 1, 2);
      x.fillStyle = hexA(col, .9); x.fillRect(X + cw - 4, y0 + 8, 2, h - 16);   // (a grip at the end: that edge drags to loop)
      x.strokeStyle = st.cs.has(c) ? SEL : col; x.lineWidth = st.cs.has(c) ? 2 : 1; x.strokeRect(X + (st.cs.has(c) ? 1 : .5), y0 + (st.cs.has(c) ? .5 : 0), cw - (st.cs.has(c) ? 2 : 1), h); x.lineWidth = 1;
      if (cw > 30) { x.save(); x.beginPath(); x.rect(X + 4, y0, cw - 9, h); x.clip(); x.fillStyle = INK; x.font = '600 10.5px IBM Plex Sans, sans-serif'; x.fillText(st.song.patterns[c.p].name, X + 5, y0 + 3); x.restore(); }
    }
    x.fillStyle = trackColor(i);
    for (const [at, len, note] of arrNotes(i)) x.fillRect(at * k, y + 19 + (1 - note / 127) * (A.TH - 28), Math.max(1, len * k), 2.5);
    x.globalAlpha = 1;
  });
  if (arrDrop) { x.fillStyle = hexA(beatColor(arrDrop.p), .45); x.fillRect(arrDrop.at * k, A.RULER + arrDrop.i * A.TH + 5, Math.max(3, arrDrop.len * k), A.TH - 11); }
  // the part the note editor shows, the start mark, the markers, the playhead
  if (!st.open && R.w) { const vis = (R.w - R.KEYW) / st.view.zoom; x.fillStyle = SEL; x.fillRect(st.view.x * k, A.RULER - 4, Math.max(2, vis * k), 3); }
  x.fillStyle = INK; x.beginPath(); x.moveTo(st.start * k - 5, A.RULER - 10); x.lineTo(st.start * k + 5, A.RULER - 10); x.lineTo(st.start * k, A.RULER - 2); x.fill();
  x.font = '600 10.5px IBM Plex Sans, sans-serif'; x.textBaseline = 'middle';
  for (const m of st.song.markers || []) {
    if (m.at > E) continue;
    const X = m.at * k, w = x.measureText(m.name).width + 10;
    x.fillStyle = '#E2DFD8'; x.fillRect(X, 2, w, A.MK - 4); x.fillStyle = INK; x.fillRect(X, 2, 2, A.MK - 4); x.fillText(m.name, X + 6, A.MK / 2);
  }
  const p = S.playing && !st.beat ? S.position() : -1;   // (a beat playing on its own is not a place in the song)
  if (p >= 0) { x.fillStyle = REC; x.fillRect(p * k, A.MK, 1.5, H); x.fillRect(p * k - 4, A.MK, 9, 5); }
}
A.cv.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;   // (a right-click is for the menu, not for the start mark or a loop)
  audio();
  const r = A.cv.getBoundingClientRect(), k = (r.width - 2) / end(), bar = st.song.beatsPerBar * PPQ;
  const tickAt = ev => Math.max(0, Math.min(end(), (ev.clientX - r.left) / k));
  const y = e.clientY - r.top;
  if (y < A.MK) {   // a marker: click puts the start mark there
    const m = markerAt(e); if (m) { st.start = m.at; drawArr(); drawRoll(); showPos(); return; }
  }
  if (y < A.RULER) {   // click: the start mark; drag: the loop
    const t0 = tickAt(e); let moved = false; const before = snap();
    const mv = ev => { const t1 = tickAt(ev); if (Math.abs(t1 - t0) * k > 4) moved = true; if (!moved) return;
      const a = Math.floor(Math.min(t0, t1) / bar) * bar, b = Math.ceil(Math.max(t0, t1) / bar) * bar;
      st.song.loop = { on: true, start: a, end: Math.max(a + bar, b) }; syncTransport(); drawArr(); drawRoll(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { pushUndo(before); st.redo = []; changed(); } else { st.start = Math.floor(t0 / bar) * bar; drawArr(); drawRoll(); showPos(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    return;
  }
  const h = clipHit(e); st.focus = 'arr';
  if (h && h.c) { clipDrag(e, h, r, k); return; }
  const i = h ? h.i : -1;
  if (i >= 0 && i < st.song.tracks.length) {
    if (!e.shiftKey && st.cs.size) { st.cs.clear(); drawArr(); }
    selectTrack(i);
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
    const edge = Math.min(10, (x1 - x0) / 3);
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
  selectTrack(h.i);
  drawArr();
  const group = zone === 'body' ? [...st.cs].map(x => ({ c: x, t: st.song.tracks.find(t => (t.clips || []).includes(x)), at: x.at })) : [{ c, t: h.t, at: c.at }];
  const orig = { at: c.at, len: c.len, off: c.off };
  let moved = false, copied = false;
  const mv = ev => {
    const dx = (ev.clientX - r.left) / k - t0;
    if (!moved && Math.abs(dx) * k < 4) return;
    if (!moved) { moved = true; if (e.altKey && zone === 'body') { copied = true; for (const g of group) { const n = B.addClip(g.t, { at: g.c.at, p: g.c.p, len: g.c.len, off: g.c.off }); g.c = n; } st.cs = new Set(group.map(g => g.c)); } }
    const u0 = clipUnit(c, ev.shiftKey), u = zone !== 'body' && orig.len < u0 ? Math.min(st.grid, orig.len) : u0, E = end();   // (a clip shorter than the step moves its edges by the grid)
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
    if (copied && group.every(g => g.c.at === g.at)) {   // a copy dragged back to where it started: no copy
      for (const g of group) g.t.clips = g.t.clips.filter(x => x !== g.c);
      st.cs = new Set(); drawArr(); return;
    }
    const same = copied ? false : zone === 'body' ? group.every(g => g.c.at === g.at) : c.at === orig.at && c.len === orig.len && c.off === orig.off;
    if (same) { drawArr(); return; }   // nothing moved: no undo step
    for (const tr of st.song.tracks) B.sortClips(tr);
    pushUndo(before); st.redo = []; changed({ rebuild: true });
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
A.cv.addEventListener('pointermove', e => {
  if (e.buttons) return;
  const y = e.clientY - A.cv.getBoundingClientRect().top;
  if (y < A.MK) { A.cv.style.cursor = markerAt(e) ? 'pointer' : 'context-menu'; return; }
  if (y < A.RULER) { A.cv.style.cursor = 'col-resize'; return; }
  const h = clipHit(e); A.cv.style.cursor = h && h.c ? (h.zone === 'body' ? 'grab' : 'ew-resize') : 'pointer';
});
A.cv.addEventListener('dblclick', e => {   // a clip opens in the editor below
  const h = clipHit(e); if (!h || !h.c) return;
  selectTrack(h.i);
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
// a menu at the pointer (right-click): items { label, run, off, title }, null for a line between them
function showMenu(x, y, items) {
  document.querySelector('#ctx')?.remove();
  const m = el('div', 'menu ctx'); m.id = 'ctx'; m.style.cssText = `left:${x}px;top:${y}px;right:auto;min-width:230px`;
  for (const it of items) {
    if (!it) { m.append(el('hr')); continue; }
    const b = el('button'); b.textContent = it.label; b.disabled = !!it.off; if (it.title) b.title = it.title;
    b.onclick = () => { m.remove(); it.run(); }; m.append(b);
  }
  document.body.append(m);
  const rr = m.getBoundingClientRect(); if (rr.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - rr.height - 4) + 'px'; if (rr.right > innerWidth) m.style.left = Math.max(0, innerWidth - rr.width - 4) + 'px';
  const away = ev => { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', away, true); } };
  setTimeout(() => addEventListener('pointerdown', away, true));
}
// a section marker near the pointer (its flag and name), if any
function markerAt(ev) {
  const r = A.cv.getBoundingClientRect(), k = (r.width - 2) / end(), px = ev.clientX - r.left;
  const hit = (st.song.markers || []).filter(m => m.at <= end() && px >= m.at * k - 3 && px <= m.at * k + 12 + m.name.length * 6);
  return hit.sort((a, b) => Math.abs(px - a.at * k) - Math.abs(px - b.at * k))[0];   // (with names that overlap, the flag nearest the pointer)
}
// the markers: named places in the song (up to 64)
async function addMarker(at) {
  const list = st.song.markers || [];
  const v = await ask({ title: `A marker at bar ${at / barTicks() + 1}`, text: 'Its name (Intro, Chorus, Boss…):', input: `Section ${list.length + 1}`, buttons: [['Cancel', null], ['Add marker', true, 'dark']] });
  if (v === null) return;
  edit(() => { st.song.markers = list.filter(x => x.at !== at).concat({ at, name: v.slice(0, 24) || 'Marker' }).sort((a, b) => a.at - b.at).slice(0, 64); }, { rebuild: true });
}
async function renameMarker(m) {
  const v = await ask({ title: 'Rename the marker', input: m.name, buttons: [['Cancel', null], ['Rename', true, 'dark']] });
  if (v) edit(() => { m.name = v.slice(0, 24); }, { rebuild: true });
}
function loopSection(m) { const list = st.song.markers || [], next = list.find(x => x.at > m.at); edit(() => { st.song.loop = { on: true, start: m.at, end: next ? Math.min(next.at, end()) : end() }; }, { rebuild: true }); }
function deleteMarker(m) { edit(() => { st.song.markers = st.song.markers.filter(x => x !== m); if (!st.song.markers.length) delete st.song.markers; }, { rebuild: true }); }
A.cv.addEventListener('contextmenu', e => {
  const r = A.cv.getBoundingClientRect();
  if (e.clientY - r.top < A.RULER) {   // the ruler: section markers
    e.preventDefault();
    const k = (r.width - 2) / end(), bar = barTicks(), at = Math.max(0, Math.min(end() - bar, Math.floor((e.clientX - r.left) / k / bar) * bar)), m = markerAt(e);
    showMenu(e.clientX, e.clientY, [
      { label: `Add a marker at bar ${at / bar + 1}…`, off: (st.song.markers || []).length >= 64, run: () => addMarker(at) },
      ...(m ? [
        { label: `Rename “${m.name}”…`, run: () => renameMarker(m) },
        { label: 'Loop this section', title: 'Loop from this marker to the next one (or the song\'s end)', run: () => loopSection(m) },
        { label: 'Delete the marker', run: () => deleteMarker(m) }] : [])
    ]);
    return;
  }
  const h = clipHit(e); if (!h) return;
  e.preventDefault(); st.focus = 'arr';
  if (!h.c) { selectTrack(h.i); return trackMenu(e.clientX, e.clientY); }
  if (!st.cs.has(h.c)) { st.cs = new Set([h.c]); drawArr(); }
  const c = h.c, P = st.song.patterns[c.p], n = B.usesOf(st.song, c.p).length, here = [...st.cs];
  showMenu(e.clientX, e.clientY, [
    { label: 'Open the beat', run: () => { selectTrack(h.i); openBeat(c.p); } },
    { label: 'Rename the beat…', run: () => renameBeat(c.p) },
    null,
    { label: 'Split here (Ctrl+E)', run: splitClips },
    { label: 'Duplicate (Ctrl+D)', run: dupClips },
    { label: 'Loop to the end of the song', run: () => edit(() => { for (const x of here) x.len = Math.max(1, end() - x.at); }, { rebuild: true }) },
    null,
    { label: n > 1 ? `Make unique (a copy of the beat; ${n - 1} other clip${n > 2 ? 's stay' : ' stays'} linked)` : 'Make unique (a copy of the beat)', title: 'Edit this clip\'s beat without changing the others', run: () => { let id; const was = c.p; edit(() => { id = B.makeUnique(st.song, was, here.filter(x => x.p === was)); }, { rebuild: true }); if (st.open && st.open.p === was) openBeat(id); } },
    { label: 'Select every clip of this beat', run: () => { st.cs = new Set(st.song.tracks.flatMap(t => (t.clips || []).filter(x => x.p === c.p))); drawArr(); } },
    { label: 'Turn into notes (no longer linked)', run: () => edit(() => { for (const x of here) { const t = st.song.tracks.find(t => (t.clips || []).includes(x)); B.flattenClip(S, st.song, t, x); } st.cs.clear(); }, { rebuild: true }) },
    null,
    { label: here.length > 1 ? `Delete ${here.length} clips` : 'Delete the clip', run: deleteClips }
  ]);
});
async function renameBeat(id) {
  const P = st.song.patterns[id]; if (!P) return;
  const v = await ask({ title: 'Rename the beat', input: P.name, buttons: [['Cancel', null], ['Rename', true, 'dark']] });
  if (v && v !== P.name) edit(() => { P.name = v.slice(0, 40); }, { rebuild: true });
}
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

// ---------- the note editor (docked under the tracks): the piano roll ----------
const R = { cv: $('#roll'), KEYW: 48, RULER: 20, VEL: 64, RH: 12, w: 0, h: 0 };
const rows = () => Math.floor((R.h - R.RULER - R.VEL) / R.RH);
const xOf = t => R.KEYW + (t - st.view.x) * st.view.zoom, tOf = x => st.view.x + (x - R.KEYW) / st.view.zoom;
const yOf = n => R.RULER + (st.view.top - n) * R.RH, nOf = y => st.view.top - Math.floor((y - R.RULER) / R.RH);
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], 'minor pentatonic': [0, 3, 5, 7, 10], 'major pentatonic': [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10] };
const CHORDS = { maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], pow: [0, 7], oct: [0, 12] };
// the scale shaded in the roll: a pitch class is in it (or no scale is chosen)
function inScale(n) { if (!st.scale) return true; const [root, mode] = st.scale.split(':'); return SCALES[mode].includes((n - +root + 120) % 12); }
function sizeRoll() {
  const dpr = devicePixelRatio || 1, wrap = R.cv.parentElement;
  R.w = wrap.clientWidth; R.h = Math.max(150, wrap.clientHeight);
  R.cv.width = Math.round(R.w * dpr); R.cv.height = Math.round(R.h * dpr); R.cv.style.width = R.w + 'px'; R.cv.style.height = R.h + 'px';
}
function drawRoll() {
  if (!st.song || st.page !== 'arrange' || !R.w) return;
  const x = R.cv.getContext('2d'), dpr = devicePixelRatio || 1, t = target(); if (!t) return;
  $('#beatFromSel').disabled = !!st.open || !st.picked.size;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = R.w, H = R.h, gB = H - R.VEL, kit = kitTrack(t), kitNames = kit ? kitNamesOf(t) : null, bar = st.song.beatsPerBar * PPQ, E = rollEnd();
  st.view.top = Math.max(rows() - 1, Math.min(127, st.view.top));
  x.fillStyle = '#FBFAF7'; x.fillRect(0, 0, W, H);
  // rows: black keys darker; with a scale, the notes outside it darker still
  const root = st.scale ? +st.scale.split(':')[0] : -1;
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n);
    x.fillStyle = kit ? (kitNames.has(n) ? '#FBFAF7' : '#EFEDE8') : st.scale ? (!inScale(n) ? '#E9E7E2' : n % 12 === root ? '#F5F0E4' : '#FBFAF7') : isBlack(n) ? '#F0EEE9' : '#FBFAF7';
    x.fillRect(R.KEYW, y, W - R.KEYW, R.RH);
    x.fillStyle = n % 12 === 0 && !kit ? '#DDDAD3' : '#ECEAE5'; x.fillRect(R.KEYW, y + R.RH - 1, W - R.KEYW, 1);
  }
  // grid lines: the grid, beats, bars
  const t0 = Math.max(0, Math.floor(st.view.x / st.grid) * st.grid), t1 = tOf(W);
  for (let g = t0; g <= t1; g += st.grid) {
    const X = Math.round(xOf(g)) + .5; if (X < R.KEYW) continue;
    const isBar = g % bar === 0, isBeat = g % PPQ === 0;
    if (!isBar && !isBeat && st.grid * st.view.zoom < 5) continue;
    x.fillStyle = isBar ? '#A9A499' : isBeat ? '#D3CFC7' : '#E8E5DF'; x.fillRect(X, R.RULER, 1, gB - R.RULER);
  }
  // beyond the song's end (or the beat's)
  const xe = xOf(E); if (xe < W) { x.fillStyle = 'rgba(28,28,26,.08)'; x.fillRect(Math.max(R.KEYW, xe), R.RULER, W, gB - R.RULER); }
  // ruler: bars, the loop, the start mark
  x.fillStyle = '#ECEAE5'; x.fillRect(R.KEYW, 0, W, R.RULER); x.fillStyle = '#CBC7BF'; x.fillRect(R.KEYW, R.RULER - 1, W, 1);
  const lp = st.open ? { on: false, start: 0, end: 0 } : st.song.loop;   // (a beat has no loop region or start mark of the song's)
  if (lp.end > lp.start) { const a = Math.max(R.KEYW, xOf(lp.start)); x.fillStyle = lp.on ? 'rgba(31,79,209,.14)' : 'rgba(28,28,26,.06)'; x.fillRect(a, 0, Math.max(0, xOf(lp.end) - a), R.RULER - 1); }
  x.font = '500 10px IBM Plex Mono, monospace'; x.textBaseline = 'middle'; x.fillStyle = '#4A4843';
  for (let b = Math.floor(st.view.x / bar); b * bar <= t1; b++) { const X = xOf(b * bar); if (X >= R.KEYW) { x.fillRect(X, 0, 1, R.RULER); x.fillText(String(b + 1), X + 4, R.RULER / 2); } }
  if (!st.open && xOf(st.start) >= R.KEYW) { const X = xOf(st.start); x.fillStyle = INK; x.beginPath(); x.moveTo(X - 5, 2); x.lineTo(X + 5, 2); x.lineTo(X, 10); x.fill(); }
  // other tracks, faint, to compose against
  if (st.ghost) st.song.tracks.forEach((o, i) => {
    if (st.open || i === st.sel || kitTrack(o) || kit) return;
    x.strokeStyle = hexA(trackColor(i), .45); x.lineWidth = 1;
    for (const [at, len, n] of arrNotes(i)) { const X = xOf(at); if (X > W || X + len * st.view.zoom < R.KEYW) continue; x.strokeRect(Math.max(R.KEYW, X) + .5, yOf(n) + 1.5, Math.max(2, len * st.view.zoom - 1), R.RH - 3); }
  });
  // the track's notes
  const col = trackColor(st.sel), dark = shade(col, .68);
  const drawNote = (n, fill, stroke) => {
    const [at, len, p, v] = n, X = xOf(at), Y = yOf(p), w = Math.max(3, len * st.view.zoom - 1);
    if (X > W || X + w < R.KEYW || Y < R.RULER - R.RH || Y > gB) return;
    x.globalAlpha = .55 + .45 * v / 127; x.fillStyle = fill; x.fillRect(X, Y + .5, w, R.RH - 1); x.globalAlpha = 1;
    x.strokeStyle = stroke; x.lineWidth = 1; x.strokeRect(X + .5, Y + 1, w - 1, R.RH - 2);
  };
  for (const n of t.notes) drawNote(n, st.picked.has(n) ? '#5B86D6' : col, st.picked.has(n) ? SEL : dark);
  if (st.rec && st.rec.track === st.sel) for (const n of st.rec.notes) drawNote([n.at, (n.len ?? Math.max(1, recTick() - n.at)), n.note, n.vel], REC, '#A8380B');
  if (drag && drag.mode === 'box') { x.strokeStyle = SEL; x.fillStyle = 'rgba(31,79,209,.06)'; x.setLineDash([4, 3]); x.fillRect(drag.bx, drag.by, drag.bw, drag.bh); x.strokeRect(drag.bx + .5, drag.by + .5, drag.bw, drag.bh); x.setLineDash([]); }
  // the lane: velocity, or an automation line
  x.fillStyle = '#F3F2EE'; x.fillRect(R.KEYW, gB, W, R.VEL); x.fillStyle = '#A9A499'; x.fillRect(R.KEYW, gB, W, 1);
  if (st.lane === 'vel') for (const n of t.notes) {
    const X = xOf(n[0]); if (X < R.KEYW || X > W) continue;
    const h = (R.VEL - 10) * n[3] / 127, c2 = st.picked.has(n) ? SEL : dark;
    x.fillStyle = c2; x.fillRect(X, H - 4 - h, 2, h); x.beginPath(); x.arc(X + 1, H - 4 - h, 3, 0, 7); x.fill();
  }
  else drawLane(x, W, gB, col);
  // keyboard
  for (let n = st.view.top; n > st.view.top - rows() - 1 && n >= 0; n--) {
    const y = yOf(n), black = !kit && isBlack(n);
    x.fillStyle = '#FBFAF7'; x.fillRect(0, y, R.KEYW - 1, R.RH);
    if (black) { x.fillStyle = '#3A3936'; x.fillRect(0, y, R.KEYW * .62, R.RH); }
    x.fillStyle = '#D6D2CA'; x.fillRect(0, y + R.RH - 1, R.KEYW - 1, 1);
    const held = [...st.live.values()].some(l => l.note === n) || (drag && drag.audition === n);
    if (held) { x.fillStyle = '#E8B04A'; x.fillRect(0, y, R.KEYW - 1, R.RH); }
    const label = kit ? (kitNames.get(n) || '') : n % 12 === 0 ? noteName(n) : '';
    if (label) { x.fillStyle = INK; x.font = `500 ${kit ? 9 : 8.5}px IBM Plex ${kit ? 'Sans' : 'Mono'}, sans-serif`; x.textBaseline = 'middle'; x.textAlign = kit ? 'left' : 'right'; x.fillText(kit ? label.slice(0, 9) : label, kit ? 3 : R.KEYW - 4, y + R.RH / 2); x.textAlign = 'left'; }
  }
  x.fillStyle = '#A9A499'; x.fillRect(R.KEYW - 1, 0, 1, H);
  x.fillStyle = '#ECEAE5'; x.fillRect(0, 0, R.KEYW - 1, R.RULER); x.fillRect(0, gB, R.KEYW - 1, R.VEL);
  x.fillStyle = '#5F5C56'; x.font = '500 9px IBM Plex Sans, sans-serif'; x.textBaseline = 'top';
  x.fillText((LANE_NAMES[st.lane] || '').toUpperCase().slice(0, 8), 4, gB + 6);
  // playhead
  const p = st.open ? (st.beat && S.playing ? S.position() : -1) : S.playing ? recTick() : -1;
  if (p >= 0 && xOf(p) >= R.KEYW) { x.fillStyle = REC; x.fillRect(xOf(p), 0, 1.5, gB); }
}
// a darker shade of a colour (the edge of a note)
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; };
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
    const at = Math.max(0, Math.floor(tick / st.grid) * st.grid), len = kitTrack(t) ? st.grid : st.len;
    // the chord stamp: the note clicked and the rest of the chord on top of it
    const steps = !kitTrack(t) && st.chord ? CHORDS[st.chord] : [0];
    const add = steps.map(s => pitch + s).filter(p => p <= 127).map(p => [at, len, p, 100]);
    pushUndo(snap()); st.redo = []; t.notes.push(...add); t.notes.sort((a, b) => a[0] - b[0]);
    st.picked = new Set(add);
    drag = { mode: 'resize', created: true, changed: true, t0: tick, orig: new Map(add.map(n => [n, [...n]])), audition: pitch, v: S.noteOn(st.sel, pitch, 100) };
    drag.chordV = add.slice(1).map(n => S.noteOn(st.sel, n[2], 90));
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
    const starts = [...drag.orig.values()].map(o => o[0]), minAt = Math.min(...starts), dtc = Math.max(-minAt, Math.min(lastStart() - Math.max(...starts), dt));
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
const LANE_NAMES = { vel: 'Velocity', volume: 'Volume', pan: 'Pan', filter: 'Filter', pitch: 'Bend', echo: 'Echo', reverb: 'Reverb', loop: 'Loop', tempo: 'Tempo', mecho: 'Echo lvl', mfeedback: 'Feedback' };
// the first sample a track plays that loops (a multisample: its first zone that does)
const ownSample = t => t && t.instrument.startsWith('sample:') ? st.song.samples[t.instrument.slice(7)]
  : t && t.instrument.startsWith('multi:') ? (st.song.multis?.[t.instrument.slice(6)]?.zones || []).map(z => st.song.samples[z.sample]).find(sm => sm && sm.loop >= 0) || null : null;
const HINTS = {
  vel: 'Click: a note · drag: move it, its end: length · Shift-drag: select · right-click: delete · the lane below: velocity',
  line: 'Click the lane: a point · drag it · right-click: delete · Shift-drag a stretch of the line: bend it (Shift-click a point: straight again)',
  tempo: 'Click the lane: a tempo change · drag it · right-click: delete · Shift-click a point: glide to it (a ramp) instead of jumping',
  loop: 'Where along the sample a note\'s loop starts, taken when the note starts (the sample must loop) · click: a point · right-click: delete'
};
const showHint = () => { $('#hint').textContent = st.lane === 'vel' ? HINTS.vel : st.lane === 'tempo' ? HINTS.tempo : st.lane === 'loop' ? HINTS.loop : HINTS.line; };
const laneY = (L, v, gB) => gB + 5 + (1 - (v - L.lo) / (L.hi - L.lo)) * (R.VEL - 10);
const laneV = (L, py, gB) => { const v = L.lo + (1 - (py - gB - 5) / (R.VEL - 10)) * (L.hi - L.lo), d = L.step ? 1 : L.places ? 10 : 100; return Math.max(L.lo, Math.min(L.hi, Math.round(v * d) / d)); };
const laneVal = (L, k) => L.step ? S.bpmAt(st.song, k) : S.laneAt(L.pts(), k) ?? L.rest();
function drawLane(x, W, gB, col) {
  const L = LANES[st.lane], pts = L.pts(), y = v => laneY(L, v, gB), off = L.sample && !ownSample(track());
  x.strokeStyle = pts.length ? col : '#8A867E'; x.lineWidth = 2; x.setLineDash(pts.length ? [] : [4, 4]); x.beginPath();
  for (let X = R.KEYW; X <= W + 2; X += 2) { const Y = y(laneVal(L, tOf(X))); X === R.KEYW ? x.moveTo(X, Y) : x.lineTo(X, Y); }
  x.stroke(); x.setLineDash([]);
  for (const p of pts) {
    const X = xOf(p[0]); if (X < R.KEYW - 4 || X > W) continue;
    x.fillStyle = drag && drag.pt === p ? SEL : p[2] ? (L.step ? '#8A5A9E' : '#B8862B') : '#FFFFFF'; x.strokeStyle = drag && drag.pt === p ? SEL : shade(col, .68); x.lineWidth = 1.5;
    x.fillRect(X - 3.5, y(p[1]) - 3.5, 7, 7); x.strokeRect(X - 3.5, y(p[1]) - 3.5, 7, 7);
  }
  x.font = '500 10px IBM Plex Mono, monospace'; x.textBaseline = 'top';
  const label = drag && drag.mode === 'lane' ? L.fmt(drag.pt[1]) : drag && drag.mode === 'curve' ? `bend ${Math.round((drag.pt[2] || 0) * 100)}%` : off ? 'the track must play a sample that loops' : pts.length ? '' : `${L.fmt(L.rest())} all along: click to add a point`;
  if (label) { const w = x.measureText(label).width + 10; x.fillStyle = drag ? INK : 'rgba(243,242,238,.9)'; x.fillRect(R.KEYW + 6, gB + 4, w, 15); x.fillStyle = drag ? '#FFFFFF' : '#4A4843'; x.fillText(label, R.KEYW + 11, gB + 6); }
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
  const t = target(), v = Math.max(1, Math.min(127, Math.round((R.h - 4 - py) / (R.VEL - 10) * 127)));
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
  for (const v of d.chordV || []) S.noteOff(v);
  if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'vel' || d.mode === 'lane' || d.mode === 'curve') {
    if (d.changed) { if (d.before) { pushUndo(d.before); st.redo = []; } if (d.mode === 'resize') st.len = [...d.orig.keys()][0]?.[1] || st.len; changed(); }
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
// the last tick a note may start on in what is being edited: the beat's end, or no end (a beat's notes never go past it, so a move that would take one is not made)
const lastStart = () => (st.open && pattern() ? pattern().len - 1 : Infinity);
function moveSel(dt, dp) {
  const P = picked(); if (!P.length) return;
  if (dt < 0 && Math.min(...P.map(n => n[0])) + dt < 0) return;
  if (dt > 0 && Math.max(...P.map(n => n[0])) + dt > lastStart()) return;
  edit(() => { for (const n of P) { n[0] += dt; n[2] = Math.max(0, Math.min(127, n[2] + dp)); } });
  if (dp && P.length === 1) { const v = S.noteOn(st.sel, P[0][2], P[0][3]); setTimeout(() => S.noteOff(v), 180); }
}
function copySel() { const P = picked(); if (!P.length) return; const a = Math.min(...P.map(n => n[0])); st.clip = P.map(([at, l, p, v]) => [at - a, l, p, v]); }
function pasteAt(at) {
  if (!st.clip) return;
  const t = target(), add = st.clip.map(([o, l, p, v]) => [at + o, l, p, v]).filter(n => n[0] <= lastStart());   // (not past the end of an open beat)
  if (!add.length) return showSaved('no room for it there: the beat ends first');
  edit(() => { t.notes.push(...add); st.picked = new Set(add); });
}
function duplicateSel() {
  const P = picked(); if (!P.length) return;
  const a = Math.min(...P.map(n => n[0])), b = Math.max(...P.map(n => n[0] + n[1])), span = Math.ceil((b - a) / st.grid) * st.grid;
  copySel(); pasteAt(a + span);
}
function quantizeSel() { const P = picked(); if (!P.length) return; edit(() => { for (const n of P) { n[0] = Math.min(snapAt(n[0]), Math.floor(lastStart() / st.grid) * st.grid); n[1] = Math.max(st.grid, snapAt(n[1])); } }); }
function deleteSel() { const P = picked(); if (!P.length) return; const t = target(); edit(() => { t.notes = t.notes.filter(n => !st.picked.has(n)); st.picked.clear(); }); }
// loosen the selected notes a little, as a person would play them: up to 6 ticks either way and 10 of velocity
function humanizeSel() {
  const P = picked(); if (!P.length) return showSaved('select some notes to humanize');
  const r = k => Math.round((Math.random() * 2 - 1) * k);
  edit(() => { for (const n of P) { n[0] = Math.max(0, Math.min(lastStart(), n[0] + r(6))); n[3] = Math.max(1, Math.min(127, n[3] + r(10))); } });
}
// each selected note lasts until the next selected one starts (the last keeps its length)
function legatoSel() {
  const P = picked(); if (P.length < 2) return showSaved('select two notes or more for legato');
  const starts = [...new Set(P.map(n => n[0]))].sort((a, b) => a - b);
  edit(() => { for (const n of P) { const nx = starts.find(s => s > n[0]); if (nx !== undefined) n[1] = nx - n[0]; } });
}

// ---------- beats: the list, the beat's bar and the step grid ----------
let markedStep = -1;
const barTicks = () => st.song.beatsPerBar * PPQ;
const fmtBars = ticks => String(+(ticks / barTicks()).toFixed(2));
function openBeat(id, view) {
  if (!st.song.patterns || !st.song.patterns[id]) return;
  if (st.beat) stopAll();
  if (st.page !== 'arrange') showView('arrange');
  st.open = { p: id }; st.openView = view || (kitTrack(track()) ? 'grid' : 'roll'); st.picked.clear();
  st.view.x = 0;   // (a beat is shown from its own start, wherever the song's view was)
  renderBeats(); renderPat(); renderDock(); drawArr(); sizeRoll(); drawRoll();
}
function closeBeat() {
  if (!st.open) return;
  if (st.beat) stopAll();
  st.open = null; st.picked.clear();
  renderBeats(); renderPat(); renderDock(); focusTrack(); drawArr(); sizeRoll(); drawRoll();
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
  if (!list.length) { ul.innerHTML = '<li class="empty">No beats yet. A beat is a pattern you make once and play wherever you like: + New beat makes one in the selected track.</li>'; return; }
  ul.innerHTML = list.map(([id, P]) => {
    const n = B.usesOf(st.song, id).length;
    return `<li class="beat${st.open && st.open.p === id ? ' on' : ''}" data-id="${esc(id)}" style="--c:${beatColor(id)}">
      <button class="bopen" title="Click: open it to edit · drag it onto a track: a clip of it there"><i></i><span>${esc(P.name)}</span></button>
      <span class="mono">${fmtBars(P.len)} bar${P.len === barTicks() ? '' : 's'}</span>
      <span class="mono" title="${n ? `played by ${n} clip${n > 1 ? 's' : ''}` : 'no clip plays it'}">×${n}</span>
      <button class="bdel" title="${n ? 'A clip plays it: delete the clips first' : 'Delete the beat'}" aria-label="Delete the beat" ${n ? 'disabled' : ''}><svg width="10" height="10"><use href="#i-x"/></svg></button></li>`;
  }).join('');
  ul.querySelectorAll('.beat').forEach(li => {
    const id = li.dataset.id; li.draggable = true;
    li.addEventListener('dragstart', e => { dragBeat = id; e.dataTransfer.setData('text/x-pixelite-beat', id); e.dataTransfer.effectAllowed = 'copy'; });
    li.addEventListener('dragend', () => { dragBeat = null; if (arrDrop) { arrDrop = null; drawArr(); } });
    li.addEventListener('contextmenu', e => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Open the beat', run: () => openBeat(id) }, { label: 'Rename…', run: () => renameBeat(id) }, { label: 'Select every clip of it', run: () => { st.cs = new Set(st.song.tracks.flatMap(t => (t.clips || []).filter(x => x.p === id))); st.focus = 'arr'; drawArr(); } }]); });
    li.querySelector('.bopen').onclick = () => (st.open && st.open.p === id ? closeBeat() : openBeat(id));
    li.querySelector('.bdel').onclick = () => { if (st.open && st.open.p === id) closeBeat(); edit(() => B.removeBeat(st.song, id), { rebuild: true }); };
  });
}
function renderMarkers() {
  const ul = $('#markerList'), list = st.song.markers || [];
  $('#addMarker').disabled = list.length >= 64;
  if (!list.length) { ul.innerHTML = '<li class="empty">No markers yet. A marker names a place in the song (Intro, Chorus, Boss): add one here or right-click the ruler.</li>'; return; }
  ul.innerHTML = list.map((m, i) => `<li class="mk" data-i="${i}"><i class="flag"></i><span class="at">bar ${Math.floor(m.at / barTicks()) + 1}</span>
    <button class="nm" title="Put the start mark here">${esc(m.name)}</button>
    <button class="b s" data-a="loop" title="Loop from here to the next marker">Loop</button><button class="bdel" data-a="more" title="Rename or delete" aria-label="More">⋯</button></li>`).join('');
  ul.querySelectorAll('.mk').forEach(li => {
    const m = list[+li.dataset.i];
    li.querySelector('.nm').onclick = () => { st.start = m.at; drawArr(); drawRoll(); showPos(); };
    li.querySelector('[data-a="loop"]').onclick = () => loopSection(m);
    li.querySelector('[data-a="more"]').onclick = e => showMenu(e.clientX, e.clientY, [{ label: 'Rename…', run: () => renameMarker(m) }, { label: 'Delete the marker', run: () => deleteMarker(m) }]);
  });
}
// the editor's own bar: what it edits, and how
function renderDock() {
  const t = track(); if (!t) return;
  $('#dockChip').style.background = trackColor(st.sel); $('#dockName').textContent = t.name;
  const P = pattern();
  $('#dockCtx').textContent = P ? `beat “${P.name}”` : kitTrack(t) ? 'drum notes' : `${insName(t.instrument) || ''} · loose notes`;
  $('#chord').disabled = kitTrack(t); $('#scale').disabled = kitTrack(t);
  $('#inTrack').textContent = t.name;
}
function renderPat() {
  if (st.page !== 'arrange') return;   // (the other views have the editor's place)
  const bar = $('#patBar'), P = pattern();
  if (!P) { st.open = null; bar.hidden = true; $('#beatGrid').hidden = true; $('.rollWrap').hidden = false; return; }
  const drums = kitTrack(track()), grid = drums && st.openView === 'grid';
  bar.hidden = false; $('#beatGrid').hidden = !grid; $('.rollWrap').hidden = grid;
  const n = B.usesOf(st.song, st.open.p).length;
  bar.innerHTML = `<span class="chip" style="width:12px;height:12px;border-radius:2px;background:${beatColor(st.open.p)}"></span>
    <label><span class="lb">Beat</span><input class="pname" value="${esc(P.name)}" maxlength="40" spellcheck="false" aria-label="Beat name"></label>
    <label title="Length in bars (a quarter of a bar to 64)"><span class="lb">Bars</span><input type="number" class="plen" min=".25" max="64" step=".25" value="${fmtBars(P.len)}"></label>
    <label title="Shuffle: every other 16th note comes later"><span class="lb">Swing</span><input type="range" class="pswing" min="0" max=".75" step=".05" value="${P.swing || 0}"><output class="mono">${Math.round((P.swing || 0) * 100)}%</output></label>
    <label title="The beat's colour (its clips are drawn in it)"><span class="lb">Colour</span><input type="color" class="pcolor" value="${beatColor(st.open.p)}"></label>
    ${drums ? `<label><span class="lb">Step</span><select class="pstep"><option value="48">1/8</option><option value="24">1/16</option><option value="12">1/32</option></select></label>
      <span class="seg"><button class="b${grid ? ' on' : ''}" data-v="grid" aria-pressed="${grid}">Steps</button><button class="b${grid ? '' : ' on'}" data-v="roll" aria-pressed="${!grid}">Notes</button></span>` : ''}
    <button class="b s${S.playing && st.beat ? ' on' : ''}" id="patPlay" title="Play just this beat, looped (Space)"><svg width="9" height="9"><use href="#i-play"/></svg>Play beat alone</button>
    <span class="muted small" id="patUse">${n ? `linked in ${n} clip${n > 1 ? 's' : ''}: a change is heard in all of them` : 'no clip plays it yet'}</span>
    <span class="grow"></span><button class="b s" id="patClose" title="Close the beat (Esc)">Close beat</button>`;
  const q = sel => bar.querySelector(sel);
  // (a field that re-draws the bar loses focus and may say 'change' once more: the same value is no new edit)
  q('.pname').onchange = e => { const v = e.target.value.slice(0, 40) || 'Beat'; if (v !== P.name) edit(() => { P.name = v; }, { rebuild: true }); };
  q('.plen').onchange = e => { const len = Math.max(24, Math.round(+e.target.value * barTicks())); if (len !== P.len) { if (st.beat) stopAll(); edit(() => B.setLength(P, len), { rebuild: true }); } };
  q('.pswing').oninput = e => { tweak(() => { if (+e.target.value > 0) P.swing = +e.target.value; else delete P.swing; }); q('.pswing + output').textContent = `${Math.round(+e.target.value * 100)}%`; };
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
    bars: { value: Math.max(1, Math.ceil(P.len / barTicks())) }, loop: { value: { on: true, start: 0, end: P.len } }, tempo: { value: [] }, auto: { value: { echo: [], feedback: [] } },   // (the song's own tempo changes and lanes are for the song, not for a beat)
    tracks: { value: st.song.tracks.map(o => Object.create(o, { notes: { value: [] }, clips: { value: o === t ? [{ at: 0, p: st.open.p, len: P.len, off: 0 }] : [] }, mute: { value: false }, solo: { value: false }, auto: { value: { volume: [], pan: [], filter: [] } } })) }
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
  let h = `<div class="gtop"><span class="lb">Sound</span>${Array.from({ length: steps }, (_, i) => `<i class="gn${i % perBar === 0 ? ' bar' : ''}">${i % perBeat === 0 ? Math.floor(i / perBeat) % st.song.beatsPerBar + 1 : '·'}</i>`).join('')}<span class="lb" style="padding-left:8px">Fill</span></div>`;
  for (const r of rows) {
    h += `<div class="grow" data-note="${r.note}"><span class="gname"><button class="gplay" title="Hear it (note ${r.note})">${esc(r.name)}</button></span>`;
    for (let i = 0; i < steps; i++) {
      const v = B.stepVel(P, r.note, i, step);
      h += `<i class="gc${i % perBeat === 0 ? ' q' : ''}${i % perBar === 0 && i ? ' bar' : ''}${v ? ` on a${B.accentOf(v)}` : ''}" data-s="${i}" data-n="${r.note}"></i>`;
    }
    h += `<select class="gfill" title="Fill the row" aria-label="Fill the row"><option value="">fill…</option><option value="1">every step</option><option value="2">every 2nd</option><option value="4">every 4th</option><option value="8">every 8th</option><option value="0">clear</option></select></div>`;
  }
  box.innerHTML = h + `<p class="muted goff">${off ? `${off} note${off > 1 ? 's are' : ' is'} off the grid (between steps, or a sound with no row): they stay, see Notes. ` : ''}Click: a hit (Shift-click: soft, medium, hard) · drag: paint or erase a run · Space: play the beat alone.</p>`;
  box.querySelectorAll('.grow').forEach(row => {
    const note = +row.dataset.note;
    row.querySelector('.gplay').onpointerdown = () => { audio(); const v = S.noteOn(st.sel, note, 100); if (v) setTimeout(() => S.noteOff(v), 400); };
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
  const at = x => ({ note: +x.dataset.n, i: +x.dataset.s });
  const first = at(c), had = B.stepVel(P, first.note, first.i, step);
  const mode = e.shiftKey ? 'accent' : had ? 'erase' : 'paint';
  const done = new Set();
  const apply = x => {
    const { note, i } = at(x), key = note + ':' + i; if (done.has(key)) return; done.add(key);
    const v = B.stepVel(P, note, i, step);
    const to = mode === 'erase' ? 0 : mode === 'accent' ? B.nextAccent(v) : v || 100;
    if (to === v) return;
    tweak(() => B.setStep(P, note, i, to, step));
    x.classList.remove('on', 'a0', 'a1', 'a2'); if (to) x.classList.add('on', `a${B.accentOf(to)}`);
    if (to && !S.playing) { const vv = S.noteOn(st.sel, note, to); if (vv) setTimeout(() => S.noteOff(vv), 200); }   // hear what was put there
  };
  apply(c);
  const mv = ev => { const x = document.elementFromPoint(ev.clientX, ev.clientY); if (x && x.classList.contains('gc') && mode !== 'accent') apply(x); };
  const up = () => { box.removeEventListener('pointermove', mv); removeEventListener('pointerup', up); settle(); renderBeats(); };
  box.addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// ---------- transport ----------
const latencyTicks = () => (S.ctx ? (S.ctx.outputLatency || S.ctx.baseLatency || 0) : 0) * st.song.bpm / 60 * PPQ;
// the tick being heard (what a player hears, so a recorded note lands where it was played)
const recTick = () => S.playing ? S.position() - latencyTicks() : st.start;
function setPlaying(on) {
  $('#playBtn').classList.toggle('on', on); $('#playBtn').innerHTML = `<svg width="14" height="14"><use href="#i-${on ? 'pause' : 'play'}"/></svg>`;
  $('#playBtn').setAttribute('aria-label', on ? 'Stop' : 'Play');
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
  pushUndo(R0.before); st.redo = [];
  st.song.tracks[R0.track].notes.push(...notes); st.picked = new Set(notes);
  changed();
}
function showPos() {
  const p = Math.max(0, S.playing ? recTick() : st.start), bar = st.song.beatsPerBar * PPQ;
  const b = Math.floor(p / bar), beat = Math.floor((p % bar) / PPQ), tk = Math.floor(p % PPQ);
  $('#pos').textContent = S.playing && S.position() < 0 ? 'count-in' : `${b + 1}.${beat + 1}.${String(tk).padStart(2, '0')}`;
}
// the voices sounding now, out of the console's 8: the SNES limit made visible (more than 8 would be cut on the console)
const voiceBars = $('#voiceBars'); voiceBars.innerHTML = '<i></i>'.repeat(8);
let lastVoices = -1;
function showVoices() {
  const now = S.ctx ? S.ctx.currentTime : 0, n = S.mix ? S.mix.voices.filter(v => v.t0 <= now && v.end > now).length : 0;
  if (n === lastVoices) return; lastVoices = n;
  voiceBars.querySelectorAll('i').forEach((b, i) => { b.className = i < Math.min(8, n) ? (n > 8 ? 'over' : 'on') : ''; });
  $('#voiceN').textContent = `${n}/8`; $('#voices').classList.toggle('over', n > 8);
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
  if (m) {
    const lv = i => Math.round(100 * Math.min(1, (m.tracks[i] || 0) * 1.2));
    $('#trackList').querySelectorAll('.trk .meter i').forEach((e, i) => { e.style.width = `${lv(i)}%`; });
    if (st.page === 'mixer') $('#mixer').querySelectorAll('.chan:not(.master) .vmeter i').forEach((e, i) => { e.style.height = `${lv(i)}%`; });
  }
  showVoices();
  requestAnimationFrame(frame);
}

// ---------- playing live: a MIDI keyboard, the computer keyboard, a phone ----------
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
  if (!navigator.requestMIDIAccess) { $('#midiInfo').textContent = 'no Web MIDI here (Chrome or Edge)'; return; }
  try {
    const acc = await navigator.requestMIDIAccess(), names = new Set();
    const hook = inp => { names.add(inp.name || 'MIDI'); inp.onmidimessage = e => midiIn(e.data); };
    acc.inputs.forEach(hook);
    acc.onstatechange = e => { if (e.port.type === 'input' && e.port.state === 'connected') { hook(e.port); show(); } };
    const show = () => { $('#midiInfo').textContent = names.size ? `MIDI · ${[...names].join(', ')}` : 'MIDI ready: plug in a keyboard'; $('#midiDot').className = `dot ${names.size ? 'on' : 'wait'}`; $('#midiInfo').title = $('#midiInfo').textContent; };
    show(); $('#midiBtn').textContent = 'On'; $('#midiBtn').disabled = true;
  } catch (e) { $('#midiInfo').textContent = 'MIDI was not allowed'; }
}
function midiIn(d) {
  const hi = d[0] & 0xF0, a = d[1], b = d[2];
  if (hi === 0x90 && b > 0) liveOn(a, b);
  else if (hi === 0x80 || hi === 0x90) liveOff(a);
  else if (hi === 0xB0 && a === 64) pedal(b >= 64);
  else if (hi === 0xE0) { st.bend = (((b << 7) | a) - 8192) / 8192 * 2; for (const l of st.live.values()) S.bend(l.v, st.bend); }
}
// ---------- the phone as a drum pad and keyboard (padlink.mjs, /studio/pad/) ----------
let phone = null;
const PHONE_STATE = { waiting: 'waiting for the phone…', connecting: 'connecting…', open: 'connected', lost: 'lost: waiting for the phone to come back…', stopped: 'disconnected' };
// what the phone shows: the selected drum track's pads, or a keyboard
function phoneLayout() {
  const t = track(); if (!t) return { mode: 'keys' };
  if (!kitTrack(t)) return { mode: 'keys' };
  const names = kitNamesOf(t), ki = t.instrument.startsWith('drums:') ? st.song.kits[t.instrument.slice(6)] : null;
  const notes = ki ? ki.pads.map(p => p.note) : [36, 38, 37, 39, 42, 46, 41, 45, 48, 49, 51, 70, 54, 35, 40, 44];
  return { mode: 'pads', pads: notes.slice(0, 16).map(n => ({ note: n, name: names.get(n) || noteName(n) })) };
}
let phoneLast = '';
function phoneSend(force) { if (!phone) return; const j = JSON.stringify(phoneLayout()); if (j === phoneLast && !force) return; phoneLast = j; phone.send(['pads', JSON.parse(j)]); }
function phoneShow() {
  const s = phone ? phone.status : 'stopped', open = s === 'open';
  $('#phoneDot').className = `dot${open ? ' on' : phone && s !== 'stopped' ? ' wait' : ''}`;
  $('#phoneInfo').textContent = phone ? `Phone · ${open && phone.rtt !== null ? `${phone.rtt} ms` : (PHONE_STATE[s] || s).replace('…', '')}` : 'Phone';
  $('#phoneBtn').textContent = phone && !phone.stopped ? 'Show' : 'Pair';
  if (!phone) return;
  const url = `${location.origin}/studio/pad/?c=${phone.code}`;
  if ($('#phoneUrl').href !== url) $('#phoneQr').innerHTML = qrSvg(url, { scale: 6, dark: '#1C1C1A', light: '#FFFFFF' });
  $('#phoneUrl').href = url; $('#phoneUrl').textContent = url; $('#phoneBase').textContent = `${location.host}/studio/pad/`; $('#phoneCode').textContent = phone.code;
  const order = ['waiting', 'connecting', 'open'], k = order.indexOf(s);
  $('#phoneSteps').querySelectorAll('li').forEach((li, i) => { li.classList.toggle('done', k > i); li.classList.toggle('now', k === i); });
  $('#phoneState').textContent = (PHONE_STATE[s] || '') + (open && phone.rtt !== null ? ` · ${phone.rtt} ms there and back` : '') + (open ? ' · if there is no sound, click anywhere in this window once' : '');
}
function phoneMessage(m) {
  if (m[0] === 'on') liveOn(Math.max(0, Math.min(127, m[1] | 0)), Math.max(1, Math.min(127, m[2] | 0)), 'ph' + m[1]);
  else if (m[0] === 'off') liveOff('ph' + m[1]);
  else if (m[0] === 'cc' && m[1] === 64) pedal(m[2] >= 64);
}
async function openPhone() {
  audio();
  if (!phone || phone.stopped) {
    phone = new PadHost({
      onMessage: phoneMessage,
      onState: (s) => { if (s === 'open') phoneSend(true); phoneShow(); }
    });
    try { await phone.start(); } catch (e) { $('#phoneState').textContent = `could not start: ${e.message}`; }
  }
  phoneShow(); $('#phoneDlg').showModal();
}
$('#phoneBtn').onclick = openPhone;
$('#phoneStop').onclick = async () => { if (phone) { const p = phone; phone = null; for (const id of [...st.live.keys()]) if (String(id).startsWith('ph')) liveOff(id, true); await p.stop(); } phoneShow(); $('#phoneDlg').close(); };

const QWERTY = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
function showKeys() {
  $('#keysBtn').setAttribute('aria-pressed', String(st.keys)); $('#keysBtn').textContent = st.keys ? 'Turn off' : 'Turn on';
  $('#keysDot').className = `dot${st.keys ? ' on' : ''}`; $('#keysInfo').textContent = st.keys ? `Computer keys · C${st.octave}` : 'Computer keys';
}

// ---------- keys ----------
const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
addEventListener('keydown', e => {
  if (typing(e) || document.querySelector('dialog[open]') || !$('#projects').hidden) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (st.keys && !ctrl && !e.altKey) {
    if (e.code in QWERTY) { e.preventDefault(); if (!e.repeat) liveOn((st.octave + 1) * 12 + QWERTY[e.code], 100, e.code); return; }
    if (e.code === 'KeyZ' || e.code === 'KeyX') { st.octave = Math.max(0, Math.min(8, st.octave + (e.code === 'KeyX' ? 1 : -1))); showKeys(); return; }
  }
  if (ctrl && e.code === 'KeyE') { e.preventDefault(); splitClips(); return; }   // (from either editor: the browser's own Ctrl+E is not wanted)
  if (st.focus === 'arr' && st.cs.size) {   // the arranger has the keys while its clips are what was last clicked
    if (ctrl && e.code === 'KeyD') { e.preventDefault(); dupClips(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteClips(); return; }
    if (e.code === 'Escape') { st.cs.clear(); drawArr(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); if (st.open) playBeat(); else play(); }
  else if (e.code === 'Enter' && !ctrl) { if (S.playing) stopAll(); st.start = 0; showPos(); drawRoll(); drawArr(); }
  else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); }
  else if (ctrl && e.code === 'KeyS') { e.preventDefault(); save(); }
  else if (ctrl && e.code === 'KeyC') copySel();
  else if (ctrl && e.code === 'KeyV') { e.preventDefault(); pasteAt(st.open ? 0 : st.start); }   // (an open beat has no start mark: its own start)
  else if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSel(); }
  else if (ctrl && e.code === 'KeyA') { e.preventDefault(); st.picked = new Set(target().notes); drawRoll(); }
  else if (ctrl || e.altKey) return;
  else if (e.code === 'KeyR') record();
  else if (e.code === 'KeyQ') quantizeSel();
  else if (e.code === 'KeyH') humanizeSel();
  else if (e.code === 'KeyL') $('#loopBtn').click();
  else if (e.code === 'KeyK') $('#clickBtn').click();
  else if (e.code === 'KeyB') { if (e.shiftKey) beatFromSelection(); else newBeat(); }
  else if (e.code === 'KeyM') addMarker(Math.floor(st.start / barTicks()) * barTicks());
  else if (e.key === '?') $('#helpBtn').click();
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
    if (e.status === 409) {   // saved somewhere else since: the owner says what happens
      showSaved('not saved: changed elsewhere');
      const when = e.body.updated_at && !isNaN(new Date(e.body.updated_at)) ? ` (${new Date(e.body.updated_at).toLocaleString()})` : '';
      const v = await ask({ title: `“${st.song.title}” was changed somewhere else`, text: `Since you opened it, the saved song was changed${e.body.updated_by ? ` by ${e.body.updated_by}` : ''}${when}, in another tab or on another computer. Saving now would replace that version. Not sure? Save yours as a copy and compare them.`,
        buttons: [['Keep mine here', null], ['Open the saved one', 'open'], ['Save as a copy', 'copy'], ['Overwrite with mine', 'over', 'danger dark']] });
      if (v === 'over') { st.meta.updated_at = e.body.updated_at; return save(); }
      if (v === 'copy') return save(true);
      if (v === 'open') { st.dirty = false; return openSong(st.meta.id); }
      showSaved('not saved (kept in this browser)');
      return;
    }
    showSaved(`not saved: ${e.message} (kept in this browser)`);
  }
}
let songItems = [];
async function listSongs() {
  try { songItems = (await api('/api/songs')).items; } catch { songItems = []; }
  if (!$('#projects').hidden) renderProjects();
  return songItems;
}
async function openSong(id) {
  if (!id) return;
  if (st.dirty) {
    const v = await ask({ title: 'Open another song?', text: `“${st.song.title}” has changes that are not saved to the site. They stay in this browser as a draft only until another song is opened.`, buttons: [['Cancel', null], ['Open without saving', 'open'], ['Save, then open', 'save', 'dark']] });
    if (!v) return;
    if (v === 'save') { await save(); if (st.dirty) return; }
  }
  try { const r = await api(`/api/songs/${encodeURIComponent(id)}`); load(r.song, { id: r.id, updated_at: r.updated_at, game: r.game }); $('#projects').hidden = true; }
  catch (e) { showSaved(`could not open it: ${e.message}`); }
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
  showSaved('rendering the WAV…');
  const buf = await S.render(st.song, { loop: false });
  download(wav(buf), `${slug(st.song.title)}.wav`); showSaved();
}
function exportFile() { download(new Blob([JSON.stringify(st.song, null, 1)], { type: 'application/json' }), `${slug(st.song.title)}.song.json`); }
const replaceOk = async () => !st.dirty || !!await ask({ title: 'Replace the song you are working on?', text: `“${st.song.title}” has changes that are not saved to the site, and they would be lost. Save first, take a snapshot, or cancel and use Save as a copy.`, buttons: [['Cancel', null], ['Replace it', true, 'danger dark']] });
async function importFile(f) {
  let s; try { s = JSON.parse(await f.text()); } catch (e) { return tell('That is not a song file', e.message); }
  if (await replaceOk()) { load(s, undefined, true); $('#projects').hidden = true; }
}
// MIDI files (midi-core.mjs): the notes, instruments, tempo and loop, the volume, pan and pitch-bend lanes and the song's own samples;
// effects, EQ and the other lanes are not in one
function exportMidi() {
  const { bytes, warnings } = midiFromSong(st.song, S);
  download(new Blob([bytes], { type: 'audio/midi' }), `${slug(st.song.title)}.mid`);
  showSaved('MIDI file made'); if (warnings.length) tell('The MIDI file is made', `Notes on it:\n- ${warnings.join('\n- ')}`);
}
// a file with several instruments asks which to open (all ticked); resolves to their indices, or null for cancel
function pickInstruments(candidates) {
  const dlg = $('#midiPick'), list = $('#midiPickList');
  $('#midiPickInfo').textContent = `${candidates.length} instruments in the file. Untick the ones you do not want in the song (a song holds up to 32 tracks).`;
  list.innerHTML = candidates.map(c => `<label class="pickrow"><input type="checkbox" value="${c.index}" checked><b>${esc(c.name)}</b>
    <span class="muted">${S.isKit(c.instrument) ? 'becomes a drum kit' : `becomes ${esc(insName(c.instrument) || S.INSTRUMENTS.find(x => x.id === c.instrument)?.name || c.instrument)}`} · channel ${c.channel} · ${c.notes} notes</span></label>`).join('');
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
      if (!only.length) return tell('No instrument was ticked', 'Nothing was opened.');
      if (only.length < r.info.candidates.length) r = songFromMidi(bytes, S, { ...opts, only });
    }
  } catch (e) { return tell('That MIDI file cannot be opened', `${e.message}. Nothing changed.`); }
  if (!await replaceOk()) return;
  load(r.song, undefined, true); $('#projects').hidden = true; showSaved(`MIDI file opened: ${r.info.tracks} tracks, ${r.info.notes} notes`);
  if (r.warnings.length) tell('The MIDI file is open', `Notes on it:\n- ${r.warnings.join('\n- ')}`);
}

// ---------- snapshots: named save points of a song, kept in this browser ----------
const snapKey = () => st.meta.id || 'unsaved';
function snapsAll() { try { return JSON.parse(localStorage.getItem(SNAPS)) || {}; } catch { return {}; } }
function renderSnaps() {
  const list = snapsAll()[snapKey()] || [], ul = $('#snapList');
  ul.innerHTML = list.length ? list.map((s, i) => `<li><span class="nm">${esc(s.name)}</span><span class="muted small">${new Date(s.at).toLocaleString()}</span>
    <button class="b s" data-r="${i}">Restore</button><button class="bdel" data-d="${i}" aria-label="Forget it"><svg width="10" height="10"><use href="#i-x"/></svg></button></li>`).join('')
    : '<li class="empty">No snapshots of this song yet.</li>';
  ul.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const s = list[+b.dataset.r]; if (st.beat) stopAll(); edit(() => { st.song = S.check(JSON.parse(s.song)); st.sel = Math.min(st.sel, st.song.tracks.length - 1); st.picked.clear(); st.cs.clear(); st.open = null; }, { rebuild: true }); S.prepare(st.song); showSaved(`snapshot “${s.name}” restored (undo takes it back)`); $('#snapDlg').close(); });
  ul.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const all = snapsAll(); all[snapKey()].splice(+b.dataset.d, 1); try { localStorage.setItem(SNAPS, JSON.stringify(all)); } catch { } renderSnaps(); });
}
$('#snapTake').onclick = () => {
  const all = snapsAll(), list = all[snapKey()] ??= [], name = $('#snapName').value.trim() || `Snapshot ${list.length + 1}`;
  list.unshift({ name: name.slice(0, 40), at: Date.now(), song: snap() }); list.splice(12);
  try { localStorage.setItem(SNAPS, JSON.stringify(all)); $('#snapName').value = ''; } catch { showSaved('no room in this browser for another snapshot: forget an old one'); }
  renderSnaps();
};
$('#snapBtn').onclick = () => { renderSnaps(); $('#snapDlg').showModal(); };

// ---------- projects: the games songs are for, and their songs ----------
let gamesList = [];
async function games() {
  if (!gamesList.length) try { gamesList = (await (await fetch('/games.json', { cache: 'no-store' })).json()).games.filter(g => g.listed && !g.template); } catch { }
  return gamesList;
}
function renderProjects() {
  const count = id => songItems.filter(s => (s.game || '') === id).length;
  const here = PROJECT === null ? null : GAME_ID;
  $('#projList').innerHTML = gamesList.map(g => `<a class="proj${here === g.id ? ' on' : ''}" href="/studio/?game=${esc(g.id)}">
      ${g.thumbnail ? `<img src="/${esc(g.thumbnail)}" alt="">` : '<span class="ph"></span>'}<b>${esc(g.title)}</b><span class="muted">${count(g.id)}</span></a>`).join('')
    + `<a class="proj${here === '' ? ' on' : ''}" href="/studio/?game=none"><span class="ph">♪</span><b>Sketches</b><span class="muted">${count('')}</span></a>`;
  const chosen = PROJECT !== null;
  $('#projClose').hidden = !chosen; $('#pActs').hidden = !chosen; $('.songhead').hidden = !chosen;
  $('#pTitle').textContent = chosen ? project.title : 'Sound Studio';
  $('#pIntro').hidden = chosen;
  const mine = songItems.filter(s => (s.game || '') === GAME_ID).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  $('#pCount').textContent = chosen ? `${mine.length} song${mine.length === 1 ? '' : 's'} · saved to the site` : '';
  $('#songList').innerHTML = !chosen ? '' : mine.length ? mine.map(s => `<div class="song${s.id === st.meta.id ? ' on' : ''}" data-id="${esc(s.id)}">
      <div class="t"><b>${esc(s.title)}</b><span class="mono">${esc(s.id)}</span></div>
      <span class="when">${s.updated_at && !isNaN(new Date(s.updated_at)) ? new Date(s.updated_at).toLocaleString() : ''}</span>
      <span class="when">${esc(s.updated_by === 'claude-session' ? 'a Claude session' : s.updated_by || '')}</span>
      <button class="b s" data-open>${s.id === st.meta.id ? 'Open again' : 'Open'}</button></div>`).join('')
    : '<p class="empty">No songs saved in this project yet. Save the one you are working on, or start a new one.</p>';
  $('#songList').querySelectorAll('.song').forEach(r => r.querySelector('[data-open]').onclick = () => openSong(r.dataset.id));
}
async function showProjects() {
  $('#projects').hidden = false; renderProjects();
  await listSongs(); renderProjects();
}
$('#projBtn').onclick = showProjects; $('#songsBtn').onclick = showProjects; $('#openBtn').onclick = showProjects;
$('#projClose').onclick = () => { $('#projects').hidden = true; };
$('#projects').addEventListener('pointerdown', e => { if (e.target === $('#projects') && PROJECT !== null) $('#projects').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#projects').hidden && PROJECT !== null && !document.querySelector('dialog[open]')) $('#projects').hidden = true; });
$('#pNew').onclick = async () => { if (await replaceOk()) { load(template()); $('#projects').hidden = true; } };
$('#pFile').onclick = () => $('#importFile').click();
$('#pMidi').onclick = () => $('#importMidi').click();

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
// a sound (a file's, or a recording's) becomes a new sample, played by track i (null: kept in the song for later), and opens under SAMPLES
async function addSample(src, name, i) {
  const id = newSampleId(name);
  sources.set(id, src);
  const rate = 32000, data = await resample(src, rate, MAX_SECS), root = detectRoot(data, rate) ?? 60;
  edit(() => {
    st.song.samples[id] = { name, rate, root, loop: -1, brr: S.toB64(S.brrEncode(data)) };
    if (i === null) return;
    const t = st.song.tracks[i]; t.instrument = `sample:${id}`; t.name = name;
    t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  if (i !== null) st.sel = i;
  st.smp = { k: 's', id }; showView('samples'); S.prepare(st.song);
  showSaved(`sample “${name}”: ${(data.length / rate).toFixed(2)} s, plays ${noteName(Math.round(root))}`);
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
// recFor: { track } makes a new sample for that track (track null: for the song); { id } puts the recording in place of that sample's sound; { pad } on a kit's pad
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
    x.fillStyle = '#F3F2EE'; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = lvl > .9 ? REC : '#4F8A3C'; x.fillRect(0, 8, lvl * cv.width, 14);
    x.fillStyle = INK; x.fillRect(0, 30, Math.min(1, secs / MAX_SECS) * cv.width, 4);
    info.textContent = `Recording… ${secs.toFixed(1)} of ${MAX_SECS} s: press Stop when you are done.`;
    raf = requestAnimationFrame(meter);
  };
  const reset = () => { go.textContent = '● Start'; go.disabled = false; info.textContent = idle; x.clearRect(0, 0, cv.width, cv.height); };
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
        const src = await decodeFile(blob), name = `Recording ${Object.values(st.song.samples).filter(s => /^Recording/.test(s.name)).length + 1}`;
        if (job.pad) await fillPads(job.pad.kit, [{ src, name }], job.pad.note);
        else if (job.id) await replaceSample(job.id, src);
        else await addSample(src, name, job.track);
      } catch (err) { showSaved(`could not use the recording: ${err.message || err}`); }
    };
    rec.start(); t0 = performance.now(); go.textContent = '■ Stop';
    timer = setTimeout(() => { if (rec.state === 'recording') { keep = true; rec.stop(); } }, MAX_SECS * 1000);
    meter();
  };
  dlg.onclose = () => { keep = false; if (rec && rec.state === 'recording') rec.stop(); stop(); reset(); };
  reset(); dlg.showModal();
}

// ---------- drum kits: a pad for each sound, each a built-in sound or a sample of your own ----------
// what to call a sound's pad: words in a file's name that say which drum it is (open before hat: "open hat" is both)
const PAD_WORDS = [['open', 46], ['hat', 42], ['hihat', 42], ['kick', 36], ['bass drum', 36], ['snare', 38], ['rim', 37], ['clap', 39], ['tom', 45], ['crash', 49], ['ride', 51], ['shaker', 70]];
const fallbackSound = note => (S.newKit().pads.find(p => p.note === note) || { sound: 'kick' }).sound;
const KIT_WARN_KB = 300;
const padOwned = new Set();   // the samples this session made for a pad: only those go when nothing plays them (a sample you loaded for a track is yours to keep)
function newSampleId(name) { let id = slug(name).slice(0, 24) || 'sample'; for (let k = 2; st.song.samples[id]; k++) id = `${slug(name).slice(0, 20)}-${k}`; return id; }
// a sample no track, multisample or pad plays any more goes (it was the pad's own)
function pruneSample(id) {
  const s = st.song;
  if (!padOwned.has(id) || !s.samples[id] || s.tracks.some(t => t.instrument === `sample:${id}`) || Object.values(s.multis || {}).some(m => m.zones.some(z => z.sample === id))
    || Object.values(s.kits || {}).some(k => k.pads.some(p => p.sample === id))) return;
  delete s.samples[id]; sources.delete(id); padOwned.delete(id);
}
// a new kit of 16 pads of the built-in sounds (it sounds right at once), played by track i (null: kept in the song for later); it opens under DRUM KITS
function newKitFor(i) {
  let id = 'kit'; for (let k = 2; st.song.kits?.[id]; k++) id = `kit-${k}`;
  edit(() => {
    (st.song.kits ??= {})[id] = S.newKit('Drum kit');
    if (i === null) return;
    const t = st.song.tracks[i], was = insName(t.instrument);
    if (!t.name || t.name === 'Track' || t.name === was) t.name = 'Drum kit';
    t.instrument = `drums:${id}`; t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  if (i !== null) st.sel = i;
  st.pad = null; st.kit = id; showView('kits'); S.prepare(st.song);
}
// sounds (decoded: { src, name }) into a kit's pads: the first on `note` if given; the others by the words in their names, else the next pad not yet given one.
// One undo step for all of it.
async function fillPads(kitId, items, note) {
  const ki = st.song.kits[kitId]; if (!ki) return;
  const made = [];
  for (const it of items) made.push({ ...it, data: await resample(it.src, 16000, 1.5) });   // 16 kHz and 1.5 s: a drum hit is short, and songs travel inside game pages
  const taken = new Set(), place = [];
  made.forEach((m, k) => {
    let pad = k === 0 && note !== undefined ? ki.pads.find(p => p.note === note) : null;
    if (!pad) { const low = m.name.toLowerCase(); for (const [w, n] of PAD_WORDS) if (low.includes(w)) { const c = ki.pads.find(p => p.note === n && !taken.has(p)); if (c) { pad = c; break; } } }
    if (!pad) pad = ki.pads.find(p => !taken.has(p) && !p.sample);   // (a file that says nothing goes to a pad with no sample of its own, never over one)
    if (pad) { taken.add(pad); place.push([pad, m]); }
  });
  edit(() => {
    for (const [pad, m] of place) {
      const id = newSampleId(m.name); sources.set(id, m.src);
      const was = pad.sample;
      st.song.samples[id] = { name: m.name, rate: 16000, root: 60, loop: -1, secs: 1.5, brr: S.toB64(S.brrEncode(m.data)) }; padOwned.add(id);   // (secs: a change of grit keeps it that short)
      delete pad.sound; pad.sample = id; if (was) pruneSample(was);
    }
  }, { rebuild: true });
  if (place.length) st.pad = place[0][0].note;
  S.prepare(st.song).then(() => { if (st.page === 'kits') renderKits(); });
  showSaved(`${place.length} pad${place.length === 1 ? '' : 's'} filled${made.length > place.length ? `, ${made.length - place.length} had no pad left` : ''}`);
}
// decode dropped or chosen files: the ones that are sounds; one that is not does not spoil the others
async function decodeAll(files) {
  const r = await Promise.allSettled(files.map(async f => ({ src: await decodeFile(f), name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'sample' })));
  const items = r.filter(x => x.status === 'fulfilled').map(x => x.value), bad = r.length - items.length;
  if (!items.length) throw new Error(r[0] && r[0].reason && r[0].reason.message ? r[0].reason.message : 'not a sound');
  if (bad) showSaved(`${bad} file${bad > 1 ? 's' : ''} could not be read and ${bad > 1 ? 'were' : 'was'} left out`);
  return items;
}
let padFile = null;   // the kit and pad a file chosen with the pad's button is for
$('#padFile').onchange = async e => {
  const files = [...e.target.files]; if (!files.length || !padFile) return;
  audio(); showSaved('loading the sound…');
  try { await fillPads(padFile.kit, await decodeAll(files), padFile.note); }
  catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
};
const kitKB = ki => Math.round([...new Set(ki.pads.map(p => p.sample).filter(Boolean))].reduce((a, sid) => a + (st.song.samples[sid]?.brr.length || 0), 0) / 1024);
// DRUM KITS: the song's kits on the left, the chosen kit's pads, the chosen pad's sound on the right
function renderKits() {
  const box = $('#kitView'); box.textContent = '';
  const kits = Object.entries(st.song.kits || {}), t = track();
  if (!st.kit || !st.song.kits?.[st.kit]) st.kit = t && t.instrument.startsWith('drums:') && st.song.kits?.[t.instrument.slice(6)] ? t.instrument.slice(6) : kits[0]?.[0] || null;
  const side = el('nav', 'side'); side.setAttribute('aria-label', 'Kits'); side.append(el('div', 'lb', 'Song kits'));
  for (const [id, ki] of kits) {
    const users = st.song.tracks.filter(x => x.instrument === `drums:${id}`).map(x => x.name);
    const b = el('button', `sitem${id === st.kit ? ' on' : ''}`, `<span class="two"><span class="nm">${esc(ki.name)}</span><small>${ki.pads.length} pads · ${users.length ? esc(users.join(', ')) : 'not used yet'}</small></span>`);
    b.onclick = () => { st.kit = id; st.pad = null; renderKits(); }; side.append(b);
  }
  const nk = el('div', 'acts2'), nb = el('button', 'b s'); nb.textContent = '+ New kit'; nb.title = 'A kit of 16 pads of the built-in sounds'; nb.onclick = () => newKitFor(null); nk.append(nb); side.append(nk);
  side.append(el('div', 'lb', 'Built in'), el('p', 'meta', '<span style="padding:0 12px;display:block">The built-in kit: General MIDI drum sounds. A song kit starts as a copy of it.</span>'));
  box.append(side);
  const ki = st.kit && st.song.kits[st.kit];
  if (!ki) { box.append(el('div', 'empty-view', '<h2>No drum kit of the song\'s own yet</h2><p>A kit is a set of pads, each a built-in drum or a sound of your own, with its tune, level, pan and choke group. Drum tracks play the built-in kit until you give them one.</p>')); const b = el('button', 'b dark'); b.textContent = '+ New kit'; b.onclick = () => newKitFor(null); box.lastChild.append(b); return; }
  const id = st.kit, edit_ = el('div', 'edit'); box.append(edit_);
  if (!ki.pads.some(p => p.note === st.pad)) st.pad = ki.pads[0] ? ki.pads[0].note : null;
  const names = new Map(B.rowsOf(S, st.song, { instrument: `drums:${id}` }, { notes: [] }).map(r => [r.note, r.name]));
  const users = st.song.tracks.filter(x => x.instrument === `drums:${id}`).length;
  const hear = note => S.prepare(st.song).then(() => audition(`drums:${id}`, note, 100, 600));
  // the header
  const head = el('header', 'vhead');
  head.innerHTML = `<input class="nm" value="${esc(ki.name)}" maxlength="40" aria-label="Kit name" spellcheck="false">
    <span class="muted small">${ki.pads.length} of 32 pads · ${users ? `played by ${users} track${users > 1 ? 's' : ''}` : 'no track plays it yet'}</span><span class="grow"></span>`;
  head.querySelector('.nm').onchange = e => { const v = e.target.value || id; if (v !== ki.name) edit(() => { ki.name = v; }, { rebuild: true }); };
  const fill = el('button', 'b s'); fill.textContent = 'Fill pads from files…'; fill.title = 'Choose several sound files: they find their pads by the words in their names';
  fill.onclick = () => { padFile = { kit: id }; $('#padFile').value = ''; $('#padFile').click(); };
  let free = 35; while (ki.pads.some(x => x.note === free)) free++;
  const add = el('button', 'b s'); add.textContent = `+ Pad on note ${free}`; add.title = 'A new pad on the next free note'; add.disabled = ki.pads.length >= 32;
  add.onclick = () => { edit(() => { ki.pads.push({ note: free, sound: 'kick', tune: 0, level: 1, pan: 0, choke: 0 }); ki.pads.sort((a, b) => a.note - b.note); }, { rebuild: true }); st.pad = free; S.prepare(st.song); };
  const del = el('button', 'b s danger'); del.textContent = 'Delete kit…'; del.title = 'Take the kit out of the song: its tracks play the built-in kit';
  del.onclick = async () => {
    if (!await ask({ title: `Delete the kit “${ki.name}”?`, text: `${users ? `${users} track${users > 1 ? 's' : ''} will play the built-in kit. ` : ''}Samples only this kit played go with it. You can undo this.`, buttons: [['Cancel', null], ['Delete kit', true, 'danger dark']] })) return;
    edit(() => { const used = ki.pads.map(x => x.sample).filter(Boolean); delete st.song.kits[id]; if (!Object.keys(st.song.kits).length) delete st.song.kits; for (const tr of st.song.tracks) if (tr.instrument === `drums:${id}`) tr.instrument = 'kit'; used.forEach(pruneSample); st.kit = null; }, { rebuild: true });
  };
  head.append(fill, add, del); edit_.append(head);
  const drop = el('div', 'dropzone', '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v9M4 7l4 4 4-4M2 14h12" fill="none" stroke="#4A4843" stroke-width="1.4"/></svg><span>Drop sound files here. Names with <b>kick</b>, <b>snare</b>, <b>open hat</b>, <b>hat</b>, <b>clap</b>, <b>tom</b>, <b>crash</b>, <b>ride</b>, <b>rim</b> or <b>shaker</b> find their pad; the rest fill pads without a sample. Shortened to 16 kHz and 1.5 s. Drop one on a pad to put it there.</span>');
  edit_.append(drop);
  const grid = el('div', 'pads');
  const dropFiles = async (files, note) => {
    audio(); showSaved('loading the sounds…');
    try { await fillPads(id, await decodeAll(files), note); }
    catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
  };
  ki.pads.forEach(p => {
    const b = el('button', `pad${p.note === st.pad ? ' on' : ''}${p.sample ? ' smp' : ''}`); b.dataset.note = p.note; b.type = 'button';
    b.innerHTML = `<b>${esc(names.get(p.note) || '')}</b><span>note ${p.note} · ${p.sample ? `sample: ${esc(st.song.samples[p.sample]?.name || p.sample)}` : esc(p.sound)}${p.tune ? ` · tune ${p.tune > 0 ? '+' : ''}${p.tune}` : ''}</span><span class="ch${p.choke ? ' g' : ''}">${p.choke ? `choke ${p.choke}` : 'no choke'}</span>`;
    b.title = 'Click: hear it and choose it · drop a sound file on it: that sound on this pad';
    b.onclick = () => { st.pad = p.note; hear(p.note); renderKits(); };
    b.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); b.classList.add('over'); } };
    b.ondragleave = () => b.classList.remove('over');
    b.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove('over'); dropFiles([...e.dataTransfer.files], p.note); };
    grid.append(b);
  });
  for (const z of [grid, drop]) { z.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }; z.ondrop = e => { e.preventDefault(); dropFiles([...e.dataTransfer.files]); }; }
  edit_.append(grid);
  const kb = kitKB(ki), foot = el('div', 'kitfoot');
  foot.innerHTML = `<span class="lb">Kit samples</span><div class="bar8"><i class="${kb > KIT_WARN_KB ? 'warn' : ''}" style="width:${Math.min(100, kb / 400 * 100)}%"></i><b style="left:75%"></b></div><span class="mono">${kb} KB</span>`;
  const info = el('p', `meta${kb > KIT_WARN_KB ? ' warn' : ''}`, kb > KIT_WARN_KB ? `That is a lot (over ${KIT_WARN_KB} KB): the song travels inside every game page that plays it. Shorter or fewer sounds keep it light.` : `warns above ${KIT_WARN_KB} KB: the song ships inside every game page that plays it`);
  foot.append(info); edit_.append(foot);
  // the chosen pad
  const p = ki.pads.find(x => x.note === st.pad), ps = el('aside', 'padside'); ps.setAttribute('aria-label', 'Pad'); box.append(ps);
  if (!p) return;
  const ph = el('header', 'vhead', `<b style="font-size:14px">${esc(names.get(p.note) || noteName(p.note))}</b><span class="grow"></span>`);
  const hb = el('button', 'b s dark', '<svg width="9" height="9"><use href="#i-play"/></svg>Hear'); hb.onclick = () => hear(p.note); ph.append(hb); ps.append(ph);
  const body = el('div', 'mb'); ps.append(body);
  const samples = Object.entries(st.song.samples);
  const src = pick('Sound', [...S.DRUM_KINDS.map(k => [`d:${k}`, `built-in: ${k}`]), ...samples.map(([sid, sm]) => [`s:${sid}`, `sample: ${sm.name}`])], () => p.sample ? `s:${p.sample}` : `d:${p.sound}`, () => {});
  const sel = src.querySelector('select');
  sel.onchange = () => { const [k, v] = [sel.value[0], sel.value.slice(2)]; edit(() => { const was = p.sample; if (k === 'd') { delete p.sample; p.sound = v; } else { delete p.sound; p.sample = v; } if (was && was !== p.sample) pruneSample(was); }, { rebuild: true }); S.prepare(st.song); };
  const row = el('div', 'btnrow');
  row.innerHTML = '<button class="b s" data-a="file" title="Choose a sound file for this pad (or drop it on the pad)">Load file…</button><button class="b s" data-a="rec" title="Record this pad\'s sound with the microphone">● Record</button>';
  row.querySelector('[data-a="file"]').onclick = () => { padFile = { kit: id, note: p.note }; $('#padFile').value = ''; $('#padFile').click(); };
  row.querySelector('[data-a="rec"]').onclick = () => { recFor = { pad: { kit: id, note: p.note } }; openRecorder(); };
  const note = el('label', 'ctl'); note.title = 'The note that plays this pad (35 = a kick, 38 = a snare… as in General MIDI); each pad has its own';
  note.innerHTML = `<span>Note</span><output>${noteName(p.note)}</output><input type="number" min="0" max="127" value="${p.note}">`;
  note.querySelector('input').onchange = e => {
    const v = Math.max(0, Math.min(127, Math.round(+e.target.value) || 0));
    if (v !== p.note && ki.pads.some(x => x.note === v)) { showSaved(`${noteName(v)} is another pad's note`); return renderKits(); }
    if (v !== p.note) { edit(() => { p.note = v; ki.pads.sort((a, b) => a.note - b.note); }, { rebuild: true }); st.pad = v; S.prepare(st.song); }
  };
  const after = c => { c.querySelector('input').addEventListener('change', () => { S.prepare(st.song); renderKits(); }); return c; };
  const choke = el('div', 'ctl'); choke.title = 'Pads in one group cut each other off: a closed hat ends an open one';
  choke.append(el('span', '', 'Choke group'), el('output', '', p.choke ? `group ${p.choke}` : 'none'));
  const cs = segs(['–', 1, 2, 3, 4, 5, 6, 7, 8].map((v, i) => [i, String(v)]), () => p.choke | 0, v => edit(() => { p.choke = +v; }, { rebuild: true })); cs.style.gridColumn = '1 / -1'; choke.append(cs);
  const rm = el('button', 'b s danger'); rm.textContent = 'Remove pad'; rm.onclick = () => { edit(() => { ki.pads = ki.pads.filter(x => x !== p); if (p.sample) pruneSample(p.sample); }, { rebuild: true }); S.prepare(st.song); };
  body.append(src, row, note,
    after(ctl('Tune', () => p.tune, v => { p.tune = Math.round(v * 10) / 10; }, { min: -24, max: 24, step: .1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` })),
    after(ctl('Level', () => p.level, v => { p.level = v; }, { min: 0, max: 2, step: .01, fmt: v => v.toFixed(2) })),
    after(ctl('Pan', () => p.pan, v => { p.pan = v; }, { min: -1, max: 1, step: .05, fmt: panFmt })),
    choke, rm);
}

// ---------- SAMPLES: the song's samples and multisamples ----------
// a sample taken out of the song: the multisamples that used it lose that zone, and the tracks that played it go back to the piano
function dropSample(id) {
  const s = st.song; delete s.samples[id];
  for (const [mid, mu] of Object.entries(s.multis || {})) { mu.zones = mu.zones.filter(z => z.sample !== id); if (!mu.zones.length) delete s.multis[mid]; }
  if (s.multis && !Object.keys(s.multis).length) delete s.multis;
  for (const ki of Object.values(s.kits || {})) for (const pad of ki.pads) if (pad.sample === id) { delete pad.sample; pad.sound = fallbackSound(pad.note); }   // a pad that played it goes back to a built-in sound
  for (const t of s.tracks) if ((t.instrument.startsWith('sample:') && !s.samples[t.instrument.slice(7)]) || (t.instrument.startsWith('multi:') && !(s.multis || {})[t.instrument.slice(6)])) t.instrument = 'piano';
}
// a new multisample (one zone over every note) of the song's samples, played by track i (null: kept for later)
function newMulti(i) {
  const ids = Object.keys(st.song.samples);
  if (!ids.length) { showSaved('load or record a sample first: a multisample is made of samples'); return; }
  let id = 'multi'; for (let k = 2; st.song.multis?.[id]; k++) id = `multi-${k}`;
  edit(() => {
    (st.song.multis ??= {})[id] = { name: 'Multisample', zones: [{ sample: ids[0], lo: 0, hi: 127 }] };
    if (i === null) return;
    const t = st.song.tracks[i]; t.instrument = `multi:${id}`; t.name = 'Multisample';
    t.sound.attack = t.sound.decay = t.sound.sustain = t.sound.fall = t.sound.release = t.sound.vibrato = null;
  }, { rebuild: true });
  if (i !== null) st.sel = i;
  st.smp = { k: 'm', id }; showView('samples'); S.prepare(st.song);
}
const sampleSecs = sm => Math.floor(sm.brr.length * 3 / 4 / 9) * 16 / sm.rate;
const usersOfSample = id => st.song.tracks.filter(t => t.instrument === `sample:${id}`).length;
function renderSamples() {
  const box = $('#samplesView'); box.textContent = '';
  const samples = Object.entries(st.song.samples || {}), multis = Object.entries(st.song.multis || {}), t = track();
  const valid = s => s && (s.k === 's' ? st.song.samples[s.id] : st.song.multis?.[s.id]);
  if (!valid(st.smp)) st.smp = t && t.instrument.startsWith('sample:') ? { k: 's', id: t.instrument.slice(7) } : t && t.instrument.startsWith('multi:') ? { k: 'm', id: t.instrument.slice(6) } : samples[0] ? { k: 's', id: samples[0][0] } : multis[0] ? { k: 'm', id: multis[0][0] } : null;
  if (!valid(st.smp)) st.smp = null;
  const side = el('nav', 'side'); side.setAttribute('aria-label', 'The song\'s samples');
  const acts = el('div', 'acts2');
  const lf = el('button', 'b s'); lf.textContent = 'Load file…'; lf.title = 'WAV, MP3, OGG, FLAC or M4A: up to 6 seconds'; lf.onclick = () => pickSample(null);
  const rc = el('button', 'b s', '<span style="color:#D9480F">●</span> Record'); rc.title = 'Record with the microphone (up to 6 seconds)'; rc.onclick = () => recordSample(null);
  acts.append(lf, rc); side.append(acts, el('div', 'lb', 'Samples'));
  if (!samples.length) side.append(el('p', 'meta', '<span style="padding:0 12px;display:block">None yet: load a sound or record one.</span>'));
  for (const [id, sm] of samples) {
    const n = usersOfSample(id), inMulti = multis.filter(([, mu]) => mu.zones.some(z => z.sample === id)).length, onPads = Object.values(st.song.kits || {}).some(k => k.pads.some(p => p.sample === id));
    const b = el('button', `sitem${st.smp && st.smp.k === 's' && st.smp.id === id ? ' on' : ''}`, `<span class="two"><span class="nm">${esc(sm.name)}</span><small>${sm.loop >= 0 ? 'loops' : 'one shot'} · ${noteName(Math.round(sm.root))} · ${[n && `${n} track${n > 1 ? 's' : ''}`, inMulti && 'multisample', onPads && 'a pad'].filter(Boolean).join(', ') || 'not used yet'}</small></span><small class="mono">${Math.round(sm.brr.length / 1024)} KB</small>`);
    b.onclick = () => { st.smp = { k: 's', id }; renderSamples(); }; side.append(b);
  }
  side.append(el('div', 'lb', 'Multisamples'));
  for (const [id, mu] of multis) {
    const b = el('button', `sitem${st.smp && st.smp.k === 'm' && st.smp.id === id ? ' on' : ''}`, `<span class="two"><span class="nm">${esc(mu.name)}</span><small>${mu.zones.length} zone${mu.zones.length > 1 ? 's' : ''}</small></span>`);
    b.onclick = () => { st.smp = { k: 'm', id }; renderSamples(); }; side.append(b);
  }
  const nm = el('div', 'acts2'), nb = el('button', 'b s'); nb.textContent = '+ New multisample'; nb.disabled = !samples.length; nb.title = 'Several samples as one instrument, each over its own range of notes'; nb.onclick = () => newMulti(null); nm.append(nb); side.append(nm);
  const total = Math.round(samples.reduce((a, [, x]) => a + x.brr.length, 0) / 1024);
  side.append(el('div', 'total', `<div style="display:flex;justify-content:space-between"><span>All samples</span><span class="mono">${total} KB</span></div><div class="bar8"><i class="${total > 600 ? 'warn' : ''}" style="width:${Math.min(100, total / 1000 * 100)}%"></i></div><span class="muted small">The song travels inside every game page that plays it. Keep it light.</span>`));
  box.append(side);
  const main = el('div', 'edit'); box.append(main);
  if (!st.smp) { main.append(el('div', 'empty-view', '<h2>Your own sounds</h2><p>Load a sound file (WAV, MP3, OGG, FLAC, M4A) or record one with the microphone. It is kept in the song in the console\'s own compressed form, pitched from the note it plays, and can loop while a note is held. Several samples make a multisample, each over its own range of notes.</p>')); return; }
  main.append(st.smp.k === 's' ? sampleEditor(st.smp.id) : multiEditor(st.smp.id));
}
function drawWave(cv, sm) {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  if (r.width) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, d = S.brrDecode(S.fromB64(sm.brr)), n = d.length, X = i => i / n * W;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#E4E1DA'; x.fillRect(0, H / 2, W, 1);
  const le = sm.loopEnd || n;
  if (sm.loop >= 0) {
    x.fillStyle = 'rgba(31,79,209,.08)'; x.fillRect(X(sm.loop), 0, X(le) - X(sm.loop), H);
    if (sm.xfade) {   // the crossfade: the end of the loop takes on the sound that came before its start
      x.fillStyle = 'rgba(31,79,209,.16)'; x.fillRect(X(le - sm.xfade), 0, X(sm.xfade), H); x.fillRect(X(sm.loop - sm.xfade), 0, X(sm.xfade), H);
    }
    if (le < n) { x.fillStyle = 'rgba(28,28,26,.06)'; x.fillRect(X(le), 0, W - X(le), H); }   // never played while the note holds
  }
  for (let c = 0; c < W; c++) {
    let lo = 1, hi = -1; for (let i = Math.floor(c / W * n); i < Math.floor((c + 1) / W * n); i++) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
    const i0 = c / W * n;
    x.fillStyle = sm.loop >= 0 && i0 >= sm.loop && i0 < le ? SEL : sm.loop >= 0 && i0 >= le ? '#B7B2A8' : '#55534E';
    if (hi >= lo) x.fillRect(c, H / 2 - hi * H * .45, 1, Math.max(1, (hi - lo) * H * .45));
  }
  if (sm.loop >= 0) {
    x.font = `600 ${11 * dpr}px IBM Plex Sans, sans-serif`; x.textBaseline = 'top';
    for (const [at, label] of [[sm.loop, 'Loop start'], [le, 'Loop end']]) {
      const px = Math.min(W - 2 * dpr, X(at)); x.fillStyle = SEL; x.fillRect(px, 0, 2 * dpr, H);
      const w = x.measureText(label).width + 10 * dpr, lx = label === 'Loop end' ? px - w : px; x.fillRect(lx, 0, w, 16 * dpr); x.fillStyle = '#FFFFFF'; x.fillText(label, lx + 5 * dpr, 2 * dpr);
    }
  }
}
function sampleEditor(id) {
  const sm = st.song.samples[id], wrap = el('div');
  const direct = usersOfSample(id), viaMulti = Object.values(st.song.multis || {}).filter(mu => mu.zones.some(z => z.sample === id)).length;
  const n = S.sampleLen(sm), kb = Math.round(sm.brr.length / 1024);
  const hearIt = () => audition(`sample:${id}`, Math.round(sm.root), 110, 900);
  // grit and length re-make the sample from the sound as loaded (or, after a reload, from what is kept); the loop follows the sound along
  const remake = async (opts, apply) => {
    showSaved('making the sample…'); const r = await makeSample(id, opts);
    edit(() => { apply(); sm.brr = r.brr; if (sm.loop >= r.length) { sm.loop = -1; delete sm.loopEnd; delete sm.xfade; } else if (sm.loopEnd && sm.loopEnd >= r.length - 15) delete sm.loopEnd; }, { rebuild: true });
    S.prepare(st.song); showSaved();
  };
  const head = el('header', 'vhead');
  head.innerHTML = `<input class="nm" value="${esc(sm.name)}" maxlength="40" aria-label="Sample name" spellcheck="false">
    <span class="muted small">${sampleSecs(sm).toFixed(2)} s at ${sm.rate === 11025 ? 11 : sm.rate / 1000} kHz · ${kb} KB · ${direct} track${direct === 1 ? '' : 's'}${viaMulti ? `, ${viaMulti} multisample${viaMulti === 1 ? '' : 's'}` : ''}</span><span class="grow"></span>
    <button class="b s dark" data-a="hear" title="Hear it at its own note"><svg width="9" height="9"><use href="#i-play"/></svg>Hear at ${noteName(Math.round(sm.root))}</button>
    <button class="b s" data-a="replace">Replace from file…</button><button class="b s" data-a="rerecord" title="Record a new sound with the microphone in its place">Re-record</button><button class="b s danger" data-a="remove">Remove…</button>`;
  head.querySelector('.nm').onchange = e => edit(() => { sm.name = e.target.value || id; }, { rebuild: true });
  head.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'hear') hearIt();
    if (a === 'replace') { sources.delete(id); replaceId = id; $('#replaceFile').click(); }
    if (a === 'rerecord') { sources.delete(id); recFor = { id }; openRecorder(); }
    if (a === 'remove') {
      if (!await ask({ title: `Remove the sample “${sm.name}”?`, text: [direct && `The ${direct} track${direct > 1 ? 's' : ''} playing it go back to the piano.`, viaMulti && `It is a zone of ${viaMulti} multisample${viaMulti > 1 ? 's' : ''}, which lose it.`, 'Pads that played it go back to a built-in sound. You can undo this.'].filter(Boolean).join(' '), buttons: [['Cancel', null], ['Remove sample', true, 'danger dark']] })) return;
      edit(() => dropSample(id), { rebuild: true }); st.smp = null; renderSamples();
    }
  });
  wrap.append(head);
  const wb = el('div', 'wavebox');
  wb.append(el('div', '', `<span class="lb">${sm.loop >= 0 ? 'Click: where the loop starts · Shift-click: where it ends' : 'The sample as the console stores it · turn the loop on to hold a note by repeating a part'}</span>`));
  const cv = el('canvas', 'wave'); cv.title = 'With LOOP on, click where the loop should start, shift-click where it should end: the note holds by repeating that part.';
  wb.append(cv); wrap.append(wb);
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
  const g = el('div', 'sgrid');
  const c1 = el('div'), c2 = el('div'), c3 = el('div'), c4 = el('div');
  const grit = pick('Grit', rates, () => sm.rate, () => {}, { title: 'The sample rate it is kept at: lower is grittier and smaller. Made again from the original each time' });
  grit.querySelector('select').onchange = e => {
    const to = +e.target.value, f = to / sm.rate;
    remake({ rate: to }, () => { if (sm.loop >= 0) sm.loop = blockOf(sm.loop * f); if (sm.loopEnd) sm.loopEnd = blockOf(sm.loopEnd * f); if (sm.xfade) sm.xfade = Math.max(1, Math.round(sm.xfade * f)); sm.rate = to; });
  };
  c1.append(grit, el('span', 'muted small', 'Made again from the original each time, never a second squeeze.'));
  const root = el('div', 'ctl'); root.title = 'The note the sample plays as recorded: notes are pitched from it';
  root.innerHTML = `<span>Root note</span><output>${sm.root.toFixed(2)}</output>`;
  const rn = el('div', 'rootnote', `<output>${noteName(Math.round(sm.root))}</output><input type="number" min="0" max="127" step=".01" value="${sm.root}" aria-label="Root note (MIDI number)"><button class="b s" data-a="detect" title="Listen for the note it plays">Detect again</button>`); rn.style.gridColumn = '1 / -1';
  rn.querySelector('input').onchange = e => { edit(() => { sm.root = Math.max(0, Math.min(127, +e.target.value || 60)); }, { rebuild: true }); S.prepare(st.song); };
  rn.querySelector('[data-a="detect"]').onclick = () => { const r = detectRoot(S.brrDecode(S.fromB64(sm.brr)), sm.rate); if (r === null) return showSaved('no clear note in it'); edit(() => { sm.root = r; }, { rebuild: true }); S.prepare(st.song); showSaved(`it plays ${noteName(Math.round(r))} (${r.toFixed(2)})`); };
  root.append(rn); c2.append(root);
  const length = ctl('Length', () => sm.secs ?? Math.min(sampleSecs(sm), MAX_SECS), v => { sm.secs = v; }, { min: .05, max: MAX_SECS, step: .05, fmt: v => `${v.toFixed(2)} s`, title: 'Shorter keeps the song small; the rest is cut off' });
  length.querySelector('input').onchange = () => { const secs = sm.secs; delete sm.secs; st.pending = null; remake({ secs }, () => {}); };
  c3.append(length, el('span', 'muted small', 'Cut from the end · 0.05 to 6 s'));
  const lt = el('button', `b s${sm.loop >= 0 ? ' on' : ''}`); lt.dataset.a = 'loop'; lt.textContent = sm.loop >= 0 ? 'Loop while held: on' : 'Loop while held: off';
  lt.title = 'Loop: a held note repeats the part between the loop\'s start and end (strings, organs); off: it plays once (drums, plucks)';
  lt.onclick = () => { edit(() => { if (sm.loop >= 0) { sm.loop = -1; delete sm.loopEnd; delete sm.xfade; } else sm.loop = blockOf(n / 2); }, { rebuild: true }); S.prepare(st.song); };
  c4.append(lt);
  if (sm.loop >= 0) {   // a loop of its own end, and a crossfade at its seam (a studio extra: the sound under the seam is blended)
    const le = () => sm.loopEnd || n;
    const loopEnd = ctl('Loop end', () => le() / sm.rate, v => setEnd(v * sm.rate), { min: Math.min(sampleSecs(sm), (sm.loop + 16) / sm.rate), max: sampleSecs(sm), step: .01, fmt: v => `${v.toFixed(2)} s`, title: 'Where the loop ends and goes back to its start; what is after it is never played while the note is held (or click the sound with Shift)' });
    const maxX = Math.max(0, Math.min(sm.loop, (le() - sm.loop) >> 1));
    const xfade = ctl('Crossfade', () => (sm.xfade || 0) / sm.rate * 1000, v => { const x = Math.round(v * sm.rate / 1000); if (x >= 1) sm.xfade = Math.min(x, maxX); else delete sm.xfade; },
      { min: 0, max: Math.max(1, Math.floor(maxX / sm.rate * 1000)), step: 1, fmt: v => v ? `${Math.round(v)} ms` : 'off', title: 'Blends the end of the loop with the sound before its start, so a held note has no click or jump where it goes round' });
    for (const c of [loopEnd, xfade]) { c.querySelector('input').addEventListener('change', () => { S.prepare(st.song); drawWave(cv, sm); }); c.querySelector('input').addEventListener('input', () => drawWave(cv, sm)); }
    c4.append(el('span', 'muted small', `Loop start ${(sm.loop / sm.rate).toFixed(3)} s`), loopEnd, xfade);
  }
  g.append(c1, c2, c3, c4); wrap.append(g);
  requestAnimationFrame(() => drawWave(cv, sm));
  return wrap;
}
function multiEditor(id) {
  const mu = st.song.multis[id], wrap = el('div'), samples = Object.entries(st.song.samples), used = st.song.tracks.filter(t => t.instrument === `multi:${id}`).length;
  const head = el('header', 'vhead');
  head.innerHTML = `<input class="nm" value="${esc(mu.name)}" maxlength="40" aria-label="Multisample name" spellcheck="false">
    <span class="muted small">multisample · ${mu.zones.length} zone${mu.zones.length > 1 ? 's' : ''} · ${used ? `played by ${used} track${used > 1 ? 's' : ''}` : 'no track plays it yet'}</span><span class="grow"></span>
    <button class="b s" data-a="add" title="Another sample, over the notes above the last zone"${mu.zones.length >= 16 ? ' disabled' : ''}>+ Zone</button>
    <button class="b s" data-a="roots" title="Divide the notes between the zones halfway between the samples' own notes">Share out ranges from root notes</button>
    <button class="b s danger" data-a="remove">Remove…</button>`;
  head.querySelector('.nm').onchange = e => edit(() => { mu.name = e.target.value || id; }, { rebuild: true });
  head.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
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
      if (!await ask({ title: `Remove the multisample “${mu.name}”?`, text: `${used ? `The ${used} track${used > 1 ? 's' : ''} playing it go back to the piano. ` : ''}Its samples stay in the song. You can undo this.`, buttons: [['Cancel', null], ['Remove multisample', true, 'danger dark']] })) return;
      edit(() => { delete st.song.multis[id]; if (!Object.keys(st.song.multis).length) delete st.song.multis; for (const t of st.song.tracks) if (t.instrument === `multi:${id}`) t.instrument = 'piano'; }, { rebuild: true });
      st.smp = null; renderSamples();
    }
  });
  wrap.append(head);
  const box = el('div', 'multi');
  box.append(el('p', 'meta', 'Each zone plays one sample over the notes from its low note to its high note; a note no zone holds plays the nearest zone. The sample sounds at its own note and is pitched from it.'));
  const zmap = el('canvas', 'zmap'); box.append(zmap);
  const rows = el('div', 'zones');
  mu.zones.forEach((z, k) => {
    const row = el('div', 'zrow');
    row.innerHTML = `<span class="chip" style="width:10px;height:10px;border-radius:2px;background:${COLORS[k % COLORS.length]}"></span><select aria-label="Sample">${samples.map(([sid, sm]) => `<option value="${esc(sid)}">${esc(sm.name)}</option>`).join('')}</select>
      <input type="number" min="0" max="127" value="${z.lo}" aria-label="Lowest note" title="Lowest note (MIDI number)"><b>–</b><input type="number" min="0" max="127" value="${z.hi}" aria-label="Highest note" title="Highest note (MIDI number)">
      <output>${noteName(z.lo)} – ${noteName(z.hi)}</output><button class="b s" data-a="hear" title="Hear this zone">Hear</button><button class="b s" data-a="del" title="Remove this zone"${mu.zones.length < 2 ? ' disabled' : ''}>Remove</button>`;
    const [sel, lo, hi] = row.querySelectorAll('select, input');
    sel.value = z.sample;
    sel.onchange = () => { edit(() => { z.sample = sel.value; }, { rebuild: true }); S.prepare(st.song); };
    lo.onchange = () => { edit(() => { z.lo = Math.max(0, Math.min(127, Math.round(+lo.value) || 0)); if (z.hi < z.lo) z.hi = z.lo; }, { rebuild: true }); S.prepare(st.song); };
    hi.onchange = () => { edit(() => { z.hi = Math.max(0, Math.min(127, Math.round(+hi.value) || 0)); if (z.lo > z.hi) z.lo = z.hi; }, { rebuild: true }); S.prepare(st.song); };
    row.querySelector('[data-a="hear"]').onclick = () => S.prepare(st.song).then(() => audition(`multi:${id}`, Math.round((z.lo + z.hi) / 2), 110, 700));
    row.querySelector('[data-a="del"]').onclick = () => { if (mu.zones.length > 1) { edit(() => { mu.zones.splice(k, 1); }, { rebuild: true }); S.prepare(st.song); } };
    rows.append(row);
  });
  box.append(rows); wrap.append(box);
  requestAnimationFrame(() => drawZones(zmap, mu));
  return wrap;
}
// the zones over a keyboard of five and a half octaves (C1 to G7): which sample plays which notes
function drawZones(cv, mu) {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (!r.width) return;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, lo = 24, hi = 103, kw = W / (hi - lo + 1), X = n => (n - lo) * kw;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  const keyTop = H * .45;
  for (let n = lo; n <= hi; n++) { x.fillStyle = isBlack(n) ? '#3A3936' : '#FBFAF7'; x.fillRect(X(n), keyTop, kw - .5 * dpr, H - keyTop); if (n % 12 === 0) { x.fillStyle = '#4A4843'; x.font = `500 ${9 * dpr}px IBM Plex Mono, monospace`; x.textBaseline = 'bottom'; x.fillText(noteName(n), X(n) + 2 * dpr, H - 2 * dpr); } }
  mu.zones.forEach((z, k) => {
    const a = Math.max(lo, z.lo), b = Math.min(hi, z.hi); if (b < a) return;
    const col = COLORS[k % COLORS.length], sm = st.song.samples[z.sample];
    x.fillStyle = hexA(col, .22); x.fillRect(X(a), 4 * dpr, X(b + 1) - X(a) - 2 * dpr, keyTop - 8 * dpr);
    x.strokeStyle = col; x.lineWidth = dpr; x.strokeRect(X(a) + .5, 4 * dpr + .5, X(b + 1) - X(a) - 3 * dpr, keyTop - 9 * dpr);
    x.fillStyle = INK; x.font = `600 ${11 * dpr}px IBM Plex Sans, sans-serif`; x.textBaseline = 'top';
    x.save(); x.beginPath(); x.rect(X(a), 0, X(b + 1) - X(a) - 4 * dpr, keyTop); x.clip(); x.fillText(sm ? sm.name : z.sample, X(a) + 5 * dpr, 9 * dpr); x.restore();
    if (sm && sm.root >= lo && sm.root <= hi) { x.fillStyle = col; x.fillRect(X(Math.round(sm.root)), keyTop, kw, 4 * dpr); }
  });
}
let replaceId = null;
const rf = document.createElement('input'); rf.type = 'file'; rf.accept = 'audio/*'; rf.id = 'replaceFile'; rf.hidden = true; document.body.append(rf);
rf.onchange = async () => {
  const f = rf.files[0], id = replaceId; rf.value = ''; if (!f || !id) return;
  try { await replaceSample(id, await decodeFile(f)); } catch (err) { showSaved(`could not use that sound: ${err.message || err}`); }
};

// ---------- WHERE IT PLAYS: the places in the game, its levels to look at, a live preview with the song inside, and the hand-off ----------
let LEVELS = [], LEGEND = {}, preview = { ready: false, want: null };
async function loadLevels() {
  if (!GAME_ID) return;
  try {
    const m = await (await fetch(`/games/${GAME_ID}/game.json`, { cache: 'no-store' })).json();
    if (m.levels) { LEGEND = m.levels.legend || {}; LEVELS = findLevels(await (await fetch(`/src/games/${GAME_ID}/${m.levels.file}`, { cache: 'no-store' })).text()); }
  } catch { }
  if (st.page === 'where') renderWhere();
}
const levelName = i => LEVELS[i] ? LEVELS[i].name.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) : `level ${i + 1}`;
function placesText() {
  const p = st.song.places, at = [p.title && 'on the title screen', ...p.levels.map(l => `in ${levelName(l)}`)].filter(Boolean);
  return (at.length ? at.join(', ') : 'nowhere yet') + (p.note ? ` (${p.note})` : '');
}
function renderWhere() {
  const box = $('#where'), p = st.song.places;
  box.innerHTML = GAME_ID ? `<div class="places">
      <div class="lb" style="padding:14px 16px 8px">Places in ${esc(project.title)}</div>
      <label class="place"><input type="checkbox" data-place="title"${p.title ? ' checked' : ''}><canvas class="mini" aria-hidden="true"></canvas><span class="pname">Title screen</span>
        <button class="b s" data-go="title" title="Open the game's title screen with this song">Preview</button></label>
      ${LEVELS.map((l, i) => `<label class="place"><input type="checkbox" data-place="${i}"${p.levels.includes(i) ? ' checked' : ''}>
        <canvas class="mini" data-mini="${i}" title="${esc(l.name)}"></canvas><span class="pname">${esc(levelName(i))}</span>
        <button class="b s" data-go="${i}" title="Play this level with this song">Preview</button></label>`).join('')}
      ${LEVELS.length ? '' : '<p class="meta" style="padding:12px 16px">This game has no level maps; say where in the note.</p>'}
      <label class="pnote"><span class="lb">When exactly</span>
        <textarea maxlength="300" placeholder="e.g. when a cat-bot chases Pip; quieter in the spacewalk">${esc(p.note)}</textarea>
        <span class="muted small">Read by the Claude session that wires the song in.</span></label>
    </div>` : `<div class="places"><p class="meta" style="padding:16px">A sketch belongs to no game, so it has no places yet. Open a game's project (the project name, top left) to place a song in its game and play it there; a sketch can still be handed to a session for any game, on the right.</p></div>`;
  const pv = el('div', 'pv');
  if (GAME_ID) pv.innerHTML = `<div class="pvbar"><i class="dot" id="pvDot"></i><span id="pvInfo" class="small">Pick a place and press Preview: the game opens there and plays this song instead of its own (click the game once for sound).</span>
      <span class="grow"></span><button class="b s" id="pvOwn" title="Give the game its own music back">Back to the game's own music</button></div>
      <iframe id="pvFrame" title="The game, playing this song" allow="autoplay"></iframe>
      <span class="muted small">Leaving this view stops the preview. The game's own music is untouched until a session brings the song over.</span>`;
  const ho = el('section', 'handoff');
  ho.innerHTML = `<div class="row"><b>Put it into a game</b><select id="gameSel" aria-label="The game it is for"><option value="">choose…</option></select><span class="grow"></span>
    <span class="muted small" id="promptNote"></span><button class="b dark s" id="copyPrompt">Copy prompt</button></div><pre class="prompt" id="promptText"></pre>`;
  pv.append(ho); box.append(pv);
  box.querySelectorAll('[data-place]').forEach(c => c.onchange = () => edit(() => {
    const k = c.dataset.place;
    if (k === 'title') p.title = c.checked;
    else { const i = +k; p.levels = c.checked ? [...new Set([...p.levels, i])].sort((a, b) => a - b) : p.levels.filter(l => l !== i); }
  }));
  box.querySelector('textarea')?.addEventListener('change', e => edit(() => { p.note = e.target.value.slice(0, 300); }));
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); previewAt(b.dataset.go === 'title' ? null : +b.dataset.go); });
  const own = box.querySelector('#pvOwn'); if (own) own.onclick = () => { send({ type: 'pixelite:music', song: null }); $('#pvDot').className = 'dot'; };
  // each level as a little picture, one pixel per tile
  box.querySelectorAll('[data-mini]').forEach(cv => {
    const rows = LEVELS[+cv.dataset.mini].rows, w = rows[0].length, h = rows.length;
    cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(toPixels(rows, LEGEND), w, h), 0, 0);
  });
  preview.ready = false;
  renderPrompt();
}
// the prompt that hands a saved song to a Claude session, to put it into a game
async function renderPrompt() {
  await games();
  const sel = $('#gameSel'); if (!sel) return;
  sel.innerHTML = '<option value="">choose…</option>' + gamesList.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('');
  sel.value = st.meta.game || '';
  const text = () => {
    const g = sel.value, id = st.meta.id;
    $('#promptNote').textContent = !id || st.dirty ? 'Save first: the session reads the saved song' : '';
    if (!id || st.dirty) return 'Save the song first: the session reads the saved one.';
    if (!g) return 'Choose the game it is for.';
    return [`Put the song "${st.song.title}" from the SOUND STUDIO into ${gamesList.find(x => x.id === g)?.title || g} (games/${g}/):`,
      `1. Read it with the D1 connector: SELECT data FROM songs WHERE id = '${id}';`,
      `   and save it as games/${g}/music/${id}.song.json`,
      `2. node tools/song.mjs ${g}   (writes games/${g}/songs.js; add it to game.json's parts if it is new)`,
      `3. It plays ${placesText()} (its places, set under WHERE IT PLAYS, are in the song: tools/song.mjs writes them to SONG_AT).`,
      `   Make sure the game plays SONG_AT's songs there (engine/API.md, the music director; Space Mouse's afterFrame is an example).`,
      `4. Verify it (pixelite-verify) and open a pull request.`].join('\n');
  };
  sel.onchange = () => { if (st.meta.game !== sel.value) { st.meta.game = sel.value; st.dirty = true; showSaved(); } $('#promptText').textContent = text(); };
  $('#promptText').textContent = text();
  $('#copyPrompt').onclick = async () => { try { await navigator.clipboard.writeText($('#promptText').textContent); $('#copyPrompt').textContent = 'Copied'; setTimeout(() => { if ($('#copyPrompt')) $('#copyPrompt').textContent = 'Copy prompt'; }, 1500); } catch { } };
}
const send = msg => { const f = $('#pvFrame'); if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*'); };
function previewAt(level) {
  if (S.playing) stopAll();
  const f = $('#pvFrame');
  preview.want = level;
  $('#pvInfo').textContent = level === null ? 'The title screen, with this song. Click the game for sound; Enter starts it.' : `${levelName(level)}, with this song. Click the game for sound, then play.`;
  $('#pvDot').className = 'dot on';
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

// ---------- MIXER: every track's fader, pan and sends side by side, with its level, and the master ----------
function renderMixer() {
  const box = $('#mixer'), T = st.song.tracks, M = st.song.master, snes = st.song.snes;
  box.textContent = '';
  const fader = (label, get, set, { min = 0, max = 1, step = .01, fmt = pct, v = false, title = '', off = false } = {}) => {
    const c = el('label', `mx${v ? ' v' : ''}`); if (title) c.title = title; if (off) c.style.opacity = '.45';
    c.innerHTML = `<span>${esc(label)}</span><output>${fmt(get())}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${get()}" aria-label="${esc(label)}">`;
    const inp = c.querySelector('input'), out = c.querySelector('output');
    inp.oninput = () => { tweak(() => set(+inp.value)); out.textContent = fmt(get()); };
    inp.onchange = () => { settle(); renderTracks(); };   // (the track headers' own sliders show the same numbers)
    return c;
  };
  T.forEach((t, i) => {
    const c = el('section', `chan${i === st.sel ? ' sel' : ''}${t.mute ? ' muted' : ''}`); c.style.setProperty('--c', trackColor(i));
    c.innerHTML = `<header><b title="${esc(t.name)}">${esc(t.name)}</b><span class="muted">${esc(insName(t.instrument) || t.instrument)}</span></header>`;
    c.append(fader('Pan', () => t.pan, v => { t.pan = v; }, { min: -1, max: 1, step: .05, fmt: panFmt }),
      fader('Echo', () => t.sends.echo, v => { t.sends.echo = v; }), fader('Reverb', () => t.sends.reverb, v => { t.sends.reverb = v; }, { off: snes, title: snes ? 'Off in SNES limits mode' : '' }));
    const msb = el('div', 'ms', `<button class="mbtn${t.mute ? ' on' : ''}" data-k="mute" aria-pressed="${t.mute}">M</button><button class="sbtn${t.solo ? ' on' : ''}" data-k="solo" aria-pressed="${t.solo}">S</button>`);
    const faders = el('div', 'faders'), vm = el('span', 'vmeter', '<i></i>');
    faders.append(vm, fader('Volume', () => t.volume, v => { t.volume = v; }, { v: true }));
    c.append(msb, faders);
    c.querySelectorAll('[data-k]').forEach(b => b.onclick = e => { e.stopPropagation(); edit(() => { t[b.dataset.k] = !t[b.dataset.k]; }, { rebuild: true }); });
    c.addEventListener('pointerdown', () => selectTrack(i));
    box.append(c);
  });
  const mc = el('section', 'chan master'); mc.style.setProperty('--c', REC); mc.innerHTML = '<header><b>Master</b><span>stereo out</span></header>';
  const mf = el('div', 'faders'); mf.append(fader('Volume', () => M.volume, v => { M.volume = v; }, { v: true }));
  mc.append(fader('Echo', () => M.echo.volume, v => { M.echo.volume = v; }), fader('Reverb', () => M.reverb.volume, v => { M.reverb.volume = v; }, { off: snes }), mf);
  box.append(mc);
  // the master's effects
  const fx = $('#masterFx'); fx.textContent = '';
  const echo = mod('Echo', '', 'the console\'s own');
  echo.body.append(
    ctl('Delay', () => M.echo.delay, v => { M.echo.delay = Math.round(v); }, { min: 1, max: 15, step: 1, fmt: v => `${v * 16} ms` }),
    ctl('Feedback', () => M.echo.feedback, v => { M.echo.feedback = v; }, { min: -.9, max: .9, step: .01, fmt: pct }),
    pick('Echo filter', S.FIRS.map(f => [f, f]), () => M.echo.fir, v => { M.echo.fir = v; }),
    ctl('Level', () => M.echo.volume, v => { M.echo.volume = v; }, { fmt: pct, title: 'The echo\'s return (it also follows the song\'s ECHO LEVEL lane)' }));
  const rev = mod('Reverb', snes ? 'off' : '', snes ? 'off in SNES limits mode' : '');
  rev.body.append(
    ctl('Size', () => M.reverb.size, v => { M.reverb.size = v; }, { min: .3, max: 5, step: .1, fmt: v => `${v.toFixed(1)} s` }),
    ctl('Damp', () => M.reverb.damp, v => { M.reverb.damp = v; }, { fmt: pct }),
    ctl('Level', () => M.reverb.volume, v => { M.reverb.volume = v; }, { fmt: pct }));
  const eq = mod('Master EQ', snes ? 'off' : '', snes ? 'off in SNES limits mode' : '');
  eq.body.append(ctl('Bass', () => M.eq.low, v => { M.eq.low = v; }, { min: -12, max: 12, step: .5, fmt: db }), ctl('Treble', () => M.eq.high, v => { M.eq.high = v; }, { min: -12, max: 12, step: .5, fmt: db }));
  const glue = mod('Glue', snes ? 'off' : '', snes ? 'off in SNES limits mode' : 'a compressor on the master');
  glue.body.append(ctl('Amount', () => M.comp, v => { M.comp = v; }, { fmt: pct, title: 'The compressor: holds the mix together and louder' }), el('p', 'meta', 'Holds the mix together and keeps loud moments from clipping in the game.'));
  fx.append(echo, rev, eq, glue);
}

// ---------- the views ----------
const VIEWS = { arrange: '#arrange', sound: '#soundView', samples: '#samplesView', kits: '#kitView', mixer: '#mixerView', where: '#where' };
function showView(name) {
  const was = st.page; st.page = name;
  for (const [k, sel] of Object.entries(VIEWS)) $(sel).hidden = k !== name;
  document.body.className = `studio v-${name}`;
  document.querySelectorAll('.vtab').forEach(b => { const on = b.dataset.view === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  if (was === 'where' && name !== 'where') { send({ type: 'pixelite:music', song: null }); const f = $('#pvFrame'); if (f) f.src = 'about:blank'; }
  renderView();
}
function renderView() {
  if (st.page === 'arrange') { renderPat(); requestAnimationFrame(() => { sizeRoll(); drawArr(); drawRoll(); }); }
  if (st.page === 'sound') renderSound();
  if (st.page === 'samples') renderSamples();
  if (st.page === 'kits') renderKits();
  if (st.page === 'mixer') renderMixer();
  if (st.page === 'where') renderWhere();
}
document.querySelectorAll('.vtab').forEach(b => b.onclick = () => showView(b.dataset.view));
document.querySelectorAll('.btab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.btab').forEach(x => x.classList.toggle('on', x === b));
  $('#bBeats').hidden = b.dataset.b !== 'beats'; $('#bMarkers').hidden = b.dataset.b !== 'markers';
});

// ---------- the top bar ----------
function syncTransport() {
  const s = st.song;
  if (document.activeElement !== $('#title')) $('#title').value = s.title;
  $('#bpm').value = s.bpm; $('#bars').value = s.bars; $('#beats').value = s.beatsPerBar;
  const tog = (id, on) => { $(id).setAttribute('aria-pressed', String(on)); $(id).classList.toggle('on', on); };
  tog('#loopBtn', s.loop.on); tog('#clickBtn', st.click); tog('#countBtn', st.countIn); tog('#snesBtn', s.snes);
  $('#quantBtn').checked = st.quant; $('#followBtn').checked = st.follow; $('#ghostBtn').checked = st.ghost;
  $('#grid').value = String(st.grid); $('#scale').value = st.scale; $('#chord').value = st.chord;
  showKeys();
}
function renderAll() { syncTransport(); renderTracks(); renderAddIns(); renderDock(); renderBeats(); renderMarkers(); showUndo(); renderView(); showPos(); }
$('#title').onchange = e => edit(() => { st.song.title = e.target.value.slice(0, 80) || 'Untitled'; });
$('#title').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
$('#bpm').onchange = e => edit(() => { st.song.bpm = Math.max(30, Math.min(300, +e.target.value || 120)); }, { rebuild: true });
$('#bars').onchange = e => edit(() => { const s = st.song; s.bars = Math.max(1, Math.min(512, Math.round(+e.target.value) || 8)); const E = S.songEnd(s); s.loop.end = Math.min(s.loop.end, E); s.loop.start = Math.min(s.loop.start, s.loop.end - PPQ); }, { rebuild: true });
$('#beats').onchange = e => edit(() => { st.song.beatsPerBar = Math.max(1, Math.min(12, Math.round(+e.target.value) || 4)); }, { rebuild: true });
$('#loopBtn').onclick = () => edit(() => { st.song.loop.on = !st.song.loop.on; if (st.song.loop.end <= st.song.loop.start) st.song.loop = { on: true, start: 0, end: end() }; }, { rebuild: true });
$('#snesBtn').onclick = () => edit(() => { st.song.snes = !st.song.snes; }, { rebuild: true });
$('#clickBtn').onclick = () => { st.click = !st.click; S.metronome = st.click; syncTransport(); };
$('#countBtn').onclick = () => { st.countIn = !st.countIn; syncTransport(); };
$('#quantBtn').onchange = e => { st.quant = e.target.checked; };
$('#followBtn').onchange = e => { st.follow = e.target.checked; };
$('#ghostBtn').onchange = e => { st.ghost = e.target.checked; layout.ghost = st.ghost; saveLayout(); drawRoll(); };
$('#keysBtn').onclick = () => { audio(); st.keys = !st.keys; showKeys(); };
$('#lane').onchange = e => { st.lane = e.target.value; showHint(); drawRoll(); R.cv.focus({ preventScroll: true }); };
$('#grid').onchange = e => { st.grid = +e.target.value; st.len = Math.max(st.grid, st.len); drawRoll(); };
$('#scale').innerHTML = '<option value="">off</option>' + ['major', 'minor', 'dorian', 'mixolydian', 'major pentatonic', 'minor pentatonic', 'blues'].map(m => `<optgroup label="${m}">${NAMES.map((n, i) => `<option value="${i}:${m}">${n} ${m}</option>`).join('')}</optgroup>`).join('');
$('#scale').onchange = e => { st.scale = e.target.value; layout.scale = st.scale; saveLayout(); drawRoll(); };
$('#chord').onchange = e => { st.chord = e.target.value; };
$('#qBtn').onclick = quantizeSel; $('#humBtn').onclick = humanizeSel; $('#legBtn').onclick = legatoSel;
$('#tDown').onclick = () => moveSel(0, -1); $('#tUp').onclick = () => moveSel(0, 1); $('#oDown').onclick = () => moveSel(0, -12); $('#oUp').onclick = () => moveSel(0, 12);
$('#playBtn').onclick = play; $('#recBtn').onclick = record;
$('#stopBtn').onclick = () => { if (S.playing) stopAll(); else { st.start = 0; showPos(); drawRoll(); drawArr(); } };
$('#rewBtn').onclick = () => { if (S.playing) { stopAll(); play(); } else { showPos(); drawRoll(); drawArr(); } };
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
$('#midiBtn').onclick = connectMidi;
$('#addBeat').onclick = newBeat; $('#beatFromSel').onclick = beatFromSelection;
$('#addMarker').onclick = () => addMarker(Math.min(end() - barTicks(), Math.floor(st.start / barTicks()) * barTicks()));
// tap tempo: a few taps and the tempo follows (one undo step, a moment after the last tap)
let taps = [], tapT = 0;
$('#tapBtn').onclick = () => {
  const now = performance.now(); taps = taps.filter(t => now - t < 2500).slice(-5); taps.push(now);
  if (taps.length < 3) return showSaved(`tap ${3 - taps.length} more…`);
  const bpm = Math.round(Math.max(30, Math.min(300, 60000 * (taps.length - 1) / (taps[taps.length - 1] - taps[0]))));
  tweak(() => { st.song.bpm = bpm; }); $('#bpm').value = bpm; showSaved(`tempo ${bpm} BPM`);
  clearTimeout(tapT); tapT = setTimeout(() => { settle(); showSaved(); }, 1600);
};
// the help: every key and gesture, in groups
const HELP = [
  ['Play and record', [['Play / stop', 'Space'], ['Back to the start of the song', 'Enter'], ['Record into the selected track', 'R'], ['Loop on / off', 'L'], ['Metronome', 'K'], ['Undo / redo', 'Ctrl Z / Ctrl Shift Z'], ['Save', 'Ctrl S']], 'The ruler: click puts the start mark (where play begins), drag marks the loop. Count-in plays a bar of clicks before recording.'],
  ['Notes', [['Add a note', 'click'], ['Move it / lengthen it', 'drag / drag its end'], ['Select several', 'Shift drag'], ['Add one to the selection', 'Shift click'], ['Delete', 'right-click, Del'], ['Select all of the track', 'Ctrl A'], ['Copy / paste at the start mark', 'Ctrl C / Ctrl V'], ['Duplicate after itself', 'Ctrl D']], 'Chord in the editor\'s bar stamps a whole chord with each new note; Scale shades the notes outside it.'],
  ['Move and tidy notes', [['A semitone up / down', '↑ ↓'], ['An octave', 'Shift ↑ ↓'], ['By the grid', '← →'], ['Quantize to the grid', 'Q'], ['Humanize (a little loose)', 'H'], ['Scroll / sideways / zoom', 'wheel / Shift / Ctrl']], 'Legato makes each selected note last until the next one starts.'],
  ['Lanes', [['Velocity', 'drag under a note'], ['Add a point', 'click the lane'], ['Delete a point', 'right-click it'], ['Bend a stretch of line', 'Shift drag'], ['Straight again', 'Shift click the point'], ['Tempo glides to a point', 'Shift click it']], 'Lane in the editor\'s bar: volume, pan, filter, pitch bend, echo and reverb sends, a sample\'s loop point; for the whole song tempo and the echo\'s level and feedback.'],
  ['Arrange and clips', [['Place a beat', 'drag it from the list'], ['Move / copy a clip', 'drag / Alt drag'], ['Loop it', 'drag its right edge'], ['Trim its start', 'drag its left edge'], ['Cut at the start mark', 'Ctrl E'], ['Duplicate / delete', 'Ctrl D / Del'], ['Snap to the grid', 'Shift while dragging'], ['Open its beat', 'double-click'], ['Everything else', 'right-click']], 'A track\'s header: right-click for duplicate, move, delete. Drag the bars between panels to resize them (double-click: back to normal).'],
  ['Beats and steps', [['New beat', 'B'], ['Beat from selected notes', 'Shift B'], ['Play the beat alone', 'Space'], ['A hit on a step', 'click'], ['Soft, medium, hard', 'Shift click'], ['Paint or erase a run', 'drag'], ['Close the beat', 'Esc']], 'Every clip of a beat plays the same notes: a change is heard in all of them. Make unique (right-click a clip) gives one clip its own copy.'],
  ['Markers', [['Add a marker', 'M, or right-click the ruler'], ['Start mark to a marker', 'click it'], ['Loop a section', 'Loop by a marker in the list']], 'Markers name places in the song (Intro, Chorus, Boss).'],
  ['Playing live', [['Computer keys on / off', 'Turn on, side panel'], ['White keys', 'A S D F G H J K'], ['Black keys', 'W E T Y U'], ['Octave down / up', 'Z / X'], ['MIDI keyboard', 'Connect (Chrome, Edge)'], ['Phone', 'Pair: scan the code']], 'All of them play the selected track and record. A sustain pedal and pitch bend work on a MIDI keyboard; the phone has a sustain button.']
];
$('#helpGrid').innerHTML = HELP.map(([t, rows, p]) => `<section><h3>${esc(t)}</h3>${rows.map(([a, k]) => `<div class="r"><span>${esc(a)}</span><kbd>${esc(k)}</kbd></div>`).join('')}${p ? `<p>${esc(p)}</p>` : ''}</section>`).join('')
  + '<section><h3>The views</h3><p><b>Track sound</b>: the selected track\'s instrument, pitch, envelope, vibrato, sends and tone. <b>Samples</b>: your own sounds (a file or the microphone), their note, length and loop, and multisamples. <b>Drum kits</b>: pads of built-in drums or your samples, with tune, level, pan and choke groups. <b>Mixer</b>: every fader and the master\'s echo, reverb, EQ and glue. <b>Where it plays</b>: the places in the game, a preview inside the game, and the prompt that hands the song to a Claude session.</p><p>SNES limits keeps only what the console had: 8 voices and its echo. The voice meter in the top bar shows how many sound now.</p></section>';
$('#helpBtn').onclick = () => $('#help').showModal();
function renderAddIns() { const v = $('#addIns').value || 'strings'; $('#addIns').innerHTML = insOptions(false); $('#addIns').value = v; if (!$('#addIns').value) $('#addIns').value = 'strings'; }
$('#addTrack').onclick = () => { if (st.song.tracks.length >= 32) return; if (st.beat) stopAll(); const id = $('#addIns').value; edit(() => { st.song.tracks.push(Object.assign(S.newTrack(id), { name: insName(id) || 'Track' })); st.sel = st.song.tracks.length - 1; }, { rebuild: true }); focusTrack(); drawRoll(); S.prepare(st.song); };
$('#newBtn').onclick = async () => { if (await replaceOk()) load(template()); };
$('#saveBtn').onclick = () => save();
const menu = $('#more');
$('#moreBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#moreBtn').setAttribute('aria-expanded', String(!menu.hidden)); };
const closeMenu = () => { menu.hidden = true; $('#moreBtn').setAttribute('aria-expanded', 'false'); };
addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
menu.addEventListener('click', e => { if (e.target.closest('button')) closeMenu(); });
$('#wavBtn').onclick = exportWav; $('#exportBtn').onclick = exportFile; $('#promptBtn').onclick = () => showView('where');
$('#importFile').onchange = e => { closeMenu(); const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; };
$('#midiExportBtn').onclick = exportMidi;
$('#importMidi').onchange = e => { closeMenu(); const f = e.target.files[0]; if (f) importMidi(f); e.target.value = ''; };
$('#dupSongBtn').onclick = () => save(true);
$('#delSongBtn').onclick = async () => {
  if (!st.meta.id) return showSaved('this song is not on the site');
  if (!await ask({ title: `Delete “${st.song.title}” from the site?`, text: 'This page keeps it as an unsaved draft until another song is opened.', buttons: [['Cancel', null], ['Delete from the site', true, 'danger dark']] })) return;
  try { await api(`/api/songs/${st.meta.id}`, { method: 'DELETE' }); st.meta = { id: null, updated_at: null, game: st.meta.game }; st.dirty = true; showSaved(); saveDraft(); listSongs(); } catch (e) { showSaved(`not deleted: ${e.message}`); }
};
// the editor fills whatever room the window and the tracks above it leave
new ResizeObserver(() => { if (st.page === 'arrange') { sizeRoll(); drawRoll(); } }).observe(R.cv.parentElement);
new ResizeObserver(() => drawArr()).observe(A.cv.parentElement);
// ---------- the panels' sizes are yours to change: the bars between them drag, and double-click puts them back ----------
const LAYOUT_KEY = 'pixelite.studio.layout';
const layout = (() => { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { return {}; } })();
function saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { } }
function applyLayout() {
  const cl2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), arr = $('#arrange');
  if (layout.wL) arr.style.setProperty('--wL', cl2(layout.wL, 200, 480) + 'px'); else arr.style.removeProperty('--wL');
  if (layout.wR) $('#desk').style.setProperty('--wR', cl2(layout.wR, 220, 520) + 'px'); else $('#desk').style.removeProperty('--wR');
  if (layout.arrH) $('#arrWrap').style.setProperty('--arrH', Math.max(60, layout.arrH) + 'px'); else $('#arrWrap').style.removeProperty('--arrH');
}
function splitter(sp, start, move) {
  sp.addEventListener('pointerdown', e => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('on');
    const s0 = start(), x0 = e.clientX, y0 = e.clientY;
    const mv = ev => { move(s0, ev.clientX - x0, ev.clientY - y0); applyLayout(); };
    const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); sp.classList.remove('on'); saveLayout(); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
  });
  sp.addEventListener('dblclick', () => { move(null, 0, 0); applyLayout(); saveLayout(); });
}
splitter($('#splitL'), () => $('.tracks').getBoundingClientRect().width, (w, dx) => { if (w === null) delete layout.wL; else layout.wL = Math.round(w + dx); });
splitter($('#splitR'), () => $('#browser').getBoundingClientRect().width, (w, dx) => { if (w === null) delete layout.wR; else layout.wR = Math.round(w - dx); });
splitter($('#splitA'), () => $('#arrWrap').getBoundingClientRect().height, (h, dx, dy) => { if (h === null) delete layout.arrH; else layout.arrH = Math.round(h + dy); });
st.ghost = layout.ghost ?? true; st.scale = layout.scale || '';
applyLayout();
addEventListener('beforeunload', () => { saveDraft(); });
document.addEventListener('pointerdown', () => { if (!S.ctx) audio(); }, { once: true, capture: true });

// ---------- start: the project, then the draft from last time, else a new song ----------
(async () => {
  await games();
  project = gamesList.find(g => g.id === GAME_ID) || { id: '', title: GAME_ID ? GAME_ID : 'Sketches' };
  $('#projName').textContent = project.title;
  document.title = `${project.title} · Sound Studio · Pixelite`;
  let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT)); } catch { }
  let loaded = false;
  try { if (d && d.song) { load(d.song, d.meta, !!d.dirty); loaded = true; } } catch { }
  if (!loaded) load(template());
  showHint(); showView('arrange');
  if (PROJECT === null) showProjects(); else listSongs();
  loadLevels();
})();
requestAnimationFrame(frame);
window.studio = { st, S, A, R };   // for tests and curious hands in the console
