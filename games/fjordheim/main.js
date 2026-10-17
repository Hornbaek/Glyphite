'use strict';
// ===================== GAME · Fjordheim: input, camera, drawing, HUD and the hooks handed to the engine =====================
// States: title → play ⇄ paused → won (the second spring: play on) or lost (the family sailed home). The engine runs the loop;
// the map is isometric (engine/12_iso.js): the ground in the back wall, everything standing on it a sprite, drawn back to front.
const CAM = [0, 0];          // the view's top-left, in base units (world units / RES), so it survives a detail change
let SEL = null, HOVER = null, MENU = [], FAST = 1, HELP = false, assignT = 0, SEED = 7;
const _p = [0, 0];

function newGame() {
  genValley(SEED);
  LANDING = landingTile();
  newHomestead();
  HOME.forest0 = grownTrees();
  buildWorld();
  FOLK = []; BOATS = [];
  newPerson('father', LANDING[0], LANDING[1] - 1); newPerson('mother', LANDING[0] + 1, LANDING[1] - 1); newPerson('child', LANDING[0], LANDING[1]);
  for (const p of FOLK) p.doing = 'looking at the empty shore';
  newAnimals();
  isoToWorld(LANDING[0] + .5, LANDING[1] - 3, _p);
  CAM[0] = _p[0] / RES - R.cols / RES / 2; CAM[1] = _p[1] / RES - R.rows * ASPECT / RES / 2;
  SEL = null; FAST = 1;
}
// the world grid for the current detail level: the map, the ground painted into it, the sea and hills round its edges
function buildWorld() {
  isoInit(N, N, { tile: TILE, top: 20, bottom: 14 });
  paintGround(HOME ? HOME.season : 0);
  const sea = GROUND_MAT[G_WATER], hill = GROUND_MAT[G_ROCKY];
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const k = cy * W + cx; if (backCells[k]) continue;
    worldToIso(cx + .5, (cy + .5) * ASPECT, _p);
    backCells[k] = _p[0] + _p[1] > N || _p[1] > N - 8 ? sea : hill;
  }
  setGravity(1.62);
}

// ---------- the build bar and placing ----------
function select(type) {
  if (SEL === type) { SEL = null; return; }
  if (!affordable(type)) { say(`${BUILDINGS[type].name.toUpperCase()} NEEDS ${costText(type)}`); Sfx.tone(160, .12, .06); return; }
  SEL = type; Sfx.tone(660, .05, .05, 'square');
}
// the footprint's top corner for a building centred on the tile under the cursor
function footAt(type, t) { const b = BUILDINGS[type]; return [t[0] - ((b.w - 1) >> 1), t[1] - ((b.h - 1) >> 1)]; }
function clickMap(aim) {
  const t = isoPick(aim); if (!t) return;
  if (!SEL) { HOVER = hoverAt(aim); return; }
  const [i, j] = footAt(SEL, t), why = placeProblem(SEL, i, j);
  if (why) { say(why.toUpperCase()); Sfx.tone(160, .12, .06); return; }
  placeBuilding(SEL, i, j); Sfx.thud(3);
  if (SEL !== 'field' || !affordable(SEL)) SEL = null;
}
function hudCell(aim) { return [Math.floor(aim[0] * R.hcols), Math.floor(aim[1] * R.hrows)]; }
function menuAt(aim) { const [c, r] = hudCell(aim); return MENU.find(m => m.r === r && c >= m.c0 && c < m.c1) || null; }

// what is under the cursor: a person (on screen, near their feet), else a building, field or tree on that tile
function hoverAt(aim) {
  if (!aim) return null;
  const wx = cam.x + aim[0] * R.cols, wy = cam.y + aim[1] * R.rows * ASPECT;
  let best = null, bd = 4 * RES;
  for (const p of FOLK) { if (p.hidden) continue; isoToWorld(p.u, p.v, _p); const d = Math.hypot(_p[0] - wx, (_p[1] - 2.5 * RES - wy) * .8); if (d < bd) { bd = d; best = { person: p }; } }
  if (best) return best;
  const t = isoPick(aim); if (!t) return null;
  const k = tidx(t[0], t[1]);
  if (thing[k] === T_BUILDING || thing[k] === T_FIELD) return { building: HOME.buildings[ref[k]] };
  if (thing[k] === T_TREE) return { text: `a ${trees[ref[k]].kind} (wood)` };
  if (thing[k] === T_SAPLING) return { text: 'a young tree, growing' };
  if (thing[k] === T_STUMP) return { text: 'a stump: it will sprout again' };
  if (thing[k] === T_ROCK) return { text: `${rocks[ref[k]].big ? 'boulders' : 'a rock'}: ${rocks[ref[k]].stone} stone left` };
  if (thing[k] === T_BUSH) return { text: `lingonberries: ${bushes[ref[k]].berries} left` };
  return null;
}
function hoverText(h) {
  if (!h) return '';
  if (h.person) return `${h.person.name.toUpperCase()}: ${h.person.doing}`;
  if (h.text) return h.text.toUpperCase();
  const b = h.building, d = BUILDINGS[b.type];
  if (!b.done) return `${d.name.toUpperCase()}: being built, ${Math.round(b.progress * 100)}%${b.builder ? ` (${b.builder.name})` : ' (waiting for a builder)'}`;
  const nobody = 'no one free to work here (newcomers come when there are beds and food)';
  if (b.type === 'field') return `BARLEY FIELD: ${['ploughed', 'sprouting', 'growing', 'ripe', 'stubble'][b.stage]}${FOLK.some(p => p.job && p.job.type === 'farmer') ? '' : `: ${nobody}`}`;
  const w = d.job ? (b.worker ? `${b.worker.name}: ${b.worker.doing}` : nobody) : d.help;
  return `${d.name.toUpperCase()}: ${w}`;
}

// the mouse over the map: where it is while it is on the canvas (mouseAim forgets a cursor that stands still, and an RTS
// player rests the mouse on the edge to scroll); none on a touch screen
const pointer = () => Input.mouseSeen && !touchShown() ? [Input.mouseX, Input.mouseY] : null;

// ---------- one step ----------
function gameUpdate(dt) {
  const aim = pointer();
  if (state === 'play') {
    // scroll: keys, on-screen arrows, or the mouse at the edge of the view
    const sp = 70 * dt, k = (a, b) => keyDown(a, b) ? 1 : 0;
    let sx = k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA') + (Input.touch.right ? 1 : 0) - (Input.touch.left ? 1 : 0);
    let sy = k('ArrowDown', 'KeyS') - k('ArrowUp', 'KeyW') + (Input.touch.down ? 1 : 0) - (Input.touch.up ? 1 : 0);
    if (aim && TUNE.edgeScroll) { sx += aim[0] < .015 ? -1 : aim[0] > .985 ? 1 : 0; sy += aim[1] < .02 ? -1 : aim[1] > .98 ? 1 : 0; }
    // held inside the map, as the engine holds the camera: past the edge, scrolling back would first have to undo the overrun
    CAM[0] = clamp(CAM[0] + sx * sp, 0, Math.max(0, W - R.cols) / RES); CAM[1] = clamp(CAM[1] + sy * sp, 0, (H * ASPECT - R.rows * ASPECT) / RES);
    HOVER = hoverAt(aim);
    if (Input.pressed.has('Tap') && Input.aim) { const m = menuAt(Input.aim); if (m) select(m.type); else clickMap(Input.aim); }
    if (Input.pressed.has('TapAlt')) SEL = null;
    for (let s = 0; s < FAST; s++) stepGame(dt);
  } else if (Input.pressed.has('Tap') && state !== 'paused') advance();
  else if (state === 'won') { for (let s = 0; s < FAST; s++) stepGame(dt); }
  updateCamera(0, true);
}
function stepGame(dt) {
  stepTime(dt); stepFields(dt); stepShip(dt);
  if ((assignT -= dt) <= 0) { assignT = .5; assignJobs(); }
  stepFolk(dt); stepAnimals(dt);
  if (HOME.season === 3) for (let n = 0; n < 30 * RES * dt * (1 + Math.random()); n++)   // snow over the view
    spawnP(PT_SNOW, cam.x + Math.random() * R.cols, cam.y - 2 * RES + Math.random() * R.rows * ASPECT * .6, 0, rr(5, 9) * RES, rr(4, 8), Math.random() < .3 ? 42 : 46, 0);
  const home = built('longhouse')[0];
  if (home && Math.random() < dt * 1.5) { isoToWorld(home.i + 1.5, home.j + 1, _p); spawnP(PT_SMOKE, _p[0] + rr(-1, 1) * RES, _p[1] - 14 * RES, rr(-2, 2) * RES, rr(-6, -3) * RES, rr(2, 4), pick('.,:'), 0); }
  if (!home && Math.random() < dt * 2) { isoToWorld(LANDING[0] + 1.5, LANDING[1] - .5, _p); spawnP(PT_SMOKE, _p[0], _p[1] - 2 * RES, rr(-2, 2) * RES, rr(-6, -3) * RES, rr(1.5, 3), pick('.,:'), 0); }
}
const PT_SNOW = defineParticle({
  gravity: 0, drag: 0,
  update(i, dt) { P.vx[i] = Math.sin(P.age[i] * 1.7 + i) * 3 * RES; },
  look(i, k, life, time, out) { out[0] = 1.1; out[1] = 1.15; out[2] = 1.25; return P.g[i]; }
});
function advance() {
  if (state === 'title') { setState('play'); say('BUILD A LONGHOUSE BEFORE WINTER [1]'); }
  else if (state === 'lost' && stateT > 1) { SEED++; newGame(); setState('play'); }
  else if (state === 'won' && stateT > 1) setState('play');
}
function gameKey(code) {
  if (state === 'title' || state === 'won' || state === 'lost') { if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') advance(); return; }
  if (code === 'KeyP' || (code === 'Escape' && !SEL && !HELP)) { setState(state === 'play' ? 'paused' : 'play'); return; }
  if (state !== 'play') return;
  const n = code.startsWith('Digit') ? +code.slice(5) : code.startsWith('Numpad') ? +code.slice(6) : 0;
  if (n >= 1 && n <= BUILD_ORDER.length) select(BUILD_ORDER[n - 1]);
  else if (code === 'Escape') { SEL = null; HELP = false; }
  else if (code === 'KeyF') { FAST = FAST === 1 ? 3 : 1; say(FAST > 1 ? 'TIME RUNS THREE TIMES AS FAST' : 'TIME AT NORMAL SPEED'); }
  else if (code === 'KeyH') HELP = !HELP;
  else if (code === 'Home' || code === 'KeyC') centreOn(store());
}
function centreOn(s) { isoToWorld(s[0] + s[2] / 2, s[1] + s[3] / 2, _p); CAM[0] = _p[0] / RES - R.cols / RES / 2; CAM[1] = _p[1] / RES - R.rows * ASPECT / RES / 2; }

// ---------- light: the day, the seasons, the hearth ----------
const SUN_BY_SEASON = [[1, .96, .88], [1.05, 1, .86], [1, .86, .66], [.82, .88, 1]];
function daylight() { const t = HOME.tod; return t < .08 ? t / .08 : t < .62 ? 1 : t < .72 ? 1 - (t - .62) / .1 : 0; }
function setSky() {
  const d = smooth(daylight()), c = SUN_BY_SEASON[HOME.season], s = HOME.season === 3 ? .78 : .9;
  if (d > .02) setSun(25 + 40 * Math.sin(Math.min(1, HOME.tod / .72) * Math.PI), [c[0] * d * s, c[1] * d * s, c[2] * d * s]); else setSun(null);
  setAmbient([lerp(.16, .32, d), lerp(.19, .34, d), lerp(.34, .40, d)]);
}
function gameLights(t, out) {
  if (!HOME) return;
  setSky();
  const night = 1 - smooth(daylight()), S = RES;
  const home = built('longhouse')[0];
  if (home) { isoToWorld(home.i + home.w, home.j + home.h * .5, _p); out.push({ x: _p[0], y: _p[1] - 3 * S, r: 34 * S, c: [1, .62, .3], I: .4 + 1.5 * night, flicker: 'candle', seed: 3, shadow: false }); }
  else { isoToWorld(LANDING[0] + 1.5, LANDING[1] - .5, _p); out.push({ x: _p[0], y: _p[1] - 1 * S, r: 26 * S, c: [1, .6, .28], I: .3 + 1.6 * night, flicker: 'candle', seed: 5, shadow: false }); }
  for (const b of built('smithy')) { isoToWorld(b.i + b.w, b.j + 1, _p); out.push({ x: _p[0], y: _p[1] - 3 * S, r: 18 * S, c: [1, .5, .2], I: .5 + night, flicker: 'candle', seed: 9, shadow: false }); }
  for (const b of built('fishing')) if (night > .3) { isoToWorld(b.i + b.w, b.j + b.h * .5, _p); out.push({ x: _p[0], y: _p[1] - 4 * S, r: 14 * S, c: [1, .75, .4], I: night, flicker: 'candle', seed: b.i, shadow: false }); }
}

// ---------- drawing: everything on the ground, back to front ----------
const onScreen = (x, y, m) => x > cam.x - m && x < cam.x + R.cols + m && y > cam.y - m && y < cam.y + R.rows * ASPECT + m * 2.5;
function gameDraw(t) {
  if (!HOME) return;
  const items = [], S = RES, m = 26 * S, put = (spr, u, v, o = {}) => { isoToWorld(u, v, _p); if (onScreen(_p[0], _p[1], m)) { const x = _p[0], y = _p[1]; items.push({ u: o.du ?? u, v: o.dv ?? v, draw: () => drawSprite(spr, x, y, 0, { cache: true, flip: o.flip }) }); } };
  // fields lie flat on the ground: under everything
  for (const f of HOME.buildings) if (f.type === 'field') {
    isoToWorld(f.i + f.w / 2, f.j + f.h, _p);
    if (onScreen(_p[0], _p[1], m)) drawSprite(FJ.field[f.done ? f.stage : 0], _p[0], _p[1], 0, { cache: true });
  }
  // trees, saplings, stumps, rocks, bushes
  for (const tr of trees) {
    const th = thing[tidx(tr.i, tr.j)];
    if (th === T_TREE) put(tr.kind === 'pine' ? FJ.pine : FJ.birch[HOME.season], tr.i + .5, tr.j + .5, { flip: (tr.i * 7 + tr.j) % 2 === 0 });
    else if (th === T_SAPLING) put(FJ.sapling, tr.i + .5, tr.j + .5);
    else if (th === T_STUMP) put(FJ.stump, tr.i + .5, tr.j + .5);
  }
  for (const r of rocks) if (r.stone > 0) put(r.big ? FJ.boulders : FJ.rock, r.i + .5, r.j + .5, { flip: r.i % 2 === 0 });
  for (const b of bushes) if (thingAt(b.i, b.j) === T_BUSH) put(FJ.bush, b.i + .5, b.j + .5);
  // buildings: drawn on their footprint's front corner, sorted by its middle
  for (const b of HOME.buildings) if (b.type !== 'field') {
    const spr = b.done ? FJ.build[b.type] : FJ.site[b.type];
    put(spr, b.i + b.w / 2 + .5, b.j + b.h / 2 + .5, { du: b.i + b.w / 2, dv: b.j + b.h / 2 });
  }
  // the store: piles of what the homestead has, beside the longhouse (or the camp on the beach)
  const s = store(), front = [s[0] + s[2] + .35, s[1] + s[3] - .2];
  const piles = [['logs', HOME.stock.wood], ['planks', HOME.stock.planks], ['stones', HOME.stock.stone], ['grain', HOME.stock.food], ['fish', HOME.stock.food > 20]];
  piles.filter(([, n]) => n > 0).forEach(([g], q) => put(FJ.goods[g], front[0] + (q % 2) * .6, front[1] - q * .55));
  // people and animals
  for (const p of FOLK) if (!p.hidden) { const f = personFrame(p, t); put(f.spr, p.u, p.v, { flip: f.flip }); }
  for (const a of ANIMALS) { const f = walkFrame(FJ[a.kind], a.dx, a.dy, a.phase, a.path.length > 0); put(f.spr, a.u, a.v, { flip: f.flip }); }
  for (const o of BOATS) put(FJ.rowboat, o.u, o.v, { flip: true });
  if (HOME.ship) put(FJ.knarr, HOME.ship.u, HOME.ship.v, { flip: true, du: N, dv: N });
  // the building being placed: its sprite where it would stand, outlined green (fits) or red (and why not)
  let ghost = null;
  const aim = pointer(), tile = state === 'play' && SEL && aim && !menuAt(aim) ? isoPick(aim) : null;
  if (tile) {
    const [i, j] = footAt(SEL, tile), b = BUILDINGS[SEL];
    ghost = { i, j, b, why: placeProblem(SEL, i, j) };
    if (SEL !== 'field') put(FJ.build[SEL], i + b.w / 2 + .5, j + b.h / 2 + .5, { du: N * 3, dv: N * 3 });
  }
  isoDraw(items);
  if (ghost) isoOutline(ghost.i, ghost.j, ghost.b.w, ghost.b.h, ghost.why ? [1.6, .35, .25] : [.5, 1.6, .6]);
  else if (HOVER && HOVER.building) { const b = HOVER.building; isoOutline(b.i, b.j, b.w, b.h, [1.5, 1.1, .4]); }
  // the camp fire on the beach until the longhouse stands
  if (!built('longhouse').length) { isoToWorld(LANDING[0] + 1.5, LANDING[1] - .5, _p); const f = flickerAt('candle', t, 5); putEmit(Math.floor(_p[0]), Math.floor(_p[1] / ASPECT) - 1, pick('^*'), 1.6 * f + .4, .8 * f + .2, .2); }
  for (const r of RAVENS) drawSprite(FJ.raven[Math.floor(r.t * 5) % 2], r.x, r.y, 0, { cache: true });
}
function personFrame(p, t) {
  const set = FJ[p.kind === 'child' ? 'child' : p.kind], moving = p.task === 'walk' || p.task === 'carry';
  const beat = Math.floor(t * 3) % 2;
  if (!moving && p.anim) {
    const flip = p.dx < -.01;
    if (p.kind === 'father') return { spr: p.anim === 'chop' || p.anim === 'work' ? (beat ? set.chop : set.stand) : set.stand, flip };
    if (p.kind === 'mother') return { spr: set.reap[beat], flip };
  }
  if (p.carry === 'log' && set.logSe) return walkFrame(set, p.dx, p.dy, p.phase, moving, set.logSe, set.logNe);
  if ((p.carry === 'fish' || p.carry === 'berries') && set.basketSe) return walkFrame(set, p.dx, p.dy, p.phase, moving, set.basketSe, set.basketNe);
  return walkFrame(set, p.dx, p.dy, p.phase, moving);
}

// ---------- HUD ----------
// the forest as a share of the first one: amber when the deer are close to leaving, red once they have
function forestStat() {
  const pct = Math.round(grownTrees() / HOME.forest0 * 100);
  return [`FOREST ${pct}%`, HOME.deerGone ? HC.red : pct < TUNE.deerForest + 4 ? HC.amber : HC.dim];
}
function gameHud(t) {
  if (state === 'title') {
    msgBox([
      ['F J O R D H E I M', HC.gold], ["A Viking family's first year by the fjord", HC.amber], ['', HC.txt],
      ['Ulf, Sigrid and little Eir have landed on an empty shore.', HC.txt],
      ['Build them a homestead and see them through the first winter.', HC.txt],
      ['They do the work themselves: you choose what to build.', HC.dim], ['', HC.txt],
      ['BUILD  1-9 or click the bar     PLACE  click     CANCEL  right click / Esc', HC.txt],
      ['SCROLL  arrows / WASD / screen edge     FASTER  F     HELP  H', HC.txt], ['', HC.txt],
      [((t * 1.5) | 0) % 2 ? '[ PRESS ENTER OR CLICK TO BEGIN ]' : '', HC.amber]
    ]);
    return;
  }
  // top: the season and the stock
  const d = daylight(), clock = d > .5 ? 'DAY' : HOME.tod > .72 ? 'NIGHT' : 'DUSK';
  hudText(1, 0, 'FJORDHEIM', HC.gold);
  hudText(12, 0, `${SEASONS[HOME.season]} ${HOME.day}/${daysPerSeason()}  YEAR ${HOME.year}  ${clock}${FAST > 1 ? '  x3' : ''}`, HC.txt);
  const st = HOME.stock, low = (n, w) => n < w ? HC.red : HC.txt;
  hudFlow(1, [[`WOOD ${st.wood}`, HOME.season === 3 ? low(st.wood, 4) : HC.txt], [`PLANKS ${st.planks}`, HC.txt], [`STONE ${st.stone}`, HC.txt],
    [`FOOD ${Math.floor(st.food)}/${foodCap()}`, low(st.food, FOLK.length * 2)], [`FOLK ${FOLK.length}/${Math.max(beds(), 3)}`, HC.txt], forestStat()]);
  // what needs doing
  const left = HOME.season < 3 ? (3 - HOME.season) * daysPerSeason() - HOME.day + 1 : 0;
  const goal = !built('longhouse').length ? (HOME.buildings.some(b => b.type === 'longhouse') ? 'THE LONGHOUSE IS GOING UP' : 'BUILD A LONGHOUSE [1]: the family has no roof')
    : HOME.season < 3 ? `WINTER IN ${left} DAY${left === 1 ? '' : 'S'}: store food and wood` : `WINTER: ${daysPerSeason() - HOME.day + 1} NIGHTS TO SPRING`;
  hudText(1, 3, goal, HOME.hunger || HOME.cold ? HC.red : HC.dim);
  // bottom: the build bar, and what the cursor is over
  MENU = [];
  let c = 1, r = R.hrows - 1;
  const items = BUILD_ORDER.map((type, n) => ({ type, txt: `[${n + 1}] ${BUILDINGS[type].name.toUpperCase()} ${costText(type)}` }));
  const rows = []; let row = [];
  for (const it of items) { if (c + it.txt.length > R.hcols - 1 && row.length) { rows.push(row); row = []; c = 1; } row.push({ ...it, c0: c }); c += it.txt.length + 2; }
  rows.push(row);
  rows.forEach((rw, q) => { const rr0 = R.hrows - rows.length + q; for (const it of rw) {
    const on = SEL === it.type, ok = affordable(it.type);
    hudText(it.c0, rr0, it.txt, on ? HC.amber : ok ? HC.txt : HC.dim);
    MENU.push({ type: it.type, r: rr0, c0: it.c0, c1: it.c0 + it.txt.length });
  } });
  r = R.hrows - rows.length - 1;
  const info = SEL ? (() => { const aim = pointer(), tile = aim && isoPick(aim), why = tile && placeProblem(SEL, ...footAt(SEL, tile));
    return [`${BUILDINGS[SEL].name.toUpperCase()}: ${BUILDINGS[SEL].help}${why ? `  (${why})` : '  (click to build)'}`, why ? HC.red : HC.green]; })()
    : [hoverText(HOVER), HC.cyan];
  hudText(1, r, info[0].slice(0, R.hcols - 2), info[1]);
  for (const tx of FX.texts) { const p = worldToHud(tx.x, tx.y - tx.age * 5 * RES, [0, 0]); hudText(p[0] - (tx.text.length >> 1), p[1], tx.text, tx.c); }
  if (HELP) msgBox([
    ['HOW FJORDHEIM WORKS', HC.gold], ['', HC.txt],
    ['Everyone eats every morning (the child half). In winter the', HC.txt], ['longhouse burns 2 wood a night. Three hungry or cold days', HC.txt],
    ['and the family gives up. Reach the second spring to win.', HC.txt], ['', HC.txt],
    ['Adults build first, then work the huts and fields, then break', HC.txt], ['stone. A woodcutter plants a tree for every two he fells:', HC.txt],
    ['cut the forest too thin and the deer leave. Newcomers arrive by', HC.txt], ['knarr when there are beds, a well and food to spare.', HC.txt], ['', HC.txt],
    ['H closes this', HC.dim]]);
  if (state === 'paused') msgBox([['PAUSED', HC.amber], ['P or Esc to go on', HC.dim]]);
  if (state === 'won' && stateT > .5) msgBox([['FJORDHEIM STANDS', HC.green], ['The family saw the winter through.', HC.txt], ['Spring has come to the fjord.', HC.txt], ['', HC.txt],
    [`${FOLK.length} live here now, in ${HOME.buildings.filter(b => b.done).length} buildings. ${grownTrees()} trees stand.`, HC.dim], ['', HC.txt], ['[ ENTER / CLICK ]  KEEP BUILDING', HC.amber]]);
  if (state === 'lost' && stateT > .5) msgBox([['THE FAMILY SAILED HOME', HC.red], [HOME.lost.split(': ')[1] || '', HC.txt], ['', HC.txt], ['[ ENTER / CLICK ]  A NEW SHORE', HC.amber]]);
}

Glyphite.run({
  id: 'fjordheim',
  detail: { default: 2.5, narrow: 2 },
  particles: 6000, cameraTop: 0, stars: 1,
  keys: { pause: false },
  touch: [[{ label: '[ < ]', aria: 'Scroll left', hold: 'left' }, { label: '[ ^ ]', aria: 'Scroll up', hold: 'up' }, { label: '[ v ]', aria: 'Scroll down', hold: 'down' }, { label: '[ > ]', aria: 'Scroll right', hold: 'right' }]],
  init() { makeArt(); newGame(); setState('title'); },
  regenerate() { buildWorld(); },
  update: gameUpdate, onKey: gameKey, lights: gameLights, draw: gameDraw, hud: gameHud,
  camera(VW, VH, out) { out[0] = CAM[0] * RES; out[1] = CAM[1] * RES; },
  start() { if (state === 'title') advance(); },
  probe: () => HOME && ({
    season: SEASONS[HOME.season], day: HOME.day, year: HOME.year, tod: +HOME.tod.toFixed(2), stock: { ...HOME.stock, food: Math.floor(HOME.stock.food) },
    folk: FOLK.map(p => ({ name: p.name, job: p.job && p.job.type, doing: p.doing, tile: [p.ti, p.tj] })),
    buildings: HOME.buildings.map(b => ({ type: b.type, done: b.done, progress: +b.progress.toFixed(2), stage: b.stage })),
    trees: grownTrees(), deer: ANIMALS.filter(a => a.kind === 'deer').length, hunger: HOME.hunger, cold: HOME.cold, won: HOME.won, lost: HOME.lost
  })
});
