'use strict';
// ===================== GAME · sprites: sizes, origins and animations =====================
// FJ_ART (sprites.js, made by tools/art.py from the owner's sheets) holds every drawing; here each becomes an engine sprite
// with its size in the world. Buildings and fields are sized by their footprint (the drawing's width becomes the footprint
// diamond's width, (a + b) tiles × TILE / 2) and stand with the lowest point of the drawing, its base's front corner, on the
// footprint's front corner; a drawing whose long side runs the other way from the footprint's is mirrored. People, animals
// and trees are sized by height and stand on their feet (the drawing's foot row). Walking characters have frames facing the
// viewer ("se") and facing away ("ne"); the engine's flip gives the two other directions.
const FJ = {};
// the drawings' colours lifted a little (a gamma of .8): a glyph inks only part of its cell, so the art's dark browns would
// read darker on screen than on the sheet
const lift = ([r, g, b, ink, glyph]) => [...[r, g, b].map(v => Math.round(255 * (v / 255) ** .8)), ink, glyph];
function fjSprite(name, o) {
  const a = FJ_ART[name], k = o.height ? o.height / a.foot : o.width / a.w;
  return defineSprite({ ...a, pal: a.pal.map(lift) }, { k, ox: a.w / 2, oy: o.oy ?? a.foot });
}
// heights in base units (a tile is TILE = 8 wide and 4 tall on screen)
const HEIGHT = { adult: 6.5, child: 4.5, sheep: 3.2, deer: 6.4, raven: 2, pine: 17, birch: 14, sapling: 4, stump: 2.4, rock: 2.2, boulders: 5, bush: 2.8 };
const BUILD_ART = {   // building → its drawing
  longhouse: 'longhouse', woodcutter: 'woodcutter', sawpit: 'sawpit', fishing: 'fishing_hut', rack: 'drying_rack',
  stabbur: 'stabbur', well: 'well', smithy: 'smithy'
};
function makeArt() {
  const frames = (prefix, n, h) => Array.from({ length: n }, (_, i) => fjSprite(`${prefix}_${i + 1}`, { height: h }));
  FJ.father = { stand: fjSprite('father_stand', { height: HEIGHT.adult }), se: frames('father_se', 3, HEIGHT.adult), ne: frames('father_ne', 3, HEIGHT.adult),
    chop: fjSprite('father_chop', { height: HEIGHT.adult * 1.06 }), logSe: frames('father_log_se', 2, HEIGHT.adult), logNe: frames('father_log_ne', 2, HEIGHT.adult) };
  FJ.mother = { stand: fjSprite('mother_stand', { height: HEIGHT.adult }), se: frames('mother_se', 4, HEIGHT.adult), ne: frames('mother_ne', 4, HEIGHT.adult),
    reap: frames('mother_reap', 2, HEIGHT.adult), basketSe: frames('mother_basket_se', 2, HEIGHT.adult), basketNe: [fjSprite('mother_basket_ne', { height: HEIGHT.adult })] };
  FJ.child = { se: frames('child_se', 2, HEIGHT.child), ne: frames('child_ne', 2, HEIGHT.child) };
  FJ.child.stand = FJ.child.se[0];
  FJ.sheep = { se: frames('sheep_se', 2, HEIGHT.sheep), ne: frames('sheep_ne', 2, HEIGHT.sheep) };
  FJ.deer = { se: frames('deer_se', 2, HEIGHT.deer), ne: frames('deer_ne', 2, HEIGHT.deer) };
  FJ.raven = frames('raven', 2, HEIGHT.raven);
  FJ.pine = fjSprite('pine', { height: HEIGHT.pine });
  FJ.birch = ['birch_summer', 'birch_summer', 'birch_autumn', 'birch_winter'].map(n => fjSprite(n, { height: HEIGHT.birch }));
  FJ.sapling = fjSprite('sapling', { height: HEIGHT.sapling });
  FJ.stump = fjSprite('stump', { height: HEIGHT.stump });
  FJ.rock = fjSprite('rock', { height: HEIGHT.rock });
  FJ.boulders = fjSprite('boulders', { height: HEIGHT.boulders });
  FJ.bush = fjSprite('lingonberry', { height: HEIGHT.bush });
  FJ.knarr = fjSprite('knarr', { width: 24 });
  FJ.rowboat = fjSprite('rowboat', { width: 11 });
  FJ.goods = Object.fromEntries(['logs', 'planks', 'stones', 'grain', 'fish'].map(n => [n, fjSprite(`goods_${n}`, { width: n === 'grain' || n === 'fish' ? 2.8 : 4 })]));
  // buildings and fields: as wide as their footprint's diamond, standing on its front corner ({ spr, flip })
  FJ.build = {}; FJ.site = {};
  for (const [b, art] of Object.entries(BUILD_ART)) { FJ.build[b] = onFoot(art, BUILDINGS[b], 1.08); FJ.site[b] = onFoot('building_site', BUILDINGS[b], .95); }
  FJ.field = [0, 1, 2, 3, 4].map(s => onFoot(`field_${s}`, BUILDINGS.field, 1.02));
}
const footWidth = b => (b.w + b.h) * TILE / 2;
// the drawing's lowest point, the front corner of what it stands on: [column, row below it] (the middle of the lowest
// painted pixels, from the bottom two rows so a lone pixel does not decide it)
function frontCorner(a) {
  let bottom = a.h; while (bottom > 0 && !/[^.]/.test(a.rows[bottom - 1])) bottom--;
  let n = 0, sum = 0;
  for (const r of [bottom - 1, bottom - 2]) if (r >= 0) for (let c = 0; c < a.w; c++) if (a.rows[r][c] !== '.') { n++; sum += c; }
  return [n ? sum / n + .5 : a.w / 2, bottom];
}
// a footprint a tiles along i (down-right on screen) and b along j (down-left) has its front corner a / (a + b) of the way
// across; mirror the drawing when its own front corner sits nearer b / (a + b)
function onFoot(name, b, scale) {
  const a = FJ_ART[name], [fx, fy] = frontCorner(a), f = fx / a.w, want = b.w / (b.w + b.h);
  return { spr: defineSprite({ ...a, pal: a.pal.map(lift) }, { k: footWidth(b) * scale / a.w, ox: fx, oy: fy }), flip: Math.abs(1 - f - want) < Math.abs(f - want) };
}

// a walking character's frame and flip for a screen direction (dx, dy in world units) and a walk phase (0..1 per stride)
function walkFrame(set, dx, dy, phase, moving, se = set.se, ne = set.ne) {
  const away = dy < -.01, list = away ? ne : se;
  return { spr: moving ? list[Math.floor(phase * list.length) % list.length] : (away ? ne[0] : set.stand || se[0]), flip: dx < -.01 };
}
