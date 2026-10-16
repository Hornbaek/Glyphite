// Reference art (the owner's rule): every image a game was given is kept in its ref/ folder, every drawing cut from one is
// kept in ref/frames/, and ref/ref.json lists them all, so the site's ART page shows everything and nothing is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const games = readdirSync(join(ROOT, 'games')).filter(id => existsSync(join(ROOT, 'games', id, 'ref')));

test('some games have reference art', () => assert.ok(games.length >= 2, games.join(', ')));

for (const id of games) {
  test(`${id}: ref.json lists every reference image and drawing, and only files that are there`, () => {
    const dir = join(ROOT, 'games', id, 'ref');
    assert.ok(existsSync(join(dir, 'ref.json')), `games/${id}/ref/ has images but no ref.json`);
    const ref = JSON.parse(readFileSync(join(dir, 'ref.json'), 'utf8'));
    const sheets = new Set(ref.sheets.map(s => s.file)), frames = new Set(ref.sheets.flatMap(s => s.frames.map(f => f.file)));
    for (const f of readdirSync(dir).filter(f => IMAGE.test(f))) assert.ok(sheets.has(f), `${f} is not listed as a sheet`);
    if (existsSync(join(dir, 'frames'))) for (const f of readdirSync(join(dir, 'frames'))) assert.ok(frames.has(`frames/${f}`), `frames/${f} is not listed`);
    for (const f of [...sheets, ...frames]) assert.ok(existsSync(join(dir, f)), `${f} is listed but missing`);
    for (const s of ref.sheets) {
      assert.ok(s.title && (s.frames.length || s.use), `${s.file}: a title, and what it is used for`);
      for (const f of s.frames) {
        const [x0, y0, x1, y1] = f.box;
        assert.ok(x0 < x1 && y0 < y1 && x1 <= s.size[0] + 1 && y1 <= s.size[1] + 1, `${f.file}: box ${f.box} on a ${s.size} sheet`);
        assert.ok(f.use && typeof f.used === 'boolean', `${f.file}: what it is used for`);
      }
    }
  });
}
