// ===================== GAME · Pip, the space mouse =====================
// The engine's Character does the running and jumping (engine/API.md, "Characters"). This part reads the keys and does
// what only a mouse does: eats cheese it walks into (or stands on, holding down), makes rusted panels give way, picks up
// crumbs, lights checkpoints, finds the great cheese, and dies on cables, glass and cat-bots.
const MOUSE_W = 3.6, MOUSE_H = 5.6;   // the box, base units
const GRAV_BASE = 240;                // base units/s² at gravity 1: a jump rises in about a third of a second
let MOUSE = null, grams = 0, deaths = 0, bots = 0;

function mouseOpts() {
  const S = RES, jump = TUNE.jumpHeight * MOUSE_H * S;
  return {
    w: MOUSE_W * S, h: MOUSE_H * S, run: TUNE.runSpeed * MOUSE_W * S, jump, air: TUNE.airControl,
    accelT: .08, stopT: .05, coyote: .1, buffer: .13, fallMul: 1.55, fallMax: 110 * S,
    wallSlide: TUNE.wallJump ? 16 * S : 0, wallJump: TUNE.wallJump ? [26 * S, jump * .72] : null
  };
}
function spawnMouse(x, y) {
  MOUSE = { ch: new Character(x, y, mouseOpts()), alive: true, reason: '', anim: 0, biteT: 0, stepT: 0, look: 0, safeT: 0 };
  MOUSE.ch.unstick(6 * RES);
}
function mouseInput() {
  const x = ((keyDown('ArrowRight', 'KeyD') || Input.touch.right) ? 1 : 0) - ((keyDown('ArrowLeft', 'KeyA') || Input.touch.left) ? 1 : 0);
  return { x, jump: keyDown('ArrowUp', 'KeyW', 'Space', 'KeyZ') || !!Input.touch.jump, down: keyDown('ArrowDown', 'KeyS') || !!Input.touch.down };
}

function stepMouse(dt) {
  const m = MOUSE, c = m.ch, S = RES, inp = mouseInput(), wasGround = c.onGround;
  m.safeT = Math.max(0, m.safeT - dt);
  m.low = applyGravityZone(c, TUNE.jumpHeight * MOUSE_H * S);
  if (m.low) hint('lowg', 'LOW GRAVITY: THE GENERATOR IS FAILING. JUMPS GO TWICE AS HIGH');
  c.step(dt, inp);
  if (c.blocked(c.x, c.y)) c.unstick(3 * ASPECT);   // sand (peas, flakes, crumbs) poured onto the mouse: climb out on top
  if (c.jumped || c.wallJumped) {
    Sfx.tone(c.wallJumped ? 560 : 440, .07, .05); Sfx.tone(c.wallJumped ? 840 : 660, .09, .04, 'square', .03);
    puff(c.x - (c.wallJumped ? c.facing * c.o.w / 2 : 0), c.y, 5, c.ground || HULL);
  }
  if (c.landed > 28 * S) { Sfx.thud(Math.min(6, c.landed / S / 12)); puff(c.x, c.y, 4 + c.landed / S / 10, c.ground); }
  if (c.wall && inp.x === c.wall && c.vy > 0 && Math.random() < .3) spawnP(PT_DUST, c.x + c.wall * c.o.w / 2, c.y - c.o.h * .3, 0, -3 * S, .4, pick(".'"), HULL);
  // pitter-patter
  if (c.onGround && Math.abs(c.vx) > 3 * S) {
    m.anim += Math.abs(c.vx) * dt / S;
    if ((m.stepT -= Math.abs(c.vx) * dt / S) < 0) { m.stepT = 2.2; Sfx.tone(rr(1700, 2300), .02, .018, 'triangle'); }
  } else if (!c.onGround) m.anim = 0;
  if (!wasGround && c.onGround) m.stepT = 0;
  eatCheese(dt, inp);
  if (c.ground === RUST) crumbleAt(c);
  const g = gantryUnder(c); if (g) startGantry(g);
  if (EDIBLE.has(c.ground) || nearMat(c, CHEESE)) hint('eat', 'WALK INTO CHEESE TO EAT IT  -  HOLD DOWN TO EAT THE FLOOR');
  if (c.ground === GIRDER) hint('catwalk', 'S / DOWN DROPS THROUGH A CATWALK');
  if (c.wall && TUNE.wallJump) hint('wall', 'JUMP OFF WALLS: PRESS JUMP WHILE SLIDING DOWN ONE');
  // what the mouse touches
  const hz = touching(c, mm => HAZARD[mm]);
  if (hz) { killMouse(HAZARD[hz]); return; }
  if (touching(c, mm => mm === GREAT)) { clearSector(); return; }
  if (c.y > H * ASPECT + 4 * S) { killMouse('LOST IN THE DARK'); return; }
  const mx = c.x, my = c.y - c.o.h / 2;
  for (const cr of SEC.crumbs) if (!cr.got && Math.abs(cr.x - mx) < 3.2 * S && Math.abs(cr.y - my) < 4.5 * S) {
    cr.got = true; grams += 25; Sfx.pickup(); addText(cr.x, cr.y - 3 * S, '+25 G', [255, 214, 120], 1);
  }
  for (const cp of SEC.checkpoints) if (!cp.on && Math.abs(cp.x - c.x) < 3 * S && Math.abs(cp.y - c.y) < 4 * S) {
    for (const o of SEC.checkpoints) o.on = false;
    cp.on = true; SEC.check = cp; Sfx.win(); addText(cp.x, cp.y - 9 * S, 'CHECKPOINT', [140, 235, 150], 1.4);
  }
}

// the first material (by test) in the cells the box touches, including a thin rim around it
function touching(c, test) {
  const hw = c.o.w / 2;
  for (let cy = Math.floor((c.y - c.o.h - .4) / ASPECT); cy <= Math.floor((c.y + .4) / ASPECT); cy++)
    for (let cx = Math.floor(c.x - hw - .4); cx <= Math.floor(c.x + hw + .4); cx++) { const mm = getC(cx, cy); if (mm && test(mm)) return mm; }
  return 0;
}
const nearMat = (c, mat) => touching(c, mm => mm === mat);

function puff(x, y, n, mat) {
  const S = RES;
  for (let k = 0; k < n * S; k++) spawnP(PT_DUST, x + rr(-2, 2) * S, y - .5, rr(-9, 9) * S, -rr(1, 6) * S, rr(.3, .7), pick(".'`"), mat || HULL);
}

// ---------- eating ----------
// Pushing into cheese (or holding down on it, or jumping into it from below) takes a bite every 60 ms: the cheese cells
// nearest the mouth go, a few fall as crumbs that pile up below (and can be eaten too).
function eatCheese(dt, inp) {
  const m = MOUSE, c = m.ch;
  m.biteT = Math.max(0, m.biteT - dt);
  if (m.biteT > 0) return;
  let dir = 0;
  if (inp.x && edibleSide(c, inp.x)) dir = inp.x > 0 ? 1 : 2;
  else if (inp.down && EDIBLE.has(c.ground)) dir = 3;
  else if (inp.jump && (c.bumped || c.vy === 0) && edibleAbove(c)) dir = 4;
  if (!dir) return;
  bite(c, dir); m.biteT = .06;
}
function edibleSide(c, d) {
  const cx = Math.floor(c.x + d * (c.o.w / 2 + .5));
  for (let cy = Math.floor((c.y - c.o.h + .1) / ASPECT); cy <= Math.floor((c.y - .1) / ASPECT); cy++) if (EDIBLE.has(getC(cx, cy))) return true;
  return false;
}
function edibleAbove(c) {
  const cy = Math.floor((c.y - c.o.h - .5) / ASPECT);
  for (let cx = Math.floor(c.x - c.o.w / 2); cx <= Math.floor(c.x + c.o.w / 2); cx++) if (EDIBLE.has(getC(cx, cy))) return true;
  return false;
}
function bite(c, dir) {
  const S = RES, hw = c.o.w / 2, reach = 1.6 * S, cand = [];
  const mx = dir === 1 ? c.x + hw : dir === 2 ? c.x - hw : c.x, my = dir === 3 ? c.y : dir === 4 ? c.y - c.o.h : c.y - c.o.h * .55;
  const x0 = Math.floor(dir === 1 ? c.x + hw - .2 : dir === 2 ? c.x - hw - reach : c.x - hw), x1 = Math.floor(dir === 1 ? c.x + hw + reach : dir === 2 ? c.x - hw + .2 : c.x + hw);
  const y0 = Math.floor((dir === 3 ? c.y - .2 : dir === 4 ? c.y - c.o.h - reach : c.y - c.o.h + .1) / ASPECT), y1 = Math.floor((dir === 3 ? c.y + reach : dir === 4 ? c.y - c.o.h + .2 : c.y - .1) / ASPECT);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (EDIBLE.has(getC(cx, cy))) cand.push([(cx + .5 - mx) ** 2 + ((cy + .5) * ASPECT - my) ** 2, cx, cy]);
  if (!cand.length) return;
  cand.sort((a, b) => a[0] - b[0]);
  const n = Math.min(cand.length, Math.max(1, Math.round(1.4 * S * S)));
  for (let k = 0; k < n; k++) {
    const [, cx, cy] = cand[k];
    setC(cx, cy, EMPTY);
    if (Math.random() < .22) spawnGrain(cx + .5, cy * ASPECT + 1, rr(-4, 4) * S, -rr(0, 5) * S, CRUMBS);
    else if (Math.random() < .3) spawnP(PT_DUST, cx + .5, cy * ASPECT + 1, rr(-5, 5) * S, -rr(1, 6) * S, rr(.2, .5), pick(".,'"), CHEESE);
  }
  grams += n * 10 / (S * S);
  Sfx.burst(.05, rr(1600, 2400), 500, .1, 'bandpass', 2);
}

// ---------- death and coming back ----------
function killMouse(reason) {
  const m = MOUSE; if (!m.alive) return;
  const c = m.ch, S = RES, x = c.x, y = c.y - c.o.h * .6;
  m.alive = false; m.reason = reason; deaths++;
  for (let k = 0; k < 22 * S; k++) spawnP(PT_SPARK, x, y, rr(-22, 22) * S, rr(-26, 4) * S, rr(.3, .9), pick("*+'"), 0);
  for (let k = 0; k < 8 * S; k++) spawnP(PT_WRECK, x, y, rr(-16, 16) * S, -rr(6, 22) * S, rr(1.5, 3), pick("()'`,"), 0);
  addText(x, y - 4 * S, 'SQUEAK!', [255, 190, 210], 1.3);
  addLight(x, y, 24 * S, [1, .8, .9], 1.4, .25);
  Sfx.tone(1900, .09, .09, 'sine'); Sfx.tone(2500, .14, .07, 'sine', .07); Sfx.burst(.2, 3000, 800, .12, 'bandpass', 1);
  FX.slow = .3; FX.slowT = .45; FX.shake = Math.min(1, FX.shake + .3);
  setState('dead');
}
function respawn() {
  const at = SEC.check || { x: SEC.start[0], y: SEC.start[1] };
  spawnMouse(at.x, at.y);
  MOUSE.safeT = 1.5;   // a moment to get going before the cat-bots notice
  setState('play');
}

// ---------- drawing and light ----------
function mouseFrame(c, m) {
  if (!c.onGround) return c.vy < 0 ? 'jump' : 'fall';
  if (Math.abs(c.vx) > 3 * RES) return ['run1', 'run2', 'run3', 'run2'][Math.floor(m.anim / 1.5) & 3];
  return 'stand';
}
function drawMouse() {
  const m = MOUSE; if (!m || !m.alive || (m.safeT > 0 && (m.safeT * 10 | 0) & 1)) return;   // blinks while safe
  const c = m.ch;
  drawSprite(MOUSE_SPR[mouseFrame(c, m)], c.x, c.y, 0, { flip: c.facing < 0 });
}
function markMouse() {
  const m = MOUSE; if (!m || !m.alive) return 1e9;
  return markSpriteDyn(MOUSE_SPR[mouseFrame(m.ch, m)], m.ch.x, m.ch.y, 0, { flip: m.ch.facing < 0 });
}
function mouseLights(out) {
  const m = MOUSE; if (!m || !m.alive) return;
  const c = m.ch, S = RES, hy = c.y - c.o.h * .72;
  out.push({ x: c.x + c.facing * 1.4 * S, y: hy, r: 50 * S, c: [1, .95, .82], I: 1.15, shadow: true, dx: c.facing, dy: .14, cos: Math.cos(.62), skip: 2.4 * S });   // helmet lamp
  out.push({ x: c.x, y: hy, r: 15 * S, c: [.55, .82, 1], I: .45, shadow: false });                                                                           // helmet glow
}
