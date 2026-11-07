// ===================== ENGINE · pixel renderer =====================
// Every world cell is one pixel of colour. Three grids are drawn: the sky (stars plus whatever the game paints, scrolled on its
// own with a slight parallax), the world (fine, scrolls with the camera, size set by the detail level) and the HUD (text in the
// engine's own pixel font, coarser, fixed, always readable). Sky and world each carry their own sub-cell offset, so both glide
// smoothly; the sky only shows through world cells with nothing in them.
// Cells still carry a code (the old glyph): 0 = empty (the sky shows), 32 = filled with the background colour, 127 = a solid
// pixel; a printable character makes a pixel as bright as that character is dense in the font (see INK), so a '.' of dust is
// fainter than a '#'. WebGL draws everything in one full-screen pass; a 2D-canvas path covers browsers without WebGL.
const R = {
  canvas: null, mode: '2d', gl: null, glU: null, glT: null, ctx: null, dpr: 1,
  cw: 8, chh: 16, cols: 0, rows: 0, RW: 0, RH: 0,
  wG: null, wZ: null, wShim: null, wPix: null, shimPix: null, bloomPix: null, bloom: false,
  sG: null, sPix: null, skyFX: 0, skyFY: 0, skyDirty: true,
  hcw: 12, hchh: 24, hs: 2, hcols: 0, hrows: 0, hG: null, hC: null, hPix: null,
  wCv: null, wCtx: null, wImg: null, sCv: null, sCtx: null, sImg: null, bloomCv: null, bloomCtx: null, bloomImg: null, fontS: null
};
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

// the colour behind everything (bytes): what empty space and code-32 cells show
const BG = [5, 7, 12];
function setBackground(r, g, b) { BG[0] = r; BG[1] = g; BG[2] = b; if (R.mode === 'gl') R.gl.uniform3f(R.glU.uBg, r / 255, g / 255, b / 255); }

// ---------- the pixel font (data written by tools/pixelfont.py: 9 rows of 5 bits per character, base 32) ----------
const FONT_DATA = '000000000444440400aa0000000aavavaa004fke5u400op248j300cik8lid0044000000024888420084222480004lel4000044v4400000000cc48000v0000000000cc0011248gg00ehjlphe004c4444e00eh1248v00v2421he0026aiv2200vgu11he0068guhhe00v12488800ehhehhe00ehhf12c000cc0cc0000cc0cc480248g8420000v0v0000842124800eh1240400ehnlngf00ehhvhhh00uhhuhhu00ehggghe00sihhhis00vgguggv00vgguggg00ehgnhhf00hhhvhhh00e44444e0072222ic00hikokih00ggggggv00hrllhhh00hhpljhh00ehhhhhe00uhhuggg00ehhhlid00uhhukih00fgge11u00v44444400hhhhhhe00hhhhha400hhhllla00hha4ahh00hha444400v1248gv00e88888e00gg8421100e22222e004ah0000000000000v084000000000e1fhf00ggmphhu0000egghe0011djhhf0000ehvge00698s8880000fhhhf1eggmphhh0040c444e002062222icggikoki00c44444e0000qllll0000mphhh0000ehhhe0000uhhhugg00fhhhf1100mpggg0000fge1u0088s88960000hhhjd0000hhha40000hhlla0000ha4ah0000hhhhf1e00v248v00244844200444444400844244800008l20000';
const FONT_W = 6, FONT_H = 12;   // a character's cell: the 5 x 9 drawing two rows down, with a column and a row of gap
// lit pixels per code: 32..126 the characters, 127 a full block, 128..133 box lines ─ │ ┌ ┐ └ ┘ that join across cells
const FONT = (() => {
  const f = new Uint8Array(256 * FONT_W * FONT_H), set = (c, x, y) => { f[(c * FONT_H + y) * FONT_W + x] = 1; };
  for (let c = 32; c < 127; c++) for (let y = 0; y < 9; y++) {
    const bits = parseInt(FONT_DATA[(c - 32) * 9 + y], 32);
    for (let x = 0; x < 5; x++) if (bits & (16 >> x)) set(c, x, y + 2);
  }
  const MX = 2, MY = 5;   // where box lines run: through the middle of a capital
  for (let y = 0; y < FONT_H; y++) for (let x = 0; x < FONT_W; x++) {
    set(127, x, y);
    if (y === MY) { set(128, x, y); if (x >= MX) { set(130, x, y); set(132, x, y); } if (x <= MX) { set(131, x, y); set(133, x, y); } }
    if (x === MX) { set(129, x, y); if (y >= MY) { set(130, x, y); set(131, x, y); } if (y <= MY) { set(132, x, y); set(133, x, y); } }
  }
  return f;
})();
// how bright a world cell of each code is: a character as dense as '@' is full colour, a '.' about half
const INK = (() => {
  const ink = new Float32Array(256).fill(1), cov = c => { let n = 0; for (let k = 0; k < FONT_W * FONT_H; k++) n += FONT[c * FONT_W * FONT_H + k]; return n; };
  let mx = 1; for (let c = 33; c < 127; c++) mx = Math.max(mx, cov(c));
  for (let c = 33; c < 127; c++) ink[c] = .45 + .55 * Math.sqrt(cov(c) / mx);
  ink[0] = 0; ink[32] = 0;
  return ink;
})();
// the font as white on transparent, 16 codes to a row (codes 32..191), one canvas pixel per font pixel
function fontAtlas(scale) {
  const cv = makeCanvas(16 * FONT_W * scale, 10 * FONT_H * scale), x = cv.getContext('2d');
  x.fillStyle = '#fff';
  for (let c = 32; c < 192; c++) {
    const ox = ((c - 32) & 15) * FONT_W, oy = ((c - 32) >> 4) * FONT_H;
    for (let y = 0; y < FONT_H; y++) for (let q = 0; q < FONT_W; q++) if (FONT[(c * FONT_H + y) * FONT_W + q]) x.fillRect((ox + q) * scale, (oy + y) * scale, scale, scale);
  }
  return cv;
}

const GL_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uFont, uWorld, uShim, uHud, uBloom, uSky;
uniform vec2 uCanvas, uCell, uHCell, uWorldN, uHudN, uOff, uSkyOff, uFontN;
uniform vec3 uBg;
uniform float uBloomOn, uHS;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 hc = floor(px / uHCell);
  if (hc.x < uHudN.x && hc.y < uHudN.y) {
    vec4 h = texture2D(uHud, (hc + 0.5) / uHudN);
    float hg = floor(h.a * 255.0 + 0.5);
    if (hg >= 32.0) {
      vec3 hcol = uBg;
      if (hg > 32.5 && hg < 191.5) {
        float gi = hg - 32.0;
        vec2 fp = vec2(mod(gi, 16.0), floor(gi / 16.0)) * vec2(${FONT_W}.0, ${FONT_H}.0) + floor((px - hc * uHCell) / uHS);
        hcol = mix(uBg, h.rgb, texture2D(uFont, (fp + 0.5) / uFontN).a);
      }
      gl_FragColor = vec4(hcol, 1.0);
      return;
    }
  }
  vec2 wp = px - uOff;
  float sh = (texture2D(uShim, (floor(wp / uCell) + 0.5) / uWorldN).r * 255.0 - 128.0) / 8.0;   // heat haze: device px
  vec2 wc = floor((wp - vec2(sh, 0.0)) / uCell);
  vec4 w = texture2D(uWorld, (wc + 0.5) / uWorldN);
  vec3 col = w.rgb;
  if (w.a < 0.5) {                    // nothing in the world here: look through to the sky layer
    vec4 s = texture2D(uSky, (floor((px - uSkyOff) / uCell) + 0.5) / uWorldN);
    col = s.a > 0.5 ? s.rgb : uBg;
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
  const force = (location.hash || '').slice(1) || window.PIXELITE_RENDERER || '';
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
    for (const n of ['uFont', 'uWorld', 'uShim', 'uHud', 'uBloom', 'uSky', 'uCanvas', 'uCell', 'uHCell', 'uWorldN', 'uHudN', 'uOff', 'uSkyOff', 'uFontN', 'uBg', 'uBloomOn', 'uHS']) U[n] = gl.getUniformLocation(prog, n);
    const T = {};
    ['uFont', 'uWorld', 'uShim', 'uHud', 'uBloom', 'uSky'].forEach((name, unit) => {
      const t = gl.createTexture(), f = name === 'uBloom' ? gl.LINEAR : gl.NEAREST;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(U[name], unit);
      T[name] = { tex: t, unit, w: 0, h: 0, fmt: 0 };
    });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    R.glU = U; R.glT = T; R.mode = 'gl';
    gl.uniform3f(U.uBg, BG[0] / 255, BG[1] / 255, BG[2] / 255);
    const font = fontAtlas(1);   // the shader scales it by whole pixels itself
    gl.activeTexture(gl.TEXTURE0 + T.uFont.unit); gl.bindTexture(gl.TEXTURE_2D, T.uFont.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, font);
    gl.uniform2f(U.uFontN, font.width, font.height);
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

function renderResize(cssW, cssH) {
  const gl = R.mode === 'gl', dpr = Math.min(gl ? 3 : 2, window.devicePixelRatio || 1), base = cssW < 640 ? 56 : 150;
  // world cell shrinks with detail; never below 4 device px, where a finer grid costs more than it shows
  const cw = Math.max(4, Math.round(cssW / (base * RES) * dpr)), cwCss = cw / dpr;
  R.dpr = dpr; R.cw = cw; R.chh = cw * 2;
  R.cols = Math.max(40, Math.floor(cssW / cwCss)); R.rows = Math.max(24, Math.floor(cssH / (cwCss * 2)));
  const c = R.canvas;
  c.width = R.cols * cw; c.height = R.rows * R.chh;
  c.style.width = (R.cols * cwCss) + 'px'; c.style.height = (R.rows * cwCss * 2) + 'px';
  c.style.left = Math.floor((cssW - R.cols * cwCss) / 2) + 'px'; c.style.top = Math.floor((cssH - R.rows * cwCss * 2) / 2) + 'px';
  // the HUD keeps its readable size whatever the detail level: the font scaled by whole pixels to about the size of old
  // terminal text, rounded down on phones so a line still holds as many characters
  const want = Math.max(6, Math.round(clamp(cssW / base, 6, 11) * dpr)) / FONT_W;
  R.hs = Math.max(1, cssW < 640 ? Math.floor(want) : Math.round(want)); R.hcw = FONT_W * R.hs; R.hchh = FONT_H * R.hs;
  R.hcols = Math.floor(c.width / R.hcw); R.hrows = Math.floor(c.height / R.hchh);
  // world layer is one cell larger each way so the camera can scroll smoothly
  R.RW = R.cols + 2; R.RH = R.rows + 2;
  const n = R.RW * R.RH;
  R.wG = new Uint8Array(n); R.wZ = new Float32Array(n); R.wShim = new Float32Array(n);
  R.wPix = new Uint8ClampedArray(n * 4); R.shimPix = new Uint8Array(n); R.bloomPix = new Uint8ClampedArray(n * 4);
  R.sG = new Uint8Array(n); R.sPix = new Uint8ClampedArray(n * 4); R.skyDirty = true; skyKey = '';
  const hn = R.hcols * R.hrows;
  R.hG = new Uint8Array(hn); R.hC = new Uint8ClampedArray(hn * 3); R.hPix = new Uint8Array(hn * 4);
  if (!gl) {   // one canvas pixel per cell, drawn scaled up without smoothing
    R.wCv = makeCanvas(R.RW, R.RH); R.wCtx = R.wCv.getContext('2d'); R.wImg = new ImageData(R.wPix, R.RW, R.RH);
    R.sCv = makeCanvas(R.RW, R.RH); R.sCtx = R.sCv.getContext('2d'); R.sImg = new ImageData(R.sPix, R.RW, R.RH);
    R.bloomCv = makeCanvas(R.RW, R.RH); R.bloomCtx = R.bloomCv.getContext('2d'); R.bloomImg = new ImageData(R.bloomPix, R.RW, R.RH);
    R.fontS = fontAtlas(R.hs); tintCache.clear();
  }
  lightAlloc(R.RW, R.RH);
}

// ---------- HUD helpers (screen-fixed text on the HUD grid) ----------
function hudClear() { R.hG.fill(0); }
function hudPut(c, r, code, cr, cg, cb) {
  if (c < 0 || r < 0 || c >= R.hcols || r >= R.hrows) return;
  const k = r * R.hcols + c; R.hG[k] = code; R.hC[k * 3] = cr; R.hC[k * 3 + 1] = cg; R.hC[k * 3 + 2] = cb;
}
function hudText(c, r, s, col) { for (let i = 0; i < s.length; i++) { const code = s.charCodeAt(i); hudPut(c + i, r, code < 32 || code > 126 ? 63 : code, col[0], col[1], col[2]); } }
function hudFill(c, r, w, h, code, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) hudPut(c + i, r + j, code, col[0], col[1], col[2]); }
// a frame of joined lines (font codes 128..133); bg: the inside hides what is behind it (code 255)
function hudBox(c, r, w, h, col, bg) {
  hudFill(c, r, w, h, 32, col);
  for (let i = 1; i < w - 1; i++) { hudPut(c + i, r, 128, ...col); hudPut(c + i, r + h - 1, 128, ...col); }
  for (let j = 1; j < h - 1; j++) { hudPut(c, r + j, 129, ...col); hudPut(c + w - 1, r + j, 129, ...col); }
  hudPut(c, r, 130, ...col); hudPut(c + w - 1, r, 131, ...col); hudPut(c, r + h - 1, 132, ...col); hudPut(c + w - 1, r + h - 1, 133, ...col);
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

// heat haze: how far (device px) each shimmering cell's pixels are pushed sideways this frame
const shimShift = (k, i, j, time) => Math.sin(time * 37 + j * 1.9 + i * .7) * R.wShim[k] * .6 * R.cw;
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
  const SH = R.wShim, SP = R.shimPix;
  for (let j = 0, k = 0; j < RH; j++) for (let i = 0; i < RW; i++, k++) SP[k] = SH[k] > .05 ? clamp(128 + Math.round(shimShift(k, i, j, time) * 8), 0, 255) : 128;
  glTex('uShim', RW, RH, gl.LUMINANCE, SP);
  const hn = R.hcols * R.hrows, HP = R.hPix, HG = R.hG, HC = R.hC;
  for (let k = 0; k < hn; k++) { const q = k * 4; HP[q] = HC[k * 3]; HP[q + 1] = HC[k * 3 + 1]; HP[q + 2] = HC[k * 3 + 2]; HP[q + 3] = HG[k]; }
  glTex('uHud', R.hcols, R.hrows, gl.RGBA, HP);
  if (R.bloom) glTex('uBloom', RW, RH, gl.RGBA, R.bloomPix);
  gl.uniform2f(U.uCanvas, R.canvas.width, R.canvas.height);
  gl.uniform2f(U.uCell, R.cw, R.chh); gl.uniform2f(U.uHCell, R.hcw, R.hchh); gl.uniform1f(U.uHS, R.hs);
  gl.uniform2f(U.uWorldN, RW, RH); gl.uniform2f(U.uHudN, R.hcols, R.hrows);
  gl.uniform2f(U.uOff, dx, dy); gl.uniform2f(U.uSkyOff, sdx, sdy);
  gl.uniform1f(U.uBloomOn, R.bloom ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- 2D canvas fallback ----------
function present2D(dx, dy, sdx, sdy, time) {
  const ctx = R.ctx, cw = R.cw, chh = R.chh, RW = R.RW, RH = R.RH;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`; ctx.fillRect(0, 0, R.canvas.width, R.canvas.height);
  if (R.skyDirty) { R.sCtx.putImageData(R.sImg, 0, 0); R.skyDirty = false; }
  ctx.drawImage(R.sCv, sdx, sdy, RW * cw, RH * chh);
  R.wCtx.putImageData(R.wImg, 0, 0);
  ctx.drawImage(R.wCv, dx, dy, RW * cw, RH * chh);
  const SH = R.wShim;   // heat haze: shimmering cells drawn again, pushed sideways
  for (let j = 0, k = 0; j < RH; j++) for (let i = 0; i < RW; i++, k++) if (SH[k] > .05 && R.wPix[k * 4 + 3]) ctx.drawImage(R.wCv, i, j, 1, 1, Math.round(dx + i * cw + shimShift(k, i, j, time)), dy + j * chh, cw, chh);
  if (R.bloom) {
    R.bloomCtx.putImageData(R.bloomImg, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.globalAlpha = .55;
    ctx.drawImage(R.bloomCv, dx, dy, RW * cw, RH * chh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  }
  const HG = R.hG, HC = R.hC, hw = R.hcw, hh = R.hchh, bg = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
  for (let r = 0; r < R.hrows; r++) for (let c = 0; c < R.hcols; c++) {
    const k = r * R.hcols + c, g = HG[k]; if (g < 32) continue;
    if (g === 127) { ctx.fillStyle = `rgb(${HC[k * 3]},${HC[k * 3 + 1]},${HC[k * 3 + 2]})`; ctx.fillRect(c * hw, r * hh, hw, hh); continue; }   // a solid block (HUD pictures)
    ctx.fillStyle = bg; ctx.fillRect(c * hw, r * hh, hw, hh);
    if (g === 32 || g > 191) continue;
    const gi = g - 32;
    ctx.drawImage(tintAtlas(HC[k * 3], HC[k * 3 + 1], HC[k * 3 + 2]), (gi & 15) * hw, (gi >> 4) * hh, hw, hh, c * hw, r * hh, hw, hh);
  }
}
const tintCache = new Map();
function tintAtlas(r, g, b) {
  const key = (r << 16) | (g << 8) | b; let a = tintCache.get(key); if (a) return a;
  a = makeCanvas(R.fontS.width, R.fontS.height); const x = a.getContext('2d');
  x.drawImage(R.fontS, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, a.width, a.height);
  if (tintCache.size > 96) tintCache.clear();
  tintCache.set(key, a); return a;
}
