// The art pipeline (tools/art.mjs, tools/art/, docs/ART_PIPELINE.md): the files of games/<id>/art/, the sprite builder, the
// generated pipeline.js, and what the checker refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePNG, decodePNG } from '../../tools/png.mjs';
import { ROOT, validate, loadAssets, toJSON, writeJSON, toHex } from '../../tools/art/lib.mjs';
import { spriteFromPNG, pngFromSprite, normalRows, contactSheet, pipelineJs } from '../../tools/art/sprite.mjs';
import { writeVersion, buildText, liveItems, paletteOf } from '../../tools/art.mjs';
import { curate, nearest, lab, rgbOf } from '../../tools/art/palette.mjs';

// a tiny sprite: a 4 x 3 block, dark outline, a red middle, one empty corner
const COL = { o: [30, 24, 34], r: [200, 60, 50], y: [240, 200, 80] };
function png(rows) {
  const w = rows[0].length, h = rows.length, d = new Uint8Array(w * h * 4);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') d.set([...COL[ch], 255], (y * w + x) * 4); }));
  return encodePNG(w, h, d);
}
const SMALL = ['.ooo', 'oryo', 'oooo'];

function tempRepo({ palette = ['#1e1822', '#c83c32', '#f0c850'], classes = { prop: { w: [2, 40], h: [2, 40] } } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'art-'));
  const d = join(root, 'games', 'g', 'art');
  mkdirSync(join(d, 'style'), { recursive: true }); mkdirSync(join(d, 'assets'), { recursive: true });
  writeJSON(join(d, 'style', 'style.json'), { format: 'pixelite-art-style', pxPerUnit: 2, classes, styleParagraph: 'Test style.', refs: [] });
  writeJSON(join(d, 'style', 'palette.json'), { format: 'pixelite-palette', colors: palette });
  return root;
}
const asset = (over = {}) => ({ id: 'box', name: 'Box', class: 'prop', target: { w: 4, h: 3 }, k: .5, place: 'floor', char: 'j', live: null, ...over });
const add = (root, meta = {}, over = {}, sprite = png(SMALL), id = 'box') => writeVersion('g', id, { sprite, root, asset: loadAssets('g', root).some(a => a.id === id) ? null : asset({ id, ...over }), meta });

test('the sprite builder: a PNG becomes engine sprite data, dark to light, outline marked, empty where transparent', () => {
  const s = spriteFromPNG(png(SMALL));
  assert.deepEqual([s.w, s.h], [4, 3]);
  assert.deepEqual(s.pal.map(c => c[3]), [0, 1, 1], 'the dark colour is outline (ink 0), the others are not');
  assert.deepEqual(s.pal.map(c => c.slice(0, 3)), [COL.o, COL.r, COL.y].sort((a, b) => (.3 * a[0] + .59 * a[1] + .11 * a[2]) - (.3 * b[0] + .59 * b[1] + .11 * b[2])));
  assert.equal(s.rows[0][0], '.'); assert.equal(s.rows[1][0], '0');
  assert.deepEqual(Array.from(decodePNG(pngFromSprite(s)).data), Array.from(decodePNG(png(SMALL)).data), 'and back to the same picture');
  const n = normalRows(s); assert.ok(n.every((r, y) => [...r].every((ch, x) => (ch === '.') === (s.rows[y][x] === '.'))), 'a normal exactly where there is paint');
});

test('a sprite takes at most 36 colours (one base-36 character each)', () => {
  const d = new Uint8Array(40 * 4); for (let i = 0; i < 40; i++) d.set([i * 6, 10, 20, 255], i * 4);
  assert.throws(() => spriteFromPNG(encodePNG(40, 1, d)), /40 colours/);
});

test('the contact sheet is a picture of the sprite at game size, 4x, its normals and lit from both sides', () => {
  const s = spriteFromPNG(png(SMALL)), im = decodePNG(contactSheet(s, normalRows(s)));
  assert.ok(im.width > 4 * 4 * 4 && im.height >= 3 * 4);
  const lit = decodePNG(contactSheet(s, normalRows(s), { raw: decodePNG(png(SMALL)) }));
  assert.ok(lit.width > im.width, 'a raw picture adds a panel');
});

test('the json layout is stable: short arrays on one line, everything else indented', () => {
  assert.equal(toJSON({ a: [1, 2, 3], b: { c: 'x' }, d: ['p', 'q'] }), '{\n  "a": [1, 2, 3],\n  "b": {\n    "c": "x"\n  },\n  "d": ["p", "q"]\n}\n');
});

test('versions are numbered; promote makes one live; the checker accepts it and pipeline.js is deterministic', () => {
  const root = tempRepo();
  assert.equal(add(root), '001'); assert.equal(add(root, { parent: '001', note: 'again' }), '002');
  const a = loadAssets('g', root)[0];
  assert.deepEqual(a.versions.map(v => [v.n, v.meta.status, v.meta.parent]), [['001', 'draft', null], ['002', 'draft', '001']]);
  assert.deepEqual(readdirSync(a.versions[0].dir).sort(), ['meta.json', 'normals.png', 'preview.png', 'sprite.png']);
  const asset1 = { ...a.asset, live: '002' }; writeJSON(join(a.dir, 'asset.json'), asset1);
  assert.match(validate('g', { root }).join('\n'), /live version 002 is draft/);
  const m = a.versions[1].meta; m.status = 'approved'; writeJSON(join(a.versions[1].dir, 'meta.json'), m);
  const text = buildText('g', root);
  assert.deepEqual(validate('g', { root, pipeline: text }).filter(p => !/pipeline\.js/.test(p)), []);
  assert.equal(buildText('g', root), text, 'the same art gives the same text');
  const PIPE_ART = new Function(`${text}\nreturn PIPE_ART;`)();
  assert.deepEqual(Object.keys(PIPE_ART), ['box']);
  const b = PIPE_ART.box; assert.deepEqual([b.w, b.h, b.k, b.char, b.place], [4, 3, .5, 'j', 'floor']);
  assert.equal(b.rows.length, 3); assert.equal(b.normals.length, 3); assert.equal(b.pal.length, 3);
});

test('the checker refuses what would break the game or the rules', () => {
  const root = tempRepo();
  add(root); add(root, { parent: '009' });                                   // a parent that is not there
  add(root, {}, {}, png(['.ooo', 'oryo']));                                  // the wrong size: 4 x 2, not 4 x 3
  const off = Uint8Array.from([...decodePNG(png(SMALL)).data]); off.set([1, 2, 3, 255], (1 * 4 + 1) * 4);
  add(root, {}, {}, encodePNG(4, 3, off));                                    // a colour that is not in the palette
  add(root, { map: 'nowhere' }, { id: 'other', char: 'j' }, png(SMALL), 'other');   // the same map character as 'box'
  const asset0 = loadAssets('g', root)[0]; writeJSON(join(asset0.dir, 'asset.json'), { ...asset0.asset, live: '007' });
  const text = validate('g', { root, pipeline: 'stale' }).join('\n');
  for (const want of [/parent 009 does not exist/, /sprite is 4 x 2, the target is 4 x 3/, /1 colour\(s\) outside the master palette, e\.g\. #010203/, /map character "j" is also used/, /live version 007 does not exist/, /pipeline\.js is out of date/])
    assert.match(text, want);
  assert.match(validate('nope', { root }).join(), /no art\/ folder/);
});

test('a map\'s palette must sit inside the master palette', () => {
  const root = tempRepo(); mkdirSync(join(root, 'games', 'g', 'art', 'maps', 'm1'), { recursive: true });
  writeJSON(join(root, 'games', 'g', 'art', 'maps', 'm1', 'palette.json'), { colors: ['#1e1822', '#123456'] });
  assert.match(validate('g', { root }).join(), /map m1's palette has #123456, which is not in the master palette/);
});

test('an imported asset is not emitted: the game still has it from its own sprites file', () => {
  const root = tempRepo();
  writeVersion('g', 'old', { sprite: png(SMALL), root, asset: asset({ id: 'old', emit: false, live: '001' }), meta: { version: '001', status: 'approved', kind: 'imported' } });
  assert.equal(liveItems('g', root).length, 0);
  writeFileSync(join(root, 'games', 'g', 'pipeline.js'), buildText('g', root));
  assert.deepEqual(validate('g', { root, pipeline: buildText('g', root) }), []);
});

// the real game
test('Space Mouse: its art/ folder is valid, pipeline.js is what the build makes, and the crate is a prop in the game', () => {
  assert.deepEqual(validate('spacemouse', { pipeline: buildText('spacemouse') }), []);
  const live = liveItems('spacemouse'); assert.deepEqual(live.map(i => i.id), ['cheese-crate']);
  const crate = live[0]; assert.deepEqual([crate.spr.w, crate.spr.h, crate.asset.k], [12, 11, .5], 'one art pixel is one world pixel at the default detail');
  const game = JSON.parse(readFileSync(join(ROOT, 'games/spacemouse/game.json'), 'utf8'));
  assert.ok(game.parts.indexOf('pipeline.js') > -1 && game.parts.indexOf('pipeline.js') < game.parts.indexOf('art.js'));
  assert.ok(game.levels.legend[crate.asset.char], 'its map character is in the editor\'s legend');
  assert.ok(readFileSync(join(ROOT, 'games/spacemouse/decor.js'), 'utf8').includes(crate.asset.char), 'and in the list of open tiles');
  assert.ok(readFileSync(join(ROOT, 'games/spacemouse/sectors.js'), 'utf8').includes(crate.asset.char), 'and the crate is on a map');
});

test('the palette tool reads every colour a game\'s sprites use, weighted by the pixels that use it', () => {
  const all = paletteOf(join(ROOT, 'games/spacemouse/sprites.js'), { weighted: true });
  assert.ok(all.size > 100 && [...all].every(([c, n]) => /^#[0-9a-f]{6}$/.test(c) && n > 0));
  assert.ok(all.has(toHex([250, 196, 72])), 'a colour of Pip\'s palette');
  assert.deepEqual(paletteOf(join(ROOT, 'games/spacemouse/sprites.js')).sort(), [...all.keys()].sort(), 'the plain list is the same colours');
});

test('curating picks real colours that stay far apart, and the most used one survives', () => {
  const m = new Map([['#101010', 500], ['#121212', 5], ['#ff0000', 40], ['#fe0101', 30], ['#00ff00', 20], ['#0000ff', 3]]);
  const c = curate(m, 3);
  assert.equal(c.length, 3); assert.ok(c.every(h => m.has(h)), 'never a colour that is not in the picture');
  assert.ok(c.includes('#101010') && c.includes('#ff0000') && !c.includes('#fe0101'), 'near colours merge into the heavier one');
  assert.deepEqual(curate(m, 99).length, 6, 'asking for more than there are keeps them all');
  assert.equal(nearest(['#000000', '#ffffff'], [200, 200, 200]), '#ffffff');
});

test('Space Mouse\'s master palette is curated, from its own sprites, and every live colour fits it', () => {
  const { colors } = JSON.parse(readFileSync(join(ROOT, 'games/spacemouse/art/style/palette.json'), 'utf8')), all = paletteOf(join(ROOT, 'games/spacemouse/sprites.js'));
  assert.ok(colors.length >= 16 && colors.length <= 64, `${colors.length} colours`);
  assert.ok(colors.every(c => all.includes(c)), 'every master colour is one the game already uses');
  assert.deepEqual(colors, [...colors].sort((a, b) => lab(rgbOf(a))[0] - lab(rgbOf(b))[0]), 'dark to light (by perceived lightness)');
});

// the command line, against a temporary checkout
function cli(root, ...args) { return execFileSync(process.execPath, [join(ROOT, 'tools/art.mjs'), ...args], { env: { ...process.env, PIXELITE_ROOT: root }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function cliRepo() {
  const root = tempRepo(); mkdirSync(join(root, 'games', 'g'), { recursive: true }); writeFileSync(join(root, 'games', 'g', 'game.json'), '{"parts":[]}');
  return root;
}

test('recolor moves a version\'s colours onto the master palette and the checker then accepts it', () => {
  const root = cliRepo(); add(root, {}, {}, png(['.ooo', 'oryo', 'oooo']));   // #f0c850 is the master's; y is #f0c850, but make the master miss it
  writeJSON(join(root, 'games', 'g', 'art', 'style', 'palette.json'), { colors: ['#1e1822', '#c83c32', '#e8b848'] });
  assert.match(validate('g', { root }).join(), /outside the master palette/);
  const out = cli(root, 'recolor', 'g', 'box', '001');
  assert.match(out, /1 of 3 colours moved/);
  assert.deepEqual(validate('g', { root }).filter(m => /outside/.test(m)), []);
  assert.equal(loadAssets('g', root)[0].versions[0].meta.snap.recolored, 1);
});

test('a map gets its seed and a sub-palette that sits inside the master', () => {
  const root = cliRepo(), seed = join(root, 'seed.png'); writeFileSync(seed, png(['oooo', 'oryo', 'oyyy']));
  writeJSON(join(root, 'games', 'g', 'art', 'style', 'palette.json'), { colors: ['#1e1822', '#c83c32', '#f0c850', '#336699'] });
  cli(root, 'map', 'g', 'bay', '--seed', seed, '--colors', '2');
  const dir = join(root, 'games', 'g', 'art', 'maps', 'bay'), sub = JSON.parse(readFileSync(join(dir, 'palette.json'), 'utf8')).colors;
  assert.equal(sub.length, 2); assert.ok(existsSync(join(dir, 'seed.png')) && existsSync(join(dir, 'notes.md')));
  assert.ok(sub.every(c => ['#1e1822', '#c83c32', '#f0c850', '#336699'].includes(c)) && !sub.includes('#336699'), 'only master colours the seed is made of');
  assert.deepEqual(validate('g', { root }), []);
  rmSync(join(dir, 'seed.png')); assert.match(validate('g', { root }).join(), /map bay has a palette but no seed\.png/);
});

test('promote-ref makes an approved version a style reference; a draft cannot be one', () => {
  const root = cliRepo(); add(root);
  assert.throws(() => cli(root, 'promote-ref', 'g', 'box', '001', '--role', 'props'), /only an approved version/);
  cli(root, 'promote', 'g', 'box', '001'); cli(root, 'promote-ref', 'g', 'box', '001', '--role', 'props');
  const st = JSON.parse(readFileSync(join(root, 'games', 'g', 'art', 'style', 'style.json'), 'utf8'));
  assert.deepEqual(st.refs, [{ file: 'refs/box-001.png', role: 'props', from: 'assets/box/001' }]);
  assert.deepEqual(validate('g', { root }).filter(m => /ref|style/.test(m)), []);
  assert.throws(() => cli(root, 'promote-ref', 'g', 'box', '001', '--role', 'nope'), /--role is one of/);
});

test('the checker wants a style paragraph, known reference roles, reference files that exist and are listed, and a small palette', () => {
  const root = tempRepo(), sp = join(root, 'games', 'g', 'art', 'style', 'style.json'), st = JSON.parse(readFileSync(sp, 'utf8'));
  writeJSON(sp, { ...st, styleParagraph: ' ', refs: [{ file: 'refs/a.png', role: 'hero' }, { file: 'refs/b.png', role: 'sky' }] });
  mkdirSync(join(root, 'games', 'g', 'art', 'style', 'refs')); writeFileSync(join(root, 'games', 'g', 'art', 'style', 'refs', 'a.png'), png(SMALL)); writeFileSync(join(root, 'games', 'g', 'art', 'style', 'refs', 'stray.png'), png(SMALL));
  const msg = validate('g', { root }).join('\n');
  for (const want of [/needs a styleParagraph/, /role "sky"/, /refs\/b\.png is not there/, /refs\/stray\.png is not listed/]) assert.match(msg, want);
  writeJSON(join(root, 'games', 'g', 'art', 'style', 'palette.json'), { colors: Array.from({ length: 65 }, (_, i) => '#' + (i + 1).toString(16).padStart(6, '0')) });
  assert.match(validate('g', { root }).join(), /65 colours, at most 64/);
});

test('Space Mouse\'s style sheet is filled in: a paragraph, four references, and Cargo Bay\'s seed and sub-palette', () => {
  const art = join(ROOT, 'games/spacemouse/art'), st = JSON.parse(readFileSync(join(art, 'style/style.json'), 'utf8'));
  assert.ok(st.styleParagraph.length > 100);
  assert.deepEqual(st.refs.map(r => r.role).sort(), ['env', 'hero', 'mood', 'props']);
  const sub = JSON.parse(readFileSync(join(art, 'maps/cargo-bay/palette.json'), 'utf8')).colors, master = new Set(JSON.parse(readFileSync(join(art, 'style/palette.json'), 'utf8')).colors);
  assert.ok(sub.length >= 8 && sub.every(c => master.has(c)));
  assert.ok(existsSync(join(art, 'maps/cargo-bay/seed.png')));
});

test('every imported Space Mouse prop keeps a link to the owner\'s original frame', () => {
  for (const a of loadAssets('spacemouse').filter(x => x.versions[0].meta.kind === 'imported')) {
    const src = a.versions[0].meta.source; assert.ok(src && existsSync(join(ROOT, src)), `${a.id}: ${src}`);
  }
});
