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

function card(g) {
  const controls = (g.controls || []).slice(0, 4).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const meta = [g.updated && `updated ${day(g.updated)}`, `${g.sizeKB} KB`, g.tunables && `${g.tunables} tunables`].filter(Boolean).join(' · ');
  const play = `/games/${encodeURIComponent(g.id)}/`;
  return `<article class="card">
    <a class="thumb" href="${play}" aria-label="Play ${esc(g.title)}">${g.thumbnail ? `<img src="/${esc(g.thumbnail)}" alt="" loading="lazy">` : '<span class="ph">no thumbnail yet</span>'}</a>
    <div class="body">
      <h2>${esc(g.title)} <span class="badge ${esc(g.status)}">${esc(g.status)}</span></h2>
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
}
main();
