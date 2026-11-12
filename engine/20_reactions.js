// ===================== ENGINE · reactions, burning and heat =====================
// Matter that changes when it meets other matter, as data on the material (engine/API.md, Reactions and heat). The cellular step calls reactCell for every
// cell of a material that `reacts` or is `flammable` (an awake chunk only: a chunk is kept awake while something there is burning or waiting to react),
// and coolHeat calls conductHeat for the materials that `conduct`. The engine never names a material: lava and water, wood and fire are all game data.

// the index of the cell beside i in direction k (up, down, left, right), or -1 at the edge of the world
const nbIndex = (i, x, k) => k === 0 ? (i >= W ? i - W : -1) : k === 1 ? (i + W < W * H ? i + W : -1) : k === 2 ? (x > 0 ? i - 1 : -1) : (x < W - 1 ? i + 1 : -1);

// One cell in one step. A flammable cell hotter than its `ignite` burns: it keeps itself hot, heats the cells around it (fire spreads through the heat field),
// throws flames and smoke, and each step has the chance `flammable` to turn into `burnsTo`; a liquid beside it (that is not itself hot) puts it out. Then the
// cell's `reacts` list: if a neighbour is the `with` material, the chance `chance` makes this cell `makes` and the neighbour `leaves`, with the heat of the
// reaction in the new cell and, if there is any, a puff of steam where the neighbour was. Returns true when the cell was turned into something else.
function reactCell(x, y, m, ci) {
  const i = y * W + x, S = RES;
  if (MAT_FLAM[m] && heat[i] > MAT_IGN[m]) {
    let wet = false;
    for (let k = 0; k < 4; k++) { const n = nbIndex(i, x, k); if (n >= 0 && MAT_LIQ[cells[n]] && !MAT_HOT[cells[n]]) wet = true; }
    if (wet) heat[i] *= .5;
    else {
      heat[i] = Math.max(heat[i], .9);
      for (let k = 0; k < 4; k++) {
        const n = nbIndex(i, x, k); if (n < 0 || cells[n] === EMPTY) continue;
        heat[n] = Math.min(1.6, heat[n] + .35);
        if (MAT_FLAM[cells[n]]) wakeAt(n % W, (n / W) | 0);
      }
      if (rnd() < .4) spawnP(PT_FIRE, x + .5 + rr(-.5, .5), (y + .5) * ASPECT - 1, rr(-3, 3) * S, -rr(3, 10) * S, rr(.3, .7), 0, 0);
      if (rnd() < MAT_FLAM[m]) {
        cells[i] = MAT_BURN[m]; wakeAt(x, y);
        if (rnd() < .5) spawnP(PT_SMOKE, x + .5, (y + .5) * ASPECT - 1, rr(-3, 3) * S, -rr(2, 6) * S, rr(.8, 1.6), pick('%&o@'), 0);
        return true;
      }
      awake[ci] = 1;   // still burning: it will be looked at again
    }
  }
  const rx = MAT_RX[m];
  if (rx) for (const r of rx) {
    let waiting = false;
    for (let k = 0; k < 4; k++) {
      const n = nbIndex(i, x, k); if (n < 0 || cells[n] !== r.with) continue;
      if (rnd() >= r.chance) { waiting = true; continue; }
      const nx = n % W, ny = (n / W) | 0;
      cells[i] = r.makes; cells[n] = r.leaves;
      if (r.heat) {
        heat[i] = Math.min(1.6, heat[i] + r.heat);
        if (r.heat > 0) for (let q = 0, c = 1 + Math.round(r.heat * 5); q < c; q++) spawnP(PT_VAPOR, nx + .5 + rr(-1, 1), (ny + .5) * ASPECT - 1, rr(-6, 6) * S, -rr(3, 12) * S, rr(.8, 1.8), pick('~-.'), 0);
      }
      wakeAt(x, y); wakeAt(nx, ny);
      return true;
    }
    if (waiting) awake[ci] = 1;   // a reaction that did not happen yet is tried again next step
  }
  return false;
}

// Heat flows between touching cells that both `conduct`, from the hotter to the cooler, by the lesser of the two ratings x .2 of the difference per step (the
// pair is looked at once: each cell with its right and its lower neighbour). A flammable cell that gets hot enough to catch is woken so its chunk looks at it.
function conductHeat(x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      const i = row + x, c = MAT_COND[cells[i]]; if (!c) continue;
      for (let k = 0; k < 2; k++) {
        const j = k ? i + W : i + 1; if (k ? y + 1 >= H : x + 1 >= W) continue;
        const cj = MAT_COND[cells[j]]; if (!cj) continue;
        const d = (heat[i] - heat[j]) * (c < cj ? c : cj) * .2;
        if (d > .0004 || d < -.0004) {
          heat[i] -= d; heat[j] += d;
          const t = d > 0 ? j : i; if (MAT_FLAM[cells[t]] && heat[t] > MAT_IGN[cells[t]]) wakeAt(t % W, (t / W) | 0);
        }
      }
    }
  }
}
