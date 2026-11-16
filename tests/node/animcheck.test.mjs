// The animation checks (tools/art/animcheck.mjs) on frames drawn here with known faults: a frame that grows, one that sinks
// below the ground, one off the palette, one that jumps, one cut off by the canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank } from '../../tools/art/image.mjs';
import { decodePNG } from '../../tools/png.mjs';
import { frameStats, checkAnimation, histDistance, frameDiff } from '../../tools/art/animcheck.mjs';

const PAL = ['#202020', '#c04030', '#f0d060'];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// a 20 x 24 canvas with a body (w x h, colour) standing on row `foot`, its left edge at x, and a head block on top
function figure({ x = 6, w = 8, h = 16, foot = 23, body = PAL[1], head = PAL[2] } = {}) {
  const im = blank(20, 24), put = (px, py, c) => { if (px >= 0 && py >= 0 && px < 20 && py < 24) im.data.set([...rgb(c), 255], (py * 20 + px) * 4); };
  for (let y = foot - h + 1; y <= foot; y++) for (let xx = x; xx < x + w; xx++) put(xx, y, y < foot - h + 5 ? head : body);
  return im;
}

test('the stats of one frame: box, feet, head, palette', () => {
  const s = frameStats(figure(), { palette: PAL });
  assert.deepEqual(s.box, { x: 6, y: 8, w: 8, h: 16 });
  assert.equal(s.foot, 23); assert.equal(s.offPalette, 0); assert.equal(s.colours, 2); assert.equal(s.clipped, false);
  assert.equal(s.head.x, 9.5);
  assert.ok(frameStats(blank(4, 4)).empty);
  assert.equal(frameStats(figure({ x: 0 })).clipped, true, 'touching the left edge is clipped');
});

test('a steady sequence passes; each kind of fault is named with its frame', () => {
  const anchor = figure(), good = [figure(), figure({ h: 15 }), figure(), figure({ h: 15 })];
  const ok = checkAnimation(good, { palette: PAL, anchor });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.heightRange, 1); assert.equal(ok.footRange, 0);

  const bad = [figure(), figure({ h: 21 }), figure({ foot: 20 }), figure({ body: '#00ff00' }), figure({ x: 0 })];
  const r = checkAnimation(bad, { palette: PAL, anchor });
  const has = re => assert.ok(r.warnings.some(w => re.test(w)), `no warning like ${re}: ${r.warnings.join(' | ')}`);
  has(/frame 1: 21 pixels tall, the anchor 16/);
  has(/frame 2: feet on row 20, the ground is row 23/);
  has(/frame 3: \d+% of its pixels are off the palette/);
  has(/frame 3: its colours drift/);
  has(/frame 4: touches the edge/);
  has(/the height changes by/);
  has(/the head jumps/);
});

test('differences between frames, and the loop seam', () => {
  const a = figure(), b = figure({ x: 7 });
  assert.equal(frameDiff(a, a), 0);
  assert.ok(frameDiff(a, b) > 0 && frameDiff(a, b) < 1);
  assert.equal(histDistance(frameStats(a).hist, frameStats(a).hist), 0);
  assert.equal(histDistance(frameStats(a).hist, frameStats(figure({ body: '#000001', head: '#000002' })).hist), 1);
  const r = checkAnimation([a, figure({ x: 7 }), figure({ x: 8 }), figure({ x: 9 })], { loop: true });
  assert.ok(r.seam > r.steps[0], 'jumping back three pixels at the seam is bigger than a one-pixel step');
  assert.equal(checkAnimation([a, b], { loop: false }).seam, null);
});

test("Pip's approved frames: same ground, small height change", () => {
  const f = n => decodePNG(readFileSync(new URL(`../../games/spacemouse/art/assets/pip/${n}/sprite.png`, import.meta.url)));
  const pal = JSON.parse(readFileSync(new URL('../../games/spacemouse/art/style/palette.json', import.meta.url), 'utf8')).colors;
  const r = checkAnimation([f('002'), f('004'), f('005')], { palette: pal, anchor: f('002') });
  assert.equal(r.footRange, 0, 'all three stand on the same row');
  assert.ok(r.frames.every(s => s.offPalette === 0), 'all on the master palette');
  assert.ok(r.heightRange <= 2);
});
