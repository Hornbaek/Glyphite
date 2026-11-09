// Palettes for the art pipeline: pick a limited palette from the colours a game's art really uses (weighted by how many pixels
// use each), and snap colours to one. Distances are in CIE Lab, so "near" is near to the eye. No DOM.
export const hexOf = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
export function lab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((.4124 * R + .3576 * G + .1805 * B) / .95047), y = f(.2126 * R + .7152 * G + .0722 * B), z = f((.0193 * R + .1192 * G + .9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export const nearest = (hexes, rgb) => { const L = lab(rgb); let best = hexes[0], bd = Infinity; for (const h of hexes) { const d = d2(L, lab(rgbOf(h))); if (d < bd) { bd = d; best = h; } } return best; };

// colours: Map hex → weight (pixels). Returns `k` hex colours, dark to light, each one a colour that is really in the art:
// weighted k-means (farthest-point start from the darkest colour), then every centre replaced by the heaviest real colour
// in its cluster, so an outline stays the outline's own near-black and nothing is invented.
export function curate(colors, k) {
  const items = [...colors].map(([h, w]) => ({ h, w, L: lab(rgbOf(h)) })).sort((a, b) => a.L[0] - b.L[0] || a.h.localeCompare(b.h));
  if (items.length <= k) return items.map(i => i.h);
  // a colour counts for more than its pixels alone: sqrt keeps one huge flat area from taking every slot
  const wt = i => Math.sqrt(i.w);
  const centres = [items[0].L];
  while (centres.length < k) {
    let far = null, fd = -1;
    for (const i of items) { const d = Math.min(...centres.map(c => d2(i.L, c))) * (1 + Math.log1p(i.w)); if (d > fd) { fd = d; far = i; } }
    centres.push(far.L);
  }
  let belong = new Array(items.length).fill(0);
  for (let it = 0; it < 30; it++) {
    let moved = false;
    items.forEach((i, n) => { let b = 0, bd = Infinity; centres.forEach((c, j) => { const d = d2(i.L, c); if (d < bd) { bd = d; b = j; } }); if (belong[n] !== b) { belong[n] = b; moved = true; } });
    centres.forEach((c, j) => { let s = [0, 0, 0], tw = 0; items.forEach((i, n) => { if (belong[n] === j) { const w = wt(i); tw += w; for (let q = 0; q < 3; q++) s[q] += i.L[q] * w; } }); if (tw) centres[j] = s.map(v => v / tw); });
    if (!moved) break;
  }
  const out = new Set();
  centres.forEach((c, j) => { let best = null; items.forEach((i, n) => { if (belong[n] === j && (!best || d2(i.L, c) - 30 * Math.log1p(i.w) < d2(best.L, c) - 30 * Math.log1p(best.w))) best = i; }); if (best) out.add(best.h); });
  return [...out].sort((a, b) => lab(rgbOf(a))[0] - lab(rgbOf(b))[0] || a.localeCompare(b));
}

// the same, for the colours of a picture (RGBA data): hex → pixels
export function histogram(data, alpha = 128) {
  const m = new Map();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= alpha) { const h = hexOf([data[i], data[i + 1], data[i + 2]]); m.set(h, (m.get(h) || 0) + 1); }
  return m;
}
