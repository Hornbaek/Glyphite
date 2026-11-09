#!/usr/bin/env python3
"""A game's picture at its own pixel size: one image pixel per world cell (what a player's eye gets, without the browser's scaling).
For the art pipeline's style sheet (docs/ART_PIPELINE.md): hero, props, environment and mood references are crops of this.

  python3 tools/art_capture.py <game> --out frame.png [--crop x,y,w,h] [--steps 30] [--keys ArrowRight] [--res 2] [--level N]
    --crop   a window of the picture, in cells (default: all of it)
    --steps  frames to run after the game starts (Pixelite.test.step), with --keys held
    --level  for a game with level maps (GAME.levels.play): start that one
  python3 tools/art_capture.py <game> --out hero.png --sprite "MOUSE_SPR.idle" [--gap 2] [--res 2]
    --sprite a JavaScript expression for a sprite (or a list of them, laid out in a row): the game's own sampling of it into
             cells (spriteBox + sprCells, as drawSprite does), unlit, on a transparent background, at the detail level --res
Needs: pip install playwright pillow numpy (the same as tests/smoke.py), and a built game (npm run build).
"""
import argparse, sys
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(); ap.add_argument('game'); ap.add_argument('--out', required=True); ap.add_argument('--crop')
ap.add_argument('--steps', type=int, default=30); ap.add_argument('--keys', default=''); ap.add_argument('--res', type=float); ap.add_argument('--level', type=int)
ap.add_argument('--sprite'); ap.add_argument('--gap', type=int, default=2)
a = ap.parse_args()
page_file = ROOT / 'dist' / 'games' / a.game / 'index.html'
if not page_file.exists(): sys.exit(f'{page_file} is not built: npm run build')

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(page_file.as_uri() + '#2d'); pg.wait_for_function('typeof Pixelite !== "undefined" && Pixelite.test'); pg.wait_for_timeout(600)
    # the grid under the picture: where the first whole cell starts (the engine scrolls the picture by a fraction of a cell)
    pg.evaluate("""() => { const o = presentFrame; window.__off = [0, 0]; presentFrame = function (fx, fy, t) { o(fx, fy, t); window.__off = [Math.round(-(1 + fx) * R.cw), Math.round(-(1 + fy) * R.chh)]; }; }""")
    if a.res: pg.evaluate(f'setRes && setRes({a.res})')
    if a.sprite:   # the sprite(s) as the game's cells: no scene, a transparent background
        cells = pg.evaluate('''(expr) => {
          const want = eval(expr), list = Array.isArray(want) ? want : [want], out = [];
          for (const spr of list) {
            const [bx, by, x0, y0, x1, y1] = spriteBox(spr, 0, 0, {}), got = new Map();
            sprCells(spr, bx, by, x0, y0, x1, y1, 0, _sprNoShift, 1, false, (cx, cy, g, r, gg, b) => got.set(cx + ',' + cy, [r, gg, b].map(q => Math.round(255 * (1 - Math.exp(-1.7 * q))))));
            out.push([...got].map(([k, c]) => [...k.split(',').map(Number), ...c]));
          }
          return out; }''', a.sprite)
        b.close()
        boxes = []
        for sp in cells:
            if not sp: sys.exit('that sprite makes no cells at this detail level')
            xs_, ys_ = [c[0] for c in sp], [c[1] for c in sp]; boxes.append((min(xs_), min(ys_), max(xs_) - min(xs_) + 1, max(ys_) - min(ys_) + 1))
        W = sum(w for _, _, w, _ in boxes) + a.gap * (len(boxes) - 1); H = max(h for *_, h in boxes)
        img = np.zeros((H, W, 4), np.uint8); x0 = 0
        for sp, (bx, by, w, h) in zip(cells, boxes):
            for cx, cy, r, g, bl in sp: img[H - h + cy - by, x0 + cx - bx] = (r, g, bl, 255)   # feet (the bottom) on a common line
            x0 += w + a.gap
        Image.fromarray(img, 'RGBA').save(a.out); print(f'{a.out}: {W} x {H} cells, {len(cells)} sprite(s)'); sys.exit(0)
    pg.evaluate('Pixelite.test.start()')
    if a.level is not None: pg.evaluate(f'GAME.levels && GAME.levels.play({a.level})')
    keys = [k for k in a.keys.split(',') if k]
    pg.evaluate(f'Pixelite.test.step({a.steps}, {keys!r})')
    pg.evaluate('Pixelite.test.freeze()'); pg.wait_for_timeout(500)
    info = pg.evaluate('({ cw: R.cw, ch: R.chh, off: window.__off, w: R.canvas.width, h: R.canvas.height, res: RES })')
    pg.locator('canvas').first.screenshot(path='/tmp/_art_capture.png'); b.close()
if errs: sys.exit(f'page errors: {errs}')
im = np.asarray(Image.open('/tmp/_art_capture.png').convert('RGB'))
cw, ch = info['cw'], info['ch']; ox, oy = info['off'][0] % cw, info['off'][1] % ch
sx, sy = im.shape[1] / info['w'], im.shape[0] / info['h']          # the screenshot may differ from the canvas size by a scale
cols, rows = int((info['w'] - ox) // cw), int((info['h'] - oy) // ch)
ys = (oy + ch * (np.arange(rows) + .5)) * sy; xs = (ox + cw * (np.arange(cols) + .5)) * sx   # the middle of every cell
cells = im[np.clip(ys.astype(int), 0, im.shape[0] - 1)][:, np.clip(xs.astype(int), 0, im.shape[1] - 1)]
if a.crop:
    x, y, w, h = [int(v) for v in a.crop.split(',')]; cells = cells[y:y + h, x:x + w]
Image.fromarray(cells).save(a.out)
print(f'{a.out}: {cells.shape[1]} x {cells.shape[0]} cells (the picture is {cols} x {rows}; a cell is {cw} px; detail {info["res"]})')
