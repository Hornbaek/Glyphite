// The phone pad's meeting place (worker/pad.js): a studio puts an offer under a code, a phone answers it, old ones go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, skip } from './d1.mjs';
import { handlePad } from '../../worker/pad.js';
import { handle } from '../../worker/index.js';

const call = async (db, method, path, body, { header = true, now } = {}) => {
  const req = new Request('https://x.test' + path, { method, headers: { ...(header && method !== 'GET' ? { 'X-Pixelite': '1' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handlePad(req, { DB: db }, { email: 'me@example.com' }, now);
  return { status: res.status, body: await res.json() };
};
const offer = (id = 'abc123') => ({ offer: { id, sdp: 'v=0 offer ' + id } }), answer = (id = 'abc123') => ({ answer: { id, sdp: 'v=0 answer ' + id } });

test('an offer waits under its code, and the phone reads it and answers', { skip }, async () => {
  const db = d1();
  assert.equal((await call(db, 'GET', '/api/pad/123456')).status, 404);
  assert.equal((await call(db, 'PUT', '/api/pad/123456', offer())).status, 200);
  let r = await call(db, 'GET', '/api/pad/123456');
  assert.deepEqual(r.body, { offer: { id: 'abc123', sdp: 'v=0 offer abc123' }, answer: null });
  assert.equal((await call(db, 'PUT', '/api/pad/123456/answer', answer())).status, 200);
  r = await call(db, 'GET', '/api/pad/123456');
  assert.deepEqual(r.body.answer, { id: 'abc123', sdp: 'v=0 answer abc123' });
});

test('a new offer replaces the old one and clears its answer; an answer for the old offer is refused', { skip }, async () => {
  const db = d1();
  await call(db, 'PUT', '/api/pad/123456', offer('first1'));
  await call(db, 'PUT', '/api/pad/123456/answer', answer('first1'));
  await call(db, 'PUT', '/api/pad/123456', offer('second'));
  assert.equal((await call(db, 'GET', '/api/pad/123456')).body.answer, null, 'the old answer went with the old offer');
  const late = await call(db, 'PUT', '/api/pad/123456/answer', answer('first1'));
  assert.equal(late.status, 409);
  assert.equal((await call(db, 'GET', '/api/pad/123456')).body.answer, null);
  assert.equal((await call(db, 'PUT', '/api/pad/123456/answer', answer('second'))).status, 200);
});

test('only six digits are a code, only well formed parts are kept, and changes need the header', { skip }, async () => {
  const db = d1();
  for (const bad of ['12345', '1234567', 'abcdef', '12 456']) assert.equal((await call(db, 'GET', '/api/pad/' + encodeURIComponent(bad))).status, 400, bad);
  assert.equal((await call(db, 'PUT', '/api/pad/123456', offer(), { header: false })).status, 403);
  assert.equal((await call(db, 'DELETE', '/api/pad/123456', undefined, { header: false })).status, 403);
  assert.equal((await call(db, 'PUT', '/api/pad/123456', { offer: { id: 'abc123' } })).status, 400, 'no sdp');
  assert.equal((await call(db, 'PUT', '/api/pad/123456', { offer: { id: 'BAD ID', sdp: 'x' } })).status, 400, 'a bad id');
  assert.equal((await call(db, 'PUT', '/api/pad/123456', { offer: { id: 'abc123', sdp: 'x'.repeat(30_001) } })).status, 400, 'too large');
  assert.equal((await call(db, 'PUT', '/api/pad/123456/answer', answer())).status, 404, 'an answer to nothing');
  assert.equal((await call(db, 'POST', '/api/pad/123456', offer(), { header: false })).status, 403, 'a method it does not have, without the header');
  assert.equal((await call(db, 'POST', '/api/pad/123456', offer())).status, 405, 'and with it');
});

test('a link older than ten minutes is gone, and putting a new offer sweeps the old ones', { skip }, async () => {
  const db = d1(), t0 = 1_000_000_000;
  await call(db, 'PUT', '/api/pad/111111', offer(), { now: t0 });
  assert.equal((await call(db, 'GET', '/api/pad/111111', undefined, { now: t0 + 9 * 60_000 })).status, 200);
  assert.equal((await call(db, 'GET', '/api/pad/111111', undefined, { now: t0 + 11 * 60_000 })).status, 404, 'too old to be read');
  assert.equal((await call(db, 'PUT', '/api/pad/111111/answer', answer(), { now: t0 + 11 * 60_000 })).status, 404, 'or answered');
  await call(db, 'PUT', '/api/pad/222222', offer('other1'), { now: t0 + 11 * 60_000 });
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM pad_link').get().n, 1, 'the old row was swept');
  assert.equal((await call(db, 'DELETE', '/api/pad/222222')).status, 200);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM pad_link').get().n, 0);
});

test('the site routes /api/pad/ behind the sign-in, like the other APIs', { skip }, async () => {
  const db = d1(), env = { DB: db, ASSETS: { fetch: async () => new Response('x') } };
  const signedIn = async () => ({ email: 'me@example.com' });
  const out = await handle(new Request('https://x.test/api/pad/123456'), env, { auth: signedIn });
  assert.equal(out.status, 404); assert.equal((await out.json()).error, 'Nothing is waiting under that code.');
  const { AuthError } = await import('../../worker/auth.js');
  const refused = await handle(new Request('https://x.test/api/pad/123456'), env, { auth: async () => { throw new AuthError(401, 'Please sign in.'); } });
  assert.equal(refused.status, 401);
});
