// The generation half of the art pipeline (tools/art/make.mjs, tools/art/gen/, tools/art/image.mjs). No network: the API answers
// here are hand-written FIXTURES shaped like the real ones (recorded November 2026), and the picture a "model" returns is drawn
// in the test. The first real generation is checked by hand (docs/ART_PIPELINE.md, "Making art with an API").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, writeJSON, loadAssets, validate } from '../../tools/art/lib.mjs';
import { encodePNG, decodePNG } from '../../tools/png.mjs';
import { blank, toPNG, fromPNG, upscale, bbox, binarize, removeKey, padTo } from '../../tools/art/image.mjs';
import { buildPrompt, pickRefs, refPicture, snapToTarget, make } from '../../tools/art/make.mjs';
import * as openai from '../../tools/art/gen/openai.mjs';
import * as bfl from '../../tools/art/gen/bfl.mjs';
import { needsProxyRestart, keyHint } from '../../tools/art/gen/index.mjs';

const PAL = ['#1e1822', '#c83c32', '#f0c850', '#50783c'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// a game folder with a style sheet (paragraph, four references), a palette, and a map with a seed
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'artgen-')), d = join(root, 'games', 'g', 'art');
  mkdirSync(join(d, 'style', 'refs'), { recursive: true }); mkdirSync(join(d, 'maps', 'bay'), { recursive: true }); mkdirSync(join(d, 'assets'), { recursive: true });
  writeFileSync(join(root, 'games', 'g', 'game.json'), '{"parts":[]}');
  const refs = ['hero', 'props', 'env', 'mood'].map(role => { writeFileSync(join(d, 'style', 'refs', `${role}.png`), toPNG(sprite(['oo', 'oy'], 2))); return { file: `refs/${role}.png`, role, from: 'test' }; });
  writeJSON(join(d, 'style', 'style.json'), { format: 'pixelite-art-style', pxPerUnit: 2, classes: { prop: { w: [2, 40], h: [2, 40] }, character: { h: [10, 20] } }, styleParagraph: 'Chunky test pixels, dark outline.', refs });
  writeJSON(join(d, 'style', 'palette.json'), { format: 'pixelite-palette', colors: PAL });
  writeJSON(join(d, 'maps', 'bay', 'palette.json'), { format: 'pixelite-palette', map: 'bay', colors: PAL.slice(0, 3) });
  writeFileSync(join(d, 'maps', 'bay', 'seed.png'), toPNG(sprite(['oy', 'yo'], 3)));
  writeFileSync(join(d, 'maps', 'bay', 'notes.md'), '# bay\n\nWhat this map looks like:\n\n- A dim hold with rust.\n- \n- Orange lamps.\n');
  return root;
}
const COL = { o: PAL[0], r: PAL[1], y: PAL[2], g: PAL[3] };
// a sprite from rows of letters ('.' = empty), blocks of `f` pixels
function sprite(rows, f = 1) {
  const im = blank(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') im.data.set([...hex(COL[c]), 255], (y * im.width + x) * 4); }));
  return f > 1 ? upscale(im, f) : im;
}
// what a "model" returns: the sprite as big blocks inside a large transparent (or magenta) picture
function modelPicture(rows, { f = 40, margin = 60, key = null } = {}) {
  const s = upscale(sprite(rows), f), W = s.width + 2 * margin, H = s.height + 2 * margin, out = blank(W, H);
  if (key) for (let i = 0; i < W * H; i++) out.data.set([...key, 255], i * 4);
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) { const o = ((y + margin) * W + x + margin) * 4, p = (y * s.width + x) * 4; if (s.data[p + 3]) out.data.set(s.data.subarray(p, p + 4), o); }
  return toPNG(out);
}
const BARREL = ['..oooo..', '.orrrro.', 'oyyyyyyo', 'orrrrrro', 'orrrrrro', 'oyyyyyyo', 'orrrrrro', '.oooooo.'];   // 8 x 8

test('image helpers: the box of a drawing, blocks, padding to a size, and the key colour removed only where it is background', () => {
  const s = sprite(['.o.', 'ooo']); assert.deepEqual(bbox(s), { x: 0, y: 0, w: 3, h: 2 });
  assert.equal(bbox(blank(4, 4)), null);
  assert.deepEqual([upscale(s, 3).width, upscale(s, 3).height], [9, 6]);
  const flat = upscale(sprite(['.o']), 2, [40, 40, 48]); assert.equal(flat.data[3], 255); assert.deepEqual(Array.from(flat.data.slice(0, 3)), [40, 40, 48], 'transparency flattened onto the ground colour');
  const p = padTo(sprite(['o']), 3, 3, 'bottom'); assert.deepEqual(bbox(p), { x: 1, y: 2, w: 1, h: 1 });
  assert.deepEqual(bbox(padTo(sprite(['o']), 3, 3)), { x: 1, y: 1, w: 1, h: 1 });
  // magenta around the subject goes; magenta INSIDE the subject (a window, not connected to the edge) stays
  const im = blank(7, 7); for (let i = 0; i < 49; i++) im.data.set([255, 0, 255, 255], i * 4);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) im.data.set([30, 24, 34, 255], (y * 7 + x) * 4);
  im.data.set([255, 0, 255, 255], (3 * 7 + 3) * 4); im.data.set([250, 20, 245, 255], (0 * 7 + 3) * 4);   // an inner pink pixel; a slightly-off edge pixel
  removeKey(im); assert.equal(im.data[3], 0, 'the corner'); assert.equal(im.data[3 * 4 + 3], 0, 'a near-magenta edge pixel');
  assert.equal(im.data[(3 * 7 + 3) * 4 + 3], 255, 'the inner pink stays'); assert.equal(im.data[(3 * 7 + 2) * 4 + 3], 255);
  const half = blank(1, 2); half.data.set([1, 2, 3, 200, 1, 2, 3, 20]); binarize(half); assert.deepEqual([half.data[3], half.data[7]], [255, 0]);
});

test('references: the class picks them, the map adds its seed, mood only when asked, never more than four', () => {
  const root = repo();
  assert.deepEqual(pickRefs('g', 'prop', { root }).map(r => r.role), ['props', 'env']);
  assert.deepEqual(pickRefs('g', 'character', { root }).map(r => r.role), ['hero', 'env']);
  assert.deepEqual(pickRefs('g', 'tile', { root, map: 'bay' }).map(r => r.role), ['env', 'seed']);
  assert.deepEqual(pickRefs('g', 'prop', { root, map: 'bay', mood: true }).map(r => r.role), ['props', 'env', 'mood', 'seed']);
  assert.deepEqual(pickRefs('g', 'prop', { root, map: 'nope' }).map(r => r.role), ['props', 'env'], 'a map with no seed adds nothing');
  const small = decodePNG(refPicture(join(root, 'games', 'g', 'art', 'style', 'refs', 'props.png')));
  assert.ok(Math.min(small.width, small.height) >= 384 && small.data[3] === 255, 'blocks big enough for a model to see, on a plain ground');
});

test('the prompt carries the style paragraph, the brief, the size, the palette, the roles of the references and the background', () => {
  const root = repo(), style = JSON.parse(readFileSync(join(root, 'games', 'g', 'art', 'style', 'style.json'), 'utf8'));
  const args = { style, cls: 'prop', brief: 'a rusty barrel.', target: { w: 10, h: 14 }, palette: PAL, refs: [{ role: 'props' }, { role: 'seed' }], mapNotes: 'A dim hold.', note: 'make the stripe thicker' };
  const t = buildPrompt({ ...args, keyed: false }), k = buildPrompt({ ...args, keyed: true });
  for (const want of ['Chunky test pixels', 'ONE prop (one object): a rusty barrel.', '10 x 14 pixels', PAL.join(' '), 'Image 1 is the objects of the game', 'Image 2 is the place this will stand in', 'A dim hold.', 'make the stripe thicker', 'on a transparent background'])
    assert.ok(t.includes(want), want);
  assert.ok(k.includes('flat solid #FF00FF magenta') && !k.includes('on a transparent background'));
  assert.ok(!buildPrompt({ ...args, refs: [], note: '', mapNotes: '' }).includes('Image 1'), 'no references, no mention of them');
});

test('snapping: a model\'s big blocks become exactly the target size on the palette, bottom-aligned for floor props', async () => {
  const r = await snapToTarget(modelPicture(BARREL), { target: { w: 8, h: 8 }, palette: PAL, anchor: 'bottom' });
  const im = decodePNG(r.png); assert.deepEqual([im.width, im.height], [8, 8]); assert.ok(r.exact);
  const used = new Set(); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) used.add('#' + [0, 1, 2].map(c => im.data[i + c].toString(16).padStart(2, '0')).join(''));
  assert.ok([...used].every(c => PAL.includes(c)), [...used].join());
  // asked for a bigger canvas than the drawing: padded, resting on the bottom
  const bigger = await snapToTarget(modelPicture(BARREL), { target: { w: 8, h: 9 }, palette: PAL, anchor: 'bottom' });
  assert.deepEqual(bbox(fromPNG(bigger.png)), { x: 0, y: 1, w: 8, h: 8 });
  // a narrower drawing than the box (aspect ratio off): fine when it fills the binding side and at least 70% of the other
  const narrow = await snapToTarget(modelPicture(BARREL), { target: { w: 10, h: 8 }, palette: PAL, anchor: 'bottom' });
  assert.deepEqual(bbox(fromPNG(narrow.png)), { x: 1, y: 0, w: 8, h: 8 });
  await assert.rejects(snapToTarget(modelPicture(BARREL), { target: { w: 14, h: 8 }, palette: PAL, tries: 2 }), /could not reach 14 x 8/, 'too narrow stays refused');
  await assert.rejects(snapToTarget(toPNG(blank(50, 50)), { target: { w: 8, h: 8 }, palette: PAL }), /nothing was drawn/);
  await assert.rejects(snapToTarget(modelPicture(BARREL), { target: { w: 3, h: 3 }, palette: PAL, snap: async () => toPNG(upscale(sprite(BARREL), 1)), tries: 2 }), /could not reach 3 x 3/);
});

test('make: a brief becomes draft versions with the prompt, references, API and snap recorded; nothing goes live', async () => {
  const root = repo(), calls = [], log = [];
  const generate = async o => { calls.push(o); return { png: modelPicture(BARREL), model: 'fixture-model', params: { size: '1024x1024' }, requestId: 'req_fixture', keyed: null }; };
  const res = await make('g', 'barrel', { root, brief: 'a barrel', n: 2, map: 'bay', generate, asset: { id: 'barrel', name: 'Barrel', class: 'prop', target: { w: 8, h: 8 }, k: .5, place: 'floor', char: null, live: null }, log: m => log.push(m) });
  assert.deepEqual(res.map(r => r.version), ['001', '002']); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].refs.map(r => r.name), ['props.png', 'env.png', 'seed.png']); assert.equal(calls[0].transparent, true); assert.equal(calls[0].model, 'gpt-image-2.6-sunburst');
  const a = loadAssets('g', root)[0], v = a.versions[0].meta;
  assert.equal(a.asset.live, null); assert.deepEqual(a.versions.map(x => x.meta.status), ['draft', 'draft']);
  assert.equal(v.kind, 'generated'); assert.equal(v.brief, 'a barrel'); assert.ok(v.prompt.includes('Chunky test pixels') && v.prompt.includes('A dim hold with rust. Orange lamps.'));
  assert.deepEqual(v.refs.map(r => [r.role, r.path]), [['props', 'style/refs/props.png'], ['env', 'style/refs/env.png'], ['seed', 'maps/bay/seed.png']]);
  assert.deepEqual([v.api.provider, v.api.model, v.api.requestId], ['openai', 'fixture-model', 'req_fixture']);
  assert.deepEqual([v.snap.palette, v.snap.colors, v.map], ['map bay', 3, 'bay']);
  for (const f of ['sprite.png', 'normals.png', 'preview.png', 'raw.png']) assert.ok(existsSync(join(a.versions[0].dir, f)), f);
  assert.deepEqual(validate('g', { root }).filter(m => !/pipeline/.test(m)), [], 'the checker accepts what make wrote');
  assert.ok(log.some(l => /candidate 2: barrel\/002/.test(l)));
});

test('make --from: the draft\'s own picture goes first as the reference to refine, its brief is kept, and its usage is recorded', async () => {
  const root = repo(), seen = [];
  const generate = async o => { seen.push(o); return { png: modelPicture(BARREL), model: 'm', params: {}, requestId: 'r', keyed: null, usage: { input_tokens: 10, output_tokens: 5 } }; };
  const asset = { id: 'barrel', name: 'Barrel', class: 'prop', target: { w: 8, h: 8 }, k: .5, place: 'floor', char: null, live: null };
  await make('g', 'barrel', { root, brief: 'a barrel', quality: 'low', generate, asset });
  const log = []; const res = await make('g', 'barrel', { root, from: '001', note: 'sharper outline', quality: 'high', generate, log: m => log.push(m) });
  assert.deepEqual(seen[1].refs.map(r => r.name), ['draft.png', 'props.png', 'env.png']); assert.equal(seen[1].quality, 'high');
  assert.ok(seen[1].prompt.includes('Image 1 is the draft to refine') && seen[1].prompt.includes('a barrel') && seen[1].prompt.includes('sharper outline'));
  const v = loadAssets('g', root)[0].versions[1].meta; assert.deepEqual([res[0].version, v.parent, v.api.usage.output_tokens], ['002', '001', 5]);
  assert.ok(log[0].includes('10 in / 5 out tokens'));
  await assert.rejects(make('g', 'barrel', { root, from: '009', generate }), /version 009 of barrel does not exist/);
});

test('make: a model without alpha is asked again for a magenta background, which is removed; flux always works that way', async () => {
  const root = repo(), seen = [];
  const generate = async o => { seen.push({ keyed: o.prompt.includes('#FF00FF'), transparent: o.transparent });
    if (o.transparent) { const e = new Error('no alpha'); e.code = 'NO_ALPHA'; throw e; }
    return { png: modelPicture(BARREL, { key: [255, 0, 255] }), model: 'm', params: {}, requestId: null, keyed: '#ff00ff' }; };
  const res = await make('g', 'barrel', { root, brief: 'a barrel', generate, asset: { id: 'barrel', name: 'Barrel', class: 'prop', target: { w: 8, h: 8 }, k: .5, place: 'floor', char: null, live: null } });
  assert.deepEqual(seen, [{ keyed: false, transparent: true }, { keyed: true, transparent: false }]); assert.ok(res[0].ok);
  assert.deepEqual(bbox(decodePNG(readFileSync(join(res[0].dir, 'sprite.png')))), { x: 0, y: 0, w: 8, h: 8 });
  const seen2 = []; await make('g', 'barrel', { root, brief: 'again', api: 'flux', generate: async o => { seen2.push(o.transparent); return { png: modelPicture(BARREL, { key: [255, 0, 255] }), keyed: '#ff00ff' }; } });
  assert.deepEqual(seen2, [false], 'flux is never asked for transparency');
});

test('make: --max-calls stops the spending, --dry shows the prompt and calls nothing, and bad input is refused before any call', async () => {
  const root = repo(); let n = 0; const generate = async () => { n++; return { png: modelPicture(BARREL), keyed: null }; };
  const asset = { id: 'barrel', name: 'Barrel', class: 'prop', target: { w: 8, h: 8 }, k: .5, place: 'floor', char: null, live: null };
  const log = []; await make('g', 'barrel', { root, brief: 'b', n: 5, maxCalls: 2, generate, asset, log: m => log.push(m) });
  assert.equal(n, 2); assert.ok(log.some(l => /--max-calls 2 reached/.test(l)));
  const bad = await make('g', 'barrel', { root, brief: 'b', generate: async () => ({ png: toPNG(blank(60, 60)), keyed: null }) });
  assert.equal(bad[0].ok, false); assert.ok(existsSync(bad[0].raw), 'a paid picture that could not be snapped is kept outside the repository');
  n = 2;
  const dry = []; assert.deepEqual(await make('g', 'barrel', { root, brief: 'b', dry: true, generate, log: m => dry.push(m) }), []); assert.equal(n, 2); assert.ok(dry[0].includes('Draw ONE prop'));
  await assert.rejects(make('g', 'barrel', { root, brief: '  ', generate }), /a brief is needed/);
  await assert.rejects(make('g', 'new-one', { root, brief: 'b', generate }), /is a new asset: give --class/);
  await assert.rejects(make('g', 'barrel', { root, brief: 'b', parent: '009', generate }), /parent 009 does not exist/);
  await assert.rejects(make('g', 'barrel', { root, brief: 'b', map: 'nope', generate }), /map nope has no palette/);
  await assert.rejects(make('g', 'barrel', { root, brief: 'b', api: 'dalle', generate }), /unknown API "dalle"/);
  assert.equal(n, 2, 'none of that spent a call');
});

// ---- the adapters, against fixture responses ----
const json = (body, status = 200, h = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...h } });

test('OpenAI: references make an images edit with every picture attached; none make a plain generation; the key is the proxy\'s unless set', async () => {
  const calls = []; const img = Buffer.from('PNGBYTES').toString('base64');
  const fetchFn = async (url, init) => { calls.push({ url, init }); return json({ data: [{ b64_json: img }], usage: { total_tokens: 5 } }, 200, { 'x-request-id': 'req_fixture' }); };
  const prev = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const r = await openai.generate({ prompt: 'p', refs: [{ png: Buffer.from('a'), name: 'props.png' }, { png: Buffer.from('b'), name: 'env.png' }], model: 'm1', quality: 'low', fetchFn });
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits'); assert.equal(calls[0].init.headers.Authorization, 'Bearer proxy-supplied');
    const fd = calls[0].init.body; assert.deepEqual([fd.get('model'), fd.get('prompt'), fd.get('size'), fd.get('quality'), fd.get('background'), fd.getAll('image[]').length], ['m1', 'p', '1024x1024', 'low', 'transparent', 2]);
    assert.equal(r.png.toString(), 'PNGBYTES'); assert.equal(r.requestId, 'req_fixture'); assert.equal(r.keyed, null);
    await openai.generate({ prompt: 'p', transparent: false, fetchFn });
    assert.equal(calls[1].url, 'https://api.openai.com/v1/images/generations'); assert.equal(JSON.parse(calls[1].init.body).background, 'opaque');
    process.env.OPENAI_API_KEY = 'sk-real'; await openai.generate({ prompt: 'p', fetchFn }); assert.equal(calls[2].init.headers.Authorization, 'Bearer sk-real');
  } finally { if (prev === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev; }
});

test('OpenAI: a model with no transparency says so (so make can ask for a key colour); other errors keep their message', async () => {
  const err = (status, error) => async () => json({ error }, status);
  await assert.rejects(openai.generate({ prompt: 'p', fetchFn: err(400, { message: 'Transparent background is not supported for this model.', param: 'background', code: 'invalid_value' }) }), e => e.code === 'NO_ALPHA');
  let tries = 0; const flaky = async () => (++tries === 1 ? json({ error: { message: 'upstream request failed' } }, 502) : json({ data: [{ b64_json: 'QQ==' }] }));
  assert.equal((await openai.generate({ prompt: 'p', fetchFn: flaky, retryMs: 1 })).png.toString(), 'A'); assert.equal(tries, 2, 'a 502 is tried again');
  let n3 = 0; await assert.rejects(openai.generate({ prompt: 'p', fetchFn: async () => { n3++; return json({ error: { message: 'down' } }, 502); }, retryMs: 1 }), /OpenAI 502: down/); assert.equal(n3, 3, 'three tries in all');
  await assert.rejects(openai.generate({ prompt: 'p', fetchFn: err(502, { message: 'down' }), retryMs: 1 }), /OpenAI 502: down/);
  await assert.rejects(openai.generate({ prompt: 'p', fetchFn: err(429, { message: 'Rate limit reached' }) }), /OpenAI 429: Rate limit reached/);
  await assert.rejects(openai.generate({ prompt: 'p', fetchFn: async () => json({ data: [] }) }), /sent no image/);
  assert.deepEqual(await openai.checkKey({ fetchFn: async () => json({ id: 'x' }) }), { ok: true, detail: 'key accepted, model gpt-image-2.6-sunburst is listed' });
  assert.match((await openai.checkKey({ fetchFn: err(404, { message: 'nope' }) })).detail, /not listed/);
  assert.match((await openai.checkKey({ fetchFn: err(401, { message: 'Incorrect API key' }) })).detail, /401: Incorrect API key/);
});

test('FLUX: submit with base64 references, poll the job\'s own polling_url, download the signed URL without the key; failures say what happened', async () => {
  const calls = [], states = ['Pending', 'Generating', 'Ready'];
  const fetchFn = async (url, init = {}) => { calls.push({ url, init });
    if (url.endsWith('/v1/flux-3-image')) return json({ id: 'job1', polling_url: 'https://api.isr.bfl.ai/v1/get_result?id=job1', cost: 4.8 });
    if (url.includes('get_result')) { const s = states.shift(); return json(s === 'Ready' ? { id: 'job1', status: s, result: { sample: 'https://delivery.example/job1.png' } } : { id: 'job1', status: s }); }
    return new Response(Buffer.from('FLUXPNG')); };
  const r = await bfl.generate({ prompt: 'p', refs: [{ png: Buffer.from('ab') }], fetchFn, pollMs: 1 });
  const body = JSON.parse(calls[0].init.body); assert.deepEqual([body.images, body.width, body.height], [[Buffer.from('ab').toString('base64')], 1024, 1024]);
  assert.equal(calls[0].init.headers['x-key'], 'proxy-supplied'); assert.equal(calls.filter(c => c.url.includes('get_result')).length, 3);
  assert.equal(calls.at(-1).url, 'https://delivery.example/job1.png'); assert.equal(calls.at(-1).init.headers, undefined, 'the signed URL gets no key');
  assert.deepEqual([r.png.toString(), r.keyed, r.requestId, r.params.cost], ['FLUXPNG', '#ff00ff', 'job1', 4.8]);
  const fail = status => async url => url.endsWith('flux-3-image') ? json({ id: 'j', polling_url: 'https://x/p' }) : json({ status, details: 'blocked by moderation' });
  await assert.rejects(bfl.generate({ prompt: 'p', fetchFn: fail('Content Moderated'), pollMs: 1 }), /ended as Content Moderated/);
  await assert.rejects(bfl.generate({ prompt: 'p', fetchFn: async () => json({ detail: [{ msg: 'Images[0] dimensions must be at least 256x256 pixels' }] }, 422) }), /FLUX 422.*at least 256x256/);
  await assert.rejects(bfl.generate({ prompt: 'p', fetchFn: fail('Pending'), pollMs: 1, maxWaitMs: 5 }), /still Pending/);
  assert.match((await bfl.checkKey({ fetchFn: async () => json({ credits: 12.5 }) })).detail, /12\.5 credits/);
});

test('the proxy switch and the key hints', () => {
  assert.equal(needsProxyRestart({ HTTPS_PROXY: 'http://p' }), true);
  assert.equal(needsProxyRestart({ HTTPS_PROXY: 'http://p', NODE_USE_ENV_PROXY: '1' }), false);
  assert.equal(needsProxyRestart({}), false);
  assert.match(keyHint('openai', {}), /OPENAI_API_KEY is not set/); assert.match(keyHint('flux', {}), /BFL_API_KEY/);
  assert.equal(keyHint('openai', { OPENAI_API_KEY: 'k' }), null); assert.equal(keyHint('flux', { CCR_AGENT_PROXY_ENABLED: '1' }), null, 'the cloud proxy supplies keys');
});

test('the command line: make --dry prints the prompt without a key; make without one stops before any call', () => {
  const root = repo(), run = (...a) => execFileSync(process.execPath, [join(ROOT, 'tools/art.mjs'), ...a], { env: { PATH: process.env.PATH, PIXELITE_ROOT: root }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = run('make', 'g', 'barrel', '--brief', 'a barrel', '--class', 'prop', '--target', '8x8', '--k', '.5', '--dry');
  assert.ok(out.includes('Draw ONE prop (one object): a barrel.') && out.includes('references: props'));
  assert.throws(() => run('make', 'g', 'barrel', '--brief', 'a barrel', '--class', 'prop', '--target', '8x8', '--k', '.5'), /OPENAI_API_KEY is not set/);
  assert.throws(() => run('make', 'g', 'barrel', '--brief', 'x', '--dry'), /a new asset needs --class/);
  assert.throws(() => run('check-keys', '--api', 'openai'), e => /openai: OPENAI_API_KEY is not set/.test(e.stdout));
});
