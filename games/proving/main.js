// ===================== GAME · the run: hooks, HUD, and the level check =====================
function gameHud(t) {
  if (state === 'title') { const b = Pixelite.load('best'); if (b) hudText(2, 1, `BEST ${b.time.toFixed(1)} S   ${b.coins} COINS`, HC.gold); return; }
  const S = RES;
  const narrow = R.hcols < 72;   // a phone: the numbers go on two rows
  hudText(1, 0, `COINS ${STATS.coins}/${STATS.total}`, HC.gold);
  hudBar(17, 0, 6, STATS.hp, 3, HC.red, 'HP');
  hudText(narrow ? 1 : 30, narrow ? 1 : 0, `BOMBS ${STATS.bombs}`, HC.txt);
  hudText(narrow ? 12 : R.hcols - 24, narrow ? 1 : 0, `DEATHS ${STATS.deaths}  ${STATS.time.toFixed(1)} S`, HC.dim);
  if (Rewind.rewinding) { const s = '<< REWIND <<'; hudText(Math.floor((R.hcols - s.length) / 2), 3, s, HC.amber); }
  if (HINT && state === 'play') {
    const lines = hudWrap(typeof HINT === 'function' ? HINT() : HINT, Math.min(56, R.hcols - 8)), w = Math.max(...lines.map(l => l.length)) + 4, c0 = Math.floor((R.hcols - w) / 2), r0 = R.hrows - lines.length - 4 - (touchShown() ? 7 : 0);
    hudBox(c0, r0, w, lines.length + 2, HC.dim, true); lines.forEach((l, i) => hudText(c0 + 2, r0 + 1 + i, l, HC.txt));
  }
  if (state === 'won') screenResult({ title: 'PROVING GROUND CLEARED', lines: [`${STATS.coins} OF ${STATS.total} COINS`, `${STATS.deaths} DEATHS`, `${STATS.time.toFixed(1)} SECONDS`], prompt: Input.pointer === 'touch' ? 'TAP FOR A NEW RUN' : 'ENTER FOR A NEW RUN' });
}
const SKY_AT = [0, 0, 0];
function startRun() { if (state === 'title') setState('play'); }
function gameKey(code) { if (state === 'won' && (code === 'Enter' || code === 'NumpadEnter') && stateT > .5) { newLevel(true); setState('play'); } }
function gameUpdate() { if (state === 'won' && stateT > .5 && Input.pressed.has('Tap')) { newLevel(true); setState('play'); } }

// Is the level finishable, and can every coin be reached? The engine's reach search plays the hero's real controller. The moving
// platforms are put in as solid bridges and stairs (their timing is a test of its own), then the level is built again.
function provingCheck() {
  const tc = MAP.tc, S = RES;
  const solid = (c0, r0, c1, r1) => { for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) setC(x, y, STEEL); };
  solid(FERRY.col * tc, FERRY.row * tc, (FERRY.to + FERRY.cols) * tc, FERRY.row * tc + Math.round(3 * S));
  for (let k = 1; k * 2 <= LIFT.up; k++) solid((LIFT.col + k - 1) * tc, (LIFT.row - 2 * k) * tc, (LIFT.col + k) * tc, (LIFT.row - 2 * k) * tc + Math.round(3 * S));   // one-tile steps up the lift's shaft, each two tiles higher
  for (let i = 0; i < cells.length; i++) if (cells[i] === DIRT) cells[i] = EMPTY;   // the dirt wall is dug through in play
  const coins = entities.filter(e => e.type === 'coin'), got = coins.map(() => false), checks = CHECKS.map(() => false), goal = entities.find(e => e.type === 'goal'); let atGoal = false;
  const opts = { w: 4 * S, h: 6 * S, ...scaleCharOpts({ ...heroOpts(), wallJump: null }) };
  delete opts.coyote; delete opts.buffer; opts.coyote = TUNE.coyote; opts.buffer = TUNE.buffer;
  const start = MAP.spawns.start;
  const res = reachSearch({ x: start[0], y: start[1], opts, max: 3000, grid: 2 * S,
    visit: c => {
      coins.forEach((k, i) => { if (!got[i] && Math.abs(k.x - c.x) < 4 * S && Math.abs(k.y - k.h / 2 - (c.y - c.o.h / 2)) < 5 * S) got[i] = true; });
      CHECKS.forEach((k, i) => { if (!checks[i] && Math.abs(k.x - c.x) < 3 * S && Math.abs(k.y - c.y) < 4 * S) checks[i] = true; });
      if (!atGoal && Math.abs(goal.x - c.x) < 4 * S && Math.abs(goal.y - c.y) < 4 * S) atGoal = true;
    },
    bad: c => c.hazard > 0 });
  const missing = coins.filter((k, i) => !got[i]).map(k => k.tile);
  newLevel(false); setState('title');
  return { goal: atGoal, coins: [got.filter(Boolean).length, coins.length], checkpoints: [checks.filter(Boolean).length, checks.length], missing, spots: res.count, ms: res.ms };
}

Pixelite.run({
  id: 'proving',
  shell: true,
  // a phone has room for six buttons: climbing up a ladder is the jump button held at it, a tap on the screen throws a pebble
  touch: [[{ label: '[<]', aria: 'Left', hold: 'left' }, { label: '[>]', aria: 'Right', hold: 'right' }, { label: '[v]', aria: 'Down', hold: 'down' }],
    [{ label: '[B]', aria: 'Bomb', hold: 'bomb' }, { label: '[D]', aria: 'Dig', hold: 'dig' }, { label: '[JUMP]', aria: 'Jump', hold: 'jump' }]],
  detail: { levels: [2], default: 2 },
  stars: 0,
  zoom: { min: .5, max: 3 },   // the mouse wheel and a pinch zoom the view (E7)
  drawFront: lookFront,        // the grass the hero walks behind (look.js)
  // a daytime sky: a gradient and slow clouds, on the engine's sky layer. With the day and night tunable on, the engine paints the gradient and the stars (setTimeOfDay)
  // and this paints the clouds only, as bright as the hour
  skyBegin(ox, oy, t) { SKY_AT[0] = ox; SKY_AT[1] = oy; SKY_AT[2] = t; },
  sky(i, j, out) {
    const u = j / R.RH, cl = vnoise2((SKY_AT[0] + i) * .012 + SKY_AT[2] * .15, (SKY_AT[1] + j) * .035, 4) > .66 + .2 * u ? .45 : 0;
    if (TUNE.daylight) { if (!cl) return 0; const d = .2 + .8 * daylightNow(); out[0] = .85 * d; out[1] = .88 * d; out[2] = 1.05 * d; return SOLID; }
    out[0] = .3 + .45 * u + cl; out[1] = .55 + .35 * u + cl; out[2] = 1.3 + cl * .3; return SOLID;
  },
  init() { setGravity(TUNE.gravity); newLevel(false); setState('title'); },
  regenerate() { const was = state; newLevel(false); setState(was === 'play' || was === 'won' ? 'play' : 'title'); },
  start: startRun,
  restart() { newLevel(false); setState('play'); },
  menu: [{ label: 'NEW GAME (ERASE SAVE)', onSelect: () => { setPaused(false); newLevel(true); setState('play'); } }],
  update: gameUpdate, onKey: gameKey, hud: gameHud, draw() { if (HERO_E && HERO_E.hook) HERO_E.hook.draw(); },
  onBlast(x, y, R0) {
    for (const e of entities) if (e.type === 'slime' && !e.dead && Math.hypot(e.x - x, e.y - 2 * RES - y) < R0 * 1.4) killSlime(e);
    if (HERO_E && state === 'play' && Math.hypot(HERO_E.x - x, HERO_E.y - 3 * RES - y) < R0 * .9) hurt(HERO_E, 'YOUR OWN BOMB', 1);
  },
  chunkStep(ch) {   // a falling chunk crushes a slime under it and hurts the hero
    for (const e of entities) if (e.type === 'slime' && !e.dead && e.char && e.char.touches(ch) && Math.hypot(ch.body.vx, ch.body.vy) > 4 * RES) killSlime(e);
    if (HERO_E && state === 'play' && HERO_E.char.touches(ch) && Math.hypot(ch.body.vx, ch.body.vy) > 8 * RES) hurt(HERO_E, 'FALLING BRICKS', 1);
  },
  onTune(key, v) {
    if (key === 'gravity') setGravity(v);
    else if (LOOK_KEYS.has(key)) applyLook();
    else if (HERO_E) { const o = HERO_E.char.o; if (key === 'runSpeed') o.run = v * RES; else if (key === 'jumpHeight') o.jump = v * RES; else if (key === 'coyote') o.coyote = v; else if (key === 'buffer') o.buffer = v; else if (key === 'wallJump') { o.wallJump = v ? [18 * RES, 9 * RES] : null; o.wallSlide = v ? 8 * RES : 0; } }
  },
  probe: () => ({ stats: { ...STATS }, hint: !!HINT, hero: HERO_E && { x: +HERO_E.x.toFixed(1), y: +HERO_E.y.toFixed(1), vx: +HERO_E.char.vx.toFixed(1), vy: +HERO_E.char.vy.toFixed(1), ground: HERO_E.char.onGround, climbing: HERO_E.char.climbing,
    platform: !!HERO_E.char.platform, hazard: HERO_E.char.hazard, invuln: +HERO_E.invuln.toFixed(2), tag: HERO_E.tag },
    ferry: FERRY_P && [FERRY_P.offX, FERRY_P.offY], lift: LIFT_P && [LIFT_P.offX, LIFT_P.offY] })
});
