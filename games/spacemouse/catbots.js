// ===================== GAME · cat-bots =====================
// The station's old security robots, still on patrol. Each walks its deck on an engine Character, turning at walls and
// ledges, sweeping a red eye-beam ahead. When it sees the mouse (in front, close, about level, nothing in between) it
// beeps and gives chase until the mouse is out of sight for a moment. Touching one from the side is the end of the mouse;
// landing on one from above shorts it out with a bang that also breaks crates, cracked walls and cheese nearby.
const CAT_W = 7.4, CAT_H = 4.8;   // the box, base units
let CATS = [];

function spawnCats() {
  const S = RES;
  CATS = SEC.cats.map((p, i) => ({ id: i, dir: i % 2 ? 1 : -1, alert: 0, alive: !(SEC.catsDown && SEC.catsDown.has(i)),
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
        if (k.alert <= 0) { addText(c.x, c.y - c.o.h - 3 * S, '!', [255, 90, 70], .8); Sfx.alarm(); hint('cat', 'JUMP ON A CAT-BOT TO SHORT IT OUT'); }
        k.alert = 1.4; k.dir = dx < 0 ? -1 : 1;
      }
    }
    k.alert = Math.max(0, k.alert - dt);
    c.o.run = (k.alert > 0 ? 30 : 14) * S * TUNE.catSpeed;
    applyGravityZone(c, 4 * S);
    // walls and ledges: patrolling it turns round, chasing it waits at the edge
    const row = Math.round(c.y / ASPECT), ahead = Math.floor(c.x + k.dir * (c.o.w / 2 + .8));
    const wall = c.solid(ahead, row - 1) && c.solid(ahead, Math.floor((c.y - c.o.h * .6) / ASPECT));
    const ledge = c.onGround && !c.solid(ahead, row, c.y) && !c.solid(ahead, row + 1, c.y);
    let go = k.dir;
    if (wall || ledge) { if (k.alert > 0) go = 0; else k.dir = go = -k.dir; }
    c.step(dt, { x: go });
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
  m.vy = -Math.sqrt(2 * G * m.o.jump * .75);   // bounce off it
  explode(c.x, c.y - c.o.h * .45, 4.5 * S, .8);
  for (let n = 0; n < 16 * S; n++) spawnP(PT_WRECK, c.x + rr(-3, 3) * S, c.y - rr(0, 4) * S, rr(-20, 20) * S, -rr(6, 26) * S, rr(2, 4), pick('/\\|=#%o[]'), 0);
  addText(c.x, c.y - c.o.h - 4 * S, 'BZZT!', [255, 120, 90], 1);
}

function drawCats(t) {
  for (const k of CATS) if (k.alive) {
    const c = k.ch;
    drawSprite(CAT_SPR, c.x, c.y, 0, { flip: k.dir < 0 });
    // the eyes glow whatever the light; brighter when it has seen you
    const ex = Math.floor(c.x + k.dir * 2.6 * RES), ey = Math.floor((c.y - c.o.h * .72) / ASPECT), q = k.alert > 0 ? 1.8 : 1.1;
    putEmit(ex, ey, k.alert > 0 && ((t * 8) | 0) & 1 ? 64 : 111, 1.6 * q, .25 * q, .15 * q);
  }
}
function markCats() {
  let top = 1e9;
  for (const k of CATS) if (k.alive) top = Math.min(top, markSpriteDyn(CAT_SPR, k.ch.x, k.ch.y, 0, { flip: k.dir < 0 }));
  return top;
}
function catLights(out) {
  const S = RES;
  for (const k of CATS) if (k.alive) {
    const c = k.ch, a = k.alert > 0;
    out.push({ x: c.x + k.dir * 2.8 * S, y: c.y - c.o.h * .7, r: (a ? 50 : 34) * S, c: [1, .16, .1], I: a ? 1.3 : .6, shadow: true, dx: k.dir, dy: .16, cos: Math.cos(.3), skip: 2 * S });
  }
}
