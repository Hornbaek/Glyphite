// ===================== ENGINE · lighting =====================
// Sun: exact hard shadows from a column sweep over ray intercepts (no air → razor shadows).
// Earthshine ambient with occlusion from a summed-area table.
// Point / cone lights: rays cast outward from each light, stopped by voxels.
// Lighting environment (games change it with setSun / setAmbient):
const SUN_L = (() => { const x = 1, y = .5, l = Math.hypot(x, y); return [x / l, y / l]; })(); // direction sunlight travels
const SUN_C = [1.15, 1.1, 1.0];
const AMB_C = [.095, .115, .17];
let SUN_ON = true;
// The sun's colour is a base colour dimmed by the air it crosses: with an atmosphere (setAtmosphere) a low sun
// is orange and then red by itself, from exp(-scatter × airmass) per channel, so no sunset palette is needed.
// Rayleigh scattering takes blue three times as fast as red.
let SUN_EL = 45, SUN_BASE = [1.15, 1.1, 1.0], SUN_FIXED = false, ATMOS = 0;
const AIR_TAU = [.05, .12, .28];   // optical depth per channel looking straight up through an Earth-like atmosphere
const airmass = el => 1 / (Math.sin(el * Math.PI / 180) + .50572 * Math.pow(el + 6.07995, -1.6364));   // Kasten & Young, el in degrees
// blackbody colour for a temperature in kelvin (Tanner Helland's fit, 1000..40000 K), scaled so the strongest channel is `peak`
function kelvinColor(K, peak = 1.15) {
  const t = clamp(K, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)], m = Math.max(c[0], c[1], c[2]);
  return c.map(v => v / m * peak);
}
function sunTint() {
  const k = ATMOS > 0 && !SUN_FIXED ? ATMOS * (airmass(SUN_EL) - 1) : 0;   // airmass 1 = sun overhead: the base colour
  for (let i = 0; i < 3; i++) SUN_C[i] = SUN_BASE[i] * (k ? Math.exp(-AIR_TAU[i] * k) : 1);
}
// elevation in degrees above the horizon, light coming from the left (1..89); null = no sun (caves, indoors).
// colour: [r, g, b] pins the colour; { kelvin, intensity? } sets the base from a blackbody (5772 = our sun); left out, the
// last base colour stays. Only with an atmosphere does the colour then follow the elevation.
function setSun(elevationDeg, color) {
  SUN_ON = elevationDeg !== null && elevationDeg !== false;
  if (SUN_ON) { SUN_EL = clamp(elevationDeg, 1, 89); const el = SUN_EL * Math.PI / 180; SUN_L[0] = Math.cos(el); SUN_L[1] = Math.sin(el); }
  if (Array.isArray(color)) { SUN_BASE = [color[0], color[1], color[2]]; SUN_FIXED = true; }
  else if (color && color.kelvin) { SUN_BASE = kelvinColor(color.kelvin, color.intensity); SUN_FIXED = false; }
  sunTint();
}
// 0 = vacuum (the default); 1 = Earth-like. Reddens a low sun, makes stars twinkle, and lets sound travel (game decides).
function setAtmosphere(thickness) { ATMOS = Math.max(0, +thickness || 0); sunTint(); }
function setAmbient(color) { AMB_C[0] = color[0]; AMB_C[1] = color[1]; AMB_C[2] = color[2]; }
let LMX = 8, LMY = 5, L_RW = 0, L_RH = 0, LOW = 0, LOH = 0, L_OX = 0, L_OY = 0;
let LR, LG, LB, LSURF, LNX, LNY, LSUN, LAO, LAOD, LOCC, LSAT, LSTAMP, LSSAT, colTop, rayBuf = new Uint8Array(4096);
// LDX, LDY: where the lamps' light at a cell comes from (toward the lights, weighted by how much each gives), for sprites with
// normal maps; the sun's direction is SUN_L
let LDX, LDY;
let stampGen = 0;
const LBOX = { nI: 3, nJ: 2, aI: 2, aJ: 1, dI: 7, dJ: 4 };
function lightAlloc(rw, rh) {
  // box sizes are authored for RES 1 and grow with detail so shading reads the same physically
  // (in cells: the J sizes are rows, ASPECT units each)
  LBOX.nI = Math.max(2, Math.round(3 * RES)); LBOX.nJ = Math.max(1, Math.round(4 * RES / ASPECT));
  LBOX.aI = Math.max(1, Math.round(2 * RES)); LBOX.aJ = Math.max(1, Math.round(2 * RES / ASPECT));
  LBOX.dI = Math.round(7 * RES); LBOX.dJ = Math.round(8 * RES / ASPECT);
  LMX = Math.max(LBOX.nI, LBOX.dI) + 1; LMY = Math.max(LBOX.nJ, LBOX.dJ) + 1;
  L_RW = rw; L_RH = rh; LOW = rw + 2 * LMX; LOH = rh + 2 * LMY; lampClear();
  const n = rw * rh; stillAlloc(n);
  LR = new Float32Array(n); LG = new Float32Array(n); LB = new Float32Array(n); LDX = new Float32Array(n); LDY = new Float32Array(n);
  LSURF = new Uint8Array(n); LNX = new Float32Array(n); LNY = new Float32Array(n);
  LSUN = new Uint8Array(n); LAO = new Float32Array(n); LAOD = new Float32Array(n); LSTAMP = new Uint32Array(n);
  LOCC = new Uint8Array(LOW * LOH); LSAT = new Int32Array((LOW + 1) * (LOH + 1)); LSSAT = new Int32Array((rw + 1) * (rh + 1));
}
// colTop[x]: the first solid row of each column. updateSkyline() rescans every column (call it after writing cells[] yourself, as a level
// generator does); syncSkyline(), which the frame loop calls, rescans only the 16-column strips where a chunk changed since the last scan
// (the revision counter, 01_core.js): a still world costs nothing, and a world with no solid cells at all (an isometric game's) is scanned once.
let skyRev = null;   // per 16-column strip: the world revision it was last scanned at
function scanColumns(x0, x1) { for (let x = x0; x < x1; x++) { let y = 0; while (y < H && cells[y * W + x] === EMPTY) y++; colTop[x] = y; } }
function updateSkyline() {
  if (!colTop || colTop.length !== W) colTop = new Int32Array(W);
  scanColumns(0, W); skyRev = new Uint32Array(CWn).fill(WREV);
}
function syncSkyline() {
  if (!colTop || colTop.length !== W || !skyRev || skyRev.length !== CWn) { updateSkyline(); return; }
  for (let c = 0; c < CWn; c++) {
    let dirty = false;
    for (let q = c; q < CREV.length; q += CWn) if (CREV[q] > skyRev[c]) { dirty = true; break; }
    if (dirty) { scanColumns(c * CS, Math.min(W, (c + 1) * CS)); skyRev[c] = WREV; }
  }
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

// LOCC: is the terrain solid (getC !== EMPTY), for the window and its margin. Rows inside the world are read straight from cells[]; beyond the
// sides and the bottom the edge material counts, above the top nothing does (getC's rules, without the call and its four tests per cell).
function fillOcc(ox, oy) {
  const OW = LOW, OH = LOH, edge = EDGE_MAT !== EMPTY ? 1 : 0, x0 = ox - LMX, i0 = Math.min(OW, Math.max(0, -x0)), i1 = Math.max(i0, Math.min(OW, W - x0));
  for (let j = 0; j < OH; j++) {
    const cy = oy - LMY + j, o = j * OW;
    LOCC.fill(edge, o, o + i0); LOCC.fill(edge, o + i1, o + OW);
    if (cy < 0) LOCC.fill(0, o + i0, o + i1);
    else if (cy >= H) LOCC.fill(edge, o + i0, o + i1);
    else { const row = cy * W + x0; for (let i = i0; i < i1; i++) LOCC[o + i] = cells[row + i] === EMPTY ? 0 : 1; }
  }
}

// ---------- still frames: keep what the scene made when nothing it depends on has moved ----------
// computeLighting and the terrain pass of renderScene make about eight passes over every cell of the window every frame. When nothing they
// depend on has changed since the last frame they would make the same numbers again, so a still frame keeps them, at two levels:
//   BASE (sun, ambient and occlusion: LR/LG/LB before any lamp, the surface buffers beside them) is kept while the camera is in the same cell,
//     the sun's and the ambient colours are the same, the moving bodies that cast sun shadows stand in the same cells (a hash of them) and no
//     chunk under the window or under the sun's sweep has been written to (the revision counter, 01_core.js). The lamps and the flash are added
//     on top again every frame (the lamp cache makes that cheap), so a flickering or moving lamp does not spoil it.
//   TERRAIN (every cell shaded, and the light buffers after hot and glowing things have added theirs) is kept while on top of the base the lamps
//     are the same (position, radius, colour, intensity, cone: a flickering lamp breaks it, the base still holds), the back wall, the exposure,
//     the materials and the backdrop's settings are the same, no emissive particle is in the window, nothing in it is hot and the music does not
//     pulse the scene (setBeatPulse).
// What moves on top (particles, falling chunks, sprites, rings, the HUD) is drawn every frame as before. The terrain is not kept while the window
// holds crystals or glints, which follow the clock (the base still is). Exact, like the lamp cache: the same numbers come back, so a frame is bit for bit what it was
// without it (tests/engine_cache.py compares them). A snapshot is taken once a frame's keys equal the last frame's, so a moving camera costs
// the comparison of a few numbers. CACHE.still = false turns it off; baseHit and terrainHit say what the last frame did; with CACHE.audit
// the work is done anyway and compared with the snapshot (CACHE.bad counts mismatches).
const KB_N = 24, TK_MAX = 12 * 64 + 24;
const _kbNow = new Float64Array(KB_N), _kbLast = new Float64Array(KB_N), _tkNow = new Float64Array(TK_MAX), _tkLast = new Float64Array(TK_MAX);
let _tkN = 0, _tkLastN = -1;
const STILL = { have: false, kb: new Float64Array(KB_N), rev: 0, crev: null, x0: 0, y0: 0, x1: 0, y1: 0, gen: 0, R0: null, G0: null, B0: null,
  tHave: false, tGen: -1, tk: new Float64Array(TK_MAX), tkN: 0, mats: null, baseReuse: false, snapBase: false, terrain: false, snapTerrain: false };
const eqF = (a, b, n) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
function stillAlloc(n) {
  STILL.R0 = new Float32Array(n); STILL.G0 = new Float32Array(n); STILL.B0 = new Float32Array(n);
  STILL.have = STILL.tHave = false; _kbLast.fill(NaN); _tkLastN = -1;
}
// has any chunk touching cells x0..x1, y0..y1 been written to since revision rev?
function chunksChangedSince(x0, y0, x1, y1, rev) {
  const a = Math.max(0, x0) >> 4, b = Math.max(0, y0) >> 4, c = Math.min(W - 1, x1) >> 4, d = Math.min(H - 1, y1) >> 4;
  for (let cy = b; cy <= d; cy++) for (let cx = a, q = cy * CWn + a; cx <= c; cx++, q++) if (CREV[q] > rev) return true;
  return false;
}
function stillKeys(ox, oy, dynTop) {
  const k = _kbNow; let i = 0;
  k[i++] = ox; k[i++] = oy; k[i++] = L_RW; k[i++] = L_RH; k[i++] = RES; k[i++] = SUN_ON ? 1 : 0; k[i++] = SUN_L[0]; k[i++] = SUN_L[1];
  k[i++] = SUN_C[0]; k[i++] = SUN_C[1]; k[i++] = SUN_C[2]; k[i++] = AMB_C[0]; k[i++] = AMB_C[1]; k[i++] = AMB_C[2]; k[i++] = EDGE_MAT; k[i++] = ASPECT;
  let h = 0, d = 0;   // the bodies that cast sun shadows: where the sweep stops, and a hash of the cells they cover
  if (SUN_ON) { d = dynTop; h = dynList.length | 0; for (let q = 0; q < dynList.length; q++) h = Math.imul(h ^ dynList[q], 16777619); }
  k[i++] = d; k[i++] = h; k[i++] = LMX; k[i++] = LMY;
  while (i < KB_N) k[i++] = 0;
}
// anything in the window that gives light off on its own (the test of renderScene's first step)
function emissiveIn(ox, oy) {
  for (let p = 0; p < P.n; p++) {
    const t = P.t[p], ct = t >= PT_CUSTOM ? PTYPES[t - PT_CUSTOM] : null;
    if (ct ? !ct.light : t !== PT_GAS && t !== PT_FIRE && t !== PT_SPARK) continue;
    const i = Math.floor(P.x[p]) - ox, j = Math.floor(P.y[p] / ASPECT) - oy;
    if (i >= 0 && j >= 0 && i < L_RW && j < L_RH) return true;
  }
  return false;
}
// nothing in the window is hot enough to change a colour or give light (heat above .02 colours a cell, above .25 it glows)
function heatCalm(ox, oy) {
  const x0 = Math.max(0, ox), x1 = Math.min(W, ox + L_RW);
  for (let j = 0; j < L_RH; j++) { const cy = oy + j; if (cy < 0 || cy >= H) continue; for (let q = cy * W + x0, e = cy * W + x1; q < e; q++) if (heat[q] > .02) return false; }
  return true;
}
// a checksum of the back wall under the window (nothing tells the engine when a game writes backCells)
function backSig(ox, oy) {
  let h = 2166136261 | 0; const x0 = Math.max(0, ox), x1 = Math.min(W, ox + L_RW);
  for (let j = 0; j < L_RH; j++) { const cy = oy + j; if (cy < 0 || cy >= H) continue; for (let q = cy * W + x0, e = cy * W + x1; q < e; q++) h = Math.imul(h ^ backCells[q], 16777619); }
  return h >>> 0;
}
function terrainKeys(lights, ox, oy) {
  const k = _tkNow; let i = 0; k[i++] = lights.length;
  for (const L of lights) {
    k[i++] = L.x; k[i++] = L.y; k[i++] = L.r; k[i++] = L.c[0]; k[i++] = L.c[1]; k[i++] = L.c[2]; k[i++] = L.I; k[i++] = L.shadow ? 1 : 0;
    k[i++] = L.cos === undefined ? 7 : L.cos; k[i++] = L.dx === undefined ? 0 : L.dx; k[i++] = L.dy === undefined ? 0 : L.dy; k[i++] = L.skip || 1.2;
  }
  k[i++] = FX.flash * (CALM ? .3 : 1); k[i++] = FX.flashCol[0]; k[i++] = FX.flashCol[1]; k[i++] = FX.flashCol[2];
  k[i++] = BACK.dim; k[i++] = BACK.shadow; k[i++] = BACK.dir[0]; k[i++] = BACK.dir[1]; k[i++] = BACK.depth; k[i++] = EYE.e; k[i++] = backSig(ox, oy);
  _tkN = i;
}
function matsSame() {
  const m = STILL.mats; if (!m || m.length !== MATS.length) return false;
  for (let i = 0; i < m.length; i++) if (m[i] !== MATS[i]) return false;   // setMaterial puts a new object in MATS
  return true;
}
// decide, for this frame, what can come from the last one (sets STILL.baseReuse, snapBase, terrain, snapTerrain)
function stillPlan(ox, oy, lights, dynTop) {
  const S = STILL;
  S.baseReuse = S.snapBase = S.terrain = S.snapTerrain = false;
  stillKeys(ox, oy, dynTop);
  const same = eqF(_kbNow, _kbLast, KB_N); _kbLast.set(_kbNow);
  let x0 = ox - LMX, y0 = oy - LMY, x1 = ox + L_RW + LMX, y1 = oy + L_RH + LMY;   // the part of the world the base depends on
  if (SUN_ON) { sunBox(ox, oy, dynTop); x0 = Math.min(x0, _sunX0); y0 = Math.min(y0, _sunY0); x1 = Math.max(x1, _sunX1); y1 = Math.max(y1, _sunY1); }
  let valid = S.have && S.crev === CREV && eqF(_kbNow, S.kb, KB_N);
  if (valid) valid = !chunksChangedSince(Math.min(x0, S.x0), Math.min(y0, S.y0), Math.max(x1, S.x1), Math.max(y1, S.y1), S.rev);
  S.baseReuse = valid;
  if (!valid) { S.have = false; S.tHave = false; }
  if (!valid && same) { S.snapBase = true; S.kb.set(_kbNow); S.rev = WREV; S.crev = CREV; S.x0 = x0; S.y0 = y0; S.x1 = x1; S.y1 = y1; S.gen++; }
  if ((S.baseReuse || S.snapBase) && BEAT_K === 0 && lights.length <= 64 && !emissiveIn(ox, oy) && heatCalm(ox, oy)) {
    terrainKeys(lights, ox, oy);
    const tSame = _tkN === _tkLastN && eqF(_tkNow, _tkLast, _tkN);
    _tkLast.set(_tkNow.subarray(0, _tkN)); _tkLastN = _tkN;
    if (S.baseReuse && S.tHave && S.tGen === S.gen && S.tkN === _tkN && matsSame() && eqF(_tkNow, S.tk, _tkN)) S.terrain = true;
    else { S.tHave = false; S.snapTerrain = tSame; }
  } else { S.tHave = false; _tkLastN = -1; }
}
function stillSaveBase() { const S = STILL; S.R0.set(LR); S.G0.set(LG); S.B0.set(LB); S.have = true; }
function stillSavedTerrain() { const S = STILL; S.tHave = true; S.tGen = S.gen; S.tkN = _tkN; S.tk.set(_tkNow.subarray(0, _tkN)); S.mats = MATS.slice(); }
function stillCompareBase() {
  const S = STILL; let same = true;
  for (let k = 0; same && k < LR.length; k++) same = LR[k] === S.R0[k] && LG[k] === S.G0[k] && LB[k] === S.B0[k];
  if (!same) { CACHE.bad++; S.have = false; console.warn('the still-frame base was stale: cells[] or backCells[] was written without setC (call worldChanged(), engine/API.md)'); }
}

let L_NLIGHTS = 0;
function computeLighting(ox, oy, lights, dynTop) {
  L_OX = ox; L_OY = oy; L_NLIGHTS = lights.length; lampFrame(ox, oy);
  const RW = L_RW, RH = L_RH, OW = LOW, OH = LOH, B = LBOX, ST = STILL;
  if (CACHE.still) stillPlan(ox, oy, lights, dynTop); else ST.baseReuse = ST.snapBase = ST.terrain = ST.snapTerrain = false;
  CACHE.baseHit = +ST.baseReuse; CACHE.terrainHit = +ST.terrain;
  if (ST.terrain && !CACHE.audit) { for (const e of LAMPS.values()) e.seen = lampTick; return; }   // nothing changed at all: renderScene brings the scene's buffers back whole
  if (ST.baseReuse && !CACHE.audit) { LR.set(ST.R0); LG.set(ST.G0); LB.set(ST.B0); }   // the sun, ambient and occlusion are as they were (the rest of the buffers still hold them)
  else {
    // 1) occupancy + summed-area table
    fillOcc(ox, oy);
    const S = LSAT, sw = OW + 1;
    for (let j = 0; j < OH; j++) { let run = 0; for (let i = 0; i < OW; i++) { run += LOCC[j * OW + i]; S[(j + 1) * sw + i + 1] = S[j * sw + i + 1] + run; } }
    // 2) sun: sweep columns in the light's direction, tracking which rays are blocked
    if (SUN_ON) sunSweep(ox, oy, dynTop); else LSUN.fill(0);
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
    if (ST.baseReuse) stillCompareBase();   // (audit: what was kept must equal what was just made)
    if (ST.snapBase) stillSaveBase();
  }
  // 4) point & cone lights, shadowed by voxels
  LDX.fill(0); LDY.fill(0);
  for (const L of lights) addPointLight(L, ox, oy);
  // 5) global flash
  if (FX.flash > 0) { const f = FX.flash * (CALM ? .3 : 1), c = FX.flashCol; for (let k = 0; k < RW * RH; k++) { LR[k] += f * c[0]; LG[k] += f * c[1]; LB[k] += f * c[2]; } }
}

// Every sun ray is a line y = b + k·x (rows); index rays by their intercept b at half-row
// spacing. Walking columns left→right, a solid cell blocks the rays that cross it, so each
// cell is tested exactly once. Value 1 = blocked by terrain, 2 = blocked only by a dynamic
// body (lander/boulder): dynamic cells stay lit behind each other but still cast shadows.
// the box the sweep works in: columns [x0, x1) from where the rays start (far enough left that they reach the window), rows [y0, y1)
// from the highest solid cell (everything above is lit) down to the window's bottom
let _sunX0 = 0, _sunX1 = 0, _sunY0 = 0, _sunY1 = 0;
function sunBox(ox, oy, dynTop) {
  const RW = L_RW, RH = L_RH, k = SUN_L[1] / SUN_L[0] / ASPECT;
  const yBot = Math.min(H, oy + RH), x1 = Math.min(W, ox + RW);
  let xs0 = Math.max(0, ox), yTop = yBot;
  for (let pass = 0; pass < 3; pass++) {
    for (let x = xs0; x < x1; x++) if (colTop[x] < yTop) yTop = colTop[x];
    yTop = Math.max(0, Math.min(yTop, dynTop) - 1);
    xs0 = Math.max(0, Math.floor(ox - (yBot - yTop) / k) - 2);
  }
  _sunX0 = xs0; _sunX1 = x1; _sunY0 = yTop; _sunY1 = yBot;
}
function sunSweep(ox, oy, dynTop) {
  const RW = L_RW, RH = L_RH, k = SUN_L[1] / SUN_L[0] / ASPECT;
  LSUN.fill(0);
  sunBox(ox, oy, dynTop);
  const xs0 = _sunX0, x1 = _sunX1, yTop = _sunY0, yBot = _sunY1;
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

// ---------- lamps: cast every frame, or kept while nothing changes ----------
// A lamp casts about r / 0.6 · 2π rays of r / 0.6 steps every frame: a quarter of a million cell steps for a 60 · RES lamp at RES 2, and most
// lamps and most walls do not move. So the outcome of a cast is kept: for every cell the light reached, how much of it (the falloff, the cone
// and the surface's angle: these depend on the lamp's position, radius and cone and on the surfaces, and on nothing else), and the next frame
// adds those numbers instead of casting again. The lamp's colour and intensity are applied each time, so a flickering or pulsing lamp stays cached.
// A kept cast is valid while
//   - no chunk of the world within the lamp's reach (plus the width of a surface normal) has been written to since: the revision counter, 01_core.js,
//   - the camera is in the same cell (the window cuts the cast off at its edge, so a lamp partly off screen casts differently from one in view).
// It is exact: the same numbers are added in the same order (lamp by lamp, one add per cell per lamp), so a frame comes out bit for bit as it
// did without the cache (tests/engine_cache.py). Lamps are found by their parameters. One is recorded once it has stood still, with the camera
// still, for two frames (a moving lamp or a moving camera costs nothing extra), and is let go after a change near it, which must then calm
// down for four frames before it is recorded again.
// CACHE.lamps = false turns it off (a test compares the two); hit / miss / rec count the lamps of the last frame (applied from the cache,
// cast without recording, cast and recorded); audit = true re-casts every kept lamp that is used and compares (CACHE.bad counts mismatches).
const CACHE = { lamps: true, still: true, audit: false, hit: 0, miss: 0, rec: 0, baseHit: 0, terrainHit: 0, bad: 0, bytes: 0, limit: 96 << 20 };
const LAMPS = new Map();
// the lamps (by hash) lit last frame and this frame, and whether the camera's cell is the same as last frame's
let _hPrev = new Int32Array(256), _hCur = new Int32Array(256), _hPrevN = 0, _hCurN = 0, _winSame = false, _wOx = 0, _wOy = 0, _wRW = 0, _wRH = 0, _wRes = 0;
function lampFrame(ox, oy) {   // at the start of every lighting pass
  lampTick++; CACHE.hit = CACHE.miss = CACHE.rec = 0;
  const t = _hPrev; _hPrev = _hCur; _hCur = t; _hPrevN = _hCurN; _hCurN = 0;
  _winSame = ox === _wOx && oy === _wOy && L_RW === _wRW && L_RH === _wRH && RES === _wRes; _wOx = ox; _wOy = oy; _wRW = L_RW; _wRH = L_RH; _wRes = RES;
  if ((lampTick & 127) === 0) lampSweep();
}
let lampTick = 0, _rec0 = 0, _rec1 = 0, _recI0 = new Int32Array(0), _recA0 = new Float64Array(0), _recH0 = new Float64Array(0), _recI1 = new Int32Array(0), _recA1 = new Float64Array(0);
const _bits = new Float64Array(1), _bitsU = new Uint32Array(_bits.buffer);
function mixBits(h, v) { _bits[0] = v; h = Math.imul(h ^ _bitsU[0], 16777619); return Math.imul(h ^ _bitsU[1], 16777619); }
function lampDrop(e) { CACHE.bytes -= e.bytes; e.bytes = 0; e.ready = false; e.i0 = e.a0 = e.h0 = e.i1 = e.a1 = null; e.n0 = e.n1 = 0; }
function lampClear() { LAMPS.clear(); CACHE.bytes = 0; }
function lampScratch(n) {
  if (_recI0.length >= n) return;
  _recI0 = new Int32Array(n); _recA0 = new Float64Array(n); _recH0 = new Float64Array(n); _recI1 = new Int32Array(n); _recA1 = new Float64Array(n);
}
// forget lamps not seen for a while, and the oldest kept casts if they add up to too much
function lampSweep() {
  for (const [h, e] of LAMPS) if (lampTick - e.seen > 300) { lampDrop(e); LAMPS.delete(h); }
  if (CACHE.bytes <= CACHE.limit) return;
  const kept = [...LAMPS.values()].filter(e => e.ready).sort((a, b) => a.seen - b.seen);
  for (const e of kept) { if (CACHE.bytes <= CACHE.limit * .75) break; lampDrop(e); e.need = 8; }
}
// the cache entry for this lamp: ready (use it), to be recorded (cast, then lampKeep), or null (cast without recording)
function lampFor(L, ox, oy, skip) {
  const cone = L.cos !== undefined, cs = cone ? L.cos : 7, dx = cone ? L.dx : 0, dy = cone ? L.dy : 0, sh = L.shadow ? 1 : 0;
  let h = mixBits(mixBits(mixBits(mixBits(mixBits(2166136261 | 0, L.x), L.y), L.r), skip), cs);
  h = mixBits(mixBits(mixBits(mixBits(h, dx), dy), sh), EDGE_MAT);
  let again = false;   // the same lamp was lit last frame, with the camera in the same cell: it is standing still
  for (let t = 0; t < _hPrevN; t++) if (_hPrev[t] === h) { again = _winSame; break; }
  if (_hCurN < _hCur.length) _hCur[_hCurN++] = h;
  let e = LAMPS.get(h);
  if (e && !(e.x === L.x && e.y === L.y && e.r === L.r && e.skip === skip && e.cs === cs && e.dx === dx && e.dy === dy && e.sh === sh && e.edge === EDGE_MAT)) { lampDrop(e); LAMPS.delete(h); e = undefined; }   // another lamp with the same hash
  if (!e) {
    if (!again) return null;   // not seen standing still yet: cast it, and look again next frame (a moving lamp never gets an entry)
    e = { x: L.x, y: L.y, r: L.r, skip, cs, dx, dy, sh, edge: EDGE_MAT, ox, oy, rw: L_RW, rh: L_RH, res: RES, crev: CREV, seen: lampTick, need: 0, ready: false, rev: 0, wrev: 0, cx0: 0, cx1: -1, cy0: 0, cy1: -1, n0: 0, i0: null, a0: null, h0: null, n1: 0, i1: null, a1: null, bytes: 0 };
    LAMPS.set(h, e);
  }
  e.seen = lampTick;
  if (e.ox !== ox || e.oy !== oy || e.rw !== L_RW || e.rh !== L_RH || e.res !== RES || e.crev !== CREV) {   // the camera moved, or the world is a new one
    lampDrop(e); e.ox = ox; e.oy = oy; e.rw = L_RW; e.rh = L_RH; e.res = RES; e.crev = CREV; e.need = 1;
  }
  if (e.ready && e.wrev !== WREV) {   // something changed somewhere: has it changed under this lamp?
    let ok = true;
    for (let cy = e.cy0; ok && cy <= e.cy1; cy++) for (let cx = e.cx0, q = cy * CWn + e.cx0; cx <= e.cx1; cx++, q++) if (CREV[q] > e.rev) { ok = false; break; }
    if (ok) e.wrev = WREV; else { lampDrop(e); e.need = 4; }
  }
  if (e.ready) return e;
  if (e.need > 0) { e.need--; return null; }
  // to be recorded: the chunks the cast can depend on are those under the lamp's disc and the width of a surface normal around it
  const M = Math.max(LBOX.nI, LBOX.nJ) + 2;
  e.cx0 = Math.max(0, Math.floor(L.x - L.r) - M) >> 4; e.cx1 = Math.min(W - 1, Math.ceil(L.x + L.r) + M) >> 4;
  e.cy0 = Math.max(0, Math.floor((L.y - L.r) / ASPECT) - M) >> 4; e.cy1 = Math.min(H - 1, Math.ceil((L.y + L.r) / ASPECT) + M) >> 4;
  return e;
}
function lampKeep(e) {
  e.n0 = _rec0; e.i0 = _recI0.slice(0, _rec0); e.a0 = _recA0.slice(0, _rec0); e.h0 = _recH0.slice(0, _rec0);
  e.n1 = _rec1; e.i1 = _recI1.slice(0, _rec1); e.a1 = _recA1.slice(0, _rec1);
  e.bytes = _rec0 * 20 + _rec1 * 12; CACHE.bytes += e.bytes; e.ready = true; e.rev = e.wrev = WREV;
}
// add a kept cast: the same numbers, in the same order, that castLamp adds
function applyLamp(e, L, ox, oy, cr, cg, cb) {
  const RW = L_RW, sumc = cr + cg + cb, lx = L.x, ly = L.y, I0 = e.i0, A0 = e.a0, H0 = e.h0, I1 = e.i1, A1 = e.a1;
  for (let t = 0, n = e.n0; t < n; t++) {
    const kk = I0[t], a = A0[t];
    LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a;
    const j = (kk / RW) | 0, cx = ox + kk - j * RW, cy = oy + j, ux = lx - cx - .5, uy = ly - (cy + .5) * ASPECT, w = sumc * a / H0[t];
    LDX[kk] += ux * w; LDY[kk] += uy * w;
  }
  for (let t = 0, n = e.n1; t < n; t++) { const kk = I1[t], a = A1[t]; LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a; }
}
// re-cast a kept lamp into scratch buffers and compare with what is kept (dev builds now and then, tests always)
let _auditR = null;
function lampAudit(e, L, ox, oy) {
  const n = L_RW * L_RH, keep = [LR, LG, LB, LDX, LDY];
  if (!_auditR || _auditR[0].length !== n) _auditR = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
  [LR, LG, LB, LDX, LDY] = _auditR; for (const a of _auditR) a.fill(0);
  const c = L.c, I = L.I, was = [e.n0, e.n1], i0 = e.i0, a0 = e.a0, h0 = e.h0, i1 = e.i1, a1 = e.a1;
  lampScratch(n); castLamp(L, ox, oy, c[0] * I, c[1] * I, c[2] * I, true);
  [LR, LG, LB, LDX, LDY] = keep;
  let same = _rec0 === was[0] && _rec1 === was[1];
  for (let t = 0; same && t < _rec0; t++) same = _recI0[t] === i0[t] && _recA0[t] === a0[t] && _recH0[t] === h0[t];
  for (let t = 0; same && t < _rec1; t++) same = _recI1[t] === i1[t] && _recA1[t] === a1[t];
  if (!same) { CACHE.bad++; lampDrop(e); e.need = 4; const m = 'the lamp cache was stale: cells[] was written without setC (call worldChanged(), engine/API.md)'; console.warn(m); }
}

// Rays leave the light every ~0.6 units of arc at its edge; each cell is lit once per light
// (stamped), surfaces take a Lambert term, and a ray that hits the ground soaks a short way in
// (about 1.3 m), so a lit pool reads as a band of ground rather than a one-character line.
function addPointLight(L, ox, oy) {
  const RW = L_RW, RH = L_RH, r = L.r, I = L.I;
  if (I <= .01 || r <= 1) return;
  if (L.x + r < ox || L.x - r > ox + RW || (L.y + r) / ASPECT < oy || (L.y - r) / ASPECT > oy + RH) return;
  const cr = L.c[0] * I, cg = L.c[1] * I, cb = L.c[2] * I;
  const e = CACHE.lamps && Number.isFinite(L.x + L.y + r) ? lampFor(L, ox, oy, L.skip || 1.2) : null;
  if (e && e.ready) {
    CACHE.hit++; applyLamp(e, L, ox, oy, cr, cg, cb);
    if (CACHE.audit || (DEV && (lampTick & 127) === 0)) lampAudit(e, L, ox, oy);
    return;
  }
  if (e) { CACHE.rec++; lampScratch(RW * RH); } else CACHE.miss++;
  castLamp(L, ox, oy, cr, cg, cb, !!e);
  if (e) lampKeep(e);
}
// the lamp's own state for lampShade: the falloff at a cell, and the distance it worked out on the way
let _sL = null, _sCone = false, _sR = 0, _sD = 0;
function lampShade(kk, cx, cy, s) {
  const L = _sL, r = _sR, ux = L.x - cx - .5, uy = L.y - (cy + .5) * ASPECT, d = _sD = Math.hypot(ux, uy);
  if (d >= r) return 0;
  let att;
  if (_sCone) { const q = d / r; att = 1 - q * q; att *= att; } else { att = 1 - d / r; att *= att; }
  if (_sCone && d > .5) { const cd = -(ux * L.dx + uy * L.dy) / d; att = cd <= L.cos ? 0 : att * smooth(Math.min(1, (cd - L.cos) / (1 - L.cos) * 4)); }
  if (s === 2) { const nd = (LNX[kk] * ux + LNY[kk] * uy) / (d || 1); att *= Math.max(0, nd) * .8 + .2; }
  return att;
}
// cast the lamp's rays into the light buffers; with rec, also write down what was added (into _rec*: the cells, how much, and for the
// lit ones the distance, which the direction of the light needs)
function castLamp(L, ox, oy, cr, cg, cb, rec) {
  const RW = L_RW, RH = L_RH, r = L.r, gen = ++stampGen, cone = L.cos !== undefined, sumc = cr + cg + cb;
  let a0 = 0, span = 6.2832;
  if (cone) { const half = Math.acos(L.cos); a0 = Math.atan2(L.dy, L.dx) - half; span = 2 * half; }
  const nRays = Math.max(12, Math.ceil(r * span / .6)), skip = L.skip || 1.2, step = .6, soakLen = 2.6 * RES;
  _sL = L; _sCone = cone; _sR = r; _rec0 = _rec1 = 0;
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
        if (inWin && s === 1 && LSTAMP[kk] !== gen) {
          LSTAMP[kk] = gen; const f = 1 - depth / soakLen, a = entry * f * f * .75; LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a;
          if (rec) { _recI1[_rec1] = kk; _recA1[_rec1++] = a; }
        }
        continue;
      }
      if (inWin && s !== 1 && LSTAMP[kk] !== gen) {
        LSTAMP[kk] = gen; const a = lampShade(kk, cx, cy, s);
        if (a > 0) {
          LR[kk] += cr * a; LG[kk] += cg * a; LB[kk] += cb * a;
          const ux = L.x - cx - .5, uy = L.y - (cy + .5) * ASPECT, hh = _sD || 1, w = sumc * a / hh;
          LDX[kk] += ux * w; LDY[kk] += uy * w;
          if (rec) { _recI0[_rec0] = kk; _recA0[_rec0] = a; _recH0[_rec0++] = hh; }
        }
      }
      if (solid && L.shadow && t > skip) { if (!inWin || s === 1) break; depth = 0; entry = lampShade(kk, cx, cy, s); }
    }
  }
}
// ---------- visibility queries for gameplay ----------
// Positions are body coordinates (x in cells, y in units: cell row × ASPECT). Both read the world directly, so they work
// anywhere, not only in the lit window, and they ignore moving bodies (the lander, boulders): terrain and frozen chunks only.
const solidAt = (cx, cy) => cx >= 0 && cx < W && cy >= 0 && cy < H && cells[cy * W + cx] !== EMPTY;
// is the straight line from (x0, y0) to (x1, y1) free of terrain, ignoring the first `skip` units and the cell it ends in
function lineClear(x0, y0, x1, y1, skip) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  for (let t = skip; t < d - .7; t += .6) if (solidAt(Math.floor(x0 + dx / d * t), Math.floor((y0 + dy / d * t) / ASPECT))) return false;
  return true;
}
// does the sun reach this point? (false when there is no sun)
function sunAt(x, y) {
  if (!SUN_ON) return false;
  const reach = (y + 4 * ASPECT) / SUN_L[1];   // march toward the sun until above the world
  for (let t = .6; t < reach; t += .6) {
    const cx = Math.floor(x - SUN_L[0] * t), cy = Math.floor((y - SUN_L[1] * t) / ASPECT);
    if (cy < 0 || cx < 0) return true;   // rays that start left of the world or above it are clear, as in the sweep
    if (solidAt(cx, cy)) return false;
  }
  return true;
}
// how strongly does this light (an object like the ones GAME.lights pushes) reach the point? 0 = not at all; otherwise its
// intensity there: the same falloff, cone and shadows the lighting uses (no surface-angle term)
function isLitBy(L, x, y) {
  const ux = L.x - x, uy = L.y - y, d = Math.hypot(ux, uy), r = L.r;
  if (!(L.I > .01) || d >= r) return 0;
  let att;
  if (L.cos !== undefined) { const q = d / r; att = 1 - q * q; att *= att; if (d > .5) { const cd = -(ux * L.dx + uy * L.dy) / d; att = cd <= L.cos ? 0 : att * smooth(Math.min(1, (cd - L.cos) / (1 - L.cos) * 4)); } }
  else { att = 1 - d / r; att *= att; }
  if (att <= 0) return 0;
  if (L.shadow && d > .6 && !lineClear(L.x, L.y, x, y, Math.min(d - .6, L.skip || 1.2))) return 0;
  return att * L.I;
}
// ---------- flicker and pulse presets ----------
// A light (from GAME.lights or addLight) may carry flicker: 'candle' | 'fluorescent' | 'dying' | 'strobe' | 'alarm' | 'pulse' and a
// seed; its intensity is then multiplied by flickerAt(flicker, time, seed). The value is a pure function of time and seed, so a
// game can draw the lamp's own glyph, or buzz (Sfx.buzz), in step with its light, and lamps with different seeds don't blink
// together.
function flickerAt(kind, t, seed = 0) {
  const sd = seed * 7.31;
  switch (kind) {
    case 'candle': return .62 + .38 * fbm1(t * 5 + sd, 11, 3) + .06 * Math.sin(t * 31 + sd);
    case 'fluorescent': {   // steady, with a faint 100 Hz shimmer and the odd stutter
      const w = Math.floor(t * 14 + sd);
      return hash2(w, 3, seed) < .035 ? .2 + .4 * hash2(w, 4, seed) : .95 + .05 * Math.sin(t * 628);
    }
    case 'dying': {         // a tube on its way out: long dark spells, bursts of stuttering light
      const w = Math.floor(t * 11 + sd), bad = vnoise1(t * .45 + sd, 13 + seed);
      return hash2(w, 5, seed) < (bad > .5 ? .18 : .82) ? .75 + .25 * hash2(w, 6, seed) : .04;
    }
    case 'strobe': return ((t * 1.6 + sd) % 1) < .06 ? 1 : 0;
    case 'alarm': { const q = Math.max(0, Math.sin((t * .9 + sd) * 6.2832)); return .12 + .88 * q * q; }   // a turning beacon
    case 'pulse': return .55 + .45 * Math.sin((t * .5 + sd) * 6.2832);
    default: return 1;
  }
}

// cheap unshadowed glow for emissive things (flames, hot rock, crystals); rad in base cells
function splatLight(cx, cy, r, g, b, rad) {
  rad = Math.max(1, Math.round(rad * RES));
  const i0 = cx - L_OX, j0 = cy - L_OY, RW = L_RW, RH = L_RH, ry = Math.max(1, Math.round(rad / ASPECT));
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
