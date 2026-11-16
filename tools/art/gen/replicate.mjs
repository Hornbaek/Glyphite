// Replicate (replicate.com): one HTTP API in front of many models, used by the animation bake-off (tools/art/bakeoff.mjs) for the
// models that only live there: Retro Diffusion's pixel animation, ToonCrafter's in-betweening and the image-to-video models. A model's
// inputs differ from model to model, so this only runs a prediction and hands back its output; the bake-off knows what to send.
// Official models are run by name (/v1/models/<owner>/<name>/predictions); community models by their latest version (/v1/predictions).
// The key is read from REPLICATE_API_TOKEN; in a cloud session the network proxy supplies it, so a placeholder goes out. Outputs are
// downloaded from replicate.delivery, which takes no key.
export const name = 'replicate';
const BASE = 'https://api.replicate.com/v1';
const hdr = () => ({ Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN || 'proxy-supplied'}`, 'Content-Type': 'application/json' });
const DONE = new Set(['succeeded', 'failed', 'canceled']);

// a picture as Replicate takes it inline: a data URI (fine for the small pictures here; big files would go through /v1/files)
export const dataURI = (png, type = 'image/png') => `data:${type};base64,${Buffer.from(png).toString('base64')}`;

async function json(r, what) {
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  if (!r.ok) throw new Error(`Replicate ${what} ${r.status}: ${(j && (j.detail || j.title)) || t.slice(0, 300)}`);
  return j;
}

// the model's latest version (community models are run by version) and whether it is an official model (run by name)
export async function modelInfo(model, { fetchFn = fetch } = {}) {
  const j = await json(await fetchFn(`${BASE}/models/${model}`, { headers: hdr() }), `model ${model}`);
  return { version: j.latest_version && j.latest_version.id, official: !!j.is_official };
}

// Run one prediction to the end: → { output, id, metrics, model, version }. `maxWaitMs` bounds a slow video model.
export async function run(model, input, { fetchFn = fetch, pollMs = 3000, maxWaitMs = 600000, retryMs = null, log = () => {} } = {}) {
  const info = await modelInfo(model, { fetchFn });
  const url = info.version && !info.official ? `${BASE}/predictions` : `${BASE}/models/${model}/predictions`;
  const body = info.version && !info.official ? { version: info.version, input } : { input };
  // a new account (or one with little credit) may start one prediction at a time: a 429 says when to ask again, so wait that long (a few times)
  let r;
  for (let t = 0; ; t++) {
    r = await fetchFn(url, { method: 'POST', headers: { ...hdr(), Prefer: 'wait=60' }, body: JSON.stringify(body) });
    if (r.status !== 429 || t >= 4) break;
    const m = /resets in ~?(\d+)s/.exec(await r.clone().text()), wait = ((m ? +m[1] : 10) + 1) * 1000 * (t + 1);
    log(`${model}: throttled, asking again in ${wait / 1000} s`); await new Promise(res => setTimeout(res, retryMs ?? wait));
  }
  let p = await json(r, `run ${model}`);
  const t0 = Date.now();
  while (!DONE.has(p.status)) {
    if (Date.now() - t0 > maxWaitMs) throw new Error(`Replicate ${model} prediction ${p.id} was still ${p.status} after ${maxWaitMs / 1000} s (it keeps running on Replicate: cancel it there if it is not wanted)`);
    log(`${model}: ${p.status}`);
    await new Promise(s => setTimeout(s, pollMs));
    p = await json(await fetchFn(p.urls.get, { headers: hdr() }), `poll ${model}`);
  }
  if (p.status !== 'succeeded') throw new Error(`Replicate ${model} ${p.status}: ${String(p.error || '').slice(0, 300)}`);
  return { output: p.output, id: p.id, metrics: p.metrics || null, model, version: p.version || info.version || null };
}

// the files a prediction made (a URL, or a list of them) → [Buffer]
export async function download(output, { fetchFn = fetch } = {}) {
  const urls = Array.isArray(output) ? output : [output];
  return Promise.all(urls.map(async u => { const r = await fetchFn(u); if (!r.ok) throw new Error(`Replicate download ${r.status}: ${u}`); return Buffer.from(await r.arrayBuffer()); }));
}

export async function checkKey({ fetchFn = fetch } = {}) {
  const r = await fetchFn(`${BASE}/account`, { headers: hdr() });
  if (!r.ok) return { ok: false, detail: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true, detail: `key accepted (account ${(await r.json()).username})` };
}
