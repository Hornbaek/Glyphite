// The QR maker (portal/assets/qr.mjs). It was checked once against a real decoder (OpenCV read back texts of 1 to 200 bytes, versions 1 to
// 10, with accents and a euro sign), so the pictures below are known good; here they are pinned, and the shape of a code is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qrMatrix, qrSvg } from '../../portal/assets/qr.mjs';

const hash = m => createHash('sha256').update(m.map(r => r.map(v => (v ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);

test('known texts make the pictures a real decoder read back', () => {
  assert.deepEqual([21, hash(qrMatrix('hello world'))], [qrMatrix('hello world').length, 'dacd0c28a9820277']);
  assert.deepEqual([33, '1bf06a642adf3eff'], [qrMatrix('https://glyphite.hornbaek.org/studio/pad/?c=123456').length, hash(qrMatrix('https://glyphite.hornbaek.org/studio/pad/?c=123456'))]);
  assert.deepEqual([57, '9d9550d437781823'], [qrMatrix('y'.repeat(200)).length, hash(qrMatrix('y'.repeat(200)))]);
});

test('every code has the three finders, the timing lines and the dark module', () => {
  for (const text of ['A', 'hello world', 'x'.repeat(100)]) {
    const m = qrMatrix(text), n = m.length;
    assert.equal(n % 4, 1);
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {   // a finder: a dark ring, a light ring, a dark 3 x 3
      for (let i = 0; i < 7; i++) assert.ok(m[y0][x0 + i] && m[y0 + 6][x0 + i] && m[y0 + i][x0] && m[y0 + i][x0 + 6], 'outer ring');
      assert.ok(m[y0 + 2][x0 + 2] && m[y0 + 3][x0 + 3] && m[y0 + 4][x0 + 4], 'centre');
      assert.ok(!m[y0 + 1][x0 + 1] && !m[y0 + 1][x0 + 5], 'inner ring is light');
    }
    for (let i = 8; i < n - 8; i++) assert.equal(m[6][i], i % 2 === 0, 'timing row');
    assert.equal(m[n - 8][8], true, 'the always dark module');
  }
});

test('too much text is refused, and the SVG is a picture with a quiet zone', () => {
  assert.throws(() => qrMatrix('z'.repeat(300)), /too much/);
  const svg = qrSvg('hello', { scale: 4 });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29" width="116" height="116"/);   // 21 modules and a quiet zone of four on each side
  assert.ok(svg.includes('<path d="M'));
});
