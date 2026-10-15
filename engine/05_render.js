// ===================== ENGINE · ASCII renderer =====================
// Every cell gets one printable ASCII glyph and one colour. Three grids are drawn:
// the sky (stars plus whatever the game paints, scrolled on its own with a slight parallax), the world
// (fine, scrolls with the camera, size set by the detail level) and the HUD (coarser,
// fixed, always readable). Sky and world each carry their own sub-cell offset, so both
// glide smoothly; the sky only shows through world cells with nothing in them.
// WebGL draws everything in one full-screen pass that samples a glyph atlas per pixel;
// a 2D-canvas path covers browsers without WebGL.
const R = {
  canvas: null, mode: '2d', gl: null, glU: null, glT: null, ctx: null, dpr: 1,
  cw: 8, chh: 16, cols: 0, rows: 0, RW: 0, RH: 0, atlas: null,
  wG: null, wZ: null, wShim: null, wPix: null, shimPix: null, bloomPix: null, bloom: false,
  sG: null, sPix: null, skyFX: 0, skyFY: 0, skyDirty: true,
  hcw: 10, hchh: 20, hcols: 0, hrows: 0, hAtlas: null, hG: null, hC: null, hPix: null,
  wl: null, sl: null, occPix: null, occImg: null, occCv: null, occCtx: null, bloomCv: null, bloomCtx: null, bloomImg: null,
  fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace'
};
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

const GL_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uAtlas, uHAtlas, uWorld, uShim, uHud, uBloom, uSky;
uniform vec2 uCanvas, uCell, uHCell, uWorldN, uHudN, uOff, uSkyOff, uAtlasN, uHAtlasN;
uniform vec3 uBg;
uniform float uBloomOn;
float glyphA(sampler2D atl, vec2 atlN, vec2 cell, float g, vec2 lp) {
  float gi = g - 32.0;
  vec2 slot = vec2(mod(gi, 16.0), floor(gi / 16.0));
  return texture2D(atl, (slot * cell + lp) / atlN).a;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 hc = floor(px / uHCell);
  if (hc.x < uHudN.x && hc.y < uHudN.y) {
    vec4 h = texture2D(uHud, (hc + 0.5) / uHudN);
    float hg = floor(h.a * 255.0 + 0.5);
    if (hg >= 32.0) {
      vec3 hcol = uBg;
      if (hg > 32.0 && hg < 127.0) hcol = mix(uBg, h.rgb, glyphA(uHAtlas, uHAtlasN, uHCell, hg, px - hc * uHCell));
      gl_FragColor = vec4(hcol, 1.0);
      return;
    }
  }
  vec2 wp = px - uOff;
  vec2 wc = floor(wp / uCell);
  vec2 wuv = (wc + 0.5) / uWorldN;
  vec4 w = texture2D(uWorld, wuv);
  float g = floor(w.a * 255.0 + 0.5);
  vec3 col = uBg;
  if (g < 0.5) {                      // nothing in the world here: look through to the sky layer
    vec2 sp = px - uSkyOff, sc = floor(sp / uCell);
    vec4 s = texture2D(uSky, (sc + 0.5) / uWorldN);
    float sg = floor(s.a * 255.0 + 0.5);
    if (sg > 32.0 && sg < 127.0) col = mix(uBg, s.rgb, glyphA(uAtlas, uAtlasN, uCell, sg, sp - sc * uCell));
  } else if (g > 32.0 && g < 127.0) {
    vec2 lp = wp - wc * uCell;
    lp.x -= (texture2D(uShim, wuv).r * 255.0 - 128.0) / 8.0;
    if (lp.x >= 0.0 && lp.x < uCell.x) col = mix(uBg, w.rgb, glyphA(uAtlas, uAtlasN, uCell, g, lp));
  }
  if (uBloomOn > 0.5) {
    vec2 bu = wp / uCell / uWorldN, d = 1.0 / uWorldN;
    vec3 b = texture2D(uBloom, bu).rgb * 0.36
      + (texture2D(uBloom, bu + vec2(d.x, 0.0)).rgb + texture2D(uBloom, bu - vec2(d.x, 0.0)).rgb
       + texture2D(uBloom, bu + vec2(0.0, d.y)).rgb + texture2D(uBloom, bu - vec2(0.0, d.y)).rgb) * 0.12
      + (texture2D(uBloom, bu + d * 2.5).rgb + texture2D(uBloom, bu - d * 2.5).rgb
       + texture2D(uBloom, bu + vec2(d.x, -d.y) * 2.5).rgb + texture2D(uBloom, bu + vec2(-d.x, d.y) * 2.5).rgb) * 0.08;
    col += b * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function renderInit(canvas) {
  R.canvas = canvas;
  // WebGL unless it would be software-emulated (then the 2D canvas is faster); #gl / #2d force a path
  const force = (location.hash || '').slice(1) || window.GLYPHITE_RENDERER || '';
  if (force !== '2d' && glSetup(canvas, force === 'gl')) return;
  if (R.gl) { const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); R.canvas = fresh; R.gl = null; }
  R.mode = '2d'; R.ctx = R.canvas.getContext('2d');
}
function glSetup(canvas, forced) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !forced }); } catch (e) { gl = null; }
  if (!gl) return false;
  R.gl = gl;
  if (!forced) {   // software-emulated WebGL reads back every frame; the 2D canvas is quicker there
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rend = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rend)) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); return false; }
  }
  try {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, GL_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GL_FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of ['uAtlas', 'uHAtlas', 'uWorld', 'uShim', 'uHud', 'uBloom', 'uSky', 'uCanvas', 'uCell', 'uHCell', 'uWorldN', 'uHudN', 'uOff', 'uSkyOff', 'uAtlasN', 'uHAtlasN', 'uBg', 'uBloomOn']) U[n] = gl.getUniformLocation(prog, n);
    const T = {};
    ['uAtlas', 'uHAtlas', 'uWorld', 'uShim', 'uHud', 'uBloom', 'uSky'].forEach((name, unit) => {
      const t = gl.createTexture(), f = name === 'uBloom' ? gl.LINEAR : gl.NEAREST;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(U[name], unit);
      T[name] = { tex: t, unit, w: 0, h: 0, fmt: 0 };
    });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.uniform3f(U.uBg, 5 / 255, 7 / 255, 12 / 255);
    R.glU = U; R.glT = T; R.mode = 'gl';
    canvas.addEventListener('webglcontextlost', e => e.preventDefault());
    return true;
  } catch (e) { console.warn('WebGL renderer unavailable; using 2D canvas.', e); return false; }
}
function glTex(name, w, h, fmt, data) {
  const gl = R.gl, T = R.glT[name];
  gl.activeTexture(gl.TEXTURE0 + T.unit); gl.bindTexture(gl.TEXTURE_2D, T.tex);
  if (T.w !== w || T.h !== h || T.fmt !== fmt) { gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data); T.w = w; T.h = h; T.fmt = fmt; }
  else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, fmt, gl.UNSIGNED_BYTE, data);
}
function glAtlas(name, cv) {
  const gl = R.gl, T = R.glT[name];
  gl.activeTexture(gl.TEXTURE0 + T.unit); gl.bindTexture(gl.TEXTURE_2D, T.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); T.w = -1;
}

function renderResize(cssW, cssH) {
  const gl = R.mode === 'gl', dpr = Math.min(gl ? 3 : 2, window.devicePixelRatio || 1), base = cssW < 640 ? 56 : 150;
  // world cell shrinks with detail; never below 4 device px so glyphs stay glyphs
  const cw = Math.max(4, Math.round(cssW / (base * RES) * dpr)), cwCss = cw / dpr;
  R.dpr = dpr; R.cw = cw; R.chh = cw * 2;
  R.cols = Math.max(40, Math.floor(cssW / cwCss)); R.rows = Math.max(24, Math.floor(cssH / (cwCss * 2)));
  const c = R.canvas;
  c.width = R.cols * cw; c.height = R.rows * R.chh;
  c.style.width = (R.cols * cwCss) + 'px'; c.style.height = (R.rows * cwCss * 2) + 'px';
  c.style.left = Math.floor((cssW - R.cols * cwCss) / 2) + 'px'; c.style.top = Math.floor((cssH - R.rows * cwCss * 2) / 2) + 'px';
  // HUD cell keeps its readable size whatever the detail level
  R.hcw = Math.max(6, Math.round(clamp(cssW / base, 6, 11) * dpr)); R.hchh = R.hcw * 2;
  R.hcols = Math.floor(c.width / R.hcw); R.hrows = Math.floor(c.height / R.hchh);
  // world layer is one cell larger each way so the camera can scroll smoothly
  R.RW = R.cols + 2; R.RH = R.rows + 2;
  const n = R.RW * R.RH;
  R.wG = new Uint8Array(n); R.wZ = new Float32Array(n); R.wShim = new Float32Array(n);
  R.wPix = new Uint8ClampedArray(n * 4); R.shimPix = new Uint8Array(n); R.bloomPix = new Uint8ClampedArray(n * 4);
  R.sG = new Uint8Array(n); R.sPix = new Uint8ClampedArray(n * 4); R.skyDirty = true; skyKey = '';
  const hn = R.hcols * R.hrows;
  R.hG = new Uint8Array(hn); R.hC = new Uint8ClampedArray(hn * 3); R.hPix = new Uint8Array(hn * 4);
  if (!gl) {
    R.wl = gridLayer(R.wPix); R.sl = gridLayer(R.sPix);
    R.occPix = new Uint8ClampedArray(n * 4); R.occImg = new ImageData(R.occPix, R.RW, R.RH);
    R.occCv = makeCanvas(R.RW, R.RH); R.occCtx = R.occCv.getContext('2d');
    R.bloomCv = makeCanvas(R.RW, R.RH); R.bloomCtx = R.bloomCv.getContext('2d'); R.bloomImg = new ImageData(R.bloomPix, R.RW, R.RH);
  }
  buildAtlases();
  lightAlloc(R.RW, R.RH);
}

// 95 printable glyphs in a 16 x 6 grid, white on transparent
function makeAtlas(cw, chh) {
  const a = makeCanvas(cw * 16, chh * 6), x = a.getContext('2d'), weight = cw < 8 ? '700 ' : '';
  let size = Math.round(chh * .8);
  x.font = `${weight}${size}px ${R.fontFamily}`;
  const mw = x.measureText('M').width;
  if (mw > cw * 1.02) { size = Math.max(4, Math.floor(size * cw / mw)); x.font = `${weight}${size}px ${R.fontFamily}`; }
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 95; i++) x.fillText(String.fromCharCode(32 + i), (i & 15) * cw + cw / 2, (i >> 4) * chh + chh * .54);
  return a;
}
function buildAtlases() {
  R.atlas = makeAtlas(R.cw, R.chh); R.hAtlas = makeAtlas(R.hcw, R.hchh); tintCache.clear();
  if (R.mode === 'gl') { glAtlas('uAtlas', R.atlas); glAtlas('uHAtlas', R.hAtlas); }
}

// ---------- HUD helpers (screen-fixed text on the HUD grid) ----------
function hudClear() { R.hG.fill(0); }
function hudPut(c, r, code, cr, cg, cb) {
  if (c < 0 || r < 0 || c >= R.hcols || r >= R.hrows) return;
  const k = r * R.hcols + c; R.hG[k] = code; R.hC[k * 3] = cr; R.hC[k * 3 + 1] = cg; R.hC[k * 3 + 2] = cb;
}
function hudText(c, r, s, col) { for (let i = 0; i < s.length; i++) { const code = s.charCodeAt(i); hudPut(c + i, r, code < 32 || code > 126 ? 63 : code, col[0], col[1], col[2]); } }
function hudFill(c, r, w, h, code, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) hudPut(c + i, r + j, code, col[0], col[1], col[2]); }
function hudBox(c, r, w, h, col, bg) {
  hudFill(c, r, w, h, 32, col);
  for (let i = 1; i < w - 1; i++) { hudPut(c + i, r, 45, ...col); hudPut(c + i, r + h - 1, 45, ...col); }
  for (let j = 1; j < h - 1; j++) { hudPut(c, r + j, 124, ...col); hudPut(c + w - 1, r + j, 124, ...col); }
  hudPut(c, r, 43, ...col); hudPut(c + w - 1, r, 43, ...col); hudPut(c, r + h - 1, 43, ...col); hudPut(c + w - 1, r + h - 1, 43, ...col);
  if (bg) for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const cc = c + i, rr2 = r + j; if (cc >= 0 && rr2 >= 0 && cc < R.hcols && rr2 < R.hrows) R.hG[rr2 * R.hcols + cc] = 255; }
}
// readable HUD colours (0..255) shared by games
const HC = { txt: [205, 214, 226], dim: [72, 84, 102], amber: [255, 179, 64], red: [255, 96, 72], cyan: [120, 220, 255], green: [140, 235, 150], gold: [255, 214, 120] };
// a centred box with one line of text per [text, colour]; top row optional
function msgBox(lines, top) {
  const w = Math.min(R.hcols - 2, Math.max(...lines.map(l => l[0].length)) + 6), h = lines.length + 2;
  const c0 = Math.floor((R.hcols - w) / 2), r0 = top !== undefined ? top : Math.floor((R.hrows - h) / 2);
  hudBox(c0, r0, w, h, HC.dim, true);
  lines.forEach(([s, col], i) => hudText(c0 + Math.floor((w - s.length) / 2), r0 + 1 + i, s.slice(0, w - 2), col));
}
// [text, colour] segments flowed left to right, wrapping to the next row; returns the next free row
function hudFlow(row, segs) {
  let c = 1;
  for (const [txt, col] of segs) {
    if (c + txt.length > R.hcols - 1 && c > 1) { row++; c = 1; }
    hudText(c, row, txt, col); c += txt.length + 3;
  }
  return row + 1;
}
const fmtS = (v, w, d) => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(d).padStart(w, '0');   // signed, zero-padded

// camera: the world position (units) of the screen's top-left corner
const cam = { x: 0, y: 0 };
// world position (units) → HUD cell
function worldToHud(x, y, out) { out[0] = Math.floor((x - cam.x) * R.cw / R.hcw); out[1] = Math.floor((y - cam.y) / ASPECT * R.chh / R.hchh); return out; }

function presentFrame(fracX, fracY, time) {
  const s = FX.shake * FX.shake * (CALM ? 2 : 9) * R.dpr;
  const sx = s ? (vnoise1(time * 23, 3) * 2 - 1) * s : 0, sy = s ? (vnoise1(time * 23, 9) * 2 - 1) * s : 0;
  const dx = Math.round(-(1 + fracX) * R.cw + sx), dy = Math.round(-(1 + fracY) * R.chh + sy);
  const sdx = Math.round(-(1 + R.skyFX) * R.cw + sx), sdy = Math.round(-(1 + R.skyFY) * R.chh + sy);
  if (R.mode === 'gl') presentGL(dx, dy, sdx, sdy, time); else present2D(dx, dy, sdx, sdy, time);
}

function presentGL(dx, dy, sdx, sdy, time) {
  const gl = R.gl, U = R.glU, RW = R.RW, RH = R.RH;
  if (gl.isContextLost()) return;
  gl.viewport(0, 0, R.canvas.width, R.canvas.height);
  glTex('uWorld', RW, RH, gl.RGBA, R.wPix);
  if (R.skyDirty || R.glT.uSky.w !== RW || R.glT.uSky.h !== RH) { glTex('uSky', RW, RH, gl.RGBA, R.sPix); R.skyDirty = false; }
  const SH = R.wShim, SP = R.shimPix, amp = 1.6 * R.dpr * 8;
  for (let j = 0, k = 0; j < RH; j++) for (let i = 0; i < RW; i++, k++) SP[k] = SH[k] > .05 ? clamp(128 + Math.round(Math.sin(time * 37 + j * 1.9 + i * .7) * SH[k] * amp), 0, 255) : 128;
  glTex('uShim', RW, RH, gl.LUMINANCE, SP);
  const hn = R.hcols * R.hrows, HP = R.hPix, HG = R.hG, HC = R.hC;
  for (let k = 0; k < hn; k++) { const q = k * 4; HP[q] = HC[k * 3]; HP[q + 1] = HC[k * 3 + 1]; HP[q + 2] = HC[k * 3 + 2]; HP[q + 3] = HG[k]; }
  glTex('uHud', R.hcols, R.hrows, gl.RGBA, HP);
  if (R.bloom) glTex('uBloom', RW, RH, gl.RGBA, R.bloomPix);
  gl.uniform2f(U.uCanvas, R.canvas.width, R.canvas.height);
  gl.uniform2f(U.uCell, R.cw, R.chh); gl.uniform2f(U.uHCell, R.hcw, R.hchh);
  gl.uniform2f(U.uWorldN, RW, RH); gl.uniform2f(U.uHudN, R.hcols, R.hrows);
  gl.uniform2f(U.uOff, dx, dy); gl.uniform2f(U.uSkyOff, sdx, sdy);
  gl.uniform2f(U.uAtlasN, R.atlas.width, R.atlas.height); gl.uniform2f(U.uHAtlasN, R.hAtlas.width, R.hAtlas.height);
  gl.uniform1f(U.uBloomOn, R.bloom ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- 2D canvas fallback ----------
// a grid layer: one pixel of colour per cell, scaled up and cut out by the glyph shapes
function gridLayer(pix) {
  const w = R.RW * R.cw, h = R.RH * R.chh, colorCv = makeCanvas(R.RW, R.RH), glyph = makeCanvas(w, h), layer = makeCanvas(w, h);
  return { img: new ImageData(pix, R.RW, R.RH), colorCv, colorCtx: colorCv.getContext('2d'), glyph, glyphCtx: glyph.getContext('2d'), layer, layerCtx: layer.getContext('2d') };
}
function composeGrid(Ly, G, shim, time) {
  const cw = R.cw, chh = R.chh, atlas = R.atlas, cols = R.RW, rows = R.RH;
  Ly.colorCtx.putImageData(Ly.img, 0, 0);
  const gx = Ly.glyphCtx; gx.clearRect(0, 0, Ly.glyph.width, Ly.glyph.height);
  for (let j = 0; j < rows; j++) {
    const y = j * chh, row = j * cols;
    for (let i = 0; i < cols; i++) {
      const g = G[row + i]; if (g <= 32 || g > 126) continue;
      let x = i * cw; if (shim && shim[row + i] > .05) x += Math.sin(time * 37 + j * 1.9 + i * .7) * shim[row + i] * 1.6 * R.dpr;
      const gi = g - 32;
      gx.drawImage(atlas, (gi & 15) * cw, (gi >> 4) * chh, cw, chh, x, y, cw, chh);
    }
  }
  const lx = Ly.layerCtx;
  lx.globalCompositeOperation = 'copy'; lx.imageSmoothingEnabled = false;
  lx.drawImage(Ly.colorCv, 0, 0, cols * cw, rows * chh);
  lx.globalCompositeOperation = 'destination-in'; lx.drawImage(Ly.glyph, 0, 0);
  lx.globalCompositeOperation = 'source-over';
}
function present2D(dx, dy, sdx, sdy, time) {
  const ctx = R.ctx, cw = R.cw, chh = R.chh;
  if (R.skyDirty) { composeGrid(R.sl, R.sG, null, time); R.skyDirty = false; }
  composeGrid(R.wl, R.wG, R.wShim, time);
  // anything in a world cell hides the sky behind it, even where its glyph leaves gaps
  R.occCtx.putImageData(R.occImg, 0, 0);
  const lx = R.wl.layerCtx; lx.globalCompositeOperation = 'destination-over'; lx.drawImage(R.occCv, 0, 0, R.RW * cw, R.RH * chh); lx.globalCompositeOperation = 'source-over';
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, R.canvas.width, R.canvas.height);
  ctx.drawImage(R.sl.layer, sdx, sdy);
  ctx.drawImage(R.wl.layer, dx, dy);
  if (R.bloom) {
    R.bloomCtx.putImageData(R.bloomImg, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.globalAlpha = .55;
    ctx.drawImage(R.bloomCv, dx, dy, R.RW * cw, R.RH * chh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  const HG = R.hG, HC = R.hC, hw = R.hcw, hh = R.hchh;
  ctx.fillStyle = 'rgb(5,7,12)';
  for (let r = 0; r < R.hrows; r++) for (let c = 0; c < R.hcols; c++) {
    const k = r * R.hcols + c, g = HG[k]; if (g < 32) continue;
    ctx.fillRect(c * hw, r * hh, hw, hh);
    if (g === 32 || g > 126) continue;
    const gi = g - 32;
    ctx.drawImage(tintAtlas(HC[k * 3], HC[k * 3 + 1], HC[k * 3 + 2]), (gi & 15) * hw, (gi >> 4) * hh, hw, hh, c * hw, r * hh, hw, hh);
  }
}
const tintCache = new Map();
function tintAtlas(r, g, b) {
  const key = (r << 16) | (g << 8) | b; let a = tintCache.get(key); if (a) return a;
  a = makeCanvas(R.hAtlas.width, R.hAtlas.height); const x = a.getContext('2d');
  x.drawImage(R.hAtlas, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, a.width, a.height);
  if (tintCache.size > 96) tintCache.clear();
  tintCache.set(key, a); return a;
}
