// The editor's LEVELS tab: a pixel editor for a game's tile maps. One map character is one tile, drawn as a square in the
// colour game.json's "levels" legend gives it. Painting writes the map back into the game's source file as a draft, the
// same draft the CODE tab edits, so the preview runs it and the CLAUDE tab hands it over as a patch.
// PLAY starts the preview on this map (or, with the TEST tool, on the tile you click); CHECK asks the game whether the map
// can be finished and marks what can't be reached. The parsing and the edits themselves are in levels-core.mjs.
import { findLevels, setLevel, problems, paint, rectCells, lineCells, floodCells, resize, readMarks, toPixels, fromPixels, rgb } from '/assets/levels-core.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ZOOMS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32];
const TOOLS = [['pen', 'PEN', 'B', 'Paint tiles (left: first colour, right: second)'], ['rect', 'RECT', 'R', 'Fill a rectangle'],
  ['fill', 'FILL', 'F', 'Flood fill a connected area'], ['pick', 'PICK', 'I', 'Take a tile\'s colour (left / right)'],
  ['pan', 'PAN', 'H', 'Drag to move around (also: middle button, or hold Space)'], ['test', 'TEST', 'T', 'Click a tile to play from there']];

export function setupLevels(api) {
  const spec = api.spec, legend = spec.legend, path = api.path, keys = Object.keys(legend);
  const L = { levels: [], cur: 0, rows: null, text: null, undo: {}, redo: {}, tool: 'pen', primary: keys.includes('#') ? '#' : keys[0],
    secondary: keys.includes('.') ? '.' : keys[1] || keys[0], zoom: 0, grid: true, hover: null, drag: null, report: null, reportRows: null };
  const cv = $('#lvCanvas'), wrap = $('#lvWrap'), ctx = cv.getContext('2d');
  const colors = {}; for (const k of keys) colors[k] = `rgb(${rgb(legend[k].color).join(',')})`;
  const ink = k => { const [r, g, b] = rgb(legend[k].color); return .3 * r + .59 * g + .11 * b > 140 ? '#10131a' : '#e8edf5'; };

  // ---------- reading and writing the map file ----------
  function parse() {
    const text = api.textOf(path);
    if (text === L.text) return;
    L.text = text; L.levels = findLevels(text);
    if (L.cur >= L.levels.length) L.cur = 0;
    L.rows = L.levels[L.cur] ? L.levels[L.cur].rows.slice() : null;
  }
  function write(rows, keepRedo) {
    const lv = L.levels[L.cur];
    (L.undo[L.cur] = L.undo[L.cur] || []).push(L.rows.slice()); if (L.undo[L.cur].length > 200) L.undo[L.cur].shift();
    if (!keepRedo) L.redo[L.cur] = [];
    L.rows = rows.slice();
    commit(lv);
  }
  function commit(lv) {
    const text = setLevel(api.textOf(path), lv, L.rows);
    api.saveDraft(path, text); L.text = text; L.levels = findLevels(text);
    api.edited(path);
    draw(); info();
  }
  function undo() { const u = L.undo[L.cur]; if (!u || !u.length) return; (L.redo[L.cur] = L.redo[L.cur] || []).push(L.rows.slice()); L.rows = u.pop(); commit(L.levels[L.cur]); }
  function redo() { const r = L.redo[L.cur]; if (!r || !r.length) return; (L.undo[L.cur] = L.undo[L.cur] || []).push(L.rows.slice()); L.rows = r.pop(); commit(L.levels[L.cur]); }

  // ---------- drawing ----------
  const W = () => L.rows[0].length, H = () => L.rows.length;
  function fitZoom() { const z = Math.floor((wrap.clientWidth - 8) / W()); return ZOOMS.reduce((a, b) => b <= Math.max(4, Math.min(16, z)) ? b : a, 4); }
  function draw() {
    if (!L.rows) return;
    if (!L.zoom) L.zoom = fitZoom();
    const z = L.zoom, dpr = Math.min(2, devicePixelRatio || 1), w = W(), h = H();
    if (cv.width !== Math.round(w * z * dpr) || cv.height !== Math.round(h * z * dpr)) { cv.width = Math.round(w * z * dpr); cv.height = Math.round(h * z * dpr); cv.style.width = `${w * z}px`; cv.style.height = `${h * z}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rows = L.drag && L.drag.preview ? L.drag.preview : L.rows;
    ctx.font = `700 ${Math.max(6, Math.floor(z * .72))}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x], e = legend[c];
      if (!e) { ctx.fillStyle = '#ff00ff'; ctx.fillRect(x * z, y * z, z, z); continue; }
      if (e.on) {   // an object: the tile it sits on, a smaller square of its own colour, and its letter
        ctx.fillStyle = colors[e.on] || '#000'; ctx.fillRect(x * z, y * z, z, z);
        const m = Math.max(1, Math.round(z * .16)); ctx.fillStyle = colors[c]; ctx.fillRect(x * z + m, y * z + m, z - 2 * m, z - 2 * m);
        if (z >= 10) { ctx.fillStyle = ink(c); ctx.fillText(c, x * z + z / 2, y * z + z / 2 + 1); }
      } else {
        ctx.fillStyle = colors[c]; ctx.fillRect(x * z, y * z, z, z);
        if (z >= 20 && c !== ' ' && c !== '.') { ctx.fillStyle = ink(c) === '#10131a' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.3)'; ctx.fillText(c, x * z + z / 2, y * z + z / 2 + 1); }
      }
    }
    if (L.grid && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= w; x++) { ctx.moveTo(x * z + .5, 0); ctx.lineTo(x * z + .5, h * z); }
      for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * z + .5); ctx.lineTo(w * z, y * z + .5); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath();   // every tenth line, to count by
      for (let x = 0; x <= w; x += 10) { ctx.moveTo(x * z + .5, 0); ctx.lineTo(x * z + .5, h * z); }
      for (let y = 0; y <= h; y += 10) { ctx.moveTo(0, y * z + .5); ctx.lineTo(w * z, y * z + .5); }
      ctx.stroke();
    }
    // the level's marks (read-only: change them in the code)
    ctx.font = `700 ${Math.max(9, Math.min(13, z))}px "JetBrains Mono", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const m of readMarks(L.levels[L.cur], spec.marks)) {
      ctx.strokeStyle = ctx.fillStyle = m.color || '#fff'; ctx.lineWidth = 1.5;
      if (m.kind === 'rect') { ctx.setLineDash([5, 4]); ctx.strokeRect(m.x0 * z + 1, m.y0 * z + 1, (m.x1 - m.x0 + 1) * z - 2, (m.y1 - m.y0 + 1) * z - 2); ctx.setLineDash([]); ctx.fillText(m.text, m.x0 * z + 4, m.y0 * z + 4); }
      else { ctx.fillText(`"${m.text}"`, m.x * z + 2, m.y * z + 2); }
    }
    // the last CHECK: where the mouse can stand, and what it cannot reach
    if (L.report && L.report.spots) {
      const stale = L.reportRows !== L.rows.join('\n');
      ctx.globalAlpha = stale ? .35 : 1;
      ctx.fillStyle = '#3cff7a';
      for (const [x, y] of L.report.spots) ctx.fillRect(x * z + z / 2 - Math.max(1, z / 8), y * z + z / 2 - Math.max(1, z / 8), Math.max(2, z / 4), Math.max(2, z / 4));
      ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2;
      for (const [x, y] of [...(L.report.missing?.crumbs || []), ...(L.report.missing?.checkpoints || [])]) { ctx.beginPath(); ctx.arc(x * z + z / 2, y * z + z / 2, Math.max(4, z * .9), 0, 6.283); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // what the tool would do here
    const hv = L.hover;
    if (L.drag && L.drag.rect) { const r = L.drag.rect; ctx.strokeStyle = '#ffb340'; ctx.lineWidth = 2; ctx.strokeRect(Math.min(r[0], r[2]) * z + 1, Math.min(r[1], r[3]) * z + 1, (Math.abs(r[2] - r[0]) + 1) * z - 2, (Math.abs(r[3] - r[1]) + 1) * z - 2); }
    else if (hv) { ctx.strokeStyle = L.tool === 'test' ? '#3cff7a' : '#ffb340'; ctx.lineWidth = 2; ctx.strokeRect(hv[0] * z + 1, hv[1] * z + 1, z - 2, z - 2); }
  }
  function info() {
    const hv = L.hover, rows = L.rows, bad = problems(rows, legend);
    const at = hv && rows[hv[1]] ? `x ${hv[0]}  y ${hv[1]}  ${JSON.stringify(rows[hv[1]][hv[0]])} ${legend[rows[hv[1]][hv[0]]]?.name || 'unknown'}` : `${W()} x ${H()} tiles  ·  ${spec.tile || ''}`;
    $('#lvInfo').innerHTML = `<span>${esc(at)}</span>${bad.length ? `<span class="err">${esc(bad.join(' · '))}</span>` : ''}`;
    $('#lvUndo').disabled = !(L.undo[L.cur] || []).length; $('#lvRedo').disabled = !(L.redo[L.cur] || []).length;
    $('#lvW').value = W(); $('#lvH').value = H();
    $('#lvZoom').textContent = `${L.zoom}px`;
  }

  // ---------- the controls around the map ----------
  function renderList() {
    $('#lvList').innerHTML = L.levels.map((lv, i) => `<button type="button" data-i="${i}" aria-pressed="${i === L.cur}">${esc(lv.name)}</button>`).join('');
    $('#lvList').querySelectorAll('button').forEach(b => b.onclick = () => { L.cur = +b.dataset.i; L.rows = L.levels[L.cur].rows.slice(); L.report = null; L.zoom = 0; wrap.scrollLeft = wrap.scrollTop = 0; renderList(); draw(); info(); });
  }
  function renderPalette() {
    $('#lvPalette').innerHTML = keys.map(k => `<button type="button" data-k="${esc(k)}" title="${esc(legend[k].name)} (${esc(JSON.stringify(k))})${legend[k].unique ? ': one per map' : ''}">
      <span class="sw${legend[k].on ? ' obj' : ''}" style="background:${colors[legend[k].on] || colors[k]}"><i style="background:${colors[k]};color:${ink(k)}">${legend[k].on ? esc(k) : ''}</i></span>
      <span class="nm">${esc(legend[k].name)}</span></button>`).join('');
    $('#lvPalette').querySelectorAll('button').forEach(b => {
      b.onclick = () => { L.primary = b.dataset.k; marks(); };
      b.oncontextmenu = e => { e.preventDefault(); L.secondary = b.dataset.k; marks(); };
    });
    marks();
  }
  function marks() {
    $('#lvPalette').querySelectorAll('button').forEach(b => { b.classList.toggle('p1', b.dataset.k === L.primary); b.classList.toggle('p2', b.dataset.k === L.secondary); });
    $('#lvBrush').innerHTML = `<span class="sw" style="background:${colors[L.primary]}"></span>${esc(legend[L.primary].name)} <span class="muted">· right:</span> <span class="sw" style="background:${colors[L.secondary]}"></span>${esc(legend[L.secondary].name)}`;
    $('#lvTools').querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === L.tool)));
    cv.style.cursor = L.tool === 'pan' ? 'grab' : L.tool === 'test' ? 'pointer' : 'crosshair';
  }

  // ---------- painting with the mouse, a pen or a finger ----------
  const tileAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / L.zoom), Math.floor((e.clientY - r.top) / L.zoom)]; };
  const inside = ([x, y]) => x >= 0 && y >= 0 && x < W() && y < H();
  let spaceHeld = false;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const t = tileAt(e), ch = e.button === 2 ? L.secondary : L.primary, tool = e.button === 1 || spaceHeld ? 'pan' : L.tool;
    if (tool === 'pan') { L.drag = { pan: true, x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop }; cv.style.cursor = 'grabbing'; return; }
    if (!inside(t)) return;
    if (tool === 'pick') { const c = L.rows[t[1]][t[0]]; if (legend[c]) { if (e.button === 2) L.secondary = c; else L.primary = c; marks(); } return; }
    if (tool === 'test') { api.play(L.cur, t); return; }
    if (tool === 'fill') { write(paint(L.rows, floodCells(L.rows, t[0], t[1]), ch, legend)); return; }
    if (tool === 'rect') { L.drag = { rect: [t[0], t[1], t[0], t[1]], ch }; draw(); return; }
    L.drag = { pen: true, ch, last: t, preview: paint(L.rows, [t], ch, legend) }; draw();
  });
  cv.addEventListener('pointermove', e => {
    const t = tileAt(e), d = L.drag;
    if (d && d.pan) { wrap.scrollLeft = d.sl - (e.clientX - d.x); wrap.scrollTop = d.st - (e.clientY - d.y); return; }
    L.hover = inside(t) ? t : null;
    if (d && d.pen && inside(t)) { d.preview = paint(d.preview, lineCells(d.last[0], d.last[1], t[0], t[1]), d.ch, legend); d.last = t; }
    if (d && d.rect) { d.rect[2] = Math.max(0, Math.min(W() - 1, t[0])); d.rect[3] = Math.max(0, Math.min(H() - 1, t[1])); }
    draw(); info();
  });
  const end = () => {
    const d = L.drag; L.drag = null;
    if (!d) return;
    if (d.pan) { marks(); return; }
    if (d.pen) write(d.preview);
    else if (d.rect) { const [a, b, c, e] = d.rect; write(paint(L.rows, rectCells(a, b, c, e), d.ch, legend)); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { L.hover = null; if (!L.drag) { draw(); info(); } });
  wrap.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
  function zoom(dir, e) {
    const i = ZOOMS.indexOf(L.zoom), z0 = L.zoom, z1 = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 4 : i) + dir))];
    if (z1 === z0) return;
    const r = wrap.getBoundingClientRect(), px = e ? e.clientX - r.left : r.width / 2, py = e ? e.clientY - r.top : r.height / 2;
    const tx = (wrap.scrollLeft + px) / z0, ty = (wrap.scrollTop + py) / z0;   // keep the tile under the pointer where it is
    L.zoom = z1; draw(); wrap.scrollLeft = tx * z1 - px; wrap.scrollTop = ty * z1 - py; info();
  }
  addEventListener('keydown', e => {
    if ($('#pane-levels').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.closest?.('.CodeMirror')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ') { spaceHeld = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
    const t = TOOLS.find(x => x[2].toLowerCase() === k); if (t) { L.tool = t[0]; marks(); return; }
    if (k === '+' || k === '=') zoom(1); else if (k === '-') zoom(-1); else if (k === 'x') { [L.primary, L.secondary] = [L.secondary, L.primary]; marks(); }
  });
  addEventListener('keyup', e => { if (e.key === ' ') { spaceHeld = false; marks(); } });

  // ---------- buttons ----------
  $('#lvTools').innerHTML = TOOLS.map(([t, label, key, help]) => `<button type="button" class="btn small" data-t="${t}" title="${esc(help)} (${key})" aria-pressed="false">[ ${label} ]</button>`).join('') +
    `<span class="sep"></span><button type="button" class="btn small" id="lvUndo" title="Undo (Ctrl/Cmd+Z)">[ UNDO ]</button><button type="button" class="btn small" id="lvRedo" title="Redo (Ctrl/Cmd+Y)">[ REDO ]</button>
     <span class="sep"></span><button type="button" class="btn small" id="lvOut" title="Zoom out (-)">[ - ]</button><span id="lvZoom" class="muted"></span><button type="button" class="btn small" id="lvIn" title="Zoom in (+, or Ctrl + wheel)">[ + ]</button>
     <button type="button" class="btn small" id="lvGrid" aria-pressed="true" title="Grid lines">[ GRID ]</button>`;
  $('#lvTools').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { L.tool = b.dataset.t; marks(); });
  $('#lvUndo').onclick = undo; $('#lvRedo').onclick = redo;
  $('#lvIn').onclick = () => zoom(1); $('#lvOut').onclick = () => zoom(-1);
  $('#lvGrid').onclick = () => { L.grid = !L.grid; $('#lvGrid').setAttribute('aria-pressed', String(L.grid)); draw(); };
  $('#lvResize').onclick = () => {
    const w = Math.max(8, Math.min(600, parseInt($('#lvW').value, 10) || W())), h = Math.max(6, Math.min(200, parseInt($('#lvH').value, 10) || H()));
    if (w !== W() || h !== H()) write(resize(L.rows, w, h, keys.includes('#') ? '#' : keys[0]));
  };
  $('#lvPlay').onclick = () => api.play(L.cur, null);
  $('#lvCheck').onclick = async () => {
    const bad = problems(L.rows, legend);
    if (bad.length) { report({ error: `fix the map first: ${bad.join('; ')}` }); return; }
    $('#lvCheck').disabled = true; report({ busy: true });
    const rows = L.rows.join('\n');
    try { const r = await api.check(L.cur); L.report = r; L.reportRows = rows; report(r); } catch (err) { report({ error: String(err.message || err) }); }
    $('#lvCheck').disabled = false; draw();
  };
  $('#lvRevert').onclick = () => {
    const orig = findLevels(api.origText(path))[L.cur];
    if (!orig || orig.rows.join('\n') === L.rows.join('\n')) return;
    if (confirm(`Put "${L.levels[L.cur].name}" back as it is on the site?`)) write(orig.rows);
  };
  $('#lvPngOut').onclick = () => {
    const c = document.createElement('canvas'); c.width = W(); c.height = H();
    c.getContext('2d').putImageData(new ImageData(toPixels(L.rows, legend), W(), H()), 0, 0);
    c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${api.id}-${L.levels[L.cur].name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
  };
  $('#lvPngIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const img = await createImageBitmap(f), c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    if (img.width > 600 || img.height > 200) { report({ error: `that picture is ${img.width} x ${img.height}: a map is one pixel per tile, at most 600 x 200` }); return; }
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    write(fromPixels(x.getImageData(0, 0, img.width, img.height).data, img.width, img.height, legend));
    report({ note: `loaded ${f.name}: ${img.width} x ${img.height} tiles, each pixel matched to the nearest colour in the legend` });
  };
  function report(r) {
    const el = $('#lvReport');
    if (!r) { el.innerHTML = ''; return; }
    if (r.busy) { el.innerHTML = '<span class="muted">checking: the game is trying every walk and jump from every place the mouse can stand…</span>'; return; }
    if (r.error) { el.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    if (r.note) { el.innerHTML = `<span class="muted">${esc(r.note)}</span>`; return; }
    const miss = [...(r.missing?.crumbs || []).map(t => `crumb at ${t}`), ...(r.missing?.checkpoints || []).map(t => `checkpoint at ${t}`)];
    el.innerHTML = `<span class="${r.ok ? 'ok' : 'err'}">${r.ok ? '✓ CAN BE FINISHED' : '✗ ' + (r.goal ? 'NOT EVERYTHING CAN BE REACHED' : 'THE GOAL CANNOT BE REACHED')}</span>
      <span class="muted">goal ${r.goal ? 'reached' : 'not reached'} · crumbs ${r.crumbs?.join('/')} · checkpoints ${r.checkpoints?.join('/')} · ${r.ms} ms</span>
      ${miss.length ? `<span class="err">out of reach (circled): ${esc(miss.join(', '))}</span>` : ''}
      <span class="muted">green dots: where the mouse can stand.</span>`;
  }

  return {
    show() {
      parse();
      if (!L.levels.length) { $('#lvInfo').innerHTML = `<span class="err">no maps found in ${esc(path)} (each map is a String.raw\`…\` block)</span>`; return; }
      if (!L.rows || L.rows.join('\n') !== L.levels[L.cur].rows.join('\n')) L.rows = L.levels[L.cur].rows.slice();
      renderList(); renderPalette(); requestAnimationFrame(() => { draw(); info(); });
    },
    // the file changed somewhere else (the CODE tab, a revert, discarding every edit): read the maps again
    refresh() { L.text = null; if (!$('#pane-levels').hidden) this.show(); }
  };
}
