// ===================== ENGINE · particles & blasts =====================
// Built-in types. Games add their own with defineParticle() (ids from PT_CUSTOM up).
const PT_GRAIN = 1, PT_GAS = 2, PT_FIRE = 3, PT_SPARK = 4, PT_SMOKE = 5, PT_VAPOR = 6, PT_DEBRIS = 7, PT_WRECK = 9, PT_DUST = 10, PT_CUSTOM = 16;
let PMAX = 0;
const P = { n: 0 };
function particlesAlloc(max) {
  PMAX = max; P.n = 0;
  for (const k of ['x', 'y', 'vx', 'vy', 'age', 'life', 'rest']) P[k] = new Float32Array(max);
  for (const k of ['t', 'm', 'g', 's']) P[k] = new Uint8Array(max);
}
particlesAlloc(9000);
const ch = c => c.charCodeAt(0);
const pick = s => s.charCodeAt((Math.random() * s.length) | 0);

function spawnP(t, x, y, vx, vy, life, glyph, m) {
  if (P.n >= PMAX) return -1;
  const i = P.n++;
  P.t[i] = t; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.age[i] = 0; P.life[i] = life;
  P.g[i] = glyph; P.m[i] = m | 0; P.s[i] = (Math.random() * 256) | 0; P.rest[i] = 0;
  return i;
}
function killP(i) {
  const j = --P.n; if (i === j) return;
  P.t[i] = P.t[j]; P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.age[i] = P.age[j];
  P.life[i] = P.life[j]; P.g[i] = P.g[j]; P.m[i] = P.m[j]; P.s[i] = P.s[j]; P.rest[i] = P.rest[j];
}
function grainGlyph(m) { return pick(MAT_GRAINS[m] || '.'); }
function spawnGrain(x, y, vx, vy, m) { return spawnP(MAT_DEBRIS[m] ? PT_DEBRIS : PT_GRAIN, x, y, vx, vy, 14, grainGlyph(m), m) >= 0; }

// ---------- game-defined particle types ----------
// defineParticle({ gravity, drag, bounce, friction, update(i, dt), light(i, cx, cy, life), look(i, k, life, time, out) })
//   gravity  multiplier on G (default 1)        drag      fraction of speed lost per second (default 0)
//   bounce   restitution on contact (.45)       friction  tangential keep factor on contact (.55)
//   update   called every step before moving (steer, collect, age...)
//   light    emissive: call splatLight(cx, cy, r, g, b, rad) to glow (optional)
//   look     fill out = [r, g, b] in light units and return a glyph code; k indexes the light buffers
const PTYPES = [];
function defineParticle(spec) {
  const t = PT_CUSTOM + PTYPES.length; if (t > 255) throw new Error('too many particle types');
  PTYPES.push({ gravity: 1, drag: 0, bounce: .45, friction: .55, ...spec, id: t });
  return t;
}
const ptype = t => t >= PT_CUSTOM ? PTYPES[t - PT_CUSTOM] : null;

// put a flying grain back into the voxel grid (search upward for room)
function deposit(x, y, m) {
  const cx = Math.floor(x); let cy = Math.floor(y / ASPECT);
  for (let k = 0; k < 4; k++, cy--) if (cy >= 0 && getC(cx, cy) === EMPTY) { setC(cx, cy, m); return true; }
  return false;
}

// ---------- VFX state ----------
const FX = { shake: 0, flash: 0, flashCol: [1, .85, .6], slow: 1, slowT: 0, rings: [], lights: [], texts: [] };
function addLight(x, y, r, c, I, life, shadow = true) { FX.lights.push({ x, y, r, c, I, life, age: 0, shadow }); }
function addRing(x, y, max, life, c) { FX.rings.push({ x, y, max, life, age: 0, c: c || [1, .9, .7] }); }
function addText(x, y, text, c, life = 1.6) { FX.texts.push({ x, y, text, c, life, age: 0 }); }

const _n = [0, 0];

function stepParticles(dt) {
  const X = P.x, Y = P.y, VX = P.vx, VY = P.vy, T = P.t, S = RES;
  for (let i = 0; i < P.n; i++) {
    P.age[i] += dt;
    if (P.age[i] >= P.life[i]) {
      if (T[i] === PT_GRAIN || T[i] === PT_DEBRIS) deposit(X[i], Y[i], P.m[i]);   // never lose mass
      killP(i); i--; continue;
    }
    const t = T[i];
    // forces (vacuum: only gas and smoke get a little fake drag so plumes read well)
    const ct = t >= PT_CUSTOM ? PTYPES[t - PT_CUSTOM] : null;
    if (ct) {
      if (ct.drag) { const k = 1 - ct.drag * dt; VX[i] *= k; VY[i] *= k; }
      VY[i] += G * ct.gravity * dt;
      if (ct.update) ct.update(i, dt);
    }
    else if (t === PT_GAS || t === PT_FIRE) { const k = 1 - 1.6 * dt; VX[i] *= k; VY[i] *= k; }
    else if (t === PT_SMOKE || t === PT_VAPOR) { const k = 1 - 1.1 * dt; VX[i] *= k; VY[i] = VY[i] * k - (t === PT_VAPOR ? 1.2 : .4) * S * dt; }
    else VY[i] += G * dt;
    // integrate with sub-steps so nothing tunnels through a cell
    const sp = Math.abs(VX[i]) + Math.abs(VY[i]);
    const n = Math.min(10, 1 + ((sp * dt / .7) | 0));
    const h = dt / n;
    let dead = false;
    for (let s = 0; s < n; s++) {
      const nx = X[i] + VX[i] * h, ny = Y[i] + VY[i] * h;
      if (nx < 0 || nx >= W || ny >= H * ASPECT) { dead = true; break; }
      const cx = Math.floor(nx), cy = Math.floor(ny / ASPECT);
      const m = cy < 0 ? EMPTY : cells[cy * W + cx];
      if (m === EMPTY) { X[i] = nx; Y[i] = ny; continue; }
      // --- collision: find the blocking axis ---
      const hitX = getC(cx, Math.floor(Y[i] / ASPECT)) !== EMPTY;
      const hitY = getC(Math.floor(X[i]), cy) !== EMPTY;
      const bothOrDiag = (!hitX && !hitY) || (hitX && hitY);
      const vin = Math.hypot(VX[i], VY[i]);
      if (t === PT_GRAIN || t === PT_DEBRIS) {
        if (vin < (t === PT_DEBRIS ? 5 : 7) * S || (hitY && VY[i] > 0 && Math.random() < .7)) { deposit(X[i], Y[i], P.m[i]); dead = true; break; }
        bounce(i, hitX, hitY, bothOrDiag, t === PT_DEBRIS ? .35 : .2, .6);
      } else if (t === PT_GAS) {
        const ci = cy * W + cx;
        if (MAT_GRAN[m] && Math.random() < .11 * (vin / (30 * S))) {      // exhaust scours regolith
          cells[ci] = EMPTY; wakeAt(cx, cy);
          normalAt(nx, ny, _n);
          const rv = .45 * vin;
          spawnGrain(cx + .5 + _n[0] * .8, cy * ASPECT + 1 + _n[1] * .8 - .5, _n[0] * rv * rr(.4, 1) + rr(-6, 6) * S, _n[1] * rv * rr(.5, 1) - rr(1, 5) * S, m);
        } else if (MAT_SUBL[m] && Math.random() < MAT_SUBL[m]) {          // ...and sublimates ice
          cells[ci] = EMPTY; wakeAt(cx, cy);
          for (let k = 0; k < 3; k++) spawnP(PT_VAPOR, cx + .5, cy * ASPECT + 1, rr(-6, 6) * S, rr(-8, -2) * S, rr(.6, 1.4), pick('~-.'), 0);
        }
        if (heat[ci] < 1) heat[ci] += .012;
        if (Math.random() < .08) spawnP(PT_DUST, X[i], Y[i] - .3, VX[i] * .2 + rr(-8, 8) * S, -rr(2, 9) * S, rr(.6, 1.6), pick(".'`"), m);
        // plume flattens and runs along the ground
        if (hitY || bothOrDiag) { const s2 = VX[i] >= 0 ? 1 : -1; VX[i] += s2 * Math.abs(VY[i]) * rr(.4, .9); VY[i] *= -.12; }
        if (hitX) VX[i] *= -.25;
        P.age[i] += dt * 1.5;
      } else if (t === PT_FIRE) {
        addHeat(cx, cy, .02); VX[i] *= -.2; VY[i] *= -.2; P.age[i] += .05;
      } else if (t === PT_DUST || t === PT_SMOKE || t === PT_VAPOR) {
        if (t === PT_DUST) { dead = true; break; }
        VX[i] *= .3; VY[i] *= -.2;
      } else if (ct) bounce(i, hitX, hitY, bothOrDiag, ct.bounce, ct.friction);
      else {   // spark, wreck
        const e = t === PT_SPARK ? .55 : .28;
        bounce(i, hitX, hitY, bothOrDiag, e, t === PT_SPARK ? .8 : .55);
        if (t === PT_WRECK && vin > 8 * S && Math.random() < .5) spawnP(PT_SPARK, X[i], Y[i], rr(-8, 8) * S, -rr(4, 12) * S, rr(.2, .6), pick("*+'"), 0);
      }
      break;   // stop sub-stepping after a contact
    }
    if (dead || Y[i] < -400 * S) { killP(i); i--; }
  }
}

function bounce(i, hitX, hitY, diag, e, fr) {
  if (diag) { P.vx[i] *= -e; P.vy[i] *= -e; }
  else if (hitX) { P.vx[i] *= -e; P.vy[i] *= fr; }
  else { P.vy[i] *= -e; P.vx[i] *= fr; }
  if (Math.abs(P.vy[i]) < 1.2 * RES && hitY) { P.vy[i] = 0; P.rest[i] += 1; }
}

// ---------- explosions: carve voxels, throw ejecta, flash, shock ----------
// R is in world units (callers multiply by RES); power is unitless.
function explode(x, y, R, power, quiet) {
  const S = RES, cx0 = Math.floor(x), cy0 = Math.floor(y / ASPECT);
  const rx = Math.ceil(R * 1.3), ry = Math.ceil(R * 1.3 / ASPECT);
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const cx = cx0 + i, cy = cy0 + j;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    const m = cells[cy * W + cx]; if (m === EMPTY) continue;
    const ux = cx + .5 - x, uy = (cy + .5) * ASPECT - y;
    const d = Math.hypot(ux, uy) + vnoise2(cx * .5 / S, cy * .9 / S, 7) * R * .35;
    if (d > R * 1.3) continue;
    if (d > R) {                                  // crater rim: heated, sometimes fused (regolith to glass)
      addHeat(cx, cy, .9 * power * (1.3 - d / R));
      if (MAT_FUSE[m] && Math.random() < MAT_FUSEP[m] * power) setC(cx, cy, MAT_FUSE[m]);
      continue;
    }
    const strength = power * (1 - d / R) * rr(.8, 1.4) + .25;
    if (strength < MAT_TOUGH[m]) { addHeat(cx, cy, 1); continue; }
    setC(cx, cy, EMPTY);
    const dl = Math.max(.5, Math.hypot(ux, uy)), dx = ux / dl, dy = uy / dl;
    const v = power * rr(6, 20) * S * (1.1 - d / R * .6);
    const mb = MATS[m].blast;
    if (mb) mb(cx + .5, cy * ASPECT + 1, dx * v, dy * v, 'blast');
    else if (MAT_VAPOR[m]) {
      for (let k = 0; k < 2; k++) spawnP(PT_VAPOR, cx + .5, cy * ASPECT + 1, dx * v * .6 + rr(-4, 4) * S, dy * v * .6 - 3 * S, rr(.8, 1.8), pick('~-.'), 0);
    } else if (Math.random() < (MAT_GRAN[m] ? .7 : .55)) {
      const om = ejectaOf(m);
      if (om) spawnGrain(cx + .5, cy * ASPECT + 1, dx * v + rr(-2, 2) * S, dy * v - rr(2, 8) * power * S, om);
    }
  }
  // fireball, sparks, soot — denser at finer detail so the cloud stays filled
  const nf = ((30 + 40 * power) * S) | 0;
  for (let k = 0; k < nf; k++) {
    const a = rr(0, 6.283), s = rr(2, 24) * power * S;
    spawnP(PT_FIRE, x + rr(-1, 1) * S, y + rr(-1, 1) * S, Math.cos(a) * s, Math.sin(a) * s * .8 - 4 * S, rr(.25, .95), 0, 0);
  }
  for (let k = 0; k < (14 + 26 * power) * S; k++) {
    const a = rr(3.4, 6.0), s = rr(10, 40) * power * S;
    spawnP(PT_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rr(.4, 1.3), pick("*+'"), 0);
  }
  for (let k = 0; k < 10 * power * S; k++) spawnP(PT_SMOKE, x + rr(-R, R) * .6, y + rr(-R, R) * .4, rr(-5, 5) * S, rr(-7, -1) * S, rr(1.2, 2.6), pick('%&o@'), 0);
  // shove every loose particle
  const reach = R * 4, reach2 = reach * reach;
  for (let i = 0; i < P.n; i++) {
    const ux = P.x[i] - x, uy = P.y[i] - y, d2 = ux * ux + uy * uy;
    if (d2 > reach2 || d2 < .01) continue;
    const d = Math.sqrt(d2), k = power * 30 * S * (1 - d / reach) / d;
    P.vx[i] += ux * k; P.vy[i] += uy * k;
  }
  addLight(x, y - S, R * 6 + 20 * S, [1, .78, .45], 2.6 * power + .8, .55 + .25 * power);
  addRing(x, y, R * 3.5, .45 + .15 * power);
  FX.shake = Math.min(1.4, FX.shake + .35 * power);
  FX.flash = Math.min(.9, FX.flash + .22 * power);
  if (!quiet) Sfx.boom(power, Sfx.heard(x, y));
  blastStructures(x, y, R, power);
  if (GAME.onBlast) GAME.onBlast(x, y, R, power, quiet);
}

function stepFX(dt) {
  FX.shake = Math.max(0, FX.shake - dt * 1.3);
  FX.flash = Math.max(0, FX.flash - dt * 2.2);
  for (const arr of [FX.lights, FX.rings, FX.texts]) {
    for (let i = arr.length - 1; i >= 0; i--) { arr[i].age += dt; if (arr[i].age >= arr[i].life) arr.splice(i, 1); }
  }
}
