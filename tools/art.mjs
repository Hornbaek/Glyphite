#!/usr/bin/env node
// The art pipeline's command line (docs/ART_PIPELINE.md). Art lives in games/<id>/art/; only an approved, live version of an
// asset reaches the game, through the generated games/<id>/pipeline.js.
//
//   node tools/art.mjs init <game>                          the folders, a style sheet to fill in
//   node tools/art.mjs palette <game> [--from sprites.js] [--colors 32]   the master palette: the colours the game's sprites use,
//                                                           weighted by pixels, curated down to --colors (0: all of them)
//   node tools/art.mjs recolor <game> <asset> <NNN> [--map m]   put a version's colours on the nearest ones of the master (or the map's) palette
//   node tools/art.mjs map <game> <map> --seed seed.png [--colors 14]   a map's seed piece, and its sub-palette (inside the master)
//   node tools/art.mjs promote-ref <game> <asset> <NNN> --role props [--replace refs/props.png]   an approved version becomes a style reference
//   node tools/art.mjs make <game> <asset> --brief "..." [--n 3] [--map m] [--parent 002] [--api openai|flux] [--model m] [--quality q]
//        [--from 003 (refine that draft: its picture is sent as the first reference)] [--pose "walking, left foot forward" (the same character, new pose) --align 003 (snap on that version's grid and place: animation frames)] [--frame walk1 (tag it as a candidate for that frame; with --pose it starts from the first frame, aligned)] [--note "what to change"] [--mood] [--key] [--max-calls N] [--dry]   [--class prop --target 12x11 --k .5 --place floor --char j --name ".."]
//                                                           generate candidates through an image API: drafts with a contact sheet each
//   node tools/art.mjs resnap <game> <asset> <NNN>          snap a version's raw picture again (free: no API call), recording its lattice
//   node tools/art.mjs check-keys [--api openai|flux]       one free call per API: does its key work
//   node tools/art.mjs models [openai]                      the image models the account can use
//   node tools/art.mjs add <game> <asset> --sprite in.png [--raw raw.png] [--kind hand|generated|imported] [--parent 002]
//        [--note "..."] [--map cargo-bay] [--class prop --target 12x11 --k .5 --place floor --char j --name "Cheese crate"]
//        [--emit "#ffe08a,#fff3b0" (the colours that glow: a window, a screen, eyes) and/or --emit-mask glow.png (white where it glows)]
//                                                           a new version (a new asset needs class, target and k): draft
//   node tools/art.mjs promote <game> <asset> <NNN> [--frame idle]   approve it and make it the live one; with --frame it becomes that frame's picture (an animation)
//   node tools/art.mjs reject <game> <asset> <NNN> [--note "..."]
//   node tools/art.mjs import-sprites <game> --const PROP_ART [--from sprites.js] --class prop [--frames ref/frames/prop_]
//                                                           the sprites a game already has, as approved imported versions
//   node tools/art.mjs check [game]                         what is wrong with an art/ folder (all games that have one)
//   node tools/art.mjs build <game> [--check]               games/<id>/pipeline.js from the live versions (--check: only compare)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, artDir, readJSON, writeJSON, toHex, fromHex, lum, loadAssets, loadStyle, loadPalette, nextVersion, validate, ID_RE, FRAME_RE, REF_ROLES } from './art/lib.mjs';
import { spriteFromPNG, pngFromSprite, normalRows, normalsPNG, contactSheet, pipelineJs, emitRows } from './art/sprite.mjs';
import { decodePNG, encodePNG } from './png.mjs';
import { writeVersion, NORMAL_OPTS } from './art/store.mjs';
export { writeVersion };
import { curate, nearest, histogram, hexOf, rgbOf } from './art/palette.mjs';

const die = m => { console.error(`error: ${m}`); process.exit(1); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// the glowing pixels of a version (engine/10_sprite.js, `emit`): meta.emit lists the sprite's colours that glow, and/or emit.png is a mask the size of the
// sprite (white = fully); null when nothing glows
function emitFor(v, spr) {
  const mp = join(v.dir, 'emit.png');
  return emitRows(spr, { colors: v.meta && v.meta.emit, mask: existsSync(mp) ? readFileSync(mp) : null });
}
// a game's live, emitted assets as sprites (what pipeline.js holds)
export function liveItems(game, root = ROOT) {
  const items = [];
  for (const a of loadAssets(game, root)) {
    if (a.asset && a.asset.frames) { items.push(frameItem(a)); continue; }
    if (!a.asset || a.asset.live == null || a.asset.emit === false) continue;
    const v = a.versions.find(x => x.n === a.asset.live); if (!v) continue;
    const spr = spriteFromPNG(readFileSync(join(v.dir, 'sprite.png')));
    items.push({ id: a.id, asset: a.asset, spr, normals: normalRows(spr, (v.meta && v.meta.normals) || NORMAL_OPTS), emit: emitFor(v, spr) });
  }
  return items;
}
// An asset that holds frames: every frame's approved version, on ONE palette (the union of their colours, dark to light), the first frame
// standing for the asset (its size, its rows, its tile in the gallery)
function frameItem(a) {
  const named = Object.entries(a.asset.frames).map(([name, n]) => ({ name, v: a.versions.find(x => x.n === n) })).filter(f => f.v);
  const pngs = named.map(f => readFileSync(join(f.v.dir, 'sprite.png'))), colours = new Map();
  for (const png of pngs) for (const c of spriteFromPNG(png, { pal: null }).pal) colours.set(c.slice(0, 3).join(), c.slice(0, 3));
  const shared = [...colours.values()].sort((x, y) => lum(x) - lum(y) || x.join().localeCompare(y.join()));
  const frames = {};
  named.forEach((f, i) => { const spr = spriteFromPNG(pngs[i], { pal: shared.map(c => [...c, 1]) }); frames[f.name] = { spr, normals: normalRows(spr, (f.v.meta && f.v.meta.normals) || NORMAL_OPTS), emit: emitFor(f.v, spr) }; });
  const first = frames[named[0].name];
  return { id: a.id, asset: a.asset, spr: first.spr, normals: first.normals, emit: first.emit, frames };
}
export const buildText = (game, root = ROOT) => pipelineJs(game, liveItems(game, root));

// the colours a game's generated sprite file uses, hex → how many pixels use each: every sprite with `rows` and a palette (its own
// `pal`, or the NAME_PAL beside a NAME_FRAMES group)
export function paletteOf(file, { weighted = false } = {}) {
  const text = readFileSync(file, 'utf8'), names = [...text.matchAll(/^const (\w+) =/gm)].map(m => m[1]);
  const env = new Function(`${text}\nreturn {${names.join(',')}};`)(), cols = new Map();
  const add = (pal, rows) => {
    const count = new Array(pal.length).fill(0);
    if (rows) for (const r of rows) for (const ch of r) if (ch !== '.') count[parseInt(ch, 36)]++;
    pal.forEach((c, i) => { if (Array.isArray(c) && c.length >= 3) { const h = hexOf(c); cols.set(h, (cols.get(h) || 0) + (rows ? count[i] : 1)); } });
  };
  const walk = (v, pal, d) => {
    if (!v || typeof v !== 'object' || d > 4) return;
    if (Array.isArray(v.rows) && (v.pal || pal)) { add(v.pal || pal, v.rows); return; }
    for (const k of Object.keys(v)) walk(v[k], pal, d + 1);
  };
  for (const [k, v] of Object.entries(env)) walk(v, /_FRAMES$/.test(k) ? env[k.replace(/_FRAMES$/, '_PAL')] : null, 0);
  if (!cols.size) for (const [k, v] of Object.entries(env)) if (/_PAL$/.test(k)) add(v, null);
  if (weighted) return cols;
  return [...cols.keys()].sort((a, b) => lum(rgbOf(a)) - lum(rgbOf(b)) || a.localeCompare(b));
}

async function main(argv) {
  const [cmd, ...rest] = argv, pos = [], o = {};
  for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a === '--check' || a === '--dry' || a === '--mood' || a === '--key') o[a.slice(2)] = true; else if (a.startsWith('--')) o[a.slice(2)] = rest[++i]; else pos.push(a); }
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
    const all = paletteOf(from, { weighted: true }), k = o.colors === undefined ? 32 : +o.colors;
    const colors = k > 0 ? curate(all, k) : [...all.keys()].sort((a, b) => lum(rgbOf(a)) - lum(rgbOf(b)));
    writeJSON(join(artDir(game), 'style', 'palette.json'), { format: 'pixelite-palette', source: `${colors.length} of the ${all.size} colours of games/${game}/${o.from || 'sprites.js'}, picked by how many pixels use them and how far apart they look (tools/art/palette.mjs): edit it by hand if you like`, colors });
    console.log(`${colors.length} of ${all.size} colours → games/${game}/art/style/palette.json`); return;
  }
  if (cmd === 'recolor') {
    need(); const [id, n] = [pos[1], pos[2]], a = loadAssets(game).find(x => x.id === id), v = a && a.versions.find(x => x.n === n);
    if (!v) die(`no version ${id}/${n}`);
    const pal = o.map ? readJSON(join(artDir(game), 'maps', o.map, 'palette.json')).colors : loadPalette(game);
    if (!pal || !pal.length) die('there is no palette (node tools/art.mjs palette ' + game + ')');
    const im = decodePNG(readFileSync(join(v.dir, 'sprite.png'))), map = new Map(); let changed = 0;
    for (let i = 0; i < im.data.length; i += 4) {
      if (im.data[i + 3] < 128) continue;
      const h = hexOf([im.data[i], im.data[i + 1], im.data[i + 2]]); if (!map.has(h)) map.set(h, pal.includes(h) ? h : nearest(pal, rgbOf(h)));
      const to = rgbOf(map.get(h)); if (map.get(h) !== h) changed++; im.data[i] = to[0]; im.data[i + 1] = to[1]; im.data[i + 2] = to[2];
    }
    const png = Buffer.from(encodePNG(im.width, im.height, im.data));
    const raw = existsSync(join(v.dir, 'raw.png')) ? readFileSync(join(v.dir, 'raw.png')) : null;
    writeVersion(game, id, { sprite: png, raw, root: ROOT, meta: { ...v.meta, version: n, snap: { ...(v.meta.snap || {}), palette: o.map ? `map ${o.map}` : 'master', recolored: [...map].filter(([f, t]) => f !== t).length } } });
    console.log(`${game}/${id}/${n}: ${[...map].filter(([f, t]) => f !== t).length} of ${map.size} colours moved to the ${o.map ? `map ${o.map}'s` : 'master'} palette (${changed} pixels)`); return;
  }
  if (cmd === 'map') {
    need(); const m = pos[1]; if (!m || !ID_RE.test(m)) die('give a map id (a-z, 0-9, dashes)'); if (!o.seed) die('--seed seed.png is needed (a picture of the map\'s look, one pixel per art pixel: tools/art_capture.py makes one)');
    const master = loadPalette(game); if (!master || !master.length) die('there is no master palette yet');
    const bytes = readFileSync(o.seed), im = decodePNG(bytes), h = histogram(im.data), k = +(o.colors || 14), snapped = new Map();
    for (const [c, w] of h) { const t = nearest(master, rgbOf(c)); snapped.set(t, (snapped.get(t) || 0) + w); }
    const sub = curate(snapped, Math.min(k, snapped.size)), dir = join(artDir(game), 'maps', m); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'seed.png'), bytes);
    writeJSON(join(dir, 'palette.json'), { format: 'pixelite-palette', map: m, source: `the ${sub.length} master colours that most of ${basename(o.seed)} (${im.width} x ${im.height}) is made of`, colors: sub });
    if (!existsSync(join(dir, 'notes.md'))) writeFileSync(join(dir, 'notes.md'), `# ${m}\n\nWhat this map looks and feels like (for the person writing the briefs; the seed picture and the sub-palette carry the rest):\n\n- \n`);
    console.log(`maps/${m}: seed ${im.width} x ${im.height}, ${sub.length} colours (${snapped.size} master colours near the seed's)`); return;
  }
  if (cmd === 'promote-ref') {
    need(); const [id, n] = [pos[1], pos[2]], a = loadAssets(game).find(x => x.id === id), v = a && a.versions.find(x => x.n === n);
    if (!v) die(`no version ${id}/${n}`); if (v.meta.status !== 'approved') die(`${id}/${n} is ${v.meta.status}: only an approved version can become a style reference`);
    if (!o.role || !REF_ROLES.includes(o.role)) die(`--role is one of ${REF_ROLES.join(', ')}`);
    const sp = join(artDir(game), 'style', 'style.json'), st = readJSON(sp), file = `refs/${id}-${n}.png`;
    mkdirSync(join(artDir(game), 'style', 'refs'), { recursive: true });
    const sprite = readFileSync(join(v.dir, 'sprite.png')); writeFileSync(join(artDir(game), 'style', file), sprite);
    if (o.replace) { const at = st.refs.findIndex(r => r.file === o.replace); if (at < 0) die(`no reference ${o.replace}`); st.refs.splice(at, 1, { file, role: o.role, from: `assets/${id}/${n}` }); }
    else st.refs.push({ file, role: o.role, from: `assets/${id}/${n}` });
    writeJSON(sp, st); console.log(`style/${file}: ${o.role}${o.replace ? ' (replaces ' + o.replace + '; the old picture stays in git history)' : ''}`); return;
  }
  if (cmd === 'make' || cmd === 'check-keys' || cmd === 'models') {
    // Node's fetch only uses the agent proxy when asked: start again with it on (which is also what supplies the saved keys)
    const gen = await import('./art/gen/index.mjs');
    if (gen.needsProxyRestart()) {
      const { spawnSync } = await import('node:child_process');
      process.exit(spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } }).status ?? 1);
    }
    if (cmd === 'check-keys') {
      let bad = 0;
      for (const [name, a] of Object.entries(gen.adapters)) {
        if (o.api && o.api !== name) continue;
        const hint = gen.keyHint(name); if (hint) { console.log(`${name}: ${hint}`); bad++; continue; }
        try { const r = await a.checkKey({ model: o.model }); console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${name}: ${r.detail}`); if (!r.ok) bad++; } catch (e) { console.log(`FAIL ${name}: ${e.message}`); bad++; }
      }
      process.exit(bad ? 1 : 0);
    }
    if (cmd === 'models') { console.log((await gen.adapter(game || 'openai').listModels()).join('\n')); return; }
    need(); const id = pos[1], api = o.api || (loadStyle(game) || {}).gen?.api || 'openai';
    if (!id || !ID_RE.test(id)) die('give an asset id (a-z, 0-9, dashes)');
    if (!o.dry) { const hint = gen.keyHint(api); if (hint) die(hint); }
    let newAsset = null;
    if (!loadAssets(game).some(a => a.id === id)) {
      if (!o.class || !o.target || !o.k) die('a new asset needs --class, --target WxH and --k (base units per sprite pixel)');
      const [w, h] = o.target.split('x').map(Number);
      newAsset = { id, name: o.name || id, class: o.class, target: { w, h }, k: +o.k, place: o.place || 'floor', char: o.char || null, live: null };
    }
    const { make } = await import('./art/make.mjs'), st = loadStyle(game) || {};
    const res = await make(game, id, { brief: o.brief, n: +(o.n || 1), api, model: o.model || (st.gen && st.gen.model), quality: o.quality || (st.gen && st.gen.quality), map: o.map || null, parent: o.parent || null, from: o.from || null, align: o.align || null, frame: o.frame || null, pose: o.pose || '',
      note: o.note || '', mood: !!o.mood, dry: !!o.dry, keyed: !!o.key, maxCalls: o['max-calls'] ? +o['max-calls'] : +(o.n || 1) + 1, asset: newAsset, log: m => console.log(m) });
    const ok = res.filter(r => r.ok); if (!o.dry) console.log(`${ok.length} of ${res.length} candidate(s) made as drafts. Look at each preview.png, then: node tools/art.mjs promote ${game} ${id} <NNN>  (or reject)`);
    process.exit(!o.dry && !ok.length ? 1 : 0);
  }
  if (cmd === 'resnap') {
    // snap a version's raw picture again, for free (no API call): e.g. to record its lattice, or after the palette changed
    need(); const [id, n] = [pos[1], pos[2]], a = loadAssets(game).find(x => x.id === id), v = a && a.versions.find(x => x.n === n);
    if (!v) die(`no version ${id}/${n}`); if (!existsSync(join(v.dir, 'raw.png'))) die(`${id}/${n} has no raw.png`);
    const { snapToTarget } = await import('./art/make.mjs'), m = (v.meta.snap && v.meta.snap.palette) || 'master';
    const pal = m.startsWith('map ') ? readJSON(join(artDir(game), 'maps', m.slice(4), 'palette.json')).colors : loadPalette(game);
    const fit = await snapToTarget(readFileSync(join(v.dir, 'raw.png')), { target: a.asset.target, palette: pal, anchor: a.asset.place === 'floor' ? 'bottom' : 'centre' });
    writeVersion(game, id, { sprite: fit.png, raw: readFileSync(join(v.dir, 'raw.png')), root: ROOT, meta: { ...v.meta, version: n, snap: { ...v.meta.snap, pixelSize: fit.pixelSize, tries: fit.tries, size: fit.size, lattice: fit.lattice } } });
    console.log(`${game}/${id}/${n}: snapped again at pixel size ${fit.pixelSize}, ${fit.size[0]} x ${fit.size[1]}`); return;
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
    // glowing pixels: --emit lists the sprite's colours that glow (hex, kept in meta.emit), --emit-mask is a picture the size of the sprite, white where it glows (kept as emit.png)
    const emitMask = o['emit-mask'] ? readFileSync(o['emit-mask']) : null, emit = o.emit ? o.emit.split(',').map(s => s.trim().toLowerCase()) : undefined;
    if (emit && !emit.every(c => /^#[0-9a-f]{6}$/.test(c))) die('--emit is a list of colours, #rrggbb,#rrggbb');
    if (emitMask || emit) { try { if (!emitRows(spr, { colors: emit, mask: emitMask })) die('no pixel of the sprite is one of the --emit colours or inside the --emit-mask'); } catch (e) { die(e.message); } }
    const n = writeVersion(game, id, { sprite, raw, asset, root, emitMask, meta: { kind: o.kind || 'hand', parent: o.parent || null, note: o.note || '', brief: o.brief || '', map: o.map || undefined, emit,
      target: { class: cls, w: target.w, h: target.h } } });
    console.log(`${game}/${id}/${n}: draft, ${spr.w} x ${spr.h}, ${spr.pal.length} colours (target ${target.w} x ${target.h}). Look at its preview.png, then: node tools/art.mjs promote ${game} ${id} ${n}`); return;
  }
  if (cmd === 'promote' || cmd === 'reject') {
    need(); const [id, n] = [pos[1], pos[2]], a = loadAssets(game).find(x => x.id === id);
    if (!a) die(`no asset ${id}`); const v = a.versions.find(x => x.n === n); if (!v) die(`${id} has no version ${n}`);
    const frame = o.frame || (a.asset.frames && v.meta.frame);
    if (cmd === 'promote' && (frame || a.asset.frames)) {
      // an animation: the version becomes the picture of one named frame (a new name adds a frame at the end)
      if (!frame) die(`${id} holds frames: say which one, --frame <name>`); if (!FRAME_RE.test(frame)) die(`a frame name is a-z, 0-9 and underscores, starting with a letter`);
      if (a.asset.live != null) die(`${id} has a live version: it is a single picture, not an animation`);
      v.meta.status = 'approved'; v.meta.frame = frame; a.asset.frames = { ...(a.asset.frames || {}), [frame]: n }; delete a.asset.emit; writeJSON(join(a.dir, 'asset.json'), a.asset);
    }
    else if (cmd === 'promote') { v.meta.status = 'approved'; a.asset.live = n; writeJSON(join(a.dir, 'asset.json'), a.asset); }
    else { if (a.asset.live === n) die(`${n} is the live version of ${id}: promote another one first`); const as = Object.entries(a.asset.frames || {}).find(([, fv]) => fv === n); if (as) die(`${n} is the picture of frame ${as[0]} of ${id}: promote another version for it first`); v.meta.status = 'rejected'; }
    if (o.note) v.meta.note = o.note;
    writeJSON(join(v.dir, 'meta.json'), v.meta);
    console.log(`${game}/${id}/${n}: ${v.meta.status}${cmd === 'promote' ? (frame ? ` and the picture of frame ${frame}` : ' and live') + '; now: node tools/art.mjs build ' + game : ''}`); return;
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
  die('commands: init, palette, recolor, map, promote-ref, make, resnap, check-keys, models, add, promote, reject, import-sprites, check, build (see the top of tools/art.mjs)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => die(e.message));
