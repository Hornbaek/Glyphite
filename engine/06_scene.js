// ===================== ENGINE · scene shading → pixels =====================
const FLAME_GLYPHS = Array.from('.:-=+*#%@', c => c.charCodeAt(0));
const tone = c => 1 - Math.exp(-c * 1.7);
// the same curve as a table, for the per-cell loops (light units 0..8 in steps of 1/512; brighter is white)
const TONE_LUT = Float32Array.from({ length: 4097 }, (_, i) => tone(i / 512));
const toneF = c => c <= 0 ? 0 : c >= 8 ? 1 : TONE_LUT[(c * 512) | 0];
const SOLID = 127;   // the cell code of a plain pixel (full colour)

// ---------- the screen look a game chooses: setPost({ vignette, bloom, palette, dither, scanlines }) (E6) ----------
// Colours are continuous (banded per material, then tinted by lamps), so a frame holds thousands of them. A `palette` locks the world, the backdrops and the
// sky to a few colours, so a game looks like one hand-made picture (and ties in with the art pipeline's master palette); the HUD keeps its own colours so text
// stays readable. It works on the bytes the renderers are handed, so 2D and WebGL agree. Everything is off or as it always was until a game asks:
//   vignette   0..1, how much the corners darken (default .42, the old fixed value)
//   bloom      false switches the glow off for this game whatever the player chose (the player's own setting can still switch it off)
//   palette    null, or 2..255 colours ('#rrggbb', '#rgb' or [r, g, b] in bytes): every world pixel becomes the nearest one. Put the background colour (setBackground) in it
//   dither     0..1, an ordered (Bayer) dither before the palette picks, so a gradient becomes a pattern instead of bands; anchored to world cells, it does not swim
//   scanlines  0..1, a thin dark line along the bottom of every cell row, fixed on the screen, over everything but the HUD
const POST = { vignette: .42, bloom: true, palette: null, dither: 0, scanlines: 0, rev: 0 };
let POST_PAL = null, POST_N = 0, POST_LUT = null;
const POST_BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + .5) / 16 - .5);
function postColour(c) {
  if (typeof c === 'string') {
    const h = c.replace('#', ''), f = h.length === 3 ? [...h].map(x => x + x) : h.match(/../g);
    if (!f || f.length !== 3 || f.some(x => !/^[0-9a-f]{2}$/i.test(x))) throw new Error(`setPost: palette colour '${c}' is not '#rrggbb'`);
    return f.map(x => parseInt(x, 16));
  }
  if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(Number.isFinite)) return c.slice(0, 3).map(v => clamp(Math.round(v), 0, 255));
  throw new Error('setPost: a palette colour is "#rrggbb" or [r, g, b] (0..255)');
}
function setPost(o = {}) {
  devKeys('setPost', o, ['vignette', 'bloom', 'palette', 'dither', 'scanlines']);
  const num = (k, lo, hi) => { if (k in o) { devFinite('setPost ' + k, +o[k]); POST[k] = clamp(Number.isFinite(+o[k]) ? +o[k] : 0, lo, hi); } };
  num('vignette', 0, 1); num('dither', 0, 1); num('scanlines', 0, 1);
  if ('bloom' in o) { POST.bloom = !!o.bloom; R.bloom = SETTINGS.bloom && POST.bloom; }
  if ('palette' in o) {
    if (o.palette === null || o.palette === undefined) { POST.palette = null; POST_PAL = null; POST_LUT = null; POST_N = 0; }
    else {
      if (!Array.isArray(o.palette) || o.palette.length < 2 || o.palette.length > 255) throw new Error('setPost: a palette is 2 to 255 colours');
      const cols = o.palette.map(postColour); POST.palette = cols; POST_N = cols.length;
      POST_PAL = new Uint8Array(POST_N * 3); cols.forEach((c, i) => POST_PAL.set(c, i * 3));
      POST_LUT = new Uint8Array(1 << 18).fill(255);   // the palette index for every colour at 6 bits a channel, found the first time it is asked for
    }
  }
  POST.rev++;   // the sky and the backdrops are cached, and keep their own copy of the look: rebuild them
}
const getPost = () => ({ vignette: POST.vignette, bloom: POST.bloom, palette: POST.palette && POST.palette.map(c => c.slice()), dither: POST.dither, scanlines: POST.scanlines });
// the palette entry nearest to a colour (bytes): the distance is the "redmean" one, which follows the eye better than plain RGB
function postIndex(r, g, b) {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2), had = POST_LUT[key];
  if (had !== 255) return had;
  const cr = (r & 252) + 2, cg = (g & 252) + 2, cb = (b & 252) + 2; let best = 0, bd = 1e9;
  for (let i = 0; i < POST_N; i++) {
    const pr = POST_PAL[i * 3], dr = cr - pr, dg = cg - POST_PAL[i * 3 + 1], db = cb - POST_PAL[i * 3 + 2], m = (cr + pr) / 512;
    const d = (2 + m) * dr * dr + 4 * dg * dg + (3 - m) * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return POST_LUT[key] = best;
}
// lock a finished pixel buffer (RW wide) to the palette; ox, oy: the world cell its top-left pixel shows, which the dither is anchored to
function postLock(D, RW, n, ox, oy) {
  const dith = POST.dither * 64;
  for (let k = 0, q = 0; k < n; k++, q += 4) {
    if (!D[q + 3]) continue;   // nothing here: the layer behind shows
    let r = D[q], g = D[q + 1], b = D[q + 2];
    if (dith) {
      const o = POST_BAYER[(((k / RW | 0) + oy) & 3) * 4 + (((k % RW) + ox) & 3)] * dith;
      r = clamp(Math.round(r + o), 0, 255); g = clamp(Math.round(g + o), 0, 255); b = clamp(Math.round(b + o), 0, 255);
    }
    const p = postIndex(r, g, b) * 3; D[q] = POST_PAL[p]; D[q + 1] = POST_PAL[p + 1]; D[q + 2] = POST_PAL[p + 2];
  }
}
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
let cR, cG, cB, cL, vig, vigK = -1;
// cells (dx, dy) toward the light from a back-wall cell, nearest first: a world cell there shades it
const BK_OFF = new Int16Array(64), BK_D = [0, 0];
function backShadowOffsets() {
  const d = BACK.dir, l = Math.hypot(d[0], d[1]) || 1, reach = BACK.depth * RES;
  let n = 0, px = 0, py = 0;
  BK_D[0] = d[0] / l; BK_D[1] = d[1] / l;
  for (let t = .7; t <= reach && n < 32; t += .7) {
    const dx = Math.round(d[0] / l * t), dy = Math.round(d[1] / l * t / ASPECT);
    if ((dx || dy) && (dx !== px || dy !== py)) { BK_OFF[2 * n] = dx; BK_OFF[2 * n + 1] = dy; n++; px = dx; py = dy; }
  }
  if (BACK.lamps) backShadowTable();
  return n;
}
// setBackdrop({ lamps: true }): the drop shadow of the back wall falls away from the lamps that light each cell instead of one way for the whole screen. The cells toward a
// light, nearest first, are looked up in a table of BK_DIRS directions (the same steps backShadowOffsets takes, rebuilt when the depth, RES or aspect change); the direction at a
// cell is the lamps' (LDX, LDY: toward the lights, weighted by what each gives) blended with BACK.dir by how strongly the lamps light it, mag / (mag + .3), so the shadow turns
// smoothly and a cell no lamp reaches keeps the fixed direction (the sun does not turn it: the back wall is a few cells behind the world, lit as if from the screen's upper left).
const BK_DIRS = 32, BK_TAB = new Int16Array(BK_DIRS * 64), BK_CNT = new Uint8Array(BK_DIRS);
let _bkKey = '';
function backShadowTable() {
  const key = `${BACK.depth},${RES},${ASPECT}`; if (key === _bkKey) return; _bkKey = key;
  const reach = BACK.depth * RES;
  for (let q = 0; q < BK_DIRS; q++) {
    const a = q * 2 * Math.PI / BK_DIRS - Math.PI, ux = Math.cos(a), uy = Math.sin(a), o = q * 64;
    let n = 0, px = 0, py = 0;
    for (let t = .7; t <= reach && n < 32; t += .7) {
      const dx = Math.round(ux * t), dy = Math.round(uy * t / ASPECT);
      if ((dx || dy) && (dx !== px || dy !== py)) { BK_TAB[o + 2 * n] = dx; BK_TAB[o + 2 * n + 1] = dy; n++; px = dx; py = dy; }
    }
    BK_CNT[q] = n;
  }
}
// the share of its light a back-wall cell keeps under the drop shadow of the world cells toward the lamps that light it (1 = none)
function backShadowLamp(cx, cy, lx, ly, mag) {
  const m = mag / (mag + .3), vx = -BK_D[0] * (1 - m) + lx / mag * m, vy = -BK_D[1] * (1 - m) + ly / mag * m;   // toward the light: the opposite of the way shadows fall
  const q = (((Math.atan2(vy, vx) + Math.PI) * (BK_DIRS / (2 * Math.PI)) + .5) | 0) % BK_DIRS, n = BK_CNT[q], o = q * 64;
  for (let s = 0; s < n; s++) if (MAT_SOLID[getC(cx + BK_TAB[o + 2 * s], cy + BK_TAB[o + 2 * s + 1])]) return 1 - BACK.shadow * (1 - s / n);
  return 1;
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
  // glowing sprite pixels, as drawSprite recorded them last frame (10_sprite.js, EMIT)
  for (let q = 0, E = EMIT.b; q < E.length; q += 6) splatLight(E[q], E[q + 1], E[q + 2], E[q + 3], E[q + 4], E[q + 5]);
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
  // (the cell itself is read straight from the array inside the world. The back wall's shadow search stays on getC: reading the lighting's occupancy
  // buffer through occAt instead measured 5 to 20% slower, a function with more work per call than getC)
  let anim = 0;
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, cx = ox + i, cy = oy + j, inW = cx >= 0 && cx < W && cy >= 0 && cy < H, ci = inW ? cy * W + cx : -1;
    let m = inW ? cells[ci] : getC(cx, cy), liq = 0;
    if (MAT_LIQ[m]) { liq = m; m = EMPTY; anim++; }   // a liquid cell is drawn as what is behind it, then painted over (paintLiquid); its surface glints follow the clock
    const lr = LR[k], lg = LG[k], lb = LB[k];
    let glyph = 0, r = 0, g = 0, b = 0, raw = -1;
    if (m === EMPTY) {
      Z[k] = 0;   // particles and rings always draw over the back wall
      const bm = inW ? backCells[ci] : 0;
      if (bm) {   // the back wall: the light in the air in front of it, dimmer, with a drop shadow from the world cells
        let f = BACK.dim;
        const lmag = BACK.lamps ? Math.hypot(LDX[k], LDY[k]) : 0;
        if (lmag > 1e-3) f *= backShadowLamp(cx, cy, LDX[k], LDY[k], lmag);   // a lamp lights this cell: the shadow falls away from it
        else for (let s = 0; s < bkN; s++) if (MAT_SOLID[getC(cx - BK_OFF[2 * s], cy - BK_OFF[2 * s + 1])]) { f *= 1 - BACK.shadow * (1 - s / bkN); break; }
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
    if (liq) paintLiquid(k, cx, cy, liq, time);
  }
  return anim;
}

// ---------- the still-frame snapshot (04_light.js, stillPlan): the terrain pass's outcome, kept ----------
// What steps 1 and 2 leave behind: the scene buffers (glyph, depth, colour, brightness) and the light buffers after the glow of hot and glowing things. A
// still frame copies them back. Not kept while the window holds crystals or glints: they follow the clock, so the pass has to be made again.
const SNAP = { n: 0, G: null, Z: null, R: null, Gc: null, B: null, L: null, LR: null, LG: null, LB: null };
function stillSave() {
  const n = R.RW * R.RH;
  if (SNAP.n !== n) { SNAP.n = n; SNAP.G = new Uint8Array(n); for (const k of ['Z', 'R', 'Gc', 'B', 'L', 'LR', 'LG', 'LB']) SNAP[k] = new Float32Array(n); }
  SNAP.G.set(R.wG); SNAP.Z.set(R.wZ); SNAP.R.set(cR); SNAP.Gc.set(cG); SNAP.B.set(cB); SNAP.L.set(cL); SNAP.LR.set(LR); SNAP.LG.set(LG); SNAP.LB.set(LB);
  stillSavedTerrain();
}
function stillRestore() { R.wG.set(SNAP.G); R.wZ.set(SNAP.Z); cR.set(SNAP.R); cG.set(SNAP.Gc); cB.set(SNAP.B); cL.set(SNAP.L); LR.set(SNAP.LR); LG.set(SNAP.LG); LB.set(SNAP.LB); }
// audit: the snapshot must equal what the full pass just made
function stillCompare() {
  if (SNAP.n !== R.RW * R.RH) return;
  for (let k = 0; k < SNAP.n; k++) {
    if (SNAP.G[k] !== R.wG[k] || SNAP.Z[k] !== R.wZ[k] || SNAP.R[k] !== cR[k] || SNAP.Gc[k] !== cG[k] || SNAP.B[k] !== cB[k] || SNAP.L[k] !== cL[k] || SNAP.LR[k] !== LR[k] || SNAP.LG[k] !== LG[k] || SNAP.LB[k] !== LB[k]) {
      CACHE.bad++; STILL.tHave = false; console.warn('the still-frame terrain was stale (cell ' + k + '): something it depends on changed without the engine hearing of it (engine/API.md, Performance)'); return;
    }
  }
}

function renderScene(ox, oy, time, drawExtras) {
  const RW = R.RW, RH = R.RH, n = RW * RH, G = R.wG, Z = R.wZ, SH = R.wShim;
  if (!cR || cR.length !== n) {
    cR = new Float32Array(n); cG = new Float32Array(n); cB = new Float32Array(n); cL = new Float32Array(n); vig = new Float32Array(n);
    STILL.tHave = false; vigK = -1;
  }
  if (vigK !== POST.vignette) {   // the corners' darkening: set when the buffers are made and when a game changes it (setPost)
    vigK = POST.vignette;
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) { const u = i / RW * 2 - 1, v = j / RH * 2 - 1; vig[j * RW + i] = 1 - vigK * (u * u * .55 + v * v * .8); }
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

  if (EMIT.a.length || EMIT.b.length) emitSwap();   // what the sprites drawn this frame glow with is poured in next frame
  // 6) tone map + vignette → bytes (alpha: is anything in the cell; and the optional bloom bright-pass)
  const qt = performance.now();
  adaptEye(G, n, time);
  const D = R.wPix, BL = R.bloomPix, bloom = R.bloom, E = EYE.e;
  fogPrep(E);   // the fog's colour for this frame (21_weather.js), for the world below and for the sky and the backdrops after it
  const bt = .62 - .1 * bp, bg = 460 * (1 + 1.2 * bp);   // the bloom bright-pass: on a drum hit its threshold drops and its gain rises
  for (let k = 0; k < n; k++) {
    const code = G[k], vv = vig[k] * INK[code], q = k * 4;
    let r = toneF(cR[k] * E) * vv, g = toneF(cG[k] * E) * vv, b = toneF(cB[k] * E) * vv;
    if (code === 32) { r = BG[0] / 255; g = BG[1] / 255; b = BG[2] / 255; }   // a filled cell of plain background
    D[q] = r * 255; D[q + 1] = g * 255; D[q + 2] = b * 255; D[q + 3] = code ? 255 : 0;
    if (bloom) { const on = code > 32; BL[q] = on ? Math.max(0, r - bt) * bg : 0; BL[q + 1] = on ? Math.max(0, g - bt) * bg : 0; BL[q + 2] = on ? Math.max(0, b - bt) * bg : 0; BL[q + 3] = 255; }
  }
  if (FOG.on) fogLayer(D, RW, RH, FOG.d);
  if (POST_PAL) postLock(D, RW, n, ox, oy);   // (the bloom's bright-pass above reads the unlocked colours: a glow is not a palette colour anyway)
  perfAdd('tone', performance.now() - qt);   // (a part of `scene`: the last pass over every cell, which P4 would move to the GPU)
  renderSky(time); if (BACKDROPS.length) renderBackdrops(time);
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
  const ox = ix - 1, oy = iy - 1, key = `${ox},${oy},${RW},${RH},${step},${Math.round(E * 24)},${POST.rev},${SKYG.rev},${FOG.key}`;   // (the gradient and the fog: 21_weather.js)
  if (key === skyKey) return;
  skyKey = key; R.skyDirty = true;
  const SG = R.sG, D = R.sPix, paint = GAME.sky, starP = .0055 * ASPECT * (GAME.stars ?? 1) / (RES * RES);
  if (paint && GAME.skyBegin) GAME.skyBegin(ox, oy, time);
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    const k = j * RW + i, q = k * 4; let glyph = 0, r = 0, g = 0, b = 0;
    if (paint && (glyph = paint(i, j, _pc)) !== 0) { if (glyph < 0) glyph = 0; else { r = _pc[0]; g = _pc[1]; b = _pc[2]; } }
    else if (hash2(ox + i, oy + j, 5) < starP && (!SKYG.on || SKYG.stars > .06)) {   // stars: steady in a vacuum
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
      if (SKYG.on) { skyGradAt(j, RH, _sg); r = Math.max(_sg[0], r * SKYG.stars); g = Math.max(_sg[1], g * SKYG.stars); b = Math.max(_sg[2], b * SKYG.stars); glyph = SOLID; }   // over the sky's colour a star is only as bright as it is, and as visible as the hour lets it be
    } else if (SKYG.on) { skyGradAt(j, RH, _sg); glyph = SOLID; r = _sg[0]; g = _sg[1]; b = _sg[2]; }   // the sky's base colour (setSkyGradient)
    const vv = vig[k] * INK[glyph];
    SG[k] = glyph; D[q] = toneF(r * E) * vv * 255; D[q + 1] = toneF(g * E) * vv * 255; D[q + 2] = toneF(b * E) * vv * 255; D[q + 3] = glyph > 32 ? 255 : 0;
  }
  if (FOG.on) fogLayer(D, RW, RH, Math.min(1, FOG.d * 1.6));   // the sky is the farthest thing there is
  if (POST_PAL) postLock(D, RW, RW * RH, ox, oy);
}
const _sg = [0, 0, 0];

// ---------- backdrops: layers between the sky and the world ----------
// Hills, a far city, a wall of mountains: each backdrop is a grid of cells of its own, scrolled by the camera times its `parallax` (the sky layer's own
// sub-cell offset technique, so it glides instead of stepping a cell at a time, in both renderers), drawn behind every world cell that is empty and in front of
// the sky, so the back wall, the terrain and everything the game draws cover it. The first one added is the farthest.
//   addBackdrop({ parallax: .3 | [px, py], horizon: worldRow, begin(ox, oy, t) {}, paint(gx, dy, out, t) { return SOLID; }, animate: 4, key: (ox, oy) => v })
//   parallax  how much of the camera's movement it follows: 0 holds still on the screen, 1 moves with the world (default .3)
//   paint     asked for every cell when the layer is rebuilt: gx is the cell's column in the layer's own space (it scrolls by cam.x * px, so a hill that is a function
//             of gx stays put), dy its row (see horizon). Return a cell code (0 = nothing, the sky shows; SOLID or a character's brightness) with out = [r, g, b]
//             in light units, as GAME.sky does. The colours are not lit: the painter picks them (setTimeOfDay's colours are in SKY_AT / AMB_C).
//   horizon   a world row (units): dy = 0 is the layer's row that stands where that world row does when the camera is centred on it, so hills painted below dy = 0
//             sit on the ground of a level whose ground is at that row. Without it dy is the layer's own row.
//   begin     once before each rebuild, with the layer's first column and row
//   animate   a number of rebuilds a second even when the layer has not scrolled (drifting clouds); key(ox, oy): rebuild when what it returns changes
//   underground: [r, g, b]  instead of paint: a dark wall below the skyline of the world (parallax 1), so a cave and everything under the ground shows no stars
// A layer is rebuilt when it has scrolled a whole cell, when the exposure moves, on `animate`, or when `key` changes: keep paint cheap (it runs for about
// 64 000 cells at 1280 x 800). worldInit clears the backdrops with everything else that belongs to a world; at most BACKDROP_MAX (3) at a time.
const BACKDROPS = [], BACKDROP_MAX = 3;
function addBackdrop(o = {}) {
  devKeys('addBackdrop', o, ['parallax', 'horizon', 'begin', 'paint', 'animate', 'key', 'underground', 'grain']);
  if (BACKDROPS.length >= BACKDROP_MAX) throw new Error(`addBackdrop: at most ${BACKDROP_MAX} backdrops at a time (removeBackdrop one first)`);
  const par = Array.isArray(o.parallax) ? o.parallax : [o.parallax ?? .3, o.parallax ?? .3];
  const L = { px: par[0], py: par[1], horizon: o.horizon, begin: o.begin || null, paint: o.paint || null, fps: o.animate || 0, key: o.key || null, fx: 0, fy: 0, dx: 0, dy: 0, sig: null, dirty: true, pix: null, cv: null, ctx: null, img: null };
  if (o.underground) {
    const c = o.underground, gr = o.grain ?? .3;
    L.px = L.py = 1; L.horizon = undefined;
    L.paint = (gx, gy, out) => { if (gx < 0 || gx >= W || !colTop || gy < colTop[gx]) return 0; const v = 1 + gr * (hash2(gx, gy, 77) - .5); out[0] = c[0] * v; out[1] = c[1] * v; out[2] = c[2] * v; return SOLID; };
    L.key = (ox) => { let h = 0; if (colTop) for (let x = Math.max(0, ox), e = Math.min(W, ox + R.RW); x < e; x++) h = (Math.imul(h, 31) + colTop[x]) | 0; return h; };   // the skyline under the window
  }
  BACKDROPS.push(L); return L;
}
function removeBackdrop(L) { const i = BACKDROPS.indexOf(L); if (i >= 0) BACKDROPS.splice(i, 1); }
function clearBackdrops() { BACKDROPS.length = 0; }
// a layer's pixel buffer (and, for the 2D canvas, its own canvas) for this size and renderer
function backdropAlloc(L) {
  const RW = R.RW, RH = R.RH; L.pix = new Uint8ClampedArray(RW * RH * 4); L.sig = null; L.dirty = true;
  if (R.mode === '2d') { L.cv = makeCanvas(RW, RH); L.ctx = L.cv.getContext('2d'); L.img = new ImageData(L.pix, RW, RH); } else L.cv = L.ctx = L.img = null;
}
function renderBackdrops(time) {
  const RW = R.RW, RH = R.RH, key0 = `${RW},${RH},${R.mode}`;
  if (R.bKey !== key0) { R.bKey = key0; for (const L of BACKDROPS) L.pix = null; }   // a new size or renderer: every layer's buffers again
  for (const L of BACKDROPS) if (!L.pix) backdropAlloc(L);
  const E = EYE.e;
  for (const L of BACKDROPS) {
    const sx = cam.x * L.px, sy = cam.y / ASPECT * L.py, ix = Math.floor(sx), iy = Math.floor(sy);
    L.fx = sx - ix; L.fy = sy - iy;
    const ox = ix - 1, oy = iy - 1, step = L.fps ? Math.floor(time * L.fps) : 0, sig = `${ox},${oy},${step},${Math.round(E * 24)},${POST.rev},${FOG.key},${L.key ? L.key(ox, oy) : ''}`;
    if (sig === L.sig) continue;
    L.sig = sig; L.dirty = true;
    const base = L.horizon === undefined ? 0 : Math.round(R.rows / 2 + (L.horizon / ASPECT - R.rows / 2) * L.py), D = L.pix, paint = L.paint;
    if (L.begin) L.begin(ox, oy, time);
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
      const k = j * RW + i, q = k * 4; let glyph = paint ? paint(ox + i, oy + j - base, _pc, time) : 0;
      if (glyph > 0) {
        const vv = vig[k] * INK[glyph];
        D[q] = toneF(_pc[0] * E) * vv * 255; D[q + 1] = toneF(_pc[1] * E) * vv * 255; D[q + 2] = toneF(_pc[2] * E) * vv * 255; D[q + 3] = glyph > 32 ? 255 : 0;
      } else D[q] = D[q + 1] = D[q + 2] = D[q + 3] = 0;
    }
    if (FOG.on) fogLayer(D, RW, RH, Math.min(1, FOG.d * (1 + 1.2 * (1 - L.px))));   // a layer that moves less is further away: more fog over it
    if (POST_PAL) postLock(D, RW, RW * RH, ox, oy);
  }
}
