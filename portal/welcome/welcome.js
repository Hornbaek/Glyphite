// The public landing page: fills in the games and a few numbers from /welcome/site.json, which the build writes (only what
// may be public: titles, taglines, descriptions, controls, thumbnails, counts). Anyone may play these games (worker/index.js).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function main() {
  let site;
  try { const r = await fetch('/welcome/site.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); site = await r.json(); }
  catch { $('#gameList').innerHTML = '<p class="muted">The games could not be loaded. Try again in a moment.</p>'; return; }
  $('#gameList').innerHTML = site.games.map(g => `<article class="game">
    ${g.thumb ? `<a href="/games/${esc(g.id)}/" tabindex="-1"><img src="${esc(g.thumb)}" alt="A screenshot of ${esc(g.title)}" loading="lazy"></a>` : ''}
    <div class="body">
      <p class="wip">TEST GAME · WORK IN PROGRESS</p>
      <h3>${esc(g.title)}</h3>
      ${g.tagline ? `<p class="tag">${esc(g.tagline)}</p>` : ''}
      ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
      ${g.controls?.length ? `<details><summary>Controls</summary><dl>${g.controls.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>` : ''}
      <a class="btn primary small" href="/games/${esc(g.id)}/">[ PLAY ]</a>
    </div>
  </article>`).join('');
  if (site.ideas) $('#ideaCount').textContent = site.ideas.toLocaleString('en');
  $('#stats').textContent = `So far: ${site.games.length} game${site.games.length === 1 ? '' : 's'}, engine ${site.engine}, ${site.changes} rounds of changes.`;
  $('#engine').textContent = `ENGINE ${site.engine}`;
}
main();
