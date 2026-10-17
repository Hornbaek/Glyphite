'use strict';
// ===================== GAME · Fjordheim: input, camera, drawing, HUD and the hooks handed to the engine =====================
// States: title → play ⇄ paused → won (the second spring: play on) or lost (the family sailed home). The engine runs the loop;
// the map is isometric (engine/12_iso.js): the ground in the back wall, everything standing on it a sprite, drawn back to front.
const CAM = [0, 0];          // the view's top-left, in base units (world units / RES), so it survives a detail change
let SEL = null, HOVER = null, MENU = [], PANELS = [], FAST = 1, HELP = false, assignT = 0, SEED = 7;
let PEND = null;        // on a touch screen: where the chosen building would stand, until a second tap there builds it
let BUILDMENU = false;  // the build menu is open
let PICK = null, RAZE = null;   // the building whose panel is open; RAZE: the same, once [TEAR DOWN] was pressed (again to do it)
let NEWS = [];          // the messages under the top rows, newest last: { text, col, age, life }
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
  closeAll(); HOVER = null; FAST = 1; NEWS = [];
}
// the world grid for the current detail level: the map, the ground painted into it, the sea and hills round its edges
function buildWorld() {
  isoInit(N, N, { tile: TILE, top: 20, bottom: 14 });
  paintGround(HOME ? HOME.season : 0);
  const sea = GROUND_MAT[G_WATER], hill = FELL_MAT;
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const k = cy * W + cx; if (backCells[k]) continue;
    worldToIso(cx + .5, (cy + .5) * ASPECT, _p);
    backCells[k] = _p[0] + _p[1] > N || _p[1] > N - 8 ? sea : hill;
  }
  setGravity(1.62);
}

// ---------- choosing, placing, picking ----------
// The bottom of the screen holds one thing at a time, opening upwards from the BUILD button: the build menu, the building
// being placed, or the panel of a building that was clicked (pause it, tear it down). A touch screen has no cursor to show
// where a building would go, so there the first tap on the map shows it and a second tap on the same spot builds it; a
// mouse shows it under the cursor, and a click builds.
const TOUCH = () => Input.pointer === 'touch';
function closeAll() { BUILDMENU = false; SEL = null; PEND = null; PICK = null; RAZE = null; }
function toggleMenu() { const open = !BUILDMENU; closeAll(); BUILDMENU = open; Sfx.tone(open ? 620 : 420, .04, .04, 'square'); }
function select(type) {
  PEND = null;
  if (SEL === type) { SEL = null; return; }
  if (!affordable(type)) { news(`${BUILDINGS[type].name.toUpperCase()} NEEDS ${lacking(type)}`, HC.red); Sfx.tone(160, .12, .06); return; }
  closeAll(); SEL = type; Sfx.tone(660, .05, .05, 'square');
}
function pickBuilding(b) { closeAll(); PICK = b; Sfx.tone(560, .04, .04, 'square'); }
const canPause = b => b.done && !!BUILDINGS[b.type].job;
// [TEAR DOWN] asks first: pressed once it turns red and asks if you are sure, pressed again it pulls the building down
function razePressed() {
  if (!PICK) return;
  if (RAZE !== PICK) { RAZE = PICK; Sfx.tone(240, .08, .05, 'square'); return; }
  tearDown(PICK); closeAll(); HOVER = null;
}
// the footprint's top corner for a building centred on a tile
function footAt(type, t) { const b = BUILDINGS[type]; return [t[0] - ((b.w - 1) >> 1), t[1] - ((b.h - 1) >> 1)]; }
// a tap or click (let go where it began: a drag pans the view instead)
function tap(aim) {
  if (HELP) { HELP = false; return; }
  const m = menuAt(aim);
  if (m) { m.act(); return; }
  if (onPanel(aim)) return;
  if (BUILDMENU) { BUILDMENU = false; return; }   // a tap beside the open menu closes it
  if (!SEL) {   // a building opens its panel; anything else is told about at the bottom
    const h = hoverAt(aim);
    if (h && h.building) pickBuilding(h.building); else { PICK = null; RAZE = null; }
    HOVER = h; return;
  }
  const t = isoPick(aim); if (!t) return;
  const f = footAt(SEL, t);
  if (TOUCH() && !(PEND && PEND[0] === f[0] && PEND[1] === f[1])) { PEND = f; Sfx.tone(520, .04, .04, 'square'); return; }
  const why = placeProblem(SEL, ...f);
  if (why) { news(`NOT HERE: ${why}`, HC.red); Sfx.tone(160, .12, .06); return; }
  placeBuilding(SEL, ...f); Sfx.thud(3); PEND = null;
  if (SEL !== 'field' || !affordable(SEL)) SEL = null;
}
// where the chosen building would stand: under the mouse, or where a touch screen was tapped
function ghostFoot() {
  if (state !== 'play' || !SEL) return null;
  if (TOUCH()) return PEND;
  const aim = pointer(), t = aim && !onHud(aim) && isoPick(aim);
  return t ? footAt(SEL, t) : null;
}
// the HUD's buttons (a word, or a whole entry of the build menu), nearest first; a finger gets most of a row and a column
// of slack round each
function menuAt(aim) {
  const fx = aim[0] * R.hcols, fy = aim[1] * R.hrows, sx = TOUCH() ? 1 : 0, sy = TOUCH() ? .7 : 0;
  let best = null, bd = 1e9;
  for (const m of MENU) {
    const dx = Math.max(m.c0 - fx, fx - m.c1, 0), dy = Math.max(m.r0 - fy, fy - m.r1 - 1, 0);
    if (dx <= sx && dy <= sy && dx + dy < bd) { bd = dx + dy; best = m; }
  }
  return best;
}
// the panels at the bottom: a tap on one never reaches the map behind it
const onPanel = aim => PANELS.some(([c0, r0, c1, r1]) => aim[0] * R.hcols >= c0 && aim[0] * R.hcols < c1 && aim[1] * R.hrows >= r0 && aim[1] * R.hrows < r1);
const onHud = aim => !!menuAt(aim) || onPanel(aim);
function hudButton(id, c, r, txt, col, act) { hudText(c, r, txt, col); MENU.push({ id, c0: c, c1: c + txt.length, r0: r, r1: r, act }); }
function hudPanel(c, r, w, h) { hudBox(c, r, w, h, HC.dim, true); PANELS.push([c, r, c + w, r + h]); }

// what is under the cursor: a person (on their figure, drawn in front of what stands behind them), else a building (on
// its drawing, which rises far above its footprint; a finger gets some slack), else whatever is on that tile
function hoverAt(aim) {
  if (!aim) return null;
  const wx = cam.x + aim[0] * R.cols, wy = cam.y + aim[1] * R.rows * ASPECT;
  for (const p of FOLK) {
    if (p.hidden) continue;
    isoToWorld(p.u, p.v, _p);
    if (Math.abs(_p[0] - wx) < 1.5 * RES && wy < _p[1] + .5 * RES && wy > _p[1] - 6.5 * RES) return { person: p };
  }
  const b = buildingAt(wx, wy, TOUCH() ? 1.5 * RES : 0); if (b) return { building: b };
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
// the building whose drawing has paint under a world point (or within s of it), the frontmost as drawn
function buildingAt(wx, wy, s) {
  let best = null, bd = -1;
  for (const b of HOME.buildings) {
    const art = buildingArt(b), spr = art.spr, k = spr.k * RES, fl = art.flip ? -1 : 1, depth = b.i + b.j + (b.w + b.h) / 2;
    if (depth <= bd) continue;
    isoToWorld(b.i + b.w, b.j + b.h, _p);
    const on = (dx, dy) => {
      const c = Math.floor((wx + dx - _p[0]) * fl / k + spr.ox), r = Math.floor((wy + dy - _p[1]) / k + spr.oy);
      return c >= 0 && r >= 0 && c < spr.w && r < spr.h && spr.idx[r * spr.w + c] !== 255;
    };
    if (on(0, 0) || (s && (on(s, 0) || on(-s, 0) || on(0, s) || on(0, -s)))) { bd = depth; best = b; }
  }
  return best;
}
function hoverText(h) {
  if (!h) return '';
  if (h.person) return `${h.person.name.toUpperCase()}: ${h.person.doing}`;
  if (h.text) return h.text.toUpperCase();
  return `${BUILDINGS[h.building.type].name.toUpperCase()}: ${buildingStatus(h.building)}`;
}
// how a building is doing, in a few words
function buildingStatus(b) {
  const d = BUILDINGS[b.type], nobody = 'no one free to work here yet';
  if (!b.done) return `being built, ${Math.round(b.progress * 100)}%${b.builder ? ` (${b.builder.name})` : ' (waiting for a builder)'}`;
  if (b.paused) return 'paused: nobody works here';
  if (b.type === 'field') return `${['ploughed', 'sprouting', 'growing', 'ripe', 'stubble'][b.stage]}${FOLK.some(p => p.job && p.job.type === 'farmer') ? '' : `: ${nobody}`}`;
  return d.job ? (b.worker ? `${b.worker.name}: ${b.worker.doing}` : nobody) : d.help;
}

// the mouse over the map: where it is while it is on the canvas (mouseAim forgets a cursor that stands still, and an RTS
// player rests the mouse on the edge to scroll); none on a touch screen
const pointer = () => Input.pointer === 'mouse' && Input.mouseSeen ? [Input.mouseX, Input.mouseY] : null;

// ---------- one step ----------
function gameUpdate(dt) {
  const aim = pointer();
  if (state === 'play') {
    // scroll: keys, the mouse at the edge of the view, or dragging the map (a finger, or the mouse)
    const sp = 70 * dt, k = (a, b) => keyDown(a, b) ? 1 : 0;
    let sx = k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA'), sy = k('ArrowDown', 'KeyS') - k('ArrowUp', 'KeyW');
    if (aim && TUNE.edgeScroll && !Input.held) { sx += aim[0] < .015 ? -1 : aim[0] > .985 ? 1 : 0; sy += aim[1] < .02 ? -1 : aim[1] > .98 ? 1 : 0; }
    const dx = sx * sp - Input.drag[0] * R.cols / RES, dy = sy * sp - Input.drag[1] * R.rows * ASPECT / RES;
    // held inside the map, as the engine holds the camera: past the edge, scrolling back would first have to undo the overrun
    CAM[0] = clamp(CAM[0] + dx, 0, Math.max(0, W - R.cols) / RES); CAM[1] = clamp(CAM[1] + dy, 0, (H * ASPECT - R.rows * ASPECT) / RES);
    if (Input.pointer === 'mouse') HOVER = aim && !onHud(aim) ? hoverAt(aim) : null;   // on a touch screen, what was tapped last
    // a release left over from the tap that started the game is not a click on the map
    if (Input.pressed.has('TapUp') && Input.aim && stateT > .4) tap(Input.aim);
    if (Input.pressed.has('TapAlt')) closeAll();
    for (let s = 0; s < FAST; s++) stepGame(dt);
  } else if (Input.pressed.has('Tap') && state !== 'paused') advance();
  else if (state === 'won') { for (let s = 0; s < FAST; s++) stepGame(dt); }
  for (const m of NEWS) m.age += dt;   // real time, whatever the game's speed; held while paused
  NEWS = NEWS.filter(m => m.age < m.life);
  updateCamera(0, true);
}
// a message under the top rows, for 6 to 10 seconds by its length; the same one again starts its time over
function news(text, col = HC.cyan) {
  const old = NEWS.find(m => m.text === text);
  if (old) { old.age = 0; return; }
  NEWS.push({ text, col, age: 0, life: clamp(4 + text.length * .07, 6, 10) });
  if (NEWS.length > 4) NEWS.shift();
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
  if (state === 'title') { setState('play'); news(`BUILD A LONGHOUSE BEFORE WINTER: ${TOUCH() ? 'tap' : 'press B or click'} BUILD`, HC.gold); }
  else if (state === 'lost' && stateT > 1) { SEED++; newGame(); setState('play'); }
  else if (state === 'won' && stateT > 1) setState('play');
}
function gameKey(code) {
  if (state === 'title' || state === 'won' || state === 'lost') { if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') advance(); return; }
  if (code === 'KeyP' || (code === 'Escape' && !SEL && !HELP && !BUILDMENU && !PICK)) { setState(state === 'play' ? 'paused' : 'play'); return; }
  if (state !== 'play') return;
  const n = code.startsWith('Digit') ? +code.slice(5) : code.startsWith('Numpad') ? +code.slice(6) : 0;
  if (n >= 1 && n <= BUILD_ORDER.length) select(BUILD_ORDER[n - 1]);
  else if (code === 'Escape') { closeAll(); HELP = false; }
  else if (code === 'KeyB') toggleMenu();
  else if ((code === 'Delete' || code === 'KeyX') && PICK) razePressed();
  else if (code === 'KeyF') toggleFast();
  else if (code === 'KeyH') HELP = !HELP;
  else if (code === 'Home' || code === 'KeyC') centreOn(store());
}
function toggleFast() { FAST = FAST === 1 ? 3 : 1; NEWS = NEWS.filter(m => !m.text.startsWith('TIME ')); news(FAST > 1 ? 'TIME RUNS THREE TIMES AS FAST' : 'TIME AT NORMAL SPEED'); }
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
  // fields lie flat on the ground, under everything, on their footprint's front corner
  for (const f of HOME.buildings) if (f.type === 'field') {
    const art = buildingArt(f); isoToWorld(f.i + f.w, f.j + f.h, _p);
    if (onScreen(_p[0], _p[1], m)) drawSprite(art.spr, _p[0], _p[1], 0, { cache: true, flip: art.flip });
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
    const art = buildingArt(b);
    put(art.spr, b.i + b.w, b.j + b.h, { flip: art.flip, du: b.i + b.w / 2, dv: b.j + b.h / 2 });
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
  const foot = ghostFoot();
  if (foot) {
    const [i, j] = foot, b = BUILDINGS[SEL];
    ghost = { i, j, b, why: placeProblem(SEL, i, j) };
    if (SEL !== 'field') put(FJ.build[SEL].spr, i + b.w, j + b.h, { flip: FJ.build[SEL].flip, du: N * 3, dv: N * 3 });
  }
  isoDraw(items);
  if (ghost) isoOutline(ghost.i, ghost.j, ghost.b.w, ghost.b.h, ghost.why ? [1.6, .35, .25] : [.5, 1.6, .6]);
  else {   // the building whose panel is open, bright; the one under the mouse, fainter
    if (PICK) isoOutline(PICK.i, PICK.j, PICK.w, PICK.h, [1.8, 1.5, .5]);
    if (HOVER && HOVER.building && HOVER.building !== PICK) { const b = HOVER.building; isoOutline(b.i, b.j, b.w, b.h, [1.1, .8, .3]); }
  }
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
// Every good has an icon, a glyph in a colour of its own (GOODS): the stock along the top, the costs in the build menu.
// Buildings have small pictures, their own drawings on the HUD grid (hudSprite).
const FOLK_ICON = ['&', [150, 200, 255]], FOREST_ICON = ['^', [110, 205, 100]], SOFT = [132, 144, 162];
const IW = 8, IH = 3, TW = 16, EW = IW + 1 + TW;   // a building's picture (columns, rows); the text beside it; a menu entry
// the forest as a share of the first one: amber when the deer are close to leaving, red once they have
function forestStat() {
  const pct = Math.round(grownTrees() / HOME.forest0 * 100);
  return [FOREST_ICON, `${pct}%`, 'forest', HOME.deerGone ? HC.red : pct < TUNE.deerForest + 4 ? HC.amber : HC.txt];
}
// a key's hint in a text, for a keyboard: " [1]"; nothing on a touch screen
const keyHint = n => TOUCH() ? '' : ` [${n}]`;
// a text broken at spaces into lines of at most w columns
function wrapText(s, w) {
  const out = []; let line = '';
  for (const word of s.split(' ')) { if (line && line.length + 1 + word.length > w) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word; }
  out.push(line);
  return out.map(l => l.slice(0, w));
}
// [[paragraph, colour], ...] → msgBox lines that fit the screen ('' for a blank line)
const wrapBox = (paras, max = 62) => paras.flatMap(([s, col]) => wrapText(s, Math.max(20, Math.min(max, R.hcols - 8))).map(l => [l, col]));
// a cost as icons and numbers ("=8 @4"), each number red while the stock is short of it (check)
function hudCost(c, r, pairs, check) {
  if (!pairs.length) { hudText(c, r, 'FREE', HC.green); return; }
  for (const [g, n] of pairs) { hudText(c, r, GOODS[g][0], GOODS[g][1]); hudText(c + 1, r, `${n}`, check && HOME.stock[g] < n ? HC.red : HC.txt); c += `${n}`.length + 2; }
}
// a building's picture: in the menu a finished one (a field ripe), in its panel as it stands now
function hudIcon(type, c, r, b) {
  const a = b ? buildingArt(b) : type === 'field' ? FJ.field[3] : FJ.build[type];
  hudSprite(a.spr, c, r, IW, { rows: IH, flip: a.flip, gain: 1.7 });
}
// the BUILD button, bottom left, in a frame of its own: it opens and closes the build menu (amber while it or a placing is open)
function buildButton(bottom, touch) {
  const label = touch ? 'BUILD' : '[B] BUILD', w = label.length + 4, r0 = bottom - 2;
  hudPanel(0, r0, w, 3); hudText(2, r0 + 1, label, BUILDMENU || SEL ? HC.amber : HC.gold);
  MENU.push({ id: 'build', c0: 0, c1: w, r0, r1: bottom, act: toggleMenu });
  return w;
}
// the build menu, above the button: each building's picture, its name, what it costs and what it is for (two columns of
// entries fit the 53 columns of a narrow phone)
function buildMenu(bottom, touch) {
  const ncol = clamp(Math.floor((R.hcols - 1) / (EW + 1)), 1, 3), nrow = Math.ceil(BUILD_ORDER.length / ncol);
  const w = ncol * (EW + 1) + 1, h = nrow * (IH + 1) + 1, r0 = bottom - h + 1;
  hudPanel(0, r0, w, h);
  BUILD_ORDER.forEach((type, k) => {
    const d = BUILDINGS[type], c = 1 + (k % ncol) * (EW + 1), r = r0 + 1 + Math.floor(k / ncol) * (IH + 1), tx = c + IW + 1;
    hudIcon(type, c, r);
    hudText(tx, r, d.name.toUpperCase().slice(0, TW), affordable(type) ? HC.txt : HC.dim);
    hudCost(tx, r + 1, Object.entries(d.cost), true);
    if (!touch) hudText(c + EW - 3, r + 1, `[${k + 1}]`, HC.dim);
    hudText(tx, r + 2, d.short, SOFT);
    MENU.push({ id: type, c0: c, c1: c + EW, r0: r, r1: r + IH - 1, act: () => select(type) });
  });
}
// the building being placed: its picture, cost and use, and whether it fits where it is shown
function placePanel(bottom, touch) {
  const d = BUILDINGS[SEL], w = Math.min(R.hcols, 66), h = 6, r0 = bottom - h + 1, tx = 3 + IW, tw = w - tx - 2;
  hudPanel(0, r0, w, h); hudIcon(SEL, 2, r0 + 1);
  hudCost(tx + d.name.length + 2, r0 + 1, Object.entries(d.cost), true); hudText(tx, r0 + 1, d.name.toUpperCase(), HC.amber);
  hudButton('cancel', w - 10, r0 + 1, '[CANCEL]', HC.txt, closeAll);
  wrapText(d.help, tw).slice(0, 2).forEach((l, q) => hudText(tx, r0 + 2 + q, l, SOFT));
  const foot = ghostFoot(), why = foot && placeProblem(SEL, ...foot);
  const [msg, col] = why ? [`not here: ${why}`, HC.red] : !foot ? [touch ? 'tap the map where it should stand' : 'point at where it should stand', HC.cyan]
    : [touch ? 'tap it again to build it here' : 'click to build it here', HC.green];
  hudText(tx, r0 + 4, msg.slice(0, tw), col);
}
// a building's panel: how it is doing, [PAUSE] / [RESUME] for a workplace, [TEAR DOWN] (asks first) and what that gives back
function pickPanel(bottom) {
  const b = PICK, d = BUILDINGS[b.type], w = Math.min(R.hcols, 66), h = 5, r0 = bottom - h + 1, tx = 3 + IW, tw = w - tx - 2;
  hudPanel(0, r0, w, h); hudIcon(b.type, 2, r0 + 1, b);
  hudText(tx, r0 + 1, d.name.toUpperCase(), HC.gold);
  if (b.paused) hudText(tx + d.name.length + 2, r0 + 1, 'PAUSED', HC.amber);
  hudButton('close', w - 5, r0 + 1, '[X]', HC.txt, closeAll);
  hudText(tx, r0 + 2, buildingStatus(b).slice(0, tw), HC.cyan);
  let c = tx;
  if (canPause(b)) { const s = b.paused ? '[RESUME]' : '[PAUSE]'; hudButton('pause', c, r0 + 3, s, b.paused ? HC.green : HC.txt, () => { togglePause(b); RAZE = null; }); c += s.length + 2; }
  const word = b.done ? 'TEAR DOWN' : 'CALL OFF', sure = RAZE === b, s = sure ? `[SURE? ${word}]` : `[${word}]`;
  hudButton('raze', c, r0 + 3, s, sure ? HC.red : HC.txt, razePressed);
  const back = refund(b).filter(([, k]) => k > 0);
  if (back.length) { hudText(c + s.length + 1, r0 + 3, 'back', SOFT); hudCost(c + s.length + 6, r0 + 3, back, false); }
}
function gameHud(t) {
  MENU = []; PANELS = [];
  const touch = TOUCH();
  if (state === 'title') {
    msgBox(wrapBox([
      ['F J O R D H E I M', HC.gold], ["A Viking family's first year by the fjord", HC.amber], ['', HC.txt],
      ['Ulf, Sigrid and little Eir have landed on an empty shore. Build them a homestead and see them through the first winter.', HC.txt],
      ['They do the work themselves: you choose what to build.', HC.dim], ['', HC.txt],
      ...(touch ? [['TAP BUILD to choose a building, TAP the map to see where it would stand, and TAP there again to build it.', HC.txt],
        ['TAP a building to pause its work or tear it down. DRAG to look around. [>>] runs time faster, [?] tells how it all works.', HC.txt]]
        : [['BUILD: B or the BUILD button (1-9 at once). PLACE: click the map. CANCEL: right click or Esc.', HC.txt],
          ['CLICK a building to pause it or tear it down. SCROLL: arrows, WASD, the screen edge or drag. FASTER F. HELP H.', HC.txt]]),
      ['', HC.txt], [((t * 1.5) | 0) % 2 ? (touch ? '[ TAP TO BEGIN ]' : '[ PRESS ENTER OR CLICK TO BEGIN ]') : '', HC.amber]
    ]));
    return;
  }
  // over the map: what was just brought in, and a pause mark on the buildings that are paused
  for (const tx of FX.texts) { const p = worldToHud(tx.x, tx.y - tx.age * 5 * RES, [0, 0]); hudText(p[0] - (tx.text.length >> 1), p[1], tx.text, tx.c); }
  for (const b of HOME.buildings) if (b.paused) { isoToWorld(b.i + b.w / 2, b.j + b.h / 2, _p); const p = worldToHud(_p[0], _p[1] - 4 * RES, [0, 0]); hudText(p[0] - 1, p[1], '||', HC.amber); }
  // top: the season and the time buttons; the stock, an icon and a number each (and the names, when there is room)
  const d = daylight(), clock = d > .5 ? 'DAY' : HOME.tod > .72 ? 'NIGHT' : 'DUSK', wide = R.hcols >= 64, named = R.hcols >= 80;
  if (wide) hudText(1, 0, 'FJORDHEIM', HC.gold);
  hudText(wide ? 12 : 1, 0, `${SEASONS[HOME.season]} ${HOME.day}/${daysPerSeason()}  YEAR ${HOME.year}  ${clock}`, HC.txt);
  hudButton('fast', R.hcols - 10, 0, '[>>]', FAST > 1 ? HC.amber : HC.txt, toggleFast);
  hudButton('help', R.hcols - 5, 0, '[?]', HELP ? HC.amber : HC.txt, () => { HELP = !HELP; });
  const st = HOME.stock, low = (n, w) => n < w ? HC.red : HC.txt;
  const stats = [[GOODS.wood, st.wood, 'wood', HOME.season === 3 ? low(st.wood, 4) : HC.txt], [GOODS.planks, st.planks, 'planks', HC.txt], [GOODS.stone, st.stone, 'stone', HC.txt],
    [GOODS.food, `${Math.floor(st.food)}/${foodCap()}`, 'food', low(st.food, FOLK.length * 2)], [FOLK_ICON, `${FOLK.length}/${Math.max(beds(), 3)}`, 'folk', HC.txt], forestStat()];
  let c = 1;
  for (const [[g, gc], n, name, col] of stats) {
    hudText(c, 1, g, gc); hudText(c + 1, 1, `${n}`, col); c += `${n}`.length + 1;
    if (named) { hudText(c + 1, 1, name.toUpperCase(), SOFT); c += name.length + 1; }
    c += 3;
  }
  // what needs doing, then the news, each for a few seconds, fading at the end
  const left = HOME.season < 3 ? (3 - HOME.season) * daysPerSeason() - HOME.day + 1 : 0;
  const goal = !built('longhouse').length ? (HOME.buildings.some(b => b.type === 'longhouse') ? 'THE LONGHOUSE IS GOING UP' : `BUILD A LONGHOUSE${keyHint(1)}: the family has no roof`)
    : HOME.season < 3 ? `WINTER IN ${left} DAY${left === 1 ? '' : 'S'}: store food and wood` : `WINTER: ${daysPerSeason() - HOME.day + 1} NIGHTS TO SPRING`;
  hudText(1, 2, goal.slice(0, R.hcols - 2), HOME.hunger || HOME.cold ? HC.red : HC.dim);
  let nr = 3;
  for (const m of NEWS) {
    const f = Math.ceil(clamp((m.life - m.age) / 1.5, 0, 1) * 3) / 3, col = f < 1 ? mixC(HC.dim, m.col, f) : m.col;
    for (const line of wrapText(m.text, R.hcols - 2)) hudText(1, nr++, line, col);
  }
  // bottom: the BUILD button, and above it whatever is open; beside it what the mouse is over or what was tapped. On a
  // touch screen the last row stays clear: the phone's gesture bar sits over it.
  const bottom = R.hrows - (touch ? 2 : 1), bw = buildButton(bottom, touch);
  if (BUILDMENU) buildMenu(bottom - 3, touch);
  else if (SEL) placePanel(bottom - 3, touch);
  else if (PICK) pickPanel(bottom - 3);
  const info = !SEL && HOVER && HOVER.building !== PICK ? hoverText(HOVER) : '';
  if (info) { const ls = wrapText(info, R.hcols - bw - 2).slice(0, 3), r = bottom - (ls.length > 2 ? 2 : 1); ls.forEach((l, q) => hudText(bw + 1, r + q, l, HC.cyan)); }
  if (HELP) msgBox(wrapBox([
    ['HOW FJORDHEIM WORKS', HC.gold], ['', HC.txt],
    ['Everyone eats every morning (the child half). In winter the longhouse burns 2 wood a night. Three hungry or cold days and the family gives up. Reach the second spring to win.', HC.txt], ['', HC.txt],
    ['Adults build first, then work the huts and fields, then break stone. A woodcutter plants a tree for every two he fells: cut the forest too thin and the deer leave. Newcomers arrive by knarr when there are beds, a well and food to spare.', HC.txt], ['', HC.txt],
    [`${touch ? 'Tap' : 'Click'} a building to see how it does. PAUSE sends its worker to other work (a paused sawpit leaves the logs alone); TEAR DOWN gives half of what it cost back.`, HC.txt], ['', HC.txt],
    ['= wood   # planks   @ stone   * food   & folk   ^ forest', HC.amber], ['', HC.txt],
    [touch ? 'Tap anywhere to close this' : 'H or a click closes this', HC.dim]]));
  if (state === 'paused') msgBox([['PAUSED', HC.amber], ['P or Esc to go on', HC.dim]]);
  const go = touch ? '[ TAP ]' : '[ ENTER / CLICK ]';
  if (state === 'won' && stateT > .5) msgBox(wrapBox([['FJORDHEIM STANDS', HC.green], ['The family saw the winter through. Spring has come to the fjord.', HC.txt], ['', HC.txt],
    [`${FOLK.length} live here now, in ${HOME.buildings.filter(b => b.done).length} buildings. ${grownTrees()} trees stand.`, HC.dim], ['', HC.txt], [`${go}  KEEP BUILDING`, HC.amber]], 46));
  if (state === 'lost' && stateT > .5) msgBox(wrapBox([['THE FAMILY SAILED HOME', HC.red], [HOME.lost.split(': ')[1] || '', HC.txt], ['', HC.txt], [`${go}  A NEW SHORE`, HC.amber]], 46));
}

Glyphite.run({
  id: 'fjordheim',
  detail: { default: 2.5, narrow: 2 },
  particles: 6000, cameraTop: 0, stars: 1,
  keys: { pause: false },
  init() { makeArt(); newGame(); setState('title'); },
  regenerate() { buildWorld(); },
  update: gameUpdate, onKey: gameKey, lights: gameLights, draw: gameDraw, hud: gameHud,
  camera(VW, VH, out) { out[0] = CAM[0] * RES; out[1] = CAM[1] * RES; },
  start() { if (state === 'title') advance(); },
  probe: () => HOME && ({
    season: SEASONS[HOME.season], day: HOME.day, year: HOME.year, tod: +HOME.tod.toFixed(2), stock: { ...HOME.stock, food: Math.floor(HOME.stock.food) },
    folk: FOLK.map(p => ({ name: p.name, job: p.job && p.job.type, doing: p.doing, tile: [p.ti, p.tj] })),
    buildings: HOME.buildings.map(b => ({ type: b.type, done: b.done, progress: +b.progress.toFixed(2), stage: b.stage, paused: b.paused })),
    trees: grownTrees(), deer: ANIMALS.filter(a => a.kind === 'deer').length, hunger: HOME.hunger, cold: HOME.cold, won: HOME.won, lost: HOME.lost
  })
});
