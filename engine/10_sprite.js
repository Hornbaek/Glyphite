// ===================== ENGINE · sprites: pixel art in the world =====================
// A sprite is palette-indexed pixel art, in the format tools/sprite2ascii.py writes:
//   { w, h, pal: [[r, g, b, ink], ...], rows: ['..01..', ...] }
// '.' is empty; any other character indexes pal in base 36. ink 0 marks an outline colour (a fifth entry, the glyph the
// ASCII engine used, is ignored).
//
// Every world cell the sprite covers takes 3 x 3 samples of it in the object's own frame, so the drawing turns with the
// body. A cell that is mostly covered becomes one pixel in the colour most of its samples land on, lit by the scene; the
// rest stay clear. Parts (legs, doors, turrets) are looked up with their own offset, so they can slide or open without new art.
//
// defineSprite(data, opts) → sprite
//   k        base units per sprite pixel (its size in the world; RES is applied when drawing)
//   ox, oy   origin pixel, the body's centre of mass (default: the middle)
//   part(c, r)        → 0 for the main body, 1..n for parts drawn with their own offset
// drawSprite(spr, x, y, a, o)  draw at (x, y) world units, rotated by a radians. Options:
//   shift  [dx1, dy1, dx2, dy2, ...]: each part's offset in units, in the sprite's frame
//   foot   units below the origin that snap to a row boundary (feet stand right on the ground)
//   light  false: fixed colours; default: lit by the scene, but never dark
//   flip   true: mirrored left to right in its own frame (a character facing the other way)
//   cache  true: a still sprite (a = 0, no shift) is worked out once per detail level and then only lit (trees, buildings)
// markSpriteDyn(spr, x, y, a, o) → top row; marks the covered cells as dynamic shadow casters.
const SPR_S = 3, SPR_FILL = .45;   // samples across a cell (and per unit of its height); the share that must land on the art
const HUD_ASPECT = FONT_H / FONT_W;   // a HUD cell is twice as tall as wide, unlike the world's square cells
const _sprNoShift = [];

function defineSprite(data, opts = {}) {
  const { w, h, pal, rows } = data, n = w * h;
  const idx = new Uint8Array(n).fill(255), part = new Uint8Array(n);
  let parts = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c]; if (ch === '.' || ch === undefined) continue;
    idx[r * w + c] = parseInt(ch, 36);
    const p = opts.part ? opts.part(c, r) | 0 : 0;
    part[r * w + c] = p; if (p > parts) parts = p;
  }
  // palette in the renderer's light units, so that after tone mapping it shows the sprite's own colours
  const lin = pal.map(([r, g, b]) => [r, g, b].map(v => -Math.log(1 - Math.min(.93, v / 255)) / 1.7));
  const ox = opts.ox ?? w / 2, oy = opts.oy ?? h / 2;
  return { w, h, k: opts.k ?? .25, ox, oy, idx, part, parts, lin,
    reach: Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)), hist: new Uint16Array(pal.length) };
}

// sprite pixel under a point of the sprite's frame (units at the current detail), or -1; parts are
// looked up where the point was before they moved by their shift
function spritePixel(spr, lx, ly, sh) {
  const s = spr.k * RES, w = spr.w, h = spr.h;
  let c = Math.floor(lx / s + spr.ox), r = Math.floor(ly / s + spr.oy);
  if (c >= 0 && r >= 0 && c < w && r < h) { const k = r * w + c; if (spr.idx[k] !== 255 && !spr.part[k]) return k; }
  for (let p = 1; p <= spr.parts; p++) {
    c = Math.floor((lx + (sh[p * 2 - 2] || 0)) / s + spr.ox); r = Math.floor((ly + (sh[p * 2 - 1] || 0)) / s + spr.oy);
    if (c >= 0 && r >= 0 && c < w && r < h) { const k = r * w + c; if (spr.part[k] === p && spr.idx[k] !== 255) return k; }
  }
  return -1;
}
// the sprite is pinned to the character grid, so it holds still while the object translates; vertically
// the foot line snaps to a row boundary, so a landed craft stands right on the ground
function spriteBox(spr, x, y, o) {
  const foot = o.foot || 0, sh = o.shift || _sprNoShift;
  let ext = 0; for (let i = 0; i < sh.length; i++) ext = Math.max(ext, Math.abs(sh[i]));
  const bx = Math.round(x), by = Math.round((y + foot) / ASPECT) * ASPECT - foot, rad = spr.reach * spr.k * RES + ext + 1;
  return [bx, by, Math.floor(bx - rad), Math.floor((by - rad) / ASPECT), Math.ceil(bx + rad), Math.ceil((by + rad) / ASPECT)];
}

const _sprL = [0, 0, 0];
// one cell of a sprite into the world grid; lit by the scene, but never dark: the art already carries its own shading
function sprEmit(cx, cy, glyph, r, g, b, lit) {
  if (lit) { lightAtCell(cx, cy, _sprL); putEmit(cx, cy, glyph, r * (.75 + .4 * Math.min(1.3, _sprL[0])), g * (.75 + .4 * Math.min(1.3, _sprL[1])), b * (.75 + .4 * Math.min(1.3, _sprL[2]))); }
  else putEmit(cx, cy, glyph, r, g, b);
}
function drawSprite(spr, x, y, a, o = {}) {
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), fl = o.flip ? -1 : 1, lit = o.light !== false;
  if (x1 < L_OX || y1 < L_OY || x0 >= L_OX + R.RW || y0 >= L_OY + R.RH) return;   // nothing of it on screen
  if (o.cache && !a && !sh.length) {
    // a still sprite (unrotated, no moving parts) comes out the same wherever it stands, since it is pinned to the character
    // grid: work its cells out once per detail level, then only light them
    const foot = o.foot || 0, row0 = Math.round((by + foot) / ASPECT), key = `${fl}|${foot}|${RES}`;
    const stamps = spr.stamps || (spr.stamps = new Map());
    let st = stamps.get(key);
    if (!st) { st = []; sprCells(spr, bx, by, x0, y0, x1, y1, 0, sh, fl, false, (cx, cy, g, r, gg, b) => st.push(cx - bx, cy - row0, g, r, gg, b)); stamps.set(key, st); }
    for (let k = 0; k < st.length; k += 6) sprEmit(bx + st[k], row0 + st[k + 1], st[k + 2], st[k + 3], st[k + 4], st[k + 5], lit);
    return;
  }
  sprCells(spr, bx, by, x0, y0, x1, y1, a, sh, fl, lit, sprEmit);
}
// asp: the cell's height in units (the world's ASPECT, or HUD_ASPECT for a picture on the HUD)
function sprCells(spr, bx, by, x0, y0, x1, y1, a, sh, fl, lit, emit, asp = ASPECT) {
  const c = Math.cos(a), s = Math.sin(a), hist = spr.hist, np = hist.length, sy = Math.round(SPR_S * asp), need = SPR_FILL * SPR_S * sy;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    let occ = 0; hist.fill(0);
    for (let j = 0; j < sy; j++) for (let i = 0; i < SPR_S; i++) {
      const wx = cx + (i + .5) / SPR_S - bx, wy = (cy + (j + .5) / sy) * asp - by;
      const px = spritePixel(spr, (wx * c + wy * s) * fl, -wx * s + wy * c, sh);
      if (px >= 0) { occ++; hist[spr.idx[px]]++; }
    }
    if (occ < need) continue;
    let dom = 0; for (let p = 1; p < np; p++) if (hist[p] > hist[dom]) dom = p;
    const q = spr.lin[dom];
    emit(cx, cy, SOLID, q[0], q[1], q[2], lit);
  }
}

// the sprite as a small picture on the HUD grid (an icon in a menu, a portrait), fitted into w columns (and o.rows rows,
// if given) with its top-left on HUD cell (c, r), centred and standing on the box's bottom; returns the rows it takes.
// o.flip mirrors it, o.gain brightens it (dark art on the HUD's black). Worked out once per size; the art's own colours, unlit.
function hudSprite(spr, c, r, w, o = {}) {
  const fl = o.flip ? -1 : 1, gain = o.gain || 1, key = `${w}|${o.rows}|${fl}|${gain}`, icons = spr.icons || (spr.icons = new Map());
  let ic = icons.get(key);
  if (!ic) {
    // a copy at the scale that fits the box, its origin at the middle of its bottom edge
    const s = Math.min(w / spr.w, o.rows ? o.rows * HUD_ASPECT / spr.h : 1e9), rows = o.rows || Math.ceil(spr.h * s / HUD_ASPECT);
    const q = v => Math.min(255, Math.round(255 * tone(v * gain)));
    ic = { rows, cells: [] };
    sprCells({ ...spr, k: s / RES, ox: spr.w / 2, oy: spr.h }, w / 2, rows * HUD_ASPECT, 0, 0, w - 1, rows - 1, 0, _sprNoShift, fl, false,
      (cx, cy, g, cr, cg, cb) => ic.cells.push(cx, cy, g, q(cr), q(cg), q(cb)), HUD_ASPECT);
    icons.set(key, ic);
  }
  const k = ic.cells;
  for (let n = 0; n < k.length; n += 6) hudPut(c + k[n], r + k[n + 1], k[n + 2], k[n + 3], k[n + 4], k[n + 5]);
  return ic.rows;
}

// cells the sprite covers, for shadows and lighting
function markSpriteDyn(spr, x, y, a, o = {}) {
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), c = Math.cos(a), s = Math.sin(a), fl = o.flip ? -1 : 1; let top = 1e9;
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    const wx = cx + .5 - bx, wy = (cy + .5) * ASPECT - by;
    if (spritePixel(spr, (wx * c + wy * s) * fl, -wx * s + wy * c, sh) < 0) continue;
    markDynCell(cy * W + cx); if (cy < top) top = cy;
  }
  return top;
}

// collision hull points from a sprite's silhouette: its boundary pixels, thinned to about one in
// `step` (base units, origin at the sprite origin; multiply by RES when building a Body)
function spriteHull(spr, step = 4, kind = 0) {
  const out = [], { w, h, idx, k, ox, oy } = spr, on = (c, r) => c >= 0 && r >= 0 && c < w && r < h && idx[r * w + c] !== 255;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (!on(c, r) || (on(c - 1, r) && on(c + 1, r) && on(c, r - 1) && on(c, r + 1))) continue;
    if ((c + r * 7) % step) continue;
    out.push({ x: (c + .5 - ox) * k, y: (r + .5 - oy) * k, kind });
  }
  return out;
}
