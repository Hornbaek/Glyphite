// ===================== GAME · the drone, its bolts, and gem shards =====================
// Pixel art in the engine's sprite format (tools/sprite2ascii.py writes the same thing from a PNG).
// pal entries: [r, g, b, ink (0 = outline), dense glyph for solid areas]
const SPRITE_DRONE = {
  w: 16, h: 8,
  pal: [[22, 24, 32, 0, '#'], [150, 156, 170, 1, '='], [200, 205, 214, 1, '@'], [90, 210, 255, 1, '@'], [255, 170, 60, 1, '%']],
  rows: [
    '1111100..0011111',
    '...0220..0220...',
    '..022222222220..',
    '.0223333222220..',
    '.0223333222220..',
    '..022222222220..',
    '...04......40...',
    '................'
  ]
};
const DRONE_SPRITE = defineSprite(SPRITE_DRONE, { k: .5, ox: 8, oy: 4 });   // 0.5 base units per pixel: 8 x 4 m
let D = null, bolts = [], score = 0;

function spawnDrone() {
  const S = RES, hull = spriteHull(DRONE_SPRITE, 2).map(p => ({ ...p, x: p.x * S, y: p.y * S }));
  const b = new Body(CAVE.spawn.x, CAVE.spawn.y, 1, 6 * S * S, hull);
  D = { body: b, alive: true, throttle: 0, gems: 0, cool: 0, reason: '' };
  bolts = [];
}

function controlDrone(dt) {
  const b = D.body, S = RES;
  const up = keyDown('ArrowUp', 'KeyW') || Input.touch.thrust;
  const rot = ((keyDown('ArrowRight', 'KeyD') || Input.touch.right) ? 1 : 0) - ((keyDown('ArrowLeft', 'KeyA') || Input.touch.left) ? 1 : 0);
  D.throttle += ((up ? 1 : 0) - D.throttle) * Math.min(1, dt * 12);
  const lift = TUNE.thrust * (GRAVITY > .05 ? G : 3 / UNIT_M) * D.throttle * b.m;
  b.fx = Math.sin(b.a) * lift; b.fy = -Math.cos(b.a) * lift;
  b.tq = (rot ? rot * 5 - b.w * 2 : -b.w * 6) * b.I;     // turn while held, steady itself otherwise
  if (D.throttle > .1) for (let k = 0; k < 2 * S; k++) {   // downwash: hot gas that stirs up dirt
    const d = b.dirWorld(rr(-.3, .3), 1, [0, 0]), p = b.toWorld(rr(-3, 3) * S, 2.2 * S, [0, 0]);
    spawnP(PT_GAS, p[0], p[1], b.vx + d[0] * 30 * S * D.throttle, b.vy + d[1] * 30 * S * D.throttle, rr(.2, .45), 0, 0);
  }
  Sfx.engine(D.throttle * .6);
  D.cool = Math.max(0, D.cool - dt);
}

function aimDir(aim) {   // toward the cursor or tap, else straight ahead
  const b = D.body;
  if (aim) { const dx = cam.x + aim[0] * R.cols - b.x, dy = cam.y + aim[1] * R.rows * ASPECT - b.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  return b.dirWorld(Math.cos(b.a) >= 0 ? 1 : -1, 0, [0, 0]);
}
function fireBolt(aim) {
  if (!D || !D.alive || D.cool > 0) return;
  const S = RES, b = D.body, [dx, dy] = aimDir(aim);
  bolts.push({ x: b.x + dx * 6 * S, y: b.y + dy * 6 * S, vx: b.vx + dx * 60 * S, vy: b.vy + dy * 60 * S, t: 0 });
  D.cool = .35; Sfx.launch();
  addLight(b.x + dx * 6 * S, b.y + dy * 6 * S, 18 * S, [.6, .85, 1], 1.2, .12);
}
function stepBolts(dt) {
  const S = RES;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const o = bolts[i]; o.t += dt;
    const n = Math.max(1, Math.ceil(Math.hypot(o.vx, o.vy) * dt / .5));
    let hit = o.t > 2;
    for (let s = 0; s < n && !hit; s++) { o.x += o.vx * dt / n; o.y += o.vy * dt / n; hit = solidU(o.x, o.y) || !!chunkAt(o.x, o.y); }
    if (Math.random() < .6) spawnP(PT_SPARK, o.x, o.y, rr(-3, 3) * S, rr(-3, 3) * S, rr(.1, .3), pick("'."), 0);
    if (hit) { bolts.splice(i, 1); blastFrom(o.vx, o.vy); explode(o.x, o.y, TUNE.blastRadius * S, 1); }
  }
}

// gem shards: bounce around glowing, then home in on the drone and count when they reach it
const PT_SHARD = defineParticle({
  bounce: .5, friction: .6,
  update(i, dt) {
    if (!D || !D.alive) return;
    const S = RES, dx = D.body.x - P.x[i], dy = D.body.y - P.y[i], d = Math.hypot(dx, dy);
    if (d < 26 * S) { const k = 80 * S * dt * (1 - d / (26 * S)) / Math.max(d, .5); P.vx[i] += dx * k; P.vy[i] += dy * k - G * dt; }
    if (d < 5 * S) { P.age[i] = P.life[i]; D.gems++; score += 10; Sfx.pickup(); addText(D.body.x, D.body.y - 8 * S, '+GEM', [255, 120, 220], 1); }
  },
  light(i, cx, cy) { splatLight(cx, cy, .35, .06, .3, 4); },
  look(i, k, life, time, out) { const q = .7 + .3 * Math.sin(time * 9 + i); out[0] = 1.3 * q; out[1] = .35 * q; out[2] = 1.1 * q; return (((time * 6) | 0) + i) & 1 ? 42 : 43; }
});

// hard hits wreck the drone; anything gentler just bounces
function droneContacts() {
  for (const h of D.body.hits) if (h.vn > 9 * RES) { crashDrone(`HIT THE ROCK AT ${(h.vn * UNIT_M).toFixed(1)} M/S`); return; }
}
function crashDrone(reason) {
  if (!D.alive) return;
  const b = D.body, S = RES;
  D.alive = false; D.reason = reason; Sfx.engine(0);
  explode(b.x, b.y, 4 * S, 1);
  for (let k = 0; k < 20 * S; k++) spawnP(PT_WRECK, b.x, b.y, b.vx * .4 + rr(-18, 18) * S, b.vy * .4 - rr(4, 20) * S, rr(4, 7), pick('/\\|=#%'), 0);
  setState('over');
}
