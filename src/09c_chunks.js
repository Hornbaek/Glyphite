// ===================== ENGINE+GAME · breakable structures =====================
// After every blast the voxels around it are checked for support: anything solid that no longer
// connects (through solid cells) to the wider world is lifted out of the grid as a rigid "chunk".
// Chunks fall, tumble and bounce with the same contact solver as the lander, chip apart on hard
// impacts, and freeze back into voxels once they come to rest. A lamp whose mount is on a chunk
// rides along and keeps shining until a hard landing breaks it.
let chunks = [], rechecks = [];
const CHUNK_DENS = [0, 1, 1, 1.3, .9, 2, 1, 1.1, 1, 1.6];   // relative density per material
const CHUNK_BRITTLE = [0, 1, 1, 1, 1, 0, 1, 1, 1, 0];       // steel bends and bounces, everything else chips

function structuralCheck(x, y, R) {
  const S = RES, rx = Math.round(R * 3 + 34 * S), ry = Math.round(rx / ASPECT);
  const cx0 = Math.floor(x), cy0 = Math.floor(y / ASPECT);
  const x0 = Math.max(0, cx0 - rx), x1 = Math.min(W - 1, cx0 + rx), y0 = Math.max(0, cy0 - ry), y1 = Math.min(H - 1, cy0 + ry);
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1, mark = new Uint8Array(gw * gh), stack = [];
  const push = (cx, cy, v) => { const k = (cy - y0) * gw + cx - x0; if (!mark[k] && cells[cy * W + cx] !== EMPTY) { mark[k] = v; stack.push(k); } };
  // anchors: solid cells on the edge of the region (they continue into the world) and anything immovable
  for (let cx = x0; cx <= x1; cx++) { push(cx, y0, 1); push(cx, y1, 1); }
  for (let cy = y0; cy <= y1; cy++) { push(x0, cy, 1); push(x1, cy, 1); }
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const m = cells[cy * W + cx]; if (m === BED || m === METAL) push(cx, cy, 1); }
  const flood = v => {
    while (stack.length) {
      const k = stack.pop(), cx = x0 + k % gw, cy = y0 + ((k / gw) | 0);
      if (v === 2) comp.push(cx, cy);
      if (cx > x0) push(cx - 1, cy, v); if (cx < x1) push(cx + 1, cy, v);
      if (cy > y0) push(cx, cy - 1, v); if (cy < y1) push(cx, cy + 1, v);
    }
  };
  let comp = [];
  flood(1);                                   // support flows through any solid neighbour, regolith included
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const k = (cy - y0) * gw + cx - x0; if (mark[k] || cells[cy * W + cx] === EMPTY) continue;
    comp = []; push(cx, cy, 2); flood(2);     // a floating island
    breakOff(comp);
  }
}

// Level generation: anything solid that doesn't connect down to bedrock (a cave roof cut loose by
// tunnels, a ledge left hanging when the regolith under it slid away) drops straight down until it
// rests on something, lowest pieces first; whatever still floats after that gets a basalt column.
let _islStack = new Int32Array(0);
function settleIslands(onDrop) {
  const N = W * H, id = new Int32Array(N);
  if (_islStack.length < N) _islStack = new Int32Array(N);
  const st = _islStack;
  // flood every solid cell reachable from the seeds already on the stack, tagging it with v
  const flood = (sp, v, out) => {
    while (sp > 0) {
      const i = st[--sp], x = i % W; if (out) out.push(i);
      if (x > 0 && !id[i - 1] && cells[i - 1]) { id[i - 1] = v; st[sp++] = i - 1; }
      if (x < W - 1 && !id[i + 1] && cells[i + 1]) { id[i + 1] = v; st[sp++] = i + 1; }
      if (i >= W && !id[i - W] && cells[i - W]) { id[i - W] = v; st[sp++] = i - W; }
      if (i < N - W && !id[i + W] && cells[i + W]) { id[i + W] = v; st[sp++] = i + W; }
    }
  };
  const findIslands = () => {
    id.fill(0); let sp = 0;
    for (let i = 0; i < N; i++) { const m = cells[i]; if ((m === BED || m === METAL || (i >= N - W && m)) && !id[i]) { id[i] = -1; st[sp++] = i; } }
    flood(sp, -1);
    const islands = [];
    for (let i = 0; i < N; i++) if (cells[i] && !id[i]) { const v = islands.length + 1, comp = []; id[i] = v; st[0] = i; flood(1, v, comp); islands.push(comp); }
    return islands;
  };
  for (let pass = 0; pass < 12; pass++) {
    const islands = findIslands(); if (!islands.length) return;
    const bottom = islands.map(c => { let m = 0; for (const j of c) if (j > m) m = j; return (m / W) | 0; });
    const order = islands.map((_, k) => k).sort((a, b) => bottom[b] - bottom[a]);
    let moved = 0;
    for (const k of order) {
      const comp = islands[k], v = k + 1; let d = H;
      for (const j of comp) {
        if (j + W < N && id[j + W] === v) continue;
        let g = 0, q = j + W; while (q < N && cells[q] === EMPTY) { g++; q += W; }
        if (q < N && id[q] === v) continue;          // its own lower part lands first
        if (g < d) d = g;
      }
      if (d <= 0 || d >= H) continue;
      comp.sort((a, b) => b - a);
      for (const j of comp) { cells[j + d * W] = cells[j]; cells[j] = EMPTY; id[j + d * W] = v; id[j] = 0; }
      moved++;
      if (onDrop) onDrop(comp, d);
    }
    if (!moved) break;
  }
  for (const comp of findIslands()) {
    let lo = -1; for (const j of comp) if (!MAT_GRAN[cells[j]] && j > lo) lo = j;
    if (lo >= 0) for (let q = lo + W; q < N; q += W) { const m = cells[q]; if (m !== EMPTY && !MAT_GRAN[m]) break; cells[q] = ROCK; }
  }
}

function breakOff(comp) {
  const n = comp.length >> 1; let gran = 0;
  for (let i = 0; i < comp.length; i += 2) if (MAT_GRAN[cells[comp[i + 1] * W + comp[i]]]) gran++;
  if (gran === n || n > 2600 * RES * RES) return;        // loose dust is the sand sim's job; whole hillsides stay put
  if (n <= 2) {                                            // crumbs just fall as grains
    for (let i = 0; i < comp.length; i += 2) { const cx = comp[i], cy = comp[i + 1], m = cells[cy * W + cx]; setC(cx, cy, EMPTY); spawnGrain(cx + .5, (cy + .5) * ASPECT, 0, 0, MAT_GRAN[m] ? m : RUBBLE); }
    return;
  }
  makeChunk(comp);
}

function makeChunk(comp) {
  const S = RES; let ox = 1e9, oy = 1e9, mx = -1, my = -1;
  for (let i = 0; i < comp.length; i += 2) { ox = Math.min(ox, comp[i]); mx = Math.max(mx, comp[i]); oy = Math.min(oy, comp[i + 1]); my = Math.max(my, comp[i + 1]); }
  const gw = mx - ox + 1, gh = my - oy + 1, grid = new Uint8Array(gw * gh);
  let M = 0, sx = 0, sy = 0;
  for (let i = 0; i < comp.length; i += 2) {
    const cx = comp[i], cy = comp[i + 1], m = cells[cy * W + cx], d = CHUNK_DENS[m];
    grid[(cy - oy) * gw + cx - ox] = m; M += d; sx += d * (cx + .5); sy += d * (cy + .5) * ASPECT;
  }
  const X = sx / M, Y = sy / M; let I = 0;
  for (let i = 0; i < comp.length; i += 2) { const cx = comp[i], cy = comp[i + 1], dx = cx + .5 - X, dy = (cy + .5) * ASPECT - Y; I += CHUNK_DENS[grid[(cy - oy) * gw + cx - ox]] * (dx * dx + dy * dy + 5 / 12); }
  const scale = 2 / (120 * S * S);                         // the lander weighs about 1 in these units
  const ch = { grid, gw, gh, ox, oy, X0: X, Y0: Y, n: comp.length >> 1, rest: 0, age: 0 };
  ch.body = new Body(X, Y, M * scale, Math.max(.02, I * scale), chunkHull(ch));
  for (let i = 0; i < comp.length; i += 2) { const ci = comp[i + 1] * W + comp[i]; cells[ci] = EMPTY; heat[ci] = 0; wakeAt(comp[i], comp[i + 1]); }
  chunks.push(ch);
  onChunkBorn(ch);
  for (let k = 0; k < 6 * S; k++) spawnP(PT_DUST, X + rr(-2, 2) * S, Y + rr(-2, 2) * S, rr(-4, 4) * S, rr(-4, 1) * S, rr(.6, 1.4), pick(".'`"), RUBBLE);
  Sfx.thud(4);
  return ch;
}

// contact points: the midpoint of every exposed cell face, in the chunk's local frame
function chunkHull(ch) {
  const { grid, gw, gh, ox, oy, X0, Y0 } = ch, pts = [];
  const at = (gx, gy) => gx >= 0 && gy >= 0 && gx < gw && gy < gh ? grid[gy * gw + gx] : 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (!grid[gy * gw + gx]) continue;
    const ux = ox + gx - X0, uy = (oy + gy) * ASPECT - Y0;
    if (!at(gx, gy + 1)) pts.push({ x: ux + .5, y: uy + ASPECT - .05, kind: 0 });
    if (!at(gx, gy - 1)) pts.push({ x: ux + .5, y: uy + .05, kind: 0 });
    if (!at(gx - 1, gy)) pts.push({ x: ux + .05, y: uy + 1, kind: 0 });
    if (!at(gx + 1, gy)) pts.push({ x: ux + .95, y: uy + 1, kind: 0 });
  }
  if (pts.length > 180) { const k = pts.length / 180; return Array.from({ length: 180 }, (_, i) => pts[Math.floor(i * k)]); }
  return pts;
}

// material of a chunk at a world point (units), via its local grid
function chunkMatAt(ch, wx, wy) {
  const b = ch.body, c = Math.cos(b.a), s = Math.sin(b.a), dx = wx - b.x, dy = wy - b.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const gx = Math.floor(ch.X0 + lx) - ch.ox, gy = Math.floor((ch.Y0 + ly) / ASPECT) - ch.oy;
  return gx >= 0 && gy >= 0 && gx < ch.gw && gy < ch.gh ? ch.grid[gy * ch.gw + gx] : 0;
}
// a world cell counts as covered if either half of it (cells are 1 x 2 units) falls inside the chunk,
// so thin posts lying on their side still draw and freeze as solid lines
function chunkCellMat(ch, cx, cy) { return chunkMatAt(ch, cx + .5, cy * ASPECT + .5) || chunkMatAt(ch, cx + .5, cy * ASPECT + 1.5); }
function chunkAt(wx, wy) { for (const ch of chunks) if (Math.abs(wx - ch.body.x) < ch.gw + ch.gh * 2 && chunkMatAt(ch, wx, wy)) return ch; return null; }
function chunkCellBox(ch) {
  const b = ch.body, r = Math.hypot(ch.gw, ch.gh * ASPECT) * .5 + 2;
  return [Math.floor(b.x - r), Math.floor((b.y - r) / ASPECT), Math.ceil(b.x + r), Math.ceil((b.y + r) / ASPECT)];
}

// loose regolith keeps sliding after a blast and can undermine what was still standing, so each
// blast site is checked once more a moment later
function scheduleRecheck(x, y, R) {
  for (const c of rechecks) if (Math.hypot(c.x - x, c.y - y) < R * 2) { c.t = .9; c.R = Math.max(c.R, R); return; }
  rechecks.push({ x, y, R, t: .9 });
}

function stepChunks(dt) {
  const S = RES;
  for (let i = rechecks.length - 1; i >= 0; i--) { const c = rechecks[i]; c.t -= dt; if (c.t <= 0) { rechecks.splice(i, 1); structuralCheck(c.x, c.y, c.R); } }
  for (let i = chunks.length - 1; i >= 0; i--) {
    const ch = chunks[i], b = ch.body; ch.age += dt;
    b.fx = b.fy = b.tq = 0;
    for (let s = 0; s < 2; s++) {
      b.step(dt / 2);
      let v = 0, hp = null; for (const h of b.hits) if (h.vn > v) { v = h.vn; hp = h; }
      if (hp && v > 4.5 * S && ch.age > .12) chunkImpact(ch, hp, v);
      if (!ch.n) break;
    }
    if (!ch.n) { chunks.splice(i, 1); continue; }
    if (L && L.alive && state !== 'title') chunkVsLander(ch);
    const still = Math.hypot(b.vx, b.vy) < .5 * S && Math.abs(b.w) < .25 && b.hits.length > 0;
    ch.rest = still ? ch.rest + dt : 0;
    if (ch.rest > .6 || ch.age > 20) { freezeChunk(ch); chunks.splice(i, 1); }
    else if (b.y > H * ASPECT + 40 * S || b.x < -40 * S || b.x > W + 40 * S) { onChunkGone(ch); chunks.splice(i, 1); }
    else onChunkMoved(ch);
  }
}

function chunkImpact(ch, h, v) {
  const S = RES, vb = v / S, b = ch.body;
  for (let k = 0; k < (4 + vb) * S; k++) spawnP(PT_DUST, h.x + rr(-1.5, 1.5) * S, h.y - .5, rr(-1, 1) * vb * 1.6 * S, -rr(1, 4) * S, rr(.5, 1.3), pick(".'`"), REGO);
  if (vb > 6) for (let k = 0; k < 4; k++) spawnP(PT_SPARK, h.x, h.y - .3, rr(-9, 9) * S, -rr(3, 10) * S, rr(.2, .5), pick("*'"), 0);
  Sfx.thud(Math.min(14, vb * (1 + b.m * 3)));
  FX.shake = Math.min(1.2, FX.shake + Math.min(.5, vb * b.m * .12));
  // chip cells off near the contact; a hard hit shatters small pieces outright
  let k = Math.round((vb - 4.5) * 1.6 * S);
  if (vb > 12 && ch.n < 50 * S * S) k = ch.n;
  if (k > 0) chipChunk(ch, h.x, h.y, k, b.vx, b.vy);
  onChunkImpact(ch, vb, h.x, h.y);
}

function chipChunk(ch, wx, wy, k, vx, vy) {
  const b = ch.body, c = Math.cos(b.a), s = Math.sin(b.a), cand = [];
  for (let gy = 0; gy < ch.gh; gy++) for (let gx = 0; gx < ch.gw; gx++) {
    const m = ch.grid[gy * ch.gw + gx]; if (!m || !CHUNK_BRITTLE[m]) continue;
    const lx = ch.ox + gx + .5 - ch.X0, ly = (ch.oy + gy + .5) * ASPECT - ch.Y0;
    const px = b.x + lx * c - ly * s, py = b.y + lx * s + ly * c;
    cand.push([(px - wx) ** 2 + (py - wy) ** 2, gy * ch.gw + gx, px, py, m]);
  }
  cand.sort((a, q) => a[0] - q[0]);
  const S = RES;
  for (let i = 0; i < Math.min(k, cand.length); i++) {
    const [, gi, px, py, m] = cand[i];
    ch.grid[gi] = 0; ch.n--;
    spawnGrain(px, py, vx * .4 + rr(-6, 6) * S, vy * .2 - rr(2, 9) * S, MAT_GRAN[m] ? m : RUBBLE);
    if (m === CRYST && Math.random() < .5) spawnP(PT_PICKUP, px, py, rr(-6, 6) * S, -rr(4, 10) * S, 40, 42, CRYST);
  }
  if (ch.n < 3) {   // nothing left worth simulating: the rest crumbles
    for (let gi = 0; gi < ch.grid.length; gi++) if (ch.grid[gi]) { const gx = gi % ch.gw, gy = (gi / ch.gw) | 0; const lx = ch.ox + gx + .5 - ch.X0, ly = (ch.oy + gy + .5) * ASPECT - ch.Y0; spawnGrain(b.x + lx * c - ly * s, b.y + lx * s + ly * c, vx * .4, vy * .2, RUBBLE); }
    ch.n = 0; onChunkGone(ch); return;
  }
  b.hull = chunkHull(ch);
}

// back into the grid: rasterise the rotated chunk onto the world cells it now covers
function freezeChunk(ch) {
  const [x0, y0, x1, y1] = chunkCellBox(ch), placed = [];
  for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
    const m = chunkCellMat(ch, cx, cy); if (!m) continue;
    if (cells[cy * W + cx] === EMPTY) { setC(cx, cy, m); placed.push(cy * W + cx); }
  }
  onChunkFrozen(ch, placed);
}

// chunk vs lander: lander hull points inside the chunk get pushed out along the chunk's local surface normal
function chunkVsLander(ch) {
  const lb = L.body, b = ch.body, reach = Math.hypot(ch.gw, ch.gh * ASPECT) * .5 + 12 * RES;
  if (Math.hypot(lb.x - b.x, lb.y - b.y) > reach) return;
  const c = Math.cos(lb.a), s = Math.sin(lb.a);
  for (const p of LANDER_HULL) {
    const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c, px = lb.x + rx, py = lb.y + ry;
    if (!chunkMatAt(ch, px, py)) continue;
    // surface normal from the chunk's own occupancy around the point
    let nx = 0, ny = 0;
    for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) if (chunkMatAt(ch, px + i, py + j * ASPECT)) { nx -= i; ny -= j * ASPECT; }
    const l = Math.hypot(nx, ny); if (l < 1e-6) { nx = px - b.x; ny = py - b.y; } const ll = Math.hypot(nx, ny) || 1; nx /= ll; ny /= ll;
    const qx = px - b.x, qy = py - b.y;
    const vn = (lb.vx - lb.w * ry - (b.vx - b.w * qy)) * nx + (lb.vy + lb.w * rx - (b.vy + b.w * qx)) * ny;
    if (vn < 0) {
      if (-vn > 3.4 * RES && p.kind !== 1) { crashLander('CRUSHED BY FALLING DEBRIS'); return; }
      const rn = rx * ny - ry * nx, qn = qx * ny - qy * nx;
      const j = -1.3 * vn / (1 / lb.m + rn * rn / lb.I + 1 / b.m + qn * qn / b.I);
      lb.impulse(nx * j, ny * j, rx, ry); b.impulse(-nx * j, -ny * j, qx, qy); ch.rest = 0;
    }
    lb.x += nx * .25; lb.y += ny * .25;
  }
}

// blasts bite pieces out of chunks and shove them. The shove is applied cell by cell: only faces
// that look toward the blast catch it, so a post cut near its foot gets kicked at the cut and topples,
// while a small fragment caught whole flies off fast.
function blastChunks(x, y, R, power, px = x, py = y) {
  const S = RES;
  for (const ch of chunks) {
    const b = ch.body, d = Math.hypot(b.x - x, b.y - y);
    if (d > R * 2.2 + ch.gw + ch.gh * ASPECT) continue;
    let bite = 0; const c = Math.cos(b.a), s = Math.sin(b.a);
    for (let gi = 0; gi < ch.grid.length; gi++) {
      if (!ch.grid[gi]) continue; const gx = gi % ch.gw, gy = (gi / ch.gw) | 0;
      const lx = ch.ox + gx + .5 - ch.X0, ly = (ch.oy + gy + .5) * ASPECT - ch.Y0, wx = b.x + lx * c - ly * s, wy = b.y + lx * s + ly * c;
      if (Math.hypot(wx - x, wy - y) < R * .75) { ch.grid[gi] = 0; ch.n--; bite++; spawnGrain(wx, wy, (wx - x) * 2 * S, (wy - y) * 2 * S - 4 * S, RUBBLE); }
    }
    if (bite) { if (ch.n < 3) { chipChunk(ch, x, y, ch.n, b.vx, b.vy); continue; } b.hull = chunkHull(ch); }
    blastPush(ch, px, py, R, power);
  }
}
function blastPush(ch, x, y, R, power) {
  const b = ch.body, S = RES, c = Math.cos(b.a), s = Math.sin(b.a), reach = R * 2.2, cell = 2 / (120 * S * S);
  const bl = (x - b.x) * c + (y - b.y) * s, blY = -(x - b.x) * s + (y - b.y) * c;   // blast in the chunk's frame
  const at = (gx, gy) => gx >= 0 && gy >= 0 && gx < ch.gw && gy < ch.gh && ch.grid[gy * ch.gw + gx];
  let jx = 0, jy = 0, tq = 0;
  for (let gi = 0; gi < ch.grid.length; gi++) {
    if (!ch.grid[gi]) continue; const gx = gi % ch.gw, gy = (gi / ch.gw) | 0;
    const lx = ch.ox + gx + .5 - ch.X0, ly = (ch.oy + gy + .5) * ASPECT - ch.Y0, ux = lx - bl, uy = ly - blY, d = Math.hypot(ux, uy);
    if (d > reach) continue;
    // pressure only acts on faces that look toward the blast, and pushes along their normals
    const ex = at(gx - Math.sign(ux), gy) ? 0 : 1, ey = at(gx, gy - Math.sign(uy)) ? 0 : 1;
    if (!ex && !ey) continue;
    const f = power * 40 * S * cell * (1 - d / reach) / Math.max(d, .5);
    const fx = ex * ux * f, fy = ey * uy * f * .5;     // local frame; a cell's top and bottom are half the size of its sides
    jx += fx; jy += fy; tq += lx * fy - ly * fx;
  }
  let dvx = (jx * c - jy * s) / b.m, dvy = (jx * s + jy * c) / b.m;
  const v = Math.hypot(dvx, dvy), cap = 24 * S; if (v > cap) { dvx *= cap / v; dvy *= cap / v; }
  b.vx += dvx; b.vy += dvy; b.w += clamp(tq / b.I, -2.4, 2.4); ch.rest = 0;
}

let _chRaster = new Uint8Array(0);
function drawChunks() {
  const tmp = [0, 0, 0];
  for (const ch of chunks) {
    const [x0, y0, x1, y1] = chunkCellBox(ch), b = ch.body, bw = x1 - x0 + 3, bh = y1 - y0 + 3;
    if (x1 < cam.x - 2 || x0 > cam.x + R.cols + 2) continue;
    // rasterise first, so cells buried inside the piece can be shaded like the inside of the ground
    if (_chRaster.length < bw * bh) _chRaster = new Uint8Array(bw * bh * 2);
    const ras = _chRaster; ras.fill(0, 0, bw * bh);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) ras[(cy - y0 + 1) * bw + cx - x0 + 1] = chunkCellMat(ch, cx, cy);
    const c = Math.cos(b.a), s = Math.sin(b.a);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = (cy - y0 + 1) * bw + cx - x0 + 1, m = ras[q]; if (!m) continue;
      const buried = ras[q - 1] && ras[q + 1] && ras[q - bw] && ras[q + bw];
      // texture variation fixed to the piece, so it tumbles with it
      const lx = cx + .5 - b.x, ly = (cy + .5) * ASPECT - b.y, gx = Math.floor(ch.X0 + lx * c + ly * s) - ch.ox, gy = Math.floor((ch.Y0 - lx * s + ly * c) / ASPECT) - ch.oy;
      const v = hash2(gx, gy, ch.n & 7), a = MAT_ALB[m];
      let r, g, bl;
      if (buried) { r = a[0] * .1; g = a[1] * .1; bl = a[2] * .12; }
      else { lightAtCell(cx, cy, tmp); r = a[0] * Math.max(tmp[0], .1); g = a[1] * Math.max(tmp[1], .1); bl = a[2] * Math.max(tmp[2], .12); }
      const tv = .86 + v * .28; r *= tv; g *= tv; bl *= tv;
      let glyph;
      if (m === MAST && !buried) {   // poles and arms keep their direction as they tumble
        const at = (i, j) => i >= 0 && j >= 0 && i < ch.gw && j < ch.gh && ch.grid[j * ch.gw + i] === MAST;
        const horiz = at(gx - 1, gy) || at(gx + 1, gy);
        glyph = slopeGlyph(horiz ? c : -s, horiz ? s : c);
      } else if (m === CRYST) glyph = 42;
      else {
        const ramp = RAMP_CODES[m] || RAMP_CODES[ROCK], rl = ramp.length, lum = .3 * r + .59 * g + .11 * bl;
        glyph = ramp[clamp((lum * rl * 1.2 + (v - .5) * .9) | 0, buried ? 1 : 2, rl - 1)];
      }
      putEmit(cx, cy, glyph, r, g, bl);
    }
  }
}
function markChunksDyn() {
  let top = 1e9;
  for (const ch of chunks) {
    const [x0, y0, x1, y1] = chunkCellBox(ch);
    for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
      if (!chunkCellMat(ch, cx, cy)) continue;
      const i = cy * W + cx; if (!dyn[i]) { dyn[i] = 1; dynList.push(i); } if (cy < top) top = cy;
    }
  }
  return top;
}

// ---------- game hooks: lamps ride on the chunk that carries their mount ----------
function onChunkBorn(ch) {
  if (!LEVEL) return;
  for (const lp of LEVEL.lamps) {
    if (lp.dead || lp.chunk) continue;
    const mx = lp.mount % W, my = (lp.mount / W) | 0, gx = mx - ch.ox, gy = my - ch.oy;
    if (gx < 0 || gy < 0 || gx >= ch.gw || gy >= ch.gh || !ch.grid[gy * ch.gw + gx]) continue;
    lp.chunk = ch; lp.lx = lp.x - ch.X0; lp.ly = lp.y - ch.Y0; lp.ldx = lp.dx; lp.ldy = lp.dy;
    lp.lhx = lp.hx + .5 - ch.X0; lp.lhy = (lp.hy + .5) * ASPECT - ch.Y0; lp.rot = 0;
  }
}
function onChunkMoved(ch) {
  if (!LEVEL) return;
  const b = ch.body, c = Math.cos(b.a), s = Math.sin(b.a);
  for (const lp of LEVEL.lamps) {
    if (lp.chunk !== ch) continue;
    lp.x = b.x + lp.lx * c - lp.ly * s; lp.y = b.y + lp.lx * s + lp.ly * c;
    lp.dx = lp.ldx * c - lp.ldy * s; lp.dy = lp.ldx * s + lp.ldy * c; lp.rot = b.a;
    const hx = b.x + lp.lhx * c - lp.lhy * s, hy = b.y + lp.lhx * s + lp.lhy * c;
    lp.hx = Math.floor(hx); lp.hy = Math.floor(hy / ASPECT);
  }
}
function onChunkImpact(ch, vb, hx, hy) {
  if (!LEVEL) return;
  for (const lp of LEVEL.lamps) if (lp.chunk === ch && !lp.dead) {
    // the lamp only breaks when the end it sits on is what hits the ground hard
    const near = Math.hypot(lp.x - hx, lp.y - hy) < 6 * RES;
    if (near && vb > 9) shatterLamp(lp); else lp.flick = Math.max(lp.flick, .4 + vb * .08);
  }
}
function onChunkFrozen(ch, placed) {
  if (!LEVEL) return;
  onChunkMoved(ch);
  for (const lp of LEVEL.lamps) {
    if (lp.chunk !== ch) continue;
    lp.chunk = null;
    // re-anchor on the nearest frozen cell next to the lamp head
    let best = -1, bd = 1e9;
    for (const i of placed) { const d = (i % W - lp.hx) ** 2 + (((i / W) | 0) - lp.hy) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 9 * RES * RES) lp.dead = true; else lp.mount = best;
  }
}
function onChunkGone(ch) { if (LEVEL) for (const lp of LEVEL.lamps) if (lp.chunk === ch) { lp.chunk = null; lp.dead = true; } }
function shatterLamp(lp) {
  if (lp.dead) return;
  lp.dead = true;
  for (let k = 0; k < 12 * RES; k++) spawnP(PT_SPARK, lp.x, lp.y - RES, rr(-14, 14) * RES, rr(-12, 4) * RES, rr(.3, .9), pick("*'`"), 0);
  addLight(lp.x, lp.y, 18 * RES, lp.c, 2, .18);
}
