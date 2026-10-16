// ===================== GAME · pixel art: Pip the space mouse, cheese and the cat-bots =====================
// Engine sprite format (engine/10_sprite.js): '.' is empty, every other character indexes pal; pal entries are
// [r, g, b, ink (0 = outline), dense glyph]. All face right; drawSprite's flip turns them round.
// The mouse comes from the owner's art sheet (ref/art_sheet.png) through tools/art.py, which writes mouse_sprite.js: six
// frames (idle, walk, run, jump, look up, look down) sharing one palette, each with its origin at the feet under the helmet.
const MOUSE_K = .25;   // base units per sprite pixel: about 7 units tall, the helmet a little above the mouse's box
const MOUSE_SPR = {};
for (const k in MOUSE_FRAMES) { const f = MOUSE_FRAMES[k]; MOUSE_SPR[k] = defineSprite({ w: f.w, h: f.h, pal: MOUSE_PAL, rows: f.rows }, { k: MOUSE_K, ox: f.ox, oy: f.oy }); }
// props from the same sheet: they stand on the floor of their tile, or hang on the wall in its middle
const PROP_SPR = {};
for (const ch in PROP_ART) { const p = PROP_ART[ch]; PROP_SPR[ch] = defineSprite(p, { k: p.k, ox: p.w / 2, oy: p.place === 'floor' ? p.h : p.h / 2 }); }
// a crumb of cheese, from the same sheet
const CHEESE_SPR = defineSprite(SPRITE_CHEESE, { k: .13, ox: SPRITE_CHEESE.w / 2, oy: SPRITE_CHEESE.h / 2 });

// The cat-bot: a boxy security robot with pointed ears, two red eyes and an antenna tail.
const CAT_PAL = [[16, 18, 24, 0, '#'], [150, 156, 168, 1, '#'], [96, 100, 112, 1, '#'], [255, 70, 50, 1, '@'], [60, 62, 72, 0, '#'], [70, 72, 82, 1, 'o'], [255, 190, 60, 1, '*']];
const CAT_ROWS = [
  '6...........1.....1.',
  '.2.........111...111',
  '.2.........111111111',
  '..2........113111311',
  '..2........111111111',
  '...2.......111444111',
  '...211111111111111..',
  '....11111111111111..',
  '....11112222221111..',
  '....11111111111111..',
  '.....55...55..55.55.',
  '.....55...55..55.55.'
];
const CAT_K = .45;
const CAT_SPR = defineSprite({ w: 20, h: 12, pal: CAT_PAL, rows: CAT_ROWS }, { k: CAT_K, ox: 11, oy: 12 });
