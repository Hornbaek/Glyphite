// ===================== GAME · things that give way, and where gravity fails =====================
// Rusted panels crumble under whoever stands on them; cracked walls crumble after a blast close by. Gantries (decks held to the wall only by rusted brackets, map 'B')
// groan when the mouse walks out on one, then the brackets snap and the whole deck falls as one rigid chunk (the engine's
// breakable structures do the falling). Low-gravity zones (a sector's lowG rectangles) halve gravity and double jumps.

// ---------- rust and cracked walls ----------
// Standing on a rusted panel starts it going: a third of a second later the cells under the feet turn to flakes (sand),
// and the rot spreads through the whole panel, cell by cell. A blast near a cracked wall does the same to the wall.
const CRUMBLE = new Map();   // cell index → seconds until it gives
const CRUMBLES_TO = { [RUST]: FLAKES, [WEAK]: SCRAP };
function crumbleAt(c) {
  const row = Math.round(c.y / ASPECT), hw = c.o.w / 2;
  for (let cx = Math.floor(c.x - hw) - 1; cx <= Math.floor(c.x + hw) + 1; cx++) {
    const i = row * W + cx;
    if (cx >= 0 && cx < W && cells[i] === RUST && !CRUMBLE.has(i) && !SEC.bracketCells.has(i)) { CRUMBLE.set(i, .32 + Math.random() * .12); if (Math.random() < .3) Sfx.burst(.35, 500, 110, .16, 'lowpass', 3); }
  }
}
function stepCrumble(dt) {
  if (!CRUMBLE.size) return;
  const S = RES, spread = [];
  for (const [i, t] of CRUMBLE) {
    const cx = i % W, cy = (i / W) | 0;
    if (t - dt > 0) { CRUMBLE.set(i, t - dt); if (Math.random() < dt * 4) spawnP(PT_DUST, cx + .5, (cy + 1) * ASPECT, rr(-1, 1) * S, rr(1, 4) * S, rr(.4, .8), pick(".,"), RUST); continue; }
    CRUMBLE.delete(i);
    const m = cells[i], to = CRUMBLES_TO[m];
    if (!to) continue;
    setC(cx, cy, to);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (cy + dy) * W + cx + dx; if (cells[j] === m && !CRUMBLE.has(j) && !SEC.bracketCells.has(j)) spread.push(j); }
  }
  for (const j of spread) CRUMBLE.set(j, .03 + Math.random() * .09);
  if (spread.length && Math.random() < .15) Sfx.burst(.25, 900, 150, .12, 'lowpass', 2);
}

// a blast (a shorted cat-bot) within about two tiles of a cracked wall sets the whole panel going
function crackWalls(x, y, R) {
  const r = R + 2 * TILE * RES, cx0 = Math.floor(x), cy0 = Math.floor(y / ASPECT);
  for (let cy = cy0 - Math.ceil(r / ASPECT); cy <= cy0 + Math.ceil(r / ASPECT); cy++) for (let cx = Math.floor(cx0 - r); cx <= cx0 + r; cx++) {
    const i = cy * W + cx;
    if (cx >= 0 && cy >= 0 && cx < W && cy < H && cells[i] === WEAK && !CRUMBLE.has(i) && Math.hypot(cx + .5 - x, (cy + .5) * ASPECT - y) < r) CRUMBLE.set(i, .1 + Math.random() * .25);
  }
}

// ---------- gantries ----------
// Found once per build: each group of 'B' brackets with the deck ('=') tiles joined to it.
function findGantries(sec) {
  const map = sec.def.map, seen = new Set(), S = RES;
  sec.gantries = []; sec.gantryAt = new Map(); sec.bracketCells = new Set();
  for (let ty = 0; ty < sec.mh; ty++) for (let tx = 0; tx < sec.mw; tx++) {
    if (map[ty][tx] !== 'B' || seen.has(ty * sec.mw + tx)) continue;
    const g = { id: sec.gantries.length, brackets: [], deck: [], t: -1, fallen: false }, stack = [[tx, ty]];
    seen.add(ty * sec.mw + tx);
    while (stack.length) {
      const [x, y] = stack.pop(), c = map[y][x];
      (c === 'B' ? g.brackets : g.deck).push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nc = tileAt(map, nx, ny);
        if ((nc === 'B' || nc === '=') && !seen.has(ny * sec.mw + nx)) { seen.add(ny * sec.mw + nx); stack.push([nx, ny]); }
      }
    }
    for (const [x, y] of g.deck) sec.gantryAt.set(y * sec.mw + x, g);
    for (const [x, y] of g.brackets) for (let cy = y * sec.th; cy < (y + 1) * sec.th; cy++) for (let cx = x * sec.tw; cx < (x + 1) * sec.tw; cx++) sec.bracketCells.add(cy * W + cx);
    const xs = g.deck.concat(g.brackets).map(p => p[0]), ys = g.deck.concat(g.brackets).map(p => p[1]);
    g.x = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * sec.tw; g.y = (Math.min(...ys) + Math.max(...ys) + 1) / 2 * sec.th * ASPECT;
    g.R = (Math.max(...xs) - Math.min(...xs) + 1) * sec.tw * .5 + 4 * S;
    sec.gantries.push(g);
  }
}
// the mouse is standing on a gantry's deck: it starts to go
function gantryUnder(c) {
  if (c.ground !== DECK) return null;
  const tx = Math.floor(c.x / SEC.tw), ty = Math.floor(Math.round(c.y / ASPECT) / SEC.th);
  return SEC.gantryAt.get(ty * SEC.mw + tx) || null;
}
function stepGantries(dt) {
  const S = RES;
  for (const g of SEC.gantries) {
    if (g.t < 0 || g.fallen) continue;
    g.t -= dt;
    if (Math.random() < dt * 14) {   // the brackets groan and shed rust
      const [bx, by] = g.brackets[(Math.random() * g.brackets.length) | 0];
      spawnP(PT_DUST, (bx + Math.random()) * SEC.tw, (by + Math.random()) * SEC.th * ASPECT, rr(-3, 3) * S, rr(1, 6) * S, rr(.4, .9), pick(".,'"), RUST);
      if (Math.random() < .3) spawnP(PT_SPARK, (bx + .5) * SEC.tw, (by + .5) * SEC.th * ASPECT, rr(-8, 8) * S, rr(-6, 2) * S, rr(.2, .5), pick("'*"), 0);
    }
    if (g.t > 0) continue;
    g.fallen = true;
    for (const i of SEC.bracketCells) if (cells[i] === RUST) {   // the brackets snap...
      const cx = i % W, cy = (i / W) | 0, gx = Math.floor(cx / SEC.tw), gy = Math.floor(cy / SEC.th);
      if (!g.brackets.some(([x, y]) => x === gx && y === gy)) continue;
      setC(cx, cy, EMPTY);
      if (Math.random() < .25) spawnGrain(cx + .5, cy * ASPECT + 1, rr(-4, 4) * S, rr(-2, 3) * S, FLAKES);
    }
    Sfx.burst(.6, 300, 60, .4, 'lowpass', 4); Sfx.burst(.3, 2400, 600, .2, 'bandpass', 3);
    FX.shake = Math.min(1, FX.shake + .4);
    checkSupport(g.x, g.y, g.R);   // ...and the deck, holding on to nothing, breaks off and falls
  }
}
function startGantry(g) {
  if (g.t >= 0 || g.fallen) return;
  g.t = .75;
  Sfx.burst(.7, 180, 70, .3, 'lowpass', 6); Sfx.burst(.5, 1200, 300, .1, 'bandpass', 8);
  addText(g.x, g.y - 8 * RES, 'CREAK', [200, 150, 110], .9);
}

// ---------- low gravity ----------
// Inside a sector's lowG rectangles ([x0, y0, x1, y1] in tiles) gravity is halved and jumps go twice as high (same launch
// speed): the gravity generator is failing.
function lowGravityAt(x, y) {
  const z = SEC.def.lowG; if (!z) return false;
  const tx = x / SEC.tw, ty = y / ASPECT / SEC.th;
  return z.some(([x0, y0, x1, y1]) => tx >= x0 && tx < x1 + 1 && ty >= y0 && ty < y1 + 1);
}
function applyGravityZone(c, base) {
  const low = lowGravityAt(c.x, c.y - c.o.h / 2);
  c.o.gravity = low ? G * .5 : 0; c.o.jump = base * (low ? 2 : 1);
  return low;
}
