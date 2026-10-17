// ===================== ENGINE · isometric ground: tiles, picking, back-to-front drawing =====================
// An isometric game lays its ground out as a grid of tiles (i along the edge running down to the right, j along the edge
// running down to the left), drawn as 2:1 diamonds. A tile is ISO.tw units wide and ISO.th = tw / 2 tall; the default,
// 8 base units, is 8·RES cells by 2·RES rows: whole cells and rows at every detail level, so diamonds keep their shape.
// The ground lives in the back wall (backCells): never solid, lit by the scene (sun, ambient, lamps) and textured by each
// material's glyph ramp. The world grid itself stays empty, so every light reaches the ground and nothing falls. Things
// standing on the ground are sprites, drawn back to front (isoDraw) so nearer things cover farther ones.
//
//   isoInit(ni, nj, { tile: 8, top: 0, bottom: 0 })   make the world for ni × nj tiles (top / bottom: room in base units
//                                       above and below the diamond for tall sprites and boats)
//   isoToWorld(u, v, out)               a ground point (tile i spans u = i .. i + 1) → world [x cells, y units]
//   worldToIso(x, y, out)               a world point → ground coordinates [u, v] (floor them for the tile)
//   isoPick(aim)                        the tile [i, j] under a canvas point (Input.aim, mouseAim()), or null
//   isoGround(fn)                       paint every tile: fn(i, j) → a material id (0 = nothing: the sky shows)
//   isoSetTile(i, j, m)                 repaint one tile
//   isoOutline(i, j, a, b, rgb)         trace an a × b footprint's diamond with / \ glyphs (a cursor, a selection)
//   isoDraw(items)                      items [{ u, v, draw() }]: sorted by depth (u + v, then u) and drawn in that order;
//                                       give a footprint its front corner (largest u + v) so it covers what stands behind it
const ISO = { ni: 0, nj: 0, tw: 0, th: 0, ox: 0, oy: 0 };

function isoInit(ni, nj, o = {}) {
  const tw = (o.tile || 8) * RES, th = tw / 2, top = (o.top || 0) * RES, bottom = (o.bottom || 0) * RES;
  Object.assign(ISO, { ni, nj, tw, th, ox: nj * tw / 2, oy: top });
  worldInit(Math.ceil((ni + nj) * tw / 2), Math.ceil((top + (ni + nj) * th / 2 + bottom) / ASPECT));
  setBackdrop({ dim: 1, shadow: 0 });   // the back wall is the ground here, not a wall behind rooms
}
function isoToWorld(u, v, out = [0, 0]) { out[0] = ISO.ox + (u - v) * ISO.tw / 2; out[1] = ISO.oy + (u + v) * ISO.th / 2; return out; }
function worldToIso(x, y, out = [0, 0]) {
  const a = (x - ISO.ox) / (ISO.tw / 2), b = (y - ISO.oy) / (ISO.th / 2);
  out[0] = (a + b) / 2; out[1] = (b - a) / 2; return out;
}
const _isoP = [0, 0];
function isoPick(aim) {
  if (!aim) return null;
  worldToIso(cam.x + aim[0] * R.cols, cam.y + aim[1] * R.rows * ASPECT, _isoP);
  const i = Math.floor(_isoP[0]), j = Math.floor(_isoP[1]);
  return i >= 0 && j >= 0 && i < ISO.ni && j < ISO.nj ? [i, j] : null;
}
// the cells whose centre lies in tile (i, j), or in every tile when i is undefined
function isoCells(fn, i, j) {
  let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
  if (i !== undefined) {
    const top = isoToWorld(i, j, [0, 0])[1];
    x0 = Math.floor(ISO.ox + (i - j - 1) * ISO.tw / 2); x1 = Math.ceil(ISO.ox + (i - j + 1) * ISO.tw / 2);
    y0 = Math.floor(top / ASPECT); y1 = Math.ceil((top + ISO.th) / ASPECT);
  }
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    worldToIso(cx + .5, (cy + .5) * ASPECT, _isoP);
    const u = Math.floor(_isoP[0]), v = Math.floor(_isoP[1]);
    if (u >= 0 && v >= 0 && u < ISO.ni && v < ISO.nj && (i === undefined || (u === i && v === j))) fn(cx, cy, u, v);
  }
}
function isoGround(fn) { backCells.fill(0); isoCells((cx, cy, u, v) => { backCells[cy * W + cx] = fn(u, v); }); }
function isoSetTile(i, j, m) { isoCells((cx, cy) => { backCells[cy * W + cx] = m; }, i, j); }
function isoOutline(i, j, a, b, rgb) {
  // walk the four edges in small steps; each step lights the cell it lands in with the edge's slope glyph
  const p = [0, 0], edge = (u0, v0, u1, v1, code) => {
    const n = Math.ceil(Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0)) * ISO.tw);
    for (let s = 0; s <= n; s++) {
      isoToWorld(u0 + (u1 - u0) * s / n, v0 + (v1 - v0) * s / n, p);
      putEmit(Math.floor(p[0]), Math.floor(p[1] / ASPECT), code, rgb[0], rgb[1], rgb[2]);
    }
  };
  edge(i, j, i + a, j, 92); edge(i + a, j, i + a, j + b, 47); edge(i, j + b, i + a, j + b, 92); edge(i, j, i, j + b, 47);
}
function isoDraw(items) {
  items.sort((p, q) => (p.u + p.v) - (q.u + q.v) || p.u - q.u);
  for (const it of items) it.draw();
}
