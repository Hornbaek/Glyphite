// Who sees what (worker/index.js): the landing page and its demo are public, everything else needs the Access sign-in,
// and /login only ever sends a visitor back to a page on this site. The sign-in check itself is tested in auth.test.mjs;
// here it is replaced by a stand-in that is signed in, signed out, refused, or not set up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, isPublic, safeNext } from '../../worker/index.js';
import { AuthError } from '../../worker/auth.js';

const FILES = { '/': 'game list', '/welcome/': 'landing', '/welcome/welcome.css': 'css', '/games/showcase/': 'demo', '/games/spacemouse/': 'space mouse',
  '/games.json': '{}', '/edit/': 'editor', '/games/notfound/': '404 game' };
const env = { ASSETS: { fetch: async req => { const p = new URL(req.url).pathname; return p in FILES ? new Response(FILES[p], { status: 200 }) : new Response('nope', { status: 404 }); } } };
const SIGNED_IN = async () => ({ email: 'me@example.com' });
const fails = (status, msg = 'Please sign in.') => async () => { throw new AuthError(status, msg); };
const SIGNED_OUT = fails(401), REFUSED = fails(403, 'This account may not use Glyphite.'), NOT_SET_UP = fails(503, 'Sign-in is not set up yet (Cloudflare Access).');
const get = (path, auth, accept = 'text/html') => handle(new Request('https://glyphite.hornbaek.org' + path, { headers: { Accept: accept } }), env, { auth });

test('the front door: the game list when signed in, the landing page otherwise, never cached', async () => {
  let r = await get('/', SIGNED_IN);
  assert.equal(await r.text(), 'game list'); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('Vary'), 'Cookie');
  for (const auth of [SIGNED_OUT, REFUSED, NOT_SET_UP]) {
    r = await get('/', auth);
    assert.equal(r.status, 200); assert.equal(await r.text(), 'landing'); assert.equal(r.headers.get('Cache-Control'), 'no-store');
  }
});

test('the landing page files and the live demo are public', async () => {
  for (const p of ['/welcome/', '/welcome/welcome.css', '/games/showcase/']) assert.equal((await get(p, SIGNED_OUT)).status, 200, p);
  assert.ok(isPublic('/welcome') && isPublic('/games/showcase'));
  for (const p of ['/', '/games/', '/games/spacemouse/', '/games/showcase-x/', '/welcomes/', '/edit/', '/api/ideas', '/src/engine/engine.json', '/games.json'])
    assert.ok(!isPublic(p), p);
});

test('a signed-out browser is sent to sign in and back; files and the API get a 401', async () => {
  let r = await get('/games/spacemouse/?x=1', SIGNED_OUT);
  assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), '/login?next=%2Fgames%2Fspacemouse%2F%3Fx%3D1');
  r = await get('/games.json', SIGNED_OUT, 'application/json');
  assert.equal(r.status, 401); assert.notEqual(await r.text(), '{}');
  r = await get('/api/ideas', SIGNED_OUT, 'application/json');
  assert.equal(r.status, 401); assert.equal(r.headers.get('Content-Type'), 'application/json');
  // a missing page does not reveal that it is missing (or show the 404 game) before sign-in
  assert.equal((await get('/no/such/page', SIGNED_OUT)).status, 302);
});

test('refused accounts and a site without Access are told so, not sent round in circles', async () => {
  assert.equal((await get('/edit/', REFUSED)).status, 403);
  assert.equal((await get('/edit/', NOT_SET_UP)).status, 503);
  assert.equal((await get('/login', SIGNED_OUT)).status, 401);   // Access did not sign them in on the way: no redirect loop
});

test('signed in, everything is served as before', async () => {
  assert.equal(await (await get('/games/spacemouse/', SIGNED_IN)).text(), 'space mouse');
  const r = await get('/no/such/page', SIGNED_IN);
  assert.equal(r.status, 404); assert.equal(await r.text(), '404 game');
});

test('/login sends a signed-in visitor back to a page on this site only', async () => {
  const back = async next => (await get('/login' + (next === undefined ? '' : '?next=' + encodeURIComponent(next)), SIGNED_IN)).headers.get('Location');
  assert.equal(await back(undefined), '/');
  assert.equal(await back('/edit/?game=spacemouse'), '/edit/?game=spacemouse');
  for (const evil of ['//evil.example', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', 'evil', '/x\r\nSet-Cookie: a=b'])
    assert.equal(await back(evil), '/', evil);
  assert.equal(safeNext(null), '/');
});
