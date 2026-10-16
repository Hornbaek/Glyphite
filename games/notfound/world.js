// ===================== GAME · the missing address, spelled out in rock =====================
// The page asks the browser to draw the address it could not find into a tiny canvas, reads the pixels back and
// builds every lit pixel as a block of rock standing on the ground. A rocket then breaks it like any other terrain.
const REGO = defineMaterial('regolith', { albedo: [.72, .69, .63], ramp: ' .,:;=+*#%', granular: true, creep: true, tough: .12, friction: .75 });
const SLAB = defineMaterial('slab', { albedo: [.86, .58, .3], ramp: " .':oO8&%#", tough: .3, shiny: .08 });
const ROCK = defineMaterial('basalt', { albedo: [.5, .52, .57], ramp: " .':oO8&%#", tough: .55, shiny: .05 });
const BEDROCK = defineMaterial('bedrock', { albedo: [.3, .31, .35], ramp: ' .:;#XWM', tough: 99, density: 1.3, anchor: true });
const RUBBLE = defineMaterial('rubble', { albedo: [.6, .5, .4], ramp: ' .,o%&', granular: true, tough: .2, grainGlyphs: 'o%&', debris: true });
worldMaterials({ edge: BEDROCK, rubble: RUBBLE, fill: ROCK });

// what the visitor asked for, made safe to draw: printable ASCII only, and the tail of it when it is long
// (?path=/x lets a test or a preview pick the address; opened directly from the game list it is a sample)
function missingPath() {
  let p = new URLSearchParams(location.search).get('path');
  if (p === null) p = /\/games\/notfound\//.test(location.pathname) ? '/no/such/page' : location.pathname;
  try { p = decodeURIComponent(p); } catch (e) { }
  p = p.replace(/[^\x20-\x7e]/g, '?').trim() || '/';
  return p.length > 14 ? '...' + p.slice(-11) : p;
}
function pathBitmap(text) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '700 11px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 2, h = 14;
  c.width = w; c.height = h; g.font = font; g.fillStyle = '#fff'; g.fillText(text, 1, 11);
  const d = g.getImageData(0, 0, w, h).data, rows = [];
  for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += d[(y * w + x) * 4 + 3] > 110 ? '#' : '.'; rows.push(r); }
  return { w, h, rows };
}

let SITE = null;
function genSite() {
  const S = RES, k = Math.max(1, Math.round(RES)), text = missingPath(), bmp = pathBitmap(text);
  const letterCols = bmp.w * 2 * k;                       // a pixel is 2k cells wide and k tall: cells are 1 x 2 units, so it stays square
  worldInit(Math.max(Math.round(260 * S), letterCols + Math.round(90 * S)), Math.round(150 * S));
  setSun(13); setAtmosphere(0);
  const gy = Math.floor(H * .8), x0 = Math.floor((W - letterCols) / 2), y0 = gy - bmp.h * k;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    cells[y * W + x] = x < 3 * S || x >= W - 3 * S || y >= H - 4 * S ? BEDROCK : y < gy ? EMPTY : y < gy + 3 * S ? REGO : ROCK;
  }
  for (let r = 0; r < bmp.h; r++) for (let c = 0; c < bmp.w; c++) if (bmp.rows[r][c] === '#')
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < 2 * k; dx++) cells[(y0 + r * k + dy) * W + x0 + c * 2 * k + dx] = SLAB;
  updateSkyline();
  SITE = { text, gy, x0, x1: x0 + letterCols, y0, letters: 0 };
  SITE.letters = countLetters();
  return SITE;
}
const countLetters = () => { let n = 0; for (let i = 0; i < gyCells(); i++) if (cells[i] === SLAB) n++; return n; };   // the rock standing above the ground
const gyCells = () => SITE ? SITE.gy * W : 0;
