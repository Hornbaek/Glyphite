// ===================== GAME · materials of the Moon =====================
// Defined in this order so the ids match the original constants (0 is the engine's EMPTY).
const REGO = defineMaterial('regolith', {
  albedo: [.72, .69, .63], ramp: ' .,:;=+*#%', granular: true, creep: true, tough: .12, friction: .75,
  fuseChance: .07   // blast rims fuse it to glass (set below, once GLASS exists)
});
const ROCK = defineMaterial('basalt', { albedo: [.50, .52, .57], ramp: " .':oO8&%#", tough: .55, shiny: .05 });
const BED = defineMaterial('bedrock', { albedo: [.30, .31, .35], ramp: ' .:;#XWM', tough: 99, density: 1.3, anchor: true });
const ICE = defineMaterial('water ice', { albedo: [.70, .90, 1.0], ramp: ' .-~=*#', tough: .3, shiny: .9, density: .9, style: 'flat', sublimate: .02, vaporize: true });
const METAL = defineMaterial('pad', { albedo: [.86, .88, .92], ramp: ' .-=#', tough: 99, shiny: .55, density: 2, brittle: false, anchor: true, style: 'deck' });
const RUBBLE = defineMaterial('rubble', { albedo: [.58, .54, .49], ramp: ' .,o%&', granular: true, tough: .2, grainGlyphs: 'o%&', debris: true });
const CRYST = defineMaterial('He-3 crystal', {
  albedo: [.35, 1.0, .85], ramp: ' .+*', tough: .35, shiny: .7, density: 1.1, style: 'crystal',
  glow: [.02, .2, .16, 5], pulse: [.2, .9, .75], beatGlow: 1,   // the veins flash with the music's drum hits
  // blasting a vein frees glowing shards that fly to the lander (see PT_PICKUP in lander.js)
  blast(x, y, vx, vy, how) {
    const S = RES;
    if (how === 'chip') { if (Math.random() < .5) spawnP(PT_PICKUP, x, y, rr(-6, 6) * S, -rr(4, 10) * S, 40, 42, CRYST); }
    else if (Math.random() < 1 / (S * S) + .05) spawnP(PT_PICKUP, x, y, vx * .5, vy * .5 - 6 * S, 40, 42, CRYST);
  }
});
const GLASS = defineMaterial('impact glass', { albedo: [.32, .58, .46], ramp: ' .,;o', tough: .45, shiny: .8, grainGlyphs: ';o' });
const MAST = defineMaterial('lamp mast', { albedo: [.70, .72, .76], ramp: ' .:|#', tough: .8, shiny: .5, density: 1.6, brittle: false, style: 'mast' });
setMaterial(REGO, { fuseTo: GLASS });
worldMaterials({ edge: BED, rubble: RUBBLE, fill: ROCK });
