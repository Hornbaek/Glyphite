// Normal maps for pixel-art sprites, so lamps and the sun model them: a pixel facing the light is brighter, one facing away
// darker. No DOM and no Node: the PIXEL LAB page (portal/lab/) and the command line (tools/normalmap.mjs) share it, and the
// unit tests (tests/node/normalmap.test.mjs) pin it.
//
// The shape comes from the drawing itself: every pixel gets a height from its distance to the silhouette (a rounded bevel
// `bevel` pixels wide, so the edges slope away and the middle is flat) plus a little from its brightness (`detail`: light
// paint stands out, dark paint sinks in). The slope of that height field (Sobel, scaled by `strength`) is the normal.
// Outlines (paint darker than `outline`) are a drawing style, not shape, as Pixel Art Lighter (Moonfell RPG; in the PIXEL
// LAB at /lab/lighter/) puts it: they take the brightness of the paint around them, so they don't carve ridges, and then
// the direction of that paint (`mergeOutlines`).
// Normals are kept as indices into NORMALS, a fixed table of 33 directions, so a sprite's normal map is text like its rows
// (`normals: ['..0g1..', ...]`, base 36) and the engine (engine/10_sprite.js, SPR_NORMALS) reads the same table.
//
// Directions: x right, y down (screen), z toward the viewer.

// 0: facing the viewer; 1..12 tipped 20° and 13..24 tipped 42° toward 12 directions, 25..32 tipped 65° toward 8 (each ring
// starts at the right and goes clockwise): gentle slopes keep a direction instead of rounding to flat
export const NORMALS = (() => {
  const t = [[0, 0, 1]];
  for (const [tilt, n] of [[20, 12], [42, 12], [65, 8]]) for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n, s = Math.sin(tilt * Math.PI / 180);
    t.push([Math.cos(a) * s, Math.sin(a) * s, Math.cos(tilt * Math.PI / 180)]);
  }
  return t;
})();

// the table entry closest to a direction (any length)
export function normalIndex(x, y, z) {
  const l = Math.hypot(x, y, z) || 1; let best = 0, bd = -2;
  for (let i = 0; i < NORMALS.length; i++) { const n = NORMALS[i], d = (n[0] * x + n[1] * y + n[2] * z) / l; if (d > bd) { bd = d; best = i; } }
  return best;
}

export const DEFAULTS = { bevel: 3, detail: .8, strength: 2.5, smooth: true, mergeOutlines: true, outline: .16 };

// mask: 1 where the drawing is; lum: 0..1 brightness per pixel. Returns { idx: Uint8Array (255 = no pixel), height }.
export function normalsFromShape(w, h, mask, lum, opts = {}) {
  const o = { ...DEFAULTS, ...opts }, n = w * h, INF = 1e9;
  // distance to the outside (chamfer 3-4: a step costs 3, a diagonal 4), so edge pixels are 1 and the middle is far
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = mask[i] ? INF : 0;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!mask[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  // outlines: dark paint; they take the mean brightness of the other paint next to them
  const line = new Uint8Array(n), nb8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  if (o.mergeOutlines) for (let i = 0; i < n; i++) line[i] = mask[i] && lum[i] < o.outline ? 1 : 0;
  const around = (x, y, f) => { let sum = 0, c = 0; for (const [dx, dy] of nb8) { const xx = x + dx, yy = y + dy, j = yy * w + xx; if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[j] && !line[j]) { sum += f(j); c++; } } return c ? sum / c : null; };
  lum = Float32Array.from(lum);
  // height: a rounded bevel up from the edge, plus the paint's own light and dark
  let mean = 0, cnt = 0; for (let i = 0; i < n; i++) if (mask[i] && !line[i]) { mean += lum[i]; cnt++; }
  mean = cnt ? mean / cnt : .5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (line[i]) lum[i] = around(x, y, j => lum[j]) ?? mean; }
  let hf = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) {
    const b = Math.min(d[i] / 3, o.bevel) / Math.max(o.bevel, 1e-3);
    hf[i] = Math.sqrt(Math.max(0, 1 - (1 - b) * (1 - b))) + o.detail * (lum[i] - mean);
  }
  if (o.smooth) {   // one light blur inside the drawing, so single odd pixels don't make spikes
    const s = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      let sum = hf[i] * 4, wt = 4;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) { sum += hf[yy * w + xx]; wt++; } }
      s[i] = sum / wt;
    }
    hf = s;
  }
  const H = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x] ? 0 : hf[y * w + x];
  const idx = new Uint8Array(n).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) / 8;
    const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) / 8;
    idx[i] = normalIndex(-gx * o.strength, -gy * o.strength, 1);
  }
  // an outline faces where the paint beside it faces
  const merged = Uint8Array.from(idx);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!line[i]) continue;
    const v = [0, 1, 2].map(c => around(x, y, j => NORMALS[idx[j]][c]));
    if (v[0] !== null) merged[i] = normalIndex(v[0], v[1], v[2]);
  }
  return { idx: merged, height: hf };
}

const lumOf = (r, g, b) => (.3 * r + .59 * g + .11 * b) / 255;

// from an RGBA image (one art pixel per image pixel; alpha 0 = empty)
export function normalsFromRGBA(rgba, w, h, opts) {
  const n = w * h, mask = new Uint8Array(n), lum = new Float32Array(n);
  for (let i = 0; i < n; i++) { mask[i] = rgba[i * 4 + 3] > 0 ? 1 : 0; lum[i] = lumOf(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); }
  return normalsFromShape(w, h, mask, lum, opts);
}

// from a sprite's data ({ w, h, pal, rows }): its `normals` rows, ready to put beside its `rows`
export function normalsForSprite(spr, opts) {
  const { w, h, pal, rows } = spr, n = w * h, mask = new Uint8Array(n), lum = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x]; if (ch === '.' || ch === undefined) continue;
    const p = pal[parseInt(ch, 36)]; mask[y * w + x] = 1; lum[y * w + x] = lumOf(p[0], p[1], p[2]);
  }
  const { idx } = normalsFromShape(w, h, mask, lum, opts);
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => idx[y * w + x] === 255 ? '.' : idx[y * w + x].toString(36)).join(''));
}

// a normal map made elsewhere (Pixel Art Lighter in the PIXEL LAB, Aseprite, Laigter...) as our indices: each pixel's
// colour is a direction, (n + 1) × 127.5 per channel; green points up unless greenUp is false. Transparent pixels and
// pixels with no paint in `mask` (if given) get none.
export function normalsFromMapRGBA(rgba, w, h, { greenUp = true, mask = null } = {}) {
  const idx = new Uint8Array(w * h).fill(255), f = v => v / 127.5 - 1;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0 || (mask && !mask[i])) continue;
    idx[i] = normalIndex(f(rgba[i * 4]), greenUp ? -f(rgba[i * 4 + 1]) : f(rgba[i * 4 + 1]), f(rgba[i * 4 + 2]));
  }
  return idx;
}

// the normal map as a picture (the usual colours: red = right, green = up, blue = toward you; empty pixels transparent)
export function normalMapRGBA(idx, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (idx[i] === 255) continue;
    const [x, y, z] = NORMALS[idx[i]];
    out[i * 4] = (x * .5 + .5) * 255; out[i * 4 + 1] = (-y * .5 + .5) * 255; out[i * 4 + 2] = (z * .5 + .5) * 255; out[i * 4 + 3] = 255;
  }
  return out;
}

// how much brighter (> 1) or darker (< 1) a pixel with normal n is than a flat one, under light from direction l (toward the
// light, any length, z toward the viewer). The engine's sprites use the same rule (sprRelief in engine/10_sprite.js).
export function relief(n, lx, ly, lz) {
  const l = Math.hypot(lx, ly, lz) || 1, d = (n[0] * lx + n[1] * ly + n[2] * lz) / l, flat = lz / l;
  return Math.min(1.7, Math.max(.3, Math.max(0, d) / Math.max(.25, flat)));
}
