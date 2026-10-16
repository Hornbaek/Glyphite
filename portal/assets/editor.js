// The Glyphite web editor: tune a game's numbers, edit its code, and preview it, all in the browser.
// The preview is rebuilt here with the same assembler the site build uses (tools/assemble.mjs). Edits
// are drafts in localStorage; the CLAUDE tab turns them into a prompt plus a git patch for a Claude
// Code session, which commits them to the repository (the source of truth) through a pull request.
import { assemble, lineMap } from '/assets/assemble.mjs';
import { unifiedDiff } from '/assets/diff.mjs';
import { setupLevels } from '/assets/levels.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};

const S = {
  id: new URLSearchParams(location.search).get('game') || '',
  entry: null, listing: null, engine: null,
  orig: {},          // repo path → deployed text
  files: [],         // [{ path, label, group, mode }]
  current: '',       // path open in the code tab
  docs: {},          // path → CodeMirror Doc
  tune: {}, defs: {}, renderer: '', dirty: false, page: '', map: null,
  levelSpec: null, levels: null,   // game.json "levels" and the LEVELS tab, for games with tile maps
  pending: null                    // what to tell the preview once it has started: play a map, check a map
};
const KEY = k => `glyphite.edit.v1.${S.id}.${k}`;

// ---------- sources and drafts ----------
async function fetchText(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); }
const draftOf = path => store.get(KEY(`file:${path}`));
const textOf = path => { const d = draftOf(path); return d ? d.text : S.orig[path]; };
function saveDraft(path, text) {
  if (text === S.orig[path]) store.set(KEY(`file:${path}`), null);
  else store.set(KEY(`file:${path}`), { base: (draftOf(path) || {}).base || fnv(S.orig[path] ?? ''), text, at: Date.now() });
}
const modified = path => { const d = draftOf(path); return !!d && d.text !== S.orig[path]; };
const stale = path => { const d = draftOf(path); return !!d && d.base !== fnv(S.orig[path] ?? ''); };

async function load() {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(S.id)) throw new Error('no game given: open the editor from the game list');
  S.listing = JSON.parse(await fetchText('/games.json'));
  S.entry = S.listing.games.find(g => g.id === S.id);
  if (!S.entry) throw new Error(`there is no game called "${S.id}"`);
  const base = S.entry.path;
  S.engine = JSON.parse(await fetchText('/src/engine/engine.json'));
  const gameFiles = ['game.json', ...S.entry.parts];
  const engFiles = [S.engine.shell, ...S.engine.parts];
  const all = [...gameFiles.map(f => [`${base}/${f}`, `/src/games/${S.id}/${f}`, f, 'game']), ...engFiles.map(f => [`engine/${f}`, `/src/engine/${f}`, f, 'engine'])];
  const texts = await Promise.all(all.map(([, url]) => fetchText(url)));
  all.forEach(([path, , label, group], i) => {
    S.orig[path] = texts[i];
    S.files.push({ path, label, group, mode: label.endsWith('.json') ? { name: 'javascript', json: true } : label.endsWith('.html') ? 'htmlmixed' : 'javascript' });
  });
  const manifest = JSON.parse(S.orig[`${base}/game.json`]);
  S.defs = manifest.tunables || {};
  if (manifest.levels && S.orig[`${base}/${manifest.levels.file}`] !== undefined) S.levelSpec = manifest.levels;
  S.tune = store.get(KEY('tune')) || {};
  for (const k in S.tune) if (!(k in S.defs)) delete S.tune[k];
}

// ---------- building the preview ----------
const REPORTER = `<script>addEventListener('error',e=>parent.postMessage({type:'glyphite:error',message:e.message,line:e.lineno,col:e.colno},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({type:'glyphite:error',message:'unhandled: '+(e.reason&&e.reason.message||e.reason)},'*'));<\/script>`;
function tuneValues() { const v = {}; for (const k in S.defs) v[k] = k in S.tune ? S.tune[k] : S.defs[k].value; return v; }
function buildPage() {
  const base = S.entry.path;
  const manifest = JSON.parse(textOf(`${base}/game.json`));
  const missing = (manifest.parts || []).filter(p => textOf(`${base}/${p}`) === undefined);
  if (missing.length) throw new Error(`game.json lists ${missing.join(', ')}, which the editor can't create: ask Claude to add new files`);
  const engine = { version: S.engine.version, parts: S.engine.parts.map(name => ({ name, code: textOf(`engine/${name}`) })) };
  const page = assemble({
    shell: textOf(`engine/${S.engine.shell}`), engine, manifest,
    head: manifest.head ? textOf(`${base}/${manifest.head}`) || '' : '',
    parts: manifest.parts.map(name => ({ name, code: textOf(`${base}/${name}`) })),
    tune: tuneValues(), renderer: S.renderer
  });
  return page.replace('<head>\n', `<head>${REPORTER}\n`);   // same line count, so error lines still map
}
function run() {
  clearConsole();
  try { S.page = buildPage(); S.map = lineMap(S.page); }
  catch (e) { setStatus(`build failed: ${e.message}`, true); logError(e.message); return; }
  $('#preview').srcdoc = S.page;
  S.dirty = false;
  setStatus(`running · ${Math.round(S.page.length / 1024)} KB · ${new Date().toLocaleTimeString()}`);
  setTimeout(() => { try { $('#preview').contentWindow.focus(); } catch { } }, 400);
}
let runTimer = 0;
const runSoon = (ms = 500) => { clearTimeout(runTimer); runTimer = setTimeout(run, ms); };
function setStatus(t, err) { const s = $('#status'); s.textContent = t; s.classList.toggle('err', !!err); }
function clearConsole() { const c = $('#console'); c.textContent = ''; c.hidden = true; }
function logError(msg, where) {
  const c = $('#console'), d = document.createElement('div');
  d.textContent = where ? `${where[0]}:${where[1]}  ${msg}` : msg;
  if (where && S.files.some(f => f.path === where[0])) { d.style.cursor = 'pointer'; d.title = 'Open in the editor'; d.onclick = () => { showTab('code'); openFile(where[0], where[1]); }; }
  c.appendChild(d); c.hidden = false;
}
// the preview started: hand it what was waiting (play a map from a tile, or check one); a check's answer comes back here
const checks = {};
addEventListener('message', e => {
  if (e.source !== $('#preview').contentWindow || !e.data) return;
  if (e.data.type === 'glyphite:ready' && S.pending) { const p = S.pending; S.pending = null; e.source.postMessage(p, '*'); if (p.action === 'play') setTimeout(() => { try { $('#preview').contentWindow.focus(); } catch { } }, 50); }
  if (e.data.type === 'glyphite:levelcheck' && checks[e.data.id]) { checks[e.data.id](e.data.result); delete checks[e.data.id]; }
});
function previewDo(msg) { S.pending = { type: 'glyphite:level', ...msg }; run(); }
function checkLevel(level) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    checks[id] = resolve;
    setTimeout(() => { if (checks[id]) { delete checks[id]; reject(new Error('the preview did not answer (did the game fail to start? see below the preview)')); } }, 60000);
    setStatus('checking the map…'); previewDo({ action: 'check', level, id });
  });
}
addEventListener('message', e => {
  if (e.source !== $('#preview').contentWindow || !e.data || e.data.type !== 'glyphite:error') return;
  const where = e.data.line && S.map ? S.map[e.data.line] : null;
  logError(e.data.message, where && where[0] !== 'page' ? where : null);
  setStatus('the game hit an error (see below)', true);
});

// ---------- the TUNE tab ----------
function renderTunables() {
  const box = $('#tunables'), keys = Object.keys(S.defs);
  if (!keys.length) { box.innerHTML = '<p class="muted">This game exposes no tunables yet. Ask Claude to add some to its game.json.</p>'; return; }
  box.innerHTML = keys.map(k => {
    const d = S.defs[k], v = k in S.tune ? S.tune[k] : d.value, id = `t-${k}`;
    const ctl = typeof d.value === 'boolean'
      ? `<input type="checkbox" id="${id}" data-k="${esc(k)}" ${v ? 'checked' : ''}>`
      : `<input type="range" id="${id}" data-k="${esc(k)}" min="${d.min ?? 0}" max="${d.max ?? Math.max(1, d.value * 2)}" step="${d.step ?? 'any'}" value="${v}" aria-describedby="${id}-h">
         <input type="number" data-k="${esc(k)}" min="${d.min ?? ''}" max="${d.max ?? ''}" step="${d.step ?? 'any'}" value="${v}" aria-label="${esc(d.label || k)} value">`;
    return `<div class="tune-row">
      <div class="tune-head"><label for="${id}">${esc(d.label || k)}</label><span class="unit">${esc(d.unit || '')}</span>
        <span class="live ${d.live ? 'on' : ''}">${d.live ? 'live' : 'restarts'}</span></div>
      <div class="tune-ctl">${ctl}<span class="changed" data-c="${esc(k)}">${k in S.tune ? `was ${d.value}` : ''}</span></div>
      ${d.help ? `<p class="tune-help" id="${id}-h">${esc(d.help)}</p>` : ''}
    </div>`;
  }).join('');
  box.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => setTune(inp.dataset.k, inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value), inp)));
}
function setTune(k, v, from) {
  const d = S.defs[k];
  if (typeof d.value === 'number') { if (!Number.isFinite(v)) return; if (d.min !== undefined) v = Math.max(d.min, v); if (d.max !== undefined) v = Math.min(d.max, v); }
  if (v === d.value) delete S.tune[k]; else S.tune[k] = v;
  store.set(KEY('tune'), Object.keys(S.tune).length ? S.tune : null);
  document.querySelectorAll(`#tunables input[data-k="${CSS.escape(k)}"]`).forEach(i => { if (i !== from && i.type !== 'checkbox') i.value = v; });
  const c = document.querySelector(`[data-c="${CSS.escape(k)}"]`); if (c) c.textContent = k in S.tune ? `was ${d.value}` : '';
  if (d.live) { try { $('#preview').contentWindow.postMessage({ type: 'glyphite:tune', values: { [k]: v } }, '*'); } catch { } }
  else runSoon(700);
  refreshMarks();
}

// ---------- the CODE tab ----------
let cm = null, plain = null, guard = false;
function setupEditor() {
  const host = $('#codehost');
  if (window.CodeMirror) {
    cm = window.CodeMirror(host, { lineNumbers: true, matchBrackets: true, indentUnit: 2, tabSize: 2, lineWrapping: false, viewportMargin: 30 });
    cm.on('change', () => { if (!guard) onEdit(cm.getValue()); });
  } else {   // the CDN is unreachable: a plain text area still works
    plain = document.createElement('textarea'); plain.spellcheck = false; plain.setAttribute('aria-label', 'Source code');
    host.appendChild(plain); plain.addEventListener('input', () => onEdit(plain.value));
  }
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); run(); } });
}
let saveTimer = 0;
function onEdit(text) {
  const path = S.current; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveDraft(path, text); refreshMarks(); }, 250);
  S.dirty = true; setStatus('edited: press RUN (Ctrl/Cmd+S) to see it');
}
function renderFiles() {
  const groups = { game: `GAME · ${S.entry.path}/`, engine: 'ENGINE · engine/ (shared by every game)' };
  $('#files').innerHTML = Object.entries(groups).map(([g, title]) => `<span class="grp">${esc(title)}</span>` +
    S.files.filter(f => f.group === g).map(f => `<button type="button" data-p="${esc(f.path)}">${esc(f.label)}</button>`).join('')).join('');
  $('#files').querySelectorAll('button').forEach(b => b.addEventListener('click', () => openFile(b.dataset.p)));
}
function openFile(path, line) {
  S.current = path;
  const f = S.files.find(x => x.path === path), text = textOf(path) ?? '';
  if (cm) {
    if (!S.docs[path]) S.docs[path] = window.CodeMirror.Doc(text, f.mode);
    guard = true; cm.swapDoc(S.docs[path]); guard = false;
    if (line) { cm.setCursor({ line: line - 1, ch: 0 }); cm.scrollIntoView({ line: line - 1, ch: 0 }, 120); cm.addLineClass(line - 1, 'background', 'cm-errline'); }
    setTimeout(() => cm.refresh(), 0);
  } else plain.value = text;
  $('#fileName').textContent = path;
  $('#fileWarn').textContent = f.group === 'engine' ? '  · engine: changes affect every game' : '';
  refreshMarks();
}
function revertFile() {
  const path = S.current; if (!path || !modified(path)) return;
  if (!confirm(`Revert ${path} to the deployed version?`)) return;
  store.set(KEY(`file:${path}`), null);
  if (cm) { guard = true; S.docs[path].setValue(S.orig[path]); guard = false; } else plain.value = S.orig[path];
  refreshMarks(); run(); if (S.levels) S.levels.refresh();
}

// ---------- the LEVELS tab: the map editor works on drafts of the map file, like the CODE tab ----------
function setupLevelTab() {
  if (!S.levelSpec) return;
  const path = `${S.entry.path}/${S.levelSpec.file}`;
  S.levels = setupLevels({
    spec: S.levelSpec, path, id: S.id,
    textOf, saveDraft, origText: p => S.orig[p],
    edited(p) {   // keep the CODE tab's copy of the file in step, and mark it edited
      if (S.docs[p]) { guard = true; S.docs[p].setValue(textOf(p)); guard = false; }
      if (!cm && plain && S.current === p) plain.value = textOf(p);
      refreshMarks(); S.dirty = true; setStatus('map edited: PLAY THIS MAP (or RUN) to try it');
    },
    play: (level, tile) => previewDo({ action: 'play', level, tile }),
    check: checkLevel
  });
  $('#tab-levels').hidden = false;
}

// ---------- the CLAUDE tab ----------
function changedFiles() { return S.files.filter(f => modified(f.path)); }
function patchText() { return changedFiles().map(f => unifiedDiff(f.path, S.orig[f.path], textOf(f.path))).join(''); }
function tuneLines() {
  return Object.keys(S.tune).map(k => { const d = S.defs[k]; return `- ${k}: ${d.value} → ${S.tune[k]}${d.label ? ` (${d.label}${d.unit ? `, ${d.unit}` : ''})` : ''}`; });
}
function promptText() {
  const ask = $('#ask').value.trim(), base = S.entry.path, tl = tuneLines(), patch = patchText(), stl = changedFiles().filter(f => stale(f.path));
  const out = [`Repository: hornbaek/glyphite. Game: "${S.entry.title}" (${base}/).`, '', ask || 'Apply my edits from the Glyphite web editor.', ''];
  if (tl.length || patch) out.push(`My edits from the web editor (${location.origin}/edit/?game=${S.id}), made against the build of ${S.listing.built.slice(0, 16).replace('T', ' ')} UTC:`, '');
  if (tl.length) out.push(`Make these the new tunable defaults in ${base}/game.json:`, ...tl, '');
  if (patch) out.push('Code changes (a unified diff for `git apply`; if it no longer applies cleanly, carry the intent over by hand):', '```diff', patch.replace(/\n$/, ''), '```', '');
  if (stl.length) out.push(`Note: ${stl.map(f => f.path).join(', ')} changed on the site after I started editing; check my edits against the current version.`, '');
  out.push('Follow CLAUDE.md: make the change, build, verify the game (smoke test, screenshots, its regression checks), update the docs, and open a pull request.');
  return out.join('\n');
}
function renderHandoff() {
  const tl = tuneLines(), files = changedFiles();
  $('#changes').innerHTML = (tl.length || files.length)
    ? `${tl.length ? `<b>Tunables</b><ul>${tl.map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>` : ''}${files.length ? `<b>Files</b><ul>${files.map(f => `<li>${esc(f.path)}${stale(f.path) ? ' <span class="muted">(deployed version changed since)</span>' : ''}</li>`).join('')}</ul>` : ''}`
    : '<span class="muted">No edits yet. You can still describe a change for Claude to make.</span>';
  $('#promptPreview').textContent = promptText();
  $('#downloadPatch').disabled = !files.length;
}
async function copy(text, btn) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = '[ COPIED ]'; } catch { btn.textContent = '[ COPY FAILED: SELECT THE TEXT ]'; }
  setTimeout(() => { btn.textContent = label; }, 1800);
}

// ---------- marks, tabs, wiring ----------
function refreshMarks() {
  $('#files').querySelectorAll('button').forEach(b => { b.classList.toggle('mod', modified(b.dataset.p)); b.setAttribute('aria-current', String(b.dataset.p === S.current)); });
  const nf = changedFiles().length, nt = Object.keys(S.tune).length;
  $('#draftNote').textContent = nf || nt ? `${nt ? `${nt} tunable${nt > 1 ? 's' : ''}` : ''}${nf && nt ? ' · ' : ''}${nf ? `${nf} file${nf > 1 ? 's' : ''}` : ''} edited` : '';
  $('#tab-claude').innerHTML = nf || nt ? 'CLAUDE <span class="dot">•</span>' : 'CLAUDE';
  if (!$('#pane-claude').hidden) renderHandoff();
}
function showTab(name) {
  if (name === 'levels' && !S.levels) name = 'tune';
  for (const t of ['tune', 'code', 'levels', 'claude']) { $(`#tab-${t}`).setAttribute('aria-selected', String(t === name)); $(`#pane-${t}`).hidden = t !== name; }
  document.body.classList.toggle('wide-side', name === 'levels');
  if (name === 'levels') S.levels.show();
  if (name === 'code') {
    if (!S.current) { const game = S.files.filter(f => f.group === 'game'); openFile((game.find(f => f.label === 'main.js') || game[1] || game[0]).path); }
    else if (cm) setTimeout(() => cm.refresh(), 0);
  }
  if (name === 'claude') renderHandoff();
  store.set(KEY('tab'), name);
}

async function main() {
  try { await load(); }
  catch (e) { $('#gameTitle').textContent = 'not found'; setStatus(e.message, true); document.querySelector('.emain').innerHTML = `<p class="empty" style="margin:16px">${esc(e.message)}. <a href="/">Back to the games</a></p>`; return; }
  document.title = `${S.entry.title} · Glyphite Editor`;
  $('#gameTitle').textContent = S.entry.title;
  $('#playLink').href = `/games/${S.id}/`;
  if (S.entry.ref) { $('#artLink').href = `/art/?game=${encodeURIComponent(S.id)}`; $('#artLink').hidden = false; }   // the reference art
  renderTunables(); renderFiles(); setupEditor(); setupLevelTab();
  for (const t of ['tune', 'code', 'levels', 'claude']) $(`#tab-${t}`).addEventListener('click', () => showTab(t));
  $('#resetTune').addEventListener('click', () => { S.tune = {}; store.set(KEY('tune'), null); renderTunables(); refreshMarks(); run(); });
  $('#runBtn').addEventListener('click', run);
  $('#rebuild').addEventListener('click', run);
  $('#revertFile').addEventListener('click', revertFile);
  $('#discardAll').addEventListener('click', () => {
    if (!confirm('Discard every tunable change and code edit for this game?')) return;
    for (const f of S.files) store.set(KEY(`file:${f.path}`), null);
    S.tune = {}; store.set(KEY('tune'), null); S.docs = {};
    renderTunables(); if (S.current) openFile(S.current); refreshMarks(); run(); if (S.levels) S.levels.refresh();
  });
  $('#ask').addEventListener('input', () => { $('#promptPreview').textContent = promptText(); });
  $('#copyPrompt').addEventListener('click', e => copy(promptText(), e.currentTarget));
  $('#downloadPatch').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([patchText()], { type: 'text/x-diff' }));
    a.download = `${S.id}-edits.patch`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    S.renderer = b.dataset.r; document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); run();
  }));
  refreshMarks();
  showTab(store.get(KEY('tab')) || 'tune');
  run();
}
// CodeMirror loads with `defer`, so wait for the document before building the editor
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', main); else main();
