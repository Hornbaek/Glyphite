// ===================== GAME · the word in rock, the ground, the sand =====================
// The showcase on the public landing page (unlisted): GLYPHITE spelled in rock standing on the ground, sand pouring onto it,
// meteors breaking it into chunks. The word is drawn by the browser into a tiny canvas and every lit pixel becomes rock, as
// in the 404 game, so it breaks like any other terrain. It is sized to the view, so a phone sees the whole word too.
const SAND = defineMaterial('sand', { albedo: [.86, .76, .52], ramp: ' .,:;=+*#%', granular: true, creep: true, tough: .1, friction: .7 });
const SLAB = defineMaterial('glyph rock', { albedo: [.95, .64, .3], ramp: " .':oO8&%#", tough: .32, shiny: .1 });
const GROUND = defineMaterial('basalt', { albedo: [.48, .5, .56], ramp: " .':oO8&%#", tough: .6, shiny: .05 });
const BEDROCK = defineMaterial('bedrock', { albedo: [.28, .29, .34], ramp: ' .:;#XWM', tough: 99, density: 1.3, anchor: true });
const RUBBLE = defineMaterial('rubble', { albedo: [.7, .52, .34], ramp: ' .,o%&', granular: true, tough: .2, grainGlyphs: 'o%&', debris: true });
worldMaterials({ edge: BEDROCK, rubble: RUBBLE, fill: GROUND });

const WORD = 'GLYPHITE';
function wordBitmap(text, px) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = `700 ${px}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 2, h = Math.ceil(px * 1.3);
  c.width = w; c.height = h; g.font = font; g.fillStyle = '#fff'; g.fillText(text, 1, px);
  const d = g.getImageData(0, 0, w, h).data, rows = [];
  for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += d[(y * w + x) * 4 + 3] > 110 ? '#' : '.'; rows.push(r); }
  while (rows.length && !rows[0].includes('#')) rows.shift();
  while (rows.length && !rows[rows.length - 1].includes('#')) rows.pop();
  return { w, h: rows.length, rows };
}

let SITE = null;
function genSite() {
  const S = RES, cols = R.cols || 200, rows = R.rows || 80;
  // a letter pixel is 2k cells wide and k tall (cells are 1 x 2 units, so it stays square); the word takes about 70% of the
  // view, from a smaller font when the view is narrow (a phone), so it always fits
  let bmp = wordBitmap(WORD, 11);
  for (const px of [9, 7]) if (bmp.w * 2 > cols * .85) bmp = wordBitmap(WORD, px);
  const k = Math.max(1, Math.min(Math.floor(cols * .85 / (bmp.w * 2)), Math.round(cols * .7 / (bmp.w * 2)))), letterCols = bmp.w * 2 * k;
  worldInit(Math.max(cols + 8, letterCols + Math.round(40 * S)), Math.max(rows + 6, bmp.h * k * 3 + Math.round(30 * S)));
  setSun(30, { kelvin: 4800 }); setAtmosphere(.25);
  const gy = Math.floor(H * .8), x0 = Math.floor((W - letterCols) / 2), y0 = gy - bmp.h * k;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    cells[y * W + x] = x < 2 || x >= W - 2 || y >= H - 3 ? BEDROCK : y < gy ? EMPTY : y < gy + 2 * S ? SAND : GROUND;
  for (let r = 0; r < bmp.h; r++) for (let c = 0; c < bmp.w; c++) if (bmp.rows[r][c] === '#')
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < 2 * k; dx++) cells[(y0 + r * k + dy) * W + x0 + c * 2 * k + dx] = SLAB;
  updateSkyline();
  SITE = { gy, x0, x1: x0 + letterCols, y0, k, letters: 0, t: 0 };
  SITE.letters = countLetters();
  return SITE;
}
// the rock still standing in the word (fallen pieces settle back as rock too, so count only above the ground)
function countLetters() { let n = 0; for (let i = 0, e = SITE.gy * W; i < e; i++) if (cells[i] === SLAB) n++; return n; }
