// ===================== ENGINE · lighting =====================
// Sun: exact hard shadows from a column sweep over ray intercepts (no air → razor shadows).
// Earthshine ambient with occlusion from a summed-area table.
// Point / cone lights: rays cast outward from each light, stopped by voxels.
const SUN_L = (() => { const x = 1, y = .5, l = Math.hypot(x, y); return [x / l, y / l]; })(); // direction sunlight travels
const SUN_C = [1.15, 1.1, 1.0];
const AMB_C = [.095, .115, .17];
let LMX = 8, LMY = 5, L_RW = 0, L_RH = 0, LOW = 0, LOH = 0, L_OX = 0, L_OY = 0;
let LR, LG, LB, LSURF, LNX, LNY, LSUN, LAO, LAOD, LOCC, LSAT, LSTAMP, LSSAT, colTop, rayBuf = new Uint8Array(4096);
let stampGen = 0;
const LBOX = { nI: 3, nJ: 2, aI: 2, aJ: 1, dI: 7, dJ: 4 };
function lightAlloc(rw, rh) {
  // box sizes are authored for RES 1 and grow with detail so shading reads the same physically
  LBOX.nI = Math.max(2, Math.round(3 * RES)); LBOX.nJ = Math.max(1, Math.round(2 * RES));
  LBOX.aI = Math.max(1, Math.round(2 * RES)); LBOX.aJ = Math.max(1, Math.round(RES));
  LBOX.dI = Math.round(7 * RES); LBOX.dJ = Math.round(4 * RES);
  LMX = Math.max(LBOX.nI, LBOX.dI) + 1; LMY = Math.max(LBOX.nJ, LBOX.dJ) + 1;
  L_RW = rw; L_RH = rh; LOW = rw + 2 * LMX; LOH = rh + 2 * LMY;
  const n = rw * rh;
  LR = new Float32Array(n); LG = new Float32Array(n); LB = new Float32Array(n);
  LSURF = new Uint8Array(n); LNX = new Float32Array(n); LNY = new Float32Array(n);
  LSUN = new Uint8Array(n); LAO = new Float32Array(n); LAOD = new Float32Array(n); LSTAMP = new Uint32Array(n);
  LOCC = new Uint8Array(LOW * LOH); LSAT = new Int32Array((LOW + 1) * (LOH + 1)); LSSAT = new Int32Array((rw + 1) * (rh + 1));
}
function updateSkyline() {
  if (!colTop || colTop.length !== W) colTop = new Int32Array(W);
  for (let x = 0; x < W; x++) { let y = 0; while (y < H && cells[y * W + x] === EMPTY) y++; colTop[x] = y; }
}
function satBox(i0, j0, i1, j1) {
  i0 = clamp(i0, 0, LOW - 1); i1 = clamp(i1, 0, LOW - 1); j0 = clamp(j0, 0, LOH - 1); j1 = clamp(j1, 0, LOH - 1);
  const S = LSAT, w = LOW + 1;
  return S[(j1 + 1) * w + i1 + 1] - S[j0 * w + i1 + 1] - S[(j1 + 1) * w + i0] + S[j0 * w + i0];
}
function occAt(cx, cy) {
  const a = cx - L_OX + LMX, b = cy - L_OY + LMY;
  if (a >= 0 && b >= 0 && a < LOW && b < LOH) return LOCC[b * LOW + a];
  return getC(cx, cy) !== EMPTY ? 1 : 0;
}

function computeLighting(ox, oy, lights, dynTop) {
  L_OX = ox; L_OY = oy;
  const RW = L_RW, RH = L_RH, OW = LOW, OH = LOH, B = LBOX;
  // 1) occupancy + summed-area table
  for (let j = 0; j < OH; j++) { const cy = oy - LMY + j; for (let i = 0; i < OW; i++) LOCC[j * OW + i] = getC(ox - LMX + i, cy) !== EMPTY ? 1 : 0; }
  const S = LSAT, sw = OW + 1;
  for (let j = 0; j < OH; j++) { let run = 0; for (let i = 0; i < OW; i++) { run += LOCC[j * OW + i]; S[(j + 1) * sw + i + 1] = S[j * sw + i + 1] + run; } }
  // 2) sun: sweep columns in the light's direction, tracking which rays are blocked
  sunSweep(ox, oy, dynTop);
  // sunlit-neighbour table: lets light soak a fixed physical depth into the ground at any detail
  const SS = LSSAT, ssw = RW + 1;
  for (let j = 0; j < RH; j++) { let run = 0; for (let i = 0; i < RW; i++) { run += LSUN[j * RW + i]; SS[(j + 1) * ssw + i + 1] = SS[j * ssw + i + 1] + run; } }
  // 3) sun + ambient shading
  const aA = (2 * B.aI + 1) * (2 * B.aJ + 1), dA = (2 * B.dI + 1) * (2 * B.dJ + 1);
  const gX = 1 / (B.nI * (2 * B.nJ + 1) * (B.nI + 1) * .5), gY = 1 / ((2 * B.nI + 1) * B.nJ * (B.nJ + 1) * .5 * ASPECT);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, oi = (j + LMY) * OW + i + LMX;
    let r, g, b;
    if (!LOCC[oi]) {
      LSURF[k] = 0; const s = LSUN[k];
      r = AMB_C[0] * .7 + s * SUN_C[0]; g = AMB_C[1] * .7 + s * SUN_C[1]; b = AMB_C[2] * .7 + s * SUN_C[2];
    } else {
      const ii = i + LMX, jj = j + LMY;
      const aoS = 1 - satBox(ii - B.aI, jj - B.aJ, ii + B.aI, jj + B.aJ) / aA;
      const aoD = 1 - satBox(ii - B.dI, jj - B.dJ, ii + B.dI, jj + B.dJ) / dA;
      LAO[k] = aoS; LAOD[k] = aoD;
      if (!LOCC[oi - 1] || !LOCC[oi + 1] || !LOCC[oi - OW] || !LOCC[oi + OW]) {
        LSURF[k] = 2;
        let nx = (satBox(ii - B.nI, jj - B.nJ, ii - 1, jj + B.nJ) - satBox(ii + 1, jj - B.nJ, ii + B.nI, jj + B.nJ)) * gX;
        let ny = (satBox(ii - B.nI, jj - B.nJ, ii + B.nI, jj - 1) - satBox(ii - B.nI, jj + 1, ii + B.nI, jj + B.nJ)) * gY;
        const l = Math.hypot(nx, ny);
        if (l < 1e-6) { nx = 0; ny = -1; } else { nx /= l; ny /= l; }
        LNX[k] = nx; LNY[k] = ny;
        const ndl = Math.max(0, -(nx * SUN_L[0] + ny * SUN_L[1]));
        const sun = LSUN[k] * (.12 + .88 * ndl), am = .55 + 2 * aoS;
        r = AMB_C[0] * am + sun * SUN_C[0]; g = AMB_C[1] * am + sun * SUN_C[1]; b = AMB_C[2] * am + sun * SUN_C[2];
      } else {
        LSURF[k] = 1;
        const i0 = Math.max(0, i - B.aI), i1 = Math.min(RW - 1, i + B.aI), j0 = Math.max(0, j - B.aJ), j1 = Math.min(RH - 1, j + B.aJ);
        const near = (SS[(j1 + 1) * ssw + i1 + 1] - SS[j0 * ssw + i1 + 1] - SS[(j1 + 1) * ssw + i0] + SS[j0 * ssw + i0]) / ((i1 - i0 + 1) * (j1 - j0 + 1));
        const sub = aoD * 2.4 + near * .45;
        r = AMB_C[0] * .4 + sub * .22 * SUN_C[0]; g = AMB_C[1] * .4 + sub * .21 * SUN_C[1]; b = AMB_C[2] * .4 + sub * .2 * SUN_C[2];
      }
    }
    LR[k] = r; LG[k] = g; LB[k] = b;
  }
  // 4) point & cone lights, shadowed by voxels
  for (const L of lights) addPointLight(L, ox, oy);
  // 5) global flash
  if (FX.flash > 0) { const f = FX.flash * (CALM ? .3 : 1), c = FX.flashCol; for (let k = 0; k < RW * RH; k++) { LR[k] += f * c[0]; LG[k] += f * c[1]; LB[k] += f * c[2]; } }
}

// Every sun ray is a line y = b + k·x (rows); index rays by their intercept b at half-row
// spacing. Walking columns left→right, a solid cell blocks the rays that cross it, so each
// cell is tested exactly once. Value 1 = blocked by terrain, 2 = blocked only by a dynamic
// body (lander/boulder): dynamic cells stay lit behind each other but still cast shadows.
function sunSweep(ox, oy, dynTop) {
  const RW = L_RW, RH = L_RH, k = SUN_L[1] / SUN_L[0] / ASPECT;
  const yBot = Math.min(H, oy + RH), x1 = Math.min(W, ox + RW);
  LSUN.fill(0);
  let xs0 = Math.max(0, ox), yTop = yBot;
  for (let pass = 0; pass < 3; pass++) {
    for (let x = xs0; x < x1; x++) if (colTop[x] < yTop) yTop = colTop[x];
    yTop = Math.max(0, Math.min(yTop, dynTop) - 1);
    xs0 = Math.max(0, Math.floor(ox - (yBot - yTop) / k) - 2);
  }
  for (let j = 0; j < RH; j++) if (oy + j < yTop) LSUN.fill(1, j * RW, j * RW + RW);
  if (yTop >= yBot || x1 <= xs0) return;
  const bMin = yTop - k * (x1 + 1) - 2, bMax = yBot - k * xs0 + 2, NB = Math.ceil((bMax - bMin) * 2) + 4;
  if (rayBuf.length < NB) rayBuf = new Uint8Array(NB * 2);
  rayBuf.fill(0, 0, NB);
  const RB = rayBuf;
  for (let x = xs0; x < x1; x++) {
    const kx = k * x, inX = x >= ox;
    for (let y = yTop; y < yBot; y++) {
      const ci = y * W + x, solid = cells[ci] !== EMPTY, dy = dyn[ci];
      const v = RB[((y + .5 - kx - k * .5 - bMin) * 2) | 0];
      if (inX && y >= oy && (dy ? v !== 1 : v === 0)) LSUN[(y - oy) * RW + x - ox] = 1;
      if (solid || dy) {
        const q0 = ((y - kx - k - bMin) * 2) | 0, q1 = ((y + 1 - kx - bMin) * 2) | 0;
        if (solid) for (let q = q0; q <= q1; q++) RB[q] = 1;
        else for (let q = q0; q <= q1; q++) if (RB[q] === 0) RB[q] = 2;
      }
    }
  }
}

// Rays leave the light every ~0.6 units of arc at its edge; each cell is lit once per light
// (stamped), surfaces take a Lambert term, and a ray that hits the ground soaks a short way in
// (about 1.3 m), so a lit pool reads as a band of ground rather than a one-character line.
function addPointLight(L, ox, oy) {
  const RW = L_RW, RH = L_RH, r = L.r, I = L.I;
  if (I <= .01 || r <= 1) return;
  if (L.x + r < ox || L.x - r > ox + RW || (L.y + r) / ASPECT < oy || (L.y - r) / ASPECT > oy + RH) return;
  const gen = ++stampGen, cr = L.c[0] * I, cg = L.c[1] * I, cb = L.c[2] * I, cone = L.cos !== undefined;
  let a0 = 0, span = 6.2832;
  if (cone) { const half = Math.acos(L.cos); a0 = Math.atan2(L.dy, L.dx) - half; span = 2 * half; }
  const nRays = Math.max(12, Math.ceil(r * span / .6)), skip = L.skip || 1.2, step = .6, soakLen = 2.6 * RES;
  const shade = (kk, cx, cy, s) => {
    const ux = L.x - cx - .5, uy = L.y - (cy + .5) * ASPECT, d = Math.hypot(ux, uy);
    if (d >= r) return 0;
    let att;
    if (cone) { const q = d / r; att = 1 - q * q; att *= att; } else { att = 1 - d / r; att *= att; }
    if (cone && d > .5) { const cd = -(ux * L.dx + uy * L.dy) / d; att = cd <= L.cos ? 0 : att * smooth(Math.min(1, (cd - L.cos) / (1 - L.cos) * 4)); }
    if (s === 2) { const nd = (LNX[kk] * ux + LNY[kk] * uy) / (d || 1); att *= Math.max(0, nd) * .8 + .2; }
    return att;
  };
  for (let q = 0; q < nRays; q++) {
    const ang = a0 + (q + .5) * span / nRays, dx = Math.cos(ang), dy = Math.sin(ang);
    let depth = -1, entry = 0;
    for (let t = 0; t < r; t += step) {
      const cx = Math.floor(L.x + dx * t), cy = Math.floor((L.y + dy * t) / ASPECT), i = cx - ox, j = cy - oy;
      const inWin = i >= 0 && j >= 0 && i < RW && j < RH, kk = inWin ? j * RW + i : -1;
      const s = inWin ? LSURF[kk] : (occAt(cx, cy) ? 1 : 0), solid = s !== 0;
      if (depth >= 0) {                                   // inside the ground: soak, then stop
        if (!solid) break;
        depth += step; if (depth > soakLen) break;
        if (inWin && s === 1 && LSTAMP[kk] !== gen) { LSTAMP[kk] = gen; const f = 1 - depth / soakLen, a = entry * f * f * .75; LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a; }
        continue;
      }
      if (inWin && s !== 1 && LSTAMP[kk] !== gen) { LSTAMP[kk] = gen; const a = shade(kk, cx, cy, s); if (a > 0) { LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a; } }
      if (solid && L.shadow && t > skip) { if (!inWin || s === 1) break; depth = 0; entry = shade(kk, cx, cy, s); }
    }
  }
}
// cheap unshadowed glow for emissive things (flames, hot rock, crystals); rad in base cells
function splatLight(cx, cy, r, g, b, rad) {
  rad = Math.max(1, Math.round(rad * RES));
  const i0 = cx - L_OX, j0 = cy - L_OY, RW = L_RW, RH = L_RH, ry = Math.max(1, rad >> 1);
  for (let j = -ry; j <= ry; j++) {
    const jj = j0 + j; if (jj < 0 || jj >= RH) continue;
    for (let i = -rad; i <= rad; i++) {
      const ii = i0 + i; if (ii < 0 || ii >= RW) continue;
      const k = jj * RW + ii; if (LSURF[k] === 1) continue;
      const d = (i * i) / (rad * rad + 1) + (j * j) / (ry * ry + 1); if (d >= 1) continue;
      const a = (1 - d) * (1 - d);
      LR[k] += r * a; LG[k] += g * a; LB[k] += b * a;
    }
  }
}
