// ===================== GAME · can a sector be finished? =====================
// A search over where the mouse can stand, using its real controller (the engine Character with the mouse's tunables).
// From each standing spot it tries walking, jumps of three lengths, steering in the air and running jumps, and records where
// it lands, never on a cable or glass. Cheese counts as eaten, rusted panels and gantries as fallen and cracked walls as
// broken (by a cat-bot shorted next to them); low gravity applies; cat-bots are left out. The web editor's CHECK button runs
// it on the map being painted (GAME.levels.check) and tests/reach.py on every sector.
// Returns { ok, goal, crumbs: [reached, total], checkpoints: [reached, total], missing: { crumbs, checkpoints } (tiles),
// spots (tiles the mouse can stand on), ms }.
function checkSector(n) {
  startSector(n); CATS.forEach(k => k.alive = false);
  for (let i = 0; i < W * H; i++) { const m = cells[i]; if (m === CHEESE || m === CRUMBS || m === RUST || m === FLAKES || m === WEAK) cells[i] = EMPTY; }
  for (const g of SEC.gantries) for (const [tx, ty] of g.deck) for (let cy = ty * SEC.th; cy < (ty + 1) * SEC.th; cy++) for (let cx = tx * SEC.tw; cx < (tx + 1) * SEC.tw; cx++) cells[cy * W + cx] = EMPTY;
  const S = RES, opts = mouseOpts(), seen = new Set(), queue = [], tiles = new Set();
  const crumbs = SEC.crumbs.map(() => false), checks = SEC.checkpoints.map(() => false); let goal = false;
  const add = c => {
    const k = Math.round(c.x / 2) + ',' + Math.round(c.y / ASPECT);
    if (seen.has(k)) return;
    seen.add(k); queue.push([c.x, c.y]); tiles.add(Math.floor(c.x / SEC.tw) + ',' + (Math.round(c.y / ASPECT / SEC.th) - 1));
  };
  const visit = c => {
    const mx = c.x, my = c.y - c.o.h / 2;
    SEC.crumbs.forEach((cr, i) => { if (!crumbs[i] && Math.abs(cr.x - mx) < 3.2 * S && Math.abs(cr.y - my) < 4.5 * S) crumbs[i] = true; });
    SEC.checkpoints.forEach((cp, i) => { if (!checks[i] && Math.abs(cp.x - c.x) < 3 * S && Math.abs(cp.y - c.y) < 4 * S) checks[i] = true; });
    if (!goal && touching(c, m => m === GREAT)) goal = true;
  };
  // one try: hold dir (dir2 after `sw` steps) and jump for `hold` steps, starting at speed v0; it counts if it comes to rest alive
  const sim = (x, y, dir, dir2, sw, hold, maxN, v0 = 0) => {
    const c = new Character(x, y, opts); c.onGround = true; c.ground = HULL; c.vx = v0;
    for (let i = 0; i < maxN; i++) {
      applyGravityZone(c, opts.jump);
      c.step(DT, { x: i < sw ? dir : dir2, jump: i < hold });
      visit(c);
      if (touching(c, m => HAZARD[m]) || c.y > H * ASPECT) return;
      if (i > 2 && c.onGround) { add(c); return; }
    }
  };
  const start = new Character(SEC.start[0], SEC.start[1], opts);
  for (let i = 0; i < 30; i++) start.step(DT, {});
  add(start);
  const t0 = performance.now(); let n0 = 0;
  while (queue.length && n0 < 40000) {
    const [x, y] = queue.shift(); n0++;
    for (const d of [-1, 1]) { sim(x, y, d, d, 99, 0, 8); sim(x, y, d, d, 99, 0, 40); }
    for (const d of [-1, 0, 1]) for (const hold of [6, 14, 40]) {
      sim(x, y, d, d, 999, hold, 150);
      if (d) { sim(x, y, d, 0, 12, hold, 150); sim(x, y, d, -d, 18, hold, 150); sim(x, y, 0, d, 14, hold, 150); sim(x, y, d, d, 999, hold, 150, d * opts.run); }
    }
  }
  const tile = o => [Math.floor(o.x / SEC.tw), Math.floor(o.y / ASPECT / SEC.th - .01)];
  const report = {
    goal, crumbs: [crumbs.filter(Boolean).length, crumbs.length], checkpoints: [checks.filter(Boolean).length, checks.length],
    missing: { crumbs: SEC.crumbs.filter((c, i) => !crumbs[i]).map(tile), checkpoints: SEC.checkpoints.filter((c, i) => !checks[i]).map(tile) },
    spots: [...tiles].map(k => k.split(',').map(Number)), ms: Math.round(performance.now() - t0)
  };
  report.ok = goal && !report.missing.crumbs.length && !report.missing.checkpoints.length;
  startSector(n);   // put back what the search took out
  return report;
}
