// ===================== GAME · materials and the cave =====================
// Materials are the game's own: the engine only knows their properties (engine/API.md, "Materials").
const DIRT = defineMaterial('dirt', { albedo: [.55, .42, .32], ramp: ' .,:;=+*#%', granular: true, creep: true, tough: .15, friction: .8 });
const STONE = defineMaterial('stone', { albedo: [.46, .48, .52], ramp: " .':oO8&%#", tough: .5, shiny: .04 });
const RUBBLE = defineMaterial('rubble', { albedo: [.5, .47, .44], ramp: ' .,o%&', granular: true, tough: .2, grainGlyphs: 'o%&', debris: true });
const BEDROCK = defineMaterial('bedrock', { albedo: [.26, .27, .31], ramp: ' .:;#XWM', tough: 99, anchor: true, density: 1.3 });
const GEM = defineMaterial('gem', {
  albedo: [1, .35, .85], ramp: ' .+*', tough: .3, shiny: .7, style: 'crystal', glow: [.18, .03, .14, 5], pulse: [.9, .2, .7],
  // blasting a gem vein throws out shards (PT_SHARD in drone.js) instead of rubble
  blast(x, y, vx, vy, how) { if (how === 'blast' || Math.random() < .5) spawnP(PT_SHARD, x, y, vx * .4, vy * .4 - 5 * RES, 30, 42, GEM); }
});
worldMaterials({ edge: BEDROCK, rubble: RUBBLE, fill: STONE });

// a cave: noise decides rock or air, then dirt settles on the floors and gem veins run through the rock
let CAVE = null;
function genCave(n) {
  const S = RES, seed = n * 977 + 13, rng = mulberry32(seed);
  worldInit(Math.round(240 * S), Math.round(120 * S));
  setSun(null);                     // underground: only the game's own lights
  setAmbient([.12, .13, .17]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x < 3 * S || x >= W - 3 * S || y < 3 * S || y >= H - 4 * S;
    const open = fbm2(x / (46 * S), y / (19 * S), seed, 4) > .5 - .1 * Math.sin(y / H * Math.PI);
    cells[y * W + x] = edge ? BEDROCK : open ? EMPTY : fbm2(x / (14 * S), y / (7 * S), seed + 5, 2) > .62 ? DIRT : STONE;
  }
  let gems = 0;   // veins: short random walks through stone
  for (let k = 0; k < 40; k++) {
    let x = Math.floor(rng() * W), y = Math.floor(rng() * H);
    for (let s = 0; s < 6 * S * S; s++) {
      if (cells[y * W + x] === STONE) { cells[y * W + x] = GEM; gems++; }
      x = clamp(x + Math.floor(rng() * 3) - 1, 0, W - 1); y = clamp(y + Math.floor(rng() * 3) - 1, 0, H - 1);
    }
  }
  awake.fill(1);
  for (let i = 0; i < 30 * S; i++) { simGranular(); frameNo++; }   // loose dirt slides down before the player arrives
  settleIslands();
  // spawn in the biggest open space near the left
  let best = null;
  for (let x = Math.round(12 * S); x < W / 3; x += 2) for (let y = Math.round(10 * S); y < H - 10 * S; y += 2) {
    let room = 0; while (room < 14 * S && getC(x, y + room) === EMPTY && getC(x, y - room) === EMPTY && getC(x - room, y) === EMPTY && getC(x + room, y) === EMPTY) room++;
    if (!best || room > best.room) best = { x, y, room };
  }
  updateSkyline();
  CAVE = { n, gems, spawn: { x: best.x + .5, y: best.y * ASPECT } };
  return CAVE;
}
