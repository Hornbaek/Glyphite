// A small animated-GIF writer for the art tools' previews (a rig playing, frames playing), no dependencies. Pictures are RGBA
// { width, height, data } of one size with at most 256 colours between them (guides and pixel art are far below; transparency is
// flattened onto `bg`). LZW as the GIF89a spec has it; the codes go out as the decoder expects them.
const lzw = (indices, minCode) => {
  const clear = 1 << minCode, eoi = clear + 1, out = [];
  let size = minCode + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0;
  const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 4096 + k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    dict.set(key, next++);
    // the decoder adds its entries one code later, so the width grows once the next code no longer fits the current one
    if (next > (1 << size) && size < 12) size++;
    if (next >= 4095) { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
};

// frames: [{ width, height, data }], delays: hundredths of a second per frame (one number for all), loop: 0 = for ever
export function encodeGIF(frames, { delays = 10, loop = 0, bg = [255, 255, 255] } = {}) {
  const { width: W, height: H } = frames[0], colours = new Map(), idx = [];
  const rgb = (d, o) => { const a = d[o + 3] / 255; return [0, 1, 2].map(c => Math.round(d[o + c] * a + bg[c] * (1 - a))); };
  for (const f of frames) {
    if (f.width !== W || f.height !== H) throw new Error('every frame of a GIF must be the same size');
    const ix = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const c = rgb(f.data, i * 4), key = (c[0] << 16) | (c[1] << 8) | c[2];
      let n = colours.get(key);
      if (n === undefined) { if (colours.size >= 256) throw new Error('more than 256 colours: a GIF cannot hold them'); n = colours.size; colours.set(key, n); }
      ix[i] = n;
    }
    idx.push(ix);
  }
  const bitsFor = Math.max(1, Math.ceil(Math.log2(Math.max(2, colours.size)))), tableSize = 1 << bitsFor, minCode = Math.max(2, bitsFor);
  const b = [];
  const u16 = v => b.push(v & 255, (v >> 8) & 255);
  b.push(...Buffer.from('GIF89a')); u16(W); u16(H); b.push(0x80 | (bitsFor - 1), 0, 0);
  const table = new Array(tableSize * 3).fill(0); for (const [key, n] of colours) table.splice(n * 3, 3, (key >> 16) & 255, (key >> 8) & 255, key & 255);
  b.push(...table);
  b.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1); u16(loop); b.push(0);
  idx.forEach((ix, i) => {
    const d = Array.isArray(delays) ? delays[i] : delays;
    b.push(0x21, 0xf9, 4, 0); u16(d); b.push(0, 0);
    b.push(0x2c); u16(0); u16(0); u16(W); u16(H); b.push(0);
    const data = lzw(ix, minCode); b.push(minCode);
    for (let p = 0; p < data.length; p += 255) { const n = Math.min(255, data.length - p); b.push(n, ...data.slice(p, p + n)); }
    b.push(0);
  });
  b.push(0x3b);
  return Buffer.from(b);
}
