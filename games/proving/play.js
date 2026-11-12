// ===================== GAME · the hero, the slimes, coins, flags, platforms =====================
// Almost everything here is an engine feature used the way a game would: the hero and the slimes are entities with a Character,
// pickups and flags are entities that touch the hero, the ferry and the lift are moving platforms, the pebbles and bombs are projectiles,
// digging is carve(), the low-gravity room is a gravity zone, hints are triggers, progress is a save.
const STATS = { coins: 0, total: 0, deaths: 0, time: 0, hp: 3, bombs: 5, cp: -1, won: false };
let RUN_REC = new GhostRecorder({ x: 0, y: 0 }), GHOST_PENDING = false;
let MAP = null, HERO_E = null, HINT = null, FERRY_P = null, LIFT_P = null, TAKEN = new Set(), CHECKS = [], COOL = { fire: 0, bomb: 0, dig: 0 };

const heroOpts = () => ({
  run: TUNE.runSpeed, jump: TUNE.jumpHeight, climb: 12, bounceMin: 28, coyote: TUNE.coyote, buffer: TUNE.buffer, fallMul: 1.5,
  wallJump: TUNE.wallJump ? [18, 9] : null, wallSlide: TUNE.wallJump ? 8 : 0
});

defineEntity('hero', {
  size: [4, 6], always: true, anchor: 'feet', character: heroOpts(),
  anim: e => animFrame(HERO, e.animT, e.tag),
  update: heroUpdate
});
defineEntity('slime', {
  size: [5, 3], anchor: 'feet', character: { run: 7, jump: 0, step: 2 }, touches: ['hero'], props: { dir: 1, chase: false, squash: 0 },
  anim: e => SLIME.frames[Math.floor(clockT * 4 + e.x * .07) % 2],
  init(e) { e.dir = rnd() < .5 ? -1 : 1; e.fsm = fsm({ patrol: { update: slimePatrol, to: { chase: e => seesHero(e) } }, chase: { update: slimeChase, to: { patrol: e => !seesHero(e) } } }, 'patrol'); },
  update(e, dt) { e.fsm.update(e, dt); },
  onTouch: slimeTouch
});
defineEntity('coin', {
  size: [3, 3], touches: ['hero'], always: false,
  draw(e) { drawSprite(COIN_SPR, e.x, e.y - 1 - Math.sin(clockT * 4 + e.x * .1) * RES * .5, 0, {}); },
  onTouch(e) { e.dead = true; STATS.coins++; TAKEN.add(e.tile.join()); Sfx.pickup(); addText(e.x, e.y - 8 * RES, '+1', [255, 214, 120], .9); }
});
defineEntity('torch', {
  size: [2, 4], anchor: 'feet', sprite: TORCH_SPR,
  lights(e, t, out) { out.push({ x: e.x, y: e.y - 4 * RES, r: 44 * RES, c: [1, .62, .28], I: 1.25 + .15 * Math.sin(t * 13 + e.x), shadow: true }); }
});
defineEntity('checkpoint', {
  size: [3, 6], anchor: 'feet', touches: ['hero'], props: { on: false },
  draw(e) { drawSprite(FLAG_SPR, e.x, e.y, 0, { palette: e.on ? FLAG_ON : null }); },
  anim: e => FLAG_SPR,
  lights(e, t, out) { if (e.on) out.push({ x: e.x, y: e.y - 8 * RES, r: 30 * RES, c: [.4, 1, .55], I: .8, shadow: true }); },
  onTouch(e) { if (!e.on) { for (const o of CHECKS) o.on = false; e.on = true; STATS.cp = CHECKS.indexOf(e); Sfx.win(); say('CHECKPOINT'); saveRun(); } }
});
defineEntity('goal', {
  size: [4, 6], anchor: 'feet', touches: ['hero'], sprite: GOAL_SPR,
  lights(e, t, out) { out.push({ x: e.x, y: e.y - 6 * RES, r: 40 * RES, c: [1, .85, .4], I: 1.3, shadow: true }); },
  onTouch() { if (state === 'play') win(); }
});

// ---------- the hero ----------
function heroUpdate(e, dt) {
  const c = e.char, S = RES;
  if (state !== 'play') { e.input = {}; if (state === 'won') e.tag = 'idle'; return; }
  STATS.time += dt;
  for (const k in COOL) COOL[k] = Math.max(0, COOL[k] - dt);
  e.invuln = Math.max(0, (e.invuln || 0) - dt); e.flash = Math.max(0, (e.flash || 0) - dt * 4);
  e.input = { x: axis('left', 'right'), jump: action('jump') > .5, down: action('down') > .5, up: action('up') > .5 };
  // what the character reports after its step: a hazard under it, a fall into the dark, a landing, a jump
  if (c.hazard && !e.invuln) hurt(e, 'SPIKES', 1);
  if (c.y > H * ASPECT + 4 * S) die(e, 'LOST IN THE DARK');
  if (c.jumped) { Sfx.tone(520, .07, .07, 'square'); }
  if (c.landed > 14 * S) { puff(e.x, e.y, Math.min(8, c.landed / S / 8)); Sfx.thud(c.landed / S * .12); }
  if (c.bounced) { Sfx.tone(300, .25, .1, 'triangle'); puff(e.x, e.y, 6); }
  if (c.splashed) Sfx.burst(.22, 1100, 250, Math.min(.2, c.splashed / S / 300), 'lowpass');   // into the water
  if ((actionPressed('fire') || Input.pressed.has('Tap')) && COOL.fire <= 0) throwPebble(e);   // a tap on the screen throws one too
  if (actionPressed('bomb') && COOL.bomb <= 0 && STATS.bombs > 0) throwBomb(e);
  if (actionPressed('dig') && COOL.dig <= 0) dig(e);
  hookUpdate(e, dt);
  RUN_REC.step(e.tag);
  if (GHOST_PENDING) { GHOST_PENDING = false; const b = Pixelite.load('ghost'); if (b) spawnGhost(b.frames, { anim: e => animFrame(HERO, clockT, e.tag || 'idle'), tint: [.5, .75, 1] }); }
  e.tag = e.invuln > 1 ? 'hurt' : c.climbing ? 'climb' : !c.onGround ? 'jump' : Math.abs(c.vx) > 3 * S ? 'run' : 'idle';
  e.animT = e.tag === 'climb' ? Math.abs(e.y) * .12 : clockT;
  if (c.platform) e.onPlatform = true; else e.onPlatform = false;
}
// the grappling hook (engine Grapple): E shoots it toward the mouse (or up and forward), the rope swings the hero; up / down reel, jump or E lets go
function hookUpdate(e, dt) {
  const c = e.char, S = RES, hook = e.hook || (e.hook = new Grapple(c, { range: 90 * S }));
  hook.update();
  if (actionPressed('grapple')) {
    if (hook.rope) hook.release();
    else {
      const a = Input.pointer === 'mouse' ? mouseAim() : null;
      const dx = a ? cam.x + a[0] * R.cols - c.x : e.facing * .7, dy = a ? cam.y + a[1] * R.rows * ASPECT - (c.y - c.o.h * .6) : -1;
      if (hook.fire(dx, dy)) Sfx.tone(900, .05, .08, 'square'); else Sfx.tone(200, .06, .06, 'square');
    }
  }
  if (hook.rope) {
    if (action('up') > .5) hook.reel(-1, dt); else if (action('down') > .5 && !c.onGround) hook.reel(1, dt);
    if (actionPressed('jump') && c.hanging) hook.release();
  }
  e.input.rope = hook.rope;
}
function puff(x, y, n) { for (let k = 0; k < n * RES; k++) spawnP(PT_DUST, x + rr(-2, 2) * RES, y - .5, rr(-9, 9) * RES, -rr(1, 6) * RES, rr(.3, .7), pick(".'`"), ROCK); }
function hurt(e, why, dmg) {
  if (e.invuln > 0 || state !== 'play') return;
  STATS.hp -= dmg; e.flash = 1; e.invuln = 1.6; cameraShake(.5); Sfx.thud(8);
  e.char.vy = -34 * RES; e.char.vx = -e.facing * 24 * RES; e.char.onGround = false;
  if (STATS.hp <= 0) die(e, why); else say(`OUCH: ${why}`, { colour: HC.red });
}
function die(e, why) {
  STATS.deaths++; say(`${why} - BACK TO THE CHECKPOINT`, { colour: HC.red }); Sfx.alarm();
  respawn(e);
}
function respawn(e) {
  const cp = CHECKS[STATS.cp], p = cp ? [cp.x, cp.y] : MAP.spawns.start;
  if (e.hook) e.hook.release();
  Object.assign(e.char, { x: p[0], y: p[1], vx: 0, vy: 0 }); e.x = p[0]; e.y = p[1]; e.invuln = 1.6; e.flash = 1; STATS.hp = 3;
  updateCamera(0, true);
}
function throwPebble(e) {
  const S = RES, f = e.facing, c = e.char; COOL.fire = .28;
  fireProjectile({ x: e.x + f * 3 * S, y: e.y - 2 * S, vx: f * 70 * S + c.vx * .4, vy: -5 * S, gravity: .7, bounce: .45, maxBounces: 2, life: 2.2, color: [225, 225, 235], hits: ['slime'], owner: e,
    onHit: (p, hit) => { if (hit.entity) { killSlime(hit.entity, p.vx); } } });
  Sfx.burst(.08, 1800, 600, .12, 'bandpass');
}
function throwBomb(e) {
  const S = RES, f = e.facing, c = e.char; COOL.bomb = .6; STATS.bombs--;
  fireProjectile({ x: e.x + f * 3 * S, y: e.y - 5 * S, vx: f * 44 * S + c.vx * .5, vy: -38 * S, gravity: 1, life: 3, color: [255, 120, 60], size: 2, light: { r: 14, c: [1, .6, .3], I: 1 }, owner: e, hits: ['slime'],
    onStep: p => { if (rnd() < .5) spawnP(PT_SPARK, p.x, p.y - 1, rr(-3, 3) * S, -rr(2, 6) * S, rr(.15, .35), pick("*'"), 0); },
    onHit: p => { blastFrom(p.vx, p.vy); explode(p.x, p.y, 9 * S, 1.5); } });
  Sfx.launch();
}
// carve takes dirt and brick but not rock (toughness 5 against 4 x power), in front of the hero
function dig(e) {
  COOL.dig = .18; const S = RES, n = carve(e.x + e.facing * (e.char.o.w / 2 + 3 * S), e.y - e.char.o.h * .45, 3.2 * S, { power: 1 });
  if (n) { Sfx.burst(.12, 700, 200, .18); cameraShake(.06); } else Sfx.tone(160, .05, .05, 'square');
}

// ---------- slimes ----------
const seesHero = e => HERO_E && state === 'play' && Math.abs(HERO_E.x - e.x) < 38 * RES && Math.abs(HERO_E.y - e.y) < 12 * RES && lineClear(e.x, e.y - 3 * RES, HERO_E.x, HERO_E.y - 3 * RES);
function slimePatrol(e) {
  const c = e.char, ahead = Math.floor(e.x + e.dir * (c.o.w / 2 + 1)), row = Math.round(e.y);
  if (c.contacts[e.dir > 0 ? 'right' : 'left'] || (c.onGround && getC(ahead, row) === EMPTY && !chunkAt(ahead + .5, row + .5))) e.dir = -e.dir;
  e.input = { x: e.dir * .6 };
}
function slimeChase(e) { e.dir = HERO_E.x > e.x ? 1 : -1; const c = e.char; e.input = { x: c.onGround && getC(Math.floor(e.x + e.dir * (c.o.w / 2 + 1)), Math.round(e.y)) === EMPTY ? 0 : e.dir }; }
function killSlime(e, vx = 0) {
  if (e.dead) return; e.dead = true; Sfx.thud(6); addText(e.x, e.y - 8 * RES, '+5', [140, 235, 150], .8);
  for (let k = 0; k < 10 * RES; k++) spawnP(PT_SPARK, e.x, e.y - 2 * RES, rr(-12, 12) * RES + vx * .1, -rr(2, 14) * RES, rr(.2, .5), pick("*'."), 0);
}
function slimeTouch(e, h) {
  if (e.dead || state !== 'play') return;
  const hc = h.char;
  if (hc.vy > 4 * RES && h.y - h.h * .4 < e.y - e.h * .4) { killSlime(e); hc.vy = -Math.sqrt(2 * G * hc.o.jump * .7); Sfx.tone(700, .08, .1, 'square'); }   // stomp
  else hurt(h, 'A SLIME', 1);
}

// ---------- coming and going ----------
function saveRun() { Pixelite.save('run', { cp: STATS.cp, taken: [...TAKEN], deaths: STATS.deaths, time: STATS.time, bombs: STATS.bombs }); }
function win() {
  STATS.won = true; setState('won'); Sfx.win(); cameraShake(.2); saveBest();
  for (let k = 0; k < 40; k++) spawnP(PT_SPARK, HERO_E.x, HERO_E.y - 6 * RES, rr(-30, 30) * RES, -rr(10, 40) * RES, rr(.5, 1.2), pick("*+'"), 0);
}
const bestKey = 'best';
function saveBest() {
  const g = Pixelite.load('ghost'); if (!g || STATS.time < g.time) Pixelite.save('ghost', { time: STATS.time, frames: RUN_REC.frames }); const b = Pixelite.load(bestKey); if (!b || STATS.time < b.time) Pixelite.save(bestKey, { time: STATS.time, coins: STATS.coins, deaths: STATS.deaths }); }

// build the level and everything in it; `fresh`: forget the save
function newLevel(fresh) {
  if (fresh) Pixelite.erase('run');
  const saved = fresh ? null : Pixelite.load('run');
  MAP = loadTileMap(levelRows(), LEGEND, { tile: TILE, triggerWho: ['hero'] });
  const tc = MAP.tc;
  setSun(52, [1, .93, .8]); setAmbient([.5, .56, .72]);
  TAKEN = new Set(saved ? saved.taken : []);
  for (const e of entities) if (e.type === 'coin' && TAKEN.has(e.tile.join())) e.dead = true;   // already collected in the saved run
  CHECKS = entities.filter(e => e.type === 'checkpoint').sort((a, b) => a.x - b.x);
  Object.assign(STATS, { coins: TAKEN.size, total: entities.filter(e => e.type === 'coin').length + TAKEN.size, deaths: saved ? saved.deaths : 0, time: saved ? saved.time : 0, hp: 3, bombs: saved ? saved.bombs : 5, cp: saved ? saved.cp : -1, won: false });
  if (STATS.cp >= 0 && CHECKS[STATS.cp]) CHECKS[STATS.cp].on = true;
  for (const [tag, text] of Object.entries(HINTS)) MAP.on(tag, { onEnter: () => { HINT = text; }, onLeave: () => { if (HINT === text) HINT = null; } });
  const p = STATS.cp >= 0 && CHECKS[STATS.cp] ? [CHECKS[STATS.cp].x, CHECKS[STATS.cp].y] : MAP.spawns.start;
  HERO_E = spawn('hero', p[0], p[1]); HERO_E.invuln = 0; HERO_E.tag = 'idle'; HERO_E.animT = 0;
  // moving parts and the zone (the platforms are chunks: the engine keeps them across detail changes)
  const th = Math.round(3 * RES);
  FERRY_P = addPlatform({ x: FERRY.col * tc, y: FERRY.row * tc, cols: FERRY.cols * tc, rows: th, mat: STEEL, path: [[FERRY.col * tc, FERRY.row * tc], [FERRY.to * tc, FERRY.row * tc]], speed: FERRY.speed, mode: 'pingpong', wait: 1.6 });
  LIFT_P = addPlatform({ x: LIFT.col * tc, y: LIFT.row * tc, cols: LIFT.cols * tc, rows: th, mat: STEEL, path: [[LIFT.col * tc, LIFT.row * tc], [LIFT.col * tc, (LIFT.row - LIFT.up) * tc]], speed: LIFT.speed, mode: 'pingpong', wait: 2.4 });
  addGravityZone({ x0: LOW_G.c0 * tc, y0: LOW_G.r0 * tc, x1: LOW_G.c1 * tc, y1: LOW_G.r1 * tc, scale: LOW_G.scale });
  setCamera({ follow: HERO_E, lead: .25, deadzone: [.14, .28], bounds: [0, 0, W, H * ASPECT] });
  updateCamera(0, true);
  HINT = null;
  // rewind (hold R): the engine keeps snapshots of the world; the game's own numbers come back through `keep`
  RUN_REC.target = HERO_E; RUN_REC.reset(); GHOST_PENDING = !saved;
  Rewind.start({ seconds: 8, action: 'rewind' });
  Rewind.keep = {
    save: () => ({ coins: STATS.coins, hp: STATS.hp, bombs: STATS.bombs, taken: [...TAKEN], rec: RUN_REC.frames.length }),
    load: s => { Object.assign(STATS, { coins: s.coins, hp: s.hp, bombs: s.bombs, won: false }); TAKEN = new Set(s.taken); RUN_REC.frames.length = Math.min(RUN_REC.frames.length, s.rec); if (HERO_E && HERO_E.hook) HERO_E.hook.release(); if (state === 'won') setState('play'); }
  };
}
