#!/usr/bin/env node
// Glyphite command line: build the site, scaffold games, serve locally. No dependencies.
//
//   node tools/glyphite.mjs build [ids...]        engine + every game → dist/ (the deployable site)
//   node tools/glyphite.mjs new <id> [--title T]  scaffold games/<id>/ from templates/starter
//   node tools/glyphite.mjs list                  the games and their status
//   node tools/glyphite.mjs serve [--port 8787]   serve dist/ on http://localhost:8787
//
// dist/ layout (served by the Cloudflare Worker in worker/):
//   index.html, edit/, assets/        the portal (from portal/), the editor, shared scripts
//   games.json                        every game's listing data
//   games/<id>/index.html             the playable single-file game
//   games/<id>/game.json, thumb.png   its manifest and thumbnail
//   src/engine/..., src/games/<id>/...  sources, for the editor's in-browser rebuild
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import vm from 'node:vm';
import { assemble } from './assemble.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const readJSON = p => JSON.parse(read(p));
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

// every game folder: games/<id>/ plus the templates (built unlisted, so they stay tested)
function gameDirs() {
  const out = [];
  for (const base of ['games', 'templates']) {
    const dir = join(ROOT, base); if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) if (existsSync(join(dir, name, 'game.json'))) out.push({ base, name, path: `${base}/${name}` });
  }
  return out;
}

function loadEngine() {
  const e = readJSON('engine/engine.json');
  return { ...e, shellCode: read(`engine/${e.shell}`), parts: e.parts.map(name => ({ name, code: read(`engine/${name}`) })) };
}

function loadGame(g) {
  const m = readJSON(`${g.path}/game.json`);
  const errs = [];
  if (!ID_RE.test(m.id || '')) errs.push(`id "${m.id}" must be lower-case letters, digits and dashes`);
  if (g.base === 'games' && m.id !== g.name) errs.push(`id "${m.id}" must match its folder name "${g.name}"`);
  if (!m.title) errs.push('title is missing');
  if (!Array.isArray(m.parts) || !m.parts.length) errs.push('parts must list the game\'s .js files in load order');
  for (const p of m.parts || []) if (!existsSync(join(ROOT, g.path, p))) errs.push(`part ${p} does not exist`);
  for (const [k, t] of Object.entries(m.tunables || {})) {
    if (!/^[A-Za-z_]\w*$/.test(k)) errs.push(`tunable "${k}" must be an identifier`);
    if (typeof t.value !== 'number' && typeof t.value !== 'boolean') errs.push(`tunable "${k}" needs a numeric or boolean value`);
  }
  if (errs.length) die(`${g.path}/game.json:\n  ${errs.join('\n  ')}`);
  if (g.base === 'templates') { m.listed = false; m.template = true; }
  return {
    ...g, manifest: m,
    head: m.head ? read(`${g.path}/${m.head}`) : '',
    parts: m.parts.map(name => ({ name, code: read(`${g.path}/${name}`) }))
  };
}

// syntax-check the assembled script without running it
function checkSyntax(page, label) {
  const a = page.indexOf('<script>\n'), b = page.lastIndexOf('</script>');
  try { new vm.Script(page.slice(a + 9, b), { filename: label }); }
  catch (e) {
    const m = /:(\d+)/.exec(e.stack || '');
    let where = '';
    if (m) {   // point at the source file, not the assembled page
      const lines = page.slice(a + 9, b).split('\n'), n = +m[1];
      let file = 'preamble', at = 0;
      for (let i = 0; i < n && i < lines.length; i++) { const s = /^\/\/ ----- (.+) -----$/.exec(lines[i]); if (s) { file = s[1]; at = 0; } else at++; }
      where = ` (${file}:${at})`;
    }
    die(`syntax error in ${label}${where}: ${e.message}`);
  }
}

// Engine and game share one script scope. A game `function` with the same name as an engine one
// silently replaces it (const/let clashes are syntax errors, caught above), so refuse those.
const topNames = code => [...code.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1] || m[2]);
function checkNames(engine, g) {
  const own = new Map();
  for (const p of engine.parts) for (const n of topNames(p.code)) own.set(n, `engine/${p.name}`);
  const clash = [];
  for (const p of g.parts) for (const n of topNames(p.code)) if (own.has(n)) clash.push(`${g.path}/${p.name}: "${n}" is already defined in ${own.get(n)}`);
  if (clash.length) die(`name clash with the engine (rename the game's version):\n  ${clash.join('\n  ')}`);
}

function gitDate(path) {
  try { return execFileSync('git', ['log', '-1', '--format=%cI', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim() || null; }
  catch { return null; }
}

function build(only) {
  const engine = loadEngine();
  const games = gameDirs().map(loadGame).filter(g => !only.length || only.includes(g.manifest.id));
  if (only.length && !games.length) die(`no game called ${only.join(', ')}`);
  const ids = new Set();
  for (const g of games) { if (ids.has(g.manifest.id)) die(`two games use the id "${g.manifest.id}"`); ids.add(g.manifest.id); }
  if (!only.length) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // the portal: static pages and the shared assembler
  if (existsSync(join(ROOT, 'portal'))) cpSync(join(ROOT, 'portal'), DIST, { recursive: true });
  write(join(DIST, 'assets/assemble.mjs'), read('tools/assemble.mjs'));
  // engine sources for the editor
  write(join(DIST, 'src/engine/engine.json'), read('engine/engine.json'));
  write(join(DIST, `src/engine/${engine.shell}`), engine.shellCode);
  for (const p of engine.parts) write(join(DIST, `src/engine/${p.name}`), p.code);

  const listing = existsSync(join(DIST, 'games.json')) && only.length ? JSON.parse(readFileSync(join(DIST, 'games.json'), 'utf8')).games : [];
  for (const g of games) {
    const m = g.manifest, out = join(DIST, 'games', m.id);
    checkNames(engine, g);
    const page = assemble({ shell: engine.shellCode, engine, manifest: m, head: g.head, parts: g.parts });
    checkSyntax(page, `${g.path}`);
    write(join(out, 'index.html'), page);
    write(join(out, 'game.json'), JSON.stringify(m, null, 2) + '\n');
    let thumb = null;
    if (m.thumbnail && existsSync(join(ROOT, g.path, m.thumbnail))) { thumb = `games/${m.id}/${m.thumbnail}`; mkdirSync(out, { recursive: true }); copyFileSync(join(ROOT, g.path, m.thumbnail), join(DIST, thumb)); }
    // sources for the editor: the manifest, the head and every part
    const src = join(DIST, 'src', 'games', m.id);
    write(join(src, 'game.json'), read(`${g.path}/game.json`));
    if (m.head) write(join(src, m.head), g.head);
    for (const p of g.parts) write(join(src, p.name), p.code);
    const entry = {
      id: m.id, title: m.title, tagline: m.tagline || '', description: m.description || '', status: m.status || 'draft',
      order: m.order ?? 99, listed: m.listed !== false, template: !!m.template, path: g.path, thumbnail: thumb,
      controls: m.controls || [], tunables: Object.keys(m.tunables || {}).length,
      parts: [...(m.head ? [m.head] : []), ...m.parts], sizeKB: Math.round(page.length / 1024), updated: gitDate(g.path)
    };
    const at = listing.findIndex(e => e.id === m.id); if (at >= 0) listing[at] = entry; else listing.push(entry);
    console.log(`built ${g.path} → dist/games/${m.id}/index.html (${entry.sizeKB} KB)`);
  }
  listing.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  write(join(DIST, 'games.json'), JSON.stringify({ engine: { name: engine.name, version: engine.version, parts: engine.parts.map(p => p.name), shell: engine.shell }, built: new Date().toISOString(), games: listing }, null, 2) + '\n');
  console.log('SYNTAX_OK');
}

function scaffold(id, title) {
  if (!ID_RE.test(id || '')) die('usage: new <id> [--title "Title"]   (id: lower-case letters, digits, dashes; 2-32 chars)');
  const dst = join(ROOT, 'games', id);
  if (existsSync(dst)) die(`games/${id} already exists`);
  cpSync(join(ROOT, 'templates', 'starter'), dst, { recursive: true });
  const mp = join(dst, 'game.json'), m = JSON.parse(readFileSync(mp, 'utf8'));
  const order = Math.max(0, ...gameDirs().filter(g => g.base === 'games' && g.name !== id).map(g => readJSON(`${g.path}/game.json`).order || 0)) + 1;
  Object.assign(m, { id, title: title || id.replace(/(^|-)(\w)/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase()), listed: true, status: 'draft', order,
    tagline: 'A new Glyphite game (draft)', description: 'Copied from the starter; not made yet.' });
  delete m.thumbnail; rmSync(join(dst, 'thumb.png'), { force: true });   // make one with tools/thumbnail.py
  writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
  for (const f of readdirSync(dst)) if (f.endsWith('.js')) { const p = join(dst, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/id: 'starter'/g, `id: '${id}'`)); }
  console.log(`created games/${id}/ from templates/starter
next:
  1. edit games/${id}/game.json (title, tagline, description, controls, tunables)
  2. make the game in games/${id}/*.js (see engine/API.md and the glyphite-new-game skill)
  3. node tools/glyphite.mjs build ${id} && python3 tests/smoke.py ${id}`);
}

function list() {
  for (const g of gameDirs()) {
    const m = readJSON(`${g.path}/game.json`);
    console.log(`${m.id.padEnd(16)} ${(m.status || 'draft').padEnd(9)} ${g.base === 'templates' ? 'template' : m.listed === false ? 'unlisted' : 'listed  '}  ${m.title}`);
  }
}

function serve(port) {
  if (!existsSync(DIST)) die('nothing to serve: run build first');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mid': 'audio/midi' };
  createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(DIST, p);
    if (relative(DIST, f).startsWith('..')) { res.writeHead(403); return res.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  }).listen(port, () => console.log(`serving dist/ on http://localhost:${port}`));
}

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
if (cmd === 'build') build(args);
else if (cmd === 'new') { const title = flag('--title'); scaffold(args[0], title); }
else if (cmd === 'list') list();
else if (cmd === 'serve') serve(+flag('--port', 8787));
else { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 7).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 1 : 0); }
