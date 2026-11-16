// PixelLab (pixellab.ai): pixel-art models with skeleton animation, used by the animation bake-off (tools/art/bakeoff.mjs).
// API v2 (https://api.pixellab.ai/v2/docs; checked November 2026): images go as { type: 'base64', base64, format: 'png' };
// skeletons are 18 humanoid joints, x/y as fractions 0-1 of the image; slow jobs answer with a background job id that is polled.
// Costs are in "generations" (an 8-frame skeleton animation is 3, a skeleton estimate 0.1); the balance is free to read.
// The key is read from PIXELLAB_API_TOKEN; in a cloud session the network proxy supplies it, so a placeholder goes out.
export const name = 'pixellab';
const BASE = 'https://api.pixellab.ai/v2';
const hdr = () => ({ Authorization: `Bearer ${process.env.PIXELLAB_API_TOKEN || 'proxy-supplied'}`, 'Content-Type': 'application/json' });

export const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT HIP', 'RIGHT KNEE',
  'RIGHT LEG', 'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
export const b64 = png => ({ type: 'base64', base64: Buffer.from(png).toString('base64'), format: 'png' });

async function json(r, what) {
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  if (!r.ok) throw new Error(`PixelLab ${what} ${r.status}: ${(j && (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail))) || t.slice(0, 300)}`);
  return j;
}
const post = (path, body, fetchFn) => fetchFn(`${BASE}${path}`, { method: 'POST', headers: hdr(), body: JSON.stringify(body) }).then(r => json(r, path));

export async function balance({ fetchFn = fetch } = {}) { return json(await fetchFn(`${BASE}/balance`, { headers: hdr() }), 'balance'); }

// the 18 joints PixelLab sees in a sprite (fractions of the image): [{ x, y, label, z_index }]
export async function estimateSkeleton(png, { fetchFn = fetch } = {}) { return (await post('/estimate-skeleton', { image: b64(png) }, fetchFn)).keypoints; }

// a background job to its end → the job's last response
export async function waitJob(id, { fetchFn = fetch, pollMs = 6000, maxWaitMs = 900000, log = () => {} } = {}) {
  const t0 = Date.now();
  for (;;) {
    const j = await json(await fetchFn(`${BASE}/background-jobs/${id}`, { headers: hdr() }), 'job');
    if (j.status === 'completed') return j.last_response || j;
    if (j.status === 'failed') throw new Error(`PixelLab job ${id} failed: ${JSON.stringify(j.last_response || j.error || j).slice(0, 300)}`);
    if (Date.now() - t0 > maxWaitMs) throw new Error(`PixelLab job ${id} was still ${j.status} after ${maxWaitMs / 1000} s`);
    log(`job ${id}: ${j.status}`); await new Promise(s => setTimeout(s, pollMs));
  }
}

// Animate a sprite by skeletons (POST /animate-with-skeleton-v3): `first` is the sprite (PNG, up to 256 x 256) in the pose `firstKeypoints`;
// one skeleton per wanted frame in `keypoints` (3 to 15). → { frames: [png Buffer], usage, jobId }
export async function animateWithSkeleton({ first, firstKeypoints, keypoints, description, action = 'walk', direction = 'east', view = 'side', seed = 0, fetchFn = fetch, log = () => {}, pollMs }) {
  const job = await post('/animate-with-skeleton-v3', { description, action, direction, view, first_frame: b64(first), first_frame_keypoints: firstKeypoints, keypoints, seed, no_background: true }, fetchFn);
  const res = await waitJob(job.background_job_id, { fetchFn, log, pollMs });
  return { frames: (res.images || []).map(im => Buffer.from(im.base64, 'base64')), usage: res.usage || job.usage || null, jobId: job.background_job_id };
}

export async function checkKey({ fetchFn = fetch } = {}) {
  try { const b = await balance({ fetchFn }); return { ok: true, detail: `key accepted: ${JSON.stringify(b.subscription || b.credits || b)}` }; }
  catch (e) { return { ok: false, detail: e.message }; }
}
