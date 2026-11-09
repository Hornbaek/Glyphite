// Snapped pixel art → a game sprite: one pixel per art pixel in, { w, h, pal, rows, normals } out (the engine's sprite format,
// engine/API.md "Sprites"), and the pictures the review shows (normal map, contact sheet). No DOM.
import { decodePNG, encodePNG } from '../png.mjs';
import { normalsForSprite, normalMapRGBA, NORMALS, relief } from '../../portal/assets/normalmap-core.mjs';
import { lum } from './lib.mjs';

// PNG → { w, h, pal: [[r,g,b,ink]], rows }. Pixels at least half opaque count; the palette is sorted dark to light, so the
// outline comes first; colours darker than `outlineLum` are outline (ink 0), as in tools/pixelsprite.py.
export function spriteFromPNG(bytes, { outlineLum = 45, alpha = 128, pal: fixed = null } = {}) {
  const { width: w, height: h, data } = decodePNG(bytes), cols = new Map();
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] >= alpha) { const c = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]; cols.set(c.join(), c); }
  // `fixed`: the shared palette of an animation's frames ([r, g, b] each, already sorted): every colour must be in it
  const pal = fixed ? fixed.map(c => c.slice(0, 3)) : [...cols.values()].sort((a, b) => lum(a) - lum(b) || a.join().localeCompare(b.join()));
  if (fixed) for (const k of cols.keys()) if (!pal.some(c => c.join() === k)) throw new Error(`colour ${k} is not in the shared palette`);
  if (pal.length > 36) throw new Error(`${pal.length} colours: a sprite takes at most 36 (snap it to fewer colours)`);
  const at = new Map(pal.map((c, i) => [c.join(), i]));
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
    const i = (y * w + x) * 4; return data[i + 3] < alpha ? '.' : at.get([data[i], data[i + 1], data[i + 2]].join()).toString(36);
  }).join(''));
  return { w, h, pal: pal.map(c => [...c, lum(c) >= outlineLum ? 1 : 0]), rows };
}
export function pngFromSprite({ w, h, pal, rows }) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch === '.') continue; const c = pal[parseInt(ch, 36)], i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return encodePNG(w, h, d);
}
export const normalRows = (spr, opts) => normalsForSprite(spr, opts);
const idxOf = (rows, w, h) => Uint8Array.from({ length: w * h }, (_, i) => { const ch = rows[(i / w) | 0][i % w]; return ch === '.' ? 255 : parseInt(ch, 36); });
export const normalsPNG = (spr, rows) => encodePNG(spr.w, spr.h, normalMapRGBA(idxOf(rows, spr.w, spr.h), spr.w, spr.h));

// The review's picture, no text needed (the order is fixed): the sprite at game size (one pixel per art pixel) and at 4x on a
// dark ground, its normal map at 4x, then lit by a lamp on the left and on the right at 4x (lit the way the engine lights a sprite
// pixel, as in the PIXEL LAB). `raw` (RGBA, optional) goes first, scaled to the sprite's height.
export function contactSheet(spr, nrows, { scale = 4, gap = 8, raw = null } = {}) {
  const { w, h, pal, rows } = spr, idx = idxOf(nrows, w, h), S = scale, H = h * S, panels = [];
  const paint = (fn, W = w * S, hh = H) => { const d = new Uint8Array(W * hh * 4); fn(d, W); panels.push({ W, H: hh, d }); };
  const px = (x, y) => { const ch = rows[y][x]; return ch === '.' ? null : pal[parseInt(ch, 36)]; };
  if (raw) { const k = H / raw.height, W = Math.max(1, Math.round(raw.width * k)); paint((d, W2) => { for (let y = 0; y < H; y++) for (let x = 0; x < W2; x++) { const sx = Math.min(raw.width - 1, (x / k) | 0), sy = Math.min(raw.height - 1, (y / k) | 0), s = (sy * raw.width + sx) * 4, a = raw.data[s + 3] / 255, o = (y * W2 + x) * 4; for (let c = 0; c < 3; c++) d[o + c] = raw.data[s + c] * a + 20 * (1 - a); d[o + 3] = 255; } }, W); }
  paint((d, W) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = px((x / S) | 0, (y / S) | 0), o = (y * W + x) * 4; d.set(c ? [...c.slice(0, 3), 255] : [20, 25, 36, 255], o); } });
  paint((d, W) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx[((y / S) | 0) * w + ((x / S) | 0)], o = (y * W + x) * 4; if (i === 255) d.set([20, 25, 36, 255], o); else { const n = NORMALS[i]; d.set([(n[0] * .5 + .5) * 255, (-n[1] * .5 + .5) * 255, (n[2] * .5 + .5) * 255, 255], o); } } });
  for (const lx of [-.6 * w, 1.6 * w]) paint((d, W) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = (x / S) | 0, sy = (y / S) | 0, i = idx[sy * w + sx], c = px(sx, sy), o = (y * W + x) * 4;
    if (!c) { d.set([20, 25, 36, 255], o); continue; }
    const dx = lx - sx - .5, dy = -.2 * h - sy - .5, dd = Math.hypot(dx, dy) || 1, f = 1.15 * (.5 + .5 * relief(NORMALS[i], dx / dd, dy / dd, .35));
    d.set([Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), 255], o); } });
  paint((d, W) => { for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const c = px(x, y), o = (y * W + x) * 4; d.set(c ? [...c.slice(0, 3), 255] : [20, 25, 36, 255], o); } }, w, h);   // game size
  const total = panels.reduce((n, p) => n + p.W, 0) + gap * (panels.length + 1), outH = H + gap * 2, out = new Uint8Array(total * outH * 4);
  for (let i = 0; i < out.length; i += 4) out.set([10, 13, 20, 255], i);
  let x0 = gap;
  for (const p of panels) { const y0 = gap + ((H - p.H) >> 1); for (let y = 0; y < p.H; y++) out.set(p.d.subarray(y * p.W * 4, (y + 1) * p.W * 4), ((y0 + y) * total + x0) * 4); x0 += p.W + gap; }
  return encodePNG(total, outH, out);
}

// games/<id>/pipeline.js: every live, emitted asset as a sprite ready for defineSprite (the game reads PIPE_ART)
const lines = (rows, ind) => rows.map(r => `${ind}${JSON.stringify(r)}`).join(',\n');
export function pipelineJs(game, items) {
  // an asset with frames: one shared palette, the first frame also as the asset's own rows (so it works as a prop), and every frame by name
  const frames = fr => `    frames: {\n${Object.entries(fr).map(([n, f]) => `      ${JSON.stringify(n)}: {\n        rows: [\n${lines(f.spr.rows, '          ')}\n        ],\n        normals: [\n${lines(f.normals, '          ')}\n        ]\n      }`).join(',\n')}\n    }`;
  const body = items.map(({ id, asset, spr, normals, frames: fr }) => [
    `  ${JSON.stringify(id)}: {`,
    `    name: ${JSON.stringify(asset.name)}, class: ${JSON.stringify(asset.class)}, char: ${JSON.stringify(asset.char || null)}, place: ${JSON.stringify(asset.place || 'floor')}, k: ${asset.k}, w: ${spr.w}, h: ${spr.h},`,
    `    pal: ${JSON.stringify(spr.pal)},`,
    `    rows: [\n${lines(spr.rows, '      ')}\n    ],`,
    `    normals: [\n${lines(normals, '      ')}\n    ]${fr ? ',\n' + frames(fr) : ''}`,
    '  }'].join('\n')).join(',\n');
  return `// ===================== GAME · art from the AI art pipeline (generated by tools/art.mjs build; do not edit) =====================
// The live version of each asset in art/assets/ (docs/ART_PIPELINE.md): one pixel per art pixel, with its normal map. Change the
// art with tools/art.mjs (add, promote), then rebuild. An asset with a map character is a prop: art.js adds it to PROP_ART.
const PIPE_ART = {
${body}
};
// The frames of an asset as engine sprites, by name (the feet, or the middle for a wall or ceiling prop, at the origin): pipeFrames('pip').walk1
function pipeFrames(id, k = PIPE_ART[id].k) {
  const a = PIPE_ART[id], out = {};
  for (const n in a.frames) out[n] = defineSprite({ w: a.w, h: a.h, pal: a.pal, rows: a.frames[n].rows, normals: a.frames[n].normals }, { k, ox: a.w / 2, oy: a.place === 'floor' ? a.h : a.h / 2 });
  return out;
}
`;
}
