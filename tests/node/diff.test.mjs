// The editor's patches must apply with `git apply`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unifiedDiff } from '../../portal/assets/diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(ROOT, 'games/regolith/lander.js'), 'utf8');

test('random edits round-trip through git apply', () => {
  let seed = 7; const R = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let trial = 0; trial < 40; trial++) {
    const lines = src.split('\n');
    for (let e = 0; e < 1 + R(6); e++) { const i = R(lines.length), op = R(3); if (op === 0) lines.splice(i, 1); else if (op === 1) lines.splice(i, 0, `added ${trial}.${e}`); else lines[i] += ' // changed'; }
    let a = src, b = lines.join('\n');
    if (trial % 7 === 3) b = b.replace(/\n$/, '');
    if (trial % 11 === 5) a = a.replace(/\n$/, '');
    const dir = mkdtempSync(join(tmpdir(), 'glyphite-diff-'));
    try {
      mkdirSync(join(dir, 'g')); writeFileSync(join(dir, 'g/f.js'), a);
      execFileSync('git', ['init', '-q'], { cwd: dir });
      writeFileSync(join(dir, 'p.diff'), unifiedDiff('g/f.js', a, b));
      execFileSync('git', ['apply', 'p.diff'], { cwd: dir, stdio: 'pipe' });
      assert.equal(readFileSync(join(dir, 'g/f.js'), 'utf8'), b, `trial ${trial}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
test('no change, no diff', () => assert.equal(unifiedDiff('a', 'x\n', 'x\n'), ''));
