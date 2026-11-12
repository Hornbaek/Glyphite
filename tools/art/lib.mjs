// The art pipeline's files: games/<id>/art/ (HISTORY 39, docs/ART_PIPELINE.md). Reading, writing and checking them; no DOM.
//   style/style.json, style/palette.json      the game's style sheet and master palette
//   maps/<map>/palette.json                   a sub-palette that sits inside the master
//   assets/<asset>/asset.json                 what the asset is, and which version is live
//   assets/<asset>/<NNN>/meta.json + sprite.png, normals.png, preview.png (+ raw.png)   one attempt
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../png.mjs';

// PIXELITE_ROOT points the tools at another checkout (the unit tests use a temporary one)
export const ROOT = process.env.PIXELITE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STATUSES = ['draft', 'rejected', 'approved'];
export const REF_ROLES = ['hero', 'props', 'env', 'mood'];
export const MAX_PALETTE = 64;   // a limited palette is the point: more than this is a list of colours, not a style
export const KINDS = ['generated', 'imported', 'hand'];
export const artDir = (game, root = ROOT) => join(root, 'games', game, 'art');
export const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const FRAME_RE = /^[a-z][a-z0-9_]{0,23}$/;   // a frame's name: idle, walk1, jump_up

export const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));
// stable layout: two spaces, and short arrays of plain numbers or strings on one line so a diff shows what changed
export const toJSON = v => JSON.stringify(v, null, 2).replace(/\[\s*((?:-?[\d.]+|"[^"\n]*")(?:,\s*(?:-?[\d.]+|"[^"\n]*"))*)\s*\]/g, (m, inner) => inner.length < 90 ? `[${inner.replace(/\s*,\s*/g, ', ')}]` : m) + '\n';
export const writeJSON = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, toJSON(v)); };

export { hexOf as toHex, rgbOf as fromHex } from './palette.mjs';
import { hexOf as toHex } from './palette.mjs';
export const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
const HEX = /^#[0-9a-f]{6}$/;

const dirs = p => existsSync(p) ? readdirSync(p).filter(f => statSync(join(p, f)).isDirectory()).sort() : [];

// every asset of a game: [{ id, dir, asset, versions: [{ n, dir, meta }] }] (a version folder is three digits)
export function loadAssets(game, root = ROOT) {
  const base = join(artDir(game, root), 'assets');
  return dirs(base).map(id => {
    const dir = join(base, id), ap = join(dir, 'asset.json');
    const asset = existsSync(ap) ? readJSON(ap) : null;
    const versions = dirs(dir).filter(n => /^\d{3}$/.test(n)).map(n => ({ n, dir: join(dir, n), meta: existsSync(join(dir, n, 'meta.json')) ? readJSON(join(dir, n, 'meta.json')) : null }));
    return { id, dir, asset, versions };
  });
}
export const loadStyle = (game, root = ROOT) => { const p = join(artDir(game, root), 'style', 'style.json'); return existsSync(p) ? readJSON(p) : null; };
export const loadPalette = (game, root = ROOT) => { const p = join(artDir(game, root), 'style', 'palette.json'); return existsSync(p) ? readJSON(p).colors : null; };
export const nextVersion = a => String(Math.max(0, ...a.versions.map(v => +v.n)) + 1).padStart(3, '0');
export const spriteColours = bytes => { const { data } = decodePNG(bytes), s = new Set(); for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) s.add(toHex([data[i], data[i + 1], data[i + 2]])); return s; };

// what is wrong with a game's art/ folder (an empty list: nothing); `pipelineJs` is the text games/<id>/pipeline.js should hold
export function validate(game, { root = ROOT, pipeline = null } = {}) {
  const out = [], dir = artDir(game, root);
  if (!existsSync(dir)) return [`${game}: there is no art/ folder`];
  const style = loadStyle(game, root);
  if (!style) out.push(`${game}: style/style.json is missing`);
  const pal = loadPalette(game, root);
  if (!pal || !pal.length || !pal.every(c => HEX.test(c))) out.push(`${game}: style/palette.json needs "colors": ["#rrggbb", ...]`);
  const master = new Set(pal || []);
  if (pal && pal.length > MAX_PALETTE) out.push(`${game}: the master palette has ${pal.length} colours, at most ${MAX_PALETTE} (node tools/art.mjs palette ${game} --colors 32)`);
  if (style) {
    if (typeof style.styleParagraph !== 'string' || !style.styleParagraph.trim()) out.push(`${game}: style.json needs a styleParagraph (outline, light, detail: it goes into every prompt)`);
    for (const r of style.refs || []) {
      if (!REF_ROLES.includes(r.role)) out.push(`${game}: reference ${r.file} has the role "${r.role}", one of ${REF_ROLES.join(', ')}`);
      if (!existsSync(join(dir, 'style', r.file))) out.push(`${game}: style reference ${r.file} is not there`);
    }
    const refDir = join(dir, 'style', 'refs');
    if (existsSync(refDir)) for (const f of readdirSync(refDir)) if (!(style.refs || []).some(r => r.file === `refs/${f}`)) out.push(`${game}: style/refs/${f} is not listed in style.json refs`);
  }
  const subs = {};
  for (const m of dirs(join(dir, 'maps'))) {
    const p = join(dir, 'maps', m, 'palette.json');
    if (!existsSync(p)) continue;
    const cs = readJSON(p).colors || [];
    subs[m] = new Set(cs);
    if (!existsSync(join(dir, 'maps', m, 'seed.png'))) out.push(`${game}: map ${m} has a palette but no seed.png`);
    for (const c of cs) if (!master.has(c)) out.push(`${game}: map ${m}'s palette has ${c}, which is not in the master palette`);
  }
  const seenChars = new Map();
  for (const a of loadAssets(game, root)) {
    const at = `${game}/${a.id}`;
    if (!a.asset) { out.push(`${at}: asset.json is missing`); continue; }
    const A = a.asset;
    if (A.id !== a.id || !ID_RE.test(a.id)) out.push(`${at}: asset.json id "${A.id}" must be the folder name (a-z, 0-9, dashes)`);
    if (style && !(style.classes || {})[A.class]) out.push(`${at}: class "${A.class}" is not in style.json classes`);
    if (!A.target || !Number.isInteger(A.target.w) || !Number.isInteger(A.target.h)) out.push(`${at}: target needs whole w and h`);
    if (!(A.k > 0)) out.push(`${at}: k (units per sprite pixel) is missing`);
    if (A.char) { if (seenChars.has(A.char)) out.push(`${at}: map character "${A.char}" is also used by ${seenChars.get(A.char)}`); seenChars.set(A.char, a.id); }
    const nums = new Set(a.versions.map(v => v.n));
    for (const v of a.versions) {
      const vt = `${at}/${v.n}`, M = v.meta;
      if (!M) { out.push(`${vt}: meta.json is missing`); continue; }
      if (M.version !== v.n) out.push(`${vt}: meta.json version is "${M.version}"`);
      if (!STATUSES.includes(M.status)) out.push(`${vt}: status "${M.status}" is not one of ${STATUSES.join(', ')}`);
      if (!KINDS.includes(M.kind)) out.push(`${vt}: kind "${M.kind}" is not one of ${KINDS.join(', ')}`);
      if (M.parent != null && !nums.has(M.parent)) out.push(`${vt}: parent ${M.parent} does not exist`);
      for (const f of ['sprite.png', 'normals.png', 'preview.png']) if (!existsSync(join(v.dir, f))) out.push(`${vt}: ${f} is missing`);
      // the glowing pixels (engine/10_sprite.js, `emit`): meta.emit lists the sprite's colours that glow, emit.png is a mask the size of the sprite
      if (M.emit !== undefined && !(Array.isArray(M.emit) && M.emit.length && M.emit.every(c => HEX.test(c)))) out.push(`${vt}: meta.json emit is a list of the colours that glow, ["#rrggbb", ...]`);
      if (existsSync(join(v.dir, 'emit.png')) && existsSync(join(v.dir, 'sprite.png'))) {
        const e = decodePNG(readFileSync(join(v.dir, 'emit.png'))), s = decodePNG(readFileSync(join(v.dir, 'sprite.png')));
        if (e.width !== s.width || e.height !== s.height) out.push(`${vt}: emit.png is ${e.width} x ${e.height}, the sprite ${s.width} x ${s.height}`);
      }
      if (existsSync(join(v.dir, 'sprite.png'))) {
        const { width, height } = decodePNG(readFileSync(join(v.dir, 'sprite.png')));
        if (A.emit !== false && M.kind !== 'imported' && (width !== A.target.w || height !== A.target.h)) out.push(`${vt}: sprite is ${width} x ${height}, the target is ${A.target.w} x ${A.target.h}`);
        if (M.kind !== 'imported' && master.size) {
          const sub = M.map && subs[M.map] ? subs[M.map] : master;
          const bad = [...spriteColours(readFileSync(join(v.dir, 'sprite.png')))].filter(c => !sub.has(c));
          if (bad.length) out.push(`${vt}: ${bad.length} colour(s) outside the ${M.map ? `map ${M.map}` : 'master'} palette, e.g. ${bad.slice(0, 3).join(' ')}`);
        }
      }
    }
    if (A.frames !== undefined) {
      const names = Object.keys(A.frames || {});
      if (!names.length) out.push(`${at}: frames is empty (a frame is { "idle": "002" }: its name and the approved version that is its picture)`);
      if (A.live != null) out.push(`${at}: an asset with frames has no live version: each frame points at its own version`);
      for (const [fname, n] of Object.entries(A.frames || {})) {
        const fv = a.versions.find(v => v.n === n);
        if (!FRAME_RE.test(fname)) out.push(`${at}: frame name "${fname}" must be a-z, 0-9 and underscores, starting with a letter`);
        else if (!fv) out.push(`${at}: frame ${fname} points at version ${n}, which does not exist`);
        else if (fv.meta && fv.meta.status !== 'approved') out.push(`${at}: frame ${fname} points at version ${n}, which is ${fv.meta.status}: only an approved version may be a frame`);
      }
      if (A.emit === false) out.push(`${at}: an asset with frames is always emitted (emit: false is for imported single sprites)`);
    }
    if (A.live != null) {
      const live = a.versions.find(v => v.n === A.live);
      if (!live) out.push(`${at}: live version ${A.live} does not exist`);
      else if (live.meta && live.meta.status !== 'approved') out.push(`${at}: live version ${A.live} is ${live.meta.status}, only an approved version may be live`);
    }
  }
  if (pipeline !== null) {
    const p = join(root, 'games', game, 'pipeline.js');
    if (!existsSync(p) || readFileSync(p, 'utf8') !== pipeline) out.push(`${game}: pipeline.js is out of date, run: node tools/art.mjs build ${game}`);
  }
  return out;
}
