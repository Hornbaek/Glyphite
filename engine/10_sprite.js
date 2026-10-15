// ===================== ENGINE · sprites: pixel art drawn as ASCII =====================
// A sprite is palette-indexed pixel art, in the format tools/sprite2ascii.py writes:
//   { w, h, pal: [[r, g, b, ink, glyph], ...], rows: ['..01..', ...] }
// '.' is empty; any other character indexes pal in base 36. ink 0 marks an outline colour, drawn
// as the dark gap between characters; glyph is the dense character for solid areas of that colour.
//
// Every character cell the sprite covers takes 3 x 6 samples of it in the object's own frame, so
// the drawing turns with the body. Where the cell is solidly painted it gets the palette's dense
// glyph in the average paint colour, lit by the scene; along the silhouette, the samples that land
// on paint pick the symbol whose shape matches them best. Outline pixels inside the body count as
// paint ("panel lines") and simply darken their cell. Parts (legs, doors, turrets) are looked up
// with their own offset, so they can slide or open without new art.
//
// defineSprite(data, opts) → sprite
//   k        base units per sprite pixel (its size in the world; RES is applied when drawing)
//   ox, oy   origin pixel, the body's centre of mass (default: the middle)
//   part(c, r)        → 0 for the main body, 1..n for parts drawn with their own offset
//   paint(c, r, part) → true to make a pixel count as paint (e.g. footpad soles)
// drawSprite(spr, x, y, a, o)  draw at (x, y) world units, rotated by a radians. Options:
//   shift  [dx1, dy1, dx2, dy2, ...]: each part's offset in units, in the sprite's frame
//   foot   units below the origin that snap to a row boundary (feet stand right on the ground)
//   light  false: fixed colours; default: lit by the scene, but never dark
// markSpriteDyn(spr, x, y, a, o) → top row; marks the covered cells as dynamic shadow casters.
const SPR_SX = 3, SPR_SY = 6, SPR_N = SPR_SX * SPR_SY;
const SPR_EDGE = ".,'`-_=:;|/\\()[]<>^v+~\"!*", SPR_DENSE = 10;   // edge glyphs; from this many painted samples a cell is solid
let SPR_SHAPES = null;
const _sprNoShift = [];

function defineSprite(data, opts = {}) {
  const { w, h, pal, rows } = data, n = w * h;
  const idx = new Uint8Array(n).fill(255), part = new Uint8Array(n), paint = new Uint8Array(n);
  let parts = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c]; if (ch === '.' || ch === undefined) continue;
    idx[r * w + c] = parseInt(ch, 36);
    const p = opts.part ? opts.part(c, r) | 0 : 0;
    part[r * w + c] = p; if (p > parts) parts = p;
  }
  const solid = (c, r, p) => c >= 0 && r >= 0 && c < w && r < h && idx[r * w + c] !== 255 && part[r * w + c] === p;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const k = r * w + c, i = idx[k]; if (i === 255) continue;
    const p = part[k];
    paint[k] = pal[i][3] || (opts.paint && opts.paint(c, r, p)) || (solid(c - 1, r, p) && solid(c + 1, r, p) && solid(c, r - 1, p) && solid(c, r + 1, p)) ? 1 : 0;
  }
  // palette in the renderer's light units, so that after tone mapping it shows the sprite's own colours
  const lin = pal.map(([r, g, b]) => [r, g, b].map(v => -Math.log(1 - Math.min(.93, v / 255)) / 1.7));
  const inkPal = [], outlinePal = [];
  pal.forEach((p, i) => (p[3] ? inkPal : outlinePal).push(i));
  const dense = pal.map(p => (p[4] || '#').charCodeAt(0));
  const ox = opts.ox ?? w / 2, oy = opts.oy ?? h / 2;
  return { w, h, k: opts.k ?? .25, ox, oy, idx, part, paint, parts, lin, inkPal, outlinePal, dense,
    reach: Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)), V: new Uint8Array(SPR_N), hist: new Uint16Array(pal.length) };
}

// the shape of each candidate edge glyph as 3 x 6 coverage, from the game font
function spriteShapes() {
  const bw = 6, cw = SPR_SX * bw, chh = SPR_SY * bw, cv = makeCanvas(cw, chh), x = cv.getContext('2d', { willReadFrequently: true });
  x.font = `700 ${Math.round(chh * .8)}px ${R.fontFamily}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  return Array.from(SPR_EDGE, ch => {
    x.clearRect(0, 0, cw, chh); x.fillText(ch, cw / 2, chh * .54);
    const d = x.getImageData(0, 0, cw, chh).data, m = new Float32Array(SPR_N); let mx = 0;
    for (let j = 0; j < SPR_SY; j++) for (let i = 0; i < SPR_SX; i++) {
      let s = 0; for (let y = j * bw; y < (j + 1) * bw; y++) for (let q = i * bw; q < (i + 1) * bw; q++) s += d[(y * cw + q) * 4 + 3];
      m[j * SPR_SX + i] = s / (bw * bw * 255); mx = Math.max(mx, m[j * SPR_SX + i]);
    }
    if (mx > 0) for (let k = 0; k < SPR_N; k++) m[k] = Math.min(1, m[k] / mx);
    return { code: ch.charCodeAt(0), m };
  });
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
function drawSprite(spr, x, y, a, o = {}) {
  if (!SPR_SHAPES) SPR_SHAPES = spriteShapes();
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), c = Math.cos(a), s = Math.sin(a);
  const V = spr.V, hist = spr.hist, shapes = SPR_SHAPES, inkPal = spr.inkPal, outPal = spr.outlinePal, lit = o.light !== false;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    let occ = 0, ink = 0, r = 0, g = 0, bl = 0; hist.fill(0);
    for (let j = 0; j < SPR_SY; j++) for (let i = 0; i < SPR_SX; i++) {
      const k = j * SPR_SX + i, wx = cx + (i + .5) / SPR_SX - bx, wy = (cy + (j + .5) / SPR_SY) * ASPECT - by;
      const px = spritePixel(spr, wx * c + wy * s, -wx * s + wy * c, sh);
      V[k] = 0; if (px < 0) continue;
      occ++; if (!spr.paint[px]) continue;
      const p = spr.idx[px]; V[k] = 1; ink++; hist[p]++; const q = spr.lin[p]; r += q[0]; g += q[1]; bl += q[2];
    }
    if (occ < 4) continue;
    if (ink < 3) { putEmit(cx, cy, 32, 0, 0, 0); continue; }   // outline: a dark gap that still hides what is behind
    // main paint of the cell; a panel line (interior outline) only wins when it fills most of the cell
    let dom = inkPal[0] ?? 0, lines = 0;
    for (const p of inkPal) if (hist[p] > hist[dom]) dom = p;
    for (const p of outPal) lines += hist[p];
    if (lines > ink * .6) {
      if (ink >= SPR_DENSE) { putEmit(cx, cy, 32, 0, 0, 0); continue; }
      dom = outPal[0]; for (const p of outPal) if (hist[p] > hist[dom]) dom = p;
    }
    // colour leans on the cell's main paint, so thin bright parts (rails, jets) stay crisp
    const q = spr.lin[dom]; r = r / ink * .35 + q[0] * .65; g = g / ink * .35 + q[1] * .65; bl = bl / ink * .35 + q[2] * .65;
    let glyph = 0;
    if (ink < SPR_DENSE) {   // edge or detail: best-fitting shape
      let best = 1e9;
      for (const sp of shapes) { let d = 0; const m = sp.m; for (let k = 0; k < SPR_N; k++) { const e = V[k] - m[k]; d += e * e; } if (d < best) { best = d; glyph = sp.code; } }
    } else glyph = spr.dense[dom];
    if (lit) {   // lit by the scene, but never dark: the art already carries its own shading
      lightAtCell(cx, cy, _sprL);
      putEmit(cx, cy, glyph, r * (.75 + .4 * Math.min(1.3, _sprL[0])), g * (.75 + .4 * Math.min(1.3, _sprL[1])), bl * (.75 + .4 * Math.min(1.3, _sprL[2])));
    } else putEmit(cx, cy, glyph, r, g, bl);
  }
}

// cells the sprite covers, for shadows and lighting
function markSpriteDyn(spr, x, y, a, o = {}) {
  const sh = o.shift || _sprNoShift, [bx, by, x0, y0, x1, y1] = spriteBox(spr, x, y, o), c = Math.cos(a), s = Math.sin(a); let top = 1e9;
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    const wx = cx + .5 - bx, wy = (cy + .5) * ASPECT - by;
    if (spritePixel(spr, wx * c + wy * s, -wx * s + wy * c, sh) < 0) continue;
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
