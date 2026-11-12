// ===================== ENGINE · liquids =====================
// A liquid is a material with `liquid: true` (engine/API.md, Liquids). Its cells live in the world grid like any other, but they are not solid:
// MAT_SOLID is 0 for them, so a Character swims through them, a Body floats in them, particles splash into them, light passes them (dimmed by
// the depth of liquid it crosses) and structures never see them. This part holds what only liquids need: the flow step the cellular automaton
// calls, finding room for a liquid when something solid takes its cell, splashes, the particles' entry, the light dimming and the drawing.

// ---------- the flow ----------
// One liquid cell in one step (called from simGranular, bottom row first, so a cell moves at most once). It falls if the cell below is free
// (a heavier liquid also sinks through a lighter one), else it runs along its row over free cells to the nearest place where it can drop, up to
// `reach` cells for a thin liquid (so a poured column levels out in a few steps) and one for a thick one. A cell only moves when it ends up lower,
// so a pool at rest is a fixed point: its chunks go to sleep, and the surface is flat to within the reach. Every move swaps a cell with an empty
// one, so a liquid is neither made nor lost; viscosity only makes a move a matter of chance.
function flowLiquid(x, y, m, ci) {
  const i = y * W + x, below = cells[i + W], visc = MAT_VISC[m];
  let dst = -1;
  if (below === EMPTY) dst = i + W;
  else if (below !== m && MAT_LIQ[below] && MAT_DENS[m] > MAT_DENS[below]) {
    if (visc && rnd() < visc * .9) { awake[ci] = 1; return; }
    cells[i] = below; cells[i + W] = m; wakeAt(x, y); wakeAt(x, y + 1); return;
  } else {
    const reach = Math.max(1, Math.round(12 * RES * (1 - visc) * (1 - visc))), d = rnd() < .5 ? 1 : -1;
    for (let s = 0; s < 2 && dst < 0; s++) {
      const dd = s ? -d : d;
      for (let k = 1; k <= reach; k++) {
        const nx = x + dd * k; if (nx < 0 || nx >= W) break;
        const c = i + dd * k;
        if (cells[c] !== EMPTY) break;                       // something is in the way: it cannot run further this way
        if (cells[c + W] === EMPTY) { dst = c + W; break; }  // a drop: it goes there
      }
    }
    if (dst < 0) return;
  }
  if (visc && rnd() < visc * .9) { awake[ci] = 1; return; }  // too thick to move this step, but it still wants to
  cells[dst] = m; cells[i] = EMPTY;
  if (heat[i] > 0) { heat[dst] = heat[i]; heat[i] = 0; }
  wakeAt(x, y); wakeAt(dst % W, (dst / W) | 0);
}

// Something solid is taking the cell (cx, cy), which holds a liquid: the liquid moves to the nearest free cell that can be reached through liquid
// (the surface rises, the way a pool does when something heavy sinks into it). Returns false when there is no room (a sealed tank): then the
// liquid is lost.
let _dseen = null, _dqueue = new Int32Array(0), _dgen = 0;
function displaceLiquid(cx, cy) {
  const i0 = cy * W + cx, L = cells[i0]; if (!MAT_LIQ[L]) return true;
  if (!_dseen || _dseen.length !== W * H) { _dseen = new Uint32Array(W * H); _dgen = 0; _dqueue = new Int32Array(8192); }
  const gen = ++_dgen, Q = _dqueue; let head = 0, tail = 0; Q[tail++] = i0; _dseen[i0] = gen;
  while (head < tail) {
    const i = Q[head++], x = i % W;
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? i - W : k === 1 ? i - 1 : k === 2 ? i + 1 : i + W;
      if (n < 0 || n >= W * H || (k === 1 && x === 0) || (k === 2 && x === W - 1) || _dseen[n] === gen) continue;
      _dseen[n] = gen;
      const c = cells[n];
      if (c === EMPTY) { cells[n] = L; wakeAt(n % W, (n / W) | 0); return true; }
      if (MAT_LIQ[c] && tail < Q.length) Q[tail++] = n;
    }
  }
  return false;
}
// put a solid material into a cell that may hold a liquid (the liquid is moved, not destroyed); the way chunks and slabs land in a pool
function putSolid(cx, cy, m) { if (MAT_LIQ[getC(cx, cy)]) displaceLiquid(cx, cy); setC(cx, cy, m); }

// ---------- splashes and particles ----------
// droplets leave the surface where something fast went into liquid `lm` at (x, y): visual only (PT_DUST in the liquid's own colour), no mass
function splash(x, y, speed, lm) {
  const S = RES; if (speed < 12 * S || P.n + 60 > PMAX) return;
  const cx = Math.floor(x); let cy = Math.floor(y / ASPECT);
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
  for (let k = 0; k < 120 && cy > 0 && MAT_LIQ[cells[(cy - 1) * W + cx]]; k++) cy--;   // up to the surface
  const n = Math.round(Math.min(10, 2 + speed / S / 8) * S);
  for (let k = 0; k < n; k++) spawnP(PT_DUST, cx + .5 + rr(-1.5, 1.5) * S, cy * ASPECT - .6, rr(-.4, .4) * speed * .3, -rr(.15, .5) * speed * .55, rr(.35, .8), pick(".':"), lm);
}
// A particle's next step is into a liquid cell `m`; true = the particle ends here. A droplet of a liquid rejoins it (set down on the last free
// cell it was in), and so does a grain lighter than the liquid (it floats); fire, sparks, dust and exhaust are put out; heavier grains, debris and
// the rest go on, slowed by the liquid, splashing as they enter.
function particleInLiquid(i, t, m, h) {
  if (t === PT_GRAIN || t === PT_DEBRIS) {
    if (MAT_LIQ[P.m[i]] || MAT_DENS[P.m[i]] < MAT_DENS[m]) { deposit(P.x[i], P.y[i], P.m[i]); return true; }   // a droplet rejoins its liquid; a grain lighter than the liquid floats on it
    if (!MAT_LIQ[getC(Math.floor(P.x[i]), Math.floor(P.y[i] / ASPECT))]) splash(P.x[i], P.y[i], Math.hypot(P.vx[i], P.vy[i]), m);
  } else if (t === PT_FIRE || t === PT_SPARK || t === PT_DUST || t === PT_GAS) return true;
  else if (t >= PT_CUSTOM && PTYPES[t - PT_CUSTOM].onLiquid && PTYPES[t - PT_CUSTOM].onLiquid(i, m, h)) return true;   // a game's own type may end here (rain does)
  const k = Math.max(0, 1 - 6 * h); P.vx[i] *= k; P.vy[i] *= k;
  return false;
}

// ---------- light through a liquid ----------
// How much light is left after d cells of a liquid, per channel: exp(-absorb * murk * d / RES / 6), where a channel's absorption is higher the
// less of it the liquid's colour holds, so blue water loses red first and lava lets red through. A table per liquid, rebuilt when the detail changes.
const _liqTab = [];
function liquidLight(m) {
  let t = _liqTab[m];
  if (!t || t.res !== RES) {
    const a = MAT_ALB[m], k = MAT_MURK[m] / 6, f = new Float32Array(256 * 3);
    for (let c = 0; c < 3; c++) { const ab = (.5 * (1 - Math.min(1, a[c])) + .06) * k; for (let d = 0; d < 256; d++) f[d * 3 + c] = Math.exp(-ab * d / RES); }
    t = _liqTab[m] = { res: RES, f };
  }
  return t.f;
}
// Dims the sun and ambient light on the window's cells by the liquid they lie under: a liquid cell by the liquid above it (and itself), the
// floor and walls of a pool by the liquid they touch. Called between the sun/ambient pass and the lamps, so a lamp under water keeps its light.
let _ldepth = null, _lliq = null;
function dimLiquidLight(ox, oy) {
  const RW = L_RW, RH = L_RH, n = RW * RH;
  if (!_ldepth || _ldepth.length !== n) { _ldepth = new Uint8Array(n); _lliq = new Uint8Array(n); }
  const D = _ldepth, Q = _lliq; let any = false;
  for (let i = 0; i < RW; i++) {
    const cx = ox + i;
    if (cx < 0 || cx >= W) { for (let j = 0; j < RH; j++) D[j * RW + i] = 0; continue; }
    let d = 0, lm = 0;
    for (let cy = oy - 1, k = 0; k < 200 && cy >= 0 && cy < H; cy--, k++) { const m = cells[cy * W + cx]; if (!MAT_LIQ[m]) break; d++; lm = m; }   // liquid above the window's top row
    for (let j = 0; j < RH; j++) {
      const cy = oy + j, q = j * RW + i;
      if (cy < 0 || cy >= H) { D[q] = 0; d = 0; continue; }
      const m = cells[cy * W + cx];
      if (MAT_LIQ[m]) { d = Math.min(255, d + 1); lm = m; D[q] = d; Q[q] = m; any = true; }
      else { D[q] = MAT_SOLID[m] ? d : 0; Q[q] = lm; d = 0; }   // the first solid cell under a liquid (a pool's floor) gets the liquid's depth; air ends it
    }
  }
  if (!any) return;
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {   // a pool's side walls: the depth of the liquid beside them
    const q = j * RW + i, cx = ox + i, cy = oy + j;
    if (D[q] || cx < 0 || cx >= W || cy < 0 || cy >= H || !MAT_SOLID[cells[cy * W + cx]]) continue;
    if (i > 0 && cx > 0 && MAT_LIQ[cells[cy * W + cx - 1]]) { D[q] = D[q - 1]; Q[q] = cells[cy * W + cx - 1]; }
    else if (i < RW - 1 && cx < W - 1 && MAT_LIQ[cells[cy * W + cx + 1]]) { D[q] = D[q + 1]; Q[q] = cells[cy * W + cx + 1]; }
  }
  for (let q = 0; q < n; q++) {
    const d = D[q]; if (!d) continue;
    const T = liquidLight(Q[q]), t = d * 3;
    LR[q] *= T[t]; LG[q] *= T[t + 1]; LB[q] *= T[t + 2];
  }
}

// ---------- drawing ----------
// A liquid cell is drawn over what is behind it (renderScene has already drawn the back wall there, or left it clear for the sky): a flat colour in
// the liquid's own bands, lit by the light that reached it (dimmed by depth), with a brighter top row and the odd glint on the surface, mixed with
// the back wall where there is one so a room's wall shows through a pool. Hot liquid (lava) glows with its heat like hot rock. Everything is in
// the CPU's colour buffers, so the WebGL and the 2D canvas renderer show the same thing.
function paintLiquid(k, cx, cy, m, time) {
  const alb = MAT_ALB[m], lr = LR[k], lg = LG[k], lb = LB[k], ci = cy * W + cx, h = heat[ci], top = !MAT_LIQ[getC(cx, cy - 1)];
  let r = alb[0] * Math.max(lr, .06), g = alb[1] * Math.max(lg, .06), b = alb[2] * Math.max(lb, .08);
  if (h > .02) { r += h * 1.35; g += h * h * .6; b += h * h * h * .3; }
  const raw = .3 * r + .59 * g + .11 * b;
  shadeCell(m, r, g, b, lr, lg, lb, texOf(vari[ci]), top ? 1 : 0, _shd);
  let r2 = _shd[0], g2 = _shd[1], b2 = _shd[2];
  if (top) { r2 = r2 * 1.25 + .06; g2 = g2 * 1.25 + .06; b2 = b2 * 1.25 + .08; if (hash2(cx, cy + ((time * 3) | 0), 9) < .035) r2 = g2 = b2 = 1.5; }
  const wG = R.wG;
  if (wG[k]) {   // a back wall behind: it shows through
    const a = clamp(.45 + .15 * MAT_MURK[m], .45, .92);
    r2 = cR[k] + (r2 - cR[k]) * a; g2 = cG[k] + (g2 - cG[k]) * a; b2 = cB[k] + (b2 - cB[k]) * a;
  }
  wG[k] = SOLID; cR[k] = r2; cG[k] = g2; cB[k] = b2; cL[k] = raw;
}
