// The art pipeline's gallery (the ART page's GALLERY tab): a game's art/index.json (made by the build from games/<id>/art/,
// docs/ART_PIPELINE.md) as one tile per asset showing its live version, and a detail view with every version: the pictures, the
// prompt and references, a strip of versions, a compare of any two, and the tree of which version came from which.
// All read-only static files. The URL says where you are: ?game=&tab=gallery&asset=&v=&a=&b=&all=1
import { NORMALS, normalsFromMapRGBA, relief } from './normalmap-core.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = iso => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || ''; } };
const ORDER = ['character', 'prop', 'tile'];
// whole-step enlargement, so every art pixel stays square: as big as fits `box` pixels, at least 2, at most 12
const zoomFor = (w, h, box = 150) => Math.max(2, Math.min(12, Math.floor(box / Math.max(w, h))));

export async function renderGallery(root, gameId, gameTitle) {
  const base = `/games/${encodeURIComponent(gameId)}/art/`;
  let idx;
  try { const r = await fetch(base + 'index.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); idx = await r.json(); }
  catch (e) { root.innerHTML = `<p class="empty">No art pipeline for this game yet (${esc(e.message)}).</p>`; return; }

  const q = () => new URLSearchParams(location.search);
  const go = (changes, push = true) => {
    const p = q(); p.set('game', gameId); p.set('tab', 'gallery');
    for (const [k, v] of Object.entries(changes)) v === null || v === '' || v === false ? p.delete(k) : p.set(k, v === true ? '1' : v);
    (push ? history.pushState : history.replaceState).call(history, null, '', '?' + p);
    draw();
  };
  const A = id => idx.assets.find(a => a.id === id);
  const liveOf = a => a.versions.find(v => v.version === a.live) || null;
  const shown = (a, all) => liveOf(a) || (all ? a.versions[a.versions.length - 1] : null);
  const img = (a, v, f) => `${base}assets/${encodeURIComponent(a.id)}/${v.version}/${f}`;
  const badge = v => `<span class="vbadge ${esc(v.status)}">${esc(v.status)}</span>`;

  function sprite(a, v, f = 'sprite.png', z = 1) {
    const [w, h] = [a.target.w, a.target.h];
    return `<span class="spr"><img src="${img(a, v, f)}" alt="" style="width:${w * z}px;height:${h * z}px"></span>`;
  }

  // ---------- the tiles ----------
  function tiles() {
    const all = q().get('all') === '1';
    const list = idx.assets.filter(a => shown(a, all));
    const classes = [...new Set([...ORDER, ...idx.assets.map(a => a.class)])].filter(c => list.some(a => a.class === c));
    const hidden = idx.assets.length - list.length;
    const nonLive = idx.assets.reduce((n, a) => n + a.versions.filter(v => v.version !== a.live).length, 0);
    return `<div class="gtools">
        <label class="check"><input type="checkbox" id="gAll"${all ? ' checked' : ''}> show drafts and rejected${nonLive ? ` (${nonLive} version${nonLive === 1 ? '' : 's'}${hidden ? `, ${hidden} asset${hidden === 1 ? '' : 's'} with no approved version` : ''})` : ''}</label>
        <span class="meta">${idx.assets.length} asset${idx.assets.length === 1 ? '' : 's'} · ${idx.assets.reduce((n, a) => n + a.versions.length, 0)} versions · ${idx.pxPerUnit} art pixels per unit at the default detail</span>
      </div>` + classes.map(c => `<section class="gclass"><h2>${esc(c)}s</h2><div class="gtiles">${list.filter(a => a.class === c).map(a => {
        const v = shown(a, all), z = zoomFor(a.target.w, a.target.h, 120), n = a.versions.length;
        return `<a class="gtile" href="?game=${encodeURIComponent(gameId)}&tab=gallery&asset=${encodeURIComponent(a.id)}" data-asset="${esc(a.id)}">
          <span class="gpic">${sprite(a, v, 'sprite.png', z)}<span class="game" title="at game size">${sprite(a, v)}</span></span>
          <b>${esc(a.name)}</b>
          <span class="meta">${a.target.w} x ${a.target.h} px · ${n} version${n === 1 ? '' : 's'}${a.emit ? '' : ' · from sprites.js'}</span>
          <span>${badge(v)}${v.version !== a.live ? ' <span class="meta">not live</span>' : ''}</span></a>`;
      }).join('')}</div></section>`).join('') || '<p class="empty">No approved art yet.</p>';
  }

  // ---------- one asset ----------
  const lampState = { x: .25, y: .2 };
  async function pixels(url) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob()), c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
    return x.getImageData(0, 0, bmp.width, bmp.height);
  }
  function tree(a, sel, showAll) {
    const kids = p => a.versions.filter(v => (v.parent || null) === p && (showAll || v.status !== 'rejected' || v.version === sel));
    const walk = (p, d) => kids(p).map(v => `<li style="margin-left:${d * 18}px"><a href="?game=${encodeURIComponent(gameId)}&tab=gallery&asset=${encodeURIComponent(a.id)}&v=${v.version}"
      class="${v.version === sel ? 'cur' : ''}">${v.version}</a> ${badge(v)}${v.version === a.live ? ' <b class="livemark">live</b>' : ''} <span class="meta">${esc(v.kind)}${v.note ? ' · ' + esc(v.note.length > 70 ? v.note.slice(0, 69) + '…' : v.note) : ''}</span></li>${walk(v.version, d + 1)}`).join('');
    return `<ul class="vtree">${walk(null, 0)}</ul>`;
  }
  async function detail(a) {
    const showAll = q().get('all') === '1';
    const sel = a.versions.find(v => v.version === q().get('v')) || liveOf(a) || a.versions[a.versions.length - 1];
    const vs = a.versions.filter(v => showAll || v.status !== 'rejected' || v.version === sel.version);
    const z = zoomFor(a.target.w, a.target.h, 220);
    const raw = sel.raw === 'published' ? `<a href="${img(a, sel, 'raw.png')}" target="_blank" rel="noopener"><img class="rawimg" src="${img(a, sel, 'raw.png')}" alt="raw"></a>`
      : sel.source ? `<a href="/${esc(sel.source)}" target="_blank" rel="noopener"><img class="rawimg" src="/${esc(sel.source)}" alt="the owner's drawing" style="image-rendering:pixelated"></a>`
      : `<span class="meta">${sel.raw === 'kept' ? 'kept in the repository, not published to the site (only the live version\'s raw is)' : 'none (drawn by hand)'}</span>`;
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
    const refs = (sel.refs || []).map(r => `<code>${esc(r.path)}</code> <span class="meta">${esc(r.role || '')}</span>`).join('<br>');
    const api = sel.api ? `${esc(sel.api.provider)} · ${esc(sel.api.model || '')}${sel.api.requestId ? ` · <span class="meta">${esc(sel.api.requestId)}</span>` : ''}` : '';
    const snap = sel.snap ? `pixel size ${esc(sel.snap.pixelSize)} · ${esc(sel.snap.colors || '')} colours${sel.snap.palette ? ' · palette ' + esc(sel.snap.palette) : ''} · ${esc((sel.snap.size || []).join(' x '))}` : '';
    const strip = vs.map(v => `<a class="vitem${v.version === sel.version ? ' cur' : ''}" href="?game=${encodeURIComponent(gameId)}&tab=gallery&asset=${encodeURIComponent(a.id)}&v=${v.version}" data-v="${v.version}">
      <span class="vpic">${sprite(a, v, 'sprite.png', Math.max(2, Math.min(4, zoomFor(a.target.w, a.target.h, 56))))}</span><b>${v.version}</b>${badge(v)}${v.version === a.live ? '<span class="livemark">live</span>' : ''}</a>`).join('');
    const opts = (cur) => a.versions.map(v => `<option value="${v.version}"${v.version === cur ? ' selected' : ''}>${v.version} · ${esc(v.status)}</option>`).join('');
    const ca = q().get('a') || (a.versions.length > 1 ? a.versions[a.versions.length - 2].version : a.versions[0].version), cb = q().get('b') || a.versions[a.versions.length - 1].version;
    return `<div class="gback"><a class="btn small" href="?game=${encodeURIComponent(gameId)}&tab=gallery${showAll ? '&all=1' : ''}">[ ← ALL ]</a>
        <h2>${esc(a.name)} <span class="meta">${esc(a.class)} · ${a.target.w} x ${a.target.h} px · k ${a.k} · ${a.live ? 'live: ' + a.live : 'not live yet'}${a.char ? ` · map character <code>${esc(a.char)}</code>` : ''}</span></h2></div>
      <div class="gdetail">
        <section class="gpics">
          <figure><span class="pic">${sprite(a, sel, 'sprite.png', z)}</span><figcaption>snapped sprite · version ${sel.version} · ${badge(sel)}</figcaption></figure>
          <figure><span class="pic">${sprite(a, sel, 'sprite.png')}</span><figcaption>game size, 1:1</figcaption></figure>
          <figure><span class="pic">${sprite(a, sel, 'normals.png', z)}</span><figcaption>normal map</figcaption></figure>
          <figure><span class="pic lamp" id="litBox"><canvas id="litCv"></canvas></span><figcaption>lit by a lamp (move the pointer over it)</figcaption></figure>
          <figure><span class="pic">${raw}</span><figcaption>${sel.raw === 'none' && sel.source ? 'the owner\'s original drawing' : 'raw image'}</figcaption></figure>
        </section>
        <section class="ginfo"><dl>
          ${row('kind', esc(sel.kind))}${row('status', badge(sel) + (sel.version === a.live ? ' <b class="livemark">live</b>' : ''))}${row('created', esc(when(sel.created)) + (sel.by ? ' · ' + esc(sel.by) : ''))}
          ${row('parent', sel.parent ? `<a href="?game=${encodeURIComponent(gameId)}&tab=gallery&asset=${encodeURIComponent(a.id)}&v=${sel.parent}">${sel.parent}</a>` : '')}
          ${row('note', esc(sel.note))}${row('brief', esc(sel.brief))}${row('prompt', sel.prompt ? `<pre>${esc(sel.prompt)}</pre>` : '')}
          ${row('references', refs)}${row('API', api)}${row('snapped', snap)}${row('normals', sel.normals ? `bevel ${sel.normals.bevel} · detail ${sel.normals.detail} · strength ${sel.normals.strength}` : '')}
          ${row('map', esc(sel.map))}${row('made from', sel.source ? `<code>${esc(sel.source)}</code>` : '')}
        </dl></section>
      </div>
      <section class="gversions"><h3>Versions</h3><div class="vstrip">${strip}</div>
        <label class="check"><input type="checkbox" id="gAll"${showAll ? ' checked' : ''}> show rejected</label>
        <h3>Which came from which</h3>${tree(a, sel.version, showAll)}</section>
      <section class="gcompare"><h3>Compare</h3>
        <div class="gtools"><label>A <select id="cmpA">${opts(ca)}</select></label><label>B <select id="cmpB">${opts(cb)}</select></label>
          <span class="meta" id="cmpInfo"></span></div>
        <div class="cmp" id="cmp"></div></section>`;
  }

  // the lit picture: the sprite's colours, brighter where its normal faces the lamp (as the PIXEL LAB and the engine do)
  async function lit(a, v) {
    const cv = document.getElementById('litCv'); if (!cv) return;
    const [col, nm] = await Promise.all([pixels(img(a, v, 'sprite.png')), pixels(img(a, v, 'normals.png'))]);
    const idx = normalsFromMapRGBA(nm.data, nm.width, nm.height), w = col.width, h = col.height, z = zoomFor(w, h, 220);
    cv.width = w; cv.height = h; cv.style.width = w * z + 'px'; cv.style.height = h * z + 'px';
    const x = cv.getContext('2d'), out = x.createImageData(w, h);
    const paint = () => {
      const Lx = lampState.x * w, Ly = lampState.y * h;
      for (let i = 0; i < w * h; i++) {
        const q4 = i * 4; if (col.data[q4 + 3] < 128 || idx[i] === 255) { out.data[q4 + 3] = 0; continue; }
        const px = (i % w) + .5, py = ((i / w) | 0) + .5, dx = Lx - px, dy = Ly - py, d = Math.hypot(dx, dy) || 1;
        const f = 1.15 * (.5 + .5 * relief(NORMALS[idx[i]], dx / d, dy / d, .35));
        out.data[q4] = Math.min(255, col.data[q4] * f); out.data[q4 + 1] = Math.min(255, col.data[q4 + 1] * f); out.data[q4 + 2] = Math.min(255, col.data[q4 + 2] * f); out.data[q4 + 3] = 255;
      }
      x.putImageData(out, 0, 0);
    };
    paint();
    const box = document.getElementById('litBox');
    box.onpointermove = e => { const r = cv.getBoundingClientRect(); lampState.x = (e.clientX - r.left) / r.width * 1.0; lampState.y = (e.clientY - r.top) / r.height; paint(); };
  }

  // two versions side by side (at game size and enlarged) and as a difference: pixels that differ light up over a dimmed A
  async function compare(a) {
    const A_ = a.versions.find(v => v.version === document.getElementById('cmpA').value), B_ = a.versions.find(v => v.version === document.getElementById('cmpB').value);
    const [pa, pb] = await Promise.all([pixels(img(a, A_, 'sprite.png')), pixels(img(a, B_, 'sprite.png'))]);
    const w = Math.max(pa.width, pb.width), h = Math.max(pa.height, pb.height), z = zoomFor(w, h, 200);
    const at = (p, x, y) => x < p.width && y < p.height ? [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)] : [0, 0, 0, 0];
    const diff = new ImageData(w, h); let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = at(pa, x, y), t = at(pb, x, y), o = (y * w + x) * 4, same = u[3] < 128 && t[3] < 128 || (u[3] >= 128 && t[3] >= 128 && Math.abs(u[0] - t[0]) + Math.abs(u[1] - t[1]) + Math.abs(u[2] - t[2]) < 12);
      if (same) { diff.data.set(u[3] >= 128 ? [u[0] * .35, u[1] * .35, u[2] * .35, 255] : [0, 0, 0, 0], o); } else { diff.data.set([255, 60, 200, 255], o); n++; }
    }
    const canvas = (im, zz) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0); c.style.width = im.width * zz + 'px'; c.style.height = im.height * zz + 'px'; return c; };
    const wrap = (label, el) => { const f = document.createElement('figure'); const s = document.createElement('span'); s.className = 'pic'; s.append(el); f.append(s); const c = document.createElement('figcaption'); c.textContent = label; f.append(c); return f; };
    const box = document.getElementById('cmp'); box.textContent = '';
    const mk = (p, zz) => canvas(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), zz);
    box.append(wrap(`${A_.version} at game size`, mk(pa, 1)), wrap(`${A_.version}`, mk(pa, z)), wrap(`${B_.version}`, mk(pb, z)), wrap(`${B_.version} at game size`, mk(pb, 1)), wrap(`what differs (${n} pixel${n === 1 ? '' : 's'})`, canvas(diff, z)));
    document.getElementById('cmpInfo').textContent = `${pa.width} x ${pa.height} against ${pb.width} x ${pb.height}${A_ === B_ ? ' (the same version)' : ''}`;
  }

  async function draw() {
    const p = q(), a = p.get('asset') ? A(p.get('asset')) : null;
    if (p.get('asset') && !a) { root.innerHTML = `<p class="empty">No asset "${esc(p.get('asset'))}". <a href="?game=${encodeURIComponent(gameId)}&tab=gallery">All art</a></p>`; return; }
    root.innerHTML = a ? await detail(a) : tiles();
    const all = document.getElementById('gAll'); if (all) all.onchange = () => go({ all: all.checked }, false);
    if (a) {
      const sel = a.versions.find(v => v.version === p.get('v')) || liveOf(a) || a.versions[a.versions.length - 1];
      lit(a, sel);
      for (const id of ['cmpA', 'cmpB']) document.getElementById(id).onchange = () => { const q2 = q(); q2.set(id === 'cmpA' ? 'a' : 'b', document.getElementById(id).value); history.replaceState(null, '', '?' + q2); compare(a); };
      compare(a);
    }
    document.title = `${a ? a.name + ' · ' : ''}${gameTitle}: art gallery · Pixelite`;
  }
  // links are ordinary addresses; clicking one redraws in place
  root.addEventListener('click', e => {
    const l = e.target.closest('a[href^="?"]'); if (!l || e.metaKey || e.ctrlKey || e.shiftKey || l.target) return;
    e.preventDefault(); history.pushState(null, '', l.getAttribute('href')); draw(); scrollTo(0, 0);
  });
  addEventListener('popstate', () => { if (q().get('tab') === 'gallery') draw(); });
  await draw();
}
