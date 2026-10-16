// ===================== GAME · meteors, sand, lamps and the hooks handed to the engine =====================
// Meteors fall by themselves every few seconds and wherever the visitor clicks; each breaks the rock where it lands, and
// what loses its support falls as chunks. Sand pours from two hoppers in turn. When most of the word is gone it is built
// again. Nothing to win: it is there to show the engine working.
let METEORS = [], nextMeteor = 1.5, rebuildT = -1, pourT = 0, clicked = false;

function startShow() { genSite(); METEORS = []; nextMeteor = 1.5; rebuildT = -1; pourT = 0; setState('play'); updateCamera(0, true); }

// a meteor from above the view, aimed at a world point
function launchMeteor(tx, ty, byVisitor) {
  const S = RES, side = Math.random() < .5 ? -1 : 1, top = cam.y - 6 * S;
  const vy = 95 * S, t = Math.max(.2, (ty - top) / vy), vx = side * rr(18, 34) * S;
  METEORS.push({ x: tx - vx * t, y: top, vx, vy, loud: byVisitor });
}
function stepMeteors(dt) {
  const S = RES;
  for (const m of METEORS) {
    if (m.dead) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(m.vx, m.vy) * dt / .5));
    for (let i = 0; i < n && !m.dead; i++) {
      m.x += m.vx * dt / n; m.y += m.vy * dt / n;
      if (m.y > H * ASPECT || m.x < 0 || m.x >= W) { m.dead = true; break; }
      if (m.y > 0 && getC(Math.floor(m.x), Math.floor(m.y / ASPECT)) !== EMPTY) {
        m.dead = true; blastFrom(m.vx, m.vy); explode(m.x, m.y, (2.5 + 1.5 * SITE.k) * S, 1.3, !m.loud);   // in step with the word's size
        FX.shake = Math.min(1, FX.shake + .25);
      }
    }
    if (!m.dead) for (let i = 0; i < 2 * S; i++) spawnP(i & 1 ? PT_FIRE : PT_SPARK, m.x + rr(-.6, .6) * S, m.y, -m.vx * .15 + rr(-4, 4) * S, -m.vy * .1 + rr(-4, 4) * S, rr(.2, .5), 0, 0);
  }
  METEORS = METEORS.filter(m => !m.dead);
}

// two hoppers above the word take turns pouring sand
function pourSand(dt) {
  const S = RES, rate = TUNE.sand * (SITE.x1 - SITE.x0) * .1;   // grains a second, in step with the word's size
  pourT += dt;
  const phase = (pourT / 9) % 2, x = phase < 1 ? SITE.x0 + (SITE.x1 - SITE.x0) * .3 : SITE.x0 + (SITE.x1 - SITE.x0) * .7;
  if ((pourT % 9) > 5) return;   // a pause between pours
  for (let n = rate * dt + Math.random(); n >= 1; n--) spawnGrain(x + rr(-1.5, 1.5) * S, cam.y + 2 * S, rr(-3, 3) * S, rr(0, 6) * S, SAND);
}

function gameUpdate(dt) {
  if (state !== 'play') return;
  SITE.t += dt;
  if (Input.pressed.has('Tap') && Input.aim) {   // the visitor drops one
    const a = Input.aim; clicked = true;
    launchMeteor(cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT, true);
  }
  if ((nextMeteor -= dt) <= 0) {
    nextMeteor = TUNE.meteorEvery * rr(.7, 1.3);
    launchMeteor(rr(SITE.x0, SITE.x1), SITE.y0 * ASPECT + rr(0, (SITE.gy - SITE.y0) * ASPECT), false);
  }
  stepMeteors(dt);
  if (TUNE.sand > 0) pourSand(dt);
  // most of the word gone (or a long while passed): build it again after a moment
  if (rebuildT < 0 && (countLetters() < SITE.letters * .3 || SITE.t > 75)) rebuildT = 2.5;
  if (rebuildT >= 0 && (rebuildT -= dt) < 0) startShow();
}

const lampRow = () => SITE.y0 - 6 * SITE.k;   // the lamp heads, a little above the word
function gameLights(t, out) {
  if (!SITE) return;
  const S = RES, y = lampRow() * ASPECT;
  out.push({ x: SITE.x0 - 8 * S, y, r: 90 * S, c: [1, .7, .4], I: 1.6, shadow: true, flicker: 'candle', seed: 1 });
  out.push({ x: SITE.x1 + 8 * S, y, r: 90 * S, c: [.45, .75, 1], I: 1.5, shadow: true, flicker: 'fluorescent', seed: 2 });
  for (const m of METEORS) out.push({ x: m.x, y: m.y, r: 22 * S, c: [1, .62, .3], I: 1.4, shadow: false });
}
function gameDraw(t) {
  if (!SITE) return;
  const S = RES, y = lampRow();
  // the two lamps: a pole and a lit head, glowing with their light's flicker
  for (const [x, c, kind, seed] of [[SITE.x0 - 8 * S, [1, .7, .4], 'candle', 1], [SITE.x1 + 8 * S, [.45, .75, 1], 'fluorescent', 2]]) {
    const cx = Math.floor(x), f = flickerAt(kind, t, seed);
    for (let cy = y + 1; cy < SITE.gy; cy++) putLit(cx, cy, 124, .55, .57, .62, .3);
    putEmit(cx, y, 79, c[0] * (1.4 * f + .2), c[1] * (1.4 * f + .2), c[2] * (1.4 * f + .2));
  }
  for (const m of METEORS) putEmit(Math.floor(m.x), Math.floor(m.y / ASPECT), 64, 2, 1.3, .5);
}
function gameHud(t) {
  hudText(1, 0, 'LIVE: THE GLYPHITE ENGINE, RUNNING IN THIS PAGE', HC.dim);
  if (!clicked) { const h = 'CLICK OR TAP TO DROP A METEOR'; hudText(Math.max(0, (R.hcols - h.length) >> 1), R.hrows - 2, h, (t * 2 | 0) & 1 ? HC.amber : HC.dim); }
}

Glyphite.run({
  id: 'showcase',
  detail: { default: 2, narrow: 1.5 },
  keys: { detail: true, bloom: true, mute: true, pause: false },
  stars: 1,
  init() { setGravity(9); setEyeAdaptation(.5, { max: 2 }); startShow(); },
  regenerate() { startShow(); },
  update: gameUpdate, lights: gameLights, draw: gameDraw, hud: gameHud,
  camera(VW, VH, out) { if (SITE) { out[0] = (W - VW) / 2; out[1] = SITE.gy * ASPECT - VH * .72; } },
  start() { if (state !== 'play') startShow(); },
  probe: () => ({ letters: SITE && SITE.letters, standing: SITE && countLetters(), meteors: METEORS.length, k: SITE && SITE.k, world: [W, H] })
});
