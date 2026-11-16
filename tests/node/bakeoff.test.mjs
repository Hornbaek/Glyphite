// The animation bake-off (tools/art/bakeoff.mjs) without the network: the "model" answers with Pip's own base picture (per frame)
// or a sheet of it (the strip), so every frame must come back as Pip's sprite, on the same pixels, and the comparison must say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, readJSON } from '../../tools/art/lib.mjs';
import { blank, toPNG, fromPNG, upscale } from '../../tools/art/image.mjs';
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
