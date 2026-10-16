// ===================== GAME · cat-bots =====================
// The station's old security robots, still on patrol. Each walks its deck on an engine Character, turning at walls and
// ledges, sweeping a red eye-beam ahead. When it sees the mouse (in front, close, about level, nothing in between) it
// beeps and gives chase until the mouse is out of sight for a moment. Touching one from the side is the end of the mouse;
// landing on one from above shorts it out with a bang that also breaks crates, cracked walls and cheese nearby; the wreck
// stays where it fell, sparking and smoking for a moment. Drawn from the art sheet: patrol walk, alert, chase run, shorted.
const CAT_W = 7.4, CAT_H = 4.8;   // the box, base units
let CATS = [];

function spawnCats() {
  const S = RES;
  CATS = SEC.cats.map((p, i) => ({ id: i, dir: i % 2 ? 1 : -1, alert: 0, spotT: 0, anim: 0, t: 0, alive: !(SEC.catsDown && SEC.catsDown.has(i)),
    ch: new Character(p.x, p.y, { w: CAT_W * S, h: CAT_H * S, run: 14 * S, jump: 4 * S, accelT: .3, stopT: .15, air: .3 }) }));
}

function stepCats(dt) {
  const S = RES, m = MOUSE && MOUSE.alive && MOUSE.safeT <= 0 ? MOUSE.ch : null;
  for (const k of CATS) {
    if (!k.alive) continue;
    const c = k.ch, eyeY = c.y - c.o.h * .7;
    if (m) {
      const dx = m.x - c.x, dy = (m.y - m.o.h / 2) - (c.y - c.o.h / 2);
      const sees = Math.abs(dx) < 46 * S && Math.abs(dy) < 9 * S && (Math.sign(dx) === k.dir || Math.abs(dx) < 9 * S || k.alert > 0) &&
        lineClear(c.x, eyeY, m.x, m.y - m.o.h * .5, 1);
      if (sees) {
        if (k.alert <= 0) { k.spotT = .45; addText(c.x, c.y - c.o.h - 3 * S, '!', [255, 90, 70], .8); Sfx.alarm(); hint('cat', 'JUMP ON A CAT-BOT TO SHORT IT OUT'); }
        k.alert = 1.4; k.dir = dx < 0 ? -1 : 1;
      }
    }
    k.alert = Math.max(0, k.alert - dt); k.spotT = Math.max(0, k.spotT - dt); k.t += dt;
    c.o.run = (k.alert > 0 ? 30 : 14) * S * TUNE.catSpeed;
    applyGravityZone(c, 4 * S);
    // walls and ledges: patrolling it turns round, chasing it waits at the edge
    const row = Math.round(c.y / ASPECT), ahead = Math.floor(c.x + k.dir * (c.o.w / 2 + .8));
    const wall = c.solid(ahead, row - 1) && c.solid(ahead, Math.floor((c.y - c.o.h * .6) / ASPECT));
    const ledge = c.onGround && !c.solid(ahead, row, c.y) && !c.solid(ahead, row + 1, c.y);
    let go = k.dir;
    if (wall || ledge) { if (k.alert > 0) go = 0; else k.dir = go = -k.dir; }
    c.step(dt, { x: k.spotT > 0 ? 0 : go });   // it stops for a moment when it spots the mouse
    k.anim += Math.abs(c.vx) * dt / S;
    if (c.blocked(c.x, c.y)) c.unstick(3 * ASPECT);
    if (c.ground === RUST) crumbleAt(c);
    if (c.y > H * ASPECT + 10 * S) { k.alive = false; continue; }
    // the mouse: on top of it (stomp) or anywhere else (caught)
    if (m && Math.abs(m.x - c.x) < (m.o.w + c.o.w) / 2 && m.y > c.y - c.o.h && m.y - m.o.h < c.y) {
      if (m.vy > 0 && m.y < c.y - c.o.h * .45) stompCat(k);
      else killMouse('CAUGHT BY A CAT-BOT');
    }
  }
}

function stompCat(k) {
  const c = k.ch, S = RES, m = MOUSE.ch;
  k.alive = false; bots++;
  (SEC.catsDown = SEC.catsDown || new Set()).add(k.id);
  SEC.wrecks.push({ x: c.x / SEC.tw, y: c.y / SEC.tw, vy: 0, dir: k.dir, t: SEC.time });   // in tiles, so it survives a change of detail
  m.vy = -Math.sqrt(2 * G * m.o.jump * .75);   // bounce off it
  explode(c.x, c.y - c.o.h * .45, 4.5 * S, .8);
  for (let n = 0; n < 16 * S; n++) spawnP(PT_WRECK, c.x + rr(-3, 3) * S, c.y - rr(0, 4) * S, rr(-20, 20) * S, -rr(6, 26) * S, rr(2, 4), pick('/\\|=#%o[]'), 0);
  addText(c.x, c.y - c.o.h - 4 * S, 'BZZT!', [255, 120, 90], 1);
}

// wrecks settle onto whatever is left under them (the bang may have broken the crate they stood on), and spark for a while
function stepWrecks(dt) {
  const S = RES;
  for (const w of SEC.wrecks) {
    const x = w.x * SEC.tw, y = w.y * SEC.tw, age = SEC.time - w.t;
    if (getC(Math.floor(x), Math.floor((y + .3) / ASPECT)) === EMPTY && y < H * ASPECT) { w.vy += G * dt; w.y += w.vy * dt / SEC.tw; } else w.vy = 0;
    if (age < 2.5 && Math.random() < .25) spawnP(PT_SPARK, x + rr(-2, 2) * S, y - rr(1, 3) * S, rr(-8, 8) * S, -rr(4, 14) * S, rr(.15, .4), pick("*+'"), 0);
  }
}

// the frame for what it is doing: the alert pose when it spots the mouse, then the chase run; walking on patrol
function catFrame(k) {
  const v = Math.abs(k.ch.vx);
  if (k.spotT > 0) return (k.t * 8 | 0) & 1 ? 'alert2' : 'alert1';
  if (k.alert > 0 && v > 4 * RES) return 'run' + (1 + (Math.floor(k.anim / 2.4) & 3));
  if (v > RES) return 'walk' + (1 + (Math.floor(k.anim / 1.6) & 3));
  return k.alert > 0 ? 'alert1' : 'walk1';
}
function drawCats(t) {
  for (const w of SEC.wrecks) drawSprite(CAT_SPR[SEC.time - w.t < 1.2 ? 'down1' : 'down2'], w.x * SEC.tw, w.y * SEC.tw, 0, { flip: w.dir < 0 });
  for (const k of CATS) if (k.alive) {
    const c = k.ch, spr = CAT_SPR[catFrame(k)];
    drawSprite(spr, c.x, c.y, 0, { flip: k.dir < 0 });
    // the eyes glow whatever the light; brighter when it has seen you
    if (!spr.eye) continue;
    const q = k.alert > 0 ? 1.8 : 1.1;
    putEmit(Math.floor(c.x + k.dir * spr.eye[0] * RES), Math.floor((c.y + spr.eye[1] * RES) / ASPECT), k.alert > 0 && ((t * 8) | 0) & 1 ? 64 : 111, 1.6 * q, .25 * q, .15 * q);
  }
}
function markCats() {
  let top = 1e9;
  for (const k of CATS) if (k.alive) top = Math.min(top, markSpriteDyn(CAT_SPR[catFrame(k)], k.ch.x, k.ch.y, 0, { flip: k.dir < 0 }));
  return top;
}
function catLights(out) {
  const S = RES;
  for (const k of CATS) if (k.alive) {
    const c = k.ch, a = k.alert > 0, e = CAT_SPR[catFrame(k)].eye || [2.8, -c.o.h * .7 / S];
    out.push({ x: c.x + k.dir * e[0] * S, y: c.y + e[1] * S, r: (a ? 50 : 34) * S, c: [1, .16, .1], I: a ? 1.3 : .6, shadow: true, dx: k.dir, dy: .16, cos: Math.cos(.3), skip: 2 * S });
  }
}
