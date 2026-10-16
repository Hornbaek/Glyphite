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

let L_NLIGHTS = 0;
function computeLighting(ox, oy, lights, dynTop) {
  L_OX = ox; L_OY = oy; L_NLIGHTS = lights.length;
  const RW = L_RW, RH = L_RH, OW = LOW, OH = LOH, B = LBOX;
  // 1) occupancy + summed-area table
  for (let j = 0; j < OH; j++) { const cy = oy - LMY + j; for (let i = 0; i < OW; i++) LOCC[j * OW + i] = getC(ox - LMX + i, cy) !== EMPTY ? 1 : 0; }
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
