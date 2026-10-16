// ===================== GAME · sectors, lamps, crumbs, HUD and the hooks handed to the engine =====================
// States: title → play ⇄ dead (back at the last checkpoint) → cleared (the great cheese) → play (next sector) ... → won.
let HINT = null;
const HINTS_SEEN = new Set();
function hint(key, text) { if (!HINTS_SEEN.has(key)) { HINTS_SEEN.add(key); HINT = { text, t: 0 }; } }

function startSector(n) {
  buildSector(n);
  SEC.time = 0;
  spawnMouse(SEC.start[0], SEC.start[1]);
  spawnCats();
  CRUMBLE.clear();
  setState('play'); updateCamera(0, true);
  say(`SECTOR ${n}  ${SEC.def.name}`);
}
// the title screen: the first sector, with Pip standing in the airlock under the title
function showTitle() { buildSector(1); spawnMouse(SEC.start[0], SEC.start[1]); spawnCats(); setState('title'); }
function startGame() { grams = 0; deaths = 0; bots = 0; HINTS_SEEN.clear(); HINT = null; startSector(1); }
function clearSector() {
  if (state !== 'play') return;
  const m = MOUSE.ch;
  grams += 1000; Sfx.win(); setTimeout(() => Sfx.win(), 450);
  for (let k = 0; k < 40 * RES; k++) spawnP(PT_SPARK, m.x, m.y - m.o.h, rr(-30, 30) * RES, -rr(8, 40) * RES, rr(.6, 1.6), pick('*+o'), 0);
  addLight(m.x, m.y - m.o.h, 60 * RES, [1, .85, .4], 2, 1.2);
  setState(SEC.n >= SECTORS.length ? 'won' : 'cleared');
}
function advance() {
  if (state === 'title') startGame();
  else if (state === 'cleared' && stateT > 1.2) startSector(SEC.n + 1);
  else if (state === 'won' && stateT > 2) showTitle();
}

function gameUpdate(dt) {
  if (Input.pressed.has('Tap') && state !== 'play' && state !== 'paused') advance();
  if (state === 'play') { SEC.time += dt; stepMouse(dt); }
  if (state === 'dead' && stateT > 1.3) respawn();
  if (state !== 'title') stepCats(dt);
  if (state === 'play') stepWrecks(dt);
  stepCrumble(dt);
  stepGantries(dt);
  stepCables(dt);
  if (HINT && (HINT.t += dt) > 4.5) HINT = null;
}
function gameKey(code) { if (code === 'Enter' || code === 'NumpadEnter') advance(); }

// ---------- live cables spark now and then; dying lamps and cables buzz when the mouse is near ----------
function stepCables(dt) {
  const S = RES;
  for (const [ty, a, b] of SEC.cableRuns) {
    if (Math.random() > dt * 2.5) continue;
    const x = rr(a, b + 1) * SEC.tw, cx = Math.floor(x);
    let cy = ty * SEC.th; while (cy < (ty + 1) * SEC.th && getC(cx, cy) !== CABLE) cy++;
    if (getC(cx, cy) !== CABLE) continue;
    for (let k = 0; k < 6 * S; k++) spawnP(PT_SPARK, x, cy * ASPECT, rr(-14, 14) * S, -rr(4, 18) * S, rr(.15, .45), pick("*'+"), 0);
    addLight(x, cy * ASPECT, 16 * S, [.5, .7, 1], 1.4, .12);
  }
}
function buzzLevel(t) {
  if (!MOUSE || !MOUSE.alive || state !== 'play') return 0;
  const S = RES, x = MOUSE.ch.x, y = MOUSE.ch.y - MOUSE.ch.o.h / 2;
  let b = 0;
  for (const lp of SEC.lamps) if (lp.kind === 'dying') { const d = Math.hypot(lp.x - x, lp.y - y) / (36 * S); if (d < 1) b = Math.max(b, (1 - d) * (flickerAt('dying', t, lp.seed) > .3 ? 1 : .15)); }
  for (const [ty, a, bb] of SEC.cableRuns) { const d = Math.hypot((a + bb + 1) / 2 * SEC.tw - x, (ty + .7) * SEC.th * ASPECT - y) / (26 * S); if (d < 1) b = Math.max(b, (1 - d) * .7); }
  return b;
}

// ---------- lights ----------
function gameLights(t, out) {
  const S = RES;
  for (const lp of SEC.lamps) out.push({ x: lp.x, y: lp.y, r: (lp.kind === 'alarm' ? 64 : 56) * S, c: lp.c, I: lp.kind === 'alarm' ? 1.9 : 1.55, shadow: true, flicker: lp.kind, seed: lp.seed, skip: 1.2 * S });
  for (const cr of SEC.crumbs) if (!cr.got) out.push({ x: cr.x, y: cr.y, r: 11 * S, c: [1, .78, .32], I: .5, shadow: false });
  if (SEC.goal) out.push({ x: SEC.goal.x, y: SEC.goal.y - SEC.goal.h * .7, r: 44 * S, c: [1, .8, .36], I: 1.1, shadow: true });   // the great cheese glows
  for (const cp of SEC.checkpoints) out.push({ x: cp.x, y: cp.y - 7 * S, r: (cp.on ? 22 : 12) * S, c: cp.on ? [.3, 1, .45] : [1, .3, .2], I: cp.on ? .9 : .5, shadow: true });
  mouseLights(out);
  catLights(out);
}

// ---------- drawing ----------
function gameDraw(t) {
  const S = RES;
  for (const i of SEC.signCells) if (cells[i] === EMPTY) putEmit(i % W, (i / W) | 0, 35, .42, .3, .08);
  drawDecor();
  for (const p of SEC.props) if (Math.abs(p.x - cam.x - R.cols / 2) < R.cols * .6 + 20 * S) drawSprite(PROP_SPR[p.ch], p.x, p.y, 0);
  for (const lp of SEC.lamps) {   // fixtures from the art sheet under the ceiling, lit while their light is on this moment
    const f = flickerAt(lp.kind, t, lp.seed), top = lp.y - .6 * S;
    if (lp.kind === 'alarm') drawSprite(ALARM_SPR[(t * 6 | 0) & 1], lp.x, top, Math.PI, { light: f < .3 });   // hangs upside down, turning
    else drawSprite(LAMP_SPR[f > .45 ? 'on' : 'off'], lp.x, top, 0, { light: f <= .45 });
  }
  for (const cr of SEC.crumbs) if (!cr.got) {   // a wedge of cheese from the art sheet, bobbing (a single glyph at coarse detail)
    const y = cr.y + Math.sin(t * 3 + cr.ph) * .8 * S, q = .85 + .25 * Math.sin(t * 5 + cr.ph);
    if (S >= 2) drawSprite(CHEESE_SPR, cr.x, y, 0, { light: false });
    else putEmit(Math.floor(cr.x), Math.floor(y / ASPECT), 111, 1.5 * q, 1.15 * q, .35 * q);
  }
  for (const cp of SEC.checkpoints) drawSprite(CHECK_SPR[cp.on ? 'on' : 'off'], cp.x, cp.y, 0, { light: !cp.on });   // the cheese beacon lights up once touched
  if (SEC.goal) drawSprite(SEC.goal.spr, SEC.goal.x, SEC.goal.y, 0);
  drawCats(t);
  drawMouse();
}
function gameMarkDyn() { return Math.min(markMouse(), markCats()); }
function gameAfterFrame(t) { Sfx.buzz(buzzLevel(t)); }

// ---------- HUD ----------
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function gameHud(t) {
  for (const tx of FX.texts) { const p = worldToHud(tx.x, tx.y - tx.age * 5 * RES, [0, 0]); hudText(p[0] - (tx.text.length >> 1), p[1], tx.text, tx.c); }
  if (state === 'title') {
    msgBox([
      ['S P A C E   M O U S E', HC.gold], ['', HC.txt],
      ['The station has been empty for years. Most of the lights are dying.', HC.dim],
      ['Somewhere aboard, there is cheese.', HC.dim], ['', HC.txt],
      ['RUN  A D / LEFT RIGHT        JUMP  W / UP / SPACE (hold to go higher)', HC.txt],
      ['DROP THROUGH CATWALKS  S / DOWN      EAT  walk into cheese', HC.txt],
      ['LAND ON CAT-BOTS, DON\'T TOUCH THEM      AVOID CABLES AND GLASS', HC.txt], ['', HC.txt],
      [((t * 1.5) | 0) % 2 ? '[ PRESS ENTER OR TAP TO START ]' : '', HC.amber]
    ], 2);
    return;
  }
  const got = SEC.crumbs.filter(c => c.got).length;
  hudText(1, 0, `SECTOR ${SEC.n}  ${SEC.def.name}`, HC.gold);
  hudFlow(1, [[`CHEESE ${Math.round(grams)} G`, HC.amber], [`CRUMBS ${got}/${SEC.crumbs.length}`, HC.txt], [`DEATHS ${deaths}`, HC.dim], [fmtTime(SEC.time), HC.dim]].concat(MOUSE && MOUSE.low ? [['LOW GRAVITY', HC.cyan]] : []));
  const low = R.hrows - (touchShown() ? 9 : 2);
  if (SEC.n === 1 && state === 'play' && SEC.time < 7) { const h = 'A D / ARROWS RUN     W / UP / SPACE JUMP'; hudText(Math.max(0, (R.hcols - h.length) >> 1), low, h, HC.dim); }
  else if (HINT) hudText(Math.max(0, (R.hcols - HINT.text.length) >> 1), low, HINT.text, HC.cyan);
  if (state === 'paused') msgBox([['PAUSED', HC.amber], ['P or ESC to resume', HC.dim]]);
  if (state === 'dead' && stateT > .5) msgBox([[MOUSE.reason, HC.red]], Math.floor(R.hrows * .3));
  if (state === 'cleared' && stateT > 1) msgBox([[`SECTOR ${SEC.n} CLEARED`, HC.green], ['', HC.txt], ['You found the great cheese of the ' + SEC.def.name.toLowerCase() + '.', HC.txt],
    [`CHEESE ${Math.round(grams)} G    CRUMBS ${got}/${SEC.crumbs.length}    TIME ${fmtTime(SEC.time)}`, HC.gold], ['', HC.txt], [stateT > 1.2 ? '[ ENTER / TAP ]  ON TO THE NEXT SECTOR' : '', HC.amber]]);
  if (state === 'won' && stateT > 1) msgBox([['THE END', HC.gold], ['', HC.txt], ['Pip has found every cheese on the station.', HC.txt], ['Out of the window, the moon looks delicious.', HC.dim], ['', HC.txt],
    [`CHEESE ${Math.round(grams)} G    DEATHS ${deaths}    CAT-BOTS ${bots}`, HC.gold], ['', HC.txt], [stateT > 2 ? '[ ENTER / TAP ]  AGAIN' : '', HC.amber]]);
}

// ---------- the detail level changed: rebuild the same sector, put everything back where it was ----------
function gameRegenerate() {
  if (!SEC) return;
  const k = RES / SEC.res, old = SEC, m = MOUSE;
  buildSector(old.n);
  SEC.time = old.time; SEC.catsDown = old.catsDown; SEC.wrecks = old.wrecks;
  SEC.crumbs.forEach((c, i) => c.got = old.crumbs[i].got);
  SEC.checkpoints.forEach((c, i) => { c.on = old.checkpoints[i].on; if (c.on) SEC.check = c; });
  CRUMBLE.clear();
  if (m) { spawnMouse(m.ch.x * k, m.ch.y * k); MOUSE.ch.facing = m.ch.facing; MOUSE.alive = m.alive; MOUSE.reason = m.reason; }
  spawnCats();
}

Glyphite.run({
  id: 'spacemouse',
  touch: [
    [{ label: '[ < ]', aria: 'Run left', hold: 'left' }, { label: '[ > ]', aria: 'Run right', hold: 'right' }],
    [{ label: '[ v ]', aria: 'Down', hold: 'down' }, { label: '[ JUMP ]', aria: 'Jump', hold: 'jump' }]
  ],
  stars: 1,
  init() { setGravity(GRAV_BASE * .5 * TUNE.gravity); setEyeAdaptation(.55, { max: 2.2 }); setBackdrop({ dim: .5 }); showTitle(); },
  regenerate: gameRegenerate,
  update: gameUpdate, onKey: gameKey, lights: gameLights, draw: gameDraw, hud: gameHud, markDyn: gameMarkDyn, afterFrame: gameAfterFrame,
  skyBegin: moonBegin, sky: moonCell,
  camera(VW, VH, out) {
    const m = MOUSE;
    if (!m || state === 'title') { out[0] = SEC.start[0] - VW * .25; out[1] = SEC.start[1] - VH * .78; return; }
    // look ahead where it faces, and lead a fall (the engine eases the camera, which would otherwise trail a long drop)
    m.look += ((m.ch.facing * VW * .12) - m.look) * .02;
    out[0] = m.ch.x + m.look - VW / 2; out[1] = m.ch.y - VH * .56 + clamp(m.ch.vy * .3, -VH * .15, VH * .35);
  },
  chunkStep(ch) {
    const m = MOUSE;
    if (!m || !m.alive || state !== 'play' || !m.ch.touches(ch)) return;
    if (ch.body.vy > 12 * RES && ch.body.y < m.ch.y - m.ch.o.h * .5) killMouse('FLATTENED BY FALLING DEBRIS');
    else m.ch.unstick(4 * RES);
  },
  onTune(key, v) {
    if (key === 'gravity') setGravity(GRAV_BASE * .5 * v);
    if (MOUSE) Object.assign(MOUSE.ch.o, mouseOpts());
    if (key === 'stationLight') setAmbient([.05 * v, .056 * v, .075 * v]);
  },
  onBlast(x, y, R) { crackWalls(x, y, R); },
  // the web editor's LEVELS tab: play a sector from any tile, and check that it can be finished (levelcheck.js)
  levels: {
    play(i, tile) {
      if (!SECTORS[i]) return;
      startSector(i + 1);
      if (tile) { const c = MOUSE.ch; c.x = (tile[0] + .5) * SEC.tw; c.y = (tile[1] + 1) * SEC.th * ASPECT; c.vx = c.vy = 0; c.unstick(SEC.th * ASPECT * 3); MOUSE.safeT = 1; }
    },
    check: i => checkSector(i + 1)
  },
  start() { if (state === 'title') startGame(); },
  probe: () => ({
    sector: SEC && SEC.n, grams: Math.round(grams), deaths, bots,
    crumbs: SEC && [SEC.crumbs.filter(c => c.got).length, SEC.crumbs.length],
    cats: CATS.filter(k => k.alive).length,
    mouse: MOUSE && { alive: MOUSE.alive, reason: MOUSE.reason, tx: +(MOUSE.ch.x / SEC.tw).toFixed(2), ty: +(MOUSE.ch.y / ASPECT / SEC.th).toFixed(2),
      onGround: MOUSE.ch.onGround, ground: MAT_NAME[MOUSE.ch.ground] || '', vx: +(MOUSE.ch.vx / RES).toFixed(1), vy: +(MOUSE.ch.vy / RES).toFixed(1) }
  })
});
