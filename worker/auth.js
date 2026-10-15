// Cloudflare Access check. Access (Zero Trust) sits in front of glyphite.hornbaek.org and asks for a
// login; every request it lets through carries a signed JWT in Cf-Access-Jwt-Assertion. This Worker
// verifies that token too, so the site stays closed even if a request reaches the Worker another way.
// Same variables as the other hornbaek.org Workers:
//   TEAM_DOMAIN    https://<team>.cloudflareaccess.com (the Zero Trust team domain)
//   POLICY_AUD     the Access application's AUD tag
//   ALLOWED_EMAIL  who may use the site (comma-separated for more than one person)
//   DEV_USER       local development only (wrangler dev on localhost): skip the check as this user
import { jwtVerify, createRemoteJWKSet } from 'jose';

const remoteSets = new Map();
function remoteKeys(team) {
  if (!remoteSets.has(team)) remoteSets.set(team, createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`)));
  return remoteSets.get(team);
}
export function teamDomain(value) {
  let team = String(value || '').trim().replace(/\/+$/, '');
  if (team && !/^https?:\/\//.test(team)) team = `https://${team}`;
  return team;
}
const isLocal = url => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

/** @returns {Promise<{user: {email: string}} | {error: string, status: number}>} */
export async function authenticate(request, env, deps = {}) {
  if (env.DEV_USER && isLocal(request.url)) return { user: { email: env.DEV_USER } };
  const team = teamDomain(env.TEAM_DOMAIN), aud = String(env.POLICY_AUD || '').trim();
  const allowed = String(env.ALLOWED_EMAIL || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!team || !aud || !allowed.length) return { error: 'Access is not configured on this Worker', status: 503 };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { error: 'Missing Access token', status: 401 };
  try {
    const { payload } = await jwtVerify(token, deps.keys || remoteKeys(team), { issuer: team, audience: aud });
    const email = String(payload.email || '').toLowerCase();
    if (!email || !allowed.includes(email)) return { error: 'This account is not allowed', status: 403 };
    return { user: { email } };
  } catch (err) {
    return { error: `Invalid Access token (${err?.code || err?.message || 'unverifiable'})`, status: 401 };
  }
}
