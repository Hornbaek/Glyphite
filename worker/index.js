// The Glyphite site Worker: checks the Cloudflare Access login, then serves the static site that
// `npm run build` writes to dist/ (the game list, the games, the editor and its sources).
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

export default {
  async fetch(request, env) {
    let user;
    try { user = await requireUser(request, env); }
    catch (err) {
      if (!(err instanceof AuthError)) { console.error('sign-in check failed', err); return page(500, 'Glyphite', 'Something went wrong.'); }
      const msg = err.status === 503 && /not set up/.test(err.message)
        ? 'This site is not open yet: Cloudflare Access is not set up for it. See docs/DEPLOY.md in the repository.'
        : err.message;
      return page(err.status, 'Glyphite', msg);
    }
    const path = new URL(request.url).pathname;
    if (path === '/api/ideas' || path.startsWith('/api/ideas/')) {
      try {
        const res = await handleIdeas(request, env, user);
        for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
        return res;
      } catch (err) { console.error('ideas api failed', err); return new Response('{"error":"Something went wrong."}', { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY } }); }
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    // pages and data change with every deploy; the vendored editor library does not
    if (!path.startsWith('/vendor/') && !path.endsWith('.png')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  }
};
