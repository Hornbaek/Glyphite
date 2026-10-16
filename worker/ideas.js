// The idea bank's API: which ideas are starred, their status, a note, and whether the owner asks a Claude session to explain
// the idea (ask), kept in Cloudflare D1 (binding DB).
// The ideas themselves are docs/ideas.json, served as /ideas/ideas.json; this only stores what we decided.
//
//   GET /api/ideas        -> { items: { <id>: { starred, status, note, ask, updated_at, updated_by } } }
//   PUT /api/ideas/<id>   -> body { starred?: boolean, status?: string, note?: string, ask?: boolean }; returns the idea's state
//
// Reached only after the Access check in worker/index.js. A session can read and change the same table
// through the Cloudflare D1 connector (see "The idea bank" in CLAUDE.md).
import { STATUS_IDS, NOTE_MAX } from '../portal/assets/ideas-status.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const COLUMNS = 'id, starred, status, note, ask, updated_at, updated_by';
const shape = r => ({ starred: !!r.starred, status: r.status, note: r.note, ask: !!r.ask, updated_at: r.updated_at, updated_by: r.updated_by });

// The valid ids come from the deployed ideas.json, so a typo cannot create a row for an idea that is not there.
let known = null;
async function knownIds(request, env) {
  if (known) return known;
  const res = await env.ASSETS.fetch(new URL('/ideas/ideas.json', request.url));
  if (!res.ok) throw new Error(`ideas.json: ${res.status}`);
  const data = await res.json();
  known = new Set(data.categories.flatMap(c => c.ideas.map(i => i.id)));
  return known;
}
export function resetKnownIdeas() { known = null; }

export async function handleIdeas(request, env, user) {
  if (!env.DB) return reply(503, { error: 'The idea database is not set up (D1 binding DB).' });
  const url = new URL(request.url);
  const id = url.pathname === '/api/ideas' ? null : decodeURIComponent(url.pathname.slice('/api/ideas/'.length));

  if (id === null && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM idea_state`).all();
    return reply(200, { items: Object.fromEntries(results.map(r => [r.id, shape(r)])) });
  }
  if (id !== null && request.method === 'PUT') {
    // a custom header cannot be sent cross-site without a CORS preflight (this API sends no CORS headers),
    // so a page on another origin cannot change the Access-signed-in user's ideas
    if (request.headers.get('X-Glyphite') !== '1') return reply(403, { error: 'Missing X-Glyphite header.' });
    if (!ID.test(id)) return reply(400, { error: 'Bad idea id.' });
    const text = await request.text();
    if (text.length > 4096) return reply(413, { error: 'Request too large.' });
    let body;
    try { body = JSON.parse(text); } catch { return reply(400, { error: 'Body is not JSON.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Body must be an object.' });
    const { starred, status, note, ask } = body;
    if (starred === undefined && status === undefined && note === undefined && ask === undefined) return reply(400, { error: 'Nothing to change.' });
    if (starred !== undefined && typeof starred !== 'boolean') return reply(400, { error: 'starred must be true or false.' });
    if (ask !== undefined && typeof ask !== 'boolean') return reply(400, { error: 'ask must be true or false.' });
    if (status !== undefined && !STATUS_IDS.includes(status)) return reply(400, { error: `status must be one of: ${STATUS_IDS.join(', ')}.` });
    if (note !== undefined && (typeof note !== 'string' || note.length > NOTE_MAX)) return reply(400, { error: `note must be text of at most ${NOTE_MAX} characters.` });
    if (!(await knownIds(request, env)).has(id)) return reply(404, { error: 'No such idea.' });

    const db = env.DB, by = user.email || '';
    const [, , row] = await db.batch([
      // partial update in one statement: a field that was not sent keeps its stored value
      db.prepare(`INSERT INTO idea_state (${COLUMNS}) VALUES (?1, COALESCE(?2, 0), COALESCE(?3, 'idea'), COALESCE(?4, ''), COALESCE(?7, 0), ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET starred = COALESCE(?2, starred), status = COALESCE(?3, status), note = COALESCE(?4, note),
          ask = COALESCE(?7, ask), updated_at = ?5, updated_by = ?6`)
        .bind(id, starred === undefined ? null : +starred, status ?? null, note === undefined ? null : note.trim(), new Date().toISOString(), by,
          ask === undefined ? null : +ask),
      // an idea back at its defaults needs no row
      db.prepare(`DELETE FROM idea_state WHERE id = ?1 AND starred = 0 AND status = 'idea' AND note = '' AND ask = 0`).bind(id),
      db.prepare(`SELECT ${COLUMNS} FROM idea_state WHERE id = ?1`).bind(id)
    ]);
    const stored = row.results[0];
    return reply(200, stored ? shape(stored) : { starred: false, status: 'idea', note: '', ask: false, updated_at: null, updated_by: '' });
  }
  return reply(405, { error: 'Method not allowed.' });
}
