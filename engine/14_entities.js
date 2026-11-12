// ===================== ENGINE · entities, timers and steering =====================
// The layer between "a grid and some hooks" and "a game": things that live in the world, step, draw, glow, collide and go away.
//   defineEntity('slime', {
//     size: [6, 4],                         // w, h in base units (x RES at spawn); x is the middle, y the feet, like a Character
//     sprite: SLIME_SPR,                    // a sprite, or e => sprite (an animation frame); anchor: 'feet' | 'centre' (default 'centre')
//     character: { run: 12, jump: 10 },     // optional: a Character is made for it (sizes in base units); set e.input = { x, jump } in update
//     props: { hp: 3 },                     // default fields of every one spawned
//     touches: ['player'],                  // types whose overlap calls onTouch(e, other) every step
//     always: true,                         // keep updating off screen (default: entities more than 2 screens away sleep)
//     front: true,                          // drawn in the front pass, after the game's draw hook (grass, a foreground pillar the hero walks behind)
//     init(e) {}, update(e, dt) {}, draw(e, t) {}, lights(e, t, out) {}, onTouch(e, other) {}, onLeave(e) {}
//   });
//   const e = spawn('slime', x, y, { hp: 5 });   e.dead = true removes it at the end of the step.
// The engine steps, culls, draws (before the game's draw hook), marks sprites as shadow casters and collects lights for them.
// Queries: near(x, y, r, type?) and overlapping(e, type?) over a uniform hash; entities are in probe() by type.
const entities = [], ENTITY_TYPES = {};
const ENTITY_KEYS = ['size', 'sprite', 'anim', 'anchor', 'flip', 'character', 'props', 'touches', 'always', 'sleep', 'tint', 'front', 'init', 'update', 'draw', 'lights', 'onTouch', 'onLeave'];
// Character options that are lengths or speeds: given in base units, scaled by RES
const CHAR_SCALED = ['w', 'h', 'run', 'jump', 'step', 'climb', 'bounceMin', 'fallMax', 'wallSlide', 'gravity', 'swimSpeed', 'swimRise', 'sink'];
function scaleCharOpts(o) {
  const r = { ...o };
  for (const k of CHAR_SCALED) if (typeof r[k] === 'number') r[k] *= RES;
  if (r.wallJump) r.wallJump = [r.wallJump[0] * RES, r.wallJump[1] * RES];
  return r;
}
function defineEntity(name, def = {}) {
  devKeys(`defineEntity('${name}')`, def, ENTITY_KEYS);
  ENTITY_TYPES[name] = { name, size: [4, 4], ...def };
  return name;
}
let _hash = new Map(), _hashAt = -1;
const entHashSize = () => 24 * RES;
function hashBuild() {
  _hash.clear(); _hashAt = frameNo; const s = entHashSize();
  for (const e of entities) {
    if (e.dead) continue;
    const c0 = Math.floor((e.x - e.w / 2) / s), c1 = Math.floor((e.x + e.w / 2) / s), r0 = Math.floor((e.y - e.h) / s), r1 = Math.floor(e.y / s);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = c + r * 65536; let a = _hash.get(k); if (!a) _hash.set(k, a = []); a.push(e); }
  }
}
function spawn(type, x, y, props = {}) {
  const d = ENTITY_TYPES[type];
  if (!d) throw new Error(`spawn('${type}'): no such entity type${devNear(type, Object.keys(ENTITY_TYPES)) ? ` (did you mean '${devNear(type, Object.keys(ENTITY_TYPES))}'?)` : ''}; defineEntity it first`);
  if (DEV) devFinite(`spawn('${type}')`, x, y);
  const e = { type, def: d, x, y, vx: 0, vy: 0, w: d.size[0] * RES, h: d.size[1] * RES, dead: false, age: 0, facing: 1, asleep: false, ...(d.props ? structuredClone(d.props) : {}), ...props };
  if (d.character) e.char = new Character(x, y, { w: e.w, h: e.h, ...scaleCharOpts(d.character) });
  entities.push(e); _hashAt = -1;
  if (d.init) d.init(e);
  return e;
}
const entityBox = e => [e.x - e.w / 2, e.y - e.h, e.x + e.w / 2, e.y];
function near(x, y, r, type) {
  if (_hashAt !== frameNo) hashBuild();
  const s = entHashSize(), out = [], seen = new Set();
  for (let rr2 = Math.floor((y - r) / s); rr2 <= Math.floor((y + r) / s); rr2++) for (let c = Math.floor((x - r) / s); c <= Math.floor((x + r) / s); c++) {
    const a = _hash.get(c + rr2 * 65536); if (!a) continue;
    for (const e of a) { if (e.dead || seen.has(e) || (type && e.type !== type)) continue; seen.add(e); if (Math.hypot(e.x - x, e.y - e.h / 2 - y) <= r + Math.max(e.w, e.h) / 2) out.push(e); }
  }
  return out;
}
function overlapping(e, type) {
  const [x0, y0, x1, y1] = entityBox(e), out = [];
  for (const o of near(e.x, e.y - e.h / 2, Math.max(e.w, e.h) + 2 * RES, type)) {
    if (o === e) continue;
    if (o.x - o.w / 2 < x1 && o.x + o.w / 2 > x0 && o.y - o.h < y1 && o.y > y0) out.push(o);
  }
  return out;
}
function clearEntities() { for (const e of entities) if (!e.dead && e.def.onLeave) e.def.onLeave(e); entities.length = 0; _hashAt = -1; }
const entityCounts = () => { const c = {}; for (const e of entities) if (!e.dead) c[e.type] = (c[e.type] || 0) + 1; return c; };
// the state of every entity that has an fsm (see fsm()), for probe()
const entityStates = () => entities.filter(e => e.fsm && !e.dead).slice(0, 24).map(e => `${e.type}:${e.fsm.state}`);

function stepEntities(dt) {
  if (!entities.length) return;
  hashBuild();
  const cx = cam.x + R.cols / 2, cy = cam.y + R.rows * ASPECT / 2, screen = Math.max(R.cols, R.rows * ASPECT);
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i], d = e.def; if (e.dead) continue;
    e.asleep = !e.always && !d.always && Math.hypot(e.x - cx, e.y - cy) > (d.sleep ?? 2) * screen;
    if (e.asleep) continue;
    e.age += dt;
    if (d.update) d.update(e, dt);
    if (e.char) { e.char.step(dt, e.input || {}); e.x = e.char.x; e.y = e.char.y; e.vx = e.char.vx; e.vy = e.char.vy; e.facing = e.char.facing; }
  }
  for (const e of entities) {
    const d = e.def; if (e.dead || e.asleep || !d.touches || !d.onTouch) continue;
    for (const t of d.touches) for (const o of overlapping(e, t)) if (!o.dead) d.onTouch(e, o);
  }
  for (let i = entities.length - 1; i >= 0; i--) { const e = entities[i]; if (e.dead) { if (e.def.onLeave) e.def.onLeave(e); entities.splice(i, 1); } }
}
const entityOnScreen = e => e.x + e.w >= cam.x && e.x - e.w <= cam.x + R.cols && (e.y + e.h) >= cam.y && (e.y - 2 * e.h) <= cam.y + R.rows * ASPECT;
const entitySprite = e => { const d = e.def, s = d.anim ? d.anim(e) : d.sprite; return typeof s === 'function' ? s(e) : s; };
function entityDrawOpts(e) {
  const d = e.def, o = { flip: d.flip ? d.flip(e) : e.facing < 0 };
  if (e.tint) o.tint = e.tint; if (e.flash) o.flash = e.flash; if (e.palette) o.palette = e.palette;
  return o;
}
// front: the front pass (entities defined with front: true, drawn after the game's draw hook) or the ordinary one
function drawEntities(t, front = false) {
  for (const e of entities) {
    if (e.dead || e.asleep || !entityOnScreen(e) || !!e.def.front !== front) continue;
    const d = e.def;
    if (d.draw) d.draw(e, t);
    else { const spr = entitySprite(e); if (spr) drawSprite(spr, e.x, d.anchor === 'feet' ? e.y : e.y - e.h / 2, 0, entityDrawOpts(e)); }
  }
}
function markEntitiesDyn() {
  let top = 1e9;
  for (const e of entities) {
    if (e.dead || e.asleep || !entityOnScreen(e)) continue;
    const spr = entitySprite(e); if (!spr) continue;   // an entity with a sprite or anim casts a shadow even if it draws itself
    top = Math.min(top, markSpriteDyn(spr, e.x, e.def.anchor === 'feet' ? e.y : e.y - e.h / 2, 0, entityDrawOpts(e)));
  }
  return top;
}
function entityLights(t, out) { for (const e of entities) if (!e.dead && !e.asleep && e.def.lights && entityOnScreen(e)) e.def.lights(e, t, out); }

// ---------- timers and tweens, on the simulation clock (pause stops them, a replay repeats them) ----------
//   after(2, () => spawn(...))          once, in 2 s;   every(.5, fn)   repeatedly;   both return { cancel() }
//   tween(obj, { x: 100, alpha: 0 }, 1.5, 'inout', done)    eases the fields to the targets; ease: linear | in | out | inout | back | bounce | fn(t)
const TIMERS = [], TWEENS = [];
const EASE = {
  linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inout: t => t < .5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t),
  back: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  bounce: t => { const n = 7.5625, d = 2.75; return t < 1 / d ? n * t * t : t < 2 / d ? n * (t -= 1.5 / d) * t + .75 : t < 2.5 / d ? n * (t -= 2.25 / d) * t + .9375 : n * (t -= 2.625 / d) * t + .984375; }
};
function after(sec, fn) { const t = { t: sec, fn, every: 0, dead: false, cancel() { this.dead = true; } }; TIMERS.push(t); return t; }
function every(sec, fn) { const t = { t: sec, fn, every: sec, dead: false, cancel() { this.dead = true; } }; TIMERS.push(t); return t; }
function tween(obj, to, sec, ease = 'out', done) {
  const tw = { obj, from: {}, to, t: 0, sec: Math.max(1e-6, sec), ease: typeof ease === 'function' ? ease : EASE[ease] || EASE.out, done, dead: false, cancel() { this.dead = true; } };
  for (const k in to) tw.from[k] = obj[k];
  TWEENS.push(tw); return tw;
}
function clearTimers() { TIMERS.length = 0; TWEENS.length = 0; }
function stepTimers(dt) {
  for (let i = 0, n = TIMERS.length; i < n; i++) { const t = TIMERS[i]; if (t.dead) continue; t.t -= dt; if (t.t <= 0) { t.fn(); if (t.every) t.t += t.every; else t.dead = true; } }
  for (let i = 0, n = TWEENS.length; i < n; i++) {
    const tw = TWEENS[i]; if (tw.dead) continue;
    tw.t = Math.min(tw.sec, tw.t + dt); const k = tw.ease(tw.t / tw.sec);
    for (const f in tw.to) tw.obj[f] = tw.from[f] + (tw.to[f] - tw.from[f]) * k;
    if (tw.t >= tw.sec) { tw.dead = true; if (tw.done) tw.done(tw.obj); }
  }
  for (let i = TIMERS.length - 1; i >= 0; i--) if (TIMERS[i].dead) TIMERS.splice(i, 1);
  for (let i = TWEENS.length - 1; i >= 0; i--) if (TWEENS[i].dead) TWEENS.splice(i, 1);
}

// ---------- state machines ----------
// A small one per entity (or per anything): fsm({ idle: { enter(e), update(e, dt, f), exit(e), to: { chase: e => e.sees } }, chase: {...} }, 'idle')
// f.update(e, dt) runs the current state and takes the first transition whose test is true; f.state names it, f.t the seconds in it;
// an entity with e.fsm shows its state in probe().
function fsm(def, initial) {
  const f = {
    def, state: initial || Object.keys(def)[0], t: 0,
    set(s, e) { const was = def[f.state]; if (was && was.exit) was.exit(e, f); f.state = s; f.t = 0; const now = def[s]; if (now && now.enter) now.enter(e, f); },
    update(e, dt) {
      f.t += dt; const st = def[f.state]; if (!st) return;
      if (st.update) st.update(e, dt, f);
      if (st.to) for (const k in st.to) if (st.to[k](e, f)) { f.set(k, e); break; }
    }
  };
  return f;
}
// The game's own states (the engine's `state`): Pixelite.states({ title: { enter(prev), update(dt), hud(t), draw(t), exit(next) }, play: {...} })
let STATES = null;
function useStates(map) { STATES = map; const s = map[state]; if (s && s.enter) s.enter(null); }

// ---------- steering and path finding ----------
function seek(e, tx, ty, accel, dt, max) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 1e-6) return;
  e.vx += dx / d * accel * dt; e.vy += dy / d * accel * dt;
  if (max) { const v = Math.hypot(e.vx, e.vy); if (v > max) { e.vx *= max / v; e.vy *= max / v; } }
}
const flee = (e, tx, ty, accel, dt, max) => seek(e, 2 * e.x - tx, 2 * e.y - ty, accel, dt, max);
function wander(e, accel, dt, turn = 3) {
  e.wanderA = (e.wanderA ?? rnd() * 6.283) + (rnd() - .5) * turn * dt * 6;
  e.vx += Math.cos(e.wanderA) * accel * dt; e.vy += Math.sin(e.wanderA) * accel * dt;
}
// A* over a w x h tile grid: eight ways, no cutting corners. passable(i, j) → bool; goal: [i, j] or a predicate (i, j) → bool;
// opts: { cost(i, j) → >= 1 extra cost of entering a tile, max: most tiles to look at (default 4000), diag: false for four ways }.
// Returns the tiles from the start (excluded) to the goal, or null.
function findTilePath(w, h, passable, si, sj, goal, opts = {}) {
  const isGoal = typeof goal === 'function' ? goal : (i, j) => i === goal[0] && j === goal[1], hx = typeof goal === 'function' ? null : goal;
  const max = opts.max || 4000, diag = opts.diag !== false, cost = opts.cost, N = w * h;
  const from = new Int32Array(N).fill(-1), best = new Float32Array(N).fill(1e9), heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const s = sj * w + si; best[s] = 0; from[s] = s; push(s, 0);
  let seen = 0;
  const DIRS = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (heap.length && seen++ < max) {
    const [, k] = pop(), i = k % w, j = (k / w) | 0;
    if (isGoal(i, j)) { const out = []; let q = k; while (from[q] !== q) { out.push([q % w, (q / w) | 0]); q = from[q]; } return out.reverse(); }
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h || !passable(ni, nj) || (di && dj && (!passable(i + di, j) || !passable(i, j + dj)))) continue;
      const nk = nj * w + ni, nc = best[k] + (di && dj ? 1.414 : 1) + (cost ? cost(ni, nj) - 1 : 0);
      if (nc < best[nk]) { best[nk] = nc; from[nk] = k; push(nk, nc + (hx ? Math.hypot(hx[0] - ni, hx[1] - nj) : 0)); }
    }
  }
  return null;
}
