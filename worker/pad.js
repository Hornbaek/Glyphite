// The phone pad's meeting place (migrations/0004_pad_link.sql): a phone and the SOUND STUDIO exchange the two halves of a
// WebRTC connection here, under a six digit code, and then talk directly over the wifi. Nothing played passes through this API.
//
//   PUT    /api/pad/<code>         body { offer: { id, sdp } }   the studio's offer (a new one replaces the old and clears the answer)
//   GET    /api/pad/<code>         -> { offer, answer }          offer: { id, sdp } (404 if there is none), answer: { id, sdp } or null
//   PUT    /api/pad/<code>/answer  body { answer: { id, sdp } }  the phone's answer; id must be the offer's, or it is refused (409)
//   DELETE /api/pad/<code>         -> { deleted: true }
//
// Reached only after the Access check in worker/index.js, so only a signed in browser can pair; changes need the X-Pixelite
// header (as the songs'). A row older than ten minutes is gone the next time an offer is put.
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const CODE = /^[0-9]{6}$/, OFFER_ID = /^[a-z0-9]{6,40}$/;
export const SDP_MAX = 30_000, LIFE_MS = 10 * 60_000;

const part = v => v && typeof v === 'object' && typeof v.sdp === 'string' && v.sdp.length > 0 && v.sdp.length <= SDP_MAX && OFFER_ID.test(String(v.id)) ? { id: String(v.id), sdp: v.sdp } : null;

export async function handlePad(request, env, _user, now = Date.now()) {
  if (!env.DB) return reply(503, { error: 'The pairing database is not set up (D1 binding DB).' });
  const url = new URL(request.url), db = env.DB;
  const m = /^\/api\/pad\/([^/]+)(\/answer)?$/.exec(url.pathname);
  if (!m) return reply(404, { error: 'No such route.' });
  const code = decodeURIComponent(m[1]), isAnswer = !!m[2];
  if (!CODE.test(code)) return reply(400, { error: 'A code is six digits.' });
  if (request.method !== 'GET' && request.headers.get('X-Pixelite') !== '1') return reply(403, { error: 'Missing X-Pixelite header.' });

  if (request.method === 'GET' && !isAnswer) {
    const { results: [r] } = await db.prepare('SELECT offer, answer, updated_at FROM pad_link WHERE code = ?1').bind(code).all();
    if (!r || now - r.updated_at > LIFE_MS) return reply(404, { error: 'Nothing is waiting under that code.' });
    return reply(200, { offer: JSON.parse(r.offer), answer: r.answer ? JSON.parse(r.answer) : null });
  }
  if (request.method === 'DELETE' && !isAnswer) {
    await db.prepare('DELETE FROM pad_link WHERE code = ?1').bind(code).run();
    return reply(200, { deleted: true });
  }
  if (request.method !== 'PUT') return reply(405, { error: 'Method not allowed.' });
  let body;
  try { body = JSON.parse(await request.text()); } catch { return reply(400, { error: 'Body is not JSON.' }); }
  if (!isAnswer) {
    const offer = part(body && body.offer);
    if (!offer) return reply(400, { error: 'An offer is { id, sdp }.' });
    await db.prepare('DELETE FROM pad_link WHERE updated_at < ?1').bind(now - LIFE_MS).run();
    await db.prepare(`INSERT INTO pad_link (code, offer, answer, updated_at) VALUES (?1, ?2, '', ?3)
      ON CONFLICT(code) DO UPDATE SET offer = ?2, answer = '', updated_at = ?3`).bind(code, JSON.stringify(offer), now).run();
    return reply(200, { code });
  }
  const answer = part(body && body.answer);
  if (!answer) return reply(400, { error: 'An answer is { id, sdp }.' });
  const { results: [r] } = await db.prepare('SELECT offer, updated_at FROM pad_link WHERE code = ?1').bind(code).all();
  if (!r || now - r.updated_at > LIFE_MS) return reply(404, { error: 'Nothing is waiting under that code.' });
  if (JSON.parse(r.offer).id !== answer.id) return reply(409, { error: 'That answer is for an older offer.' });
  await db.prepare('UPDATE pad_link SET answer = ?2 WHERE code = ?1').bind(code, JSON.stringify(answer)).run();
  return reply(200, { code });
}
