'use strict';
// ===================== GAME · lights: the level's lamps, Pip's helmet lamp, and test lights you drop =====================
// What to look at: a lamp throws light only where its rays get to, so a crate, a catwalk or Pip himself leaves a shadow behind him on the back
// wall and the floor. Every lamp is a cone (the ceiling lamps on cables, the alarm and the blue lamp on the wall, Pip's helmet lamp turning with him):
// a lamp's rays cost about r² x the angle they cover, and in this open hall they run their whole length, so a scrolling frame (which casts every
// lamp in view again) is what a full circle of r 120 spoils: it was 12 ms a frame, the cones are about a fifth of that.
// Test lights (the owner, 2026-11-17: "some test lights to see how the shadows etc work"): click to drop one (up to SW_TL_MAX; the oldest goes),
// 1-4 the kind, F one that follows the mouse, H the helmet lamp, K clears them, right click takes the nearest away.
let SW_LAMPS = [];   // the level's: { x, y, kind: 'ceiling' | 'alarm' | 'blue' }
const SW_TL_MAX = 4;
const SW_TL_KINDS = [
  { name: 'WARM', c: [1, .82, .55], r: 80, I: 3 },
  { name: 'COLD', c: [.55, .75, 1], r: 80, I: 3 },
  { name: 'SPOT', c: [1, 1, .92], r: 115, I: 3.4, cone: .5 },   // straight down, half-angle in radians (the others are round)
  { name: 'ALARM', c: [1, .18, .12], r: 85, I: 3, pulse: true },
];
SW_TL_KINDS.forEach(k => { k.spr = bulbSprite(k.c); });
const SW_ALARM_SPR = bulbSprite([1, .2, .14]), SW_BLUE_SPR = bulbSprite([.45, .7, 1]);
const SW_TEST = { list: [], kind: 0, torch: false, helmet: true };

// where the mouse points, in world cells (null while it is off the canvas or a finger is used)
function swMouseWorld() { const a = mouseAim(); return a ? [cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT] : null; }

function swTestDrop(x, y) {
  SW_TEST.list.push({ x, y, kind: SW_TEST.kind });
  if (SW_TEST.list.length > SW_TL_MAX) SW_TEST.list.shift();
  Sfx.tone(660, .05, .05, 'square');
}
function swTestInput() {
  if (stateT < .3) return;   // the click that started the game is not a light
  const a = Input.aim;
  if (Input.pressed.has('Tap') && a) swTestDrop(cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT);
  if (Input.pressed.has('TapAlt') && a) {
    const x = cam.x + a[0] * R.cols, y = cam.y + a[1] * R.rows * ASPECT; let best = -1, bd = 30 * PX;
    SW_TEST.list.forEach((l, i) => { const d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) SW_TEST.list.splice(best, 1);
  }
}
function swTestKey(code) {
  if (state !== 'play') return;
  if (code >= 'Digit1' && code <= 'Digit4') SW_TEST.kind = code.charCodeAt(5) - 49;
  else if (code === 'KeyF') SW_TEST.torch = !SW_TEST.torch;
  else if (code === 'KeyH') SW_TEST.helmet = !SW_TEST.helmet;
  else if (code === 'KeyK') SW_TEST.list.length = 0;
  else if (code === 'KeyL' && PIP) swTestDrop(PIP.c.x, PIP.c.y - 70 * PX);   // above his head
}

// a test light's light: round, or a cone straight down; the alarm pulses (the intensity changes each frame and the lamp stays cached)
function swTestLight(l, t, out) {
  const k = SW_TL_KINDS[l.kind], L = { x: l.x, y: l.y, r: k.r * PX, c: k.c, I: k.I * (k.pulse ? .55 + .45 * Math.sin(t * 5) : 1), shadow: true, skip: 3 * PX };
  if (k.cone) { L.dx = 0; L.dy = 1; L.cos = Math.cos(k.cone); }
  out.push(L);
}

function swLights(t, out) {
  const vx0 = cam.x - 160 * PX, vx1 = cam.x + R.cols + 160 * PX;   // a lamp further than its reach from the view lights nothing in it
  for (const l of SW_LAMPS) {
    if (l.x < vx0 || l.x > vx1) continue;
    if (l.kind === 'ceiling') {
      out.push({ x: l.x, y: l.y + 6 * PX, r: 115 * PX, c: [1, .86, .62], I: 2.6, shadow: true, dx: 0, dy: 1, cos: Math.cos(.95), skip: 4 * PX });
      out.push({ x: l.x, y: l.y + 5 * PX, r: 22 * PX, c: [1, .9, .7], I: 1.1, shadow: false });   // the bulb's own glow
    } else if (l.kind === 'alarm') out.push({ x: l.x, y: l.y, r: 90 * PX, c: [1, .16, .1], I: 3 * (.55 + .45 * Math.sin(t * 5 + l.x)), shadow: true, dx: 0, dy: 1, cos: Math.cos(1.2), skip: 3 * PX });
    else out.push({ x: l.x, y: l.y, r: 100 * PX, c: [.45, .7, 1], I: 3, shadow: true, dx: 0, dy: 1, cos: Math.cos(1.2), skip: 3 * PX });
  }
  if (PIP) {
    const c = PIP.c, hy = c.y - 38 * PX;
    if (SW_TEST.helmet) out.push({ x: c.x + c.facing * 5 * PX, y: hy, r: 90 * PX, c: [1, .95, .82], I: 2.2, shadow: true, dx: c.facing, dy: .14, cos: Math.cos(.62), skip: 6 * PX });   // the helmet lamp
    out.push({ x: c.x, y: hy, r: 26 * PX, c: [.6, .8, 1], I: .35, shadow: false });   // the helmet's glass catches the light
  }
  for (const l of SW_TEST.list) swTestLight(l, t, out);
  if (SW_TEST.torch) { const m = swMouseWorld(); if (m) swTestLight({ x: m[0], y: m[1], kind: SW_TEST.kind }, t, out); }
  if (SW_GOAL && !SW_GOAL.got && Math.abs(SW_GOAL.x - cam.x - R.cols / 2) < R.cols / 2 + 60 * PX) out.push({ x: SW_GOAL.x, y: SW_GOAL.y - 10 * PX, r: 45 * PX, c: [1, .8, .35], I: 1, shadow: true });
}

function swLampsDraw() {
  const x0 = cam.x - 12 * PX, x1 = cam.x + R.cols + 12 * PX;
  for (const l of SW_LAMPS) {
    if (l.x < x0 || l.x > x1) continue;
    if (l.kind === 'ceiling') { drawSprite(cableSprite(l.y - SW_MAP.tc * ASPECT), l.x, SW_MAP.tc * ASPECT, 0, { cache: true }); drawSprite(LAMP_SPR, l.x, l.y, 0, { cache: true }); }
    else drawSprite(l.kind === 'alarm' ? SW_ALARM_SPR : SW_BLUE_SPR, l.x, l.y, 0, { cache: true });
  }
  for (const l of SW_TEST.list) drawSprite(SW_TL_KINDS[l.kind].spr, l.x, l.y, 0, { cache: true });
}

function swLightsHud() {
  hudText(2, 3, `TEST LIGHTS ${SW_TEST.list.length}/${SW_TL_MAX}  KIND ${SW_TL_KINDS[SW_TEST.kind].name}  TORCH ${SW_TEST.torch ? 'ON' : 'OFF'}  HELMET ${SW_TEST.helmet ? 'ON' : 'OFF'}`, HC.dim);
  hudText(2, 4, 'CLICK: DROP A LIGHT   1-4: KIND   F: TORCH   H: HELMET   K: CLEAR', HC.dim);
}
