// ===================== GAME · the lander, drawn from its pixel-art sprite =====================
// Every character cell the lander covers takes 3 x 6 samples of the sprite (LM_ROWS) in the lander's
// own frame, so the drawing turns with the body. Where the cell is solidly painted it gets a dense glyph
// for its material (hull #, foil %, window @) in the average paint colour, lit by the scene; along the
// silhouette, the samples that land on paint pick the symbol whose shape matches them best. The black
// outline around the silhouette counts as "something is here" but not as paint, so it reads as the dark
// gap between characters; outline pixels inside the body are paint, and simply darken their cell. The
// two legs are separate parts of the sprite: each one slides up its strut as its damper compresses.
const LM_K = .28, LM_OX = 24, LM_OY = 28, LM_W = 48, LM_H = 50;   // base units per sprite pixel; origin = centre of mass
const LM_SX = 3, LM_SY = 6, LM_N = LM_SX * LM_SY;
const LM_EDGE = ".,'`-_=:;|/\\()[]<>^v+~\"!*", LM_DENSE = 10;   // edge glyphs; from this many painted samples a cell is solid
let LM = null;

function lmBuild() {
  const n = LM_W * LM_H, idx = new Uint8Array(n).fill(255), part = new Uint8Array(n), paint = new Uint8Array(n);
  for (let r = 0; r < LM_H; r++) for (let c = 0; c < LM_W; c++) {
    const ch = LM_ROWS[r][c]; if (ch === '.') continue;
    idx[r * LM_W + c] = parseInt(ch, 36);
    // legs: the struts and pads below the knuckles (0 body, 1 left leg, 2 right leg)
    part[r * LM_W + c] = r >= 36 && c <= (r === 36 ? 9 : 12) ? 1 : r >= 36 && c >= (r === 36 ? 38 : 35) ? 2 : 0;
  }
  const solid = (c, r, p) => c >= 0 && r >= 0 && c < LM_W && r < LM_H && idx[r * LM_W + c] !== 255 && part[r * LM_W + c] === p;
  for (let r = 0; r < LM_H; r++) for (let c = 0; c < LM_W; c++) {
    const k = r * LM_W + c, i = idx[k]; if (i === 255) continue;
    const p = part[k];
    // the soles of the footpads count as paint too, so the pads sit right on the ground
    paint[k] = LM_PAL[i][3] || (p && r >= LM_H - 2) || (solid(c - 1, r, p) && solid(c + 1, r, p) && solid(c, r - 1, p) && solid(c, r + 1, p)) ? 1 : 0;
  }
  // palette in the renderer's light units, so that after tone mapping it shows the sprite's own colours
  const lin = LM_PAL.map(([r, g, b]) => [r, g, b].map(v => -Math.log(1 - Math.min(.93, v / 255)) / 1.7));
  LM = { idx, part, paint, lin, shapes: null, V: new Uint8Array(LM_N), hist: new Uint16Array(LM_PAL.length) };
}
// the shape of each candidate glyph as 3 x 6 coverage, from the game font
function lmShapes() {
  const bw = 6, cw = LM_SX * bw, chh = LM_SY * bw, cv = makeCanvas(cw, chh), x = cv.getContext('2d', { willReadFrequently: true });
  x.font = `700 ${Math.round(chh * .8)}px ${R.fontFamily}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  return Array.from(LM_EDGE, ch => {
    x.clearRect(0, 0, cw, chh); x.fillText(ch, cw / 2, chh * .54);
    const d = x.getImageData(0, 0, cw, chh).data, m = new Float32Array(LM_N); let mx = 0;
    for (let j = 0; j < LM_SY; j++) for (let i = 0; i < LM_SX; i++) {
      let s = 0; for (let y = j * bw; y < (j + 1) * bw; y++) for (let q = i * bw; q < (i + 1) * bw; q++) s += d[(y * cw + q) * 4 + 3];
      m[j * LM_SX + i] = s / (bw * bw * 255); mx = Math.max(mx, m[j * LM_SX + i]);
    }
    if (mx > 0) for (let k = 0; k < LM_N; k++) m[k] = Math.min(1, m[k] / mx);
    return { code: ch.charCodeAt(0), m };
  });
}

// sprite pixel under a point of the lander's frame (units at the current detail), or -1; legs are
// looked up where the point was before they slid up their struts by sh = [dxL, dyL, dxR, dyR]
function lmPixel(lx, ly, sh) {
  const s = LM_K * RES;
  let c = Math.floor(lx / s + LM_OX), r = Math.floor(ly / s + LM_OY);
  if (c >= 0 && r >= 0 && c < LM_W && r < LM_H) { const k = r * LM_W + c; if (LM.idx[k] !== 255 && !LM.part[k]) return k; }
  for (let p = 1; p <= 2; p++) {
    c = Math.floor((lx + sh[p * 2 - 2]) / s + LM_OX); r = Math.floor((ly + sh[p * 2 - 1]) / s + LM_OY);
    if (c >= 0 && r >= 0 && c < LM_W && r < LM_H) { const k = r * LM_W + c; if (LM.part[k] === p && LM.idx[k] !== 255) return k; }
  }
  return -1;
}
const _lmSh = [0, 0, 0, 0];
function lmLegShift(b) {
  _lmSh.fill(0);
  if (L && L.body === b) for (const leg of L.legs) { const [ux, uy] = legDir(leg.side), o = leg.side < 0 ? 0 : 2; _lmSh[o] = ux * leg.c; _lmSh[o + 1] = uy * leg.c; }
  return _lmSh;
}
// the sprite is pinned to the character grid, so it holds still while the lander translates; vertically
// it is the soles of the footpads that snap to a row boundary, so a landed lander stands right on the ground
function lmBox(b) {
  const S = RES, foot = LEG0.fy * S - (L && L.body === b ? (L.legs[0].c + L.legs[1].c) * .5 * legDir(1)[1] : 0);
  const bx = Math.round(b.x), by = Math.round((b.y + foot) / ASPECT) * ASPECT - foot, rad = Math.hypot(LM_W * .5, LM_H * .6) * LM_K * S + 1;
  return [bx, by, Math.floor(bx - rad), Math.floor((by - rad) / ASPECT), Math.ceil(bx + rad), Math.ceil((by + rad) / ASPECT)];
}

function drawLanderArt(b) {
  if (!LM) lmBuild();
  if (!LM.shapes) LM.shapes = lmShapes();
  const sh = lmLegShift(b), [bx, by, x0, y0, x1, y1] = lmBox(b), c = Math.cos(b.a), s = Math.sin(b.a);
  const V = LM.V, hist = LM.hist, shapes = LM.shapes;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    let occ = 0, ink = 0, r = 0, g = 0, bl = 0; hist.fill(0);
    for (let j = 0; j < LM_SY; j++) for (let i = 0; i < LM_SX; i++) {
      const k = j * LM_SX + i, wx = cx + (i + .5) / LM_SX - bx, wy = (cy + (j + .5) / LM_SY) * ASPECT - by;
      const px = lmPixel(wx * c + wy * s, -wx * s + wy * c, sh);
      V[k] = 0; if (px < 0) continue;
      occ++; if (!LM.paint[px]) continue;
      const p = LM.idx[px]; V[k] = 1; ink++; hist[p]++; const q = LM.lin[p]; r += q[0]; g += q[1]; bl += q[2];
    }
    if (occ < 4) continue;
    if (ink < 3) { putEmit(cx, cy, 32, 0, 0, 0); continue; }   // outline: a dark gap that still hides what is behind
    // main paint of the cell; a panel line (interior outline) only wins when it fills most of the cell
    let dom = 2; for (let p = 3; p < hist.length; p++) if (hist[p] > hist[dom]) dom = p;
    if (hist[0] + hist[1] > ink * .6) { if (ink >= LM_DENSE) { putEmit(cx, cy, 32, 0, 0, 0); continue; } dom = hist[1] > hist[0] ? 1 : 0; }
    // colour leans on the cell's main paint, so thin bright parts (ladder rails, RCS jets) stay crisp
    const q = LM.lin[dom]; r = r / ink * .35 + q[0] * .65; g = g / ink * .35 + q[1] * .65; bl = bl / ink * .35 + q[2] * .65;
    let glyph = 0;
    if (ink < LM_DENSE) {   // edge or detail: best-fitting shape
      let best = 1e9;
      for (const sp of shapes) { let d = 0; const m = sp.m; for (let k = 0; k < LM_N; k++) { const e = V[k] - m[k]; d += e * e; } if (d < best) { best = d; glyph = sp.code; } }
    } else glyph = dom >= 10 ? 37 : dom >= 5 ? 64 : 35;   // solid paint: foil %, window and bright metal @, darker metal #
    // lit by the scene, but never dark: the sprite already carries its own shading
    lightAtCell(cx, cy, tmp3);
    putEmit(cx, cy, glyph, r * (.75 + .4 * Math.min(1.3, tmp3[0])), g * (.75 + .4 * Math.min(1.3, tmp3[1])), bl * (.75 + .4 * Math.min(1.3, tmp3[2])));
  }
}

// cells the lander covers, for shadows and lighting
function markLanderDyn(b) {
  if (!LM) lmBuild();
  const sh = lmLegShift(b), [bx, by, x0, y0, x1, y1] = lmBox(b), c = Math.cos(b.a), s = Math.sin(b.a); let top = 1e9;
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    const wx = cx + .5 - bx, wy = (cy + .5) * ASPECT - by;
    if (lmPixel(wx * c + wy * s, -wx * s + wy * c, sh) < 0) continue;
    const i = cy * W + cx; if (!dyn[i]) { dyn[i] = 1; dynList.push(i); } if (cy < top) top = cy;
  }
  return top;
}
