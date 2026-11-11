// What the build tells people who write games: the engine version, source lines in errors, duplicate hooks, unknown game.json keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../../tools/assemble.mjs';
import { checkAuthor, literalKeys } from '../../tools/authorcheck.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8');

test('the page knows the engine version from engine.json, and the line its script starts on', () => {
  const eng = JSON.parse(rd('engine/engine.json'));
  const page = assemble({ shell: rd('engine/shell.html'), engine: { ...eng, parts: [{ name: 'x.js', code: 'let a = 1;' }] }, manifest: { id: 't', title: 'T' }, parts: [{ name: 'g.js', code: 'let b = 2;' }] });
  assert.ok(page.includes(`const ENGINE_VERSION = "${eng.version}";`));
  const line0 = +/PIXELITE_LINE0 = (\d+);/.exec(page)[1];
  assert.equal(page.split('\n')[line0 - 1], '<script>', 'PIXELITE_LINE0 is the line of the <script> tag');
});

test('duplicate hooks and unknown game.json keys stop the build; Math.random warns', () => {
  const run = code => checkAuthor({ path: 'games/t', manifest: { id: 't', parts: [] }, parts: [{ name: 'main.js', code }] });
  assert.deepEqual(run('Pixelite.run({ id: "t", update(dt) { if (a) { b: 1 } }, draw() {}, afterFrame() {}, async init() {}, hud: t => {} });').errors, []);
  const dup = run('Pixelite.run({ id: "t", afterFrame() {}, update() {}, afterFrame() { x({ a: 1, a: 2 }); } });').errors;
  assert.equal(dup.length, 1); assert.match(dup[0], /"afterFrame" appears twice/);
  assert.deepEqual(literalKeys("{ a: 1, 'b': [1, { c: 2 }], d() { return { e: 1 }; }, async f() {}, g }", 0), ['a', 'b', 'd', 'f', 'g']);
  assert.match(checkAuthor({ path: 'games/t', manifest: { id: 't', tunable: {} }, parts: [] }).errors[0], /unknown key "tunable"/);
  assert.match(run('const x = Math.random();').warnings[0], /use rnd\(\)/);
});

test('every game in the repository passes the author checks', () => {
  for (const dir of ['games/regolith', 'games/spacemouse', 'games/fjordheim', 'games/showcase', 'games/notfound', 'templates/starter']) {
    const m = JSON.parse(rd(`${dir}/game.json`));
    const parts = m.parts.map(name => ({ name, code: rd(`${dir}/${name}`) }));
    const r = checkAuthor({ path: dir, manifest: m, parts });
    assert.deepEqual(r.errors, [], dir); assert.deepEqual(r.warnings, [], dir + ': use rnd() instead of Math.random');
  }
});
