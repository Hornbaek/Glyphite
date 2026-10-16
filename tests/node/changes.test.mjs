// What's new: the HISTORY.md parser, the merged-pull-request reader and the build output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHistory, mergedPullRequests, buildChanges } from '../../tools/changes.mjs';

const ROOT = new URL('../../', import.meta.url);
const SAMPLE = `# History

---
## 3. Something new (Claude Code, 2026-10-20)

> "First line of the request
> continued on the next line."
>
> "A second quoted paragraph."

- First thing done, with \`code\`.
  It continues on a second line.
- Second thing.

## 4. No date or bullets here

Just a paragraph that says what happened.

## Published versions (not a numbered section)
`;

test('sections, dates, quoted requests and bullets are read from the markdown', () => {
  const [a, b] = parseHistory(SAMPLE);
  assert.deepEqual([a.n, a.title, a.date, a.by], [3, 'Something new', '2026-10-20', 'Claude Code']);
  assert.deepEqual(a.quote, ['First line of the request continued on the next line.', 'A second quoted paragraph.']);
  assert.deepEqual(a.items, ['First thing done, with `code`. It continues on a second line.', 'Second thing.']);
  assert.deepEqual([b.n, b.title, b.date], [4, 'No date or bullets here', null]);
  assert.deepEqual(b.items, ['Just a paragraph that says what happened.']);
  assert.equal(parseHistory(SAMPLE).length, 2, 'a heading without a number is not a section');
});

test('the real docs/HISTORY.md parses: every numbered section has a title, a request or something done', () => {
  const sections = parseHistory(readFileSync(new URL('docs/HISTORY.md', ROOT), 'utf8'));
  assert.ok(sections.length >= 13);
  for (const s of sections) assert.ok(s.title && (s.items.length || s.quote.length), `section ${s.n}`);
  assert.deepEqual(sections.map(s => s.n), [...new Set(sections.map(s => s.n))], 'no number twice');
});

test('merged pull requests come from squash commits and a missing history is not an error', () => {
  const merged = mergedPullRequests(new URL('.', ROOT).pathname);
  for (const m of merged) assert.ok(m.pr > 0 && m.title && /^\d{4}-\d{2}-\d{2}$/.test(m.date));
  assert.deepEqual(mergedPullRequests('/nonexistent-folder'), []);
});

test('buildChanges: newest first, with the latest number', () => {
  const c = buildChanges(SAMPLE, new URL('.', ROOT).pathname);
  assert.equal(c.latest, 4);
  assert.deepEqual(c.sections.map(s => s.n), [4, 3]);
});
