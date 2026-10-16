// The site build: every game assembles into one page, the listing is complete, and the assembler the
// editor runs in the browser gives the same page as the Node build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, lineMap } from '../../tools/assemble.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const read = p => readFileSync(join(ROOT, p), 'utf8');
execFileSync(process.execPath, [join(ROOT, 'tools/glyphite.mjs'), 'build'], { cwd: ROOT, stdio: 'pipe' });
const listing = JSON.parse(readFileSync(join(DIST, 'games.json'), 'utf8'));

test('every game builds into a page and is listed', () => {
  assert.ok(listing.games.length >= 1);
  for (const g of listing.games) {
    const page = readFileSync(join(DIST, 'games', g.id, 'index.html'), 'utf8');
    assert.match(page, /^<!doctype html>/);
    assert.ok(page.includes(`<title>${g.title.replace(/&/g, '&amp;')}</title>`), g.id);
    assert.ok(!/\{\{\w+\}\}/.test(page.slice(0, page.indexOf('<script>'))), `${g.id}: unfilled placeholder`);
    for (const p of g.parts) assert.ok(existsSync(join(DIST, 'src', 'games', g.id, p)), `${g.id}: source ${p} for the editor`);
  }
  assert.ok(listing.games.some(g => g.id === 'regolith' && g.listed));
});

test('the idea bank page, its data and the button that opens it are in the site', () => {
  assert.equal(read('docs/ideas.json'), readFileSync(join(DIST, 'ideas', 'ideas.json'), 'utf8'));
  assert.match(readFileSync(join(DIST, 'ideas', 'index.html'), 'utf8'), /\/assets\/ideas\.js/);
  assert.match(readFileSync(join(DIST, 'index.html'), 'utf8'), /href="\/ideas\/"/);
});

test('the What\'s new page, its data and the 404 game are in the site', () => {
  const changes = JSON.parse(readFileSync(join(DIST, 'changes.json'), 'utf8'));
  assert.ok(changes.sections.length >= 13 && changes.latest === changes.sections[0].n);
  assert.match(readFileSync(join(DIST, 'whats-new', 'index.html'), 'utf8'), /\/assets\/whatsnew\.js/);
  assert.match(readFileSync(join(DIST, 'index.html'), 'utf8'), /href="\/whats-new\/"/);
  assert.ok(existsSync(join(DIST, 'games', 'notfound', 'index.html')), 'the 404 game is built');
  assert.equal(listing.games.find(g => g.id === 'notfound').listed, false, 'and kept out of the game list');
});

test('the browser assembler reproduces the built page', () => {
  const engine = JSON.parse(read('engine/engine.json'));
  for (const g of listing.games) {
    const m = JSON.parse(read(`${g.path}/game.json`));
    if (g.template) { m.listed = false; m.template = true; }
    const page = assemble({
      shell: read(`engine/${engine.shell}`),
      engine: { version: engine.version, parts: engine.parts.map(name => ({ name, code: read(`engine/${name}`) })) },
      manifest: m, head: m.head ? read(`${g.path}/${m.head}`) : '', parts: m.parts.map(name => ({ name, code: read(`${g.path}/${name}`) }))
    });
    assert.equal(page, readFileSync(join(DIST, 'games', g.id, 'index.html'), 'utf8'), g.id);
  }
});

test('page lines map back to source files', () => {
  const page = readFileSync(join(DIST, 'games', 'regolith', 'index.html'), 'utf8'), map = lineMap(page), lines = page.split('\n');
  const at = lines.findIndex(l => l.startsWith('function stepRockets(')) + 1;
  const [file, line] = map[at];
  assert.equal(file, 'games/regolith/lander.js');
  assert.equal(read(file).split('\n')[line - 1], lines[at - 1]);
});

test('assemble refuses code that would close the script element', () => {
  assert.throws(() => assemble({ shell: '{{SCRIPT}}', engine: { parts: [] }, manifest: { id: 'x', title: 'X' }, parts: [{ name: 'a.js', code: 'const s = "</script>";' }] }), /script/);
});
