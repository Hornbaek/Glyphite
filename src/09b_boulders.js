// ===================== GAME · boulders (loose rigid bodies) =====================
let boulders = [];
function makeBoulder(x, y, r) {
  const hull = [], n = Math.max(10, Math.round(r * 4));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; hull.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, kind: 0 }); }
  const m = (r / RES) * (r / RES) * .6, b = new Body(x, y, m, .5 * m * r * r, hull);
  b.r = r; b.seed = (Math.random() * 1000) | 0; b.sleep = false; b.rest = 0; b.dead = false;
  return b;
}
function spawnBoulders(rng) {
  boulders = [];
  const n = 5 + Math.min(7, LEVEL.tier);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(W * (.12 + rng() * .84));
    if (LEVEL.pads.some(p => x > p.x0 - 10 * RES && x < p.x1 + 10 * RES)) continue;
    const r = (1.6 + rng() * 2.4) * RES;
    boulders.push(makeBoulder(x + .5, colTop[x] * ASPECT - r - .3, r));
  }
}
function boulderSupported(b) { return solidU(b.x, b.y + b.r + .6 * RES) || solidU(b.x - b.r * .6, b.y + b.r * .9) || solidU(b.x + b.r * .6, b.y + b.r * .9); }

function stepBoulders(dt) {
  for (const b of boulders) {
    if (b.dead) continue;
    if (b.sleep) { if (frameNo % 15 === 0 && !boulderSupported(b)) b.sleep = false; else { if (L && L.alive) boulderVsLander(b); continue; } }
    b.step(dt);
    const S = RES;
    for (const h of b.hits) if (h.vn > 4 * S) {
      const v = h.vn / S;
      for (let k = 0; k < (4 + v) * S; k++) spawnP(PT_DUST, h.x + rr(-1, 1) * S, h.y - .5, rr(-1, 1) * h.vn * 1.5, -(rr(1, 3) + v * .3) * S, rr(.5, 1.2), pick(".'`"), REGO);
      if (h.mat === ROCK || h.mat === METAL) for (let k = 0; k < 3; k++) spawnP(PT_SPARK, h.x, h.y - .3, rr(-8, 8) * S, -rr(3, 9) * S, rr(.2, .5), pick("*'"), 0);
      if (h.mat === REGO && v > 7) { const cx = Math.floor(h.x), cy = Math.floor(h.y / ASPECT); if (getC(cx, cy) === REGO) { setC(cx, cy, EMPTY); spawnGrain(cx + .5, cy * ASPECT - .5, rr(-6, 6) * S, -h.vn * .5, REGO); } }
      Sfx.thud(v * .6); break;
    }
    const still = Math.hypot(b.vx, b.vy) < .25 * S && Math.abs(b.w) < .25 && b.hits.length > 0;
    b.rest = still ? b.rest + dt : 0;
    if (b.rest > .6) { b.sleep = true; b.vx = b.vy = b.w = 0; }
    if (L && L.alive) boulderVsLander(b);
    if (b.y > H * ASPECT + 20) b.dead = true;
  }
}
function boulderVsLander(b) {
  const lb = L.body, dxc = lb.x - b.x, dyc = lb.y - b.y;
  if (dxc * dxc + dyc * dyc > (b.r + 9 * RES) * (b.r + 9 * RES)) return;
  const c = Math.cos(lb.a), s = Math.sin(lb.a);
  for (const p of LANDER_HULL) {
    const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c, px = lb.x + rx, py = lb.y + ry;
    const ux = px - b.x, uy = py - b.y, d = Math.hypot(ux, uy);
    if (d >= b.r || d < 1e-4) continue;
    const nx = ux / d, ny = uy / d;
    const vbx = b.vx - b.w * ny * b.r, vby = b.vy + b.w * nx * b.r;
    const vn = (lb.vx - lb.w * ry - vbx) * nx + (lb.vy + lb.w * rx - vby) * ny;
    if (vn < 0) {
      if (-vn > 3.4 * RES && p.kind !== 1) { crashLander('BOULDER IMPACT'); return; }
      const rn = rx * ny - ry * nx, j = -1.2 * vn / (1 / lb.m + rn * rn / lb.I + 1 / b.m);
      lb.impulse(nx * j, ny * j, rx, ry); b.vx -= nx * j / b.m; b.vy -= ny * j / b.m; b.sleep = false;
    }
    const pen = b.r - d; lb.x += nx * pen * .6; lb.y += ny * pen * .6; b.x -= nx * pen * .2; b.y -= ny * pen * .2;
  }
}
// blasts shove or shatter boulders; shattered rock becomes rubble voxels via ballistic grains
function blastBoulders(x, y, R0, power) {
  for (const b of boulders) {
    if (b.dead) continue;
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
    if (d < R0 * .85 + b.r * .4) {
      b.dead = true;
      for (let cy = Math.floor((b.y - b.r) / ASPECT); cy <= (b.y + b.r) / ASPECT; cy++) for (let cx = Math.floor(b.x - b.r); cx <= b.x + b.r; cx++) {
        const ux = cx + .5 - b.x, uy = (cy + .5) * ASPECT - b.y; if (ux * ux + uy * uy > b.r * b.r) continue;
        const l = Math.hypot(ux + dx, uy + dy) || 1, v = rr(8, 22) * power * RES;
        spawnGrain(cx + .5, (cy + .5) * ASPECT, (ux + dx) / l * v, (uy + dy) / l * v - rr(3, 9) * RES, RUBBLE);
      }
      for (let k = 0; k < 10 * RES; k++) spawnP(PT_SPARK, b.x, b.y, rr(-20, 20) * RES, rr(-24, 4) * RES, rr(.3, .9), pick("*+'"), 0);
    } else if (d < R0 * 5) {
      const k = power * 34 * RES * (1 - d / (R0 * 5)) / Math.max(d, RES) / Math.sqrt(b.m);
      b.vx += dx * k; b.vy += dy * k - 2 * RES; b.w += rr(-1, 1) * k * 2 / RES; b.sleep = false; b.rest = 0;
    }
  }
}
function drawBoulders(t) {
  const el = Math.atan2(SUN_L[1], SUN_L[0]), sx = -Math.cos(el) * .85, sy = -Math.sin(el) * .85, sz = .53;
  for (const b of boulders) {
    if (b.dead || b.x + b.r < cam.x - 2 || b.x - b.r > cam.x + R.cols + 2) continue;
    const c = Math.cos(-b.a), s = Math.sin(-b.a);
    for (let cy = Math.floor((b.y - b.r) / ASPECT); cy <= (b.y + b.r) / ASPECT; cy++) for (let cx = Math.floor(b.x - b.r); cx <= b.x + b.r; cx++) {
      const ux = cx + .5 - b.x, uy = (cy + .5) * ASPECT - b.y, q = (ux * ux + uy * uy) / (b.r * b.r);
      if (q > 1.08) continue;
      const nx = ux / b.r, ny = uy / b.r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = Math.max(0, nx * sx + ny * sy + nz * sz);
      lightAtCell(cx, cy, tmp3);
      const lx = ux * c - uy * s, ly = ux * s + uy * c, pock = hash2(Math.floor(lx * 1.2 / RES + 50), Math.floor(ly * .8 / RES + 50), b.seed) < .16;
      const sh = (.2 + .8 * lam) * (pock ? .55 : 1);
      const r = .55 * Math.max(tmp3[0] * sh, .07), g = .53 * Math.max(tmp3[1] * sh, .07), bb = .5 * Math.max(tmp3[2] * sh, .09);
      const lum = .3 * r + .59 * g + .11 * bb;
      putEmit(cx, cy, pock ? 111 : LANDER_RAMP[clamp((lum * 9 + 2) | 0, 2, 9)], r, g, bb);
    }
  }
}
function markBouldersDyn() {
  for (const b of boulders) {
    if (b.dead) continue;
    for (let cy = Math.floor((b.y - b.r) / ASPECT); cy <= (b.y + b.r) / ASPECT; cy++) for (let cx = Math.floor(b.x - b.r); cx <= b.x + b.r; cx++) {
      const ux = cx + .5 - b.x, uy = (cy + .5) * ASPECT - b.y; if (ux * ux + uy * uy > b.r * b.r || cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = cy * W + cx; if (!dyn[i]) { dyn[i] = 1; dynList.push(i); }
    }
  }
}
