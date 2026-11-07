// Read and write PNG files in Node without dependencies (node:zlib does the compression), for the pixel-art tools:
// tools/snap.mjs, tools/normalmap.mjs and their tests. 8-bit greyscale, grey + alpha, RGB, RGBA and palette images are read
// (palette with tRNS transparency); RGBA is written.
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

// → { width, height, data: Uint8Array RGBA }
export function decodePNG(bytes) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), kind = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); p += 12 + len;
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (kind === 'PLTE') plte = d; else if (kind === 'tRNS') trns = d; else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (bit depth ${depth}${interlace ? ', interlaced' : ''})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]; if (!ch) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {   // undo the per-row filters
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[row + x - ch] : 0, up = y ? px[row - stride + x] : 0, ul = y && x >= ch ? px[row - stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const q = a + up - ul, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      px[row + x] = v;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, o = i * 4;
    if (type === 0) { data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = 255; }
    else if (type === 4) { data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = px[s + 1]; }
    else if (type === 2) { data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = 255; }
    else if (type === 6) { data.set(px.subarray(s, s + 4), o); }
    else { const k = px[s]; data[o] = plte[k * 3]; data[o + 1] = plte[k * 3 + 1]; data[o + 2] = plte[k * 3 + 2]; data[o + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { width: w, height: h, data };
}

export function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const chunk = (kind, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const kd = Buffer.concat([Buffer.from(kind, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(kd)); return Buffer.concat([len, kd, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
