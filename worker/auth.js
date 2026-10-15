/*
 * Cloudflare Access check, done the same way as hornbaek-site's admin.
 *
 * Access (Zero Trust → Access → Applications) signs the visitor in before the request reaches the
 * Worker and adds a signed token (a JWT) in the Cf-Access-Jwt-Assertion header, or the
 * CF_Authorization cookie. Check that token here too: its signature against the team's public keys,
 * that it is for this Access application (AUD) and that it has not expired. Anything else is turned
 * away, so the site stays closed even if Access were misconfigured or a request reached the Worker
 * some other way. Variables:
 *   ACCESS_TEAM_DOMAIN  https://<team>.cloudflareaccess.com            (wrangler.jsonc; not secret)
 *   ACCESS_AUD          the Access application's audience (AUD) tag   (wrangler.jsonc; not secret)
 *   ALLOWED_EMAILS      optional, comma-separated: only these accounts  (Worker dashboard variable)
 *   DEV_EMAIL           local development only (.dev.vars); works on localhost alone
 */
export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function teamDomain(value) {
  let team = String(value || '').trim().replace(/\/+$/, '');
  if (team && !/^https?:\/\//.test(team)) team = `https://${team}`;
  return team;
}

function cookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

let keyCache = { team: '', at: 0, keys: [] };
async function accessKeys(team, refresh, fetchKeys) {
  if (!refresh && keyCache.team === team && Date.now() - keyCache.at < 3600e3) return keyCache.keys;
  let keys;
  try {
    if (fetchKeys) keys = await fetchKeys(team);
    else {
      const res = await fetch(`${team}/cdn-cgi/access/certs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ({ keys } = await res.json());
    }
  } catch (err) {
    console.error('fetching Access keys failed', err);
    throw new AuthError(503, 'Could not check the sign-in right now. Try again in a moment.');
  }
  keyCache = { team, at: Date.now(), keys };
  return keys;
}

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function verifyAccessToken(token, team, aud, fetchKeys) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  let jwk = (await accessKeys(team, false, fetchKeys)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await accessKeys(team, true, fetchKeys)).find(k => k.kid === header.kid);   // keys rotate
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let ok = false;
  try { ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), signed); } catch { ok = false; }
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== team || !audiences.includes(aud)) return null;
  if (typeof claims.exp !== 'number' || claims.exp < now - 30) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return null;
  return claims;
}

/** @returns {Promise<{email: string}>} the signed-in user; throws AuthError otherwise */
export async function requireUser(request, env, deps = {}) {
  const url = new URL(request.url);
  if (env.DEV_EMAIL && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return { email: env.DEV_EMAIL };
  const team = teamDomain(env.ACCESS_TEAM_DOMAIN), aud = String(env.ACCESS_AUD || '').trim();
  if (!team || !aud) throw new AuthError(503, 'Sign-in is not set up yet (Cloudflare Access).');
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request, 'CF_Authorization');
  if (!token) throw new AuthError(401, 'Please sign in.');
  const claims = await verifyAccessToken(token, team, aud, deps.fetchKeys);
  if (!claims) throw new AuthError(401, 'Your sign-in is not valid. Please sign in again.');
  const allowed = String(env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(claims.email || '').toLowerCase())) throw new AuthError(403, 'This account may not use Glyphite.');
  return { email: claims.email || '' };
}

// for tests: forget cached keys
export function resetKeyCache() { keyCache = { team: '', at: 0, keys: [] }; }
