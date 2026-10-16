// The idea bank: the data file, the generated markdown, and the D1-backed API (real SQLite stands in for D1).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIdeas, validate, renderMarkdown, md } from '../../tools/ideas.mjs';
import { handleIdeas, resetKnownIdeas } from '../../worker/ideas.js';
import worker from '../../worker/index.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const sqlite = await import('node:sqlite').catch(() => null);
const skip = sqlite ? false : 'node:sqlite is not available in this Node';

test('docs/ideas.json is valid and docs/IDEAS.md is generated from it', () => {
  const data = loadIdeas();
  assert.ok(validate(data) > 1000);
  assert.equal(read('docs/IDEAS.md'), renderMarkdown(data), 'run: node tools/ideas.mjs');
});

test('markdown escaping keeps code spans and escapes the rest', () => {
  assert.equal(md('A* and `*+x+*` stay <id>'), 'A\\* and `*+x+*` stay &lt;id&gt;');
  assert.equal(md("'a' becomes '`' here"), "'a' becomes '\\`' here");
});

// a D1-shaped wrapper over node:sqlite: prepare().bind().all()/run()/first(), batch()
function d1() {
  const db = new sqlite.DatabaseSync(':memory:');
  for (const m of readdirSync(new URL('migrations/', ROOT)).filter(f => f.endsWith('.sql')).sort()) db.exec(read(`migrations/${m}`));   // as D1 applies them
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    _go() { return /^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...args) } : (db.prepare(sql).run(...args), { results: [] }); }
  });
  return { prepare: sql => stmt(sql), batch: async list => list.map(s => s._go()), raw: db };
}
const ideasJson = read('docs/ideas.json');
const ID = JSON.parse(ideasJson).categories[0].ideas[0].id;
const ID2 = JSON.parse(ideasJson).categories[1].ideas[0].id;
let env;
beforeEach(() => {
  resetKnownIdeas();
  env = { DB: sqlite ? d1() : null, ASSETS: { fetch: async () => new Response(ideasJson, { headers: { 'Content-Type': 'application/json' } }) } };
});
const user = { email: 'me@example.com' };
const put = (id, body, headers = { 'X-Glyphite': '1' }) =>
  handleIdeas(new Request(`https://glyphite.hornbaek.org/api/ideas/${id}`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, user);
const list = async () => (await (await handleIdeas(new Request('https://glyphite.hornbaek.org/api/ideas'), env, user)).json()).items;

test('starring, status and note are stored and partial updates keep the rest', { skip }, async () => {
  assert.deepEqual(await list(), {});
  let r = await put(ID, { starred: true });
  assert.equal(r.status, 200);
  const first = await r.json();
  assert.deepEqual([first.starred, first.status, first.note, first.updated_by], [true, 'idea', '', 'me@example.com']);
  await put(ID, { status: 'planned', note: '  next up  ' });
  const now = (await list())[ID];
  assert.deepEqual([now.starred, now.status, now.note], [true, 'planned', 'next up']);
  await put(ID2, { status: 'parked' });
  assert.equal(Object.keys(await list()).length, 2);
});

test('asking for an explanation is stored, kept by other changes and cleared on its own', { skip }, async () => {
  let r = await (await put(ID, { ask: true })).json();
  assert.deepEqual([r.ask, r.starred, r.status], [true, false, 'idea']);
  await put(ID, { status: 'planned' });
  assert.equal((await list())[ID].ask, true);
  r = await (await put(ID, { ask: false })).json();
  assert.deepEqual([r.ask, r.status], [false, 'planned']);
  // marked and nothing else: the row lives while the mark does
  await put(ID2, { ask: true });
  assert.equal((await list())[ID2].ask, true);
  await put(ID2, { ask: false });
  assert.equal((await list())[ID2], undefined);
});

test('an idea back at its defaults loses its row', { skip }, async () => {
  await put(ID, { starred: true, status: 'building', note: 'x' });
  await put(ID, { starred: false, status: 'idea', note: '' });
  assert.deepEqual(await list(), {});
  const r = await put(ID, { note: '' });
  assert.equal((await r.json()).status, 'idea');
  assert.deepEqual(await list(), {});
});

test('bad requests are refused and change nothing', { skip }, async () => {
  const cases = [
    [put(ID, { starred: true }, {}), 403],                        // no X-Glyphite header
    [put(ID, 'not json'), 400],
    [put(ID, '[1]'), 400],
    [put(ID, {}), 400],
    [put(ID, { status: 'done' }), 400],
    [put(ID, { starred: 'yes' }), 400],
    [put(ID, { ask: 1 }), 400],
    [put(ID, { note: 'x'.repeat(501) }), 400],
    [put(ID, { note: 5 }), 400],
    [put('Not_An_Id', { starred: true }), 400],
    [put('no-such-idea', { starred: true }), 404],
    [put(ID, 'x'.repeat(5000)), 413],
    [handleIdeas(new Request('https://glyphite.hornbaek.org/api/ideas', { method: 'DELETE' }), env, user), 405],
    [handleIdeas(new Request(`https://glyphite.hornbaek.org/api/ideas/${ID}`), env, user), 405]
  ];
  for (const [p, want] of cases) assert.equal((await p).status, want);
  assert.deepEqual(await list(), {});
});

test('without the D1 binding the API says so instead of failing', async () => {
  env.DB = undefined;
  assert.equal((await put(ID, { starred: true })).status, 503);
});

test('the Worker serves the API only to a signed-in user', { skip }, async () => {
  const devEnv = { ...env, DEV_EMAIL: 'dev@example.com' };
  const res = await worker.fetch(new Request(`http://localhost:8787/api/ideas/${ID}`, { method: 'PUT', headers: { 'X-Glyphite': '1' }, body: '{"starred":true}' }), devEnv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(env.DB.raw.prepare('SELECT updated_by FROM idea_state').get().updated_by, 'dev@example.com');
  const anon = await worker.fetch(new Request('https://glyphite.hornbaek.org/api/ideas'), { ...env, ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal(anon.status, 401);
});
