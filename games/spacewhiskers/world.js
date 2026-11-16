'use strict';
// ===================== GAME · the world: materials, the shipyard map, small sprites =====================
// A corner of the Whiskerworks shipyard (ref/levelinspiration.png), as a text map the engine's loadTileMap builds. A tile is 4 base
// units: 8 game pixels at the game's detail (RES 2, where one cell is one pixel of Pip's art). Pip is 49 pixels tall, about six tiles;
// the 480 x 270 screen is 60 x 34 tiles. The map is 180 x 40 tiles: four screens of shipyard.
const PX = RES / 2;   // one game pixel (a pixel of the sprite sheet) in cells; 1 at the game's detail level

// The materials paint fixed palettes (dark to bright), the way the sprite sheet does: SNES colours, not a lit gradient
const pal = (...c) => c;
const HULL = defineMaterial('hull plating', { albedo: [.36, .4, .5], palette: pal([24, 28, 42], [40, 48, 66], [62, 72, 94], [92, 104, 128], [128, 142, 166]), tough: 99, anchor: true, brittle: false, style: 'deck' });
const DECK = defineMaterial('deck', { albedo: [.5, .54, .62], palette: pal([38, 44, 60], [66, 76, 98], [106, 118, 142], [152, 164, 184]), tough: 99, anchor: true, brittle: false, style: 'deck' });
const CATWALK = defineMaterial('catwalk', { albedo: [.8, .5, .16], palette: pal([108, 56, 18], [172, 102, 30], [222, 156, 50], [248, 204, 94]), tough: 99, anchor: true, brittle: false, oneWay: true, style: 'terrain' });
const CRATE = defineMaterial('cargo crate', { albedo: [.7, .38, .14], palette: pal([88, 40, 16], [150, 74, 26], [200, 114, 40], [234, 158, 70]), tough: 99, anchor: true, brittle: false, style: 'terrain' });
// the back wall (never solid): panels, a rib every few rows, the scaffold's uprights, the frame round the big window
const PANEL = defineMaterial('wall panel', { albedo: [.22, .26, .36], palette: pal([20, 24, 38], [30, 36, 54], [42, 50, 72]), style: 'flat' });
const RIB = defineMaterial('wall rib', { albedo: [.3, .34, .44], palette: pal([38, 44, 62], [56, 64, 86], [78, 88, 114]), style: 'flat' });
const UPRIGHT = defineMaterial('scaffold upright', { albedo: [.6, .38, .14], palette: pal([84, 48, 18], [134, 80, 28], [176, 116, 42]), style: 'mast' });
const WFRAME = defineMaterial('window frame', { albedo: [.42, .46, .56], palette: pal([56, 62, 80], [88, 96, 118], [126, 136, 158]), style: 'flat' });
worldMaterials({ edge: HULL, rubble: HULL, fill: HULL });

// ---------- the map ----------
// # hull (the floor), D deck (a solid platform), = catwalk (jump up through it; Down drops through), C crate, | scaffold upright (back wall),
// P Pip's start, c cheese, L a lamp, G the great cheese. Everything else is open, with the back wall behind it (WINDOW: none, space shows).
const COLS = 180, ROWS = 40, FLOOR = 33;
const WINDOW = [60, 2, 118, 24];   // tile columns and rows of the big window (inclusive)
function levelRows() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  const put = (c, r, ch) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) g[r][c] = ch; };
  const fill = (c0, r0, c1, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch); };
  fill(0, FLOOR, COLS - 1, ROWS - 1, '#');
  fill(0, 0, 0, FLOOR, '#'); fill(COLS - 1, 0, COLS - 1, FLOOR, '#');        // the shipyard's end walls
  fill(0, 0, COLS - 1, 0, '#');                                                 // and its roof: space shows only through the window
  // A: the start, crates to hop on, a first catwalk
  put(5, FLOOR - 1, 'P');
  fill(14, 31, 15, 32, 'C'); fill(19, 29, 21, 32, 'C'); fill(22, 31, 23, 32, 'C');
  fill(26, 26, 35, 26, '='); put(30, 24, 'c'); put(33, 24, 'c');
  // B: a raised deck, then a pit to drop into and jump out of
  fill(40, 28, 55, 29, 'D'); put(44, 26, 'c'); put(50, 26, 'c');
  fill(60, FLOOR, 70, FLOOR + 2, ' '); put(65, FLOOR + 1, 'c');
  // C: the scaffold tower in front of the window: catwalks to climb by jumping, the uprights on the back wall
  fill(80, 27, 90, 27, '='); fill(93, 21, 103, 21, '='); fill(80, 15, 90, 15, '='); fill(93, 9, 105, 9, '=');
  for (const c of [79, 91, 92, 106]) fill(c, 9, c, FLOOR - 1, '|');
  put(85, 25, 'c'); put(98, 19, 'c'); put(85, 13, 'c'); put(99, 7, 'c'); put(102, 7, 'c');
  // D: a long run (two crates to jump), the end wall and the great cheese
  fill(136, 31, 137, 32, 'C'); fill(152, 31, 153, 32, 'C'); fill(154, 30, 155, 32, 'C');
  put(170, FLOOR - 1, 'G');
  for (const c of [10, 46, 128, 160]) put(c, 17, 'L');                        // lamps on cables from the roof, low enough to see
  return g.map(r => r.join(''));
}
const LEGEND = {
  '#': HULL, 'D': DECK, '=': CATWALK, 'C': CRATE, '|': { back: UPRIGHT },
  'P': { spawn: 'pip' }, 'c': { spawn: 'cheese' }, 'L': { spawn: 'lamp' }, 'G': { spawn: 'goal' },
};
// the back wall everywhere the map left it bare: panels with a rib every six rows, the window's frame, nothing in the window (space shows)
function paintBackWall(map) {
  const tc = map.tc, [c0, r0, c1, r1] = WINDOW;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (backCells[i]) continue;
    const c = Math.floor(x / tc), r = Math.floor(y / tc), inWin = c >= c0 && c <= c1 && r >= r0 && r <= r1;
    const onFrame = inWin && (c === c0 || c === c1 || r === r0 || r === r1);
    backCells[i] = onFrame ? WFRAME : inWin ? 0 : (r % 6 === 0 && y % tc < 2 * PX) ? RIB : PANEL;
  }
}

// ---------- small sprites (drawn here at one pixel per game pixel: k = .5 at RES 2) ----------
const CHEESE_SPR = defineSprite({ w: 10, h: 8, pal: [[110, 66, 8, 0], [232, 170, 30, 1], [255, 214, 80, 1], [255, 240, 160, 1], [176, 112, 16, 1]],
  rows: ['......000.', '....003320', '..00322220', '0032222220', '0122222420', '0124222220', '0122222220', '0000000000'] }, { k: .5, ox: 5, oy: 8 });
const GOAL_SPR = defineSprite({ w: 24, h: 18, pal: [[110, 66, 8, 0], [232, 170, 30, 1], [255, 214, 80, 1], [255, 240, 160, 1], [176, 112, 16, 1]],
  rows: ['..............00........', '...........0033200......', '........003322222100....', '.....0033222222222210...', '..0033222222222222221...', '00322222222222222222210.',
    '012222222222222222222210', '012222442222222244222210', '012224444222222444422210', '012222442222222244222210', '012222222222222222222210', '012222222224422222222210',
    '012222222244442222222210', '012222222224422222222210', '011222222222222222222110', '011111111111111111111110', '044444444444444444444440', '000000000000000000000000'] }, { k: .5, ox: 12, oy: 18 });
const CABLE_SPR = defineSprite({ w: 1, h: 8, pal: [[34, 38, 52, 1], [52, 58, 76, 1]], rows: ['0', '0', '1', '0', '0', '0', '1', '0'] }, { k: .5, ox: .5, oy: 0 });
const LAMP_SPR = defineSprite({ w: 9, h: 7, pal: [[30, 32, 40, 0], [80, 86, 100, 1], [255, 226, 150, 1]],
  rows: ['....0....', '....0....', '...000...', '..01110..', '.0111110.', '022222220', '.2222222.'],
  emit: ['.........', '.........', '.........', '.........', '.........', '.9999999.', '.9999999.'] }, { k: .5, ox: 4.5, oy: 0, glow: 0 });
