#!/usr/bin/env node
// Normal maps for pixel-art sprites, from the command line (the generator is portal/assets/normalmap-core.mjs, shared with
// the PIXEL LAB page). The input is pixel art at one art pixel per image pixel (snap AI art first: tools/snap.mjs).
//
//   node tools/normalmap.mjs in.png [--out normals.png] [--bevel 3] [--detail .8] [--strength 2.5] [--no-smooth] [--rows]
//
// --out writes the normal map as a picture (red = right, green = up, blue = toward you). --rows prints the `normals` rows a
// sprite takes (base 36 into the engine's table, '.' where there is no pixel). --bevel: how many pixels in from the edge the
// shape rounds off; --detail: how much the paint's own light and dark raise and sink it; --strength: how steep it all is.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { normalsFromRGBA, normalMapRGBA } from '../portal/assets/normalmap-core.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = [], o = {}; let out = null, rows = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') out = args[++i]; else if (a === '--rows') rows = true; else if (a === '--no-smooth') o.smooth = false;
    else if (['--bevel', '--detail', '--strength'].includes(a)) o[a.slice(2)] = +args[++i];
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); } else pos.push(a);
  }
  if (pos.length !== 1 || (!out && !rows)) { console.error('usage: node tools/normalmap.mjs in.png [--out normals.png] [--rows] [--bevel B] [--detail D] [--strength S] [--no-smooth]'); process.exit(2); }
  const im = decodePNG(readFileSync(pos[0])), { idx } = normalsFromRGBA(im.data, im.width, im.height, o);
  if (out) { writeFileSync(out, encodePNG(im.width, im.height, normalMapRGBA(idx, im.width, im.height))); console.error(`wrote ${out} (${im.width} x ${im.height})`); }
  if (rows) for (let y = 0; y < im.height; y++) console.log(Array.from({ length: im.width }, (_, x) => { const v = idx[y * im.width + x]; return v === 255 ? '.' : v.toString(36); }).join(''));
}
