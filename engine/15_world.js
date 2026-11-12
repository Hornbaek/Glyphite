// ===================== ENGINE · world tools: rays, projectiles, triggers, tile maps, digging, gravity zones, reach =====================

// ---------- raycast ----------
// raycast(x0, y0, dx, dy, max, opts) walks a ray (units; x in cells, y in units) through the grid and any chunks and entities:
//   → { x, y, dist, nx, ny, cell: [cx, cy], material, chunk, entity } for the first thing it meets, or null.
// opts: { entities: true | ['type', ...] (also test entities), ignore: entity, through: m => bool (materials the ray passes) }.
function raycast(x0, y0, dx, dy, max = 400, opts = {}) {
  const len = Math.hypot(dx, dy); if (len < 1e-9) return null;
  dx /= len; dy /= len;
  let cx = Math.floor(x0), cy = Math.floor(y0 / ASPECT), best = null;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, tdx = dx ? Math.abs(1 / dx) : 1e30, tdy = dy ? Math.abs(ASPECT / dy) : 1e30;
  let tx = dx ? ((dx > 0 ? cx + 1 : cx) - x0) / dx : 1e30, ty = dy ? (((dy > 0 ? cy + 1 : cy) * ASPECT) - y0) / dy : 1e30, t = 0, nx = 0, ny = 0;
  const cb = []; for (const ch of chunks) { const b = chunkCellBox(ch); b.push(ch); cb.push(b); }
  for (let steps = 0; steps < 5000 && t <= max; steps++) {
    const m = getC(cx, cy);
    if (m !== EMPTY && !(opts.through && opts.through(m))) { best = { dist: t, material: m, cell: [cx, cy], chunk: null, entity: null, nx, ny }; break; }
    if (m === EMPTY) for (const b of cb) if (cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]) { const cm = chunkCellMat(b[4], cx, cy); if (cm && !(opts.through && opts.through(cm))) { best = { dist: t, material: cm, cell: [cx, cy], chunk: b[4], entity: null, nx, ny }; break; } }
    if (best) break;
    if (tx < ty) { t = tx; tx += tdx; cx += sx; nx = -sx; ny = 0; } else { t = ty; ty += tdy; cy += sy; nx = 0; ny = -sy; }
    if (cx < -1 || cx > W + 1 || cy < -400 || cy > H + 1) break;
  }
  if (best && best.dist > max) best = null;
  if (opts.entities) {
    const types = Array.isArray(opts.entities) ? opts.entities : null, lim = best ? best.dist : max;
    for (const e of entities) {
      if (e.dead || e === opts.ignore || (types && !types.includes(e.type))) continue;
      const [bx0, by0, bx1, by1] = entityBox(e);
      let t0 = 0, t1 = lim, hx = 0, hy = 0, ok = true;
      for (const [o, d, lo, hi, axis] of [[x0, dx, bx0, bx1, 0], [y0, dy, by0, by1, 1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
        let a = (lo - o) / d, b = (hi - o) / d, face = -Math.sign(d); if (a > b) { [a, b] = [b, a]; face = -face; }
        if (a > t0) { t0 = a; hx = axis ? 0 : face; hy = axis ? face : 0; }
        if (b < t1) t1 = b;
        if (t0 > t1) ok = false;
      }
      if (ok && t0 <= lim && (!best || t0 < best.dist)) best = { dist: t0, material: 0, cell: null, chunk: null, entity: e, nx: hx, ny: hy };
    }
  }
  if (best) { best.x = x0 + dx * best.dist; best.y = y0 + dy * best.dist; }
  return best;
}

// ---------- projectiles ----------
// fireProjectile({ x, y, vx, vy, gravity: 1, drag: 0, bounce: 0, life: 4, color: [255, 220, 120], size: 1, light: { r, c, I },
//   hits: ['enemy'] (entity types it can hit), owner: entity (ignored), onStep(p, dt) each step, onHit(p, hit) → return false to keep flying })
// It moves by rays, so a fast one cannot pass through a one-cell wall; bounce > 0 reflects it off terrain that many times.
defineEntity('projectile', {
  size: [1, 1], always: true,
  update(p, dt) {
    p.life -= dt; if (p.life <= 0) { p.dead = true; return; }
    if (p.onStep) p.onStep(p, dt);
    p.vy += G * p.gravity * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    const dx = p.vx * dt, dy = p.vy * dt, d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const hit = raycast(p.x, p.y, dx, dy, d, { entities: p.hits || false, ignore: p.owner });
    if (!hit) { p.x += dx; p.y += dy; return; }
    p.x = hit.x; p.y = hit.y;
    if (p.onHit && p.onHit(p, hit) === false) { p.x += hit.nx * .01; p.y += hit.ny * .01; return; }
    if (p.bounce > 0 && !hit.entity && p.bounces < p.maxBounces) {
      const dn = p.vx * hit.nx + p.vy * hit.ny; p.vx = (p.vx - 2 * dn * hit.nx) * p.bounce; p.vy = (p.vy - 2 * dn * hit.ny) * p.bounce; p.bounces++;
      p.x += hit.nx * .05; p.y += hit.ny * .05; return;
    }
    p.dead = true;
  },
  draw(p) { const c = p.color, s = Math.max(1, Math.round(p.size * RES * .5)); for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) putEmit(Math.floor(p.x) + i - (s >> 1), Math.floor(p.y / ASPECT) + j - (s >> 1), SOLID, c[0] / 255 * 1.4, c[1] / 255 * 1.4, c[2] / 255 * 1.4); },
  lights(p, t, out) { if (p.light) out.push({ x: p.x, y: p.y, r: p.light.r * RES, c: p.light.c || [1, .8, .5], I: p.light.I ?? 1, shadow: true }); }
});
function fireProjectile(o) {
  return spawn('projectile', o.x, o.y, { vx: o.vx || 0, vy: o.vy || 0, gravity: o.gravity ?? 1, drag: o.drag || 0, bounce: o.bounce || 0, maxBounces: o.maxBounces ?? 3, bounces: 0, life: o.life ?? 4,
    color: o.color || [255, 220, 120], size: o.size ?? 1, light: o.light || null, hits: o.hits || false, owner: o.owner || null, onHit: o.onHit || null, onStep: o.onStep || null });
}

// ---------- triggers ----------
// addTrigger({ x, y, w, h }, { onEnter(actor), onLeave(actor), who: ['type', ...] | fn(actor) → bool, once: true }) → trigger { inside, remove() }
// The rectangle is in world units (x, w in cells, y, h in units, top-left). Actors are the entities and anything given to
// watchActor(obj) (a Character, a Body: an object with x, y (feet for a Character) and a size in .w / .h or .o.w / .o.h).
const triggers = [], actors = [];
function watchActor(obj, kind = 'actor') { if (!actors.some(a => a.obj === obj)) actors.push({ obj, kind }); return obj; }
function unwatchActor(obj) { const i = actors.findIndex(a => a.obj === obj); if (i >= 0) actors.splice(i, 1); }
function addTrigger(rect, h = {}) {
  const t = { ...rect, ...h, tag: h.tag || '', inside: new Set(), dead: false, remove() { this.dead = true; } };
  triggers.push(t); return t;
}
const actorBox = a => { const o = a.obj, w = o.w ?? o.o?.w ?? 0, hh = o.h ?? o.o?.h ?? 0; return [o.x - w / 2, o.y - hh, o.x + w / 2, o.y]; };
function stepTriggers() {
  if (!triggers.length) return;
  const all = [];
  for (const a of actors) all.push({ obj: a.obj, type: a.kind, box: actorBox(a) });
  for (const e of entities) if (!e.dead) all.push({ obj: e, type: e.type, box: entityBox(e) });
  for (const t of triggers) {
    if (t.dead) continue;
    const now = new Set();
    for (const a of all) {
      if (t.who && !(typeof t.who === 'function' ? t.who(a.obj, a.type) : t.who.includes(a.type))) continue;
      const [x0, y0, x1, y1] = a.box;
      if (x0 < t.x + t.w && x1 > t.x && y0 < t.y + t.h && y1 > t.y) now.add(a.obj);
    }
    for (const o of now) if (!t.inside.has(o)) { t.inside.add(o); if (t.onEnter) t.onEnter(o, t); if (t.once) t.dead = true; }
    for (const o of [...t.inside]) if (!now.has(o)) { t.inside.delete(o); if (t.onLeave) t.onLeave(o, t); }
  }
  for (let i = triggers.length - 1; i >= 0; i--) if (triggers[i].dead) triggers.splice(i, 1);
}

// ---------- tile maps: rows of characters become a world, props, spawns and triggers ----------
//   const map = loadTileMap(rows, legend, { tile: 4, margin: 0 });
//   legend: { '#': { mat: ROCK }, 'L': { back: LADDER_WALL, mat: LADDER }, 'T': { prop: TORCH_SPR }, 'e': { entity: 'slime' }, 'P': { spawn: 'start' },
//             'Z': { trigger: 'door' }, 'c': { entity: ['coin', { value: 5 }] } }   (a bare number is { mat: n }; a space or an unknown character is empty)
// A tile is `tile` base units (x RES cells) square. loadTileMap calls worldInit with the map's size (plus `margin` tiles of empty
// sky above and rock-free space around, if given), fills the cells, puts props where they stand, spawns entities (feet at the middle
// of the tile's bottom), records spawn points and makes triggers (touching tiles with one tag become one trigger).
// Returns { cols, rows, tc (cells per tile), w, h, spawns: { tag: [x, y] }, triggers: { tag: [t, ...] }, on(tag, handlers), at(x, y) → character }.
const PROPS = [];
function loadTileMap(rows, legend, o = {}) {
  const tile = o.tile ?? 4, tc = Math.max(1, Math.round(tile * RES)), cols = Math.max(...rows.map(r => r.length)), nr = rows.length, m = (o.margin || 0) * tc;
  const w = cols * tc + 2 * m, h = nr * tc + m;
  worldInit(w, h);
  const map = { cols, rows: nr, tc, w, h, ox: m, oy: m, spawns: {}, triggers: {}, rowsText: rows,
    at: (x, y) => rows[Math.floor((y - m) / tc)]?.[Math.floor((x - m) / tc)] ?? ' ',
    on(tag, hnd) { for (const t of map.triggers[tag] || []) Object.assign(t, hnd); return map; } };
  const L = c => { const v = legend[c]; return typeof v === 'number' ? { mat: v } : v; };
  const tags = {};
  for (let r = 0; r < nr; r++) for (let c = 0; c < rows[r].length; c++) {
    const ch = rows[r][c], d = L(ch); if (!d) continue;
    const x0 = m + c * tc, y0 = m + r * tc;
    if (d.mat || d.back) for (let j = 0; j < tc; j++) for (let i = 0; i < tc; i++) { if (d.mat) setC(x0 + i, y0 + j, d.mat); if (d.back) setBack(x0 + i, y0 + j, d.back); }
    if (d.prop) PROPS.push({ spr: d.prop, x: x0 + tc / 2, y: (y0 + tc) * ASPECT, opts: d.propOpts || {} });
    const fx = x0 + tc / 2, fy = (y0 + tc) * ASPECT;
    if (d.entity) { const [type, props] = Array.isArray(d.entity) ? d.entity : [d.entity, {}]; spawn(type, fx, fy, { ...props, tile: [c, r] }); }
    if (d.spawn) (map.spawns[d.spawn] = map.spawns[d.spawn] || []).push([fx, fy]);
    if (d.trigger) (tags[d.trigger] = tags[d.trigger] || []).push([c, r]);
  }
  // single spawn points are [x, y]; several stay a list under the same tag
  for (const k in map.spawns) if (map.spawns[k].length === 1) map.spawns[k] = map.spawns[k][0];
  // touching tiles with the same trigger tag are one trigger (flood fill of the tag's tiles)
  for (const tag in tags) {
    const left = new Set(tags[tag].map(([c, r]) => c + r * 4096)); map.triggers[tag] = [];
    while (left.size) {
      const first = left.values().next().value, st = [first], comp = []; left.delete(first);
      while (st.length) { const k = st.pop(), c = k % 4096, r = (k / 4096) | 0; comp.push([c, r]); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = c + dc + (r + dr) * 4096; if (left.has(q)) { left.delete(q); st.push(q); } } }
      const c0 = Math.min(...comp.map(p => p[0])), c1 = Math.max(...comp.map(p => p[0])), r0 = Math.min(...comp.map(p => p[1])), r1 = Math.max(...comp.map(p => p[1]));
      map.triggers[tag].push(addTrigger({ x: m + c0 * tc, y: (m + r0 * tc) * ASPECT, w: (c1 - c0 + 1) * tc, h: (r1 - r0 + 1) * tc * ASPECT }, { tag, who: o.triggerWho }));
    }
  }
  return map;
}
function drawProps() {
  for (const p of PROPS) {
    if (p.x + 40 * RES < cam.x || p.x - 40 * RES > cam.x + R.cols || p.y + 8 * RES < cam.y || p.y - 60 * RES > cam.y + R.rows * ASPECT) continue;
    drawSprite(p.spr, p.x, p.y - p.spr.h * p.spr.k * RES / 2, 0, { cache: true, ...p.opts });
  }
}
function clearProps() { PROPS.length = 0; }

// ---------- digging and filling without an explosion ----------
// carve(x, y, R, { power: 1, eject: true, heat: 0, support: true }) → cells removed. Takes out every solid cell within R units whose
// toughness is below 4 x power (the indestructible stay), throws a grain from each if eject, heats the rim, wakes the sand and checks
// that nothing is left floating. fill(x, y, R, mat) puts mat into every empty cell within R. No fire, shake or sound: that is explode().
function carve(x, y, R, o = {}) {
  const power = o.power ?? 1, S = RES, cx0 = Math.floor(x), cy0 = Math.floor(y / ASPECT), rx = Math.ceil(R), ry = Math.ceil(R / ASPECT);
  let n = 0;
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const cx = cx0 + i, cy = cy0 + j; if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    const m = cells[cy * W + cx]; if (m === EMPTY || MAT_TOUGH[m] >= 99 || MAT_TOUGH[m] > 4 * power) continue;
    const ux = cx + .5 - x, uy = (cy + .5) * ASPECT - y, d = Math.hypot(ux, uy); if (d > R) continue;
    setC(cx, cy, EMPTY); heat[cy * W + cx] = 0; n++;
    if (o.eject !== false) { const c = crumbOf(m); if (c && rnd() < .7) spawnGrain(cx + .5, (cy + .5) * ASPECT, ux / (d + .5) * rr(3, 10) * S, uy / (d + .5) * rr(3, 10) * S - rr(1, 5) * S, c); }
  }
  if (o.heat) for (let j = -ry - 1; j <= ry + 1; j++) for (let i = -rx - 1; i <= rx + 1; i++) { const d = Math.hypot(i, j * ASPECT); if (d > R && d < R + 2) addHeat(cx0 + i, cy0 + j, o.heat); }
  if (n && o.support !== false) checkSupport(x, y, R);
  return n;
}
function fill(x, y, R, mat) {
  const cx0 = Math.floor(x), cy0 = Math.floor(y / ASPECT), rx = Math.ceil(R), ry = Math.ceil(R / ASPECT); let n = 0;
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const cx = cx0 + i, cy = cy0 + j; if (cx < 0 || cy < 0 || cx >= W || cy >= H || cells[cy * W + cx] !== EMPTY) continue;
    if (Math.hypot(cx + .5 - x, (cy + .5) * ASPECT - y) > R) continue;
    setC(cx, cy, mat); n++;
  }
  return n;
}

// ---------- gravity zones ----------
// setGravity(mps2, sidewaysMps2) sets the world's pull (the second number pulls bodies and particles sideways; sand and a
// Character still fall straight down). addGravityZone({ x0, y0, x1, y1, scale: .5 | g: [gx, gy] m/s² }) changes it inside a rectangle
// (world units): bodies, characters and particles read gravityAt(x, y) → [gx, gy] units/s². A jump's launch speed is worked out
// with the world's gravity, so a jump in a low-gravity zone goes higher.
const gravityZones = [], _gz = [0, 0];
function addGravityZone(z) { gravityZones.push(z); return z; }
function clearGravityZones() { gravityZones.length = 0; }
function gravityAt(x, y) {
  _gz[0] = GX; _gz[1] = G;
  for (const z of gravityZones) if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) {
    if (z.g) { _gz[0] = z.g[0] / UNIT_M; _gz[1] = z.g[1] / UNIT_M; } else { _gz[0] = GX * (z.scale ?? 1); _gz[1] = G * (z.scale ?? 1); }
  }
  return _gz;
}

// ---------- bodies touching bodies ----------
// bodyVsBody(a, b, onHit) resolves contact between two things with hulls: a Body, or a circle { x, y, vx, vy, w, m, r }. Every hull point
// of a that is inside b (inside b's circle, or within `reach` of one of b's hull points) is pushed out along the contact normal
// with an impulse shared by both, as chunkVsBody does for a chunk. onHit(speed, p, a, b) before each closing contact: return true to
// stop. opts: { e: .2 restitution, reach: 1 (units), push: [.6, .2] (share of the overlap each side gives back) }.
function bodyVsBody(a, b, onHit, o = {}) {
  const e = o.e ?? .2, reach = o.reach ?? .9, push = o.push || [.6, .2];
  const ra = a.r ?? bodyRadius(a), rb = b.r ?? bodyRadius(b);
  if (Math.hypot(a.x - b.x, a.y - b.y) > ra + rb + reach) return;
  const c = Math.cos(a.a || 0), s = Math.sin(a.a || 0), cb = Math.cos(b.a || 0), sb = Math.sin(b.a || 0);
  const pts = a.hull || [{ x: 0, y: 0, kind: 0 }];
  for (const p of pts) {
    const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c, px = a.x + rx, py = a.y + ry;
    let ux, uy, d, lim;
    if (b.r !== undefined) { ux = px - b.x; uy = py - b.y; d = Math.hypot(ux, uy); lim = b.r; }
    else { d = 1e9; for (const q of b.hull) { const qx = b.x + q.x * cb - q.y * sb, qy = b.y + q.x * sb + q.y * cb, dd = Math.hypot(px - qx, py - qy); if (dd < d) { d = dd; ux = px - qx; uy = py - qy; } } lim = reach; }
    if (d >= lim || d < 1e-4) continue;
    const nx = ux / d, ny = uy / d, qx = px - b.x, qy = py - b.y;
    const vbx = b.vx - (b.w || 0) * qy, vby = b.vy + (b.w || 0) * qx;
    const vn = (a.vx - (a.w || 0) * ry - vbx) * nx + (a.vy + (a.w || 0) * rx - vby) * ny;
    if (vn < 0) {
      if (onHit && onHit(-vn, p, a, b)) return;
      const rn = rx * ny - ry * nx, qn = qx * ny - qy * nx, ia = a.I ? rn * rn / a.I : 0, ib = b.I ? qn * qn / b.I : 0;
      const j = -(1 + e) * vn / (1 / a.m + ia + 1 / b.m + ib);
      if (a.impulse) a.impulse(nx * j, ny * j, rx, ry); else { a.vx += nx * j / a.m; a.vy += ny * j / a.m; }
      if (b.impulse) b.impulse(-nx * j, -ny * j, qx, qy); else { b.vx -= nx * j / b.m; b.vy -= ny * j / b.m; }
      if (b.rest !== undefined) b.rest = 0; if (b.sleep) b.sleep = false;
    }
    const pen = lim - d; a.x += nx * pen * push[0]; a.y += ny * pen * push[0]; b.x -= nx * pen * push[1]; b.y -= ny * pen * push[1];
  }
}
// chunks falling into each other (off unless the game sets CHUNK_CONTACTS = true, since it changes how every structure falls)
let CHUNK_CONTACTS = false;
function stepChunkContacts() {
  const live = chunks.filter(c => !c.kin);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (Math.hypot(a.body.x - b.body.x, a.body.y - b.body.y) > a.gw + a.gh + b.gw + b.gh) continue;
    bodyVsBody(a.body, b.body, null, { reach: .8, push: [.3, .3] }); a.rest = b.rest = 0;
  }
}

// ---------- where can a character get to? ----------
// reachSearch({ x, y, opts, visit(c), bad(c), onStep(c), max }) explores the standing spots a Character with these options can
// reach from (x, y), with its real controller (walking, jumps of three heights and lengths, steering in the air, running jumps), as
// Space Mouse's level check did (and, if opts.climb, up a ladder: walk to it and hold up), and returns { spots: [{ x, y, id }], edges: [{ a, b, dir, dir2, sw, hold, n, v0, up }], count, ms }.
// `grid` (units, default 2) is how finely standing spots are told apart. visit(c) is called every step of every try (collect pickups, note the goal); bad(c) → true ends a try that died (a hazard, a pit);
// onStep(c) runs before each step (zones, tunables). The graph is also a navigation mesh: navPath(graph, from, to) →
// the edges to follow, navNearest(graph, x, y) → the closest spot. Characters need the world to be set up as in the game.
function reachSearch({ x, y, opts = {}, visit, bad, onStep, max = 40000, grid = 2 }) {
  const seen = new Map(), spots = [], edges = [], queue = [];
  const key = (cx, cy) => Math.round(cx / grid) + ',' + Math.round(cy / grid);   // states on a `grid`-unit grid (2 by default: a coarser one is faster and may miss narrow ledges)
  const add = (c, from, e) => { const k = key(c.x, c.y); if (seen.has(k)) { if (from !== undefined) edges.push({ ...e, a: from, b: seen.get(k) }); return; } const id = spots.length; seen.set(k, id); spots.push({ x: c.x, y: c.y, id }); queue.push(id); if (from !== undefined) edges.push({ ...e, a: from, b: id }); };
  const sim = (id, dir, dir2, sw, hold, n, v0 = 0, up = false) => {
    const sp = spots[id], c = new Character(sp.x, sp.y, opts); c.onGround = true; c.ground = 1; c.vx = v0;
    for (let i = 0; i < n; i++) {
      if (onStep) onStep(c);
      c.step(DT, { x: i < sw ? dir : dir2, jump: i < hold, up });
      if (visit) visit(c);
      if ((bad && bad(c)) || c.y > H * ASPECT) return;
      if (i > 2 && c.onGround) { add(c, id, { dir, dir2, sw, hold, n: i + 1, v0, up }); return; }
    }
  };
  const t0 = performance.now(), start = new Character(x, y, opts);
  for (let i = 0; i < 30; i++) { if (onStep) onStep(start); start.step(DT, {}); }
  if (visit) visit(start);
  add(start);
  let n0 = 0;
  while (queue.length && n0 < max) {
    const id = queue.shift(); n0++;
    for (const d of [-1, 1]) { sim(id, d, d, 99, 0, 8); sim(id, d, d, 99, 0, 40); }
    if (opts.climb) for (const d of [-1, 0, 1]) for (const sw of d ? [10, 24, 48] : [0]) sim(id, d, 0, sw, 0, 260, 0, true);   // up a ladder or vine: walk to it, then hold up
    for (const d of [-1, 0, 1]) for (const hold of [6, 14, 40]) {
      sim(id, d, d, 999, hold, 150);
      if (d) { sim(id, d, 0, 12, hold, 150); sim(id, d, -d, 18, hold, 150); sim(id, 0, d, 14, hold, 150); sim(id, d, d, 999, hold, 150, d * (opts.run || 0)); }
    }
  }
  return { spots, edges, count: spots.length, ms: Math.round(performance.now() - t0) };
}
function navNearest(g, x, y) {
  let best = -1, bd = 1e18;
  for (const s of g.spots) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s.id; } }
  return best;
}
// the edges (jumps and walks) from spot `from` to spot `to`, shortest in tries first; null if it cannot be reached
function navPath(g, from, to) {
  const out = new Map(); for (const e of g.edges) { if (!out.has(e.a)) out.set(e.a, []); out.get(e.a).push(e); }
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const a = q.shift();
    if (a === to) { const path = []; let k = to; while (prev.get(k)) { path.push(prev.get(k)); k = prev.get(k).a; } return path.reverse(); }
    for (const e of out.get(a) || []) if (!prev.has(e.b)) { prev.set(e.b, e); q.push(e.b); }
  }
  return null;
}
// the inputs of an edge on step i of its try (what a bot or an enemy feeds Character.step to make that jump)
const navInput = (e, i) => ({ x: i < e.sw ? e.dir : e.dir2, jump: i < e.hold, up: !!e.up });
// dots along the arc of a jump from (x, y): for the editor's overlay and for deciding whether a gap can be crossed; { dir, hold, run }
function jumpArc(x, y, opts, o = {}) {
  const c = new Character(x, y, opts), pts = [[c.x, c.y]]; c.onGround = true; c.ground = 1; if (o.run) c.vx = (o.dir || 1) * (opts.run || 0);
  for (let i = 0; i < 200; i++) { c.step(DT, { x: o.dir || 0, jump: i < (o.hold ?? 40) }); if (i % 3 === 0) pts.push([c.x, c.y]); if (i > 2 && c.onGround) break; }
  return pts;
}

// ---------- the same world at another detail level ----------
// rescaleWorld(k) resamples the grids by k (nearest cell), freezes falling chunks first, and scales entities, props, triggers, platforms,
// the camera and the particles' positions. Used by setDetail when the game has no regenerate(); the world's sizes are in units x RES.
function rescaleWorld(k) {
  if (!W || k === 1) return;
  for (let i = chunks.length - 1; i >= 0; i--) if (!chunks[i].kin) { freezeChunk(chunks[i], true); chunks.splice(i, 1); }
  const nw = Math.max(1, Math.round(W * k)), nh = Math.max(1, Math.round(H * k)), oc = cells, ob = backCells, oh = heat, ow = W, ohh = H;
  const plats = chunks.filter(c => c.kin).map(c => ({ c, oldX: c.ox, oldY: c.oy }));
  worldInitKeep(nw, nh);
  for (let y = 0; y < nh; y++) { const sy = Math.min(ohh - 1, Math.floor(y / k)); for (let x = 0; x < nw; x++) { const si = sy * ow + Math.min(ow - 1, Math.floor(x / k)), di = y * nw + x; cells[di] = oc[si]; backCells[di] = ob[si]; heat[di] = oh[si]; } }
  for (const e of entities) { e.x *= k; e.y *= k; e.w *= k; e.h *= k; e.vx *= k; e.vy *= k; if (e.char) { e.char.x = e.x; e.char.y = e.y; e.char.vx = e.vx; e.char.vy = e.vy; Object.assign(e.char.o, { w: e.w, h: e.h }); for (const key of CHAR_SCALED) if (typeof e.char.o[key] === 'number' && key !== 'w' && key !== 'h') e.char.o[key] *= k; } }
  for (const p of PROPS) { p.x *= k; p.y *= k; }
  for (const t of triggers) { t.x *= k; t.y *= k; t.w *= k; t.h *= k; }
  for (const z of gravityZones) { z.x0 *= k; z.x1 *= k; z.y0 *= k; z.y1 *= k; }
  for (const { c } of plats) {
    const gw = Math.max(1, Math.round(c.gw * k)), gh = Math.max(1, Math.round(c.gh * k)), g = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = c.grid[Math.min(c.gh - 1, Math.floor(y / k)) * c.gw + Math.min(c.gw - 1, Math.floor(x / k))];
    c.ox = Math.round(c.ox * k); c.oy = Math.round(c.oy * k); c.gw = gw; c.gh = gh; c.grid = g; c.n = g.reduce((s, m) => s + (m ? 1 : 0), 0);
    c.X0 = c.ox + gw / 2; c.Y0 = (c.oy + gh / 2) * ASPECT; c.path = c.path.map(p => [p[0] * k, p[1] * k]); c.lx *= k; c.ly *= k; c.speed *= 1; c.offX = Math.round(c.lx); c.offY = Math.round(c.ly);
    c.body.x = c.X0 + c.offX; c.body.y = c.Y0 + c.offY * ASPECT; chunks.push(c);
  }
  cam.x *= k; cam.y *= k;
}
// worldInit that keeps what lives in the world (entities, props, triggers, platforms): only the grids are replaced
function worldInitKeep(w, h) {
  const ents = entities.slice(), pr = PROPS.slice(), tr = triggers.slice(), tm = TIMERS.slice(), tw = TWEENS.slice(), mn = mounts.slice();
  worldInit(w, h);
  entities.push(...ents); PROPS.push(...pr); triggers.push(...tr); TIMERS.push(...tm); TWEENS.push(...tw); mounts.push(...mn);   // platforms are put back by the caller, resized
}
