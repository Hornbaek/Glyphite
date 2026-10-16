// The Glyphite site Worker: checks the Cloudflare Access login, then serves the static site that
// `npm run build` writes to dist/ (the game list, the games, the editor and its sources).
//
// Who sees what. Cloudflare Access (Zero Trust) only needs to cover /login; this Worker checks the Access token on every
// request itself (worker/auth.js) and decides:
//   /                  signed in: the game list. Not signed in: the public landing page (portal/welcome/).
//   /welcome/...       the landing page's own files, and /games/showcase/ (the live engine demo on it): public.
//   /login             Access signs the visitor in on the way here; then back to ?next= (a path on this site) or /.
//   everything else    signed in only. A browser without a sign-in is sent to /login?next=<where it was going>;
//                      files and the API get a plain 401.
// While Access still covers the whole site, everything works the same, the landing just can't be reached signed out.
import { requireUser, AuthError } from './auth.js';
import { handleIdeas } from './ideas.js';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Robots-Tag': 'noindex, nofollow'
};

function page(status, title, text) {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05070c;color:#cdd6e2;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace">
<main style="max-width:36rem;padding:24px"><p style="color:#ffb340;font-weight:700">GLYPHITE · ${status}</p><p>${text}</p></main></body>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
}
const secure = res => { const out = new Response(res.body, res); for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v); return out; };

/** the paths anyone may see, signed in or not */
export const isPublic = path => path === '/welcome' || path.startsWith('/welcome/') || path === '/games/showcase' || path.startsWith('/games/showcase/');

/** where /login sends a signed-in visitor: a path on this site, never another site (//host, /\host, a full URL) */
export function safeNext(next) {
  const p = String(next || '');
  return p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') && !/[\r\n]/.test(p) ? p : '/';
}

const wantsPage = request => request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');

export async function handle(request, env, { auth = requireUser } = {}) {
  const url = new URL(request.url), path = url.pathname;
  let user = null, denied = null;
  try { user = await auth(request, env); }
  catch (err) {
    if (!(err instanceof AuthError)) { console.error('sign-in check failed', err); return page(500, 'Glyphite', 'Something went wrong.'); }
    denied = err;
  }

  // the front door: the game list for the signed in, the landing page for everyone else (same address, so never cached)
  if (path === '/') {
    const res = await env.ASSETS.fetch(user ? request : new Request(new URL('/welcome/', url), request));
    const out = secure(new Response(res.body, { status: res.status, headers: res.headers }));
    out.headers.set('Cache-Control', 'no-store'); out.headers.set('Vary', 'Cookie');
    return out;
  }
  if (isPublic(path)) {
    const out = secure(await env.ASSETS.fetch(request));
    if (!path.endsWith('.png')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  }
  if (path === '/login') {
    if (user) return new Response(null, { status: 302, headers: { Location: safeNext(url.searchParams.get('next')), 'Cache-Control': 'no-store', ...SECURITY } });
    // Access should have signed the visitor in before this point: if it did not, say so rather than loop
    return page(denied.status, 'Glyphite', denied.status === 401
      ? 'The sign-in did not come through. Cloudflare Access must cover /login (docs/DEPLOY.md).'
      : denied.message);
  }

  if (!user) {
    // signed out: a browser goes to sign in and comes back; files and the API just get a 401 (a 403 or "not set up" is said)
    if (denied.status === 401 && wantsPage(request)) {
      return new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(path + url.search)}`, 'Cache-Control': 'no-store', ...SECURITY } });
    }
    if (path.startsWith('/api/')) return new Response(JSON.stringify({ error: denied.message }), { status: denied.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY } });
    const msg = denied.status === 503 && /not set up/.test(denied.message)
      ? 'This site is not open yet: Cloudflare Access is not set up for it. See docs/DEPLOY.md in the repository.'
      : denied.message;
    return page(denied.status, 'Glyphite', msg);
  }

  if (path === '/api/ideas' || path.startsWith('/api/ideas/')) {
    try { return secure(await handleIdeas(request, env, user)); }
    catch (err) { console.error('ideas api failed', err); return new Response('{"error":"Something went wrong."}', { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY } }); }
  }
  const res = await env.ASSETS.fetch(request);
  // a page that is not there: a browser gets the 404 game (still status 404, never cached); files and the API get a plain 404
  if (res.status === 404 && wantsPage(request) && !path.startsWith('/api/')) {
    const game = await env.ASSETS.fetch(new Request(new URL('/games/notfound/', url), { headers: request.headers }));
    if (game.ok) {
      const out = secure(new Response(game.body, { status: 404, headers: game.headers }));
      out.headers.set('Cache-Control', 'no-store');
      return out;
    }
  }
  const out = secure(res);
  // pages and data change with every deploy; the vendored editor library does not
  if (!path.startsWith('/vendor/') && !path.endsWith('.png')) out.headers.set('Cache-Control', 'no-cache');
  return out;
}

export default { fetch: (request, env) => handle(request, env) };
