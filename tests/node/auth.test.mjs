// The Worker's Cloudflare Access check, with locally made keys standing in for the team's certs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticate, teamDomain } from '../../worker/auth.js';

const TEAM = 'https://hornbaek.cloudflareaccess.com', AUD = 'aud-tag-123';
const env = { TEAM_DOMAIN: TEAM, POLICY_AUD: AUD, ALLOWED_EMAIL: 'me@example.com, friend@example.com' };
const { publicKey, privateKey } = await generateKeyPair('RS256');
const keys = async () => publicKey;
const token = (claims = {}, opts = {}) => new SignJWT({ email: 'me@example.com', ...claims }).setProtectedHeader({ alg: 'RS256' })
  .setIssuer(opts.iss ?? TEAM).setAudience(opts.aud ?? AUD).setIssuedAt().setExpirationTime(opts.exp ?? '1h').sign(opts.key ?? privateKey);
const req = (jwt, url = 'https://glyphite.hornbaek.org/') => new Request(url, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });

test('a valid token for an allowed user passes', async () => {
  assert.deepEqual(await authenticate(req(await token()), env, { keys }), { user: { email: 'me@example.com' } });
  assert.equal((await authenticate(req(await token({ email: 'Friend@Example.com' })), env, { keys })).user.email, 'friend@example.com');
});
test('fails closed when Access is not configured', async () => {
  for (const missing of ['TEAM_DOMAIN', 'POLICY_AUD', 'ALLOWED_EMAIL']) {
    const r = await authenticate(req(await token()), { ...env, [missing]: '' }, { keys });
    assert.equal(r.status, 503, missing);
  }
});
test('rejects a missing, foreign, expired or wrongly addressed token', async () => {
  assert.equal((await authenticate(req(null), env, { keys })).status, 401);
  assert.equal((await authenticate(req(await token({ email: 'stranger@example.com' })), env, { keys })).status, 403);
  assert.equal((await authenticate(req(await token({}, { aud: 'other-app' })), env, { keys })).status, 401);
  assert.equal((await authenticate(req(await token({}, { iss: 'https://evil.cloudflareaccess.com' })), env, { keys })).status, 401);
  assert.equal((await authenticate(req(await token({}, { exp: Math.floor(Date.now() / 1000) - 60 })), env, { keys })).status, 401);
  const other = await generateKeyPair('RS256');
  assert.equal((await authenticate(req(await token({}, { key: other.privateKey })), env, { keys })).status, 401);
  assert.equal((await authenticate(req('not.a.jwt'), env, { keys })).status, 401);
});
test('DEV_USER only works on localhost', async () => {
  assert.deepEqual(await authenticate(req(null, 'http://localhost:8787/'), { DEV_USER: 'dev@local' }), { user: { email: 'dev@local' } });
  assert.equal((await authenticate(req(null), { ...env, DEV_USER: 'dev@local' }, { keys })).status, 401);
});
test('team domain is normalised', () => {
  assert.equal(teamDomain('hornbaek.cloudflareaccess.com/'), TEAM);
  assert.equal(teamDomain(TEAM), TEAM);
});
