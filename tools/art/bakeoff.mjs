// The animation bake-off (docs/ANIMATION.md): one animation of the pose rig (games/<game>/art/anims/<anim>.json) drawn by
// several METHODS from the same inputs (the character's approved base version and the rig's pose guides), every result snapped
// to the game's size and palette, measured with tools/art/animcheck.mjs and laid out side by side, so a person can pick the way
// the studio should draw animations. Nothing here touches the game: the outputs go to games/<game>/art/bakeoff/<anim>/.
//
//   node tools/art/bakeoff.mjs <game> <anim> [--methods openai-frame,openai-strip,flux-frame] [--quality low] [--max-calls 20] [--dry]
//   node tools/art/bakeoff.mjs <game> <anim> --compare        rebuild the comparison sheet and report from what is there (free)
//   ... --methods wan-loop --reuse                             cut a Replicate method's saved output (raw/) again, without a call
//
// Methods (each a function below; more come with their keys, see docs/ANIMATION.md):
//   openai-frame  one edit call per frame: the base picture + that frame's pose guide (drawn in the base's own framing), snapped
//                 on the base's lattice (the way tools/art.mjs make --guide makes a frame)
//   openai-strip  one call for the whole cycle: the base picture + a sheet of all the guides; cut into cells, snapped at one pixel
//                 size and registered (feet on the base's ground row, head over the base's head)
//   flux-frame    as openai-frame, through FLUX (magenta ground, keyed out)
//   rd-animation  Retro Diffusion's pixel animation model (Replicate): the base sprite as its reference, its right-facing walk (4 frames, on
//                 the key frames); it follows no guide, so this is the "pixel model, no rig" baseline
//   toon-inbetween  OpenAI draws only the key frames (from openai-frame); ToonCrafter (Replicate), a model made for cartoon in-betweens,
//                 draws the motion between them as a looping clip; frames are picked from it, snapped at the base's pixel size and registered
//   pixellab-skeleton  PixelLab's skeleton animation, a pixel-art model that redraws the base sprite in each pose: the rig's poses as its
//                 18 joints (the animation's "pixellab" map), the sprite at game size in and the frames at game size out
//   wan-loop      an image-to-video model (Wan 2.7 on Replicate) animates the base picture, which is both the first and the last frame of
//                 the clip, so it loops; 8 frames are picked from one pass, keyed, snapped at one pixel size and registered
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, artDir, readJSON, writeJSON, loadAssets, loadStyle, loadPalette } from './lib.mjs';
import { blank, toPNG, fromPNG, crop, bbox, binarize, removeKey, upscale } from './image.mjs';
import * as replicate from './gen/replicate.mjs';
import * as pixellab from './gen/pixellab.mjs';
import { rgbOf, nearest } from './palette.mjs';
import { buildPrompt, refPicture, snapToTarget } from './make.mjs';
import { adapter, needsProxyRestart, keyHint } from './gen/index.mjs';
import { checkAnimation, frameStats } from './animcheck.mjs';
import { snap as realSnap } from '../snap.mjs';
import * as R from '../../portal/assets/rig-core.mjs';

export const METHODS = ['openai-frame', 'openai-strip', 'flux-frame', 'rd-animation', 'toon-inbetween', 'wan-loop', 'pixellab-skeleton'];
const GREEN = [0, 255, 0];   // the ground for the video models: nothing of Pip is green, and a video's compression smears a key colour less than magenta into pink
const STRIP = { cols: 4, cw: 384, ch: 512, size: '1536x1024' };

// everything a method needs, read once: the rig and its poses, the base version, the style, palette and target
export function load(game, anim, root = ROOT) {
  const dir = artDir(game, root), A = readJSON(join(dir, 'anims', `${anim}.json`));
  const errs = R.validateRig(A.rig); if (errs.length) throw new Error(`${anim}: ${errs.join('; ')}`);
  const a = loadAssets(game, root).find(x => x.id === A.asset); if (!a) throw new Error(`${anim} draws asset ${A.asset}, which is not there`);
  const v = a.versions.find(x => x.n === A.base); if (!v) throw new Error(`${A.asset} has no version ${A.base}`);
  const lattice = v.meta.snap && v.meta.snap.lattice; if (!lattice) throw new Error(`${A.asset}/${A.base} has no lattice (node tools/art.mjs resnap ${game} ${A.asset} ${A.base})`);
  const anm = R.expandKeys(A.rig, A.anim), poses = R.framePoses(A.rig, anm);
  return { game, anim, root, dir, A, rig: A.rig, animation: anm, poses, asset: a.asset, base: v, lattice, style: loadStyle(game, root), palette: loadPalette(game, root),
    out: join(dir, 'bakeoff', anim), raw: join(v.dir, 'raw.png'), brief: A.brief || v.meta.brief, sprite: fromPNG(readFileSync(join(v.dir, 'sprite.png'))) };
}

// The words for each frame: a key says its own action; a mirrored key the same with near and far swapped; an in-between is the
// way from one key to the next.
const swapSides = s => s.replace(/\b(near|far)\b/g, m => (m === 'near' ? 'far' : 'near'));
export function frameActions(animation) {
  const keys = [...animation.keys].sort((a, b) => a.frame - b.frame), byLabel = Object.fromEntries(keys.map(k => [k.label, k]));
  const say = k => (k.mirrorOf && byLabel[k.mirrorOf] && byLabel[k.mirrorOf].action ? swapSides(byLabel[k.mirrorOf].action) : k.action) || k.label || 'the pose of the guide';
  return Array.from({ length: animation.frames }, (_, f) => {
    const k = keys.find(x => x.frame === f); if (k) return { key: true, label: k.label, text: say(k) };
    const prev = [...keys].reverse().find(x => x.frame < f) || keys[keys.length - 1], next = keys.find(x => x.frame > f) || keys[0];
    return { key: false, label: `${prev.label}>${next.label}`, text: `an in-between, part of the way from one pose to the next. From: ${say(prev)}. Towards: ${say(next)}. Follow the guide for exactly how far.` };
  });
}

// The guide in the base picture's own framing: a sprite pixel (x, y) sits where the base's lattice put it in its raw picture, so the
// bones line up with where the character already stands in image 1
export function baseMap(lattice) {
  const { cropBox: c, pixelSize: s, trim, offset } = lattice;
  return { s, ox: c.x + (trim.x - offset.x) * s, oy: c.y + (trim.y - offset.y) * s };
}
export function writeGuides(L) {
  mkdirSync(join(L.out, 'guides'), { recursive: true });
  const raw = fromPNG(readFileSync(L.raw)), files = L.poses.map((p, i) => {
    const f = join(L.out, 'guides', `f${i}.png`);
    writeFileSync(f, toPNG(R.renderGuide(L.rig, p, { w: raw.width, h: raw.height, map: baseMap(L.lattice) }))); return f;
  });
  const { im, cells } = R.guideStrip(L.rig, L.poses, { cols: STRIP.cols, cw: STRIP.cw, ch: STRIP.ch });
  writeFileSync(join(L.out, 'guides', 'strip.png'), toPNG(im));
  return { files, strip: join(L.out, 'guides', 'strip.png'), cells };
}

// Put a snapped figure (any size) on the target canvas so its feet stand on `foot` and its head is over `headX`, the way an
// animator registers drawings on the light table; pixels that fall outside are counted
export function register(im, { w, h, foot, headX }) {
  const s = frameStats(im); if (s.empty) throw new Error('nothing was drawn');
  const dx = Math.round(headX - s.head.x), dy = foot - s.foot, out = blank(w, h); let cut = 0;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const o = (y * im.width + x) * 4; if (im.data[o + 3] < 128) continue;
    const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= w || ty >= h) { cut++; continue; }
    out.data.set(im.data.subarray(o, o + 4), (ty * w + tx) * 4);
  }
  return { im: out, cut, shift: { dx, dy } };
}

const onPalette = (im, palette) => { for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const c = rgbOf(nearest(palette, [im.data[i], im.data[i + 1], im.data[i + 2]])); im.data.set(c, i); } return im; };

// a figure cut from a bigger picture, snapped at a fixed pixel size (so every frame of a strip keeps one scale) and registered
async function fitFixed(png, { ps, palette, target, foot, headX, snap }) {
  const im = binarize(fromPNG(png)), b = bbox(im); if (!b) throw new Error('the cell is empty');
  const sub = crop(im, b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  const out = binarize(fromPNG(await snap(toPNG(sub), { pixelSize: ps, palette: palette.map(h => h.slice(1)).join(',') }))), ob = bbox(out);
  if (!ob) throw new Error('snapping removed everything');
  const r = register(crop(out, ob.x, ob.y, ob.w, ob.h), { w: target.w, h: target.h, foot, headX });
  return { png: toPNG(onPalette(r.im, palette)), cut: r.cut, shift: r.shift, size: [ob.w, ob.h] };
}

// ---- the methods ------------------------------------------------------------------------------------------------------------
// Each returns { frames: [{ i, png (game size) | error, raw (the model's own picture, file) }], calls, usage: [...], prompts: [...] }

async function perFrame(L, api, G, o) {
  const ad = adapter(api), mdl = o.model || ad.defaultModel, acts = frameActions(L.animation), res = { model: mdl, frames: [], calls: 0, usage: [], prompts: [] };
  const keyed = api === 'flux', dir = join(L.out, `${api}-frame`, 'raw'); if (!o.dry) mkdirSync(dir, { recursive: true });
  const order = [...acts.keys()].sort((a, b) => (acts[b].key - acts[a].key) || a - b);   // the keys first: they matter most
  for (const i of order) {
    const refs = [{ file: L.raw, role: 'base' }, { file: G.files[i], role: 'guide' }];
    const prompt = buildPrompt({ style: L.style, cls: L.asset.class, brief: L.brief, target: L.asset.target, palette: L.palette, refs, keyed, pose: acts[i].text });
    res.prompts.push({ i, prompt });
    if (o.dry) continue;
    if (o.maxCalls != null && o.calls.n >= o.maxCalls) { res.frames.push({ i, error: 'not made: --max-calls reached' }); continue; }
    o.calls.n++; res.calls++;
    try {
      const g = await (o.generate || ad.generate)({ prompt, refs: refs.map(r => ({ png: refPicture(r.file), name: `${r.role}.png` })), size: 1024, transparent: !keyed, model: mdl, quality: o.quality });
      const rawFile = join(dir, `f${i}.png`); writeFileSync(rawFile, g.png);
      res.usage.push({ i, usage: g.usage || null, params: g.params || null, requestId: g.requestId || null });
      const pic = g.keyed ? toPNG(removeKey(fromPNG(g.png), rgbOf(g.keyed))) : g.png;
      const fit = await snapToTarget(pic, { target: L.asset.target, palette: L.palette, snap: o.snap, align: L.lattice });
      res.frames.push({ i, png: fit.png, raw: rawFile, cut: fit.cut || 0 });
      o.log(`${api}-frame f${i} (${acts[i].label}): done${fit.cut ? `, ${fit.cut} pixels outside the canvas` : ''}`);
    } catch (e) { res.frames.push({ i, error: e.message }); o.log(`${api}-frame f${i}: ${e.message}`); }
  }
  res.frames.sort((a, b) => a.i - b.i);
  return res;
}

async function strip(L, G, o) {
  const ad = adapter('openai'), mdl = o.model || ad.defaultModel, n = L.poses.length, acts = frameActions(L.animation), dir = join(L.out, 'openai-strip', 'raw');
  const T = L.asset.target, rows = Math.ceil(n / STRIP.cols);
  const prompt = [
    L.style.styleParagraph.trim(),
    `Draw ${n} frames of one looping animation of the character in image 1 (${L.brief.trim().replace(/\.$/, '')}), all on one picture, in a grid of ${STRIP.cols} columns and ${rows} rows: frame 1 top left, then left to right, then the next row.`,
    `Image 1 is the character: keep its design, proportions, size, colours and outline exactly in every frame. Image 2 is a sheet of POSE GUIDES, not art, in the same grid: in each cell, coloured lines are the bones of that frame's pose (the near limbs orange-red, the far limbs blue, the body, neck and head green with the head as a green ring, the tail purple, the yellow line points where the face looks) over a grey silhouette. Draw each frame in its cell, in exactly that cell's pose, at the place and size of its guide, every frame standing on the same ground line. Draw nothing of the guides themselves.`,
    `The frames: ${acts.map((a, i) => `${i + 1}: ${a.text}`).join(' ')}`,
    `Each frame is drawn on a pixel grid of exactly ${T.w} x ${T.h} squares: every square a big flat block of one colour (no anti-aliasing, no blur, no gradients, no dithering), the dark outline one square wide around the silhouette.`,
    `Use only these colours, or ones very close: ${L.palette.join(' ')}.`,
    'Side view, on a transparent background. No text, no numbers, no grid lines, no frames around the cells, no shadow on the ground.',
  ].join('\n\n');
  const res = { model: mdl, frames: [], calls: 0, usage: [], prompts: [{ i: 'all', prompt }] };
  if (o.dry) return res;
  if (o.maxCalls != null && o.calls.n >= o.maxCalls) { res.frames = L.poses.map((_, i) => ({ i, error: 'not made: --max-calls reached' })); return res; }
  mkdirSync(dir, { recursive: true }); o.calls.n++; res.calls++;
  let g;
  try { g = await (o.generate || ad.generate)({ prompt, refs: [{ png: refPicture(L.raw), name: 'base.png' }, { png: refPicture(G.strip), name: 'guides.png' }], size: STRIP.size, transparent: true, model: mdl, quality: o.quality }); }
  catch (e) { res.frames = L.poses.map((_, i) => ({ i, error: e.message })); o.log(`openai-strip: ${e.message}`); return res; }
  const rawFile = join(dir, 'strip.png'); writeFileSync(rawFile, g.png);
  res.usage.push({ i: 'all', usage: g.usage || null, params: g.params || null, requestId: g.requestId || null });
  const pic = binarize(fromPNG(g.png)), cells = G.cells.map(c => crop(pic, c.x, c.y, c.w, c.h));
  // one pixel size for the whole strip: the drawn figures' median height over the base sprite's height
  const bs = frameStats(L.sprite), hs = cells.map(c => (bbox(c) || { h: 0 }).h).filter(Boolean).sort((a, b) => a - b);
  const ps = hs.length ? hs[hs.length >> 1] / bs.height : 1;
  for (let i = 0; i < n; i++) {
    try { const f = await fitFixed(toPNG(cells[i]), { ps, palette: L.palette, target: T, foot: bs.foot, headX: bs.head.x, snap: o.snap }); res.frames.push({ i, png: f.png, raw: rawFile, cut: f.cut }); }
    catch (e) { res.frames.push({ i, error: e.message }); }
  }
  o.log(`openai-strip: cut into ${n} frames at pixel size ${ps.toFixed(2)}`);
  return res;
}

// ---- the Replicate methods ----------------------------------------------------------------------------------------------------
// a picture flattened on a flat colour (the video models take no transparency) and made `scale` times smaller or bigger
function flat(im, bg) { const out = blank(im.width, im.height); for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3] / 255; for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(im.data[i + c] * a + bg[c] * (1 - a)); out.data[i + 3] = 255; } return out; }
function half(im) { const out = blank(im.width >> 1, im.height >> 1); for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data.set(im.data.subarray(((2 * y) * im.width + 2 * x) * 4, ((2 * y) * im.width + 2 * x) * 4 + 4), (y * out.width + x) * 4); return out; }

// every frame of a video as a picture (ffmpeg, which the bake-off needs only for the video methods)
export function videoFrames(mp4, dir) {
  mkdirSync(dir, { recursive: true }); const src = join(dir, 'clip.mp4'); writeFileSync(src, mp4);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-vsync', '0', join(dir, '%04d.png')], { encoding: 'utf8' });
  if (r.error || r.status) throw new Error(`ffmpeg could not read the clip (${r.error ? r.error.message : r.stderr.trim().slice(0, 200)}): install ffmpeg for the video methods`);
  return readdirSync(dir).filter(f => /^\d{4}\.png$/.test(f)).sort().map(f => fromPNG(readFileSync(join(dir, f))));
}
// n frames spread evenly over one pass of a clip whose last frame is its first again
export const pick = (count, n) => Array.from({ length: n }, (_, i) => Math.round(i * (count - 1) / n));

async function replicateRun(L, o, m, model, input, res, saved = null) {
  // --reuse: what the model sent last time is on disk (raw/), so cut it again for free
  if (o.reuse && saved && saved.every(f => existsSync(f))) { o.log(`${m}: reusing ${saved.map(f => f.slice(L.out.length + 1)).join(', ')} (no call)`); res.reused = true; return saved.map(f => readFileSync(f)); }
  if (o.maxCalls != null && o.calls.n >= o.maxCalls) throw new Error('not made: --max-calls reached');
  o.calls.n++; res.calls++;
  const r = await (o.replicate || replicate).run(model, input, { log: msg => o.log(`${m}: ${msg}`) });
  res.usage.push({ i: 'all', usage: r.metrics, params: { model, version: r.version }, requestId: r.id });
  o.log(`${m}: ${model} ran (${r.id}, ${r.metrics && r.metrics.predict_time ? r.metrics.predict_time.toFixed(1) + ' s' : 'no time reported'})`);
  return (o.replicate || replicate).download(r.output);
}

async function rdAnimation(L, G, o) {
  const m = 'rd-animation', res = { model: 'retro-diffusion/rd-animation', frames: [], calls: 0, usage: [], prompts: [] }, dir = join(L.out, m, 'raw');
  // the base sprite on a 48 x 48 canvas (the only size its walks come in), on light grey, 8 times bigger so its pixels read as pixels
  const c = blank(48, 48), sp = L.sprite, ox = (48 - sp.width) >> 1, oy = 48 - sp.height - 6;
  for (let y = 0; y < sp.height; y++) for (let x = 0; x < sp.width; x++) { const k = (y * sp.width + x) * 4; if (sp.data[k + 3] >= 128) c.data.set(sp.data.subarray(k, k + 4), ((y + oy) * 48 + x + ox) * 4); }
  const input = { prompt: L.brief.replace(/;.*$/, ''), input_image: replicate.dataURI(toPNG(upscale(flat(c, [200, 200, 200]), 8))), style: 'four_angle_walking', width: 48, height: 48, return_spritesheet: true };
  res.prompts.push({ i: 'all', prompt: input.prompt });
  if (o.dry) return res;
  mkdirSync(dir, { recursive: true });
  let sheet;
  try { [sheet] = await replicateRun(L, o, m, res.model, input, res, [join(dir, 'sheet.png')]); } catch (e) { res.frames = L.poses.map((_, i) => ({ i, error: e.message })); o.log(`${m}: ${e.message}`); return res; }
  writeFileSync(join(dir, 'sheet.png'), sheet);
  // a 4 x 4 sheet of 48 x 48 cells, one row per direction (seen November 2026: away from the viewer, facing right, towards the viewer,
  // facing left); the right-facing row, the second, is Pip's
  const im = fromPNG(sheet), cw = im.width / 4, ch = im.height / 4, bs = frameStats(L.sprite), n = L.poses.length;
  for (let i = 0; i < n; i++) {
    if (i % (n / 4)) { res.frames.push({ i, error: 'this model draws 4 frames per walk: no in-between' }); continue; }
    const cell = binarize(crop(im, (i / (n / 4)) * cw, 1 * ch, cw, ch)), b = bbox(cell);
    if (!b) { res.frames.push({ i, error: 'empty cell' }); continue; }
    const r = register(crop(cell, b.x, b.y, b.w, b.h), { w: L.asset.target.w, h: L.asset.target.h, foot: bs.foot, headX: bs.head.x });
    res.frames.push({ i, png: toPNG(onPalette(r.im, L.palette)), raw: join(dir, 'sheet.png'), cut: r.cut });
  }
  return res;
}

async function toonInbetween(L, G, o) {
  const m = 'toon-inbetween', res = { model: 'fofr/tooncrafter', frames: [], calls: 0, usage: [], prompts: [] }, dir = join(L.out, m, 'raw'), n = L.poses.length;
  const keys = [...L.animation.keys].sort((a, b) => a.frame - b.frame).map(k => k.frame), src = k => join(L.out, 'openai-frame', 'raw', `f${k}.png`);
  const missing = keys.filter(k => !existsSync(src(k)));
  const input = { prompt: 'pixel art mouse astronaut walking, side view, flat green background', negative_prompt: 'blur, smooth shading, camera movement', loop: !!L.animation.loop, max_width: 512, max_height: 512, interpolate: false, color_correction: true };
  res.prompts.push({ i: 'all', prompt: `${input.prompt} (keys: openai-frame ${keys.map(k => 'f' + k).join(', ')})` });
  if (o.dry) return res;
  if (missing.length) { res.frames = L.poses.map((_, i) => ({ i, error: `needs openai-frame's keys first (missing ${missing.map(k => 'f' + k).join(', ')})` })); return res; }
  keys.forEach((k, j) => { input[`image_${j + 1}`] = replicate.dataURI(toPNG(half(flat(fromPNG(readFileSync(src(k))), GREEN)))); });
  mkdirSync(dir, { recursive: true });
  let files;
  try { files = await replicateRun(L, o, m, res.model, input, res, [join(dir, 'clip.mp4')]); } catch (e) { res.frames = L.poses.map((_, i) => ({ i, error: e.message })); o.log(`${m}: ${e.message}`); return res; }
  const clip = files[files.length - 1]; writeFileSync(join(dir, 'clip.mp4'), clip);
  const all = videoFrames(clip, join(tmpdir(), `bakeoff-${m}-${Date.now()}`)), at = pick(all.length + (L.animation.loop ? 1 : 0), n);
  o.log(`${m}: ${all.length} frames in the clip, taking ${at.join(', ')}`);
  for (let i = 0; i < n; i++) {
    try {
      const f = all[Math.min(at[i], all.length - 1)], big = upscale(f, 1024 / f.width);   // back to the base picture's framing (the keys went in at half size)
      writeFileSync(join(dir, `f${i}.png`), toPNG(f));
      // the clip drifts by a fraction of an art pixel by its last segment (seen November 2026), so the base's fixed lattice would sample between
      // the blocks: the snapper finds each frame's own grid at the base's pixel size, and the frame is registered (feet on the ground, helmet over the base's)
      const bs = frameStats(L.sprite), fit = await fitFixed(toPNG(binarize(removeKey(big, GREEN, 120))), { ps: L.lattice.pixelSize, palette: L.palette, target: L.asset.target, foot: bs.foot, headX: bs.head.x, snap: o.snap });
      res.frames.push({ i, png: fit.png, raw: join(dir, `f${i}.png`), cut: fit.cut, shift: fit.shift });
    } catch (e) { res.frames.push({ i, error: e.message }); }
  }
  return res;
}

async function wanLoop(L, G, o) {
  const m = 'wan-loop', res = { model: 'wan-video/wan-2.7-i2v', frames: [], calls: 0, usage: [], prompts: [] }, dir = join(L.out, m, 'raw'), n = L.poses.length;
  const first = replicate.dataURI(toPNG(half(flat(fromPNG(readFileSync(L.raw)), GREEN))));
  const input = { prompt: `${L.brief.replace(/;.*$/, '')}, walks in place: a steady, looping walk cycle seen from the side, facing right, the legs stepping, the arms and tail swinging a little. The camera does not move and the character stays in the middle of the picture. Pixel art, flat plain green background, nothing else.`,
    negative_prompt: 'camera movement, zoom, walking out of the picture, scenery, floor, shadow, text, blur, smooth 3D shading', first_frame: first, last_frame: first, duration: 2, resolution: '720p', enable_prompt_expansion: false };
  res.prompts.push({ i: 'all', prompt: input.prompt });
  if (o.dry) return res;
  mkdirSync(dir, { recursive: true });
  let files;
  try { files = await replicateRun(L, o, m, res.model, input, res, [join(dir, 'clip.mp4')]); } catch (e) { res.frames = L.poses.map((_, i) => ({ i, error: e.message })); o.log(`${m}: ${e.message}`); return res; }
  writeFileSync(join(dir, 'clip.mp4'), files[0]);
  const all = videoFrames(files[0], join(tmpdir(), `bakeoff-${m}-${Date.now()}`)), at = pick(all.length, n);
  o.log(`${m}: ${all.length} frames in the clip, taking ${at.join(', ')}`);
  const keyed = at.map(k => binarize(removeKey(all[k], GREEN, 120)));
  const bs = frameStats(L.sprite), hs = keyed.map(k => (bbox(k) || { h: 0 }).h).filter(Boolean).sort((a, b) => a - b), ps = hs.length ? hs[hs.length >> 1] / bs.height : 1;
  for (let i = 0; i < n; i++) {
    try { writeFileSync(join(dir, `f${i}.png`), toPNG(all[at[i]])); const f = await fitFixed(toPNG(keyed[i]), { ps, palette: L.palette, target: L.asset.target, foot: bs.foot, headX: bs.head.x, snap: o.snap }); res.frames.push({ i, png: f.png, raw: join(dir, `f${i}.png`), cut: f.cut }); }
    catch (e) { res.frames.push({ i, error: e.message }); }
  }
  return res;
}

// ---- PixelLab ---------------------------------------------------------------------------------------------------------------------
// A pose of the rig as PixelLab's 18 joints, in fractions of the sprite: mapped joints where the rig solves them, the face points where the
// sprite has them, moved as far as the joint they follow has moved from the rest pose. Near (RIGHT) is drawn over far (LEFT).
export function pixellabKeypoints(rig, map, pose) {
  const P = R.solve(rig, R.full(rig, pose)), rest = R.solve(rig, R.full(rig, {})), W = rig.size.w, H = rig.size.h, out = [];
  const clamp = v => Math.max(0, Math.min(1, v)), z = l => (l.startsWith('RIGHT') ? 1 : l.startsWith('LEFT') ? -1 : 0);
  for (const [label, id] of Object.entries(map.joints)) { if (!P[id]) throw new Error(`the PixelLab map names joint ${id}, which the rig has not`); out.push({ label, x: clamp(P[id].x / W), y: clamp(P[id].y / H), z_index: z(label) }); }
  const f = map.face || { points: {} }, d = f.follow ? { x: P[f.follow].x - rest[f.follow].x, y: P[f.follow].y - rest[f.follow].y } : { x: 0, y: 0 };
  for (const [label, [x, y]] of Object.entries(f.points)) out.push({ label, x: clamp((x + d.x) / W), y: clamp((y + d.y) / H), z_index: z(label) });
  const missing = pixellab.LABELS.filter(l => !out.some(k => k.label === l));
  if (missing.length) throw new Error(`the PixelLab map leaves out ${missing.join(', ')} (all 18 joints are needed)`);
  return out;
}

async function pixellabSkeleton(L, G, o) {
  const m = 'pixellab-skeleton', res = { model: 'pixellab animate-with-skeleton-v3', frames: [], calls: 0, usage: [], prompts: [] }, dir = join(L.out, m, 'raw'), map = L.A.pixellab;
  if (!map) { res.frames = L.poses.map((_, i) => ({ i, error: `${L.anim}.json has no "pixellab" joint map` })); return res; }
  const description = L.brief.replace(/;.*$/, ''), first = R.full(L.rig, {}), keypoints = L.poses.map(p => pixellabKeypoints(L.rig, map, p));
  res.prompts.push({ i: 'all', prompt: `${description} | action: walk | ${map.direction || 'east'}, side view | ${keypoints.length} skeletons` });
  if (o.dry) return res;
  mkdirSync(dir, { recursive: true });
  const saved = L.poses.map((_, i) => join(dir, `f${i}.png`));
  let frames;
  if (o.reuse && saved.every(f => existsSync(f))) { frames = saved.map(f => readFileSync(f)); res.reused = true; o.log(`${m}: reusing raw/ (no call)`); }
  else {
    if (o.maxCalls != null && o.calls.n >= o.maxCalls) { res.frames = L.poses.map((_, i) => ({ i, error: 'not made: --max-calls reached' })); return res; }
    o.calls.n++; res.calls++;
    try {
      const r = await (o.pixellab || pixellab).animateWithSkeleton({ first: toPNG(L.sprite), firstKeypoints: pixellabKeypoints(L.rig, map, first), keypoints, description, action: 'walk', direction: map.direction || 'east', view: 'side', log: msg => o.log(`${m}: ${msg}`) });
      frames = r.frames; res.usage.push({ i: 'all', usage: r.usage, params: { endpoint: 'animate-with-skeleton-v3', frames: keypoints.length }, requestId: r.jobId });
      frames.forEach((f, i) => writeFileSync(saved[i], f));
      o.log(`${m}: ${frames.length} frames (job ${r.jobId})`);
    } catch (e) { res.frames = L.poses.map((_, i) => ({ i, error: e.message })); o.log(`${m}: ${e.message}`); return res; }
  }
  // the frames come back at the sprite's own size and on its pixels: only the palette is made sure of (the placement is the model's, kept as it is)
  frames.forEach((f, i) => res.frames.push({ i, png: toPNG(onPalette(binarize(fromPNG(f)), L.palette)), raw: saved[i] }));
  return res;
}

const RUN = { 'openai-frame': (L, G, o) => perFrame(L, 'openai', G, o), 'flux-frame': (L, G, o) => perFrame(L, 'flux', G, o), 'openai-strip': strip, 'rd-animation': rdAnimation, 'toon-inbetween': toonInbetween, 'wan-loop': wanLoop, 'pixellab-skeleton': pixellabSkeleton };
const API_OF = { 'openai-frame': 'openai', 'flux-frame': 'flux', 'openai-strip': 'openai', 'rd-animation': 'replicate', 'toon-inbetween': 'replicate', 'wan-loop': 'replicate', 'pixellab-skeleton': 'pixellab' };

// run the methods; each method's frames and record go to <out>/<method>/
export async function bakeoff(game, anim, { methods = METHODS, root = ROOT, dry = false, quality = 'low', model = null, maxCalls = 20, generate = null, replicate: rep = null, pixellab: pl = null, reuse = false, snap = realSnap, log = () => {} } = {}) {
  const L = load(game, anim, root), G = writeGuides(L), calls = { n: 0 }, done = {};
  for (const m of methods) {
    if (!RUN[m]) throw new Error(`unknown method ${m} (${METHODS.join(', ')})`);
    const res = await RUN[m](L, G, { dry, quality, model, maxCalls, calls, generate, replicate: rep, pixellab: pl, reuse, snap, log });
    if (dry) { for (const p of res.prompts) log(`--- ${m}, frame ${p.i} ---\n${p.prompt}\n`); continue; }
    const d = join(L.out, m); mkdirSync(d, { recursive: true });
    // the frames of an earlier cut go (a frame this cut did not make must not linger); the raw pictures in raw/ stay
    for (const f of readdirSync(d)) if (/^f\d+\.png$/.test(f)) unlinkSync(join(d, f));
    for (const f of res.frames) if (f.png) writeFileSync(join(d, `f${f.i}.png`), f.png);
    // a cut of a saved output keeps the record of the call that made it
    const prev = res.reused && existsSync(join(d, 'meta.json')) ? readJSON(join(d, 'meta.json')) : null;
    writeJSON(join(d, 'meta.json'), { method: m, provider: API_OF[m], model: res.model, quality, made: prev ? prev.made : new Date().toISOString(), recut: prev ? new Date().toISOString() : undefined,
      calls: prev ? prev.calls : res.calls, usage: prev ? prev.usage : res.usage,
      frames: res.frames.map(({ png, ...f }) => ({ ...f, raw: f.raw ? f.raw.slice(L.out.length + 1) : undefined })), prompts: res.prompts });
    done[m] = res;
  }
  if (!dry) compare(game, anim, { root });
  return { calls: calls.n, done, guides: G };
}

// ---- comparing ------------------------------------------------------------------------------------------------------------
// compare.png: a row of guides, then a row per method (frames at `scale`, then at game size); report.md: the numbers and warnings
export function compare(game, anim, { root = ROOT, scale = 4 } = {}) {
  const L = load(game, anim, root), n = L.poses.length, T = L.asset.target, methods = existsSync(L.out) ? readdirSync(L.out).filter(m => existsSync(join(L.out, m, 'meta.json'))).sort() : [];
  const rows = [{ name: 'guide', frames: L.poses.map(p => R.renderGuide(L.rig, p, { w: T.w * scale, h: T.h * scale, map: { s: scale, ox: 0, oy: 0 }, bg: [24, 26, 34, 255] })), big: true }];
  const report = [`# Bake-off: ${anim}`, '', `${L.A.name || anim}: ${n} frames at ${L.animation.fps} fps${L.animation.loop ? ', looping' : ''}, drawn from ${L.A.asset}/${L.A.base}. Made with \`node tools/art/bakeoff.mjs ${game} ${anim}\`; the numbers come from tools/art/animcheck.mjs.`, ''];
  report.push('| method | model | calls | frames made | height range | foot range | head jitter | mean step | seam | mean drift | off palette | warnings |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  const details = [];
  for (const m of methods) {
    const meta = readJSON(join(L.out, m, 'meta.json')), ims = Array.from({ length: n }, (_, i) => existsSync(join(L.out, m, `f${i}.png`)) ? fromPNG(readFileSync(join(L.out, m, `f${i}.png`))) : null);
    const got = ims.filter(Boolean);
    if (ims.some(Boolean)) rows.push({ name: m, frames: ims });
    if (!got.length) { report.push(`| ${m} | ${meta.model} | ${meta.calls} | 0 | | | | | | | | |`); continue; }
    const c = checkAnimation(ims.map(im => im || blank(T.w, T.h)), { palette: L.palette, anchor: L.sprite, loop: L.animation.loop });
    const off = Math.max(...c.frames.filter(f => !f.empty).map(f => f.offPalette || 0));
    report.push(`| ${m} | ${meta.model} | ${meta.calls} | ${got.length}/${n} | ${c.heightRange} | ${c.footRange} | ${c.headJitter.toFixed(1)} | ${(c.meanStep * 100).toFixed(0)}% | ${c.seam == null ? '' : (c.seam * 100).toFixed(0) + '%'} | ${c.meanDrift == null ? '' : c.meanDrift.toFixed(2)} | ${(off * 100).toFixed(1)}% | ${c.warnings.length} |`);
    const tokens = meta.usage.reduce((t, u) => t + ((u.usage && (u.usage.total_tokens || (u.usage.input_tokens || 0) + (u.usage.output_tokens || 0))) || 0), 0);
    details.push(`## ${m}`, '', `${meta.provider} ${meta.model}, quality ${meta.quality}, ${meta.calls} call(s)${tokens ? `, ${tokens} tokens in all (as the API reported)` : ''}${meta.usage.some(u => u.params && u.params.cost != null) ? `, ${meta.usage.reduce((t, u) => t + (u.params.cost || 0), 0)} credits` : ''}.`, '',
      ...(c.warnings.length ? c.warnings.map(w => `- ${w}`) : ['- no warnings']), ...meta.frames.filter(f => f.error).map(f => `- frame ${f.i} failed: ${f.error}`), '');
  }
  report.push('', `compare.png: the guides, then ${rows.slice(1).map(r => r.name).join(', then ')} (at ${scale}x, then at game size on the right).`);
  report.push('', 'Height range, foot range and head jitter are pixels at game size; mean step is the share of pixels that change from one frame to the next, seam the same from the last frame back to the first (a seam well above the mean step is a hitch); drift is how far a frame\'s colours are from the base\'s (0 the same, 1 nothing shared). Lower is steadier, but only looking at the frames play tells whether it is good.', '', ...details);
  writeFileSync(join(L.out, 'report.md'), report.join('\n') + '\n');
  // the sheet
  const gap = 6, label = 0, cellW = T.w * scale, W = gap + n * (cellW + gap) + T.w * n + gap * 2, rowH = T.h * scale + gap, H = gap + rows.length * rowH;
  const out = blank(W, H); for (let i = 0; i < out.data.length; i += 4) out.data.set([12, 14, 20, 255], i);
  const blit = (im, x0, y0, f = 1) => { for (let y = 0; y < im.height * f; y++) for (let x = 0; x < im.width * f; x++) { const s = (((y / f) | 0) * im.width + ((x / f) | 0)) * 4, o = ((y0 + y) * W + x0 + x) * 4; if (im.data[s + 3] < 128) { out.data.set([30, 33, 44, 255], o); continue; } out.data.set([im.data[s], im.data[s + 1], im.data[s + 2], 255], o); } };
  rows.forEach((r, ri) => {
    const y0 = gap + ri * rowH;
    r.frames.forEach((im, i) => { if (!im) return; const x0 = gap + label + i * (cellW + gap); r.big ? blit(im, x0, y0) : blit(im, x0, y0, scale); });
    if (!r.big) r.frames.forEach((im, i) => { if (im) blit(im, gap + n * (cellW + gap) + gap + i * T.w, y0 + T.h * scale - T.h); });
  });
  writeFileSync(join(L.out, 'compare.png'), toPNG(out));
  return { report: join(L.out, 'report.md'), sheet: join(L.out, 'compare.png'), methods };
}

// ---- command line -------------------------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--') && !(args[args.indexOf(a) - 1] || '').match(/^--(methods|quality|model|max-calls)$/));
  const opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
  const [game, anim] = pos; if (!game || !anim) { console.error('usage: node tools/art/bakeoff.mjs <game> <anim> [--methods a,b] [--quality low] [--max-calls 20] [--dry] | --compare'); process.exit(2); }
  if (opt('compare')) { const r = compare(game, anim); console.log(`${r.sheet}\n${r.report}`); process.exit(0); }
  if (!opt('dry') && needsProxyRestart()) {
    const { spawnSync } = await import('node:child_process');
    process.exit(spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } }).status ?? 1);
  }
  const methods = opt('methods') ? String(opt('methods')).split(',') : METHODS;
  if (!opt('dry')) for (const m of methods) { const h = keyHint(API_OF[m]); if (h) { console.error(`${m}: ${h}`); process.exit(1); } }
  const r = await bakeoff(game, anim, { methods, dry: !!opt('dry'), quality: opt('quality') || 'low', model: opt('model') || null, maxCalls: opt('max-calls') ? +opt('max-calls') : 20, reuse: !!opt('reuse'), log: m => console.log(m) });
  console.log(opt('dry') ? `dry run: ${r.guides.files.length} guides written, no calls` : `${r.calls} call(s). Sheet: ${join('games', game, 'art', 'bakeoff', anim, 'compare.png')}`);
}
