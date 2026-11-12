// ===================== ENGINE · ropes, a grappling hook, ghosts and echoes, rewind =====================

// ---------- drawing a line of pixels ----------
// drawLine(x0, y0, x1, y1, r, g, b): the cells between two world points (x in cells, y in units), in light units (like putEmit)
function drawLine(x0, y0, x1, y1, r, g, b) {
  let cx = Math.floor(x0), cy = Math.floor(y0 / ASPECT); const ex = Math.floor(x1), ey = Math.floor(y1 / ASPECT);
  const dx = Math.abs(ex - cx), dy = -Math.abs(ey - cy), sx = cx < ex ? 1 : -1, sy = cy < ey ? 1 : -1; let err = dx + dy;
  for (let n = 0; n < 4000; n++) {
    putEmit(cx, cy, SOLID, r, g, b);
    if (cx === ex && cy === ey) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; cx += sx; } if (e2 <= dx) { err += dx; cy += sy; }
  }
}

// ---------- verlet ropes and chains ----------
//   const rope = new Rope(ax, ay, bx, by, 14, { slack: .05, pinA: true, pinB: true, maxTension: 2.5, collide: true });
//   rope.a = [x, y] | () => [x, y] | an object with x, y    the end it hangs from (pinA / pinB false: that end is free)
//   rope.step(dt) every step; rope.draw(r, g, b) in GAME.draw (or drawRope); rope.cut(i) cuts link i
// Points are point masses with distance constraints; they collide with the grid (not with chunks), so a rope hangs across a gap, lies on a
// ledge and swings. `maxTension`: when a link is stretched to that many times its length it snaps there, and the two halves whip away
// (rope.snapped lists the cut links, rope.onSnap(i) is called). Use it for rope bridges, chains, tow cables, pendulums, lamps on wires.
class Rope {
  constructor(ax, ay, bx, by, n = 12, o = {}) {
    this.n = n; this.o = { slack: .04, iter: 8, gravity: 1, damp: .995, collide: true, pinA: true, pinB: true, maxTension: 0, ...o };
    this.x = new Float32Array(n + 1); this.y = new Float32Array(n + 1); this.px = new Float32Array(n + 1); this.py = new Float32Array(n + 1);
    this.link = new Uint8Array(n).fill(1); this.snapped = []; this.onSnap = o.onSnap || null;
    const d = Math.hypot(bx - ax, by - ay); this.seg = d / n * (1 + this.o.slack) + .01;
    for (let i = 0; i <= n; i++) { const t = i / n; this.x[i] = this.px[i] = ax + (bx - ax) * t; this.y[i] = this.py[i] = ay + (by - ay) * t + Math.sin(t * Math.PI) * d * this.o.slack * 2; }
    this.a = [ax, ay]; this.b = [bx, by];
  }
  end(e) { return typeof e === 'function' ? e() : Array.isArray(e) ? e : [e.x, e.y]; }
  cut(i) { if (this.link[i]) { this.link[i] = 0; this.snapped.push(i); if (this.onSnap) this.onSnap(i); } }
  step(dt) {
    const n = this.n, o = this.o, g = G * o.gravity * dt * dt;
    for (let i = 0; i <= n; i++) {
      if ((i === 0 && o.pinA) || (i === n && o.pinB)) continue;
      const vx = (this.x[i] - this.px[i]) * o.damp, vy = (this.y[i] - this.py[i]) * o.damp;
      this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.x[i] += vx; this.y[i] += vy + g;
    }
    for (let it = 0; it < o.iter; it++) {
      if (o.pinA) { const a = this.end(this.a); this.x[0] = a[0]; this.y[0] = a[1]; }
      if (o.pinB) { const b = this.end(this.b); this.x[n] = b[0]; this.y[n] = b[1]; }
      for (let i = 0; i < n; i++) {
        if (!this.link[i]) continue;
        let dx = this.x[i + 1] - this.x[i], dy = this.y[i + 1] - this.y[i], d = Math.hypot(dx, dy) || 1e-6;
        if (o.maxTension && it === 0 && d > this.seg * o.maxTension) { this.cut(i); continue; }
        const k = (d - this.seg) / d * .5, mx = dx * k, my = dy * k, fa = i === 0 && o.pinA, fb = i + 1 === n && o.pinB;
        if (!fa) { this.x[i] += mx * (fb ? 2 : 1); this.y[i] += my * (fb ? 2 : 1); }
        if (!fb) { this.x[i + 1] -= mx * (fa ? 2 : 1); this.y[i + 1] -= my * (fa ? 2 : 1); }
      }
      if (o.collide) for (let i = 0; i <= n; i++) {
        if ((i === 0 && o.pinA) || (i === n && o.pinB)) continue;
        if (solidU(this.x[i], this.y[i])) { this.x[i] = this.px[i]; this.y[i] = this.py[i]; if (solidU(this.x[i], this.y[i])) this.y[i] -= 1; }
      }
    }
  }
  draw(r = 1.1, g = .8, b = .5) { for (let i = 0; i < this.n; i++) if (this.link[i]) drawLine(this.x[i], this.y[i], this.x[i + 1], this.y[i + 1], r, g, b); }
}

// ---------- a grappling hook for a Character ----------
//   const hook = new Grapple(hero, { range: 90 * RES, rip: 0 });
//   hook.fire(dx, dy)          shoot along (dx, dy) from the hero's middle; it catches the first solid cell within range (true if it did)
//   hero.step(dt, { ...input, rope: hook.rope })      pass hook.rope while attached (null when not): the Character hangs and swings from it
//   hook.reel(dir, dt)         dir -1 shortens the rope (up), 1 lets it out;  hook.release();  hook.draw()
// The rope is a limit on the distance from the anchor: a Character that swings beyond it is pulled back to the circle and loses the outward part of its
// velocity, so it swings like a pendulum (hold left / right to pump it). The hook lets go when its anchor cell is gone (a blast, a dig) and, with `rip` > 0,
// when it hangs from a material tougher-than-nothing but weaker than `rip` under a hard pull: the cell is torn out (a grain) and the hero falls.
class Grapple {
  constructor(char, o = {}) { this.char = char; this.o = { range: 90 * RES, rip: 0, reel: 30 * RES, minLen: 6 * RES, ...o }; this.rope = null; this.cell = null; }
  fire(dx, dy) {
    const c = this.char, x = c.x, y = c.y - c.o.h * .6, hit = raycast(x, y, dx, dy, this.o.range, { through: m => !!MAT_CLIMB[m] });
    if (!hit || !hit.cell) { this.rope = null; return false; }
    this.cell = hit.cell; this.mat = hit.material; this.rope = { x: hit.x - hit.nx * .01, y: hit.y - hit.ny * .01, len: Math.max(this.o.minLen, Math.hypot(hit.x - x, hit.y - y)) };
    return true;
  }
  reel(dir, dt) { if (this.rope) this.rope.len = clamp(this.rope.len + dir * this.o.reel * dt, this.o.minLen, this.o.range); }
  release() { this.rope = null; this.cell = null; }
  // call every step before the character's: lets go of an anchor that is gone or torn out
  update() {
    if (!this.rope) return;
    if (getC(this.cell[0], this.cell[1]) === EMPTY) { this.release(); return; }
    if (this.o.rip && MAT_TOUGH[this.mat] < this.o.rip) {
      const c = this.char, rx = c.x - this.rope.x, ry = c.y - c.o.h * .6 - this.rope.y, d = Math.hypot(rx, ry) || 1, pull = Math.max(0, (c.vx * rx + c.vy * ry) / d);
      if (d >= this.rope.len - .5 && pull > 22 * RES * (1 + MAT_TOUGH[this.mat])) { const [cx, cy] = this.cell, m = getC(cx, cy), cm = crumbOf(m); setC(cx, cy, EMPTY); if (cm) spawnGrain(cx + .5, (cy + .5) * ASPECT, 0, -3 * RES, cm); this.release(); }
    }
  }
  draw(r = 1.2, g = 1.1, b = .9) { if (this.rope) drawLine(this.char.x, this.char.y - this.char.o.h * .6, this.rope.x, this.rope.y, r, g, b); }
}

// ---------- ghosts and echoes ----------
// A GhostRecorder keeps where a target (a Character, an entity: x, y, facing) was every step; spawnGhost replays such a recording as an entity that
// touches nothing. A ghost racer is your best run replayed beside you (keep the recording with Pixelite.save); an echo is the same recording played
// `delay` seconds behind you while you still run: the shadow of your own past path, which can be made to hurt.
//   const rec = new GhostRecorder(hero);  rec.step() every step;  rec.frames → [[x, y, facing, tag], ...]
//   const g = spawnGhost(rec.frames, { anim: e => sprite, tint: [.5, .7, 1], loop: false, onEnd(e) {} })
//   const echo = spawnEcho(hero, 10, { anim, tint, touches: ['hero'], onTouch(e, other) {} })    10 seconds behind
class GhostRecorder {
  constructor(target, o = {}) { this.target = target; this.frames = []; this.max = o.max || 60 * 60 * 20; }
  step(tag) { const t = this.target; if (this.frames.length < this.max) this.frames.push([+t.x.toFixed(2), +t.y.toFixed(2), t.facing || 1, tag || t.tag || '']); }
  reset() { this.frames.length = 0; }
}
defineEntity('ghost', {
  size: [4, 6], always: true, anchor: 'feet',
  anim: e => typeof e.look === 'function' ? e.look(e) : e.look,
  update(e) {
    const f = e.delaySrc ? e.delaySrc.frames : e.frames, i = e.delaySrc ? Math.max(0, e.delaySrc.frames.length - 1 - e.delay) : e.i;
    if (e.delaySrc) { if (e.delaySrc.frames.length <= e.delay) { e.hidden = true; return; } e.hidden = false; }
    else if (e.i >= f.length) { if (e.loop) e.i = 0; else { if (e.onEnd) e.onEnd(e); e.dead = true; return; } }
    const fr = f[e.delaySrc ? i : e.i]; e.x = fr[0]; e.y = fr[1]; e.facing = fr[2]; e.tag = fr[3]; if (!e.delaySrc) e.i++;
  },
  draw(e, t) {
    if (e.hidden) return; const spr = typeof e.look === 'function' ? e.look(e) : e.look; if (spr) drawSprite(spr, e.x, e.y, 0, { flip: e.facing < 0, tint: e.tint, light: false });
  }
});
function spawnGhost(frames, o = {}) {
  const f = frames[0] || [0, 0, 1, ''];
  return spawn('ghost', f[0], f[1], { frames, i: 0, look: o.anim || o.sprite, tint: o.tint || [.45, .65, 1], loop: !!o.loop, onEnd: o.onEnd, w: (o.size ? o.size[0] : 4) * RES, h: (o.size ? o.size[1] : 6) * RES });
}
function spawnEcho(target, delaySec, o = {}) {
  const rec = new GhostRecorder(target), e = spawn('ghost', target.x, target.y, { frames: [], i: 0, delaySrc: rec, delay: Math.round(delaySec * 60), look: o.anim || o.sprite, tint: o.tint || [.6, .35, .9], hidden: true, w: (o.size ? o.size[0] : 4) * RES, h: (o.size ? o.size[1] : 6) * RES });
  e.rec = rec; e.def = { ...e.def, touches: o.touches || [], onTouch: o.onTouch, update: e.def.update, draw: e.def.draw, anim: e.def.anim };
  return e;   // the game calls e.rec.step() every step (the echo plays what it recorded `delay` steps ago)
}

// ---------- rewind ----------
// Rewind.start({ seconds: 10, every: 6, action: 'rewind' }) keeps a snapshot of the world every `every` steps (cells, back wall, entities with their
// plain fields and Characters, moving platforms, falling chunks) for the last `seconds`; while the action is held the engine steps BACK one snapshot per
// step (about six game seconds per second at the default), then play goes on from there. The grid is copied whole (a snapshot of a 900 x 200 world is
// 350 KB), not kept as changes; heat, particles, timers and the game's own variables are not kept: put what must survive in entity fields
// or in Rewind.keep = { save() → state, load(state) }. Rewind.hold(on) does the same from code; Rewind.rewinding is true while it runs.
const Rewind = {
  on: false, snaps: [], every: 6, max: 100, action: null, holding: false, rewinding: false, keep: null,
  start(o = {}) { this.on = true; this.every = o.every || 6; this.max = Math.max(2, Math.round((o.seconds || 10) * 60 / this.every)); this.action = o.action || null; this.snaps.length = 0; },
  stop() { this.on = false; this.snaps.length = 0; this.rewinding = false; },
  hold(on) { this.holding = !!on; },
  snapshot() {
    const ents = [];
    for (const e of entities) {
      if (e.dead) continue;
      const f = {}; for (const k in e) { const v = e[k]; if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || (Array.isArray(v) && v.length < 8 && v.every(q => typeof q === 'number'))) f[k] = Array.isArray(v) ? v.slice() : v; }
      let c = null; if (e.char) { c = {}; for (const k in e.char) { const v = e.char[k]; if (typeof v === 'number' || typeof v === 'boolean') c[k] = v; } }
      ents.push([e, f, c]);
    }
    const plats = chunks.filter(ch => ch.kin).map(ch => [ch, { offX: ch.offX, offY: ch.offY, lx: ch.lx, ly: ch.ly, ti: ch.ti, dir: ch.dir, waitT: ch.waitT, arrived: ch.arrived, bx: ch.body.x, by: ch.body.y }]);
    const falling = chunks.filter(ch => !ch.kin).map(ch => ({ ...ch, grid: ch.grid.slice(), b: { x: ch.body.x, y: ch.body.y, vx: ch.body.vx, vy: ch.body.vy, a: ch.body.a, w: ch.body.w, m: ch.body.m, I: ch.body.I } }));
    this.snaps.push({ cells: cells.slice(), back: backCells.slice(), ents, plats, falling, user: this.keep ? this.keep.save() : null, rnd: _rndState });
    if (this.snaps.length > this.max) this.snaps.shift();
  },
  // put the world back as the last snapshot had it (and drop it, so the next step goes further back)
  pop() {
    const s = this.snaps.length > 1 ? this.snaps.pop() : this.snaps[0]; if (!s) return false;
    cells.set(s.cells); backCells.set(s.back); worldChanged(); awake.fill(1); P.n = 0;   // (worldChanged: the lamp cache and the still frame hear of a world written by hand)
    entities.length = 0;
    for (const [e, f, c] of s.ents) {
      for (const k in e) if (!(k in f) && (e[k] === null || typeof e[k] === 'number' || typeof e[k] === 'string' || typeof e[k] === 'boolean')) delete e[k];
      Object.assign(e, f); e.dead = false; if (c && e.char) Object.assign(e.char, c); entities.push(e);
    }
    const kin = chunks.filter(ch => ch.kin); chunks = [...kin];
    for (const [ch, p] of s.plats) { Object.assign(ch, { offX: p.offX, offY: p.offY, lx: p.lx, ly: p.ly, ti: p.ti, dir: p.dir, waitT: p.waitT, arrived: p.arrived, dx: 0, dy: 0 }); ch.body.x = p.bx; ch.body.y = p.by; if (!chunks.includes(ch)) chunks.push(ch); }
    for (const f of s.falling) { const { b, ...ch } = f; ch.grid = f.grid.slice(); const body = new Body(b.x, b.y, b.m, b.I, []); Object.assign(body, { vx: b.vx, vy: b.vy, a: b.a, w: b.w }); ch.body = body; body.hull = chunkHull(ch); chunks.push(ch); }
    if (this.keep && s.user !== null) this.keep.load(s.user);
    _hashAt = -1; _rndState = s.rnd; return true;
  }
};
// once per step, first: snapshots while playing, steps back while the action is held (returns true: this step was a rewind step)
function stepRewind() {
  if (!Rewind.on) return false;
  const want = Rewind.holding || (Rewind.action && action(Rewind.action) > .5);
  if (want && Rewind.snaps.length > 1) { Rewind.rewinding = true; Rewind.pop(); return true; }
  Rewind.rewinding = false;
  if (frameNo % Rewind.every === 0) Rewind.snapshot();
  return false;
}
