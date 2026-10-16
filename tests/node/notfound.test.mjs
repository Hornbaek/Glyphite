// A page that does not exist: browsers get the 404 game with status 404, everything else a plain 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/index.js';

const GAME = '<!doctype html><title>Page Not Found</title><canvas id="screen"></canvas>';
const env = {
  DEV_EMAIL: 'dev@example.com',
  ASSETS: { fetch: async req => {
    const p = new URL(req.url).pathname;
    if (p === '/games/notfound/') return new Response(GAME, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    if (p === '/' || p === '/games.json') return new Response('ok', { status: 200 });
    return new Response('Not Found', { status: 404 });
  } }
};
const get = (path, accept) => worker.fetch(new Request('http://localhost:8787' + path, { headers: accept ? { Accept: accept } : {} }), env);

test('a browser asking for a missing page gets the 404 game, with status 404 and no caching', async () => {
  const res = await get('/no/such/page', 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(await res.text(), GAME);
});

test('files, the API and non-browser requests get a plain 404', async () => {
  for (const [path, accept] of [['/missing.js', '*/*'], ['/missing.png', 'image/png'], ['/api/nothing', 'text/html'], ['/no/such/page', undefined], ['/no/such/page', 'application/json']]) {
    const res = await get(path, accept);
    assert.equal(res.status, 404, `${path} ${accept}`);
    assert.doesNotMatch(await res.text(), /Page Not Found/, `${path} ${accept}`);
  }
});

test('pages that exist are untouched', async () => {
  const res = await get('/', 'text/html');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('the 404 game is only reached after the sign-in check', async () => {
  const res = await worker.fetch(new Request('https://glyphite.hornbaek.org/no/such/page', { headers: { Accept: 'text/html' } }), { ...env, DEV_EMAIL: undefined, ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal(res.status, 401);
  assert.doesNotMatch(await res.text(), /canvas/);
});
