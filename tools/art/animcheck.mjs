// Deterministic checks of an animation's frames (docs/ANIMATION.md): the things a person sees as a hitch when the frames play
// one after the other, measured, so a bad frame is found before it is looked at and methods can be compared on numbers.
// A frame is an RGBA picture { width, height, data } (tools/art/image.mjs); all frames of one animation share a canvas.
//   per frame:  box (alpha bbox), height, foot (lowest drawn row), centroid, head (centroid of the top third of the box),
//               edges it touches (left, top, right), clipped (those the anchor does not touch), offPalette (share of pixels not in the palette), colours, drift (how far
//               its colours are from the anchor's: half the L1 distance of the two colour histograms, 0 same .. 1 nothing shared)
//   sequence:   heightRange, footRange, headJitter / centroidJitter (largest jump between neighbours, pixels), steps (share of
//               pixels that change between neighbours), seam (the same from the last frame back to the first), and warnings
import { hexOf } from './palette.mjs';

const A = 128;

export function frameStats(im, { palette = null } = {}) {
  const { width: W, height: H, data } = im, pal = palette ? new Set(palette.map(c => c.toLowerCase())) : null, hist = new Map();
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0, off = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; if (data[o + 3] < A) continue;
    n++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const h = hexOf([data[o], data[o + 1], data[o + 2]]); hist.set(h, (hist.get(h) || 0) + 1);
    if (pal && !pal.has(h)) off++;
  }
  if (!n) return { empty: true, pixels: 0 };
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, top = y0 + Math.ceil(box.h / 3);
  let hx = 0, hy = 0, hn = 0;
  for (let y = y0; y < top; y++) for (let x = x0; x <= x1; x++) if (data[(y * W + x) * 4 + 3] >= A) { hx += x; hy += y; hn++; }
  return {
    empty: false, pixels: n, box, height: box.h, width: box.w, foot: y1, centroid: { x: sx / n, y: sy / n }, head: { x: hx / hn, y: hy / hn },
    edges: { left: x0 === 0, top: y0 === 0, right: x1 === W - 1 }, // the bottom row is where a standing character's feet belong
    offPalette: pal ? off / n : null, colours: hist.size, hist,
  };
}

// half the L1 distance of two colour histograms as shares: 0 the same colours in the same amounts, 1 nothing in common
export function histDistance(a, b) {
  const na = [...a.values()].reduce((s, v) => s + v, 0), nb = [...b.values()].reduce((s, v) => s + v, 0); let d = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) d += Math.abs((a.get(k) || 0) / na - (b.get(k) || 0) / nb);
  return d / 2;
}

// share of the drawn pixels (in either) that differ between two frames
export function frameDiff(a, b) {
  let both = 0, diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const pa = a.data[i + 3] >= A, pb = b.data[i + 3] >= A; if (!pa && !pb) continue; both++;
    if (pa !== pb || a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) diff++;
  }
  return both ? diff / both : 0;
}

const range = xs => xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
const jumps = (xs, loop) => { const out = xs.slice(1).map((v, i) => Math.abs(v - xs[i])); if (loop && xs.length > 1) out.push(Math.abs(xs[0] - xs[xs.length - 1])); return out; };

// Check a sequence. `anchor`: the approved frame the character must stay like; `ground`: the row the feet should stand on
// (default: the anchor's lowest row). Limits are what a 28 x 32 character tolerates; the warnings say which frame and what.
export function checkAnimation(frames, { palette = null, anchor = null, loop = true, ground = null, limits = {} } = {}) {
  const L = { height: 2, foot: 1, head: 2, offPalette: 0.02, drift: 0.25, step: 0.6, ...limits };
  const S = frames.map(f => frameStats(f, { palette })), warnings = [];
  const an = anchor ? frameStats(anchor, { palette }) : null, g = ground ?? (an && !an.empty ? an.foot : null);
  if (frames.some(f => f.width !== frames[0].width || f.height !== frames[0].height)) warnings.push('the frames are not all the same size');
  S.forEach((s, i) => {
    if (s.empty) { warnings.push(`frame ${i}: empty`); return; }
    s.drift = an && !an.empty ? histDistance(s.hist, an.hist) : null;
    // an edge counts only where the anchor does not touch it too (a canvas cut tight to the character touches it by design)
    s.clipped = Object.keys(s.edges).filter(e => s.edges[e] && !(an && !an.empty && an.edges[e]));
    if (s.clipped.length) warnings.push(`frame ${i}: touches the ${s.clipped.join(' and ')} edge of the canvas (cut off?)`);
    if (g != null && Math.abs(s.foot - g) > L.foot) warnings.push(`frame ${i}: feet on row ${s.foot}, the ground is row ${g}`);
    if (an && !an.empty && Math.abs(s.height - an.height) > L.height) warnings.push(`frame ${i}: ${s.height} pixels tall, the anchor ${an.height}`);
    if (s.offPalette != null && s.offPalette > L.offPalette) warnings.push(`frame ${i}: ${(s.offPalette * 100).toFixed(0)}% of its pixels are off the palette`);
    if (s.drift != null && s.drift > L.drift) warnings.push(`frame ${i}: its colours drift from the anchor's (${s.drift.toFixed(2)})`);
  });
  const ok = S.filter(s => !s.empty);
  const steps = frames.slice(1).map((f, i) => frameDiff(frames[i], f)), seam = loop && frames.length > 1 ? frameDiff(frames[frames.length - 1], frames[0]) : null;
  const headJ = jumps(ok.map(s => s.head.y), loop).concat(jumps(ok.map(s => s.head.x), loop));
  const out = {
    frames: S.map(({ hist, ...s }) => s),
    heightRange: range(ok.map(s => s.height)), footRange: range(ok.map(s => s.foot)),
    headJitter: headJ.length ? Math.max(...headJ) : 0,
    centroidJitter: Math.max(0, ...jumps(ok.map(s => s.centroid.x), loop), ...jumps(ok.map(s => s.centroid.y), loop)),
    steps, meanStep: steps.length ? steps.reduce((t, d) => t + d, 0) / steps.length : 0, seam, meanDrift: ok.length && ok[0].drift != null ? ok.reduce((t, s) => t + s.drift, 0) / ok.length : null,
    warnings,
  };
  if (out.heightRange > L.height) warnings.push(`the height changes by ${out.heightRange} pixels across the frames (it pumps)`);
  if (out.headJitter > L.head) warnings.push(`the head jumps ${out.headJitter.toFixed(1)} pixels between two frames`);
  steps.forEach((d, i) => { if (d > L.step) warnings.push(`frames ${i} → ${i + 1}: ${(d * 100).toFixed(0)}% of the pixels change (a pop)`); });
  if (seam != null && seam > L.step) warnings.push(`the loop's seam (last → first) changes ${(seam * 100).toFixed(0)}% of the pixels`);
  return out;
}
