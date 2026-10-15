// ===================== GAME · lander, rockets, meteoroids =====================
// Lander geometry in base units (y down, origin = centre of mass); scaled by RES on spawn. The
// shape follows the pixel-art sprite it is drawn from (src/10a_lander_*.js, 0.28 units per pixel).
// Landing gear: each leg is a strut from a knuckle on the descent stage to a footpad, with a
// spring and damper inside. The pad slides up the strut as it compresses; only when the full
// stroke is used up do the rigid "bottom-out" points below take the load (and the shock).
const LEG0 = { ax: 3.92, ay: 1.96, fx: 5.46, fy: 6.16, stroke: 1.5, pad: 1.26, k: 4.3, c: 2.2 };
const LANDER_HULL0 = [
  { x: -4.48, y: 1.82, kind: 2 }, { x: 4.48, y: 1.82, kind: 2 },          // strut knuckles: side hits shear the gear
  { x: -1.2, y: -7.7, kind: 0 }, { x: 1.1, y: -7.7, kind: 0 },            // antenna dish
  { x: -1.6, y: -5.6, kind: 0 }, { x: 1.5, y: -5.6, kind: 0 },            // top of the ascent stage
  { x: -3.08, y: -5.32, kind: 0 }, { x: -4.48, y: -3.78, kind: 0 }, { x: 4.2, y: -4.2, kind: 0 },   // RCS quads
  { x: 3.36, y: -2.38, kind: 0 }, { x: -3.36, y: -1.96, kind: 0 },        // tank bulge, lower ascent stage
  { x: -3.36, y: -.84, kind: 0 }, { x: 3.36, y: -.84, kind: 0 },          // descent stage: top corners
  { x: -4.2, y: .98, kind: 0 }, { x: 4.2, y: .98, kind: 0 },              //   sides
  { x: -2.8, y: 3.08, kind: 0 }, { x: 2.8, y: 3.08, kind: 0 },            //   bottom corners
  { x: -1.3, y: 4.48, kind: 0 }, { x: 1.2, y: 4.48, kind: 0 }             // engine bell
];
const LANDER_RAMP = Array.from(' .:-=+*#%@', c => c.charCodeAt(0));
let LANDER_HULL = [];
function scaleLander() {
  const S = RES;
  const [dx, dy] = legDir(1), bx = LEG0.fx - dx * LEG0.stroke, by = LEG0.fy - dy * LEG0.stroke;
  const feet = [];   // where the pads sit when the struts have bottomed out
  for (const sd of [-1, 1]) for (const o of [-.9, .9]) feet.push({ x: sd * bx + o * LEG0.pad, y: by, kind: 1, side: sd });
  // the bottom-out points sit just inside the contact skin, so they engage only once the stroke is used up
  LANDER_HULL = [...feet, ...LANDER_HULL0].map(p => ({ ...p, x: p.x * S, y: p.y * S - (p.kind === 1 ? .25 : 0) }));
}

function legDir(sd) { const ux = sd * (LEG0.fx - LEG0.ax), uy = LEG0.fy - LEG0.ay, l = Math.hypot(ux, uy); return [ux / l, uy / l, l]; }

let L = null, rockets = [], meteors = [], state = 'title', stateT = 0, score = 0, lives = 3, shower = false, showerT = 12;
const tmp2 = [0, 0], tmp3 = [0, 0, 0];

function spawnLander() {
  scaleLander();
  const S = RES, s = LEVEL.spawn, b = new Body(s.x, s.y, 1, 22 * S * S, LANDER_HULL);
  b.vx = s.vx; b.vy = 1.5 * S;
  L = { body: b, throttle: 0, fuel: LEVEL.fuelMax, rockets: LEVEL.rockets, alive: true, cool: 0, lights: true, landedT: 0, touchV: 0, offsiteShown: false, strandT: 0, reason: '', crystals: 0, rcs: 0,
    ef: [0, 0, 0], legs: [-1, 1].map(side => ({ side, c: 0, cv: 0, touch: false, hitV: 0, mat: 0, px: 0, py: 0 })) };
  rockets = []; meteors = []; shower = false; showerT = 10 + Math.random() * 8;
}

function controlLander(dt) {
  const b = L.body, S = RES;
  const up = keyDown('ArrowUp', 'KeyW') || Input.touch.thrust;
  const rot = ((keyDown('ArrowRight', 'KeyD') || Input.touch.right) ? 1 : 0) - ((keyDown('ArrowLeft', 'KeyA') || Input.touch.left) ? 1 : 0);
  const target = up && L.fuel > 0 ? 1 : 0;
  L.throttle += (target - L.throttle) * Math.min(1, dt * (target ? 10 : 14));
  if (L.throttle < .01) L.throttle = 0;
  const T = 2.7 * G * L.throttle;                            // descent engine: ~2.7 lunar g at full
  L.ef[0] = Math.sin(b.a) * T * b.m; L.ef[1] = -Math.cos(b.a) * T * b.m;
  L.fuel = Math.max(0, L.fuel - LEVEL.burn * L.throttle * dt);
  // RCS: rate command while held, rate damping (attitude hold) otherwise
  if (rot && L.fuel > 0) { L.ef[2] = (Math.abs(b.w) < 2.4 || Math.sign(b.w) !== rot ? rot * 6 : 0) * b.I; L.fuel = Math.max(0, L.fuel - .5 * dt); }
  else L.ef[2] = clamp(-b.w * 7, -5, 5) * b.I;
  L.rcs = rot;
  if (rot && Math.random() < .7) {
    b.toWorld(-4.5 * rot * S, -3.8 * S, tmp2); const d = b.dirWorld(-rot, -.3, [0, 0]);
    spawnP(PT_VAPOR, tmp2[0], tmp2[1], b.vx + d[0] * rr(10, 18) * S, b.vy + d[1] * rr(10, 18) * S, rr(.15, .35), pick('-~.'), 0);
  }
  // exhaust plume: hot gas particles that scour and heat whatever they hit
  if (L.throttle > .04) {
    const n = (L.throttle * 9 * S + Math.random()) | 0;
    for (let k = 0; k < n; k++) {
      const sp = rr(26, 46) * S * (.55 + .45 * L.throttle), spread = rr(-.2, .2);
      const d = b.dirWorld(Math.sin(spread), Math.cos(spread), [0, 0]); b.toWorld(rr(-1, 1) * S, 4.6 * S, tmp2);
      spawnP(PT_GAS, tmp2[0], tmp2[1], b.vx + d[0] * sp, b.vy + d[1] * sp, rr(.35, .9) * (.5 + .5 * L.throttle), 0, 0);
    }
  }
  Sfx.engine(L.throttle);
  L.cool = Math.max(0, L.cool - dt);
}

// Spring-damper struts. Three rays per leg (pad centre and both ends) run down the strut to
// find the ground (marched, then bisected to a few hundredths of a unit so the spring force is
// smooth); the stroke used up is the compression x, and the strut pushes back with k·x + c·ẋ,
// where ẋ is the closing speed of the pad along the strut taken from the body's own motion.
const _U = [0, 0], _A2 = [0, 0], _P = [0, 0];
function legForces(h) {
  const b = L.body, S = RES, st = LEG0.stroke * S, k = LEG0.k * b.m, cd = LEG0.c * b.m;
  for (const leg of L.legs) {
    const sd = leg.side, [ux, uy, len] = legDir(sd), L0 = len * S, q0 = L0 - st - .3 * S;
    b.toWorld(sd * LEG0.ax * S, LEG0.ay * S, _A2); b.dirWorld(ux, uy, _U); b.dirWorld(1, 0, _P);
    let t = L0 + .02 * S, hx = 0, hy = 0;
    for (const o of [-.85, 0, .85]) {
      const ox = _A2[0] + _P[0] * o * LEG0.pad * S, oy = _A2[1] + _P[1] * o * LEG0.pad * S;
      let q = q0; while (q < t && !solidU(ox + _U[0] * q, oy + _U[1] * q)) q += .25;
      if (q >= t) continue;
      let lo = Math.max(q0, q - .25), hi = q;
      for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (solidU(ox + _U[0] * m, oy + _U[1] * m)) hi = m; else lo = m; }
      if (hi < t) { t = hi; hx = ox + _U[0] * hi; hy = oy + _U[1] * hi; }
    }
    const comp = clamp(L0 - t, 0, st);
    if (comp <= .004 * S) { leg.c = 0; leg.touch = false; leg.cv = 0; continue; }
    const rx = hx - b.x, ry = hy - b.y, vpx = b.vx - b.w * ry, vpy = b.vy + b.w * rx;
    const cv = vpx * _U[0] + vpy * _U[1];                       // + while the strut is being pushed in
    leg.c = comp;
    const F = Math.max(0, k * comp + cd * cv), fx = -_U[0] * F, fy = -_U[1] * F;
    b.fx += fx; b.fy += fy; b.tq += rx * fy - ry * fx;
    // pad friction: resist sliding along the ground, capped by Coulomb friction
    normalAt(hx, hy, _n); const tx = -_n[1], ty = _n[0];
    const vt = vpx * tx + vpy * ty, lim = (leg.mat === REGO ? .75 : .95) * F;
    const ft = clamp(-vt * 8 * b.m, -lim, lim);
    b.fx += tx * ft; b.fy += ty * ft; b.tq += (rx * ty - ry * tx) * ft;
    if (!leg.touch) leg.hitV = Math.max(.001, -(vpx * _n[0] + vpy * _n[1]));   // speed into the ground at first contact
    leg.touch = true; leg.mat = matU(hx, hy); leg.px = hx; leg.py = hy; leg.cv = cv;
  }
}

function aimToWorld(a) { return [cam.x + a[0] * R.cols, cam.y + a[1] * R.rows * ASPECT]; }
function fireRocket(aim) {
  if (!L || !L.alive || L.cool > 0) return;
  const S = RES, b = L.body;
  if (L.rockets <= 0) { addText(b.x, b.y - 12 * S, 'NO ROCKETS', [255, 140, 76], 1); Sfx.alarm(); L.cool = .5; return; }
  let dx, dy;
  if (aim) { const w = aimToWorld(aim); dx = w[0] - b.x; dy = w[1] - b.y; } else { b.dirWorld(0, 1, tmp2); dx = tmp2[0]; dy = tmp2[1]; }
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const side = dx >= 0 ? 1 : -1; b.toWorld(4.6 * side * S, .4 * S, tmp2);
  rockets.push({ x: tmp2[0], y: tmp2[1], vx: b.vx + dx * 16 * S, vy: b.vy + dy * 16 * S, dx, dy, t: 0 });
  b.vx -= dx * 1.1 * S; b.vy -= dy * 1.1 * S; b.w -= side * .25;     // recoil
  L.rockets--; L.cool = .28;
  for (let k = 0; k < 10 * S; k++) spawnP(PT_FIRE, tmp2[0], tmp2[1], b.vx - dx * rr(4, 14) * S + rr(-5, 5) * S, b.vy - dy * rr(4, 14) * S + rr(-5, 5) * S, rr(.1, .3), 0, 0);
  addLight(tmp2[0], tmp2[1], 22 * S, [1, .75, .4], 1.4, .15);
  Sfx.launch();
}

function stepRockets(dt) {
  const S = RES;
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; r.t += dt;
    if (r.t < 1.2) {
      r.vx += r.dx * 75 * S * dt; r.vy += r.dy * 75 * S * dt;
      for (let k = 0; k < 2 * S; k++) spawnP(PT_FIRE, r.x - r.dx * 1.6 * S, r.y - r.dy * 1.6 * S, (-r.dx * 12 + rr(-3, 3)) * S, (-r.dy * 12 + rr(-3, 3)) * S, rr(.1, .3), 0, 0);
    }
    if (Math.random() < .5) spawnP(PT_SMOKE, r.x - r.dx * 2 * S, r.y - r.dy * 2 * S, rr(-1.5, 1.5) * S, rr(-1.5, 1.5) * S, rr(.6, 1.4), pick('o.:'), 0);
    r.vy += G * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(r.vx, r.vy) * dt / .5));
    let boom = r.t > 4.5;
    for (let s = 0; s < n && !boom; s++) {
      r.x += r.vx * dt / n; r.y += r.vy * dt / n;
      if (r.x < 0 || r.x >= W || r.y > H * ASPECT) { rockets.splice(i, 1); boom = null; break; }
      if (solidU(r.x, r.y)) boom = true;
      for (const m of meteors) if (Math.hypot(m.x - r.x, m.y - r.y) < 3.5 * S) { m.dead = true; boom = true; }
      for (const bo of boulders) if (!bo.dead && Math.hypot(bo.x - r.x, bo.y - r.y) < bo.r + .6 * S) boom = true;
      if (chunks.length && chunkAt(r.x, r.y)) boom = true;
    }
    if (boom === null) continue;
    if (boom) { rockets.splice(i, 1); blastFrom(r.vx, r.vy); explode(r.x, r.y, 6.5 * S, 1.15); }
  }
}

function spawnMeteor(x) {
  const S = RES;
  meteors.push({ x: x !== undefined ? x : cam.x + rr(-.2, 1.2) * R.cols, y: Math.min(-6 * S, cam.y - 8 * S), vx: rr(-14, 14) * S, vy: rr(26, 40) * S, R: rr(4, 6.5) * S, dead: false });
}
function stepMeteors(dt) {
  const S = RES;
  if (state === 'play' && LEVEL.meteorRate > 0) {
    showerT -= dt;
    if (showerT < 0) { shower = !shower; showerT = shower ? rr(5, 8) : rr(14, 24); if (shower) Sfx.alarm(); }
    if (shower && Math.random() < LEVEL.meteorRate * dt * 22) spawnMeteor();
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    if (m.dead) { meteors.splice(i, 1); explode(m.x, m.y, m.R * .7, .9); continue; }
    m.vy += G * dt * .3;
    for (let k = 0; k < 3 * S; k++) spawnP(PT_FIRE, m.x + rr(-.6, .6) * S, m.y + rr(-.6, .6) * S, -m.vx * .2 + rr(-4, 4) * S, -m.vy * .2 + rr(-4, 4) * S, rr(.2, .5), 0, 0);
    if (Math.random() < .6) spawnP(PT_SMOKE, m.x, m.y, rr(-2, 2) * S, rr(-2, 2) * S, rr(.8, 1.6), pick('o.:'), 0);
    const n = Math.max(1, Math.ceil(Math.hypot(m.vx, m.vy) * dt / .5));
    let hit = false;
    for (let s = 0; s < n; s++) {
      m.x += m.vx * dt / n; m.y += m.vy * dt / n;
      if (m.y > 0 && solidU(m.x, m.y)) { hit = true; break; }
      if (boulders.some(bo => !bo.dead && Math.hypot(bo.x - m.x, bo.y - m.y) < bo.r + .5 * S)) { hit = true; break; }
      if (chunks.length && chunkAt(m.x, m.y)) { hit = true; break; }
    }
    if (L && L.alive && Math.hypot(L.body.x - m.x, L.body.y - m.y) < 5.5 * S) { meteors.splice(i, 1); explode(m.x, m.y, m.R, 1.2); crashLander('METEOROID STRIKE'); continue; }
    if (hit || m.x < -20 * S || m.x > W + 20 * S || m.y > H * ASPECT) { meteors.splice(i, 1); if (hit) { blastFrom(m.vx, m.vy); explode(m.x, m.y, m.R, 1.25); } }
  }
}

function crashLander(reason) {
  if (!L || !L.alive) return;
  const S = RES, b = L.body;
  L.alive = false; L.reason = reason; state = 'crashed'; stateT = 0;
  explode(b.x, b.y, 7 * S, 1.7);
  for (let k = 0; k < 36 * S; k++) spawnP(PT_WRECK, b.x + rr(-4, 4) * S, b.y + rr(-5, 3) * S, b.vx * .5 + rr(-24, 24) * S, b.vy * .4 - rr(6, 28) * S, rr(6, 10), pick('/\\|=#%[]o_'), 0);
  FX.slow = .22; FX.slowT = 1.5; FX.flashCol = [1, .7, .45];
  lives--; Sfx.engine(0);
}

function collectCrystal() { score += 100; L.crystals++; addText(L.body.x, L.body.y - 13 * RES, '+100 He-3', [102, 255, 230]); Sfx.pickup(); }
PICKUP_PULL = (i, dt) => {
  if (!L || !L.alive) return;
  const S = RES, dx = L.body.x - P.x[i], dy = L.body.y - P.y[i], d = Math.hypot(dx, dy);
  if (d < 22 * S) { const k = 70 * S * dt * (1 - d / (22 * S)) / Math.max(d, .5); P.vx[i] += dx * k; P.vy[i] += dy * k - G * dt; }
  if (d < 5 * S) { P.age[i] = P.life[i]; collectCrystal(); }
};
// a projectile's blast drives loose pieces along its flight: the push is centred a little behind the impact
let blastDir = null;
function blastFrom(vx, vy) { const l = Math.hypot(vx, vy); blastDir = l > 1e-6 ? [vx / l, vy / l] : null; }
onBlast = (x, y, R0, power, quiet) => {
  if (!quiet) Sfx.boom(power);
  const px = blastDir ? x - blastDir[0] * R0 * .8 : x, py = blastDir ? y - blastDir[1] * R0 * .8 : y; blastDir = null;
  blastChunks(x, y, R0, power, px, py);
  structuralCheck(x, y, R0); scheduleRecheck(x, y, R0);
  for (const ch of chunks) if (ch.age === 0) blastPush(ch, px, py, R0, power);   // freshly broken pieces catch the same blast
  blastBoulders(x, y, R0, power);
  if (LEVEL) for (const lp of LEVEL.lamps) {       // shockwave: nearby lamps shatter, farther ones flicker
    if (lp.dead) continue;
    const d = Math.hypot(lp.x - x, lp.y - y);
    if (d < R0 * .9) shatterLamp(lp);
    else if (d < R0 * 5) lp.flick = Math.max(lp.flick, .6 + Math.random());
  }
  if (!L || !L.alive) return;
  const S = RES, b = L.body, dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
  if (d < R0 * 1.15) { crashLander('CAUGHT IN BLAST'); return; }
  if (d < R0 * 5) { const k = power * 26 * S * (1 - d / (R0 * 5)) / Math.max(d, S); b.vx += dx * k; b.vy += dy * k; b.w += rr(-1, 1) * k * .6 / S; }
};

function evalContacts(dt) {
  const S = RES, b = L.body; let left = false, right = false, crash = null, padL = null, padR = null;
  for (const h of b.hits) {
    const v = h.vn / S;   // impact speed in base units/s (2 per m/s)
    if (h.kind !== 1 && v > 1 && Math.random() < .5) for (let k = 0; k < 4; k++) spawnP(PT_SPARK, h.x, h.y, (rr(-9, 9) + h.nx * 6) * S, rr(-9, -2) * S, rr(.2, .5), pick("*'"), 0);
    if (h.kind === 0 && v > 2.6) crash = `HULL IMPACT ${(h.vn * UNIT_M).toFixed(1)} M/S`;
    else if (h.kind === 2 && v > 5.5) crash = 'LANDING STRUT SHEARED';
    else if (h.kind === 1 && v > 2.4) crash = `GEAR COLLAPSED - TOUCHDOWN ${(Math.max(L.touchV, h.vn) * UNIT_M).toFixed(1)} M/S`;
    else if (h.kind === 1 && v > .6) { Sfx.thud(v * 2); FX.shake = Math.min(1, FX.shake + v * .06); }
  }
  for (const leg of L.legs) {
    if (!leg.touch) continue;
    if (leg.hitV > 0) {   // first instant of touchdown: footpad punches into the dust
      const v = leg.hitV / S; leg.hitV = 0;
      L.touchV = Math.max(L.touchV, v * S);
      if (v > 1.5) for (let k = 0; k < (4 + v * 2) * S; k++) spawnP(PT_DUST, leg.px + rr(-1, 1) * S, leg.py - .5, rr(-1, 1) * v * 2.2 * S, (-rr(1, 4) - v * .4) * S, rr(.6, 1.4), pick(".'`"), REGO);
      if (leg.mat === REGO && v > 4) {
        for (let q = 0; q < Math.ceil(S); q++) {
          const cx = Math.floor(leg.px + (q - (S - 1) / 2)), cy = Math.floor(leg.py / ASPECT);
          if (getC(cx, cy) === REGO) { setC(cx, cy, EMPTY); spawnGrain(cx + .5, cy * ASPECT - .5, rr(-1, 1) * v * 1.5 * S, -v * .6 * S, REGO); }
        }
      }
      if (v > 3) { Sfx.thud(v); FX.shake = Math.min(1, FX.shake + v * .025); }
    }
    const pad = leg.mat === METAL ? LEVEL.pads.find(p => leg.px >= p.x0 - 1.2 * S && leg.px <= p.x1 + 1.2 * S) : null;
    if (pad) { if (leg.side < 0) padL = pad; else padR = pad; }
  }
  left = L.legs[0].touch; right = L.legs[1].touch;
  if (crash) { crashLander(crash); return; }
  // most of the stroke used up: survivable, but the crew felt it
  if (Math.max(L.legs[0].c, L.legs[1].c) > LEG0.stroke * S * .85 && !L.hardShown) {
    L.hardShown = true; addText(b.x, b.y - 12 * S, 'HARD LANDING', [255, 179, 90], 1.6); Sfx.thud(9); FX.shake = Math.min(1, FX.shake + .3);
  } else if (!left && !right) L.hardShown = false;
  if (Math.abs(b.a) > 1.2 && b.bodyDown > 0 && Math.hypot(b.vx, b.vy) < 6 * S) { crashLander('TIPPED OVER'); return; }
  const settled = left && right && Math.hypot(b.vx, b.vy) < 1.1 * S && Math.abs(b.w) < .4 && Math.abs(b.a) < .4;
  if (settled && L.throttle < .1) L.landedT += dt; else { L.landedT = 0; if (!left && !right) L.touchV = 0; }
  if (L.landedT > .7) {
    if (padL && padL === padR) landOnPad(padL);
    else {
      if (!L.offsiteShown) { L.offsiteShown = true; addText(b.x, b.y - 12 * S, 'OFF-SITE - LIFT OFF', [255, 179, 90], 2.2); Sfx.alarm(); }
      if (L.fuel <= 0) { L.strandT += dt; if (L.strandT > 2.5) { L.alive = false; L.reason = 'STRANDED: NO PROPELLANT'; state = 'crashed'; stateT = 0; lives--; Sfx.engine(0); } }
    }
  } else if (!settled) L.offsiteShown = L.offsiteShown && (left || right);
}

function stepLamps(dt) { if (LEVEL) for (const lp of LEVEL.lamps) if (lp.flick > 0) lp.flick = Math.max(0, lp.flick - dt); }

let lastLanding = null;
function landOnPad(pad) {
  state = 'landed'; stateT = 0; Sfx.engine(0); Sfx.win();
  const soft = L.touchV * UNIT_M, mult = pad.mult;
  const base = 50 * mult, fuelB = Math.round(L.fuel) * 2 * mult, softB = soft < 1 ? 100 * mult : soft < 2 ? 40 * mult : 0;
  score += base + fuelB + softB;
  lastLanding = { mult, base, fuelB, softB, soft, crystals: L.crystals };
  addText(L.body.x, L.body.y - 12 * RES, `+${base + fuelB + softB}`, [255, 217, 102], 2.5);
}
