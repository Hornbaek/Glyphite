// ===================== GAME · building a sector from its map =====================
// Every map character is a TILE x TILE base-unit square; at detail RES it is TILE*RES cells wide and TILE*RES/ASPECT rows
// tall (whole numbers at every detail level), so the same map builds the same station at any detail. Shapes inside a tile
// (thin decks, sagging cables, holes in the cheese) are worked out in base units, so they look alike at every detail too.
const TILE = 4;
let SEC = null;   // the sector being played (see buildSector)

function tileAt(map, tx, ty) { return ty >= 0 && ty < map.length && tx >= 0 && tx < map[0].length ? map[ty][tx] : '#'; }

// Swiss cheese: round holes on a jittered 3-unit grid (base units), the same at every detail
function cheeseHole(bx, by) {
  const gx = Math.floor(bx / 3), gy = Math.floor(by / 3);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = hash2(gx + i, gy + j, 41); if (h > .45) continue;
    const hx = (gx + i + .2 + .6 * hash2(gx + i, gy + j, 42)) * 3, hy = (gy + j + .2 + .6 * hash2(gx + i, gy + j, 43)) * 3, r = .55 + .8 * hash2(gx + i, gy + j, 44);
    if ((bx - hx) ** 2 + (by - hy) ** 2 < r * r) return true;
  }
  return false;
}

// a sign's letters as a bitmap, rasterised once from the page font (bold, 9 px)
function stencilBitmap(text) {
  const fs = 9, cv = makeCanvas(text.length * fs, fs + 4), x = cv.getContext('2d', { willReadFrequently: true });
  x.font = `800 ${fs}px "JetBrains Mono", monospace`; x.textBaseline = 'top'; x.fillStyle = '#fff';
  const w = Math.ceil(x.measureText(text).width) + 1; x.fillText(text, 0, 1);
  const d = x.getImageData(0, 0, w, fs + 4).data, rows = [];
  for (let j = 0; j < fs + 4; j++) { let r = ''; for (let i = 0; i < w; i++) r += d[(j * w + i) * 4 + 3] > 110 ? '#' : '.'; rows.push(r); }
  while (rows.length && !rows[rows.length - 1].includes('#')) rows.pop();
  while (rows.length && !rows[0].includes('#')) rows.shift();
  return rows;
}

function buildSector(n) {
  const def = SECTORS[n - 1], map = def.map, S = RES;
  const tw = Math.round(TILE * S), th = Math.round(TILE * S / ASPECT), mw = map[0].length, mh = map.length;
  worldInit(mw * tw, mh * th);
  if (def.sun) setSun(def.sun, { kelvin: 5772 }); else setSun(null);   // a sector with a sun is lit outside, and through its windows
  setAmbient([.05 * TUNE.stationLight, .056 * TUNE.stationLight, .075 * TUNE.stationLight]);
  const sec = { n, def, tw, th, mw, mh, res: S, lamps: [], crumbs: [], checkpoints: [], cats: [], start: null, cableRuns: [] };
  // runs of cable along a row ([row, first, last] tile): each run sags between its ends
  for (let ty = 0; ty < mh; ty++) for (let tx = 0; tx < mw; tx++) {
    if (map[ty][tx] !== '~' || map[ty][tx - 1] === '~') continue;
    let e = tx; while (map[ty][e + 1] === '~') e++;
    sec.cableRuns.push([ty, tx, e]);
  }
  for (let cy = 0; cy < H; cy++) {
    const ty = Math.floor(cy / th), v = (cy - ty * th + .5) / th, by = (cy + .5) * ASPECT / S;
    for (let cx = 0; cx < W; cx++) {
      const tx = Math.floor(cx / tw), u = (cx - tx * tw + .5) / tw, bx = (cx + .5) / S, c = map[ty][tx], i = cy * W + cx;
      let m = EMPTY;
      switch (c) {
        case '#': m = HULL; break;
        case '=': m = DECK; break;
        case '_': m = v < .5 ? DECK : EMPTY; break;
        case '-': m = v < .34 ? GIRDER : EMPTY; break;
        case 'r': m = v < .5 ? RUST : EMPTY; break;
        case 'B': m = RUST; break;
        case 'C': m = cheeseHole(bx, by) ? EMPTY : CHEESE; break;
        case 'G': m = cheeseHole(bx, by) ? EMPTY : GREAT; break;
        case 'x': m = u < 1 / tw || u > 1 - 1 / tw || v < 1 / th || v > 1 - 1 / th ? CRATE_EDGE : CRATE; break;
        case 'w': m = WEAK; break;
        case 's': m = PEAS; break;
        case '^': m = v > 1 - (.35 + .3 * Math.abs(Math.sin(bx * 1.7))) ? SHARDS : EMPTY; break;
        case '~': {   // a cable lying on the floor, sagging into the middle of its run
          const run = sec.cableRuns.find(r => r[0] === ty && tx >= r[1] && tx <= r[2]);
          const t = (cx + .5 - run[1] * tw) / ((run[2] - run[1] + 1) * tw), vc = .45 + .4 * Math.sin(Math.PI * t);
          m = Math.abs(v - vc) * th < .5 ? CABLE : EMPTY; break;
        }
      }
      cells[i] = m;
      // the back wall behind everything inside (so whatever gets eaten or blown away shows a wall, not the stars)
      if (c !== ':' && c !== ' ') backCells[i] = backPattern(bx, by, cx, cy);
    }
  }
  // signs in glow-in-the-dark paint on the wall (drawn by the game, so they can be read in the dark)
  sec.signCells = [];
  for (const [stx, sty, text] of def.signs || []) {
    const bm = stencilBitmap(text), px = 1.05;   // base units per letter pixel
    const x0 = stx * TILE, y0 = sty * TILE;
    for (let cy = Math.floor(y0 * S / ASPECT); cy < Math.ceil((y0 + bm.length * px) * S / ASPECT); cy++)
      for (let cx = Math.floor(x0 * S); cx < Math.ceil((x0 + bm[0].length * px) * S); cx++) {
        const i = Math.floor(((cx + .5) / S - x0) / px), j = Math.floor(((cy + .5) * ASPECT / S - y0) / px);
        if (bm[j] && bm[j][i] === '#' && getBack(cx, cy)) sec.signCells.push(cy * W + cx);
      }
  }
  // objects
  const at = (tx, ty, dx = .5, dy = 1) => [(tx + dx) * tw, (ty + dy) * th * ASPECT];   // a point in the tile (default: middle of its floor)
  let seed = 1;
  for (let ty = 0; ty < mh; ty++) for (let tx = 0; tx < mw; tx++) {
    const c = map[ty][tx];
    if (c === 'P') sec.start = at(tx, ty);
    else if (c === 'c') { const [x, y] = at(tx, ty, .5, .55); sec.crumbs.push({ x, y, got: false, ph: hash2(tx, ty, 3) * 6.28 }); }
    else if (c === 'S') { const [x, y] = at(tx, ty); sec.checkpoints.push({ x, y, on: false }); }
    else if (c === 'K') { const [x, y] = at(tx, ty); sec.cats.push({ x, y }); }
    else if (c === 'L' || c === 'l' || c === 'A') {
      const [x, y] = at(tx, ty, .5, 0), kind = c === 'L' ? 'fluorescent' : c === 'l' ? 'dying' : 'alarm';
      sec.lamps.push({ x, y: y + .6 * S, kind, seed: seed++, c: c === 'A' ? [1, .22, .12] : c === 'l' ? [.75, .9, 1] : [.82, .92, 1] });
    }
  }
  if (!sec.start) sec.start = [3 * tw, (mh - 2) * th * ASPECT];
  // let loose things settle before the mouse arrives
  awake.fill(1);
  for (let k = 0; k < 40 * S; k++) { simGranular(); frameNo++; }
  P.n = 0;
  updateSkyline();
  findGantries(sec);
  SEC = sec;
  return sec;
}

// what the wall behind looks like at a point (base units): panels with seams every 12 units, a pipe run, vent grilles,
// a hazard stripe along the bottom of each panel row
function backPattern(bx, by, cx, cy) {
  const S = RES;
  if (cx % Math.round(12 * S) === 0 || cy % Math.round(6 * S) === 0) return SEAM;
  const px = Math.floor(bx / 12), py = Math.floor(by / 12), fx = bx - px * 12, fy = by - py * 12;
  const kind = hash2(px, py, 77);
  if (kind < .16 && fy > 9.6 && fy < 10.8) return PIPE;                                  // a pipe along this panel
  if (kind > .84 && fx > 3 && fx < 9 && fy > 3 && fy < 7) return fy - 3 < 4 && (Math.floor(fy * 2) & 1) ? GRILLE : PANEL;   // a vent
  if (kind > .5 && kind < .58 && fy > 10.6) return ((bx + by) % 3) < 1.5 ? STRIPE : PANEL;   // hazard stripes
  return PANEL;
}

// ---------- the sky outside the windows: stars and the cheese moon ----------
const _moon = { cx: 0, cy: 0, rx: 1, ry: 1 }, MOON_RAMP = Array.from(' .:-=+oO@', c => c.charCodeAt(0));
function moonBegin(ox, oy) {
  _moon.rx = clamp(R.RW * .07, 6 * RES, 16 * RES); _moon.ry = _moon.rx / 2;
  _moon.cx = W * .62 * SKY_PAR + R.cols * .55 - ox; _moon.cy = H * .2 * SKY_PAR + R.rows * .3 - oy;
}
function moonCell(i, j, out) {
  const ex = (i + .5 - _moon.cx) / _moon.rx, ey = (j + .5 - _moon.cy) / _moon.ry, e2 = ex * ex + ey * ey;
  if (e2 >= 1) return 0;
  const nz = Math.sqrt(1 - e2), lit = Math.max(0, ex * -.6 + ey * -.45 + nz * .66);
  if (lit <= .04) return -1;
  // craters: it is a cheese moon, so they are holes
  const lon = Math.atan2(ex, nz) * 2.2, lat = ey * 2.2, hole = vnoise2(lon * 2.4 + 9, lat * 2.4, 5) > .64;
  const q = lit * (hole ? .45 : 1.1);
  out[0] = 1.05 * q; out[1] = .8 * q; out[2] = .28 * q;
  return hole ? 111 : MOON_RAMP[clamp((q * 9.5) | 0, 1, 8)];
}
