// ===================== GAME · materials, sprites and the level =====================
// The Proving Ground is a test level: one strip of ground with a station for every platformer feature of the engine, left to right
// (see NOTES.md). The level is drawn as a text map (`levelRows`) and turned into a world by the engine's loadTileMap.
const TILE = 4;   // base units per map tile (x RES cells)

const ROCK = defineMaterial('rock', { albedo: [.46, .44, .48], tough: 5, anchor: true, shiny: .03 });
const DIRT = defineMaterial('dirt', { albedo: [.55, .4, .28], tough: .3, friction: .8 });
const BRICK = defineMaterial('brick', { albedo: [.62, .3, .24], tough: .5, brittle: true, density: 1.2 });
const RUBBLE = defineMaterial('rubble', { albedo: [.5, .42, .36], granular: true, tough: .2, debris: true, grains: 'o%&' });
const CATWALK = defineMaterial('catwalk', { albedo: [.5, .52, .58], tough: 5, oneWay: true, style: 'mast', anchor: true });
const SPIKES = defineMaterial('spikes', { albedo: [.75, .22, .2], tough: 5, hazard: 1, anchor: true, shiny: .2 });
const ICE = defineMaterial('ice', { albedo: [.62, .82, .95], tough: 5, grip: .05, anchor: true, shiny: .5, style: 'flat' });
const BELT_R = defineMaterial('belt (right)', { albedo: [.3, .34, .4], tough: 5, conveyor: 9, anchor: true, style: 'deck' });
const BELT_L = defineMaterial('belt (left)', { albedo: [.4, .34, .3], tough: 5, conveyor: -9, anchor: true, style: 'deck' });
const SPRING = defineMaterial('spring', { albedo: [.95, .45, .8], tough: 5, bouncy: .9, anchor: true, shiny: .3, style: 'flat' });
const STEEL = defineMaterial('steel', { albedo: [.55, .6, .68], tough: 5, brittle: false, style: 'mast' });
const LADDER = defineMaterial('ladder', { albedo: [.62, .46, .26], tough: 5, climbable: true, style: 'mast' });
const LOWG = defineMaterial('low-gravity glow', { albedo: [.22, .3, .55], tough: 5, style: 'flat' });
const WATER = defineMaterial('water', { albedo: [.22, .5, .9], liquid: true, viscosity: .05, density: 1, shades: 4 });   // a liquid: the hero swims in it
const SNOW = defineMaterial('snow', { albedo: [.94, .96, 1], granular: true, tough: .1, grains: '.:' });   // what the weather tunable's snow piles up as
worldMaterials({ edge: ROCK, rubble: RUBBLE });

// ---------- pixel art: small enough to type, drawn at 0.5 base units per pixel ----------
// palette entries are [r, g, b, ink]; ink 0 is an outline colour
const HERO_PAL = [[34, 28, 44, 0], [244, 196, 156, 1], [222, 72, 62, 1], [64, 96, 210, 1], [124, 74, 42, 1], [52, 42, 54, 1], [20, 20, 30, 1], [248, 248, 248, 1]];
const heroRows = legs => [
  '..0000..', '.044440.', '.041160.', '.011110.', '..0000..', '02222220', '02222220', '01222210', '.022220.', ...legs];
const HERO_FRAMES = {
  idle: heroRows(['.033330.', '.030030.', '.050050.']),
  run1: heroRows(['.033330.', '033..030', '55....50']),
  run2: heroRows(['.033330.', '030..330', '05....55']),
  jump: heroRows(['.033330.', '033..330', '.55..55.']),
  climb: heroRows(['.033330.', '.030330.', '.050055.']),
  hurt: heroRows(['.033330.', '033..330', '55....55'])
};
const HERO = defineAnim(['idle', 'run1', 'run2', 'jump', 'climb', 'hurt'].map(n => defineSprite({ w: 8, h: 12, pal: HERO_PAL, rows: HERO_FRAMES[n] }, { k: .5, ox: 4, oy: 12 })),
  { fps: 9, tags: { idle: [0, 0], run: [1, 2], jump: [3, 3], climb: [4, 4], hurt: [5, 5] } });
const SLIME_PAL = [[26, 50, 30, 0], [70, 180, 90, 1], [150, 235, 150, 1], [246, 246, 246, 1], [20, 24, 20, 1]];
const SLIME = defineAnim([
  ['...0000...', '..012210..', '.01222110.', '.01311310.', '0111111110', '.00000000.'],
  ['..........', '..000000..', '.01222210.', '0131113110', '0111111110', '.00000000.']
].map(rows => defineSprite({ w: 10, h: 6, pal: SLIME_PAL, rows }, { k: .5, ox: 5, oy: 6 })), { fps: 4 });
const COIN_SPR = defineSprite({ w: 5, h: 5, pal: [[110, 70, 10, 0], [250, 200, 50, 1], [255, 240, 150, 1]], rows: ['.000.', '01120', '01120', '01110', '.000.'] }, { k: .5, ox: 2.5, oy: 5 });
// the flame's pixels glow (the emit layer, E3): they are their own colour at any hour and give a little light of their own, on top of the torch's lamp
const TORCH_SPR = defineSprite({ w: 3, h: 7, pal: [[255, 150, 40, 1], [255, 230, 120, 1], [90, 60, 40, 1]], rows: ['.1.', '101', '.0.', '.2.', '.2.', '.2.', '.2.'],
  emit: ['.9.', '999', '.9.', '...', '...', '...', '...'] }, { k: .5, ox: 1.5, oy: 7, glow: 4, glowGain: .3 });
const FLAG_PAL = [[40, 40, 50, 0], [90, 90, 100, 1], [230, 70, 60, 1]];   // the cloth is swapped for green with drawSprite's palette option
const FLAG_SPR = defineSprite({ w: 7, h: 12, pal: FLAG_PAL, rows: ['0000000', '0222200', '0222220', '0222200', '0222000', '0100000', '0100000', '0100000', '0100000', '0100000', '0100000', '0110000'] }, { k: .5, ox: 3.5, oy: 12 });
const FLAG_ON = [[40, 40, 50], [90, 90, 100], [70, 220, 110]];
const GOAL_SPR = defineSprite({ w: 8, h: 12, pal: [[120, 80, 20, 0], [255, 214, 90, 1], [255, 250, 190, 1]], rows: ['..0000..', '.011110.', '01122110', '01222210', '01122110', '.011110.', '..0110..', '..0110..', '..0110..', '.011110.', '.011110.', '00000000'] }, { k: .5, ox: 4, oy: 12 });

// ---------- the level as a text map ----------
// The legend is the engine's loadTileMap legend. Characters: # rock, d dirt (dig it: L), B brick (blast it), = catwalk (jump up through it, S drops
// through), ^ spikes, i ice, > < belts, s spring, H ladder (on the back wall), ~ low-gravity room, c coin, e slime, t torch, F checkpoint, G goal,
// P start, w water, C a coin in the water, a-9 hint zones. The moving platforms and the gravity zone are put in by setup (FERRY, LIFT, LOW_G below).
const COLS = 132, ROWS = 24, GROUND = 18;
function levelRows() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  const put = (c, r, ch) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) g[r][c] = ch; };
  const fill = (c0, r0, c1, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch); };
  const zone = (c0, r0, c1, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r][c] === ' ') g[r][c] = ch; };   // hint zones only take empty tiles
  const coins = (r, ...cs) => cs.forEach(c => put(c, r, 'c'));
  fill(0, GROUND, COLS - 1, ROWS - 1, '#');                                  // ground and bedrock
  // A: walking, jumping, a catwalk, a ladder, a high ledge
  put(3, 17, 'P'); put(6, 17, 't'); coins(16, 8, 9, 10, 11);
  fill(14, 15, 19, 15, '='); coins(14, 15, 16, 17);
  fill(22, 10, 22, 17, 'H'); fill(21, 10, 29, 10, '='); coins(9, 23, 25, 27);
  put(31, 17, 'F'); put(30, 17, 't');
  // B: ice, conveyor belts
  fill(33, GROUND, 41, GROUND, 'i'); coins(16, 35, 37, 39, 41); put(34, 17, 't');
  fill(43, GROUND, 47, GROUND, '>'); fill(48, GROUND, 53, GROUND, '<'); coins(15, 44, 46, 49, 51);
  put(54, 17, 'F');
  // C: a spike pit and a spring
  fill(58, GROUND, 65, ROWS - 2, ' '); fill(58, ROWS - 2, 65, ROWS - 2, '^'); put(56, GROUND, 's'); coins(13, 59, 62, 64);
  // D: a ferry over a longer pit (see FERRY), a lift to a high ledge (see LIFT)
  fill(71, GROUND, 83, ROWS - 2, ' '); fill(71, ROWS - 2, 83, ROWS - 2, '^'); coins(15, 74, 77, 80);
  fill(72, 7, 82, 7, '#'); put(84, 17, 'F'); fill(85, GROUND, 87, GROUND, ' '); fill(88, 12, 91, 12, '#'); put(90, 11, 'c');
  // E: low gravity (a high ledge only a floating jump reaches), slimes, a brick tower to topple
  fill(92, 6, 104, 17, '~'); fill(97, 12, 101, 12, '#'); coins(11, 98, 99, 100);
  put(94, 17, 'e'); put(101, 17, 'e'); fill(106, 12, 107, 17, 'B'); put(106, 11, 'e'); coins(16, 103, 104);
  put(91, 17, 't');
  // F: a pool: a basin four tiles deep with water three deep (its surface a tile below the ground), coins on the bottom and in the water, and steps up the
  // far side (the reach check swims it: it needs no hop out)
  fill(110, GROUND, 121, ROWS - 3, ' '); fill(110, 19, 121, ROWS - 3, 'w');
  put(112, 21, 'C'); put(114, 20, 'C'); put(116, 21, 'C'); put(118, 20, 'C');
  put(119, 21, '#'); fill(120, 20, 120, 21, '#'); fill(121, 19, 121, 21, '#');
  put(108, 17, 't'); put(124, 17, 'F');
  // G: a dirt wall to dig and the goal
  fill(129, 14, 129, 17, 'd'); put(130, 17, 'c'); put(131, 17, 'G');
  // hint zones (triggers), last, so they only take tiles nothing else uses
  zone(1, 13, 9, 17, '1');
  zone(16, 12, 18, 14, '2');
  zone(23, 11, 28, 13, '3');
  zone(33, 13, 38, 17, '4');
  zone(43, 13, 50, 17, '5');
  zone(55, 13, 57, 17, '6');
  zone(85, 9, 88, 17, '7');
  zone(92, 14, 96, 17, '8');
  zone(128, 12, 130, 17, '9');
  zone(108, 14, 118, 18, 'a');
  zone(66, 11, 70, 17, '7');
  return g.map(r => r.join(''));
}
const LEGEND = {
  '#': { mat: ROCK }, d: { mat: DIRT }, B: { mat: BRICK }, '=': { mat: CATWALK }, '^': { mat: SPIKES }, i: { mat: ICE }, '>': { mat: BELT_R }, '<': { mat: BELT_L },
  s: { mat: SPRING }, H: { back: LADDER }, '~': { back: LOWG }, w: { mat: WATER }, C: { mat: WATER, entity: 'coin' }, c: { entity: 'coin' }, e: { entity: 'slime' }, t: { entity: 'torch' }, F: { entity: 'checkpoint' },
  G: { entity: 'goal' }, P: { spawn: 'start' },
  1: { trigger: 'hint1' }, 2: { trigger: 'hint2' }, 3: { trigger: 'hint3' }, 4: { trigger: 'hint4' }, 5: { trigger: 'hint5' }, 6: { trigger: 'hint6' }, 7: { trigger: 'hint7' },
  8: { trigger: 'hint8' }, 9: { trigger: 'hint9' }, a: { trigger: 'hint10' }
};
const HINTS = {
  hint1: () => `MOVE ${actionLabel('left')} ${actionLabel('right')}   JUMP ${actionLabel('jump')} (HOLD FOR HEIGHT, A PRESS JUST BEFORE LANDING STILL COUNTS)`,
  hint2: () => `CATWALKS: JUMP UP THROUGH THEM, ${actionLabel('down')} DROPS THROUGH`,
  hint3: () => `LADDERS: ${actionLabel('up')} / ${actionLabel('down')} CLIMB, JUMP LETS GO`,
  hint4: () => 'ICE: FEET DO NOT GRIP, STOPPING TAKES A WHILE',
  hint5: () => 'CONVEYOR BELTS CARRY YOU',
  hint6: () => 'SPIKES HURT. THE PINK BLOCK IS A SPRING',
  hint7: () => `A FERRY CARRIES YOU OVER THE SPIKES (OR SWING OVER THE BEAM: ${actionLabel('grapple')} SHOOTS A HOOK UP AND FORWARD, AGAIN LETS GO). A LIFT TAKES YOU UP`,
  hint8: () => `LOW GRAVITY: JUMPS GO HIGHER.  ${actionLabel('fire')} THROWS A PEBBLE, ${actionLabel('bomb')} A BOMB`,
  hint9: () => `${actionLabel('dig')} DIGS DIRT IN FRONT OF YOU. THE FLAG AT THE END WINS`,
  hint10: () => `WATER: HOLD ${actionLabel('jump')} OR ${actionLabel('up')} TO SWIM UP, ${actionLabel('down')} TO DIVE, ${actionLabel('left')} ${actionLabel('right')} TO SWIM. THE COINS ARE UNDER THE SURFACE; A PRESS AT THE SURFACE HOPS OUT`
};
// moving parts and the zone, in tiles (setup turns them into cells)
const FERRY = { col: 71, row: GROUND, cols: 4, to: 80, speed: 9 };   // 4 tiles wide, rides along the row to column `to` (its top is flush with the ground)
const LIFT = { col: 85, row: GROUND, cols: 3, up: 6, speed: 8 };     // rises `up` tiles from a one-tile hole in the ground
const LOW_G = { c0: 92, r0: 6, c1: 105, r1: 18, scale: .5 };
