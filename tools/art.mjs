#!/usr/bin/env node
// The art pipeline's command line (docs/ART_PIPELINE.md). Art lives in games/<id>/art/; only an approved, live version of an
// asset reaches the game, through the generated games/<id>/pipeline.js.
//
//   node tools/art.mjs init <game>                          the folders, a style sheet to fill in
//   node tools/art.mjs palette <game> [--from sprites.js]   the master palette, from the colours the game's sprites already use
//   node tools/art.mjs add <game> <asset> --sprite in.png [--raw raw.png] [--kind hand|generated|imported] [--parent 002]
//        [--note "..."] [--map cargo-bay] [--class prop --target 12x11 --k .5 --place floor --char j --name "Cheese crate"]
//                                                           a new version (a new asset needs class, target and k): draft
//   node tools/art.mjs promote <game> <asset> <NNN>         approve it and make it the live one
//   node tools/art.mjs reject <game> <asset> <NNN> [--note "..."]
//   node tools/art.mjs import-sprites <game> --const PROP_ART [--from sprites.js] --class prop [--frames ref/frames/prop_]
//                                                           the sprites a game already has, as approved imported versions
//   node tools/art.mjs check [game]                         what is wrong with an art/ folder (all games that have one)
//   node tools/art.mjs build <game> [--check]               games/<id>/pipeline.js from the live versions (--check: only compare)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, artDir, readJSON, writeJSON, toHex, fromHex, lum, loadAssets, loadStyle, loadPalette, nextVersion, validate, ID_RE } from './art/lib.mjs';
import { spriteFromPNG, pngFromSprite, normalRows, normalsPNG, contactSheet, pipelineJs } from './art/sprite.mjs';
import { decodePNG } from './png.mjs';

const die = m => { console.error(`error: ${m}`); process.exit(1); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const NORMAL_OPTS = { bevel: 3, detail: .8, strength: 2.5 };   // the generator's defaults (tools/normalmap.mjs)

// a game's live, emitted assets as sprites (what pipeline.js holds)
export function liveItems(game, root = ROOT) {
  const items = [];
  for (const a of loadAssets(game, root)) {
    if (!a.asset || a.asset.live == null || a.asset.emit === false) continue;
    const v = a.versions.find(x => x.n === a.asset.live); if (!v) continue;
    const spr = spriteFromPNG(readFileSync(join(v.dir, 'sprite.png')));
    items.push({ id: a.id, asset: a.asset, spr, normals: normalRows(spr, (v.meta && v.meta.normals) || NORMAL_OPTS) });
  }
  return items;
}
export const buildText = (game, root = ROOT) => pipelineJs(game, liveItems(game, root));

// the files of one version: sprite.png in, normals.png and preview.png made (raw.png kept if given)
export function writeVersion(game, id, { sprite, raw = null, meta, asset = null, root = ROOT }) {
  const adir = join(artDir(game, root), 'assets', id);
  mkdirSync(adir, { recursive: true });
  if (asset) writeJSON(join(adir, 'asset.json'), asset);
  const cur = loadAssets(game, root).find(a => a.id === id), n = meta.version || (cur ? nextVersion(cur) : '001');
  const vdir = join(adir, n); mkdirSync(vdir, { recursive: true });
  const spr = spriteFromPNG(sprite), normals = normalRows(spr, meta.normals || NORMAL_OPTS);
  writeFileSync(join(vdir, 'sprite.png'), sprite);
  writeFileSync(join(vdir, 'normals.png'), normalsPNG(spr, normals));
  if (raw) writeFileSync(join(vdir, 'raw.png'), raw);
  writeFileSync(join(vdir, 'preview.png'), contactSheet(spr, normals, { raw: raw ? decodePNG(raw) : null }));
  writeJSON(join(vdir, 'meta.json'), { version: n, parent: null, status: 'draft', kind: 'hand', brief: '', prompt: '', refs: [], api: null, source: null,
    snap: null, normals: NORMAL_OPTS, target: null, note: '', created: new Date().toISOString(), by: 'claude-session', ...meta, version: n });
  return n;
}

// the colours a game's generated sprite file uses: every `pal` and every const ending _PAL
export function paletteOf(file) {
  const text = readFileSync(file, 'utf8'), names = [...text.matchAll(/^const (\w+) =/gm)].map(m => m[1]);
  const env = new Function(`${text}\nreturn {${names.join(',')}};`)(), cols = new Map();
  const add = list => { for (const c of list) if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(Number.isInteger)) cols.set(toHex(c), c.slice(0, 3)); };
  const walk = (v, key, d) => { if (!v || typeof v !== 'object' || d > 4) return; if ((key === 'pal' || /_PAL$/.test(key)) && Array.isArray(v)) add(v); else for (const k of Object.keys(v)) walk(v[k], k, d + 1); };
  for (const [k, v] of Object.entries(env)) walk(v, k, 0);
  return [...cols.values()].sort((a, b) => lum(a) - lum(b) || toHex(a).localeCompare(toHex(b))).map(toHex);
}

function main(argv) {
  const [cmd, ...rest] = argv, pos = [], o = {};
  for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a === '--check') o.check = true; else if (a.startsWith('--')) o[a.slice(2)] = rest[++i]; else pos.push(a); }
  const game = pos[0];
  const need = () => { if (!game || !existsSync(join(ROOT, 'games', game, 'game.json'))) die(`give a game id (games/<id>/game.json), e.g. spacemouse`); };
  if (cmd === 'init') {
    need(); const d = artDir(game);
    if (existsSync(join(d, 'style', 'style.json'))) die(`${game} already has art/style/style.json`);
    for (const f of ['style/refs', 'maps', 'assets']) mkdirSync(join(d, f), { recursive: true });
    writeJSON(join(d, 'style', 'style.json'), { format: 'pixelite-art-style', pxPerUnit: 2,
      note: 'pxPerUnit: art pixels per base unit at the default detail (RES 2): one art pixel = one world pixel, so a sprite\'s k is 1 / pxPerUnit.',
      classes: { character: { h: [14, 16] }, prop: { w: [8, 40], h: [8, 40] }, tile: { w: [16, 16], h: [16, 16] } },
      styleParagraph: '', refs: [] });
    writeJSON(join(d, 'style', 'palette.json'), { format: 'pixelite-palette', source: 'empty: run  node tools/art.mjs palette ' + game, colors: [] });
    console.log(`made games/${game}/art/ (fill in style/style.json, then: node tools/art.mjs palette ${game})`); return;
  }
  if (cmd === 'palette') {
    need(); const from = join(ROOT, 'games', game, o.from || 'sprites.js');
    if (!existsSync(from)) die(`${from} does not exist`);
    const colors = paletteOf(from);
    writeJSON(join(artDir(game), 'style', 'palette.json'), { format: 'pixelite-palette', source: `the colours of games/${game}/${o.from || 'sprites.js'} (${colors.length}), dark to light: curate it`, colors });
    console.log(`${colors.length} colours → games/${game}/art/style/palette.json`); return;
  }
  if (cmd === 'add') {
    need(); const id = pos[1], root = ROOT;
    if (!id || !ID_RE.test(id)) die('give an asset id (a-z, 0-9, dashes)');
    if (!o.sprite) die('--sprite in.png is needed (one pixel per art pixel)');
    const cur = loadAssets(game).find(a => a.id === id); let asset = null;
    if (!cur) {
      if (!o.class || !o.target || !o.k) die('a new asset needs --class, --target WxH and --k (base units per sprite pixel)');
      const [w, h] = o.target.split('x').map(Number);
      asset = { id, name: o.name || id, class: o.class, target: { w, h }, k: +o.k, place: o.place || 'floor', char: o.char || null, live: null };
    }
    const sprite = readFileSync(o.sprite), raw = o.raw ? readFileSync(o.raw) : null, spr = spriteFromPNG(sprite);
    const target = (cur ? cur.asset.target : asset.target), cls = cur ? cur.asset.class : asset.class;
    if (o.parent && !(cur && cur.versions.some(v => v.n === o.parent))) die(`parent ${o.parent} does not exist`);
    const n = writeVersion(game, id, { sprite, raw, asset, root, meta: { kind: o.kind || 'hand', parent: o.parent || null, note: o.note || '', brief: o.brief || '', map: o.map || undefined,
      target: { class: cls, w: target.w, h: target.h } } });
    console.log(`${game}/${id}/${n}: draft, ${spr.w} x ${spr.h}, ${spr.pal.length} colours (target ${target.w} x ${target.h}). Look at its preview.png, then: node tools/art.mjs promote ${game} ${id} ${n}`); return;
  }
  if (cmd === 'promote' || cmd === 'reject') {
    need(); const [id, n] = [pos[1], pos[2]], a = loadAssets(game).find(x => x.id === id);
    if (!a) die(`no asset ${id}`); const v = a.versions.find(x => x.n === n); if (!v) die(`${id} has no version ${n}`);
    if (cmd === 'promote') { v.meta.status = 'approved'; a.asset.live = n; writeJSON(join(a.dir, 'asset.json'), a.asset); }
    else { if (a.asset.live === n) die(`${n} is the live version of ${id}: promote another one first`); v.meta.status = 'rejected'; }
    if (o.note) v.meta.note = o.note;
    writeJSON(join(v.dir, 'meta.json'), v.meta);
    console.log(`${game}/${id}/${n}: ${v.meta.status}${cmd === 'promote' ? ' and live; now: node tools/art.mjs build ' + game : ''}`); return;
  }
  if (cmd === 'import-sprites') {
    need(); const file = join(ROOT, 'games', game, o.from || 'sprites.js'), names = [...readFileSync(file, 'utf8').matchAll(/^const (\w+) =/gm)].map(m => m[1]);
    if (!o.const || !names.includes(o.const)) die(`--const must name a const in ${file}: ${names.join(', ')}`);
    const set = new Function(`${readFileSync(file, 'utf8')}\nreturn ${o.const};`)(), cls = o.class || 'prop';
    for (const [key, p] of Object.entries(set)) {
      const id = slug(p.name || key); if (loadAssets(game).some(a => a.id === id)) { console.log(`${id}: already there`); continue; }
      const frame = o.frames ? `${o.frames}${(p.name || key).replace(/ /g, '_')}.png` : null;
      writeVersion(game, id, { sprite: pngFromSprite(p), root: ROOT,
        asset: { id, name: p.name || key, class: cls, target: { w: p.w, h: p.h }, k: p.k, place: p.place || 'floor', char: key.length === 1 ? key : null, emit: false, live: '001' },
        meta: { version: '001', status: 'approved', kind: 'imported', note: `from ${o.from || 'sprites.js'} (${o.const}), made by the game's tools/art.py; the game still gets it from there (emit: false)`,
          source: frame && existsSync(join(ROOT, 'games', game, frame)) ? `games/${game}/${frame}` : null, target: { class: cls, w: p.w, h: p.h } } });
      console.log(`${id}: imported ${p.w} x ${p.h}`);
    }
    return;
  }
  if (cmd === 'check') {
    const games = game ? [game] : readdirSync(join(ROOT, 'games')).filter(g => existsSync(join(ROOT, 'games', g, 'art')));
    let bad = 0;
    for (const g of games) { const text = buildText(g), p = validate(g, { pipeline: text }); for (const m of p) console.log(m); bad += p.length; }
    console.log(bad ? `${bad} problem(s)` : `art ok: ${games.join(', ') || 'no game has an art/ folder'}`); process.exit(bad ? 1 : 0);
  }
  if (cmd === 'build') {
    need(); const text = buildText(game), p = join(ROOT, 'games', game, 'pipeline.js');
    if (o.check) { if (!existsSync(p) || readFileSync(p, 'utf8') !== text) die(`pipeline.js is out of date: node tools/art.mjs build ${game}`); console.log('pipeline.js is up to date'); return; }
    writeFileSync(p, text); const n = liveItems(game).length;
    const parts = readJSON(join(ROOT, 'games', game, 'game.json')).parts;
    console.log(`wrote games/${game}/pipeline.js: ${n} live asset(s)${parts.includes('pipeline.js') ? '' : `\nadd "pipeline.js" to games/${game}/game.json's parts, before art.js`}`); return;
  }
  die('commands: init, palette, add, promote, reject, import-sprites, check, build (see the top of tools/art.mjs)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
