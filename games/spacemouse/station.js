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
  const sec = { n, def, tw, th, mw, mh, res: S, lamps: [], crumbs: [], checkpoints: [], cats: [], props: [], start: null, cableRuns: [] };
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
        case '=': m = v < .3 ? DECK : v < .68 ? DECK_RUST : hazard(cx, cy); break;
        case '_': m = v < .5 ? (v < .25 || th < 3 ? DECK : hazard(cx, cy)) : EMPTY; break;
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
  // window frames: the hull and the wall right round a window are a light steel surround
  const tileOf = (cx, cy) => tileAt(map, Math.floor(cx / tw), Math.floor(cy / th));
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const i = cy * W + cx; if (tileOf(cx, cy) === ':') continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = tileOf(cx + dx, cy + dy) === ':';
    if (!near) continue;
    if (cells[i] === HULL) cells[i] = FRAME; else if (backCells[i] && cells[i] === EMPTY) backCells[i] = WALL_FRAME;
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
    else if (PROP_ART[c]) { const [x, y] = at(tx, ty, .5, PROP_ART[c].place === 'floor' ? 1 : .5); sec.props.push({ ch: c, x, y }); }
    else if (c === 'L' || c === 'l' || c === 'A') {
      const [x, y] = at(tx, ty, .5, 0), kind = c === 'L' ? 'fluorescent' : c === 'l' ? 'dying' : 'alarm';
      sec.lamps.push({ x, y: y + .6 * S, kind, seed: seed++, c: c === 'A' ? [1, .22, .12] : c === 'l' ? [1, .7, .38] : [1, .76, .44] });   // warm amber strips
    }
  }
  if (!sec.start) sec.start = [3 * tw, (mh - 2) * th * ASPECT];
  // let loose things settle before the mouse arrives
  awake.fill(1);
  for (let k = 0; k < 40 * S; k++) { simGranular(); frameNo++; }
  P.n = 0;
  updateSkyline();
  findGantries(sec);
  sec.decor = buildDecor(sec);
  SEC = sec;
  return sec;
}

// a deck's face: orange and black hazard stripes, leaning the same way at every detail
const hazard = (cx, cy) => Math.floor((cx + cy * ASPECT) / (1.6 * RES)) & 1 ? HAZ_Y : HAZ_K;

// what the wall behind looks like at a point (base units): panels with seams every 12 units, a pipe run, vent grilles,
// a hazard stripe along the bottom of each panel row, and moss growing over all of it in patches
function backPattern(bx, by, cx, cy) {
  const S = RES;
  if (fbm2(bx / 11, by / 7, 61, 3) > .6) return MOSS_WALL;
  if (cx % Math.round(12 * S) === 0 || cy % Math.round(6 * S) === 0) return SEAM;
  const px = Math.floor(bx / 12), py = Math.floor(by / 12), fx = bx - px * 12, fy = by - py * 12;
  const kind = hash2(px, py, 77);
  if (kind < .16 && fy > 9.6 && fy < 10.8) return PIPE;                                  // a pipe along this panel
  if (kind > .84 && fx > 3 && fx < 9 && fy > 3 && fy < 7) return fy - 3 < 4 && (Math.floor(fy * 2) & 1) ? GRILLE : PANEL;   // a vent
  if (kind > .5 && kind < .58 && fy > 10.6) return ((bx + by) % 3) < 1.5 ? STRIPE : PANEL;   // hazard stripes
  return PANEL;
}

// ---------- the sky outside the windows: stars, a big blue planet below, a small cheese moon ----------
// As in the art sheet's windows: the station orbits a blue world with a bright rim of atmosphere; and there is cheese up there.
const _sky = { px: 0, py: 0, pr: 1, mx: 0, my: 0, mr: 1, t: 0 }, SKY_RAMP = Array.from(' .:-=+*oO@', c => c.charCodeAt(0));
function moonBegin(ox, oy, time) {
  _sky.pr = clamp(R.RW * .26, 24 * RES, 90 * RES);
  _sky.px = W * .55 * SKY_PAR + R.cols * .64 - ox; _sky.py = H * .3 * SKY_PAR + R.rows * .5 - oy;
  _sky.mr = clamp(R.RW * .028, 3 * RES, 7 * RES);
  _sky.mx = W * .3 * SKY_PAR + R.cols * .22 - ox; _sky.my = H * .2 * SKY_PAR + R.rows * .16 - oy;
  _sky.t = time;
}
function moonCell(i, j, out) {
  // the planet: ocean and cloud bands turning slowly, lit from the upper left, a glowing rim
  let ex = (i + .5 - _sky.px) / _sky.pr, ey = (j + .5 - _sky.py) / (_sky.pr / 2), e2 = ex * ex + ey * ey;
  if (e2 < 1.06) {
    if (e2 >= 1) { const g = (1.06 - e2) / .06 * .5; out[0] = .15 * g; out[1] = .45 * g; out[2] = 1.1 * g; return 46; }   // the haze beyond the limb
    const nz = Math.sqrt(1 - e2), lit = Math.max(0, ex * -.55 + ey * -.6 + nz * .58);
    if (lit <= .03) return -1;
    const lon = Math.atan2(ex, nz) * 1.6 + _sky.t * .01, cloud = fbm2(lon * 3, ey * 7, 17, 3) > .56, land = fbm2(lon * 2.2 + 4, ey * 3, 23, 3) > .6;
    const c = cloud ? [.9, .95, 1] : land ? [.2, .42, .3] : [.1, .28, .85], rim = e2 > .82 ? (e2 - .82) * 2.2 : 0;
    out[0] = c[0] * lit * 1.2 + .1 * rim; out[1] = c[1] * lit * 1.2 + .4 * rim; out[2] = c[2] * lit * 1.2 + .9 * rim;
    return SKY_RAMP[clamp(((lit + rim * .6) * 10) | 0, 1, 9)];
  }
  // the cheese moon: small, far, full of holes
  ex = (i + .5 - _sky.mx) / _sky.mr; ey = (j + .5 - _sky.my) / (_sky.mr / 2); e2 = ex * ex + ey * ey;
  if (e2 >= 1) return 0;
  const nz = Math.sqrt(1 - e2), lit = Math.max(0, ex * -.6 + ey * -.45 + nz * .66);
  if (lit <= .04) return -1;
  const hole = vnoise2(Math.atan2(ex, nz) * 5 + 9, ey * 5, 5) > .64, q = lit * (hole ? .45 : 1.1);
  out[0] = 1.05 * q; out[1] = .8 * q; out[2] = .28 * q;
  return hole ? 111 : SKY_RAMP[clamp((q * 9.5) | 0, 1, 9)];
}
