// The art page (/art/?game=<id>): two tabs. REFERENCE SHEETS: a game's ref/ref.json (written by its art tool, copied by the build) as
// each sheet with the boxes its drawings were cut from, and the drawings at their original pixels. GALLERY (the art pipeline,
// gallery.js): every asset and version. Without ?game= it lists the games that have either.
import { renderGallery } from './gallery.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

// small drawings are shown enlarged (whole steps, so the pixels stay square), big ones at their own size
const zoom = ([w, h]) => Math.max(1, Math.min(4, Math.floor(150 / Math.max(w, h))));

function sheetHTML(sh, base, si) {
  const [W, H] = sh.size || [1, 1];
  const boxes = sh.frames.map((f, i) => {
    const [x0, y0, x1, y1] = f.box;
    return `<a class="box${f.used ? '' : ' later'}" href="#f-${si}-${i}" data-f="${si}-${i}" title="${esc(f.name)}"
      style="left:${x0 / W * 100}%;top:${y0 / H * 100}%;width:${(x1 - x0) / W * 100}%;height:${(y1 - y0) / H * 100}%"></a>`;
  }).join('');
  const cards = sh.frames.map((f, i) => {
    const z = zoom(f.size);
    return `<figure class="frame${f.used ? '' : ' later'}" id="f-${si}-${i}" data-f="${si}-${i}" data-used="${f.used ? 1 : 0}">
      <a class="pic" href="${base}${esc(f.file)}" target="_blank" rel="noopener"><img src="${base}${esc(f.file)}" alt="${esc(f.name)}" loading="lazy"
        width="${f.size[0] * z}" height="${f.size[1] * z}"></a>
      <figcaption><b>${esc(f.name)}</b><span class="use">${esc(f.use)}</span>
        <span class="meta">${f.size[0]} x ${f.size[1]} px${z > 1 ? ` · shown ${z}x` : ''} · box ${f.box.join(', ')}</span></figcaption>
    </figure>`;
  }).join('');
  const used = sh.frames.filter(f => f.used).length;
  return `<section class="sheet" id="${slug(sh.file)}">
    <h2>${esc(sh.title)}</h2>
    <p class="meta"><a href="${base}${esc(sh.file)}" target="_blank" rel="noopener">${esc(sh.file)}</a>${sh.size ? ` · ${W} x ${H}` : ''}${sh.source ? ` · from ${esc(sh.source)}` : ''}
      ${sh.frames.length ? ` · ${sh.frames.length} drawings, ${used} in the game` : ''}</p>
    ${sh.use ? `<p class="use">${esc(sh.use)}</p>` : ''}
    <div class="viewer"><img src="${base}${esc(sh.file)}" alt="${esc(sh.title)}">${boxes}</div>
    ${cards ? `<div class="frames">${cards}</div>` : ''}
  </section>`;
}

async function getJSON(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

async function main() {
  const id = new URLSearchParams(location.search).get('game');
  let games = [];
  try { games = (await getJSON('/games.json')).games; } catch { }
  if (!id) {   // the games that have art
    const list = games.filter(g => g.ref || g.art);
    $('#lede').textContent = 'The art of each game: the original images its sprites were made from, and the gallery of every asset the art pipeline has made.';
    $('#sheets').innerHTML = list.length ? `<ul class="games">${list.map(g => `<li><a href="?game=${encodeURIComponent(g.id)}${g.art ? '&tab=gallery' : ''}">${esc(g.title)}</a>
      <span class="meta">${[g.art && `${g.art.assets} asset${g.art.assets === 1 ? '' : 's'}, ${g.art.versions} version${g.art.versions === 1 ? '' : 's'}`, g.ref && `${g.ref.sheets} image${g.ref.sheets > 1 ? 's' : ''}, ${g.ref.drawings} drawings`].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>` : '<p class="empty">No game has art yet.</p>';
    return;
  }
  const g = games.find(x => x.id === id), base = `/games/${encodeURIComponent(id)}/ref/`;
  let ref = null;
  if (!g || g.ref) { try { ref = await getJSON(base + 'ref.json'); } catch (e) { if (!g || !g.art) { $('#sheets').innerHTML = `<p class="empty">No reference art for this game (${esc(e.message)}).</p>`; return; } } }
  const title = (g && g.title) || (ref && ref.title) || id;
  const hasArt = !!(g && g.art), tab = new URLSearchParams(location.search).get('tab') || (hasArt && !ref ? 'gallery' : 'ref');
  document.title = `${title}: art · Pixelite`;
  $('#title').textContent = `${title}: art`;
  $('#crumbGame').textContent = `${title.toUpperCase()} / ART`;
  if (hasArt && ref) {   // both: tabs
    $('#tabs').hidden = false;
    for (const [el, t] of [[$('#tabGallery'), 'gallery'], [$('#tabRef'), 'ref']]) { el.href = `?game=${encodeURIComponent(id)}&tab=${t}`; el.classList.toggle('on', tab === t); el.setAttribute('aria-selected', String(tab === t)); }
  }
  if (tab === 'gallery' && hasArt) {
    $('#lede').textContent = 'Everything the art pipeline has made for this game, one tile per asset showing the version that is live. Open an asset for its versions, the prompt and references, and a compare.';
    $('#sheets').hidden = true; $('#gallery').hidden = false; $('#filters').hidden = true;
    if (g) { $('#playLink').href = `/games/${encodeURIComponent(id)}/`; $('#editLink').href = `/edit/?game=${encodeURIComponent(id)}`; $('#playLink').hidden = $('#editLink').hidden = false; }
    await renderGallery($('#gallery'), id, title);
    return;
  }
  if (!ref) { $('#sheets').innerHTML = '<p class="empty">No reference art for this game.</p>'; return; }
  if (g) { $('#playLink').href = `/games/${encodeURIComponent(id)}/`; $('#editLink').href = `/edit/?game=${encodeURIComponent(id)}`; $('#playLink').hidden = $('#editLink').hidden = false; }
  $('#sheets').innerHTML = ref.sheets.map((sh, i) => sheetHTML(sh, base, i)).join('');
  if (ref.sheets.some(sh => sh.frames.some(f => !f.used))) $('#filters').hidden = false;

  // a box and its drawing light up together
  const both = (key, on) => document.querySelectorAll(`[data-f="${key}"]`).forEach(el => el.classList.toggle('hot', on));
  $('#sheets').addEventListener('pointerover', e => { const el = e.target.closest('[data-f]'); if (el) both(el.dataset.f, true); });
  $('#sheets').addEventListener('pointerout', e => { const el = e.target.closest('[data-f]'); if (el) both(el.dataset.f, false); });
  // show all, the drawings in the game, or the ones not used yet
  $('#filters').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b));
    const show = b.dataset.show;
    document.querySelectorAll('.frame, .box').forEach(el => {
      const used = !el.classList.contains('later');
      el.hidden = show === 'used' ? !used : show === 'unused' ? used : false;
    });
  });
}
main();
