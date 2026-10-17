#!/usr/bin/env python3
"""Fjordheim: every building (and a building site, a ripe field, the knarr sailing and moored) drawn alone on a cleared
meadow, its footprint outlined in yellow, zoomed: a contact sheet in shots/fj_buildings.png. Look at it after changing
art, sizes or anchors (art.js: onFoot): each drawing must stand on its outline, its long side along the footprint's.
  python3 games/fjordheim/tests/buildings.py [renderer]      (needs the build: node tools/glyphite.mjs build fjordheim)"""
import sys, io
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
PAGE = (ROOT / 'dist/games/fjordheim/index.html').as_uri()
r = sys.argv[1] if len(sys.argv) > 1 else 'gl'
SHOWN = ['longhouse', 'woodcutter', 'fishing', 'sawpit', 'rack', 'stabbur', 'well', 'smithy', 'field', 'site', 'ship_sail', 'ship_moored']
crops = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{PAGE}#{r}'); pg.wait_for_function('window.Glyphite && Glyphite.test', timeout=20000)
    pg.evaluate('Glyphite.test.start(); Glyphite.test.freeze()')
    # the footprints' outlines, drawn over everything
    pg.evaluate('(() => { const og = GAME.draw; GAME.draw = t => { og(t); for (const b of HOME.buildings) isoOutline(b.i, b.j, b.w, b.h, [1.6, 1.2, .3]); }; })()')
    for t in SHOWN:
        pg.evaluate('''(t => { HOME.tod = .35; HOME.stock = { wood: 99, planks: 99, stone: 99, food: 99 }; HOME.buildings = []; HOME.ship = null; FOLK = []; ANIMALS = [];
          const L = LANDING, ci = L[0], cj = L[1] - 7;
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = tidx(i, j); if (thing[k]) { thing[k] = 0; ref[k] = -1; } }
          paintGround(0);
          if (t.startsWith('ship')) {
            sendShip();
            if (t === 'ship_moored') Object.assign(HOME.ship, { u: L[0] + .5, v: shipLane(L[0]), phase: 'moored', landed: true });
            else Object.assign(HOME.ship, { u: L[0] + 6, v: shipLane(L[0] + 6) });
            centreOn([HOME.ship.u - 1, HOME.ship.v - 3, 2, 2]);
          } else {
            const type = t === 'site' ? 'longhouse' : t, o = placeBuilding(type, ci, cj);
            if (t !== 'site') finishBuilding(o);
            if (t === 'field') { o.stage = 3; isoPaintFoot(o); }
            centreOn([ci, cj - 1, BUILDINGS[type].w, BUILDINGS[type].h]);
          }
          Glyphite.test.step(1); toastMsg = null; Glyphite.test.render(); })''', t)
        crops.append((t, Image.open(io.BytesIO(pg.screenshot(clip={'x': 440, 'y': 200, 'width': 400, 'height': 300})))))
    b.close()
w, h = crops[0][1].size; cols = 4
sheet = Image.new('RGB', (cols * w, ((len(crops) + cols - 1) // cols) * (h + 24)), (30, 30, 30)); d = ImageDraw.Draw(sheet)
for k, (t, im) in enumerate(crops):
    x, y = (k % cols) * w, (k // cols) * (h + 24); sheet.paste(im, (x, y + 24)); d.text((x + 8, y + 6), t, fill=(255, 220, 0))
out = ROOT / 'shots/fj_buildings.png'; out.parent.mkdir(exist_ok=True); sheet.save(out)
print('wrote', out, '| errors:', errs[:3])
sys.exit(1 if errs else 0)
