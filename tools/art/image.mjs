// Small RGBA picture helpers for the generation loop. A picture is { width, height, data } (what tools/png.mjs decodes).
import { decodePNG, encodePNG } from '../png.mjs';

export const blank = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });
export const toPNG = im => Buffer.from(encodePNG(im.width, im.height, im.data));
export const fromPNG = bytes => decodePNG(bytes);

export function crop(im, x0, y0, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= im.width || sy >= im.height) continue;
    out.data.set(im.data.subarray((sy * im.width + sx) * 4, (sy * im.width + sx) * 4 + 4), (y * w + x) * 4);
  }
  return out;
}

// a picture made bigger by a whole number, every pixel a block (so the model sees the blocks of a small reference), optionally
// flattened onto a plain colour (a model reads a transparent reference as black)
export function upscale(im, f, bg = null) {
  const out = blank(im.width * f, im.height * f);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const s = (((y / f) | 0) * im.width + ((x / f) | 0)) * 4, o = (y * out.width + x) * 4, a = im.data[s + 3] / 255;
    if (bg) { for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(im.data[s + c] * a + bg[c] * (1 - a)); out.data[o + 3] = 255; } else out.data.set(im.data.subarray(s, s + 4), o);
  }
  return out;
}

// the box of what is drawn (alpha above the threshold), or null for an empty picture
export function bbox(im, alpha = 128) {
  let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] >= alpha) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// every pixel either fully there or not at all (a snapped sprite has no half-covered pixels)
export function binarize(im, alpha = 128) { for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= alpha ? 255 : 0; return im; }

// the key colour a model was asked to paint the background in, made transparent: a flood fill from the edges (so the same colour
// inside the subject stays), then one pass over what touches the cleared area, which kills the pink fringe of anti-aliasing
export function removeKey(im, key = [255, 0, 255], tol = 90) {
  const { width: W, height: H, data } = im, gone = new Uint8Array(W * H), stack = [];
  const near = i => { const o = i * 4; return Math.hypot(data[o] - key[0], data[o + 1] - key[1], data[o + 2] - key[2]) <= tol; };
  const push = i => { if (!gone[i] && near(i)) { gone[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
  const fringe = [];
  for (let i = 0; i < W * H; i++) if (!gone[i]) {
    const x = i % W, y = (i / W) | 0, o = i * 4;
    const touches = (x > 0 && gone[i - 1]) || (x < W - 1 && gone[i + 1]) || (y > 0 && gone[i - W]) || (y < H - 1 && gone[i + W]);
    if (touches && data[o] > data[o + 1] + 50 && data[o + 2] > data[o + 1] + 50) fringe.push(i);
  }
  for (const i of fringe) gone[i] = 1;
  for (let i = 0; i < W * H; i++) if (gone[i]) data[i * 4 + 3] = 0;
  return im;
}

// the picture put on a canvas of exactly w x h: centred across, and for `anchor` "bottom" resting on the bottom edge
export function padTo(im, w, h, anchor = 'centre') {
  const out = blank(w, h), ox = (w - im.width) >> 1, oy = anchor === 'bottom' ? h - im.height : (h - im.height) >> 1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const tx = ox + x, ty = oy + y; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    out.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), (ty * w + tx) * 4);
  }
  return out;
}
