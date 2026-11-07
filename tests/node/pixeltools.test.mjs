// The pixel-art tools: Pixel Snapper (WebAssembly, tools/snap.mjs), the normal-map generator
// (portal/assets/normalmap-core.mjs, tools/normalmap.mjs) and the PNG reader/writer they use (tools/png.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodePNG, decodePNG } from '../../tools/png.mjs';
import { snap } from '../../tools/snap.mjs';
import { NORMALS, normalIndex, normalsFromShape, normalsFromRGBA, normalsFromMapRGBA, normalsForSprite, normalMapRGBA, relief } from '../../portal/assets/normalmap-core.mjs';

const ROOT = new URL('../../', import.meta.url);

// an 8 x 8 drawing: a red square with a yellow middle on transparent
const ART = ['........', '.rrrrrr.', '.ryyyyr.', '.ryyyyr.', '.ryyyyr.', '.ryyyyr.', '.rrrrrr.', '........'];
const COL = { r: [200, 40, 30, 255], y: [250, 220, 60, 255], '.': [0, 0, 0, 0] };
function upscaled(k) {   // the drawing at k screen pixels per art pixel, as a sloppy AI image would be (but exact here)
  const w = 8 * k, d = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) d.set(COL[ART[(y / k) | 0][(x / k) | 0]], (y * w + x) * 4);
  return { w, d };
}

test('PNG: what is written reads back the same', () => {
  const { w, d } = upscaled(3), back = decodePNG(encodePNG(w, w, d));
  assert.equal(back.width, w); assert.equal(back.height, w); assert.deepEqual(Array.from(back.data), Array.from(d));
});

// given the size of an art pixel, as the game pipelines do; on clean art it finds the size itself too (next test), on
// AI sheets not always, which is why the size can be given
test('Pixel Snapper: an upscaled drawing snaps back to its own 8 x 8 grid and colours', async () => {
  const { w, d } = upscaled(6), out = decodePNG(await snap(encodePNG(w, w, d), { colors: 4, pixelSize: 6 }));
  assert.equal(out.width, 8); assert.equal(out.height, 8);
  const at = (x, y) => Array.from(out.data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 3));
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 24);
  assert.ok(near(at(1, 1), COL.r) && near(at(3, 3), COL.y), `${at(1, 1)} / ${at(3, 3)}`);
});

test('Pixel Snapper: finds the pixel size of busy pixel art by itself, and keeps every pixel (tools/pixel-snapper.patch)', async () => {
  const C = [[200, 40, 30, 255], [250, 220, 60, 255], [40, 90, 200, 255], [30, 30, 40, 255]];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const [n, k] of [[16, 4], [12, 7]]) {
    const art = Array.from({ length: n * n }, () => (rnd() * 4) | 0), w = n * k, d = new Uint8Array(w * w * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) d.set(C[art[((y / k) | 0) * n + ((x / k) | 0)]], (y * w + x) * 4);
    const out = decodePNG(await snap(encodePNG(w, w, d), { colors: 4 }));
    assert.equal(out.width, n); assert.equal(out.height, n);
    for (let i = 0; i < n * n; i++) assert.ok(C[art[i]].slice(0, 3).every((v, j) => Math.abs(v - out.data[i * 4 + j]) < 24), `pixel ${i}`);
  }
});

test('Pixel Snapper: fractional pixel sizes (2.5, 3.2, 4.5: blocks of uneven widths, as AI art) snap exactly when given', async () => {
  const C = [[200, 40, 30, 255], [250, 220, 60, 255], [40, 90, 200, 255], [30, 30, 40, 255]];
  let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const k of [2.5, 3.2, 4.5]) {
    const n = 14, art = Array.from({ length: n * n }, () => (rnd() * 4) | 0), w = Math.round(n * k), d = new Uint8Array(w * w * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) d.set(C[art[Math.min(n - 1, Math.floor(y / k)) * n + Math.min(n - 1, Math.floor(x / k))]], (y * w + x) * 4);
    const out = decodePNG(await snap(encodePNG(w, w, d), { colors: 4, pixelSize: k }));
    assert.equal(out.width, n, `width at ${k}`); assert.equal(out.height, n, `height at ${k}`);
    for (let i = 0; i < n * n; i++) assert.ok(C[art[i]].slice(0, 3).every((v, j) => Math.abs(v - out.data[i * 4 + j]) < 24), `pixel ${i} at ${k}`);
  }
});

test('Pixel Snapper: a palette is obeyed exactly', async () => {
  const { w, d } = upscaled(5), out = decodePNG(await snap(encodePNG(w, w, d), { pixelSize: 5, palette: 'ff0000,ffff00,000000' }));
  const allowed = new Set(['255,0,0', '255,255,0', '0,0,0']);
  for (let i = 0; i < out.width * out.height; i++) if (out.data[i * 4 + 3]) assert.ok(allowed.has(Array.from(out.data.subarray(i * 4, i * 4 + 3)).join(',')));
});

test('normals: a disc faces outward at its rim and toward the viewer in its middle', () => {
  const n = 21, c = 10, mask = new Uint8Array(n * n), lum = new Float32Array(n * n).fill(.5);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = (x - c) ** 2 + (y - c) ** 2 <= 81 ? 1 : 0;
  const { idx } = normalsFromShape(n, n, mask, lum, { bevel: 3 });
  const N = (x, y) => NORMALS[idx[y * n + x]];
  assert.deepEqual(N(c, c), [0, 0, 1]);
  assert.ok(N(c + 9, c)[0] > .5, 'right rim faces right'); assert.ok(N(c - 9, c)[0] < -.5, 'left rim faces left');
  assert.ok(N(c, c - 9)[1] < -.5, 'top rim faces up (y down)'); assert.ok(N(c, c + 9)[1] > .5, 'bottom rim faces down');
  assert.equal(idx[0], 255, 'no normal outside the drawing');
});

test('normals: the same input always gives the same map, and sprite rows match the image path', () => {
  const pal = [[200, 40, 30], [250, 220, 60]], rows = ART.map(r => r.replace(/r/g, '0').replace(/y/g, '1'));
  const a = normalsForSprite({ w: 8, h: 8, pal, rows }), b = normalsForSprite({ w: 8, h: 8, pal, rows });
  assert.deepEqual(a, b);
  const { d } = upscaled(1), { idx } = normalsFromRGBA(d, 8, 8);
  assert.deepEqual(a, Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => idx[y * 8 + x] === 255 ? '.' : idx[y * 8 + x].toString(36)).join('')));
  assert.ok(a.every((r, y) => [...r].every((ch, x) => (ch === '.') === (rows[y][x] === '.'))), 'a normal exactly where there is paint');
  const img = normalMapRGBA(idx, 8, 8); assert.equal(img[3], 0); assert.equal(img[(1 * 8 + 1) * 4 + 3], 255);
});

test('normals: outlines follow the paint beside them instead of carving ridges (outline merging, as Pixel Art Lighter)', () => {
  // a 15 x 15 square of mid paint with a dark inner line across its middle
  const n = 15, mask = new Uint8Array(n * n).fill(1), lum = new Float32Array(n * n).fill(.6);
  for (let x = 0; x < n; x++) lum[7 * n + x] = .05;
  const merged = normalsFromShape(n, n, mask, lum), carved = normalsFromShape(n, n, mask, lum, { mergeOutlines: false });
  const N = (r, x, y) => NORMALS[r.idx[y * n + x]];
  assert.ok(Math.abs(N(carved, 7, 6)[1]) > .3, 'without merging the paint above the line slopes into it');
  assert.deepEqual(N(merged, 7, 6), [0, 0, 1], 'with merging the paint stays flat');
  assert.deepEqual(N(merged, 7, 7), [0, 0, 1], 'and so does the line');
});

test('normals: a map from elsewhere (green up, Pixel Art Lighter) reads back as the same directions', () => {
  const w = 33, h = 1, ours = Uint8Array.from(NORMALS.keys()), img = normalMapRGBA(ours, w, h);
  assert.deepEqual(Array.from(normalsFromMapRGBA(img, w, h)), Array.from(ours), 'our own maps are green up too');
  const up = [128, 255, 128, 255], idx = normalsFromMapRGBA(Uint8Array.from([...up, ...up, 0, 0, 0, 0]), 3, 1, { mask: [1, 0, 1] });
  assert.ok(NORMALS[idx[0]][1] < -.5, 'green up = facing up (y down)');
  assert.equal(idx[1], 255, 'masked out'); assert.equal(idx[2], 255, 'transparent');
  assert.ok(NORMALS[normalsFromMapRGBA(Uint8Array.from(up), 1, 1, { greenUp: false })[0]][1] > .5, '--green-down flips it');
});

test('normals: the table has 33 unit directions, each its own nearest entry', () => {
  assert.equal(NORMALS.length, 33);
  NORMALS.forEach((n, i) => { assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9); assert.equal(normalIndex(...n), i); });
  assert.ok(NORMALS.length <= 36, 'one base-36 character per normal');
});

test('normals: the engine uses the very same table and relief rule', () => {
  const src = readFileSync(new URL('engine/10_sprite.js', ROOT), 'utf8');
  const tab = src.match(/const SPR_NORMALS = (\(\(\) => \{[\s\S]*?\}\)\(\));/), rel = src.match(/function sprRelief\(nx, ny, nz, lx, ly, lz\) \{([\s\S]*?)\n\}/);
  assert.ok(tab && rel, 'engine/10_sprite.js defines SPR_NORMALS and sprRelief');
  const engine = new Function(`return ${tab[1]};`)(), er = new Function('nx', 'ny', 'nz', 'lx', 'ly', 'lz', rel[1]);
  assert.equal(engine.length, NORMALS.length);
  engine.forEach((n, i) => n.forEach((v, j) => assert.ok(Math.abs(v - NORMALS[i][j]) < 1e-12)));
  for (const n of NORMALS) for (const l of [[1, 0, .6], [-.3, -1, .5], [0, 0, 1], [.2, .9, .1]]) assert.ok(Math.abs(er(...n, ...l) - relief(n, ...l)) < 1e-12);
  assert.equal(relief([0, 0, 1], 1, -1, .5), 1, 'a flat pixel is lit exactly as before');
});
