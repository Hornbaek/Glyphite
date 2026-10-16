// The level editor's core (portal/assets/levels-core.mjs): finding maps in a game's source, writing them back, the edits,
// and the one-pixel-per-tile pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLevels, setLevel, problems, paint, rectCells, lineCells, floodCells, resize, readMarks, toPixels, fromPixels } from '../../portal/assets/levels-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = JSON.parse(readFileSync(join(ROOT, 'games/spacemouse/game.json'), 'utf8'));
const src = readFileSync(join(ROOT, 'games/spacemouse', game.levels.file), 'utf8');
const legend = game.levels.legend;

test('finds every Space Mouse sector, named, with rows the game would load', () => {
  const lv = findLevels(src);
  assert.deepEqual(lv.map(l => l.name), ['CARGO BAY', 'HYDROPONICS', 'OBSERVATION DECK']);
  for (const l of lv) {
    assert.ok(l.rows.length > 10 && l.rows.every(r => r.length === l.rows[0].length), l.name);
    assert.deepEqual(problems(l.rows, legend), [], l.name);   // the shipped maps use only legend tiles, one start each
  }
});

test('writing a map back changes only that map', () => {
  const lv = findLevels(src), rows = lv[1].rows.slice();
  rows[5] = 'x' + rows[5].slice(1);
  const out = setLevel(src, lv[1], rows), again = findLevels(out);
  assert.equal(again[1].rows[5][0], 'x');
  assert.deepEqual(again[0].rows, lv[0].rows); assert.deepEqual(again[2].rows, lv[2].rows);
  assert.equal(setLevel(out, again[1], lv[1].rows), src);   // and back again, byte for byte
  assert.throws(() => setLevel(src, lv[0], ['a`b']), /backtick/);
});

test('marks come from each map\'s own object, not from the comments', () => {
  const lv = findLevels(src);
  const m0 = readMarks(lv[0], game.levels.marks), m2 = readMarks(lv[2], game.levels.marks);
  assert.deepEqual(m0.filter(m => m.kind === 'text').map(m => m.text), ['CARGO BAY 1', 'STACK WITH CARE', 'DECK 2']);
  assert.equal(m0.filter(m => m.kind === 'rect').length, 0);
  assert.deepEqual(m2.filter(m => m.kind === 'rect').map(m => [m.x0, m.y0, m.x1, m.y1]), [[0, 0, 57, 14]]);
});

test('edits: pen lines without gaps, rectangles, flood fill, resize', () => {
  const rows = ['#####', '#...#', '#...#', '#####'];
  assert.deepEqual(lineCells(0, 0, 3, 1).length, 4);
  assert.deepEqual(paint(rows, rectCells(1, 1, 3, 2), 'C'), ['#####', '#CCC#', '#CCC#', '#####']);
  assert.equal(floodCells(rows, 2, 2).length, 6);
  assert.equal(floodCells(rows, 0, 0).length, 14);
  assert.deepEqual(resize(rows, 7, 5), ['#####' + '##', '#...###', '#...###', '#######', '#######']);
  assert.deepEqual(resize(rows, 3, 2), ['###', '#..']);
});

test('a one-of-a-kind tile moves instead of doubling', () => {
  const rows = ['#####', '#P..#', '#####'];
  assert.deepEqual(paint(rows, [[3, 1]], 'P', legend), ['#####', '#..P#', '#####']);
  assert.deepEqual(paint(rows, rectCells(1, 1, 3, 1), 'P', legend), ['#####', '#..P#', '#####']);
  assert.match(problems(['#####', '#...#', '#####'], legend)[0], /mouse start/);
  assert.match(problems(['###', '#Z#', '###'], legend).join(), /unknown tiles: "Z"/);
  assert.match(problems(['####', '#P#', '####'], legend)[0], /row 1 is 3 wide/);
});

test('a map survives the round trip through a picture, and near colours land on the right tile', () => {
  const rows = findLevels(src)[2].rows, w = rows[0].length, h = rows.length;
  assert.equal(new Set(Object.values(legend).map(e => e.color)).size, Object.keys(legend).length, 'every tile needs its own colour');
  const px = toPixels(rows, legend);
  assert.deepEqual(fromPixels(px, w, h, legend), rows);
  const off = px.map((v, i) => i % 4 === 3 ? v : Math.max(0, Math.min(255, v + ((i * 7) % 9) - 4)));   // a pixel editor's rounding
  assert.deepEqual(fromPixels(off, w, h, legend), rows);
});
