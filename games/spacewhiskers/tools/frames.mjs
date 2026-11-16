#!/usr/bin/env node
// Space Whiskers: Pip's drawings from the owner's sprite sheet (ref/frames/pip_*.png, cut by tools/art.py) brought onto the game's grid.
//
//   node games/spacewhiskers/tools/frames.mjs [--dry]
//
// The sheet's grid is the game's (the owner: "I want that to be the scale of the whole game"): one art pixel of the sheet, about
// PIXEL picture pixels, is one game pixel. Every drawing is snapped at that one pixel size (so no frame comes out bigger or smaller
// than another), a palette is curated from all of them together (art/style/palette.json), each is snapped again on it, and all are put on
// one canvas, stray pixels of the cut taken off its edges: the feet on its bottom row and the helmet over the idle frame's helmet, the way an animator registers drawings. Then they
// become versions of the asset `pip` (kind "imported": the owner's own art) and its frames, in the sheet's order. Run it once; it refuses
// to add a second set (delete art/assets/pip to start again).
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snap } from '../../../tools/snap.mjs';
import { fromPNG, toPNG, blank, crop, bbox, binarize, cleanEdges } from '../../../tools/art/image.mjs';
import { curate, histogram, nearest, rgbOf } from '../../../tools/art/palette.mjs';
import { frameStats } from '../../../tools/art/animcheck.mjs';
import { writeJSON, readJSON } from '../../../tools/art/lib.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..'), ROOT = join(GAME, '..', '..');
export const PIXEL = 2.86;            // picture pixels per art pixel on pip.png (the Pixel Snapper finds 2.85 on the idle frame)
const COLORS = 32;
// frame name in the asset ← drawing in ref/frames (the slide's dust is a separate effect, not a frame of Pip)
const FRAMES = [['idle', 'pip_idle'], ['walk1', 'pip_walk1'], ['walk2', 'pip_walk2'], ['walk3', 'pip_walk3'], ['walk4', 'pip_walk4'],
  ['run1', 'pip_run1'], ['run2', 'pip_run2'], ['run3', 'pip_run3'], ['run4', 'pip_run4'], ['slide', 'pip_slide'], ['crouch', 'pip_crouch'],
  ['jump', 'pip_jump'], ['wall_slide', 'pip_wall_slide']];

const snapAt = async (png, palette) => {
  const out = binarize(fromPNG(await snap(png, { pixelSize: PIXEL, ...(palette ? { palette: palette.map(h => h.slice(1)).join(',') } : { colors: 64 }) })));
  const b = bbox(out); return crop(out, b.x, b.y, b.w, b.h);
};
const onPalette = (im, pal) => { for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) im.data.set(rgbOf(nearest(pal, [im.data[i], im.data[i + 1], im.data[i + 2]])), i); return im; };

async function main() {
  const dry = process.argv.includes('--dry');
  if (!dry && existsSync(join(GAME, 'art', 'assets', 'pip'))) { console.error('art/assets/pip exists already: delete it to bring the frames in again'); process.exit(1); }
  const src = Object.fromEntries(FRAMES.map(([n, f]) => [n, readFileSync(join(GAME, 'ref', 'frames', `${f}.png`))]));
  // 1. one palette for all of Pip, from all his drawings snapped at the game's pixel size
  const first = {}; for (const [n] of FRAMES) first[n] = await snapAt(src[n], null);
  const counts = new Map(); for (const im of Object.values(first)) for (const [c, k] of histogram(im.data)) counts.set(c, (counts.get(c) || 0) + k);
  const palette = curate(counts, COLORS);
  // 2. every drawing on that palette, then registered: feet on the bottom row, helmet over the idle frame's helmet
  // the cut leaves light grey blends of the sheet's checkerboard outside the outline: they go (cleanEdges), then the frame is trimmed again
  const snapped = {};
  for (const [n] of FRAMES) { const im = onPalette(await snapAt(src[n], palette), palette); cleanEdges(im); const b = bbox(im); snapped[n] = crop(im, b.x, b.y, b.w, b.h); }
  const st = Object.fromEntries(Object.entries(snapped).map(([n, im]) => [n, frameStats(im)]));
  const headX = st.idle.head.x, left = Math.max(...FRAMES.map(([n]) => Math.round(headX - st[n].head.x) < 0 ? -Math.round(headX - st[n].head.x) : 0));
  const place = n => ({ dx: Math.round(headX - st[n].head.x) + left, dy: 0 });
  const W = Math.max(...FRAMES.map(([n]) => place(n).dx + snapped[n].width)), H = Math.max(...FRAMES.map(([n]) => snapped[n].height));
  const out = {};
  for (const [n] of FRAMES) {
    const im = snapped[n], c = blank(W, H), { dx } = place(n), oy = H - im.height;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) { const o = (y * im.width + x) * 4; if (im.data[o + 3]) c.data.set(im.data.subarray(o, o + 4), ((y + oy) * W + x + dx) * 4); }
    out[n] = c;
  }
  console.log(`${FRAMES.length} frames on a ${W} x ${H} canvas, ${palette.length} colours; idle is ${st.idle.width} x ${st.idle.height}`);
  for (const [n] of FRAMES) console.log(`  ${n.padEnd(11)} ${snapped[n].width} x ${snapped[n].height}`);
  if (dry) return;
  // 3. the palette, and the frames as versions of the asset pip, approved as its frames
  writeJSON(join(GAME, 'art', 'style', 'palette.json'), { format: 'pixelite-palette', source: `${palette.length} colours of Pip's drawings on ref/pip.png, snapped at ${PIXEL} picture pixels per art pixel and curated together (games/spacewhiskers/tools/frames.mjs)`, colors: palette });
  const tmp = mkdtempSync(join(tmpdir(), 'sw-frames-')), art = (...a) => { const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art.mjs'), ...a], { encoding: 'utf8', cwd: ROOT }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
  FRAMES.forEach(([n, f], i) => {
    const p = join(tmp, `${n}.png`); writeFileSync(p, toPNG(out[n]));
    const asset = i === 0 ? ['--class', 'character', '--target', `${W}x${H}`, '--k', '.5', '--place', 'floor', '--name', 'Pip'] : [];
    console.log(art('add', 'spacewhiskers', 'pip', '--sprite', p, '--kind', 'imported', '--note', `ref/frames/${f}.png on the game grid (tools/frames.mjs)`, ...asset));
    const v = String(i + 1).padStart(3, '0'); console.log(art('promote', 'spacewhiskers', 'pip', v, '--frame', n));
  });
}
main().catch(e => { console.error(e.message); process.exit(1); });
