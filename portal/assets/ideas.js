// The idea bank page: docs/ideas.json (served as /ideas/ideas.json) plus what we decided about each idea
// (stars, status, note) from the Worker's D1-backed API (/api/ideas, worker/ideas.js). Every change is
// saved at once; the card shows "saving…", "saved" or the error, and goes back to its old value on failure.
import { STATUSES, NOTE_MAX } from '/assets/ideas-status.mjs';

const SIZES = ['tiny', 'small', 'medium', 'large', 'moonshot'];
const WILD = ['practical', 'bold', 'crazy'];
const BAR = { tiny: '#....', small: '##...', medium: '###..', large: '####.', moonshot: '#####' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// `code` in the brainstorm's text becomes <code>, unless a lone backtick (an idea about the glyph itself) makes the pairs ambiguous
const rich = s => { const e = esc(s); return e.split('`').length % 2 ? e.replace(/`([^`]+)`/g, '<code>$1</code>') : e; };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const blank = () => ({ starred: false, status: 'idea', note: '' });

const state = { q: '', sizes: new Set(SIZES), wild: new Set(WILD), statuses: new Set(STATUSES.map(s => s.id)), onlyStarred: false };
let ideas = [], cats = [];
const confirmed = new Map();      // idea id → what the server has: { starred, status, note }
const pending = new Map();        // idea id → Map(field → { value, n }): changes shown but not yet confirmed
const chains = new Map();         // idea id → the last save in flight, so saves of one idea stay in order

// what the card shows: the server's values with the changes still in flight on top
function mine(id) {
  const s = { ...blank(), ...confirmed.get(id) };
  for (const [k, p] of pending.get(id) || []) s[k] = p.value;
  return s;
}
function banner(text) { const b = $('#banner'); b.textContent = text || ''; b.hidden = !text; }

async function api(path, init) {
  const res = await fetch(path, { cache: 'no-store', ...init });
  let body = null;
  try { body = await res.json(); } catch { /* an HTML page, e.g. a sign-in screen */ }
  if (!res.ok || !body) throw new Error((body && body.error) || `the server answered ${res.status}`);
  return body;
}

function stats() {
  const n = id => ideas.filter(i => mine(i.id).status === id).length;
  const parts = STATUSES.filter(s => s.id !== 'idea').map(s => `<span><b>${n(s.id)}</b> ${s.label.toLowerCase()}</span>`);
  $('#stats').innerHTML = `<span><b>${ideas.length}</b> ideas</span><span><b>${ideas.filter(i => mine(i.id).starred).length}</b> starred</span>` + parts.join('');
  for (const s of STATUSES) { const el = document.querySelector(`[data-sn="${s.id}"]`); if (el) el.textContent = n(s.id); }
}

function chips(rowId, values, set, label, extra) {
  const row = $(rowId);
  for (const v of values) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', 'true');
    b.innerHTML = label(v) + (extra ? ` <span class="n" data-sn="${v}"></span>` : '');
    if (extra) b.title = extra(v);
    b.addEventListener('click', () => { set.has(v) ? set.delete(v) : set.add(v); b.setAttribute('aria-pressed', String(set.has(v))); apply(); });
    row.appendChild(b);
  }
}

function paint(el) {
  const id = el.dataset.id, s = mine(id);
  el.dataset.status = s.status;
  el.classList.toggle('starred', s.starred);
  const star = el.querySelector('.star');
  star.setAttribute('aria-pressed', String(s.starred)); star.textContent = s.starred ? '[*]' : '[+]';
  el.querySelector('.status').value = s.status;
  const note = el.querySelector('.note-text');
  note.textContent = s.note; note.hidden = !s.note;
  el.querySelector('.note-btn').textContent = s.note ? 'edit note' : '+ note';
}

function mark(el, text, err) { const m = el.querySelector('.saved'); m.textContent = text; m.classList.toggle('err', !!err); }

// Send one change. The card shows the new value at once; if the save fails it falls back to what the server has.
function save(el, change) {
  const id = el.dataset.id;
  if (!pending.has(id)) pending.set(id, new Map());
  const mine_ = pending.get(id);
  for (const [k, value] of Object.entries(change)) { const p = mine_.get(k) || { n: 0 }; p.value = value; p.n++; mine_.set(k, p); }
  paint(el); stats(); apply(); mark(el, 'saving…');
  const run = async () => {
    try {
      const r = await api(`/api/ideas/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Glyphite': '1' }, body: JSON.stringify(change) });
      confirmed.set(id, { starred: r.starred, status: r.status, note: r.note });
      mark(el, 'saved'); banner('');
    } catch (e) { mark(el, 'not saved', true); banner(`Could not save: ${e.message}`); }
    finally {
      for (const k of Object.keys(change)) { const p = mine_.get(k); if (p && --p.n === 0) mine_.delete(k); }
      paint(el); stats(); apply();
    }
  };
  const next = (chains.get(id) || Promise.resolve()).then(run);
  chains.set(id, next);
  return next;
}

function render() {
  $('#list').innerHTML = cats.map(c => `
    <section class="cat" id="${slug(c.name)}" aria-labelledby="h-${slug(c.name)}">
      <h2 class="rule" id="h-${slug(c.name)}"><span>${esc(c.name)}</span><span class="fill" aria-hidden="true">${'='.repeat(200)}</span><span class="n" data-n></span></h2>
      <div class="grid">${c.ideas.map(i => `
        <article class="idea" data-id="${esc(i.id)}">
          <h3><span>${rich(i.title)}</span><button class="star" type="button" aria-pressed="false" aria-label="Star: ${esc(i.title)}">[+]</button></h3>
          <div style="display:grid;gap:6px;align-content:start"><p>${rich(i.pitch)}</p>${i.hook ? `<p class="hook">${rich(i.hook)}</p>` : ''}</div>
          <div class="foot-row">
            <div class="tags"><span class="size" title="size: ${i.size}"><b>[${BAR[i.size]}]</b> ${i.size}</span><span class="wild ${i.wildness}">${i.wildness}</span></div>
            <div class="controls">
              <label class="sr" for="s-${esc(i.id)}">Status of ${esc(i.title)}</label>
              <select class="status" id="s-${esc(i.id)}">${STATUSES.map(s => `<option value="${s.id}" title="${esc(s.help)}">${s.label}</option>`).join('')}</select>
              <button class="note-btn" type="button">+ note</button>
              <span class="saved" aria-live="polite"></span>
            </div>
            <p class="note-text" hidden></p>
          </div>
        </article>`).join('')}</div>
    </section>`).join('') + '<p class="empty" id="none" hidden>Nothing matches these filters.</p>';
  $('#catbar').innerHTML = cats.map(c => `<a class="chip" href="#${slug(c.name)}">${esc(c.name)} <span class="n" data-c="${slug(c.name)}"></span></a>`).join('');

  for (const el of document.querySelectorAll('.idea')) {
    el.querySelector('.star').addEventListener('click', () => save(el, { starred: !mine(el.dataset.id).starred }));
    el.querySelector('.status').addEventListener('change', e => save(el, { status: e.target.value }));
    el.querySelector('.note-btn').addEventListener('click', () => editNote(el));
    paint(el);
  }
}

function editNote(el) {
  if (el.querySelector('.note-edit')) return;
  const id = el.dataset.id, box = document.createElement('div');
  box.className = 'foot-row';
  box.innerHTML = `<label class="sr" for="n-${esc(id)}">Note</label><textarea class="note-edit" id="n-${esc(id)}" maxlength="${NOTE_MAX}" placeholder="Why, the PR, what is left…"></textarea>
    <div class="note-actions"><button class="btn small primary" type="button">[ SAVE ]</button><button class="btn small" type="button">[ CANCEL ]</button><span>Ctrl+Enter saves</span></div>`;
  const ta = box.querySelector('textarea'), [ok, cancel] = box.querySelectorAll('button');
  ta.value = mine(id).note;
  const close = () => { box.remove(); el.querySelector('.note-btn').hidden = false; };
  const commit = () => { const v = ta.value.trim(); close(); if (v !== mine(id).note) save(el, { note: v }); };
  ok.addEventListener('click', commit); cancel.addEventListener('click', close);
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); });
  el.querySelector('.foot-row').appendChild(box);
  el.querySelector('.note-btn').hidden = true;
  ta.focus();
}

function apply() {
  const q = state.q.trim().toLowerCase();
  const byId = new Map(ideas.map(i => [i.id, i]));
  let shown = 0;
  for (const sec of document.querySelectorAll('section.cat')) {
    let n = 0;
    for (const el of sec.querySelectorAll('.idea')) {
      const i = byId.get(el.dataset.id), s = mine(i.id);
      const ok = state.sizes.has(i.size) && state.wild.has(i.wildness) && state.statuses.has(s.status) && (!state.onlyStarred || s.starred) &&
        (!q || (i.title + ' ' + i.pitch + ' ' + (i.hook || '') + ' ' + s.note).toLowerCase().includes(q));
      el.hidden = !ok; if (ok) n++;
    }
    sec.hidden = n === 0; shown += n;
    sec.querySelector('[data-n]').textContent = n;
    const c = document.querySelector(`[data-c="${sec.id}"]`); if (c) c.textContent = n;
  }
  $('#none').hidden = shown > 0;
  $('#count').textContent = `showing ${shown} of ${ideas.length}`;
}

async function main() {
  let data, items = {};
  try { data = await api('/ideas/ideas.json'); }
  catch (e) { $('#list').innerHTML = `<p class="empty">Could not load the ideas (${esc(e.message)}).</p>`; return; }
  try { items = (await api('/api/ideas')).items; }
  catch (e) { banner(`The idea database could not be read (${e.message}): stars and statuses will not be saved.`); }
  cats = data.categories; ideas = cats.flatMap(c => c.ideas);
  for (const [id, r] of Object.entries(items)) confirmed.set(id, { starred: r.starred, status: r.status, note: r.note });
  chips('#statusRow', STATUSES.map(s => s.id), state.statuses, id => STATUSES.find(s => s.id === id).label, id => STATUSES.find(s => s.id === id).help);
  chips('#sizeRow', SIZES, state.sizes, v => v);
  chips('#wildRow', WILD, state.wild, v => v);
  render(); stats(); apply();
  $('#q').addEventListener('input', e => { state.q = e.target.value; apply(); });
  $('#onlyStarred').addEventListener('click', e => { state.onlyStarred = !state.onlyStarred; e.currentTarget.setAttribute('aria-pressed', String(state.onlyStarred)); apply(); });
  // category jumps land below the sticky console; on a phone the console scrolls away, so offer a way back to it
  new ResizeObserver(([e]) => document.body.style.setProperty('--console-h', e.target.offsetHeight + 'px')).observe($('#console'));
  new IntersectionObserver(([e]) => { $('#totop').hidden = e.isIntersecting; }).observe($('#console'));
  $('#totop').addEventListener('click', () => $('#console').scrollIntoView({ block: 'start' }));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main();
