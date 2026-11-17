'use strict';
// ===================== GAME · Pip: the controller, which frame to show, the cheese =====================
// Pip is a Character (engine/API.md, "Characters") the size of his drawing: 49 game pixels tall. His frames are the asset `pip` of the art
// pipeline (pipeline.js, PIPE_ART.pip): the owner's approved animations, drawn by PixelLab from rigs (docs/ANIMATION.md). Walking and running
// are driven by the distance he covers, not the clock, so his boots keep pace with the floor at any speed; idle breathes on the clock; in the
// air the frame follows his vertical speed.
// His normal pace is the run (the walk drawings are for a slow, careful pace: the walk key, or a gentle push of a stick, and the first frames of
// getting going): a platformer that walks everywhere feels like wading.
const PIP_ART = PIPE_ART.pip;
// his feet are on the canvas's bottom row and his body round column 34 of 57: the origin, so flipping him turns him about himself
const PIP_SPR = Object.fromEntries(Object.keys(PIP_ART.frames).map(n => [n, defineSprite({ w: PIP_ART.w, h: PIP_ART.h, pal: PIP_ART.pal, rows: PIP_ART.frames[n].rows, normals: PIP_ART.frames[n].normals }, { k: PIP_ART.k, ox: 34, oy: PIP_ART.h })]));
const ANIM = { walk: 8, run: 8, idle: 4, jump: 8 };
const frameOf = (name, i) => PIP_SPR[`${name}_${((i % ANIM[name]) + ANIM[name]) % ANIM[name]}`];
const IDLE_FPS = 6;
const WALK_BELOW = 100;   // pixels/s: slower than this the walk drawings are shown, faster the run's (the walk's stride is 4.5 pixels a frame, the run's 9-10)

let PIP = null;   // { c: Character, dist, takeoff, land, frame, mode, cheese }
// gravity from the jump's height and its time to the top (h = g t² / 2): the two numbers a player feels
const pipGravity = () => 2 * TUNE.jumpHeight * PX / (TUNE.jumpTime * TUNE.jumpTime);
function pipOptions() {
  return { w: 18 * PX, h: 46 * PX, run: TUNE.speed * PX, jump: TUNE.jumpHeight * PX, gravity: pipGravity(), fallMul: 1.55, fallMax: 520 * PX,
    accelT: TUNE.accelTime, stopT: TUNE.stopTime, air: TUNE.airControl, coyote: .1, buffer: .12, step: 3 * PX };
}
function spawnPip(x, y) { PIP = { c: new Character(x, y, pipOptions()), dist: 0, takeoff: 0, land: 0, frame: frameOf('idle', 0), mode: 'idle', cheese: 0 }; }
function pipTune() { if (PIP) Object.assign(PIP.c.o, pipOptions()); }

function pipUpdate(dt) {
  const p = PIP, c = p.c, sprint = action('run') > .5, creep = !sprint && action('walk') > .5;
  c.o.run = (sprint ? TUNE.sprintSpeed : creep ? TUNE.walkSpeed : TUNE.speed) * PX;
  c.step(dt, { x: axis('left', 'right'), jump: action('jump') > .5, down: action('down') > .5 });
  if (c.onGround) p.dist += Math.abs(c.vx) * dt / PX;
  if (c.jumped) { p.takeoff = .07; Sfx.tone(520, .06, .07, 'square'); }
  if (c.landed > 40 * PX) { p.land = .1; Sfx.thud(c.landed / PX * .004); }
  p.takeoff = Math.max(0, p.takeoff - dt); p.land = Math.max(0, p.land - dt);
  p.frame = pipFrame(p);
  for (const ch of SW_CHEESE) if (!ch.got && Math.abs(ch.x - c.x) < 12 * PX && ch.y > c.y - 50 * PX && ch.y < c.y + 6 * PX) {
    ch.got = true; p.cheese++; Sfx.pickup(); addText(ch.x, ch.y - 10 * PX, 'CHEESE!', [255, 214, 80], 1);
  }
  if (SW_GOAL && !SW_GOAL.got && Math.abs(SW_GOAL.x - c.x) < 18 * PX && Math.abs(SW_GOAL.y - c.y) < 20 * PX) { SW_GOAL.got = true; say(`THE GREAT CHEESE! ${p.cheese} OF ${SW_CHEESE.length} CRUMBS FOUND`, { time: 5 }); }
}

// which drawing: in the air by vertical speed (rise, top, fall), a take-off frame and, when he stops dead from a fall, a landing frame; then
// idle, walk or run on the ground. A landing never interrupts a run: he lands running.
function pipFrame(p) {
  const c = p.c, vj = Math.sqrt(2 * pipGravity() * TUNE.jumpHeight * PX), speed = Math.abs(c.vx) / PX;   // vj: the launch speed of a full jump
  if (p.takeoff > 0) { p.mode = 'jump'; return frameOf('jump', 1); }
  if (!c.onGround) { p.mode = 'jump'; return frameOf('jump', c.vy < -.45 * vj ? 2 : c.vy < -.12 * vj ? 3 : c.vy < .15 * vj ? 4 : c.vy < .5 * vj ? 5 : 6); }
  if (p.land > 0 && speed < 50) { p.mode = 'land'; return frameOf('jump', 7); }
  if (speed < 8) { p.mode = 'idle'; return frameOf('idle', Math.floor(stateT * IDLE_FPS)); }
  if (speed < WALK_BELOW) { p.mode = 'walk'; return frameOf('walk', Math.floor(p.dist / TUNE.walkStride)); }
  p.mode = 'run'; return frameOf('run', Math.floor(p.dist / TUNE.runStride));
}

// cache: true works the sprite's cells out once per frame and flip, then only lights them each time (engine/API.md, Sprites): his 3000-pixel
// canvas costs a fifth of what it did
function pipDraw() {
  const c = PIP.c;
  drawSprite(PIP.frame, c.x, c.y, 0, { flip: c.facing < 0, foot: 2 * PX, cache: true });
}
// he blocks lamp light, so a lamp behind him throws his shadow on the back wall
function pipMark() {
  const c = PIP.c;
  return markSpriteDyn(PIP.frame, c.x, c.y, 0, { flip: c.facing < 0, foot: 2 * PX, blocksLamps: true });
}
