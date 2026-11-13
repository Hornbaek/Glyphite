// The phone pad: the phone as a drum pad and keyboard for the SOUND STUDIO running on a computer (the studio's PHONE button shows the
// link). Touches become notes sent over the connection in padlink.mjs; the sound comes out of the computer.
import { PadGuest } from './padlink.mjs';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
let code = (params.get('c') || '').replace(/\D/g, '').slice(0, 6), guest = null;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
// the studio's built-in kit: 16 pads on General MIDI notes (the same ones a new drum kit starts with)
const DEFAULT_PADS = [[36, 'Kick'], [38, 'Snare'], [37, 'Rim'], [39, 'Clap'], [42, 'Closed hat'], [46, 'Open hat'], [41, 'Low tom'], [45, 'Mid tom'],
  [48, 'High tom'], [49, 'Crash'], [51, 'Ride'], [70, 'Shaker'], [54, 'Tambourine'], [35, 'Kick 2'], [40, 'Snare 2'], [44, 'Pedal hat']].map(([note, name]) => ({ note, name }));
const state = { view: 'pads', base: 48, byHeight: true, sustain: false };
const down = new Map();   // pointerId -> { note, el }

const send = m => { if (guest) guest.send(m); };
function noteOn(e, note, el) {
  if (down.has(e.pointerId)) return;
  const r = el.getBoundingClientRect(), rel = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  const vel = state.byHeight ? Math.round(127 - rel * 67) : 100;
  down.set(e.pointerId, { note, el }); el.classList.add('hit'); send(['on', note, vel]);
  if (navigator.vibrate) navigator.vibrate(6);
}
function noteOff(e) {
  const d = down.get(e.pointerId); if (!d) return;
  down.delete(e.pointerId); if (![...down.values()].some(x => x.el === d.el)) d.el.classList.remove('hit');
  send(['off', d.note]);
}
function wire(el, note) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); noteOn(e, note, el); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, noteOff);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function renderPads(pads) {
  const box = $('#pads'); box.textContent = '';
  for (const p of pads.slice(0, 16)) {
    const b = document.createElement('button'); b.className = 'pad'; b.innerHTML = `<small>${noteName(p.note)}</small>`; b.append(p.name || noteName(p.note));
    wire(b, p.note); box.append(b);
  }
}
function renderKeys() {
  const board = $('#board'); board.textContent = '';
  const whites = [0, 2, 4, 5, 7, 9, 11], span = 14, w = 100 / span;   // two octaves of white keys
  for (let i = 0; i < span; i++) {
    const note = state.base + Math.floor(i / 7) * 12 + whites[i % 7], k = document.createElement('button');
    k.className = 'key'; k.style.left = `${i * w}%`; k.style.width = `${w}%`; k.textContent = note % 12 === 0 ? noteName(note) : '';
    wire(k, note); board.append(k);
  }
  for (let i = 0; i < span; i++) {   // black keys sit on the line between two whites, where there is a semitone between them
    const pc = whites[i % 7]; if (![0, 2, 5, 7, 9].includes(pc)) continue;
    const note = state.base + Math.floor(i / 7) * 12 + pc + 1, k = document.createElement('button');
    k.className = 'key black'; k.style.left = `${(i + 1) * w - w * .3}%`; k.style.width = `${w * .6}%`;
    wire(k, note); board.append(k);
  }
  $('#octOut').textContent = `${noteName(state.base)}–${noteName(state.base + 24)}`;
}
function show(view) {
  state.view = view;
  $('#pads').hidden = view !== 'pads'; $('#keys').hidden = view !== 'keys';
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.v === view));
  for (const [id, n] of down) { send(['off', n.note]); n.el.classList.remove('hit'); down.delete(id); }
}
const STATUS = { looking: ['no studio is waiting for this code: open the studio, press PHONE', 'bad'], connecting: ['connecting…', ''], open: ['connected', 'open'], lost: ['lost: reconnecting…', 'bad'], stopped: ['stopped', ''] };
function setStatus(s) {
  const [text, cls] = STATUS[s] || [s, ''], el = $('#status'); el.textContent = text; el.className = `status ${cls}`;
  const live = s === 'open';
  $('#tabs').hidden = !live; $('#bottom').hidden = !live; $('#pads').hidden = !live || state.view !== 'pads'; $('#keys').hidden = !live || state.view !== 'keys';
  if (live) wake();
}
let lock = null;
async function wake() { try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && guest && guest.status === 'open') wake(); });

function start() {
  $('#codeForm').hidden = true; renderPads(DEFAULT_PADS); renderKeys();
  guest = new PadGuest({
    code,
    onState: setStatus,
    onMessage: m => {
      if (m[0] !== 'pads') return;
      if (Array.isArray(m[1].pads) && m[1].pads.length) renderPads(m[1].pads);
      if (m[1].mode === 'pads' || m[1].mode === 'keys') show(m[1].mode);
    }
  });
  setStatus('looking'); guest.run();
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) show(t.dataset.v); });
$('#octDown').addEventListener('click', () => { state.base = Math.max(12, state.base - 12); renderKeys(); });
$('#octUp').addEventListener('click', () => { state.base = Math.min(84, state.base + 12); renderKeys(); });
$('#velBtn').addEventListener('click', e => { state.byHeight = !state.byHeight; e.currentTarget.setAttribute('aria-pressed', String(state.byHeight)); e.currentTarget.textContent = state.byHeight ? 'HARDER UP HIGH' : 'ALWAYS MEDIUM'; });
$('#susBtn').addEventListener('click', e => { state.sustain = !state.sustain; e.currentTarget.setAttribute('aria-pressed', String(state.sustain)); send(['cc', 64, state.sustain ? 127 : 0]); });
$('#codeForm').addEventListener('submit', e => { e.preventDefault(); code = $('#codeIn').value.replace(/\D/g, '').slice(0, 6); if (code.length === 6) start(); });
if (code.length === 6) start(); else { $('#codeForm').hidden = false; $('#status').textContent = 'enter the code'; }
