// The animation bake-off (tools/art/bakeoff.mjs) without the network: the "model" answers with Pip's own base picture (per frame)
// or a sheet of it (the strip), so every frame must come back as Pip's sprite, on the same pixels, and the comparison must say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, readJSON } from '../../tools/art/lib.mjs';
import { blank, toPNG, fromPNG, upscale, removeKey } from '../../tools/art/image.mjs';
import { bakeoff, load, frameActions, baseMap, register } from '../../tools/art/bakeoff.mjs';
import { frameStats } from '../../tools/art/animcheck.mjs';

// a checkout with only what the bake-off reads: Pip's style, palette, base version and walk
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'bakeoff-')), src = join(ROOT, 'games', 'spacemouse', 'art'), dst = join(root, 'games', 'spacemouse', 'art');
  for (const p of ['style', 'anims', join('assets', 'pip', '002')]) cpSync(join(src, p), join(dst, p), { recursive: true });
  cpSync(join(src, 'assets', 'pip', 'asset.json'), join(dst, 'assets', 'pip', 'asset.json'));
  return root;
}

test('the words for each frame: keys say their action, mirrored keys swap near and far, in-betweens name both ends', () => {
  const L = load('spacemouse', 'pip-walk'), acts = frameActions(L.animation);
  assert.equal(acts.length, 8);
  assert.ok(acts[0].key && /near \(front\) boot/.test(acts[0].text));
  assert.ok(acts[4].key && /far \(front\) boot/.test(acts[4].text), 'frame 4 is contact with the other foot');
  assert.ok(!acts[1].key && /From: contact.*Towards: passing/.test(acts[1].text));
  // the guide's framing puts sprite pixel 0,0 where the base's lattice put it in the raw picture
  const m = baseMap(L.lattice);
  assert.equal(m.s, L.lattice.pixelSize);
  assert.equal(m.ox, L.lattice.cropBox.x - L.lattice.offset.x * L.lattice.pixelSize);
});

test('register: the feet go on the ground row and the head over the base head', () => {
  const im = blank(10, 10); for (let y = 2; y < 6; y++) for (let x = 1; x < 4; x++) im.data.set([200, 50, 50, 255], (y * 10 + x) * 4);
  const r = register(im, { w: 10, h: 12, foot: 11, headX: 6 }), s = frameStats(r.im);
  assert.equal(s.foot, 11); assert.equal(Math.round(s.head.x), 6); assert.equal(r.cut, 0);
});

test('a dry run writes the guides and makes no call', async () => {
  const root = repo(); let calls = 0, log = [];
  const r = await bakeoff('spacemouse', 'pip-walk', { root, dry: true, generate: async () => { calls++; }, log: m => log.push(m) });
  assert.equal(calls, 0); assert.equal(r.calls, 0);
  assert.equal(r.guides.files.length, 8);
  assert.ok(existsSync(join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk', 'guides', 'strip.png')));
  assert.ok(log.some(l => l.includes('POSE GUIDE')));
});

test('per frame and as a strip: the base picture back gives Pip on the same pixels in every frame; the report and sheet are written', async () => {
  const root = repo(), L = load('spacemouse', 'pip-walk', root), raw = readFileSync(L.raw), seen = [];
  // the strip's "model" draws the base sprite at 11 px per pixel, centred in each cell of the guide sheet
  const sheet = () => {
    const big = upscale(L.sprite, 11), out = blank(1536, 1024);
    for (let i = 0; i < 8; i++) { const cx = (i % 4) * 384 + ((384 - big.width) >> 1), cy = Math.floor(i / 4) * 512 + ((512 - big.height) >> 1);
      for (let y = 0; y < big.height; y++) out.data.set(big.data.subarray(y * big.width * 4, (y + 1) * big.width * 4), ((cy + y) * 1536 + cx) * 4); }
    return toPNG(out);
  };
  const generate = async o => { seen.push(o); return { png: o.size === 1024 ? raw : sheet(), keyed: null, usage: { input_tokens: 10, output_tokens: 20 } }; };
  const r = await bakeoff('spacemouse', 'pip-walk', { root, methods: ['openai-frame', 'openai-strip'], generate, maxCalls: 9 });
  assert.equal(r.calls, 9);
  assert.equal(seen[0].refs.length, 2, 'base picture and pose guide');
  assert.ok(/POSE GUIDE/.test(seen[0].prompt) && /contact/.test(seen[0].prompt), 'the first call is a key pose');
  const out = join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk'), base = Array.from(L.sprite.data);
  const b0 = frameStats(L.sprite);
  for (let i = 0; i < 8; i++) {
    const im = fromPNG(readFileSync(join(out, 'openai-frame', `f${i}.png`))), s = frameStats(im);
    assert.deepEqual([s.box, s.foot], [b0.box, b0.foot], `openai-frame f${i} sits where the base does`);
    let same = 0, n = 0; for (let k = 3; k < base.length; k += 4) if (base[k] || im.data[k]) { n++; if (base[k] === im.data[k]) same++; }
    assert.ok(same / n > 0.97, `openai-frame f${i} covers the base's pixels (${(same / n * 100).toFixed(1)}%)`);
  }
  for (let i = 0; i < 8; i++) {
    const s = frameStats(fromPNG(readFileSync(join(out, 'openai-strip', `f${i}.png`)))), b = frameStats(L.sprite);
    assert.equal(s.foot, b.foot, `strip f${i} stands on the base's ground`); assert.ok(Math.abs(s.height - b.height) <= 1, `strip f${i} keeps the base's size`);
  }
  const meta = readJSON(join(out, 'openai-frame', 'meta.json'));
  assert.equal(meta.calls, 8); assert.equal(meta.usage.length, 8); assert.equal(meta.prompts.length, 8);
  const report = readFileSync(join(out, 'report.md'), 'utf8');
  assert.match(report, /\| openai-frame \| .* \| 8 \| 8\/8 \| 0 \| 0 \| 0\.0 \| 0% \| 0% \|/);
  assert.ok(existsSync(join(out, 'compare.png')));
});

test('--max-calls stops the run and says which frames were not made', async () => {
  const root = repo(), raw = readFileSync(load('spacemouse', 'pip-walk', root).raw);
  const r = await bakeoff('spacemouse', 'pip-walk', { root, methods: ['openai-frame'], maxCalls: 3, generate: async () => ({ png: raw, keyed: null }) });
  assert.equal(r.calls, 3);
  const meta = readJSON(join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk', 'openai-frame', 'meta.json'));
  assert.equal(meta.frames.filter(f => /max-calls/.test(f.error || '')).length, 5);
});

test('video frames: n picked evenly over one pass of a loop (the last frame is the first again)', async () => {
  const { pick } = await import('../../tools/art/bakeoff.mjs');
  assert.deepEqual(pick(33, 8), [0, 4, 8, 12, 16, 20, 24, 28]);
  assert.deepEqual(pick(9, 8), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('a green key comes off with its fringe, and nothing of the subject goes', () => {
  const im = blank(12, 12);
  for (let i = 0; i < 144; i++) im.data.set([0, 255, 0, 255], i * 4);
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) im.data.set([237, 106, 89, 255], (y * 12 + x) * 4);   // Pip's pink
  for (let x = 3; x < 9; x++) im.data.set([90, 200, 80, 255], (2 * 12 + x) * 4);                                   // a greenish compression fringe
  const out = removeKey(im, [0, 255, 0], 120), s = frameStats(out);
  assert.deepEqual(s.box, { x: 3, y: 3, w: 6, h: 6 });
});

test('rd-animation: the right-facing row of the sheet goes on the key frames, registered on the base', async () => {
  const root = repo(), L = load('spacemouse', 'pip-walk', root);
  // a fake 4 x 4 sheet of 48 x 48 cells: a 10 x 20 block in each cell, red in the right-facing row (the 2nd)
  const sheet = blank(192, 192);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let y = 20; y < 40; y++) for (let x = 19; x < 29; x++) sheet.data.set([r === 1 ? 200 : 40, 50, 50, 255], ((r * 48 + y) * 192 + c * 48 + x) * 4);
  const seen = [], fake = { run: async (model, input) => { seen.push({ model, input }); return { output: 'u', id: 'p1', metrics: { predict_time: 6 }, version: 'v' }; }, download: async () => [toPNG(sheet)] };
  const r = await bakeoff('spacemouse', 'pip-walk', { root, methods: ['rd-animation'], replicate: fake });
  assert.equal(r.calls, 1); assert.equal(seen[0].model, 'retro-diffusion/rd-animation'); assert.equal(seen[0].input.style, 'four_angle_walking');
  const out = join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk', 'rd-animation'), b = frameStats(L.sprite);
  for (const i of [0, 2, 4, 6]) { const s = frameStats(fromPNG(readFileSync(join(out, `f${i}.png`)))); assert.equal(s.foot, b.foot); assert.equal(s.height, 20); }
  assert.ok(!existsSync(join(out, 'f1.png')), 'no in-betweens');
  assert.match(readJSON(join(out, 'meta.json')).frames[1].error, /4 frames per walk/);
});

test('the Replicate client: community models run by version, official ones by name; a 429 is waited out', async () => {
  const rep = await import('../../tools/art/gen/replicate.mjs'), calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body, clone() { return this; } });
  const fake = official => async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    if (url.endsWith('/models/o/m')) return res(200, { is_official: official, latest_version: { id: 'v9' } });
    if (init.method === 'POST' && calls.filter(c => c[0] === 'POST').length === 1) return res(429, { detail: 'Request was throttled. Your rate limit resets in ~0s.' });
    if (init.method === 'POST') return res(201, { id: 'p', status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/p' } });
    return res(200, { id: 'p', status: 'succeeded', output: ['https://replicate.delivery/x.png'], metrics: { predict_time: 1 } });
  };
  const a = await rep.run('o/m', { a: 1 }, { fetchFn: fake(false), pollMs: 0, retryMs: 0 });
  assert.deepEqual(a.output, ['https://replicate.delivery/x.png']);
  assert.deepEqual(calls.filter(c => c[0] === 'POST').map(c => c[1]), ['https://api.replicate.com/v1/predictions', 'https://api.replicate.com/v1/predictions'], 'by version, asked again after the 429');
  calls.length = 0;
  await rep.run('o/m', {}, { fetchFn: fake(true), pollMs: 0, retryMs: 0 });
  assert.equal(calls.find(c => c[0] === 'POST')[1], 'https://api.replicate.com/v1/models/o/m/predictions');
  assert.match(rep.dataURI(Buffer.from('x')), /^data:image\/png;base64,eA==$/);
});

test('--reuse cuts a saved output again without a call, keeping the record of the call that made it', async () => {
  const root = repo(), sheet = blank(192, 192);
  for (let c = 0; c < 4; c++) for (let y = 20; y < 40; y++) for (let x = 19; x < 29; x++) sheet.data.set([200, 50, 50, 255], ((48 + y) * 192 + c * 48 + x) * 4);
  let n = 0; const fake = { run: async () => { n++; return { output: 'u', id: 'p1', metrics: { predict_time: 6 }, version: 'v' }; }, download: async () => [toPNG(sheet)] };
  await bakeoff('spacemouse', 'pip-walk', { root, methods: ['rd-animation'], replicate: fake });
  const r = await bakeoff('spacemouse', 'pip-walk', { root, methods: ['rd-animation'], replicate: fake, reuse: true });
  assert.equal(n, 1); assert.equal(r.calls, 0);
  const meta = readJSON(join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk', 'rd-animation', 'meta.json'));
  assert.equal(meta.calls, 1); assert.equal(meta.usage[0].requestId, 'p1'); assert.ok(meta.recut);
});

test('PixelLab: the rig as its 18 joints (near = RIGHT, drawn on top), the face following the head; the method sends them and keeps the frames', async () => {
  const { pixellabKeypoints } = await import('../../tools/art/bakeoff.mjs');
  const L = load('spacemouse', 'pip-walk'), k = pixellabKeypoints(L.rig, L.A.pixellab, L.poses[0]), at = l => k.find(p => p.label === l);
  assert.equal(k.length, 18);
  assert.ok(at('RIGHT LEG').x > at('LEFT LEG').x, 'contact: the near (right) foot is forward');
  assert.ok(at('RIGHT KNEE').z_index > at('LEFT KNEE').z_index && at('NECK').z_index === 0);
  assert.ok(k.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  assert.throws(() => pixellabKeypoints(L.rig, { joints: { NECK: 'neck' } }, L.poses[0]), /leaves out/);
  const root = repo(), seen = [], fake = { animateWithSkeleton: async o => { seen.push(o); return { frames: o.keypoints.map(() => toPNG(L.sprite)), usage: { type: 'usd', usd: 0 }, jobId: 'j1' }; } };
  const r = await bakeoff('spacemouse', 'pip-walk', { root, methods: ['pixellab-skeleton'], pixellab: fake });
  assert.equal(r.calls, 1); assert.equal(seen[0].keypoints.length, 8); assert.equal(seen[0].firstKeypoints.length, 18); assert.equal(seen[0].direction, 'east');
  const report = readFileSync(join(root, 'games', 'spacemouse', 'art', 'bakeoff', 'pip-walk', 'report.md'), 'utf8');
  assert.match(report, /\| pixellab-skeleton \| .* \| 1 \| 8\/8 \| 0 \| 0 \| 0\.0 \| 0% \| 0% \|/);
});

// a checkout with Space Whiskers' Pip and walk: an imported base without a lattice, and the sheet's frames as keys
function repoSW() {
  const root = mkdtempSync(join(tmpdir(), 'bakeoff-sw-')), src = join(ROOT, 'games', 'spacewhiskers', 'art'), dst = join(root, 'games', 'spacewhiskers', 'art');
  for (const p of ['style', 'anims']) cpSync(join(src, p), join(dst, p), { recursive: true });
  for (const v of ['001', '002', '003', '004', '005']) cpSync(join(src, 'assets', 'pip', v), join(dst, 'assets', 'pip', v), { recursive: true });
  cpSync(join(src, 'assets', 'pip', 'asset.json'), join(dst, 'assets', 'pip', 'asset.json'));
  return root;
}

test('keys: an animation names approved drawings as keys; sheet-keys shows them alone; methods that need a lattice say so', async () => {
  const root = repoSW(), L = load('spacewhiskers', 'pip-walk', root);
  assert.equal(L.lattice, null);
  assert.deepEqual(L.keys.map(k => [k.frame, k.version]), [[0, '002'], [2, '003'], [4, '004'], [6, '005']]);
  const r = await bakeoff('spacewhiskers', 'pip-walk', { root, methods: ['sheet-keys', 'openai-frame'], generate: async () => { throw new Error('no call expected'); } });
  assert.equal(r.calls, 0);
  const out = join(root, 'games', 'spacewhiskers', 'art', 'bakeoff', 'pip-walk');
  for (const [i, v] of [[0, '002'], [2, '003'], [4, '004'], [6, '005']])
    assert.deepEqual(Array.from(fromPNG(readFileSync(join(out, 'sheet-keys', `f${i}.png`))).data), Array.from(fromPNG(readFileSync(join(root, 'games', 'spacewhiskers', 'art', 'assets', 'pip', v, 'sprite.png'))).data), `key f${i} is pip/${v} as it is`);
  assert.ok(!existsSync(join(out, 'sheet-keys', 'f1.png')));
  assert.match(readJSON(join(out, 'openai-frame', 'meta.json')).frames[0].error, /no lattice/);
  assert.ok(existsSync(join(out, 'guides', 'f7.png')), 'guides at 16x the sprite when the base has no picture of its own');
});

test('keyPicture: a key blown up by a whole number onto a green square, centred', async () => {
  const { keyPicture } = await import('../../tools/art/bakeoff.mjs');
  const im = blank(57, 55); im.data.set([200, 50, 50, 255], 0);
  const p = keyPicture(im), pic = fromPNG(p.png);
  assert.equal(p.f, 8); assert.equal(pic.width, 512);
  assert.deepEqual(Array.from(pic.data.subarray((p.oy * 512 + p.ox) * 4, (p.oy * 512 + p.ox) * 4 + 4)), [200, 50, 50, 255], 'the key\'s first pixel, at its place');
  assert.deepEqual(Array.from(pic.data.subarray(0, 4)), [0, 255, 0, 255], 'green round it');
});

test('wan-segments: one clip per pair of neighbouring keys (first and last frame), the in-betweens from its middle, the keys kept', async () => {
  const root = repoSW(), L = load('spacewhiskers', 'pip-walk', root), seen = [];
  // a fake clip: 9 frames of the first key's picture (ffmpeg makes it from PNGs, so the test needs ffmpeg like the method does)
  const { execFileSync } = await import('node:child_process'), d = mkdtempSync(join(tmpdir(), 'clip-'));
  const { keyPicture } = await import('../../tools/art/bakeoff.mjs'), pic = keyPicture(L.keys[0].im);
  for (let i = 0; i < 9; i++) writeFileSync(join(d, `${String(i).padStart(3, '0')}.png`), pic.png);
  execFileSync('ffmpeg', ['-v', 'error', '-framerate', '8', '-i', join(d, '%03d.png'), '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv444p', join(d, 'c.mp4')]);
  const clip = readFileSync(join(d, 'c.mp4'));
  const fake = { run: async (model, input) => { seen.push({ model, input }); return { output: 'u', id: `p${seen.length}`, metrics: { predict_time: 1 }, version: 'v' }; }, download: async () => [clip] };
  const r = await bakeoff('spacewhiskers', 'pip-walk', { root, methods: ['wan-segments'], replicate: fake, maxCalls: 9 });
  assert.equal(r.calls, 4, 'four pairs round the loop');
  assert.ok(seen.every(s => s.model === 'wan-video/wan-2.7-i2v' && s.input.first_frame && s.input.last_frame));
  const out = join(root, 'games', 'spacewhiskers', 'art', 'bakeoff', 'pip-walk', 'wan-segments'), b = frameStats(L.sprite);
  for (let i = 0; i < 8; i++) assert.ok(existsSync(join(out, `f${i}.png`)), `f${i}`);
  const mid = frameStats(fromPNG(readFileSync(join(out, 'f1.png'))));
  assert.equal(mid.foot, b.foot); assert.ok(Math.abs(mid.height - frameStats(L.keys[0].im).height) <= 2, 'an in-between back at the game\'s pixel size');
});
