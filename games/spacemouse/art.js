// ===================== GAME · pixel art: Pip the space mouse and the cat-bots =====================
// Engine sprite format (engine/10_sprite.js): '.' is empty, every other character indexes pal; pal entries are
// [r, g, b, ink (0 = outline), dense glyph]. Both face right; drawSprite's flip turns them round.
// The mouse: a glass helmet with the ears inside, a white suit, an orange air tank and a long pink tail.
const MOUSE_PAL = [[18, 20, 28, 0, '#'], [226, 230, 238, 1, '#'], [120, 205, 255, 1, 'O'], [176, 164, 164, 1, '@'], [255, 140, 172, 1, '*'],
  [12, 12, 16, 0, '#'], [100, 104, 122, 1, '#'], [244, 146, 44, 1, '%'], [255, 255, 255, 1, '@']];
const MOUSE_TOP = [
  '.....22222......',
  '...22.....22....',
  '..2..4...4..2...',
  '..2.343.343.2...',
  '.2..33333333.2..',
  '.2.333335333.82.',
  '.2..3333333344..',
  '..2..333333..2..',
  '...222222222....',
  '.77.111111111...',
  '.77.1111111166..',
  '.77.11111111....'
];
// the last three rows (legs, boots, tail) change with what the mouse is doing
const MOUSE_LEGS = {
  stand: ['4...11111111....', '.4..11....11....', '..44.66...66....'],
  run1: ['4...11111111....', '.4.11......11...', '..466.......66..'],
  run2: ['4...11111111....', '.4...11..11.....', '..44..66.66.....'],
  run3: ['4...11111111....', '.4..11....11....', '..4.66.....66...'],
  jump: ['.4..11111111....', '4....11..11.....', '.....66..66.....'],
  fall: ['44..11111111....', '...11......11...', '..66........66..']
};
const MOUSE_K = .42;   // base units per pixel: 6.7 x 6.3 units, a little bigger than the mouse's box
const MOUSE_SPR = {};
for (const k in MOUSE_LEGS) MOUSE_SPR[k] = defineSprite({ w: 16, h: 15, pal: MOUSE_PAL, rows: MOUSE_TOP.concat(MOUSE_LEGS[k]) }, { k: MOUSE_K, ox: 8, oy: 15 });

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
