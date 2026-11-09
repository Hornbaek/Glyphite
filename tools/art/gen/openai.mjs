// OpenAI image generation behind the adapter interface of tools/art/gen/index.mjs:
//   generate({ prompt, refs: [{ png, name }], size, transparent, model, quality }) → { png, model, params, requestId, keyed }
// With reference pictures it is the images edit endpoint (several references, transparent background); without, generations.
// The key is read from OPENAI_API_KEY; in a cloud session the network proxy supplies it, so a placeholder goes out.
export const name = 'openai';
// the newest image model the owner's account lists that accepts a transparent background (checked November 2026); a model's name
// changes now and then, so every call records the one it used in meta.json and --model / style.json "gen" override it
export const defaultModel = 'gpt-image-2.6-sunburst';

const BASE = 'https://api.openai.com/v1';
const headers = (key = process.env.OPENAI_API_KEY) => ({ Authorization: `Bearer ${key || 'proxy-supplied'}` });

export class NoAlpha extends Error { constructor(m) { super(m); this.code = 'NO_ALPHA'; } }

async function readError(r) {
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  const e = j && j.error; return { status: r.status, message: e ? e.message : t.slice(0, 300), param: e && e.param, code: e && e.code };
}

export async function generate({ prompt, refs = [], size = 1024, transparent = true, model = defaultModel, quality = 'medium', fetchFn = fetch, retryMs = 3000 }) {
  const params = { size: `${size}x${size}`, quality, background: transparent ? 'transparent' : 'opaque', output_format: 'png' };
  // a 5xx (the gateway timed out, the upstream failed: the slow sunburst calls at medium and high do it about half the time) comes back before any
  // picture is made, so ask again, up to three times in all
  const post = async (url, init) => { let r = await fetchFn(url, init); for (let i = 1; i < 3 && r.status >= 500 && r.status < 600; i++) { await new Promise(s => setTimeout(s, retryMs * i)); r = await fetchFn(url, init); } return r; };
  let r;
  if (refs.length) {
    const fd = new FormData();
    fd.append('model', model); fd.append('prompt', prompt);
    for (const [k, v] of Object.entries(params)) fd.append(k, v);
    for (const ref of refs) fd.append('image[]', new Blob([ref.png], { type: 'image/png' }), ref.name || 'ref.png');
    r = await post(`${BASE}/images/edits`, { method: 'POST', headers: headers(), body: fd });
  } else {
    r = await post(`${BASE}/images/generations`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, ...params }) });
  }
  if (!r.ok) {
    const e = await readError(r);
    if (e.param === 'background') throw new NoAlpha(`${model} cannot make a transparent background (${e.message})`);
    throw new Error(`OpenAI ${e.status}: ${e.message}`);
  }
  const j = await r.json();
  if (!j.data || !j.data[0] || !j.data[0].b64_json) throw new Error('OpenAI sent no image');
  return { png: Buffer.from(j.data[0].b64_json, 'base64'), model, params, keyed: null, requestId: r.headers.get('x-request-id') || null, usage: j.usage || null };
}

// one free call: does the key work, and is the model there?
export async function checkKey({ model = defaultModel, fetchFn = fetch } = {}) {
  const r = await fetchFn(`${BASE}/models/${model}`, { headers: headers() });
  if (r.ok) return { ok: true, detail: `key accepted, model ${model} is listed` };
  const e = await readError(r);
  return { ok: false, detail: e.status === 404 ? `the key works but model ${model} is not listed (pick another with --model; node tools/art.mjs models openai lists them)` : `${e.status}: ${e.message}` };
}

export async function listModels({ fetchFn = fetch } = {}) {
  const r = await fetchFn(`${BASE}/models`, { headers: headers() });
  if (!r.ok) throw new Error(`OpenAI ${(await readError(r)).message}`);
  return (await r.json()).data.map(m => m.id).filter(id => /image|dall/.test(id)).sort();
}
