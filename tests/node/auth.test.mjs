// The Worker's Cloudflare Access check, with a locally made key standing in for the team's certs.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, teamDomain, resetKeyCache } from '../../worker/auth.js';

const TEAM = 'https://round-smoke-a734.cloudflareaccess.com', AUD = 'aud-tag-123';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const b64u = buf => Buffer.from(buf).toString('base64url');
async function keyPair(kid) {
  const k = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  return { kid, privateKey: k.privateKey, jwk: { ...(await crypto.subtle.exportKey('jwk', k.publicKey)), kid } };
}
const main = await keyPair('k1'), other = await keyPair('k2');
const now = () => Math.floor(Date.now() / 1000);
async function token(claims = {}, key = main, header = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: key.kid, ...header }));
  const p = b64u(JSON.stringify({ iss: TEAM, aud: [AUD], email: 'me@example.com', iat: now(), exp: now() + 3600, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
let published = [main.jwk];
const deps = { fetchKeys: async () => published };
const req = (jwt, { url = 'https://glyphite.hornbaek.org/', cookie = false } = {}) =>
  new Request(url, { headers: jwt ? (cookie ? { Cookie: `x=1; CF_Authorization=${jwt}` } : { 'Cf-Access-Jwt-Assertion': jwt }) : {} });
const status = async p => { try { await p; return 200; } catch (e) { return e.status; } };
beforeEach(() => { resetKeyCache(); published = [main.jwk]; });

test('a valid token passes, from the header or the cookie', async () => {
  assert.deepEqual(await requireUser(req(await token()), env, deps), { email: 'me@example.com' });
  assert.deepEqual(await requireUser(req(await token(), { cookie: true }), env, deps), { email: 'me@example.com' });
});
test('ALLOWED_EMAILS narrows who gets in, when set', async () => {
  const e = { ...env, ALLOWED_EMAILS: 'Me@Example.com, friend@example.com' };
  assert.equal(await status(requireUser(req(await token()), e, deps)), 200);
  assert.equal(await status(requireUser(req(await token({ email: 'stranger@example.com' })), e, deps)), 403);
});
test('fails closed while Access is not set up', async () => {
  assert.equal(await status(requireUser(req(await token()), { ...env, ACCESS_AUD: '' }, deps)), 503);
  assert.equal(await status(requireUser(req(await token()), { ...env, ACCESS_TEAM_DOMAIN: '' }, deps)), 503);
});
test('rejects missing, forged, foreign, expired and early tokens', async () => {
  assert.equal(await status(requireUser(req(null), env, deps)), 401);
  assert.equal(await status(requireUser(req('not.a.jwt'), env, deps)), 401);
  assert.equal(await status(requireUser(req(await token({}, other)), env, deps)), 401);                          // unknown key
  assert.equal(await status(requireUser(req(await token({}, { ...other, kid: 'k1' })), env, deps)), 401);       // right kid, wrong signature
  assert.equal(await status(requireUser(req(await token({ aud: ['another-app'] })), env, deps)), 401);
  assert.equal(await status(requireUser(req(await token({ iss: 'https://evil.cloudflareaccess.com' })), env, deps)), 401);
  assert.equal(await status(requireUser(req(await token({ exp: now() - 120 })), env, deps)), 401);
  assert.equal(await status(requireUser(req(await token({ nbf: now() + 600 })), env, deps)), 401);
  assert.equal(await status(requireUser(req(await token({}, main, { alg: 'none' })), env, deps)), 401);
});
test('rotated keys are fetched again', async () => {
  assert.equal(await status(requireUser(req(await token()), env, deps)), 200);   // caches k1
  published = [main.jwk, other.jwk];                                              // k2 appears later
  assert.equal(await status(requireUser(req(await token({}, other)), env, deps)), 200);
});
test('DEV_EMAIL only works on localhost', async () => {
  assert.deepEqual(await requireUser(req(null, { url: 'http://localhost:8787/' }), { DEV_EMAIL: 'dev@local' }), { email: 'dev@local' });
  assert.equal(await status(requireUser(req(null), { ...env, DEV_EMAIL: 'dev@local' }, deps)), 401);
});
test('team domain is normalised', () => {
  assert.equal(teamDomain('round-smoke-a734.cloudflareaccess.com/'), TEAM);
  assert.equal(teamDomain(TEAM), TEAM);
});
