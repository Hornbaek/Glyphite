#!/usr/bin/env node
// Pixel Snapper (Sprite Fusion, MIT; portal/vendor/pixel-snapper/, rebuilt by tools/build-snapper.sh) from the command line:
// it finds the grid an AI-made "pixel art" image was meant to have, snaps it to that grid (one pixel per art pixel) and to a
// palette. The PIXEL LAB page (/lab/) runs the very same WebAssembly.
//
//   node tools/snap.mjs in.png out.png [--colors 16] [--pixel-size 4] [--palette 0d2b45,203c56,...]
//
// --colors: how many colours to keep (k-means), default 16. --pixel-size: the size of one art pixel in the input, if the
// automatic guess is wrong. --palette: snap to exactly these colours instead (hex, comma separated), e.g. a game's palette.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import init, { process_image } from '../portal/vendor/pixel-snapper/spritefusion_pixel_snapper.js';

const WASM = fileURLToPath(new URL('../portal/vendor/pixel-snapper/spritefusion_pixel_snapper_bg.wasm', import.meta.url));
let ready = null;
// PNG or JPEG bytes in, PNG bytes out
export async function snap(bytes, { colors, pixelSize, palette } = {}) {
  ready ??= init({ module_or_path: readFileSync(WASM) });
  await ready;
  return Buffer.from(process_image(new Uint8Array(bytes), colors ?? null, pixelSize ?? null, palette ?? null));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = [], o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--colors') o.colors = +args[++i]; else if (a === '--pixel-size') o.pixelSize = +args[++i]; else if (a === '--palette') o.palette = args[++i];
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); } else pos.push(a);
  }
  if (pos.length !== 2) { console.error('usage: node tools/snap.mjs in.png out.png [--colors N] [--pixel-size P] [--palette hex,hex,...]'); process.exit(2); }
  const out = await snap(readFileSync(pos[0]), o);
  writeFileSync(pos[1], out);
  const { decodePNG } = await import('./png.mjs'), im = decodePNG(out);
  console.log(`snapped ${pos[0]} → ${pos[1]} (${im.width} x ${im.height} art pixels)`);
}
