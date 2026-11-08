// The SOUND STUDIO's songs, kept in Cloudflare D1 (binding DB, table songs: migrations/0003_songs.sql).
//
//   GET    /api/songs        -> { items: [{ id, title, game, updated_at, updated_by, size }] }   (newest first)
//   GET    /api/songs/<id>   -> { id, title, game, updated_at, updated_by, song }
//   PUT    /api/songs/<id>   -> body { song, game?, base? }; saves it and returns { id, updated_at }. `base` is the updated_at the
//                               studio loaded: if the stored song changed since (another tab or computer), 409 and nothing is saved
//   DELETE /api/songs/<id>   -> { deleted: true }
//
// Reached only after the Access check in worker/index.js; changes need the X-Pixelite header (as the idea bank's). A session
// reads the same table with the D1 connector (CLAUDE.md, "Songs").
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/, GAME = /^([a-z][a-z0-9-]{1,31})?$/;
export const SONG_MAX = 1_500_000;   // characters of JSON; D1 keeps a row up to 2 MB

export async function handleSongs(request, env, user) {
  if (!env.DB) return reply(503, { error: 'The song database is not set up (D1 binding DB).' });
  const url = new URL(request.url), db = env.DB;
  const id = url.pathname === '/api/songs' ? null : decodeURIComponent(url.pathname.slice('/api/songs/'.length));
  if (id !== null && !ID.test(id)) return reply(400, { error: 'Bad song id.' });
  const changes = request.method === 'PUT' || request.method === 'DELETE';
  // a custom header cannot be sent cross-site without a CORS preflight, so another site cannot change the owner's songs
  if (changes && request.headers.get('X-Pixelite') !== '1') return reply(403, { error: 'Missing X-Pixelite header.' });

  if (id === null && request.method === 'GET') {
    const { results } = await db.prepare('SELECT id, title, game, updated_at, updated_by, length(data) AS size FROM songs ORDER BY updated_at DESC').all();
    return reply(200, { items: results });
  }
  if (id === null) return reply(405, { error: 'Method not allowed.' });
  if (request.method === 'GET') {
    const { results: [r] } = await db.prepare('SELECT id, title, game, data, updated_at, updated_by FROM songs WHERE id = ?1').bind(id).all();
    if (!r) return reply(404, { error: 'No such song.' });
    const { data, ...meta } = r;
    return reply(200, { ...meta, song: JSON.parse(data) });
  }
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM songs WHERE id = ?1').bind(id).run();
    return reply(200, { deleted: true });
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > SONG_MAX + 4096) return reply(413, { error: 'That song is too large to save.' });
    let body;
    try { body = JSON.parse(text); } catch { return reply(400, { error: 'Body is not JSON.' }); }
    const { song, game = '', base = null } = body || {};
    if (!song || typeof song !== 'object' || song.format !== 'pixelite-song' || !Array.isArray(song.tracks)) return reply(400, { error: 'That is not a Pixelite song.' });
    if (typeof game !== 'string' || !GAME.test(game)) return reply(400, { error: 'Bad game id.' });
    const title = String(song.title || 'Untitled').slice(0, 80), data = JSON.stringify(song);
    if (data.length > SONG_MAX) return reply(413, { error: 'That song is too large to save.' });
    const { results: [cur] } = await db.prepare('SELECT updated_at, updated_by FROM songs WHERE id = ?1').bind(id).all();
    if (cur && base !== cur.updated_at) return reply(409, { error: 'This song was saved somewhere else since you opened it.', updated_at: cur.updated_at, updated_by: cur.updated_by });
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO songs (id, title, game, data, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET title = ?2, game = ?3, data = ?4, updated_at = ?5, updated_by = ?6`).bind(id, title, game, data, now, user.email || '').run();
    return reply(200, { id, updated_at: now });
  }
  return reply(405, { error: 'Method not allowed.' });
}
