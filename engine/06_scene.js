// ===================== ENGINE · scene shading → glyphs =====================
const FLAME_GLYPHS = Array.from('.:-=+*#%@', c => c.charCodeAt(0));
const tone = c => 1 - Math.exp(-c * 1.7);
let cR, cG, cB, vig;
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
  const k = j * R.RW + i; R.wG[k] = code; cR[k] = r; cG[k] = g; cB[k] = b; R.wZ[k] = 9;
}
function putLit(cx, cy, code, ar, ag, ab, floor = .1) {
  const i = cx - L_OX, j = cy - L_OY; if (i < 0 || j < 0 || i >= R.RW || j >= R.RH) return;
  const k = j * R.RW + i;
  R.wG[k] = code; cR[k] = ar * Math.max(LR[k], floor); cG[k] = ag * Math.max(LG[k], floor); cB[k] = ab * Math.max(LB[k], floor * 1.2); R.wZ[k] = 9;
}
const lightAtCell = (cx, cy, out) => { const i = cx - L_OX, j = cy - L_OY; if (i < 0 || j < 0 || i >= R.RW || j >= R.RH) { out[0] = out[1] = out[2] = 0; return out; } const k = j * R.RW + i; out[0] = LR[k]; out[1] = LG[k]; out[2] = LB[k]; return out; };

function renderScene(ox, oy, time, drawExtras) {
  const RW = R.RW, RH = R.RH, n = RW * RH, G = R.wG, Z = R.wZ, SH = R.wShim;
  if (!cR || cR.length !== n) {
    cR = new Float32Array(n); cG = new Float32Array(n); cB = new Float32Array(n); vig = new Float32Array(n);
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) { const u = i / RW * 2 - 1, v = j / RH * 2 - 1; vig[j * RW + i] = 1 - .42 * (u * u * .55 + v * v * .8); }
  }
  SH.fill(0);
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
  const hk = 1 / (RES * RES), cmod = Math.max(3, Math.round(3 * RES * RES));
  for (let j = 0; j < RH; j++) {
    const cy = oy + j; if (cy < 0 || cy >= H) continue;
    for (let i = 0; i < RW; i++) {
      const cx = ox + i; if (cx < 0 || cx >= W) continue;
      const h = heat[cy * W + cx];
      if (h > .25) splatLight(cx, cy, h * .22 * hk, h * h * .07 * hk, 0, 2);
      else { const gl = MAT_GLOWS[cells[cy * W + cx]]; if (gl && (cx * 7 + cy * 13) % cmod === 0) splatLight(cx, cy, gl[0], gl[1], gl[2], gl[3]); }   // emissive materials glow from scattered cells
    }
  }

  // 2) terrain (empty cells stay glyph 0: transparent, so the sky layer shows through them)
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, cx = ox + i, cy = oy + j; let m = getC(cx, cy);
    const lr = LR[k], lg = LG[k], lb = LB[k];
    let glyph = 0, r = 0, g = 0, b = 0;
    if (m === EMPTY) Z[k] = 0;
    else {
      if (MAT_STYLE[m] === 2 && LSURF[k] === 1) {   // buried mast footings look like the ground they're in
        const a = getC(cx - 1, cy), c = getC(cx + 1, cy), d = getC(cx, cy + 1), ok = q => q !== EMPTY && MAT_STYLE[q] !== 2;
        m = ok(a) ? a : ok(c) ? c : ok(d) ? d : m;
      }
      const inW = cx >= 0 && cx < W && cy >= 0 && cy < H, ci = inW ? cy * W + cx : -1;
      const alb = MAT_ALB[m], v = inW ? vari[ci] : 77, h = inW ? heat[ci] : 0, s = LSURF[k], st = MAT_STYLE[m];
      if (s === 1) { const fl = .1 + .13 * LAOD[k]; r = alb[0] * Math.max(lr, fl); g = alb[1] * Math.max(lg, fl); b = alb[2] * Math.max(lb, fl * 1.25); }
      else { r = alb[0] * lr; g = alb[1] * lg; b = alb[2] * lb; }
      const tv = .86 + (v & 31) / 31 * .28; r *= tv; g *= tv; b *= tv;
      if (h > .02) { r += h * 1.35; g += h * h * .6; b += h * h * h * .3; }
      const lum = .3 * r + .59 * g + .11 * b, ramp = RAMP_CODES[m], rl = ramp.length;
      if (st === 1) glyph = s === 2 && LNY[k] < -.5 ? (lum < .16 ? 45 : 61) : (v & 1 ? 35 : 72);   // deck: = - on top, # H in the body
      else if (st === 2) { const vt = getC(cx, cy - 1) === m || getC(cx, cy + 1) === m, hz = getC(cx - 1, cy) === m || getC(cx + 1, cy) === m; glyph = vt && hz ? 43 : hz ? 61 : 124; }
      else if (st === 3) { const p = .6 + .4 * Math.sin(time * 3 + v), pc = MAT_PULSE[m]; glyph = ((time * 2 + v * .1) | 0) & 1 ? 42 : 43; r += pc[0] * p; g += pc[1] * p; b += pc[2] * p; }
      else if (s === 2 && st !== 4) {
        const nx = LNX[k], ny = LNY[k];
        if (ny < -.8) glyph = ramp[clamp((lum * rl * 1.2 + (v & 7) / 8) | 0, 2, rl - 1)];
        else if (ny > .55) glyph = 126;
        else if (Math.abs(ny) < .36) glyph = 124;
        else glyph = nx < 0 ? 47 : 92;
      } else glyph = ramp[clamp((lum * rl * 1.2 + ((v & 15) / 15 - .5) * .9) | 0, 1, rl - 1)];
      if (MAT_SHINY[m] > 0 && s === 2 && (LSUN[k] || lum > .85) && hash2(cx, cy, (time * 2.5) | 0) < MAT_SHINY[m] * .07) { glyph = 42; r = g = b = 1.7; }
      Z[k] = lum;
    }
    G[k] = glyph; cR[k] = r; cG[k] = g; cB[k] = b;
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
    G[k] = glyph; cR[k] = r; cG[k] = g; cB[k] = b; Z[k] = lum;
  }

  // 4) falling chunks, then the game's own objects
  drawChunks();
  if (drawExtras) drawExtras();

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
      G[k] = q > .7 ? 79 : q > .35 ? 111 : 46; cR[k] = rg.c[0] * q; cG[k] = rg.c[1] * q; cB[k] = rg.c[2] * q; Z[k] = q;
    }
  }

  // 6) tone map + vignette → bytes (and optional bloom bright-pass)
  const D = R.wPix, BL = R.bloomPix, bloom = R.bloom, glA = R.mode === 'gl', OC = R.occPix;
  for (let k = 0; k < n; k++) {
    const vv = vig[k], r = tone(cR[k]) * vv, g = tone(cG[k]) * vv, b = tone(cB[k]) * vv, q = k * 4;
    D[q] = r * 255; D[q + 1] = g * 255; D[q + 2] = b * 255; D[q + 3] = glA ? G[k] : 255;   // GL reads the glyph code from alpha
    if (!glA) { OC[q] = 5; OC[q + 1] = 7; OC[q + 2] = 12; OC[q + 3] = G[k] ? 255 : 0; }  // 2D: occupied cells are opaque
    if (bloom) { const on = G[k] > 32; BL[q] = on ? Math.max(0, r - .62) * 460 : 0; BL[q + 1] = on ? Math.max(0, g - .62) * 460 : 0; BL[q + 2] = on ? Math.max(0, b - .62) * 460 : 0; BL[q + 3] = 255; }
  }
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
const SKY_PAR = .05;
let skyKey = '';
function renderSky(time) {
  const RW = R.RW, RH = R.RH, sx = cam.x * SKY_PAR, sy = cam.y / ASPECT * SKY_PAR, ix = Math.floor(sx), iy = Math.floor(sy);
  R.skyFX = sx - ix; R.skyFY = sy - iy;
  const ox = ix - 1, oy = iy - 1, key = `${ox},${oy},${RW},${RH},${time | 0}`;
  if (key === skyKey) return;
  skyKey = key; R.skyDirty = true;
  const SG = R.sG, D = R.sPix, glA = R.mode === 'gl', paint = GAME.sky, starP = .011 * (GAME.stars ?? 1) / (RES * RES);
  if (paint && GAME.skyBegin) GAME.skyBegin(ox, oy, time);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, q = k * 4; let glyph = 0, r = 0, g = 0, b = 0;
    if (paint && (glyph = paint(i, j, _pc)) !== 0) { if (glyph < 0) glyph = 0; else { r = _pc[0]; g = _pc[1]; b = _pc[2]; } }
    else if (hash2(ox + i, oy + j, 5) < starP) {   // stars: steady, no air to twinkle
      const bb = hash2(ox + i, oy + j, 6), tint = hash2(ox + i, oy + j, 8); glyph = bb > .93 ? 42 : bb > .7 ? 43 : 46;
      r = .45 + .4 * bb + tint * .1; g = .45 + .4 * bb; b = .5 + .4 * bb + (1 - tint) * .12;
    }
    const vv = vig[k];
    SG[k] = glyph; D[q] = tone(r) * vv * 255; D[q + 1] = tone(g) * vv * 255; D[q + 2] = tone(b) * vv * 255; D[q + 3] = glA ? glyph : 255;
  }
}
