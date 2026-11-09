// The generation loop of the art pipeline (docs/ART_PIPELINE.md, "Making art with an API"): a brief and the game's style sheet
// become a prompt with reference pictures; the API's answer is trimmed to the subject, snapped to the target size on the game's
// (or the map's) palette, given normals and a contact sheet, and written as a DRAFT version. Nothing here reaches the game: a
// person looks at preview.png and approves with `art.mjs promote`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, artDir, readJSON, loadAssets, loadStyle, loadPalette } from './lib.mjs';
import { nearest, rgbOf } from './palette.mjs';
import { blank, toPNG, fromPNG, crop, upscale, bbox, binarize, removeKey, padTo } from './image.mjs';
import { writeVersion } from './store.mjs';
import { adapter } from './gen/index.mjs';
import { snap as realSnap } from '../snap.mjs';

const MAX_REFS = 4;
// which style references go with which kind of asset (the game-level ones win on proportions, outline and palette); the map's seed
// picture is added when a map is given, and the mood picture only on request (scenes)
const REFS_FOR = { character: ['hero', 'env'], prop: ['props', 'env'], tile: ['env'] };
const ROLE_TEXT = { hero: 'the main character: its proportions, outline and shading', props: 'the objects of the game: their size, outline and shading',
  base: 'the same character, drawn before: keep its design, proportions, size, colours, outline and its place in the picture exactly, and change only the pose as described below',
  draft: 'the draft to refine: keep its design, proportions, colours and pose, and redraw it cleaner and sharper as pixel art',
  env: 'the walls and floors: the surfaces and colours', mood: 'a stretch of the game with its light', seed: 'the place this will stand in: its colours and light' };
const REF_BG = [40, 40, 48];

// the references to send, in order: [{ file (absolute), role, label }]
export function pickRefs(game, cls, { map = null, mood = false, root = ROOT } = {}) {
  const style = loadStyle(game, root), dir = artDir(game, root), out = [];
  for (const role of [...(REFS_FOR[cls] || ['props', 'env']), ...(mood ? ['mood'] : [])]) {
    const r = ((style && style.refs) || []).find(x => x.role === role);
    if (r && existsSync(join(dir, 'style', r.file))) out.push({ file: join(dir, 'style', r.file), role });
  }
  if (map && existsSync(join(dir, 'maps', map, 'seed.png'))) out.push({ file: join(dir, 'maps', map, 'seed.png'), role: 'seed' });
  return out.slice(0, MAX_REFS);
}

// a reference as the model should see it: blocks big enough to see (the shorter side at least 384, the longer at most 1536),
// transparency flattened onto a dark grey
export function refPicture(file) {
  const im = fromPNG(readFileSync(file)), f = Math.max(1, Math.min(Math.ceil(384 / Math.min(im.width, im.height)), Math.floor(1536 / Math.max(im.width, im.height))));
  return toPNG(upscale(im, f, REF_BG));
}

const CLASS_WORD = { character: 'character', prop: 'prop (one object)', tile: 'square tile' };
export function buildPrompt({ style, cls, brief, target, palette, refs, keyed, mapNotes = '', note = '', pose = '' }) {
  const roles = refs.map((r, i) => `Image ${i + 1} is ${ROLE_TEXT[r.role] || r.role}.`).join(' ');
  return [
    style.styleParagraph.trim(),
    `Draw ONE ${CLASS_WORD[cls] || cls}: ${brief.trim().replace(/\.$/, '')}.`,
    refs.length ? `${roles} The reference pictures are shown on a dark grey ground that is not part of the art. Match their pixel size, outline, shading and colours exactly, but draw the new subject: never copy what they show.` : '',
    // the model's own pixels should be the final ones: asked for a grid of exactly the target, its blocks come out big and the snap loses little (thin parts are what is lost otherwise)
    `Draw it on a pixel grid of exactly ${target.w} x ${target.h} squares: the whole subject is only ${target.w} squares wide and ${target.h} squares tall, so every square is a big flat block of one colour (no anti-aliasing, no blur, no gradients, no dithering) and the shape must stay simple and readable at that size.${cls === 'character' ? ' Thin parts such as legs, arms and tails are at least two squares wide. The dark outline is one square wide and runs round the whole silhouette only, not between the parts of the body.' : ''}`,
    `Use only these colours, or ones very close: ${palette.join(' ')}.`,
    `Side view, one subject, centred and filling most of the picture, ${keyed ? 'on a flat solid #FF00FF magenta background (exactly that colour, and no magenta or pink in the subject)' : 'on a transparent background'}. No text, no shadow on the ground, no frame, nothing else.`,
    pose ? `New pose: ${pose.trim()}` : '',
    mapNotes ? `The place it belongs to: ${mapNotes}` : '',
    note ? `Change from the version before it: ${note.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

// the notes.md of a map, without its heading and the empty bullets of the template
export function mapNotesOf(game, map, root = ROOT) {
  const p = join(artDir(game, root), 'maps', map, 'notes.md'); if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8').split('\n').filter(l => /^\s*-\s+\S/.test(l)).map(l => l.replace(/^\s*-\s+/, '')).join(' ');
}

// Snap the model's picture (subject on transparent) to exactly `target` pixels on `palette`. The subject is trimmed, a pixel size
// is worked out from its size divided by the target, and the snap is repeated with a corrected size until the result is within a
// pixel of the target in the dimension that binds (the other may be up to 30% short); then it is padded to the target. `snap(bytes, {pixelSize, palette})` is the Pixel Snapper.
// Every colour of a sprite moved onto the palette (the snapper already does it; this makes it certain)
function toPalette(sprite, palette) {
  for (let i = 0; i < sprite.data.length; i += 4) if (sprite.data[i + 3]) { const r = rgbOf(nearest(palette, [sprite.data[i], sprite.data[i + 1], sprite.data[i + 2]])); sprite.data[i] = r[0]; sprite.data[i + 1] = r[1]; sprite.data[i + 2] = r[2]; }
  return sprite;
}

// `align` is the lattice of another version ({ cropBox, pixelSize, trim, offset }, recorded in its meta.snap): the frames of an animation are snapped
// on the very same grid and put on the canvas at the very same place, so they do not jitter when they are played one after the other.
export async function snapToTarget(png, { target, palette, snap = realSnap, anchor = 'centre', tries = 4, align = null }) {
  let im = binarize(fromPNG(png));
  const hex0 = palette.map(h => h.slice(1)).join(',');
  if (align) {
    const c = align.cropBox, out = binarize(fromPNG(await snap(toPNG(crop(im, c.x, c.y, c.w, c.h)), { pixelSize: align.pixelSize, palette: hex0 }))), sprite = blank(target.w, target.h);
    let cut = 0;
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const o = (y * out.width + x) * 4; if (!out.data[o + 3]) continue;
      const tx = x - align.trim.x + align.offset.x, ty = y - align.trim.y + align.offset.y;
      if (tx < 0 || ty < 0 || tx >= target.w || ty >= target.h) { cut++; continue; }
      sprite.data.set(out.data.subarray(o, o + 4), (ty * target.w + tx) * 4);
    }
    const b = bbox(sprite); if (!b) throw new Error('nothing of the picture is inside the canvas at the aligned place');
    return { png: toPNG(toPalette(sprite, palette)), pixelSize: align.pixelSize, tries: 1, size: [b.w, b.h], exact: false, aligned: true, cut, lattice: align };
  }
  const box = bbox(im);
  if (!box) throw new Error('the picture is empty: nothing was drawn');
  const pad = 2, cropBox = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }, sub = crop(im, cropBox.x, cropBox.y, cropBox.w, cropBox.h), bytes = toPNG(sub), hex = hex0;
  let ps = Math.max(box.w / target.w, box.h / target.h), last = null;
  for (let t = 1; t <= tries; t++) {
    const out = binarize(fromPNG(await snap(bytes, { pixelSize: ps, palette: hex }))), b = bbox(out);
    if (!b) throw new Error('snapping removed everything');
    const got = crop(out, b.x, b.y, b.w, b.h); last = { img: got, ps, tries: t, size: [b.w, b.h] };
    // within the box, filling it in the dimension that binds (a model rarely draws the exact aspect ratio) and at least 70% of it in the other
    const fits = b.w <= target.w && b.h <= target.h, bindW = target.w - b.w <= 1, bindH = target.h - b.h <= 1;
    if (fits && ((bindW && b.h >= target.h * .7) || (bindH && b.w >= target.w * .7))) {
      const sprite = toPalette(padTo(got, target.w, target.h, anchor), palette), offset = { x: (target.w - got.width) >> 1, y: anchor === 'bottom' ? target.h - got.height : (target.h - got.height) >> 1 };
      return { png: toPNG(sprite), pixelSize: +ps.toFixed(3), tries: t, size: [b.w, b.h], exact: b.w === target.w && b.h === target.h, lattice: { cropBox, pixelSize: ps, trim: { x: b.x, y: b.y }, offset } };
    }
    ps *= Math.max(b.w / target.w, b.h / target.h);
  }
  throw new Error(`could not reach ${target.w} x ${target.h}: the last snap was ${last.size[0]} x ${last.size[1]} at pixel size ${last.ps.toFixed(2)} (try another brief, a simpler subject or a different target)`);
}

// Make `n` candidate versions of an asset. `generate` and `snap` can be replaced (the tests do); `log` receives progress lines.
export async function make(game, id, o) {
  const { root = ROOT, n = 1, from: from0 = null, align: align0 = null, frame = null, pose = '', api = 'openai', model, quality, map = null, parent = null, note = '', mood = false, dry = false, keyed = false,
    maxCalls = null, asset: newAsset = null, generate = null, snap = realSnap, size = 1024, log = () => {} } = o;
  const style = loadStyle(game, root); if (!style || !style.styleParagraph) throw new Error(`games/${game}/art/style/style.json needs a styleParagraph`);
  const cur = loadAssets(game, root).find(a => a.id === id), asset = cur ? cur.asset : newAsset;
  if (!asset) throw new Error(`${id} is a new asset: give --class, --target WxH and --k (and --place, --char, --name)`);
  // a frame of an animation made with a pose starts from the asset's first frame, on its grid
  const first = cur && cur.asset.frames ? Object.values(cur.asset.frames)[0] : null;
  const from = from0 || (frame && pose && first) || null, align = align0 || (frame && pose && first) || null;
  if (from && !(cur && cur.versions.some(v => v.n === from))) throw new Error(`version ${from} of ${id} does not exist`);
  const parent_ = parent || from;
  let lattice = null;
  if (align) {
    const av = cur && cur.versions.find(v => v.n === align); lattice = av && av.meta.snap && av.meta.snap.lattice;
    if (!lattice) throw new Error(`version ${align} of ${id} has no recorded lattice to align to (make it again with this version of make)`);
  }
  if (pose && !from) throw new Error('--pose needs --from: the version whose character is drawn in a new pose');
  if (parent_ && !(cur && cur.versions.some(v => v.n === parent_))) throw new Error(`parent ${parent_} does not exist`);
  const pal = map ? (existsSync(join(artDir(game, root), 'maps', map, 'palette.json')) ? readJSON(join(artDir(game, root), 'maps', map, 'palette.json')).colors : null) : loadPalette(game, root);
  if (!pal || !pal.length) throw new Error(map ? `map ${map} has no palette (node tools/art.mjs map ${game} ${map} --seed ...)` : `${game} has no master palette (node tools/art.mjs palette ${game})`);
  // refining a draft: the parent's own picture goes first, so the final pass redraws it instead of starting again
  // refining without a new brief keeps the draft's own
  const brief = o.brief && o.brief.trim() ? o.brief : (from && cur ? cur.versions.find(v => v.n === from).meta.brief : '');
  if (!brief || !brief.trim()) throw new Error('a brief is needed: --brief "what to draw"');
  const base = from ? join(artDir(game, root), 'assets', id, from, 'raw.png') : null;
  if (from && !existsSync(base)) throw new Error(`version ${from} of ${id} has no raw.png to refine`);
  const refs = [...(base ? [{ file: base, role: pose ? 'base' : 'draft' }] : []), ...pickRefs(game, asset.class, { map, mood, root })].slice(0, MAX_REFS), ad = adapter(api), mdl = model || ad.defaultModel;
  const ctx = { style, cls: asset.class, brief, target: asset.target, palette: pal, refs, mapNotes: map ? mapNotesOf(game, map, root) : '', note, pose };
  const done = [];
  let calls = 0, fresh = !cur, useKey = keyed || api === 'flux';
  for (let i = 0; i < n; i++) {
    if (maxCalls != null && calls >= maxCalls) { log(`stopped: --max-calls ${maxCalls} reached`); break; }
    let prompt = buildPrompt({ ...ctx, keyed: useKey });
    if (dry) { log(`prompt for ${ad.name} ${mdl}:\n${prompt}\n\nreferences: ${refs.map(r => `${r.role} (${r.file})`).join(', ') || 'none'}`); return done; }
    const pics = refs.map(r => ({ png: refPicture(r.file), name: `${r.role}.png` }));
    const gen = generate || ad.generate;
    let res;
    try { calls++; res = await gen({ prompt, refs: pics, size, transparent: !useKey, model: mdl, quality }); }
    catch (e) {
      if (e.code !== 'NO_ALPHA') throw e;
      log(`${mdl} cannot make a transparent background: asking for a flat magenta one instead`);
      useKey = true; prompt = buildPrompt({ ...ctx, keyed: true }); calls++;
      res = await gen({ prompt, refs: pics, size, transparent: false, model: mdl, quality });
    }
    let raw = res.png;
    if (res.keyed) raw = toPNG(removeKey(fromPNG(res.png), rgbOf(res.keyed)));
    let fit;
    try { fit = await snapToTarget(raw, { target: asset.target, palette: pal, snap, anchor: asset.place === 'floor' ? 'bottom' : 'centre', align: lattice }); }
    catch (e) {
      // the call was paid for: keep its picture where it can be looked at (not in the repository)
      const keep = join(tmpdir(), `art-failed-${id}-${Date.now()}-${i + 1}.png`); writeFileSync(keep, res.png);
      log(`candidate ${i + 1}: ${e.message} (the model's picture is kept in ${keep})`); done.push({ ok: false, error: e.message, raw: keep }); continue;
    }
    const v = writeVersion(game, id, { sprite: fit.png, raw: res.png, root, asset: fresh ? newAsset : null, meta: {
      kind: 'generated', parent: parent_, frame: frame || undefined, brief, prompt, map: map || undefined, note,
      refs: refs.map(r => ({ path: r.file.slice(artDir(game, root).length + 1), role: r.role })),
      api: { provider: ad.name, model: res.model || mdl, params: res.params || {}, requestId: res.requestId || null, usage: res.usage || null },
      snap: { pixelSize: fit.pixelSize, tries: fit.tries, size: fit.size, palette: map ? `map ${map}` : 'master', colors: pal.length, lattice: fit.lattice, alignedTo: align || undefined, cut: fit.cut || undefined },
      target: { class: asset.class, w: asset.target.w, h: asset.target.h } } });
    fresh = false;
    const dir = join('games', game, 'art', 'assets', id, v);
    log(`candidate ${i + 1}: ${id}/${v}, ${asset.target.w} x ${asset.target.h}${fit.aligned ? ` (aligned to ${align}${fit.cut ? `, ${fit.cut} pixels fell outside the canvas` : ''})` : fit.exact ? '' : ' (padded)'}, snapped at pixel size ${fit.pixelSize} in ${fit.tries} ${fit.tries === 1 ? 'try' : 'tries'}${res.usage ? `, ${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens` : ''}: ${dir}/preview.png`);
    done.push({ ok: true, version: v, dir: join(artDir(game, root), 'assets', id, v) });
  }
  return done;
}
