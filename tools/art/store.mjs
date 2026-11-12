// One version's files on disk (docs/ART_PIPELINE.md): shared by the CLI (tools/art.mjs) and the generation loop (make.mjs).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, artDir, writeJSON, loadAssets, nextVersion } from './lib.mjs';
import { spriteFromPNG, normalRows, normalsPNG, contactSheet } from './sprite.mjs';
import { decodePNG } from '../png.mjs';

export const NORMAL_OPTS = { bevel: 3, detail: .8, strength: 2.5 };   // the generator's defaults (tools/normalmap.mjs)

// the files of one version: sprite.png in, normals.png and preview.png made (raw.png kept if given)
export function writeVersion(game, id, { sprite, raw = null, meta, asset = null, root = ROOT, emitMask = null }) {
  const adir = join(artDir(game, root), 'assets', id);
  mkdirSync(adir, { recursive: true });
  if (asset) writeJSON(join(adir, 'asset.json'), asset);
  const cur = loadAssets(game, root).find(a => a.id === id), n = meta.version || (cur ? nextVersion(cur) : '001');
  const vdir = join(adir, n); mkdirSync(vdir, { recursive: true });
  const spr = spriteFromPNG(sprite), normals = normalRows(spr, meta.normals || NORMAL_OPTS);
  writeFileSync(join(vdir, 'sprite.png'), sprite);
  writeFileSync(join(vdir, 'normals.png'), normalsPNG(spr, normals));
  if (raw) writeFileSync(join(vdir, 'raw.png'), raw);
  if (emitMask) writeFileSync(join(vdir, 'emit.png'), emitMask);   // the glowing pixels (engine/10_sprite.js, `emit`), when a mask says which
  writeFileSync(join(vdir, 'preview.png'), contactSheet(spr, normals, { raw: raw ? decodePNG(raw) : null }));
  writeJSON(join(vdir, 'meta.json'), { version: n, parent: null, status: 'draft', kind: 'hand', brief: '', prompt: '', refs: [], api: null, source: null,
    snap: null, normals: NORMAL_OPTS, target: null, note: '', created: new Date().toISOString(), by: 'claude-session', ...meta, version: n });
  return n;
}

