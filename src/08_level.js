// ===================== GAME · landing sites =====================
// Authored in base units (RES 1) and scaled by RES, so every detail level builds the same
// landscape — finer detail just draws it with more characters.
const WORLD_W = 560, WORLD_H = 150;
const SITES = [
  { name: 'MARE TRANQUILLITATIS', sun: 21, ice: .05 },
  { name: 'OCEANUS PROCELLARUM', sun: 17, ice: .08 },
  { name: 'FRA MAURO', sun: 14, ice: .1 },
  { name: 'HADLEY RILLE', sun: 12, ice: .12 },
  { name: 'DESCARTES HIGHLANDS', sun: 11, ice: .15 },
  { name: 'TAURUS-LITTROW', sun: 9, ice: .2 },
  { name: 'SHACKLETON RIM', sun: 5, ice: .85 },
  { name: 'SCHRODINGER BASIN', sun: 7, ice: .6 }
];
let LEVEL = null;

function genLevel(lv) {
  const S = RES, rng = mulberry32(lv * 7919 + 1013), seed = (lv * 131 + 7) | 0;
  const site = SITES[(lv - 1) % SITES.length], tier = Math.min(lv, 9);
  worldInit(Math.round(WORLD_W * S), Math.round(WORLD_H * S)); chunks = []; rechecks = [];
  P.n = 0; FX.rings.length = 0; FX.lights.length = 0; FX.texts.length = 0;
  const el = site.sun * Math.PI / 180; SUN_L[0] = Math.cos(el); SUN_L[1] = Math.sin(el);
  const rough = .75 + tier * .11, hgt = new Float32Array(W);
  for (let x = 0; x < W; x++) hgt[x] = H * .62 + (fbm1(x / (105 * S), seed, 4) - .5) * H * .4 * rough
    + (fbm1(x / (21 * S), seed + 5, 3) - .5) * 7 * rough * S
    + (fbm1(x / (5 * S), seed + 11, 2) - .5) * 1.6 * S;            // metre-scale lumps, visible at fine detail
  // impact craters: bowl + raised rim (big ones, then a scatter of small fresh ones)
  const crater = (cx, r, d) => {
    const rim = d * .5;
    for (let x = Math.max(0, cx - r * 1.7 | 0); x < Math.min(W, cx + r * 1.7); x++) {
      const u = (x - cx) / r; if (Math.abs(u) < 1) hgt[x] += d * (1 - u * u);
      const e = (Math.abs(u) - 1) / .35; hgt[x] -= rim * Math.exp(-e * e);
    }
  };
  for (let k = 0; k < 3 + tier; k++) { const r = (8 + rng() * 20 * (.7 + tier * .07)) * S; crater(rng() * W, r, r * (.18 + rng() * .14)); }
  for (let k = 0; k < 14 + tier * 2; k++) { const r = (1.5 + rng() * 4) * S; crater(rng() * W, r, r * (.25 + rng() * .15)); }
  // mesas on later sites
  for (let k = 0; k < (tier >= 2 ? 1 + (tier >> 2) : 0); k++) {
    const cx = W * (.25 + rng() * .5), half = (10 + rng() * 14) * S;
    const top = Math.min(...Array.from({ length: 8 }, (_, i) => hgt[clamp(cx - half + i * half / 4 | 0, 0, W - 1)])) - (8 + rng() * 10) * S;
    for (let x = Math.max(0, cx - half - 6 * S | 0); x < Math.min(W, cx + half + 6 * S); x++) {
      const u = Math.abs(x - cx) - half, t = u < 0 ? 1 : Math.max(0, 1 - u / (6 * S));
      hgt[x] = Math.min(hgt[x], lerp(hgt[x], top + vnoise1(x * .4 / S, seed) * 1.5 * S, t));
    }
  }
  // landing pads: wide x1, narrow x2, x3 tucked under an overhang
  const padSpec = [{ mult: 1, w: 22, at: .36 + rng() * .1 }, { mult: 2, w: 18, at: .6 + rng() * .08 }];
  if (tier >= 2) padSpec.push({ mult: 3, w: 17, at: .83 + rng() * .07 });
  const pads = [], blend = 8 * S, pw = Math.max(1, Math.round(S)), deck = Math.max(2, Math.round(2 * S)), postH = Math.max(2, Math.round(2 * S));
  for (const ps of padSpec) {
    const w = Math.round(ps.w * S), x0 = Math.round(W * ps.at), x1 = x0 + w;
    let row = 0; for (let x = x0; x < x1; x++) row += hgt[x]; row = Math.round(row / w);
    for (let x = Math.floor(x0 - blend); x < x1 + blend; x++) { if (x < 0 || x >= W) continue; const u = x < x0 ? (x0 - x) / blend : x >= x1 ? (x - x1 + 1) / blend : 0; hgt[x] = lerp(row, hgt[x], smooth(Math.min(1, u))); }
    pads.push({ x0, x1, row, mult: ps.mult, postTop: row - postH, pw });
  }
  const spawn = { x: (30 + rng() * 25) * S, y: 40 * S, vx: (7 + tier * .6) * S };
  // fill voxels
  for (let x = 0; x < W; x++) {
    const top = Math.max(Math.round(18 * S), Math.round(hgt[x])), reg = Math.round((2 + Math.floor(fbm1(x / (15 * S), seed + 9, 2) * 6)) * S);
    const bed = H - Math.round((4 + (vnoise1(x * .3 / S, seed) * 2 | 0)) * S);
    for (let y = top; y < H; y++) {
      let m = y < top + reg ? REGO : ROCK;
      if (y >= bed) m = BED;
      else if (m === ROCK && fbm2(x / (9 * S), y / (5 * S), seed + 3, 2) > .74) m = RUBBLE;
      cells[y * W + x] = m;
    }
  }
  // caves (later sites): worm tunnels through basalt
  if (tier >= 3) {
    const th = .03 + tier * .004;
    for (let y = Math.round(30 * S); y < H - 6 * S; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (cells[i] !== ROCK) continue;
      const nearPad = pads.some(p => { const m = (p.mult === 3 ? 16 : 4) * S; return x > p.x0 - m && x < p.x1 + m && y < p.row + 10 * S; });   // x3 keeps its roof pillar on solid rock
      if (!nearPad && Math.abs(fbm2(x / (34 * S), y / (11 * S), seed + 21, 3) - .5) < th) cells[i] = EMPTY;
    }
  }
  // pads + beacon posts (metal)
  for (const p of pads) {
    for (let x = p.x0; x < p.x1; x++) { for (let y = 0; y < p.row; y++) cells[y * W + x] = EMPTY; for (let d = 0; d < deck; d++) cells[(p.row + d) * W + x] = METAL; }
    for (let q = 0; q < pw; q++) for (const px of [p.x0 - 1 - q, p.x1 + q]) for (let y = p.postTop; y < p.row + deck; y++) if (px >= 0 && px < W) cells[y * W + px] = METAL;
  }
  // overhang above the x3 pad: a basalt roof held by one pillar (built after the pads clear their airspace)
  for (const p of pads) if (p.mult === 3) {
    const roof = p.row - Math.round(10.5 * S), cx = (p.x0 + p.x1) / 2, rx = (p.x1 - p.x0) * .9 + 5 * S;
    for (let y = roof - Math.round(3 * S); y <= roof + S; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x - cx) / rx, v = (y - roof + S) / (2.4 * S); if (u * u + v * v < 1 && x >= 0 && x < W && y >= 0) cells[y * W + x] = ROCK;
    }
    // the pillar is founded on basalt: it replaces loose regolith all the way down to rock
    for (let x = Math.floor(cx + rx - 5 * S); x < cx + rx; x++) for (let y = roof; y < H; y++) {
      if (x < 0 || x >= W) break;
      const m = cells[y * W + x];
      if (m === EMPTY || (MAT_GRAN[m] && y > roof + 2 * S)) cells[y * W + x] = ROCK; else if (y > roof + 2 * S) break;
    }
  }
  // downward floodlights: steel mast + arm holding a lamp that hangs just outside each pad,
  // ceiling lamps under the x3 roof, and survey lamps across the plain (more at dark polar sites)
  const lamps = [], groundAt = x => { let y = 0; while (y < H && cells[y * W + x] === EMPTY) y++; return y; };
  const lampW = Math.max(1, Math.round(1.2 * S));
  const addLamp = (hx, hy, aimX, aimY, mount, c, spread) => {
    const x = hx + .5, y = (hy + 1) * ASPECT + .2;
    let dx = aimX - x, dy = aimY - y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    lamps.push({ hx, hy, x, y, dx, dy, cos: Math.cos(spread), r: Math.max(34 * S, l * 2.1), c, I: 2.2, dead: false, flick: 0, mount, w: lampW });
  };
  const mast = (px, dir, armLen, height, aimX, c) => {
    if (px < 2 || px >= W - 2) return;
    const g = groundAt(px); if (g >= H - 2) return;
    const top = Math.max(2, g - height), wq = Math.max(1, Math.round(S * .6));
    for (let y = top; y < g; y++) for (let q = 0; q < wq; q++) cells[y * W + px + q] = MAST;
    // footing: the pole is driven through the loose regolith into the rock below, so it stands on its own
    for (let y = g; y < Math.min(H - 1, g + 10 * S); y++) { const m = cells[y * W + px]; if (!MAT_GRAN[m]) break; for (let q = 0; q < wq; q++) cells[y * W + px + q] = MAST; }
    let ax = px;
    for (let k = 1; k <= armLen; k++) { const nx = px + dir * k; if (nx < 1 || nx >= W - 1) break; ax = nx; cells[top * W + ax] = MAST; }
    addLamp(ax, top + 1, aimX, groundAt(clamp(Math.round(aimX), 0, W - 1)) * ASPECT, top * W + ax, c, .62);
  };
  const warm = [1, .84, .58], cool = [.8, .9, 1];
  for (const p of pads) {
    const cx = (p.x0 + p.x1) / 2, h = Math.round(12 * S), arm = Math.round(4 * S), off = Math.round(6 * S);
    if (p.mult === 3) {   // the x3 pad sits under a roof: hang the lamps from it
      for (const lx of [Math.round(cx - 3 * S), Math.round(cx + 3 * S)]) {
        let y = p.row - 1; while (y > 0 && cells[y * W + lx] === EMPTY) y--;
        if (y > 0 && p.row - y < 16 * S) addLamp(lx, y + 1, lx, p.row * ASPECT, y * W + lx, warm, .7);
      }
      continue;
    }
    mast(p.x0 - p.pw - off, 1, arm, h, cx - (p.x1 - p.x0) * .2, warm);
    mast(p.x1 + p.pw - 1 + off, -1, arm, h, cx + (p.x1 - p.x0) * .2, warm);
  }
  for (let k = 0, n = site.sun < 10 ? 6 : 3; k < n; k++) {
    const px = Math.floor(W * (.1 + rng() * .85)), dir = rng() < .5 ? -1 : 1, h = Math.round((10 + rng() * 6) * S);
    if (pads.some(p => px > p.x0 - 30 * S && px < p.x1 + 30 * S) || Math.abs(px - spawn.x) < 30 * S) continue;
    mast(px, dir, Math.round(3 * S), h, px + dir * 7 * S, cool);
  }
  // He-3 crystal veins in the basalt
  const crystals = [];
  for (let k = 0; k < 6 + tier * 2; k++) {
    let x = Math.floor(W * (.12 + rng() * .82)), y = Math.round(hgt[x] + (3 + Math.floor(rng() * 12)) * S);
    const n = Math.round((3 + Math.floor(rng() * 6)) * S * S);
    if (pads.some(p => x > p.x0 - 6 * S && x < p.x1 + 6 * S)) continue;
    let placed = 0, sx = 0, sy = 0;
    for (let s = 0; s < n * 2 && placed < n; s++) {
      if (x > 0 && x < W && y > 0 && y < H - 5 * S && (cells[y * W + x] === ROCK || cells[y * W + x] === REGO)) { cells[y * W + x] = CRYST; placed++; sx += x; sy += y; }
      x += Math.floor(rng() * 3) - 1; y += Math.floor(rng() * 3) - 1;
    }
    if (placed) crystals.push({ x: sx / placed + .5, y: (sy / placed) * ASPECT + 1 });
  }
  // let loose regolith settle before the player arrives; cave roofs cut loose by the tunnels and
  // ledges left hanging by the slide come down too
  awake.fill(1);
  const settle = n => { for (let i = 0; i < n; i++) { simGranular(); stepParticles(DT); frameNo++; } };
  const onDrop = (comp, d) => {
    const moved = new Set(comp);
    for (const lp of lamps) if (moved.has(lp.mount)) { lp.mount += d * W; lp.hy += d; lp.y += d * ASPECT; }
    for (const c of crystals) if (moved.has(Math.floor(c.y / ASPECT) * W + Math.floor(c.x))) c.y += d * ASPECT;
  };
  settle(40 * S); settleIslands(onDrop); settle(12 * S); settleIslands(onDrop);
  P.n = 0;
  // water ice settles in permanently shadowed crater floors
  updateSkyline();
  const iceD = Math.max(1, Math.round(1.5 * S));
  for (let x = 1; x < W - 1; x++) {
    const y = colTop[x]; if (y >= H || cells[y * W + x] !== REGO) continue;
    let px = x + .5, py = y * ASPECT - .1, lit = true;
    while (py > 0 && px > 0) { px -= SUN_L[0] * .7; py -= SUN_L[1] * .7; if (getC(Math.floor(px), Math.floor(py / ASPECT)) !== EMPTY) { lit = false; break; } }
    if (!lit && rng() < site.ice + .25) for (let d = 0; d < iceD; d++) if (cells[(y + d) * W + x] === REGO && (d === 0 || rng() < .7)) cells[(y + d) * W + x] = ICE;
  }
  updateSkyline();
  LEVEL = {
    lv, site, pads, crystals, spawn, tier, lamps,
    fuelMax: 100, burn: 100 / (30 - Math.min(10, tier)),   // % per second at full throttle
    rockets: 5 + Math.min(5, tier >> 1), meteorRate: tier >= 2 ? .05 + tier * .025 : 0
  };
  spawnBoulders(rng);
  return LEVEL;
}
