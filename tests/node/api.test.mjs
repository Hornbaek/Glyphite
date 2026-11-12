// engine/api.json is the engine's public surface read from its source; the lint that checks game code against it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineApi, partNames, undocumented, checkCalls, gameDeclared } from '../../tools/apicheck.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

test('engine/api.json is current (run node tools/apicheck.mjs --write after changing the engine)', () => {
  assert.equal(rd('engine/api.json'), JSON.stringify(engineApi(), null, 1) + '\n');
});
test('every engine name is in engine/API.md or on purpose in engine/internal.json', () => {
  const internal = JSON.parse(rd('engine/internal.json')), miss = undocumented(engineApi(), rd('engine/API.md')).filter(n => !internal.includes(n));
  assert.deepEqual(miss, [], 'document these in engine/API.md (or, if they are internal, add them to engine/internal.json)');
  const names = engineApi().names; for (const n of internal) assert.ok(n in names, `internal.json lists ${n}, which no longer exists`);
});
test('names are read with their kind and parameters', () => {
  const n = partNames("function drawSprite(spr, x, y, a, o = {}) {}\nconst clamp = (v, a, b) => v;\nclass Body {}\nconst G = 3, H = 4;\nlet frameNo = 0;\nfunction f(...r) {}\nconst one = x => x;", 'x.js');
  assert.deepEqual([n.drawSprite.kind, n.drawSprite.params, n.clamp.params, n.Body.kind, n.G.kind, n.frameNo.kind, n.f.params, n.one.params], ['function', 5, 3, 'class', 'value', 'value', null, 1]);
  assert.ok(engineApi().names.drawSprite.params >= 4 && engineApi().names.spawn.kind === 'function' && engineApi().names.Character.kind === 'class');
});
test('the lint finds extra arguments and typos, and leaves methods, locals, strings and comments alone', () => {
  const api = engineApi().names, parts = [{ name: 'a.js', code: "const fill = (a, b, c, d, e) => 1; fill(1, 2, 3, 4, 5);\ndefineEntity('x', { update(e, dt) {}, draw(e) {} });\n// drawSprite(1,2,3,4,5,6,7)\nconst s = 'spawn(1,2,3,4,5,6)'; function mine(q) { q(); }" }];
  const d = gameDeclared(parts), run = code => checkCalls('g.js', code, api, d);
  assert.deepEqual(run(parts[0].code), [], 'a local fill, method definitions, a comment, a string and a callback are fine');
  assert.match(run('clamp(1, 2, 3, 4);')[0], /clamp\(\) is called with 4 arguments but takes 3/);
  assert.match(run('drwaSprite(spr, 1, 2, 0);')[0], /did you mean drawSprite\(\)/);
  assert.deepEqual(run('clamp(f(1, 2), 2, 3); Math.max(1, 2, 3, 4);'), [], 'nested calls and builtins');
});
