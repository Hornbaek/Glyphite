// ===================== ENGINE · sprites: pixel art in the world =====================
// A sprite is palette-indexed pixel art, in the format tools/pixelsprite.py writes:
//   { w, h, pal: [[r, g, b, ink], ...], rows: ['..01..', ...], normals?: ['..0g..', ...], emit?: ['....9.', ...] }
// '.' is empty; any other character indexes pal in base 36. ink 0 marks an outline colour (a fifth entry, the glyph the
// ASCII engine used, is ignored). `normals`, optional, is the sprite's normal map: for each pixel, in base 36, a direction
// from SPR_NORMALS (made by tools/normalmap.mjs or the PIXEL LAB page), so lamps and the sun model the drawing.
// `emit`, optional, is the emission layer, the same size as rows: '.' where a pixel does not glow, a base-36 digit where it does (1..9: that share of the
// pixel is its own colour, unlit, and the rest lit as usual; 9 is a window or a screen that is fully its own light; a..z brighter than the art, up to 3.9).
// A glowing pixel is drawn unlit and gives light: the lamps' splat (splatLight) at its place, one frame later (see EMIT). defineSprite's `glow` is the
// radius of that light in base cells (default 3; 0 = glowing pixels but no light) and `glowGain` its strength per base cell of glow (default .05).
//
// Every world cell the sprite covers takes 3 x 3 samples of it in the object's own frame, so the drawing turns with the
// body. A cell that is mostly covered becomes one pixel, lit by the scene; the rest stay clear. Its colour is picked the way
// pixel art is drawn small: on the silhouette (some samples off the art) the outline wins if it is there at all, so the shape
// keeps its dark edge; inside, the paint colour most samples landed on wins, so inner lines thinner than a pixel don't turn
// into speckle. Its normal is the average of the samples', turned with the body. Parts (legs, doors, turrets) are looked
// up with their own offset, so they can slide or open without new art.
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
//   tint     [r, g, b] multiplies the colours (1 = unchanged: [1, .5, .5] reddens)
//   flash    0..1: mixes the sprite toward white, unlit (a hit flash)
//   palette  [[r, g, b], ...] (bytes) replaces the sprite's palette, entry for entry (a team colour, a poisoned state)
//   emit     a sprite with an emit layer: a multiplier on how strongly it glows (default 1; 0 = the lamp is off: lit like the rest, no light; .5 a flicker)
// markSpriteDyn(spr, x, y, a, { blocksLamps: true }) also stops the light of lamps (the sun is always stopped): a character between a lamp and a wall casts a shadow.
// ---------- animation ----------
// defineAnim(sprites, { fps: 10, loop: true, tags: { run: [0, 5], jump: [6, 7] } }) → anim: sprites is an array (frame 0, 1, 2 ...);
// a tag is [first, last] frame. animFrame(anim, t, tag) → the sprite at t seconds; drawAnim(anim, x, y, a, o) draws it with drawSprite's
// options plus o.tag and o.t (seconds into the animation; default: the simulation clock, so it stops in pause). animFromAsset(asset, o)
// makes one from an art pipeline asset that holds frames (PIPE_ART.hero): o.order lists the frame names, o.tags maps a tag to its
// frame names, [first, last] or a list of names.
function defineAnim(frames, o = {}) { return { frames, fps: o.fps || 10, loop: o.loop !== false, tags: o.tags || {} }; }
function animFrame(anim, t, tag) {
  const n0 = anim.frames.length, tg = tag && anim.tags[tag], a = tg ? tg[0] : 0, b = tg ? tg[1] : n0 - 1, n = b - a + 1;
  let i = Math.floor(Math.max(0, t) * anim.fps); i = anim.loop ? i % n : Math.min(i, n - 1);
  return anim.frames[a + i];
}
function drawAnim(anim, x, y, a, o = {}) { drawSprite(animFrame(anim, o.t ?? clockT, o.tag), x, y, a, o); }
function animFromAsset(asset, o = {}) {
  const names = o.order || Object.keys(asset.frames);
  const frames = names.map(n => { const f = asset.frames[n]; return defineSprite({ w: asset.w, h: asset.h, pal: asset.pal, rows: f.rows, normals: f.normals, emit: f.emit }, { k: asset.k, ox: o.ox, oy: o.oy, glow: o.glow, glowGain: o.glowGain }); });
  const tags = {};
  for (const k in o.tags || {}) { const v = o.tags[k]; tags[k] = Array.isArray(v) && typeof v[0] === 'number' ? v : [names.indexOf(v[0]), names.indexOf(v[v.length - 1])]; }
  return defineAnim(frames, { ...o, tags });
}

// markSpriteDyn(spr, x, y, a, o) → top row; marks the covered cells as dynamic shadow casters.
const SPR_S = 3, SPR_FILL = .45;   // samples across a cell (and per unit of its height); the share that must land on the art
const HUD_ASPECT = FONT_H / FONT_W;   // a HUD cell is twice as tall as wide, unlike the world's square cells
const _sprNoShift = [];
// the normal-map directions (x right, y down, z toward the viewer): 0 facing the viewer, 1..12 tipped 20° and 13..24 tipped
// 42° toward 12 directions, 25..32 tipped 65° toward 8; portal/assets/normalmap-core.mjs builds the same table (a unit test
// checks they agree)
const SPR_NORMALS = (() => {
  const t = [[0, 0, 1]];
  for (const [tilt, n] of [[20, 12], [42, 12], [65, 8]]) for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n, s = Math.sin(tilt * Math.PI / 180);
    t.push([Math.cos(a) * s, Math.sin(a) * s, Math.cos(tilt * Math.PI / 180)]);
  }
  return t;
})();
// how much brighter (> 1) or darker a pixel facing n is than a flat one, under light from (lx, ly, lz) (toward the light)
function sprRelief(nx, ny, nz, lx, ly, lz) {
  const l = Math.hypot(lx, ly, lz) || 1, d = (nx * lx + ny * ly + nz * lz) / l, flat = lz / l;
  return Math.min(1.7, Math.max(.3, Math.max(0, d) / Math.max(.25, flat)));
}

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
  let nrm = null;
  if (data.normals) {
    nrm = new Uint8Array(n).fill(255);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const ch = data.normals[r][c]; if (ch !== '.' && ch !== undefined) nrm[r * w + c] = parseInt(ch, 36); }
  }
  let emit = null;   // the emission layer: 0 where a pixel does not glow, 1..35 where it does
  if (data.emit) {
    emit = new Uint8Array(n); let any = false;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const ch = data.emit[r][c]; if (ch !== '.' && ch !== undefined && idx[r * w + c] !== 255) { emit[r * w + c] = parseInt(ch, 36); any = any || emit[r * w + c] > 0; } }
    if (!any) emit = null;
  }
  const ox = opts.ox ?? w / 2, oy = opts.oy ?? h / 2;
  const outline = Uint8Array.from(pal, p => p[3] ? 0 : 1);   // ink 0: an outline colour
  return { w, h, k: opts.k ?? .25, ox, oy, idx, part, parts, lin, nrm, emit, glow: opts.glow ?? 3, glowGain: opts.glowGain ?? .05, outline,
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
// one cell of a sprite into the world grid; lit by the scene, but never dark: the art already carries its own shading. With
// a normal (nx, ny, nz) it is also brighter where it faces the light there (the sun, the lamps, a little sky from above) and
// darker where it faces away, by up to about a third.
function sprEmit(cx, cy, glyph, r, g, b, lit, nx = 0, ny = 0, nz = 1, e = 0) {
  if (e > 0) { sprGlow(cx, cy, glyph, r, g, b, lit, nx, ny, nz, e); return; }
  if (!lit) { putEmit(cx, cy, glyph, r, g, b); return; }
  lightAtCell(cx, cy, _sprL);
  let f = 1;
  const i = cx - L_OX, j = cy - L_OY;
  if ((nx || ny) && i >= 0 && j >= 0 && i < R.RW && j < R.RH) {
    const k = j * R.RW + i, sun = SUN_ON && LSUN[k] ? (SUN_C[0] + SUN_C[1] + SUN_C[2]) / 3 : 0, amb = (AMB_C[0] + AMB_C[1] + AMB_C[2]) / 3;
    const lamp = Math.hypot(LDX[k], LDY[k]);
    f = .5 + .5 * sprRelief(nx, ny, nz, LDX[k] - SUN_L[0] * sun, LDY[k] - SUN_L[1] * sun - .5 * amb, .35 * (sun + lamp + amb));
  }
  putEmit(cx, cy, glyph, r * f * (.75 + .4 * Math.min(1.3, _sprL[0])), g * f * (.75 + .4 * Math.min(1.3, _sprL[1])), b * f * (.75 + .4 * Math.min(1.3, _sprL[2])));
}
// ---------- glowing pixels (the emit layer) ----------
// A pixel with emission e (0..3.9) is drawn as its own colour, unlit, mixed with the lit colour by min(1, e) (and brighter than the art when e > 1), and gives light: drawSprite
// records where (one pixel in every RES x RES block, so a big screen is a few splats), the scene pass of the NEXT frame pours the record into the light buffers
// (splatLight, like fire: terrain and particles drawn after it are lit, and the next frame's sprites see it through lightAtCell), then the record starts again. One frame behind
// is not visible for anything that moves like a character, and it keeps the terrain pass's cache (04_light.js, terrainKeys) exact: the cache key holds EMIT.hash.
// A record is [cx, cy, r, g, b, radius in base cells], six numbers a splat. The cells of one sprite are added up in blocks of RES x RES cells (a base unit: a big screen is
// a few splats, the light is the same in total), the block's splat standing at the average of its glowing cells, so nothing glows too small to count.
const EMIT = { a: [], b: [], hash: 0 };   // a: this frame's record, b: last frame's (what the scene pass pours in)
const _glow = { mul: 1, rad: 0, gain: 0, step: 1, bx: 0, by: 0, bins: new Map() };   // the glow settings of the sprite being drawn, and its blocks so far
function emitFlush() {   // the sprite just drawn: its blocks become splats
  const G = _glow;
  for (const c of G.bins.values()) EMIT.a.push(Math.round(c.x / c.n), Math.round(c.y / c.n), c.r, c.g, c.b, G.rad);
  G.bins.clear();
}
function emitSwap() {
  const t = EMIT.b; EMIT.b = EMIT.a; EMIT.a = t; EMIT.a.length = 0;
  let h = 2166136261 | 0; for (let i = 0; i < EMIT.b.length; i++) h = mixBits(h, EMIT.b[i]);
  EMIT.hash = EMIT.b.length ? h >>> 0 : 0;
}
function sprGlow(cx, cy, glyph, r, g, b, lit, nx, ny, nz, e) {
  const G = _glow, s = e * G.mul;
  let lr = r, lg = g, lb = b;
  if (lit) {   // the lit colour, shaded as sprEmit shades a pixel (an emit multiplier of 0 is the lamp switched off: an ordinary lit pixel)
    lightAtCell(cx, cy, _sprL);
    let f = 1;
    const i = cx - L_OX, j = cy - L_OY;
    if ((nx || ny) && i >= 0 && j >= 0 && i < R.RW && j < R.RH) {
      const k = j * R.RW + i, sun = SUN_ON && LSUN[k] ? (SUN_C[0] + SUN_C[1] + SUN_C[2]) / 3 : 0, amb = (AMB_C[0] + AMB_C[1] + AMB_C[2]) / 3;
      const lamp = Math.hypot(LDX[k], LDY[k]);
      f = .5 + .5 * sprRelief(nx, ny, nz, LDX[k] - SUN_L[0] * sun, LDY[k] - SUN_L[1] * sun - .5 * amb, .35 * (sun + lamp + amb));
    }
    lr = r * f * (.75 + .4 * Math.min(1.3, _sprL[0])); lg = g * f * (.75 + .4 * Math.min(1.3, _sprL[1])); lb = b * f * (.75 + .4 * Math.min(1.3, _sprL[2]));
  }
  if (s <= 0) { putEmit(cx, cy, glyph, lr, lg, lb); return; }
  const w = Math.min(1, s), k = Math.max(1, s);
  putEmit(cx, cy, glyph, lr * (1 - w) + r * k * w, lg * (1 - w) + g * k * w, lb * (1 - w) + b * k * w);
  if (G.rad > 0) {
    const key = Math.floor((cx - G.bx) / G.step) * 4096 + Math.floor((cy - G.by) / G.step);
    let c = G.bins.get(key); if (!c) G.bins.set(key, c = { x: 0, y: 0, r: 0, g: 0, b: 0, n: 0 });
    c.x += cx; c.y += cy; c.r += r * s * G.gain; c.g += g * s * G.gain; c.b += b * s * G.gain; c.n++;
  }
}
// a sprite with its palette swapped (cached per palette on the sprite)
function spritePalette(spr, pal) {
  const key = JSON.stringify(pal), vs = spr.variants || (spr.variants = new Map());
  let v = vs.get(key);
  if (!v) { v = { ...spr, stamps: undefined, icons: undefined, variants: undefined, lin: pal.map(([r, g, b]) => [r, g, b].map(q => -Math.log(1 - Math.min(.93, q / 255)) / 1.7)) }; vs.set(key, v); }
  return v;
}
// the colour options of drawSprite wrapped around sprEmit
function sprTintEmit(o) {
  const t = o.tint || [1, 1, 1], f = o.flash || 0;
  return (cx, cy, g, r, gg, b, lit, nx, ny, nz, e) => {
    r *= t[0]; gg *= t[1]; b *= t[2];
    if (f > 0) { r += (1.6 - r) * f; gg += (1.6 - gg) * f; b += (1.6 - b) * f; if (f > .6) lit = false; }
    sprEmit(cx, cy, g, r, gg, b, lit, nx, ny, nz, e);
  };
}
function drawSprite(spr, x, y, a, o = {}) {
  if (o.palette) spr = spritePalette(spr, o.palette);
  const em = o.tint || o.flash ? sprTintEmit(o) : sprEmit;
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), fl = o.flip ? -1 : 1, lit = o.light !== false;
  if (x1 < L_OX || y1 < L_OY || x0 >= L_OX + R.RW || y0 >= L_OY + R.RH) return;   // nothing of it on screen
  if (spr.emit) { _glow.mul = o.emit ?? 1; _glow.rad = spr.glow; _glow.step = Math.max(1, Math.round(RES)); _glow.gain = spr.glowGain / (RES * RES); _glow.bx = bx; _glow.by = Math.round(by / ASPECT); }
  if (o.cache && !a && !sh.length) {
    // a still sprite (unrotated, no moving parts) comes out the same wherever it stands, since it is pinned to the character
    // grid: work its cells out once per detail level, then only light them
    const foot = o.foot || 0, row0 = Math.round((by + foot) / ASPECT), key = `${fl}|${foot}|${RES}`;
    const stamps = spr.stamps || (spr.stamps = new Map());
    let st = stamps.get(key);
    if (!st) { st = []; sprCells(spr, bx, by, x0, y0, x1, y1, 0, sh, fl, false, (cx, cy, g, r, gg, b, _, nx, ny, nz, e) => st.push(cx - bx, cy - row0, g, r, gg, b, nx, ny, nz, e)); stamps.set(key, st); }
    for (let k = 0; k < st.length; k += 10) em(bx + st[k], row0 + st[k + 1], st[k + 2], st[k + 3], st[k + 4], st[k + 5], lit, st[k + 6], st[k + 7], st[k + 8], st[k + 9]);
    if (spr.emit) emitFlush();
    return;
  }
  sprCells(spr, bx, by, x0, y0, x1, y1, a, sh, fl, lit, em);
  if (spr.emit) emitFlush();
}
// asp: the cell's height in units (the world's ASPECT, or HUD_ASPECT for a picture on the HUD)
function sprCells(spr, bx, by, x0, y0, x1, y1, a, sh, fl, lit, emit, asp = ASPECT) {
  const c = Math.cos(a), s = Math.sin(a), hist = spr.hist, np = hist.length, sy = Math.round(SPR_S * asp), need = SPR_FILL * SPR_S * sy, nrm = spr.nrm, emi = spr.emit;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    let occ = 0, nx = 0, ny = 0, nz = 0, es = 0; hist.fill(0);
    for (let j = 0; j < sy; j++) for (let i = 0; i < SPR_S; i++) {
      const wx = cx + (i + .5) / SPR_S - bx, wy = (cy + (j + .5) / sy) * asp - by;
      const px = spritePixel(spr, (wx * c + wy * s) * fl, -wx * s + wy * c, sh);
      if (px < 0) continue;
      occ++; hist[spr.idx[px]]++;
      if (nrm && nrm[px] !== 255) { const v = SPR_NORMALS[nrm[px]]; nx += v[0]; ny += v[1]; nz += v[2]; }
      if (emi) es += emi[px];
    }
    if (occ < need) continue;
    let dom = -1, line = -1;
    for (let p = 0; p < np; p++) {
      if (!hist[p]) continue;
      if (spr.outline[p]) { if (line < 0 || hist[p] > hist[line]) line = p; }
      else if (dom < 0 || hist[p] > hist[dom]) dom = p;
    }
    if (line >= 0 && (dom < 0 || occ < SPR_S * sy)) dom = line;   // the silhouette's edge, or nothing but outline
    const q = spr.lin[dom], e = es ? es / occ / 9 : 0;   // e: how much of the cell glows (the average of its samples' emission digits, 9 = all of it)
    if (nx || ny) {   // the average normal, from the sprite's frame (mirrored, turned) into the world's
      const l = Math.hypot(nx, ny, nz), fx = nx * fl;
      if (e > 0) emit(cx, cy, SOLID, q[0], q[1], q[2], lit, (c * fx - s * ny) / l, (s * fx + c * ny) / l, nz / l, e);
      else emit(cx, cy, SOLID, q[0], q[1], q[2], lit, (c * fx - s * ny) / l, (s * fx + c * ny) / l, nz / l);
    } else if (e > 0) emit(cx, cy, SOLID, q[0], q[1], q[2], lit, 0, 0, 1, e);
    else emit(cx, cy, SOLID, q[0], q[1], q[2], lit);
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
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), c = Math.cos(a), s = Math.sin(a), fl = o.flip ? -1 : 1; let top = 1e9;   // o.blocksLamps: the cells also stop the light of lamps
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    const wx = cx + .5 - bx, wy = (cy + .5) * ASPECT - by;
    if (spritePixel(spr, (wx * c + wy * s) * fl, -wx * s + wy * c, sh) < 0) continue;
    markDynCell(cy * W + cx, o.blocksLamps); if (o.blocksLamps) markBlocker(cx, cy); if (cy < top) top = cy;
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
