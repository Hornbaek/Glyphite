'use strict';
// ===================== GAME · the homestead: buildings, stock, days and seasons =====================
// Buildings cost wood, planks and stone, paid when they are placed; an adult then walks over and builds them. Some need a
// worker (BUILDINGS[...].job), whom the family hands out by itself (folk.js). Every dawn the family eats (an adult one food,
// the child half) and, in winter, the longhouse burns firewood (wood). Three hungry or cold days in a row and the family
// gives up and sails home; reach the second spring and the homestead stands.
const BUILDINGS = {
  longhouse:  { name: 'Longhouse', w: 3, h: 2, cost: { wood: 8, stone: 4 }, work: 22, beds: 6, help: 'home: beds for six and the hearth' },
  woodcutter: { name: "Woodcutter's hut", w: 2, h: 2, cost: { wood: 4 }, work: 10, job: 'woodcutter', help: 'fells trees nearby, plants new ones' },
  fishing:    { name: 'Fishing hut', w: 2, h: 2, cost: { wood: 5 }, work: 12, job: 'fisher', shore: true, help: 'rows out for fish; by the water' },
  field:      { name: 'Barley field', w: 2, h: 2, cost: {}, work: 3, job: 'farmer', help: 'sow in spring and summer, reap when ripe' },
  sawpit:     { name: 'Sawpit', w: 2, h: 2, cost: { wood: 4, stone: 2 }, work: 12, job: 'sawyer', help: 'saws logs into planks (in autumn and winter it leaves 6 for the fire)' },
  rack:       { name: 'Drying rack', w: 1, h: 2, cost: { wood: 3 }, work: 6, help: 'fishers bring home half again as much' },
  stabbur:    { name: 'Storehouse', w: 2, h: 2, cost: { planks: 4, stone: 2 }, work: 14, help: 'keeps food dry: room for 60 more' },
  well:       { name: 'Well', w: 1, h: 1, cost: { stone: 4 }, work: 8, help: 'fresh water: more newcomers come' },
  smithy:     { name: 'Smithy', w: 2, h: 2, cost: { planks: 3, stone: 6 }, work: 16, help: 'iron tools: all work a third faster' },
};
const BUILD_ORDER = ['longhouse', 'woodcutter', 'fishing', 'field', 'sawpit', 'rack', 'stabbur', 'well', 'smithy'];
const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
const GOODS = ['wood', 'planks', 'stone', 'food'];

let HOME = null;
function newHomestead() {
  HOME = { stock: { wood: 12, planks: 0, stone: 4, food: TUNE.startFood }, buildings: [], day: 1, tod: .08, season: 0, year: 1,
    hunger: 0, cold: 0, won: false, lost: '', ship: null, arrivals: 0, deerGone: false, spoiled: 0 };
}
const built = type => HOME.buildings.filter(b => b.type === type && b.done);
const daysPerSeason = () => Math.round(TUNE.daysPerSeason);
const foodCap = () => 40 + 60 * built('stabbur').length;
const workSpeed = () => 1 + (built('smithy').length ? 1 / 3 : 0);
const beds = () => built('longhouse').length * BUILDINGS.longhouse.beds;
const affordable = type => Object.entries(BUILDINGS[type].cost).every(([g, n]) => HOME.stock[g] >= n);
const costText = type => Object.entries(BUILDINGS[type].cost).map(([g, n]) => `${n}${g[0].toUpperCase()}`).join(' ') || 'FREE';

// can a building of this type stand with its top corner on tile (i, j)? → '' or why not
function placeProblem(type, i, j) {
  const b = BUILDINGS[type];
  if (!affordable(type)) return `needs ${costText(type)}`;
  if (type === 'longhouse' && HOME.buildings.some(x => x.type === 'longhouse') && !built('longhouse').length) return 'finish the first longhouse';
  for (let v = j; v < j + b.h; v++) for (let u = i; u < i + b.w; u++) {
    if (!inMap(u, v)) return 'off the map';
    const g = groundAt(u, v), t = thingAt(u, v);
    if (g === G_WATER) return 'in the water';
    if (t === T_TREE || t === T_SAPLING) return 'trees in the way';
    if (t === T_ROCK) return 'rocks in the way';
    if (t && t !== T_STUMP && t !== T_BUSH) return 'something is there';
    if (type === 'field' && (g === G_SAND || g === G_ROCKY)) return 'barley needs grass';
    if (FOLK && FOLK.some(p => p.ti === u && p.tj === v)) return 'someone is standing there';
  }
  if (b.shore) {
    let wet = false;
    for (let v = j - 2; v < j + b.h + 2; v++) for (let u = i - 2; u < i + b.w + 2; u++) if (inMap(u, v) && groundAt(u, v) === G_WATER) wet = true;
    if (!wet) return 'must stand by the water';
  }
  return '';
}
function placeBuilding(type, i, j) {
  const b = BUILDINGS[type];
  for (const [g, n] of Object.entries(b.cost)) HOME.stock[g] -= n;
  const o = { type, i, j, w: b.w, h: b.h, progress: 0, done: false, worker: null, builder: null, stage: 0, grow: 0, t: 0 };
  HOME.buildings.push(o);
  for (let v = j; v < j + b.h; v++) for (let u = i; u < i + b.w; u++) {
    const k = tidx(u, v); thing[k] = type === 'field' ? T_FIELD : T_BUILDING; ref[k] = HOME.buildings.length - 1;
  }
  if (type === 'field') isoPaintFoot(o);
  return o;
}
function isoPaintFoot(o) { for (let v = o.j; v < o.j + o.h; v++) for (let u = o.i; u < o.i + o.w; u++) isoSetTile(u, v, groundMat(u, v, HOME.season)); }
function finishBuilding(o) {
  o.done = true; o.progress = 1;
  const b = BUILDINGS[o.type];
  if (o.type === 'field') o.stage = HOME.season < 2 ? 0 : 4;
  say(`${b.name.toUpperCase()} BUILT: ${b.help}`); Sfx.pickup();
}

// ---------- time: the day, the seasons, what each dawn costs ----------
const isNight = () => HOME.tod > .72;
function stepTime(dt) {
  HOME.tod += dt / TUNE.dayLength;
  if (HOME.tod < 1) return;
  HOME.tod -= 1; HOME.day++;
  if (HOME.day > daysPerSeason()) { HOME.day = 1; HOME.season = (HOME.season + 1) % 4; if (HOME.season === 0) HOME.year++; newSeason(); }
  dawn();
}
function newSeason() {
  const s = HOME.season;
  say(s === 3 ? 'WINTER: the longhouse burns 2 wood a night' : `${SEASONS[s]} OF YEAR ${HOME.year}`);
  paintGround(s);
  for (const b of bushes) if (s === 1) b.berries = 3;
  for (const f of HOME.buildings) if (f.type === 'field' && f.done) {
    if (s === 3 && f.stage > 0 && f.stage < 4) f.stage = 4;   // frost takes whatever was not reaped
    if (s === 0 && f.stage === 4) f.stage = 0;              // spring: the stubble is ploughed again
  }
  if (s === 0 && HOME.year === 2 && !HOME.lost) { HOME.won = true; setState('won'); Sfx.win(); }
}
function dawn() {
  const fed = FOLK.reduce((n, p) => n + (p.kind === 'child' ? .5 : 1), 0);
  if (HOME.stock.food >= fed) { HOME.stock.food -= fed; HOME.hunger = 0; }
  else { HOME.stock.food = 0; HOME.hunger++; say(HOME.hunger >= 2 ? 'THE FAMILY IS STARVING: fish, berries, barley' : 'THE FAMILY WENT TO BED HUNGRY'); Sfx.alarm(); }
  if (HOME.season === 3) {
    const need = 2 * built('longhouse').length;
    if (!need) { HOME.cold++; say('A WINTER NIGHT WITHOUT A ROOF: build the longhouse'); Sfx.alarm(); }
    else if (HOME.stock.wood >= need) { HOME.stock.wood -= need; HOME.cold = 0; }
    else { HOME.stock.wood = 0; HOME.cold++; say(HOME.cold >= 2 ? 'FREEZING: the longhouse needs wood' : 'A COLD NIGHT: no wood for the fire'); Sfx.alarm(); }
  }
  if (HOME.hunger >= 3) lose('THE FAMILY SAILED HOME: there was nothing to eat');
  else if (HOME.cold >= 3) lose('THE FAMILY SAILED HOME: the winter was too cold');
  const cap = foodCap();
  if (HOME.stock.food > cap) { HOME.spoiled += HOME.stock.food - cap; HOME.stock.food = cap; say('FOOD SPOILED: build a storehouse'); }
  growNature();
  // newcomers: when there is a free bed and food to spare, before winter; after the first, only to a homestead with a well
  if (!HOME.ship && FOLK.length < beds() && (HOME.arrivals < 1 || built('well').length) && HOME.stock.food >= 2 * FOLK.length && HOME.season < 3) sendShip();
}
function lose(why) { HOME.lost = why; setState('lost'); Sfx.alarm(); }

// trees grow back: a stump sprouts, a sapling grows up (not in winter); lingonberries come back each summer
function growNature() {
  if (HOME.season === 3) return;
  for (const t of trees) {
    if (!t.alive) continue;
    const k = tidx(t.i, t.j);
    if (thing[k] === T_STUMP && Math.random() < .3) { thing[k] = T_SAPLING; t.grown = 0; t.t = 0; }
    else if (thing[k] === T_SAPLING && ++t.t >= 3) { thing[k] = T_TREE; t.grown = 1; }
  }
}
const grownTrees = () => trees.filter(t => t.alive && thing[tidx(t.i, t.j)] === T_TREE).length;

// fields grow by themselves once sown, but only in the warm seasons
function stepFields(dt) {
  for (const f of HOME.buildings) {
    if (f.type !== 'field' || !f.done || f.stage < 1 || f.stage > 2 || HOME.season === 3) continue;
    f.grow += dt / TUNE.dayLength;
    if (f.grow >= 1.5) { f.grow = 0; f.stage++; if (f.stage === 3) addText(...isoToWorld(f.i + 1, f.j + 1), 'RIPE', [255, 214, 120]); }
  }
}

// ---------- newcomers arrive by knarr ----------
// The knarr sails along the fjord, parallel to the shore (the way its drawing lies, mirrored: bow to the upper left): in
// from the right, moored off the landing while the newcomer wades ashore, then on up the fjord and away to the left.
// Its lane keeps three tiles off the shore, which wanders: the drawing rises far up the screen, and nearer in it would
// stand on the beach.
function shipLane(u) {
  const i = clamp(Math.floor(u), 0, N - 1);
  let j = 0; while (j < N && groundAt(i, j) !== G_WATER) j++;
  return j + 3;
}
function sendShip() {
  HOME.ship = { u: N + 6, v: shipLane(N - 1), phase: 'in', t: 0 };
  say('A KNARR IS COMING IN'); Sfx.tone(330, .5, .08, 'triangle'); Sfx.tone(440, .6, .07, 'triangle', .3);
}
function stepShip(dt) {
  const s = HOME.ship; if (!s) return;
  if (s.phase === 'moored') {
    if ((s.t += dt) > 1.5 && !s.landed) { s.landed = true; s.cargo = arrive(); }
    if (s.t > 4) s.phase = 'out';
    return;
  }
  const stop = s.phase === 'in' ? LANDING[0] + .5 : -8;
  s.u = Math.max(stop, s.u - 2.2 * dt);
  s.v += (shipLane(s.u) - s.v) * Math.min(1, dt * 1.5);   // eases along the lane as the shore bends
  if (s.u === stop) { if (s.phase === 'in') { s.phase = 'moored'; s.t = 0; } else HOME.ship = null; }
}
