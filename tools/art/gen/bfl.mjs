// Black Forest Labs FLUX 3 Image behind the adapter interface of tools/art/gen/index.mjs. It has no transparent background, so
// the prompt asks for a flat #FF00FF one and `keyed` tells the loop to remove it. The job runs in a region: the answer's
// polling_url (api.<region>.bfl.ai) is polled with the key, and the finished picture is downloaded from a signed URL that takes no
// key. The key is read from BFL_API_KEY; in a cloud session the proxy supplies it (and those hosts must be allowed).
export const name = 'flux';
export const defaultModel = 'flux-3-image';

const BASE = 'https://api.bfl.ai/v1';
const hdr = () => ({ 'x-key': process.env.BFL_API_KEY || 'proxy-supplied', 'Content-Type': 'application/json' });
const BUSY = new Set(['Pending', 'Reasoning', 'Generating', 'Request Moderated-pending']);

export async function generate({ prompt, refs = [], size = 1024, model = defaultModel, fetchFn = fetch, pollMs = 1500, maxWaitMs = 180000 }) {
  const body = { prompt, width: size, height: size };
  if (refs.length) body.images = refs.map(r => r.png.toString('base64'));
  const r = await fetchFn(`${BASE}/${model}`, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`FLUX ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const job = await r.json();
  if (!job.polling_url) throw new Error('FLUX sent no polling_url');
  const t0 = Date.now(); let res;
  for (;;) {
    await new Promise(s => setTimeout(s, pollMs));
    const p = await fetchFn(job.polling_url, { headers: hdr() });
    if (!p.ok) throw new Error(`FLUX polling ${p.status}: ${(await p.text()).slice(0, 300)}`);
    res = await p.json();
    if (!BUSY.has(res.status)) break;
    if (Date.now() - t0 > maxWaitMs) throw new Error(`FLUX job ${job.id} was still ${res.status} after ${maxWaitMs / 1000} s`);
  }
  if (res.status !== 'Ready') throw new Error(`FLUX ended as ${res.status}: ${JSON.stringify(res.details || res.result || '').slice(0, 300)}`);
  const img = await fetchFn(res.result.sample);     // a signed URL: no key goes with it
  if (!img.ok) throw new Error(`FLUX download ${img.status}`);
  return { png: Buffer.from(await img.arrayBuffer()), model, params: { width: size, height: size, cost: job.cost ?? null }, keyed: '#ff00ff', requestId: job.id };
}

export async function checkKey({ fetchFn = fetch } = {}) {
  const r = await fetchFn(`${BASE}/credits`, { headers: hdr() });
  if (!r.ok) return { ok: false, detail: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = await r.json();
  return { ok: true, detail: `key accepted, ${j.credits} credits left (1 credit = $0.01)` };
}
