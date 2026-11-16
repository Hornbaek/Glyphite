#!/usr/bin/env node
// Space Whiskers: Pip's approved animations into the art pipeline, as frames of the asset `pip` that the game plays.
//
//   node games/spacewhiskers/tools/anims.mjs [walk run idle jump]
//
// For each animation (art/anims/pip-<name>.json) whose rig the owner approved ("rigApproved": true), the frames PixelLab drew from it
// (art/bakeoff/pip-<name>/pixellab-skeleton/f0.png ...) become versions of `pip` and its frames <name>_0, <name>_1, ... in order. A frame
// whose picture is already the asset's frame is left alone, so running it again after a new drawing only adds what changed. Then
// node tools/art.mjs build spacewhiskers writes pipeline.js.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJSON, loadAssets } from '../../../tools/art/lib.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..'), ROOT = join(GAME, '..', '..');
const art = (...a) => { const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art.mjs'), ...a], { encoding: 'utf8', cwd: ROOT }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['walk', 'run', 'idle', 'jump'];

for (const name of names) {
  const A = readJSON(join(GAME, 'art', 'anims', `pip-${name}.json`)), dir = join(GAME, 'art', 'bakeoff', `pip-${name}`, 'pixellab-skeleton');
  if (!A.rigApproved) { console.log(`${name}: its rig is not approved yet (art/anims/pip-${name}.json): skipped`); continue; }
  const n = A.anim.frames;
  for (let i = 0; i < n; i++) {
    const src = join(dir, `f${i}.png`), frame = `${name}_${i}`;
    if (!existsSync(src)) throw new Error(`${name}: ${src} is missing (draw it: node tools/art/bakeoff.mjs spacewhiskers pip-${name} --methods pixellab-skeleton)`);
    const pip = loadAssets('spacewhiskers', ROOT).find(a => a.id === 'pip'), cur = pip.asset.frames[frame];
    if (cur && readFileSync(join(pip.dir, cur, 'sprite.png')).equals(readFileSync(src))) continue;
    const out = art('add', 'spacewhiskers', 'pip', '--sprite', src, '--kind', 'generated', '--note', `PixelLab, from the approved rig of art/anims/pip-${name}.json, frame ${i} (art/bakeoff/pip-${name}/pixellab-skeleton/f${i}.png)`);
    const v = /pip\/(\d{3})/.exec(out)[1];
    console.log(art('promote', 'spacewhiskers', 'pip', v, '--frame', frame).split(';')[0]);
  }
}
console.log(art('build', 'spacewhiskers').split('\n')[0]);
