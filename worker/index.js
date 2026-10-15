// The Glyphite site Worker: checks the Cloudflare Access login, then serves the static site that
// `npm run build` writes to dist/ (the game list, the games, the editor and its sources).
import { authenticate } from './auth.js';

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
    const auth = await authenticate(request, env);
    if (auth.error) {
      const msg = auth.status === 503
        ? 'This site is not open yet: Cloudflare Access is not configured for it. See docs/DEPLOY.md in the repository.'
        : `You need to sign in through Cloudflare Access to see this site. (${auth.error})`;
      return page(auth.status, 'Glyphite', msg);
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    // pages and data change with every deploy; the vendored editor library does not
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/vendor/') && !path.endsWith('.png')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  }
};
