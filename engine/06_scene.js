// ===================== ENGINE · scene shading → pixels =====================
const FLAME_GLYPHS = Array.from('.:-=+*#%@', c => c.charCodeAt(0));
const tone = c => 1 - Math.exp(-c * 1.7);
// the same curve as a table, for the per-cell loops (light units 0..8 in steps of 1/512; brighter is white)
const TONE_LUT = Float32Array.from({ length: 4097 }, (_, i) => tone(i / 512));
const toneF = c => c <= 0 ? 0 : c >= 8 ? 1 : TONE_LUT[(c * 512) | 0];
const SOLID = 127;   // the cell code of a plain pixel (full colour)
// Pixel-art shading: the light on a material is cut into its few flat shades (MAT_SHADES, or the colours of its palette), each
// shown at its middle brightness, so even the darkest is not black. No dither: an evenly lit wall stays one flat colour.
// `step` moves the shade up or down (a lit top edge one brighter, an underside one darker); `tex` is the cell's own texture,
// applied after the cut so it only varies a shade a little and never flips a cell into the next one. Colours in and out are in
// light units; lr, lg, lb is the light on the cell, which tints a palette.
// the light-unit brightness of band `level` (0..n-1) of n, at its middle: SHADE_LIN[n * 17 + level]
const SHADE_LIN = Float32Array.from({ length: 17 * 17 }, (_, i) => { const n = (i / 17) | 0, l = i % 17; return n ? -Math.log(1 - Math.min(.97, (l + .5) / n)) / 1.7 : 0; });
function shadeCell(m, r, g, b, lr, lg, lb, tex, step, out) {
  const lum = .3 * r + .59 * g + .11 * b, E = EYE.e, t = toneF(lum * E), pal = MAT_PAL[m];
  if (pal) {
    const c = pal[clamp(Math.floor(t * pal.length) + step, 0, pal.length - 1)], lm = Math.max(lr, lg, lb, 1e-4), f = tex / E;
    out[0] = c[0] * (.5 + .5 * lr / lm) * f; out[1] = c[1] * (.5 + .5 * lg / lm) * f; out[2] = c[2] * (.5 + .5 * lb / lm) * f;
    return out;
  }
  const n = MAT_SHADES[m], f = lum > 1e-5 ? SHADE_LIN[n * 17 + clamp(Math.floor(t * n) + step, 0, n - 1)] / E / lum * tex : 0;
  out[0] = r * f; out[1] = g * f; out[2] = b * f;
  return out;
}
const texOf = v => .93 + (v & 31) / 31 * .14;   // a cell's texture from its random byte
const _shd = [0, 0, 0];
// Eye adaptation: the exposure eases toward what the scene calls for, measured each frame as the geometric mean brightness of
// the visible cells before tone mapping (so exposure cannot feed back into its own measurement). A dark scene brightens slowly
// (`up` seconds, like eyes in a cave), a bright one darkens quickly (`down`), so stepping from shadow into sun dazzles for a
// moment and a dark cave becomes readable. Off by default; the game turns it on with setEyeAdaptation.
const EYE = { s: 0, min: .55, max: 2.6, key: .15, up: 2.4, down: .6, e: 1, t: -1 };
// strength 0..1 (0 = off: exposure 1; 1 = the scene is held at brightness `key`); opts: { min, max, key, up, down } (see EYE)
function setEyeAdaptation(strength, opts) {
  Object.assign(EYE, opts); EYE.s = clamp(+strength || 0, 0, 1);
  if (EYE.s === 0) EYE.e = 1;
}
function adaptEye(G, n, time) {
  if (EYE.s <= 0) return;
  let sum = 0, cnt = 0;
  for (let k = 0; k < n; k += 5) if (G[k]) { sum += Math.log((cL[k] >= 0 ? cL[k] : .3 * cR[k] + .59 * cG[k] + .11 * cB[k]) + .03); cnt++; }
  const dt = EYE.t < 0 ? 0 : clamp(time - EYE.t, 0, .1); EYE.t = time;
  if (cnt < 12) return;                            // almost nothing on screen to judge by: keep what we have
  const target = clamp(Math.exp(EYE.s * Math.log(EYE.key / Math.max(.02, Math.exp(sum / cnt) - .03))), EYE.min, EYE.max);
  EYE.e += (target - EYE.e) * (1 - Math.exp(-dt / (target > EYE.e ? EYE.up : EYE.down)));
}
// cL: a shaded cell's brightness before it was cut into shades (which depend on the exposure, so the eye must not measure
// them); -1 where something drew its own colour
let cR, cG, cB, cL, vig;
// cells (dx, dy) toward the light from a back-wall cell, nearest first: a world cell there shades it
const BK_OFF = new Int16Array(64);
function backShadowOffsets() {
  const d = BACK.dir, l = Math.hypot(d[0], d[1]) || 1, reach = BACK.depth * RES;
  let n = 0, px = 0, py = 0;
  for (let t = .7; t <= reach && n < 32; t += .7) {
    const dx = Math.round(d[0] / l * t), dy = Math.round(d[1] / l * t / ASPECT);
    if ((dx || dy) && (dx !== px || dy !== py)) { BK_OFF[2 * n] = dx; BK_OFF[2 * n + 1] = dy; n++; px = dx; py = dy; }
  }
  return n;
}
const _fc = [0, 0, 0], _pc = [0, 0, 0];
// direction → line glyph: - \ | /
function slopeGlyph(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a += 180; return a < 22.5 || a >= 157.5 ? 45 : a < 67.5 ? 92 : a < 112.5 ? 124 : 47; }
function flameCol(t, out) {   // t: 1 = fresh/hot … 0 = spent
  if (t > .75) { const u = (t - .75) / .25; out[0] = 1; out[1] = .85 + .15 * u; out[2] = .45 + .5 * u; }
  else if (t > .45) { const u = (t - .45) / .3; out[0] = 1; out[1] = .45 + .4 * u; out[2] = .08 + .37 * u; }
  else if (t > .2) { const u = (t - .2) / .25; out[0] = .55 + .45 * u; out[1] = .12 + .33 * u; out[2] = .04 + .04 * u; }
  else { const u = t / .2; out[0] = .16 + .39 * u; out[1] = .06 + .06 * u; out[2] = .05; }
  return out;
}

// world-space writers used by games to draw their objects (cell coordinates; colours in light units)
function putEmit(cx, cy, code, r, g, b) {
  const i = cx - L_OX, j = cy - L_OY; if (i < 0 || j < 0 || i >= R.RW || j >= R.RH) return;
  const k = j * R.RW + i; R.wG[k] = code; cR[k] = r; cG[k] = g; cB[k] = b; cL[k] = -1; R.wZ[k] = 9;
}
function putLit(cx, cy, code, ar, ag, ab, floor = .1) {
  const i = cx - L_OX, j = cy - L_OY; if (i < 0 || j < 0 || i >= R.RW || j >= R.RH) return;
  const k = j * R.RW + i;
  R.wG[k] = code; cL[k] = -1; cR[k] = ar * Math.max(LR[k], floor); cG[k] = ag * Math.max(LG[k], floor); cB[k] = ab * Math.max(LB[k], floor * 1.2); R.wZ[k] = 9;
}
const lightAtCell = (cx, cy, out) => { const i = cx - L_OX, j = cy - L_OY; if (i < 0 || j < 0 || i >= R.RW || j >= R.RH) { out[0] = out[1] = out[2] = 0; return out; } const k = j * R.RW + i; out[0] = LR[k]; out[1] = LG[k]; out[2] = LB[k]; return out; };

// Steps 1 and 2 of a frame: emissive things pour light into the buffers, then every terrain cell is shaded. Nothing in it depends on what the frame draws on
// top, so a still frame can keep its outcome (the still-frame snapshot, below) and skip it. Returns how many of the cells follow the clock (crystals, glints).
function sceneTerrain(ox, oy, time, bkN, bp) {
  const RW = R.RW, RH = R.RH, G = R.wG, Z = R.wZ, SH = R.wShim;
  // 1) emissive particles and hot rock pour light into the buffers
  for (let p = 0; p < P.n; p++) {
    const t = P.t[p], ct = t >= PT_CUSTOM ? PTYPES[t - PT_CUSTOM] : null;
    if (ct ? !ct.light : t !== PT_GAS && t !== PT_FIRE && t !== PT_SPARK) continue;
    const cx = Math.floor(P.x[p]), cy = Math.floor(P.y[p] / ASPECT), i = cx - ox, j = cy - oy;
    if (i < 0 || j < 0 || i >= RW || j >= RH) continue;
    const life = 1 - P.age[p] / P.life[p];
    if (ct) { ct.light(p, cx, cy, life); continue; }
    flameCol(life, _fc);
    const k = (t === PT_SPARK ? .1 : .055 * life) / RES;   // more, smaller particles at fine detail
    splatLight(cx, cy, _fc[0] * k, _fc[1] * k, _fc[2] * k, t === PT_SPARK ? 2 : 3);
    if (t !== PT_SPARK) { const q = j * RW + i; SH[q] = Math.min(1, SH[q] + .25 * life); if (j > 0) SH[q - RW] = Math.min(1, SH[q - RW] + .2 * life); }
  }
  // per cell, so a hot or glowing area gives the same light at any detail and cell size (cells are ASPECT units tall)
  const hk = ASPECT / (2 * RES * RES), cmod = Math.max(3, Math.round(6 * RES * RES / ASPECT));
  for (let j = 0; j < RH; j++) {
    const cy = oy + j; if (cy < 0 || cy >= H) continue;
    for (let i = 0; i < RW; i++) {
      const cx = ox + i; if (cx < 0 || cx >= W) continue;
      const h = heat[cy * W + cx];
      if (h > .25) splatLight(cx, cy, h * .22 * hk, h * h * .07 * hk, 0, 2);
      else {   // emissive materials glow from scattered cells (and brighter on the beat)
        const mm = cells[cy * W + cx], gl = MAT_GLOWS[mm];
        if (gl && (cx * 7 + cy * 13) % cmod === 0) { const f = 1 + MAT_BEATGLOW[mm] * bp * 2; splatLight(cx, cy, gl[0] * f, gl[1] * f, gl[2] * f, gl[3]); }
      }
    }
  }

  // 2) terrain (empty cells stay code 0: transparent, so the sky layer shows through them)
  // (cells are read straight from the arrays inside the world: getC with its four bounds tests for every cell, and again for the
  // back wall's shadow search, was the bulk of this loop; occAt reads the occupancy the lighting built, which is getC !== EMPTY)
  let anim = 0;
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, cx = ox + i, cy = oy + j, inW = cx >= 0 && cx < W && cy >= 0 && cy < H, ci = inW ? cy * W + cx : -1;
    let m = inW ? cells[ci] : getC(cx, cy);
    const lr = LR[k], lg = LG[k], lb = LB[k];
    let glyph = 0, r = 0, g = 0, b = 0, raw = -1;
    if (m === EMPTY) {
      Z[k] = 0;   // particles and rings always draw over the back wall
      const bm = inW ? backCells[ci] : 0;
      if (bm) {   // the back wall: the light in the air in front of it, dimmer, with a drop shadow from the world cells
        let f = BACK.dim;
        for (let s = 0; s < bkN; s++) if (occAt(cx - BK_OFF[2 * s], cy - BK_OFF[2 * s + 1])) { f *= 1 - BACK.shadow * (1 - s / bkN); break; }
        const alb = MAT_ALB[bm];
        // a mast-style back wall (girders) shows its joints one shade brighter
        const joint = MAT_STYLE[bm] === 2 && (getBack(cx, cy - 1) === bm || getBack(cx, cy + 1) === bm) && (getBack(cx - 1, cy) === bm || getBack(cx + 1, cy) === bm);
        raw = (.3 * alb[0] * lr + .59 * alb[1] * lg + .11 * alb[2] * lb) * f;
        shadeCell(bm, alb[0] * lr * f, alb[1] * lg * f, alb[2] * lb * f, lr, lg, lb, texOf(vari[ci]), joint ? 1 : 0, _shd);
        r = _shd[0]; g = _shd[1]; b = _shd[2]; glyph = SOLID;
      }
    } else {
      if (MAT_STYLE[m] === 2 && LSURF[k] === 1) {   // buried mast footings look like the ground they're in
        const a = getC(cx - 1, cy), c = getC(cx + 1, cy), d = getC(cx, cy + 1), ok = q => q !== EMPTY && MAT_STYLE[q] !== 2;
        m = ok(a) ? a : ok(c) ? c : ok(d) ? d : m;
      }
      const alb = MAT_ALB[m], v = inW ? vari[ci] : 77, h = inW ? heat[ci] : 0, s = LSURF[k], st = MAT_STYLE[m];
      if (st === 3 || (MAT_SHINY[m] > 0 && s === 2)) anim++;   // crystals and glints look different from one moment to the next
      if (s === 1) { const fl = .1 + .13 * LAOD[k]; r = alb[0] * Math.max(lr, fl); g = alb[1] * Math.max(lg, fl); b = alb[2] * Math.max(lb, fl * 1.25); }
      else { r = alb[0] * lr; g = alb[1] * lg; b = alb[2] * lb; }
      if (h > .02) { r += h * 1.35; g += h * h * .6; b += h * h * h * .3; }
      if (bp > 0 && MAT_BEATGLOW[m]) { const q = MAT_BEATGLOW[m] * bp * .9; r += alb[0] * q; g += alb[1] * q; b += alb[2] * q; }   // flashes in its own colour on the beat
      // the shade step: deck tops and lit surfaces facing up get a bright edge, undersides a dark one; girder joints and
      // twinkling crystal facets one brighter
      let step = 0;
      if (st === 2) step = (getC(cx, cy - 1) === m || getC(cx, cy + 1) === m) && (getC(cx - 1, cy) === m || getC(cx + 1, cy) === m) ? 1 : 0;
      else if (st === 3) { const p = .6 + .4 * Math.sin(time * 3 + v), pc = MAT_PULSE[m]; step = ((time * 2 + v * .1) | 0) & 1; r += pc[0] * p; g += pc[1] * p; b += pc[2] * p; }
      else if (s === 2 && st !== 4) step = LNY[k] < -.5 ? (lr + lg + lb > .3 ? 1 : 0) : LNY[k] > .55 ? -1 : 0;
      raw = .3 * r + .59 * g + .11 * b;   // also the occlusion key particles test against: free of the exposure, like theirs
      shadeCell(m, r, g, b, lr, lg, lb, texOf(v), step, _shd);
      r = _shd[0]; g = _shd[1]; b = _shd[2]; glyph = SOLID;
      if (MAT_SHINY[m] > 0 && s === 2 && (LSUN[k] || raw > .85) && hash2(cx, cy, (time * 2.5) | 0) < MAT_SHINY[m] * .07) r = g = b = 1.7;
      Z[k] = raw;
    }
    G[k] = glyph; cR[k] = r; cG[k] = g; cB[k] = b; cL[k] = raw;
  }
  return anim;
}

// ---------- the still-frame snapshot (04_light.js, stillPlan): the terrain pass's outcome, kept ----------
// What steps 1 and 2 leave behind: the scene buffers (glyph, depth, colour, brightness) and the light buffers after the glow of hot and glowing things. A
// still frame copies them back. Not kept while the window holds crystals or glints: they follow the clock, so the pass has to be made again.
const T = { n: 0, G: null, Z: null, R: null, Gc: null, B: null, L: null, LR: null, LG: null, LB: null };
function stillSave() {
  const n = R.RW * R.RH;
  if (T.n !== n) { T.n = n; T.G = new Uint8Array(n); for (const k of ['Z', 'R', 'Gc', 'B', 'L', 'LR', 'LG', 'LB']) T[k] = new Float32Array(n); }
  T.G.set(R.wG); T.Z.set(R.wZ); T.R.set(cR); T.Gc.set(cG); T.B.set(cB); T.L.set(cL); T.LR.set(LR); T.LG.set(LG); T.LB.set(LB);
  stillSavedTerrain();
}
function stillRestore() { R.wG.set(T.G); R.wZ.set(T.Z); cR.set(T.R); cG.set(T.Gc); cB.set(T.B); cL.set(T.L); LR.set(T.LR); LG.set(T.LG); LB.set(T.LB); }
// audit: the snapshot must equal what the full pass just made
function stillCompare() {
  if (T.n !== R.RW * R.RH) return;
  for (let k = 0; k < T.n; k++) {
    if (T.G[k] !== R.wG[k] || T.Z[k] !== R.wZ[k] || T.R[k] !== cR[k] || T.Gc[k] !== cG[k] || T.B[k] !== cB[k] || T.L[k] !== cL[k] || T.LR[k] !== LR[k] || T.LG[k] !== LG[k] || T.LB[k] !== LB[k]) {
      CACHE.bad++; STILL.tHave = false; console.warn('the still-frame terrain was stale (cell ' + k + '): something it depends on changed without the engine hearing of it (engine/API.md, Performance)'); return;
    }
  }
}

function renderScene(ox, oy, time, drawExtras) {
  const RW = R.RW, RH = R.RH, n = RW * RH, G = R.wG, Z = R.wZ, SH = R.wShim;
  if (!cR || cR.length !== n) {
    cR = new Float32Array(n); cG = new Float32Array(n); cB = new Float32Array(n); cL = new Float32Array(n); vig = new Float32Array(n);
    STILL.tHave = false;
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) { const u = i / RW * 2 - 1, v = j / RH * 2 - 1; vig[j * RW + i] = 1 - .42 * (u * u * .55 + v * v * .8); }
  }
  SH.fill(0);
  const bkN = backShadowOffsets();
  Beat.step(time);
  const bp = Beat.pulse();   // 0..1: how hard the music is hitting right now (0 when the pulse is off)
  if (STILL.terrain && !CACHE.audit) stillRestore();
  else {
    const anim = sceneTerrain(ox, oy, time, bkN, bp);
    if (STILL.terrain) stillCompare();   // (audit: the snapshot must equal what was just made)
    if (STILL.snapTerrain && !anim) stillSave();
  }

  // 3) particles, lit by the same buffers
  for (let p = 0; p < P.n; p++) {
    const cx = Math.floor(P.x[p]), cy = Math.floor(P.y[p] / ASPECT), i = cx - ox, j = cy - oy;
    if (i < 0 || j < 0 || i >= RW || j >= RH) continue;
    const k = j * RW + i; if (LSURF[k] !== 0) continue;
    const t = P.t[p], life = 1 - P.age[p] / P.life[p];
    let r, g, b, glyph = P.g[p];
    if (t === PT_GAS || t === PT_FIRE) {
      flameCol(life, _fc); const I = .5 + 1.3 * life;
      r = _fc[0] * I; g = _fc[1] * I; b = _fc[2] * I;
      glyph = FLAME_GLYPHS[clamp((life * 9.5 + (P.s[p] & 3) * .3) | 0, 0, 8)];
      if (t === PT_FIRE && life < .22) { const q = .3 + LR[k] * .3; r = g = b = q * .5; glyph = 111; }
    } else if (t === PT_SPARK) { const I = .5 + life * 1.4; r = I; g = .82 * I; b = .45 * I; }
    else if (t >= PT_CUSTOM && PTYPES[t - PT_CUSTOM].look) { glyph = PTYPES[t - PT_CUSTOM].look(p, k, life, time, _pc); r = _pc[0]; g = _pc[1]; b = _pc[2]; }
    else if (t === PT_SMOKE || t === PT_VAPOR) {
      const f = Math.min(1, life * 2.2), base = t === PT_VAPOR ? [.7, .9, 1] : [.42, .4, .38];
      r = base[0] * (LR[k] * .8 + .12) * f; g = base[1] * (LG[k] * .8 + .12) * f; b = base[2] * (LB[k] * .8 + .14) * f;
    } else if (t === PT_WRECK) {
      const hot = Math.max(0, 1 - P.age[p] / 3);
      r = .8 * Math.max(LR[k], .08) + hot * 1.2; g = .75 * Math.max(LG[k], .08) + hot * .4; b = .6 * Math.max(LB[k], .1);
    } else {   // grains, debris, dust: their own albedo under scene light
      const a = MAT_ALB[P.m[p]] || MAT_ALB[0], f = t === PT_DUST ? Math.min(1, life * 1.6) * .8 : 1.05;
      r = a[0] * LR[k] * f; g = a[1] * LG[k] * f; b = a[2] * LB[k] * f;
      if (r + g + b < .06) continue;
    }
    const lum = .3 * r + .59 * g + .11 * b;
    if (Z[k] > 0 && lum < Z[k]) continue;
    G[k] = glyph; cR[k] = r; cG[k] = g; cB[k] = b; cL[k] = -1; Z[k] = lum;
  }

  // 4) falling chunks, then the game's own objects
  drawChunks();
  if (drawExtras) { const q = performance.now(); drawExtras(); PERF.gd = performance.now() - q; }

  // 5) shock rings and floating text
  const band = 1.3 * Math.sqrt(RES);
  for (const rg of FX.rings) {
    const u = rg.age / rg.life, rad = rg.max * (1 - (1 - u) * (1 - u)), fade = (1 - u) * 1.4;
    const cy0 = Math.floor((rg.y - rad - 2) / ASPECT), cy1 = Math.floor((rg.y + rad + 2) / ASPECT);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = Math.floor(rg.x - rad - 2); cx <= rg.x + rad + 2; cx++) {
      const i = cx - ox, j = cy - oy; if (i < 0 || j < 0 || i >= RW || j >= RH) continue;
      const k = j * RW + i; if (LSURF[k] !== 0) continue;
      const d = Math.abs(Math.hypot(cx + .5 - rg.x, (cy + .5) * ASPECT - rg.y) - rad); if (d > band) continue;
      const q = fade * (1 - d / band);
      if (q * 1.2 < Z[k]) continue;
      G[k] = q > .7 ? 79 : q > .35 ? 111 : 46; cR[k] = rg.c[0] * q; cG[k] = rg.c[1] * q; cB[k] = rg.c[2] * q; cL[k] = -1; Z[k] = q;
    }
  }

  // 6) tone map + vignette → bytes (alpha: is anything in the cell; and the optional bloom bright-pass)
  const qt = performance.now();
  adaptEye(G, n, time);
  const D = R.wPix, BL = R.bloomPix, bloom = R.bloom, E = EYE.e;
  const bt = .62 - .1 * bp, bg = 460 * (1 + 1.2 * bp);   // the bloom bright-pass: on a drum hit its threshold drops and its gain rises
  for (let k = 0; k < n; k++) {
    const code = G[k], vv = vig[k] * INK[code], q = k * 4;
    let r = toneF(cR[k] * E) * vv, g = toneF(cG[k] * E) * vv, b = toneF(cB[k] * E) * vv;
    if (code === 32) { r = BG[0] / 255; g = BG[1] / 255; b = BG[2] / 255; }   // a filled cell of plain background
    D[q] = r * 255; D[q + 1] = g * 255; D[q + 2] = b * 255; D[q + 3] = code ? 255 : 0;
    if (bloom) { const on = code > 32; BL[q] = on ? Math.max(0, r - bt) * bg : 0; BL[q + 1] = on ? Math.max(0, g - bt) * bg : 0; BL[q + 2] = on ? Math.max(0, b - bt) * bg : 0; BL[q + 3] = 255; }
  }
  perfAdd('tone', performance.now() - qt);   // (a part of `scene`: the last pass over every cell, which P4 would move to the GPU)
  renderSky(time);
}

// ---------- sky: stars and the game's sky bodies on their own layer ----------
// Both are effectively at infinity, so they barely move: the layer drifts at a twentieth of the
// camera's speed, with its own sub-cell offset so it glides instead of stepping a cell at a time.
// It is rebuilt only when it has scrolled by a whole cell (or, once a second, for turning planets).
// Games paint their own bodies with GAME.skyBegin(ox, oy, time) (once per rebuild) and
// GAME.sky(i, j, out) → glyph code (0 = nothing here, stars may show; -1 = dark body, hides the
// stars; out = [r, g, b] in light units).
// GAME.stars sets the star density (default 1, 0 = none).
// Stars twinkle only in an atmosphere (setAtmosphere; never in a vacuum) and are dimmed by the light of nearby lamps and flashes
// (read from the frame's light buffer, minus the sun and ambient): GAME.starGlare scales that (default 1, 0 = off). Either makes
// the layer rebuild a few times a second instead of once.
const SKY_PAR = .05;
let skyKey = '';
function renderSky(time) {
  const RW = R.RW, RH = R.RH, sx = cam.x * SKY_PAR, sy = cam.y / ASPECT * SKY_PAR, ix = Math.floor(sx), iy = Math.floor(sy);
  R.skyFX = sx - ix; R.skyFY = sy - iy;
  const air = Math.min(1, ATMOS), glare = LR && LR.length === RW * RH ? GAME.starGlare ?? 1 : 0, E = EYE.e;
  const busy = glare > 0 && (L_NLIGHTS > 0 || FX.flash > .03), step = air > 0 ? (time * 8) | 0 : busy ? (time * 5) | 0 : time | 0;
  const ox = ix - 1, oy = iy - 1, key = `${ox},${oy},${RW},${RH},${step},${Math.round(E * 24)}`;
  if (key === skyKey) return;
  skyKey = key; R.skyDirty = true;
  const SG = R.sG, D = R.sPix, paint = GAME.sky, starP = .0055 * ASPECT * (GAME.stars ?? 1) / (RES * RES);
  if (paint && GAME.skyBegin) GAME.skyBegin(ox, oy, time);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, q = k * 4; let glyph = 0, r = 0, g = 0, b = 0;
    if (paint && (glyph = paint(i, j, _pc)) !== 0) { if (glyph < 0) glyph = 0; else { r = _pc[0]; g = _pc[1]; b = _pc[2]; } }
    else if (hash2(ox + i, oy + j, 5) < starP) {   // stars: steady in a vacuum
      const bb = hash2(ox + i, oy + j, 6), tint = hash2(ox + i, oy + j, 8); glyph = bb > .93 ? 42 : bb > .7 ? 43 : 46;
      r = .45 + .4 * bb + tint * .1; g = .45 + .4 * bb; b = .5 + .4 * bb + (1 - tint) * .12;
      let f = 1;
      if (air > 0) f -= .6 * air * (.5 + .5 * Math.sin(time * (4 + 7 * hash2(ox + i, oy + j, 11)) + 6.283 * hash2(ox + i, oy + j, 12)));   // scintillation
      if (glare > 0 && LSURF[k] === 0) {   // light pollution: what the lights and flashes add over sun and ambient
        const su = LSUN[k], base = .3 * (AMB_C[0] * .7 + su * SUN_C[0]) + .59 * (AMB_C[1] * .7 + su * SUN_C[1]) + .11 * (AMB_C[2] * .7 + su * SUN_C[2]);
        f /= 1 + glare * 3.5 * Math.max(0, .3 * LR[k] + .59 * LG[k] + .11 * LB[k] - base);
      }
      r *= f; g *= f; b *= f;
      if (f < .5) glyph = 46;              // a faint star shrinks to a dot
    }
    const vv = vig[k] * INK[glyph];
    SG[k] = glyph; D[q] = toneF(r * E) * vv * 255; D[q + 1] = toneF(g * E) * vv * 255; D[q + 2] = toneF(b * E) * vv * 255; D[q + 3] = glyph > 32 ? 255 : 0;
  }
}
