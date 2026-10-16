// The game list: renders games.json (written by tools/glyphite.mjs build).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = iso => iso ? new Date(iso).toISOString().slice(0, 10) : null;

export async function copyText(text, btn) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = '[ COPIED ]'; }
  catch { btn.textContent = '[ SELECT AND COPY ]'; }
  setTimeout(() => { btn.textContent = label; }, 1600);
}

// "updated" badges: the date each game was last changed is remembered per game in this browser, when you open it. The
// first time a game is seen it is simply remembered, so a new visitor sees no badges.
const SEEN = id => `glyphite.seen.${id}`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
function isUpdated(g) {
  if (!g.updated) return false;
  const seen = store.get(SEEN(g.id));
  if (seen === null) { store.set(SEEN(g.id), g.updated); return false; }
  return g.updated > seen;
}

function card(g) {
  const controls = (g.controls || []).slice(0, 4).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const meta = [g.updated && `updated ${day(g.updated)}`, `${g.sizeKB} KB`, g.tunables && `${g.tunables} tunables`].filter(Boolean).join(' · ');
  const play = `/games/${encodeURIComponent(g.id)}/`, fresh = isUpdated(g);
  return `<article class="card" data-id="${esc(g.id)}" data-updated="${esc(g.updated || '')}">
    <a class="thumb" href="${play}" aria-label="Play ${esc(g.title)}">${g.thumbnail ? `<img src="/${esc(g.thumbnail)}" alt="" loading="lazy">` : '<span class="ph">no thumbnail yet</span>'}</a>
    <div class="body">
      <h2>${esc(g.title)} <span class="badge ${esc(g.status)}">${esc(g.status)}</span>${fresh ? ' <span class="badge fresh" title="Changed since you last opened it">updated</span>' : ''}</h2>
      ${g.tagline ? `<p class="tag">${esc(g.tagline)}</p>` : ''}
      ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
      ${controls ? `<dl class="controls">${controls}</dl>` : ''}
      <div class="actions">
        <a class="btn primary" href="${play}">[ PLAY ]</a>
        <a class="btn" href="/edit/?game=${encodeURIComponent(g.id)}">[ EDIT ]</a>
      </div>
      <p class="meta">${esc(meta)}</p>
    </div>
  </article>`;
}

async function main() {
  $('#copyNew').addEventListener('click', e => copyText($('#newPrompt').textContent, e.currentTarget));
  let data;
  try { const r = await fetch('/games.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); data = await r.json(); }
  catch (e) { $('#games').innerHTML = `<p class="empty">Could not load the game list (${esc(e.message)}).</p>`; $('#count').textContent = ''; return; }
  const games = data.games.filter(g => g.listed);
  $('#engineVer').textContent = `v${data.engine.version}`;
  $('#count').textContent = `${games.length} game${games.length === 1 ? '' : 's'}`;
  $('#games').innerHTML = games.length ? games.map(card).join('') : '<p class="empty">No games yet. Make one with Claude below.</p>';
  $('#foot').textContent = `Built ${day(data.built)} · engine ${data.engine.parts.length} parts`;
  // opening a game (play or edit) counts as having seen its latest change
  $('#games').addEventListener('click', e => { const c = e.target.closest('.card'); if (c && e.target.closest('a') && c.dataset.updated) store.set(SEEN(c.dataset.id), c.dataset.updated); });
  // the What's new button says NEW while there is a section you have not opened the page for
  try {
    const r = await fetch('/changes.json', { cache: 'no-store' }); const c = r.ok ? await r.json() : null;
    let seen = 0; try { seen = +localStorage.getItem('glyphite.whatsnew.seen') || 0; } catch { }
    if (c && c.latest > seen) $('#newsLink').insertAdjacentHTML('beforeend', ' <span class="badge fresh" title="Something you have not seen yet">new</span>');
  } catch { }
}
main();
