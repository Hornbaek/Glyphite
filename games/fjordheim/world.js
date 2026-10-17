'use strict';
// ===================== GAME · the fjord valley: ground, nature, the tile grid, paths =====================
// An isometric map of N × N tiles (engine: isoInit, the ground drawn in the back wall). The fjord runs along the lower
// left edge, a beach above it, then meadow and grass, forest towards the upper right and rocky ground at the top. Every
// tile has a ground (G_*) and at most one thing on it (a tree, a rock, a bush, a field or part of a building), kept in
// small typed arrays so the family's pathfinding is cheap.
const N = 30, TILE = 8;   // tiles a side; tile width in base units (8 keeps whole cells and rows at every detail level)
const G_WATER = 0, G_SAND = 1, G_GRASS = 2, G_MEADOW = 3, G_SOIL = 4, G_ROCKY = 5;
// the ground colours are the owner's tiles' own (FJ_GROUND, from tools/art.py), turned into light units and brightened (k):
// the ground is drawn with thin glyphs (' , ; :) so the people and buildings, in dense ones, stand out against it, and a
// thin glyph in the tile's own colour would look nearly black (brighter still and it outshines the buildings)
const linC = (c, k = 1) => c.map(v => -Math.log(1 - Math.min(.93, v / 255)) / 1.7 * k);
const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const GRASS_SUMMER = linC(FJ_GROUND.grass, 1.45), GRASS_AUTUMN = linC(mixC(FJ_GROUND.grass, [170, 140, 70], .45), 1.45);
const GROUND_MAT = {
  [G_WATER]: defineMaterial('fjord', { albedo: linC(FJ_GROUND.water, 1.6), ramp: '.-~~=', style: 'flat' }),
  [G_SAND]: defineMaterial('beach', { albedo: linC(FJ_GROUND.sand, 1.1), ramp: ".,:;'", style: 'flat' }),
  [G_GRASS]: defineMaterial('grass', { albedo: GRASS_SUMMER, ramp: ".,'\";:", style: 'flat' }),
  [G_MEADOW]: defineMaterial('meadow', { albedo: linC(mixC(FJ_GROUND.meadow, [150, 160, 70], .25), 1.45), ramp: ".,'\"*;", style: 'flat' }),
  [G_SOIL]: defineMaterial('soil', { albedo: linC(FJ_GROUND.soil, 1.5), ramp: '.,-=~', style: 'flat' }),
  [G_ROCKY]: defineMaterial('scree', { albedo: linC([128, 130, 122], 1.2), ramp: '.,:;o', style: 'flat' }),
};
// the hills round the map, and the fjord's far shore: quiet, so the eye stays on the valley
const FELL_MAT = defineMaterial('fell', { albedo: linC([112, 118, 104], 1.1), ramp: " .,'", style: 'flat' });
const SNOW_MAT = defineMaterial('snow', { albedo: linC(FJ_GROUND.snow, .9), ramp: '.:-=*', style: 'flat' });

// the tile grid. thing: 0 nothing, T_TREE, T_STUMP, T_SAPLING, T_ROCK, T_BUSH, T_FIELD, T_BUILDING; ref: index into its list
const T_TREE = 1, T_STUMP = 2, T_SAPLING = 3, T_ROCK = 4, T_BUSH = 5, T_FIELD = 6, T_BUILDING = 7;
let ground, thing, ref, seed = 1;
const tidx = (i, j) => j * N + i;
const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
const groundAt = (i, j) => inMap(i, j) ? ground[tidx(i, j)] : G_WATER;
const thingAt = (i, j) => inMap(i, j) ? thing[tidx(i, j)] : -1;
// nature: trees, rocks and bushes live in their own lists; a tile points at its entry
let trees, rocks, bushes;

function genValley(sd) {
  seed = sd; const rng = mulberry32(sd);
  ground = new Uint8Array(N * N); thing = new Uint8Array(N * N); ref = new Int16Array(N * N).fill(-1);
  trees = []; rocks = []; bushes = [];
  // the shore: a wavy line across the lower left edge (j large), sand above it
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const shore = N - 6 + 2.4 * fbm1(i * .18, sd, 3) - 1.2 + (i < 4 ? 2 * (4 - i) / 4 : 0);
    const k = tidx(i, j), wet = j - shore;
    ground[k] = wet > 0 ? G_WATER : wet > -1.6 ? G_SAND : G_GRASS;
    if (ground[k] === G_GRASS) {
      const m = fbm2(i * .16, j * .16, sd + 7, 3);
      if (m > .58) ground[k] = G_MEADOW;
      if (i + j < 12 && fbm2(i * .3, j * .3, sd + 3, 2) > .45) ground[k] = G_ROCKY;   // the rocky hillside at the top
    }
  }
  // forest: dense to the upper right (small j), thinning towards the meadow; a clearing is kept round the landing
  const land = landingTile();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = tidx(i, j); if (ground[k] !== G_GRASS && ground[k] !== G_MEADOW) continue;
    if (Math.hypot(i - land[0], j - (land[1] - 4)) < 6.5) continue;
    const forest = fbm2(i * .12, j * .12, sd + 11, 3) + (i - j) / N * .55;
    if (forest > .62 && rng() < .75) addTree(i, j, rng() < .55 ? 'pine' : 'birch', 1);
    else if (rng() < .02) addTree(i, j, 'birch', 1);
  }
  for (let n = 0; n < 34; n++) {   // boulders and small rocks, most of them on the hillside
    const i = (rng() * N) | 0, j = (rng() * (N - 8)) | 0, k = tidx(i, j);
    if (thing[k] || ground[k] === G_WATER || ground[k] === G_SAND || Math.hypot(i - land[0], j - land[1]) < 5) continue;
    if (ground[k] !== G_ROCKY && rng() < .55) continue;
    const big = rng() < .45; rocks.push({ i, j, big, stone: big ? 8 : 3 }); thing[k] = T_ROCK; ref[k] = rocks.length - 1;
  }
  for (let n = 0; n < 14; n++) {   // lingonberry bushes at the forest's edge
    const i = (rng() * N) | 0, j = (rng() * (N - 7)) | 0, k = tidx(i, j);
    if (thing[k] || (ground[k] !== G_GRASS && ground[k] !== G_MEADOW) || Math.hypot(i - land[0], j - land[1]) < 4) continue;
    bushes.push({ i, j, berries: 3 }); thing[k] = T_BUSH; ref[k] = bushes.length - 1;
  }
}
function addTree(i, j, kind, grown) {
  const k = tidx(i, j); trees.push({ i, j, kind, grown, t: 0, alive: true }); thing[k] = grown ? T_TREE : T_SAPLING; ref[k] = trees.length - 1;
}
// where the knarr lands: the beach tile nearest the middle of the shore
function landingTile() {
  let best = null, bd = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (ground[tidx(i, j)] !== G_SAND || groundAt(i, j + 1) !== G_WATER) continue;
    const d = Math.abs(i - N * .45); if (d < bd) { bd = d; best = [i, j]; }
  }
  return best || [N >> 1, N - 7];
}

// the ground every tile shows, by season: snow over the land in winter (the fjord stays open: salt water)
function groundMat(i, j, season) {
  const g = ground[tidx(i, j)];
  if (season === 3 && g !== G_WATER && g !== G_SAND) return SNOW_MAT;
  if (thing[tidx(i, j)] === T_FIELD) return GROUND_MAT[G_SOIL];
  return GROUND_MAT[g];
}
function paintGround(season) {
  setMaterial(GROUND_MAT[G_GRASS], { albedo: season === 2 ? GRASS_AUTUMN : GRASS_SUMMER });
  isoGround((i, j) => groundMat(i, j, season));
}

// ---------- walking: A* over tiles, eight ways, never cutting a corner past something solid ----------
const walkable = (i, j) => {
  if (!inMap(i, j)) return false;
  const k = tidx(i, j), t = thing[k];
  return ground[k] !== G_WATER && t !== T_TREE && t !== T_ROCK && t !== T_BUILDING;
};
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function findPath(si, sj, goal) {   // goal(i, j) → true at an end tile; returns tiles from the start (excluded) to the end
  const open = [[si, sj, 0, 0]], from = new Int32Array(N * N).fill(-1), cost = new Float32Array(N * N).fill(1e9);
  cost[tidx(si, sj)] = 0; from[tidx(si, sj)] = tidx(si, sj);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][3] < open[bi][3]) bi = q;
    const [i, j, c] = open.splice(bi, 1)[0];
    if (c > cost[tidx(i, j)]) continue;
    if (goal(i, j)) {
      const out = []; let k = tidx(i, j);
      while (from[k] !== k) { out.push([k % N, (k / N) | 0]); k = from[k]; }
      return out.reverse();
    }
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (!walkable(ni, nj) || (di && dj && (!walkable(i + di, j) || !walkable(i, j + dj)))) continue;
      const nc = c + (di && dj ? 1.414 : 1), k = tidx(ni, nj);
      if (nc < cost[k]) { cost[k] = nc; from[k] = tidx(i, j); open.push([ni, nj, nc, nc]); }
    }
    if (open.length > 4000) break;
  }
  return null;
}
// a walkable tile next to a footprint (a × b from (i, j)), the nearest to (fi, fj)
const besideFoot = (i, j, a, b) => (ti, tj) => ti >= i - 1 && tj >= j - 1 && ti <= i + a && tj <= j + b && !(ti >= i && tj >= j && ti < i + a && tj < j + b);
