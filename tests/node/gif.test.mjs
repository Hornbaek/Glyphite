// The GIF writer (tools/art/gif.mjs) round-trips: a small decoder here reads back every frame, pixel for pixel, the delays and the loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGIF } from '../../tools/art/gif.mjs';

function decode(buf) {
  const b = Buffer.from(buf); let p = 6;
  const W = b.readUInt16LE(p), H = b.readUInt16LE(p + 2), flags = b[p + 4]; p += 7;
  const pal = []; const n = 2 << (flags & 7); for (let i = 0; i < n; i++) pal.push([b[p + i * 3], b[p + i * 3 + 1], b[p + i * 3 + 2]]); p += n * 3;
  const frames = [], delays = []; let loop = null;
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) { const label = b[p + 1]; p += 2; if (label === 0xf9) delays.push(b.readUInt16LE(p + 2)); if (label === 0xff && b.toString('latin1', p + 1, p + 12) === 'NETSCAPE2.0') loop = b.readUInt16LE(p + 14); while (b[p]) p += b[p] + 1; p++; continue; }
    p += 10; const min = b[p++]; const data = []; while (b[p]) { data.push(...b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; } p++;
    const clear = 1 << min, eoi = clear + 1; let size = min + 1, dict = [], prev = null, bits = 0, cur = 0, i = 0; const out = [];
    const reset = () => { dict = []; for (let c = 0; c < clear; c++) dict[c] = [c]; dict[clear] = []; dict[eoi] = []; size = min + 1; prev = null; };
    reset();
    for (;;) {
      while (bits < size) { cur |= data[i++] << bits; bits += 8; }
      const code = cur & ((1 << size) - 1); cur >>>= size; bits -= size;
      if (code === clear) { reset(); continue; } if (code === eoi) break;
      let entry = dict[code];
      if (prev === null) { out.push(...entry); prev = entry; continue; }
      if (entry === undefined) entry = [...prev, prev[0]];
      out.push(...entry); dict.push([...prev, entry[0]]); prev = entry;
      if (dict.length === (1 << size) && size < 12) size++;
    }
    frames.push(out.slice(0, W * H).map(k => pal[k]));
  }
  return { W, H, frames, delays, loop };
}

test('frames, colours, delays and the loop come back as they went in', () => {
  const mk = (W, H, f) => { const d = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) d.set([...f(i), 255], i * 4); return { width: W, height: H, data: d }; };
  // 200 colours over many pixels: the LZW dictionary fills and is cleared again several times
  const a = mk(120, 90, i => { const v = (i * 7919) % 200; return [v, (v * 3) % 256, (v * 5) % 256]; }), c = mk(120, 90, i => (i % 7 ? [255, 255, 255] : [10, 20, 30]));
  const g = decode(encodeGIF([a, c], { delays: [8, 60], loop: 0 }));
  assert.deepEqual([g.W, g.H, g.frames.length, g.delays, g.loop], [120, 90, 2, [8, 60], 0]);
  [a, c].forEach((f, k) => { for (let i = 0; i < 120 * 90; i++) assert.deepEqual(g.frames[k][i], Array.from(f.data.subarray(i * 4, i * 4 + 3)), `frame ${k} pixel ${i}`); });
  assert.throws(() => encodeGIF([mk(30, 30, i => [i % 256, (i >> 8) * 50, 0])]), /more than 256 colours/);   // 900 different colours
});
