// The public landing page: fills in the games and a few numbers from /welcome/site.json, which the build writes (only what
// may be public: titles, taglines, descriptions, thumbnails, counts). Playing a game goes through the login.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function main() {
  let site;
  try { const r = await fetch('/welcome/site.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); site = await r.json(); }
  catch { $('#gameList').innerHTML = '<p class="muted">Log in to see the games.</p>'; return; }
  $('#gameList').innerHTML = site.games.map(g => `<article class="game">
    ${g.thumb ? `<img src="${esc(g.thumb)}" alt="A screenshot of ${esc(g.title)}" loading="lazy">` : ''}
    <div class="body">
      <h3>${esc(g.title)}</h3>
      ${g.tagline ? `<p class="tag">${esc(g.tagline)}</p>` : ''}
      ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}
      <a class="btn small" href="/login?next=${encodeURIComponent(`/games/${g.id}/`)}">[ LOG IN TO PLAY ]</a>
    </div>
  </article>`).join('');
  if (site.ideas) $('#ideaCount').textContent = site.ideas.toLocaleString('en');
  $('#stats').textContent = `So far: ${site.games.length} game${site.games.length === 1 ? '' : 's'}, engine ${site.engine}, ${site.changes} rounds of changes.`;
  $('#engine').textContent = `ENGINE ${site.engine}`;
}
main();
