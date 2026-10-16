// ===================== GAME · materials of the station =====================
// The world grid: hull and decks, catwalks the mouse can jump up through (oneWay), rusted panels that crumble under it,
// cargo, live cables, and cheese. The back wall (engine back layer) uses the panel, seam and pipe materials at the end.
const HULL = defineMaterial('hull plating', { albedo: [.4, .44, .54], ramp: ' .:-=+#', tough: 99, anchor: true, density: 2, brittle: false, shiny: .1, style: 'deck' });
const DECK = defineMaterial('deck', { albedo: [.56, .58, .63], ramp: ' .-=#', tough: 2.5, density: 1.6, brittle: false, shiny: .25, style: 'deck' });
const GIRDER = defineMaterial('catwalk', { albedo: [.66, .55, .38], ramp: ' .-=', tough: 2, brittle: false, oneWay: true, anchor: true, style: 'mast' });   // bolted in place: never falls
const RUST = defineMaterial('rusted panel', { albedo: [.58, .33, .17], ramp: ' .,:;%', tough: .3, friction: .8, style: 'terrain' });
const FLAKES = defineMaterial('rust flakes', { albedo: [.52, .3, .16], ramp: ' .,:', granular: true, tough: .1, grainGlyphs: ".,'" });
const SCRAP = defineMaterial('scrap', { albedo: [.46, .47, .5], ramp: ' .,o%', granular: true, tough: .2, grainGlyphs: ",.'%", debris: true });
const CRATE = defineMaterial('cargo crate', { albedo: [.36, .46, .38], ramp: ' .:=#', tough: .55, density: .8, style: 'flat' });
const CRATE_EDGE = defineMaterial('crate frame', { albedo: [.24, .3, .26], ramp: ' .:+', tough: .6, density: .8, style: 'mast' });
const WEAK = defineMaterial('cracked wall', { albedo: [.4, .42, .47], ramp: ' .,;:%', tough: .45, density: 1.4 });
const PEAS = defineMaterial('freeze-dried peas', { albedo: [.48, .74, .3], ramp: ' ooO', granular: true, tough: .1, grainGlyphs: 'o', style: 'flat' });
const CABLE = defineMaterial('live cable', { albedo: [.2, .22, .3], ramp: ' -~=', tough: .5, brittle: false, glow: [.05, .1, .25, 3], style: 'flat' });
const SHARDS = defineMaterial('broken glass', { albedo: [.55, .78, .9], ramp: " .'^", tough: .3, shiny: .6, style: 'flat', grainGlyphs: "'^," });
// cheese: the mouse eats it cell by cell; bites fall as crumbs that pile up (and are cheese too)
const CHEESE = defineMaterial('cheese', {
  albedo: [1, .8, .3], ramp: ' .:o%#', tough: .25, density: .9, glow: [.12, .08, .01, 5], style: 'flat',
  blast(x, y, vx, vy) { spawnGrain(x, y, vx * .5, vy * .5, CRUMBS); }
});
const CRUMBS = defineMaterial('cheese crumbs', { albedo: [1, .78, .28], ramp: ' .oo', granular: true, tough: .1, grainGlyphs: '.,o', style: 'flat' });
// the goal of each sector: a great cheese that glows, pulses and cannot be blown up
const GREAT = defineMaterial('the great cheese', { albedo: [1, .86, .34], ramp: ' .oO@', tough: 99, anchor: true, glow: [.5, .36, .06, 9], pulse: [1, .75, .2], style: 'crystal' });
worldMaterials({ edge: HULL, rubble: SCRAP, fill: HULL });

// back wall
const PANEL = defineMaterial('wall panel', { albedo: [.4, .45, .55], ramp: ' .,:' });
const SEAM = defineMaterial('panel seam', { albedo: [.28, .31, .38], style: 'mast' });
const PIPE = defineMaterial('pipe', { albedo: [.62, .45, .28], style: 'mast' });
const GRILLE = defineMaterial('vent grille', { albedo: [.36, .4, .46], ramp: ' -=#' });
const STRIPE = defineMaterial('hazard stripe', { albedo: [.85, .62, .12], ramp: ' ./' });

// what each material means to the mouse
const HAZARD = { [CABLE]: 'ZAPPED BY A LIVE CABLE', [SHARDS]: 'CUT ON BROKEN GLASS' };
const EDIBLE = new Set([CHEESE, CRUMBS]);
