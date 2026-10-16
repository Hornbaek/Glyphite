// ===================== ENGINE · rigid bodies =====================
// Impulse-based contact against the voxel grid. Hull = sample points in local space (y down,
// origin at the centre of mass); kind 0 = structure, 1 = foot (friction from the material it
// stands on), 2 = strut side. The kinds only change friction here; games read them from hits.
class Body {
  constructor(x, y, mass, inertia, hull) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.a = 0; this.w = 0;
    this.m = mass; this.I = inertia; this.hull = hull;
    this.fx = 0; this.fy = 0; this.tq = 0;
    this.hits = []; this.feetDown = 0; this.bodyDown = 0;
  }
  toWorld(lx, ly, out) { const c = Math.cos(this.a), s = Math.sin(this.a); out[0] = this.x + lx * c - ly * s; out[1] = this.y + lx * s + ly * c; return out; }
  dirWorld(lx, ly, out) { const c = Math.cos(this.a), s = Math.sin(this.a); out[0] = lx * c - ly * s; out[1] = lx * s + ly * c; return out; }
  impulse(jx, jy, rx, ry) { this.vx += jx / this.m; this.vy += jy / this.m; this.w += (rx * jy - ry * jx) / this.I; }
  step(dt) {
    this.vx += this.fx / this.m * dt; this.vy += (this.fy / this.m + G) * dt; this.w += this.tq / this.I * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.a += this.w * dt;
    if (this.a > Math.PI) this.a -= 2 * Math.PI; else if (this.a < -Math.PI) this.a += 2 * Math.PI;
    this.collide();
  }
  collide() {
    const c = Math.cos(this.a), s = Math.sin(this.a), hull = this.hull, n = [0, 0], SKIN = .3;
    this.hits.length = 0; this.feetDown = 0; this.bodyDown = 0;
    const act = [];
    for (const p of hull) {
      const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c, px = this.x + rx, py = this.y + ry;
      const inside = solidU(px, py);
      if (!inside && !solidU(px, py + SKIN)) continue;          // resting contacts count within a thin skin
      normalAt(px, inside ? py : py + SKIN, n);
      let pen = 0; if (inside) while (pen < 5 && solidU(px + n[0] * pen, py + n[1] * pen)) pen += .1;
      act.push({ p, rx, ry, nx: n[0], ny: n[1], pen, mat: matU(px, inside ? py : py + SKIN), px, py });
    }
    if (!act.length) return;
    for (let it = 0; it < 4; it++) {
      for (const k of act) {
        const { rx, ry, nx, ny } = k;
        const vpx = this.vx - this.w * ry, vpy = this.vy + this.w * rx;
        const vn = vpx * nx + vpy * ny;
        if (it === 0) {
          this.hits.push({ kind: k.p.kind, p: k.p, vn: -vn, mat: k.mat, x: k.px, y: k.py, nx, ny });
          if (k.p.kind === 1) this.feetDown++; else this.bodyDown++;
        }
        if (vn >= 0) continue;
        const rn = rx * ny - ry * nx, kn = 1 / this.m + rn * rn / this.I;
        const e = it === 0 && vn < -4 * RES ? .22 : 0;
        const j = -(1 + e) * vn / kn;
        this.impulse(nx * j, ny * j, rx, ry);
        const tx = -ny, ty = nx;
        const vt = (this.vx - this.w * ry) * tx + (this.vy + this.w * rx) * ty;
        const rt = rx * ty - ry * tx, kt = 1 / this.m + rt * rt / this.I;
        const mu = k.p.kind === 1 ? MAT_FRIC[k.mat] : .45;
        const jt = clamp(-vt / kt, -mu * j, mu * j);
        this.impulse(tx * jt, ty * jt, rx, ry);
      }
    }
    // positional correction, shared between contacts
    let cx = 0, cy = 0, np = 0;
    for (const k of act) if (k.pen > .05) { const d = (k.pen - .05) * .8; cx += k.nx * d; cy += k.ny * d; np++; }
    if (np) { this.x += cx / np; this.y += cy / np; }
  }
}

// ===================== ENGINE · characters: walking and jumping on the grid =====================
// A Character is an upright box that moves through the voxel world the way a platformer hero does. Every slope in a voxel
// world is a staircase, so it walks up bumps of about one row and sticks to the ground walking down them. It jumps with
// coyote time (a moment after running off a ledge still counts), a jump buffer (a press just before landing still counts)
// and a variable height (letting go early cuts the jump short), falls faster than it rises, can slide down walls and jump
// off them, lands on oneWay materials from above (holding `down` drops through them), and stands on falling chunks.
// Position is the middle of the feet: x in cells, y in units (row × ASPECT), like a Body. Sizes and speeds are in units:
// author them in base units × RES.
//   const hero = new Character(x, y, { w: 4 * RES, h: 6 * RES, run: 30 * RES, jump: 14 * RES });
//   hero.step(dt, { x: -1..1, jump: held, down: held });     // every fixed step
// After a step: onGround, ground (material under the feet, 0 in the air), wall (-1 / 1: airborne against a wall on that
// side), facing (-1 / 1), and what happened this step: jumped, wallJumped, landed (impact speed, units/s, else 0), bumped
// (hit its head). Options are in hero.o (defaults below) and can be changed at any time.
function charDefaults() {
  const S = RES;
  return {
    w: 4 * S, h: 6 * S,               // the box (units)
    run: 28 * S,                      // top running speed (units/s)
    accelT: .09, stopT: .06,          // seconds from standing to top speed, and back to standing (also to turn round)
    air: .75,                         // air control: acceleration in the air as a fraction of the ground's
    jump: 14 * S,                     // jump height (units)
    cut: .45,                         // vertical speed kept when the jump is let go while rising
    gravity: 0,                       // units/s²; 0 = the world's G
    fallMul: 1.6,                     // gravity multiplier while falling, for snappy jumps
    fallMax: 140 * S,                 // terminal fall speed
    coyote: .1, buffer: .12,          // seconds
    step: Math.max(ASPECT, 1.2 * S),  // highest bump it walks up (units); a row is ASPECT
    wallSlide: 0,                     // > 0: pressing into a wall in the air, it falls no faster than this (units/s)
    wallJump: null,                   // [push away (units/s), height (units)]: jump off walls
    chunks: true                      // falling chunks are solid to it
  };
}
class Character {
  constructor(x, y, o = {}) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = 1;
    this.o = { ...charDefaults(), ...o };
    this.onGround = false; this.ground = 0; this.wall = 0;
    this.coyoteT = 0; this.bufferT = 0; this.lockT = 0; this.dropT = 0; this.rising = false; this.held = false;
    this.jumped = this.wallJumped = this.bumped = false; this.landed = 0;
    this._cb = [];
  }
  // what cell (cx, cy) is to this character: its material if solid, else 0. A oneWay cell is only a floor met from above:
  // feetY (the feet before the move) at or above its top, and not dropping through.
  solid(cx, cy, feetY) {
    const m = getC(cx, cy);
    if (m !== EMPTY) return !MAT_ONEWAY[m] || (feetY !== undefined && this.dropT <= 0 && feetY <= cy * ASPECT + 1e-3) ? m : 0;
    for (const b of this._cb) if (cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]) { const cm = chunkCellMat(b[4], cx, cy); if (cm) return cm; }
    return 0;
  }
  // does the box with its feet at (x, y) overlap anything solid? (oneWay cells never do)
  blocked(x, y) {
    const hw = this.o.w / 2, c0 = Math.floor(x - hw + 1e-4), c1 = Math.floor(x + hw - 1e-4);
    const r0 = Math.floor((y - this.o.h + 1e-4) / ASPECT), r1 = Math.floor((y - 1e-4) / ASPECT);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (this.solid(cx, cy)) return true;
    return false;
  }
  // does the box overlap this falling chunk? (for GAME.chunkStep: crushed, or pushed aside)
  touches(ch) {
    const hw = this.o.w / 2, c0 = Math.floor(this.x - hw + 1e-4), c1 = Math.floor(this.x + hw - 1e-4);
    const r0 = Math.floor((this.y - this.o.h + 1e-4) / ASPECT), r1 = Math.floor((this.y - 1e-4) / ASPECT);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (chunkCellMat(ch, cx, cy)) return true;
    return false;
  }
  // push the box out of whatever it overlaps: straight up first, then sideways, then down, up to `reach` units
  unstick(reach = 3 * ASPECT) {
    if (!this.blocked(this.x, this.y)) return true;
    for (let d = .5; d <= reach; d += .5) for (const [dx, dy] of [[0, -d], [-d, 0], [d, 0], [0, d]]) {
      if (!this.blocked(this.x + dx, this.y + dy)) { this.x += dx; this.y += dy; return true; }
    }
    return false;
  }
  // the material right under the feet (they rest on a row boundary), the middle column first; 0 if none
  under() {
    const row = Math.round(this.y / ASPECT);
    if (Math.abs(this.y - row * ASPECT) > 1e-3) return 0;
    const mid = this.solid(Math.floor(this.x), row, this.y); if (mid) return mid;
    const hw = this.o.w / 2;
    for (let cx = Math.floor(this.x - hw + 1e-4); cx <= Math.floor(this.x + hw - 1e-4); cx++) { const m = this.solid(cx, row, this.y); if (m) return m; }
    return 0;
  }
  // across: when the leading edge enters a new column, anything in it within `step` of the feet is stepped up onto
  moveX(dx, canStep) {
    const o = this.o, hw = o.w / 2, n = Math.max(1, Math.ceil(Math.abs(dx) / .45)), s = dx / n, d = Math.sign(dx);
    for (let i = 0; i < n; i++) {
      const nx = this.x + s, eo = d > 0 ? Math.floor(this.x + hw - 1e-4) : Math.floor(this.x - hw + 1e-4), en = d > 0 ? Math.floor(nx + hw - 1e-4) : Math.floor(nx - hw + 1e-4);
      if (en !== eo) {
        const r0 = Math.floor((this.y - o.h + 1e-4) / ASPECT), r1 = Math.floor((this.y - 1e-4) / ASPECT);
        let top = -1;
        for (let cy = r0; cy <= r1 && top < 0; cy++) if (this.solid(en, cy)) top = cy;
        if (top >= 0) {
          const rise = this.y - top * ASPECT;
          if (!canStep || rise > o.step + 1e-3 || this.blocked(nx, top * ASPECT)) { this.vx = 0; return false; }
          this.y = top * ASPECT;
        }
      }
      this.x = nx;
    }
    return true;
  }
  // up or down, a row at a time: returns the material landed on (> 0), -1 for a bumped head, 0 if nothing was hit
  moveY(dy) {
    const o = this.o, hw = o.w / 2, n = Math.max(1, Math.ceil(Math.abs(dy) / .45)), s = dy / n;
    const c0 = Math.floor(this.x - hw + 1e-4), c1 = Math.floor(this.x + hw - 1e-4);
    for (let i = 0; i < n; i++) {
      const ny = this.y + s;
      if (s > 0) {
        const ro = Math.floor((this.y - 1e-4) / ASPECT), rn = Math.floor((ny - 1e-4) / ASPECT);
        for (let r = ro + 1; r <= rn; r++) for (let cx = c0; cx <= c1; cx++) { const m = this.solid(cx, r, this.y); if (m) { this.y = r * ASPECT; return m; } }
      } else {
        const ro = Math.floor((this.y - o.h + 1e-4) / ASPECT), rn = Math.floor((ny - o.h + 1e-4) / ASPECT);
        for (let r = ro - 1; r >= rn; r--) for (let cx = c0; cx <= c1; cx++) if (this.solid(cx, r)) { this.y = (r + 1) * ASPECT + o.h; return -1; }
      }
      this.y = ny;
    }
    return 0;
  }
  // walking down a staircase: keep the feet on the ground if it is at most `step` below
  snapDown() {
    const row0 = Math.round(this.y / ASPECT), hw = this.o.w / 2;
    if (Math.abs(this.y - row0 * ASPECT) > 1e-3) return;
    for (let r = row0; r * ASPECT - this.y <= this.o.step + 1e-3; r++) {
      for (let cx = Math.floor(this.x - hw + 1e-4); cx <= Math.floor(this.x + hw - 1e-4); cx++) if (this.solid(cx, r, this.y)) { this.y = r * ASPECT; return; }
    }
  }
  step(dt, inp = {}) {
    const o = this.o, g = o.gravity || G, wasGround = this.onGround, dir = clamp(inp.x || 0, -1, 1);
    this.jumped = this.wallJumped = this.bumped = false; this.landed = 0;
    this._cb.length = 0;
    if (o.chunks) for (const ch of chunks) { const b = chunkCellBox(ch); b.push(ch); this._cb.push(b); }
    // the jump button: a press is remembered for `buffer` seconds, the ground for `coyote` seconds after leaving it
    const press = !!inp.jump && !this.held; this.held = !!inp.jump;
    this.bufferT = press ? o.buffer : Math.max(0, this.bufferT - dt);
    this.coyoteT = wasGround ? o.coyote : Math.max(0, this.coyoteT - dt);
    this.lockT = Math.max(0, this.lockT - dt); this.dropT = Math.max(0, this.dropT - dt);
    if (inp.down && wasGround && MAT_ONEWAY[this.ground]) { this.dropT = .25; this.coyoteT = 0; }
    // run (after a wall jump the push away is kept for a moment, so holding toward the wall doesn't cancel it)
    const target = this.lockT > 0 ? this.vx : dir * o.run;
    let rate = o.run / (target === 0 || (this.vx !== 0 && Math.sign(target) !== Math.sign(this.vx)) ? o.stopT : o.accelT);
    if (!wasGround) rate *= o.air;
    this.vx += clamp(target - this.vx, -rate * dt, rate * dt);
    if (dir) this.facing = dir > 0 ? 1 : -1;
    // jump from the ground (or just after leaving it), else off a wall
    if (this.bufferT > 0 && (wasGround || this.coyoteT > 0) && this.dropT <= 0) {
      this.vy = -Math.sqrt(2 * g * o.jump); this.jumped = this.rising = true; this.bufferT = this.coyoteT = 0;
    } else if (this.bufferT > 0 && o.wallJump && this.wall) {
      this.vx = -this.wall * o.wallJump[0]; this.vy = -Math.sqrt(2 * g * o.wallJump[1]); this.facing = -this.wall;
      this.wallJumped = this.rising = true; this.bufferT = 0; this.lockT = .14;
    }
    if (this.rising && (this.vy >= 0 || !inp.jump)) { if (this.vy < 0) this.vy *= o.cut; this.rising = false; }
    this.vy += g * (this.vy > 0 ? o.fallMul : 1) * dt;
    if (o.wallSlide > 0 && this.wall && dir === this.wall && this.vy > o.wallSlide) this.vy = o.wallSlide;
    if (this.vy > o.fallMax) this.vy = o.fallMax;
    // move: across (stepping up bumps, also when falling onto a ledge's corner), down stairs, then up or down
    this.moveX(this.vx * dt, (wasGround && !this.jumped) || this.vy >= 0);
    if (wasGround && !this.jumped && this.vy >= 0) this.snapDown();
    const vy0 = this.vy, hit = this.moveY(this.vy * dt);
    if (hit > 0) { this.vy = 0; if (!wasGround) this.landed = vy0; }
    else if (hit < 0) { this.vy = Math.max(0, this.vy); this.bumped = true; this.rising = false; }
    this.ground = this.vy >= 0 ? this.under() : 0; this.onGround = this.ground > 0;
    // airborne against a wall: something solid beside the box, above its lowest row
    this.wall = 0;
    if (!this.onGround) {
      const r0 = Math.floor((this.y - o.h + 1e-4) / ASPECT), r1 = Math.floor((this.y - 1e-4) / ASPECT) - 1;
      for (const d of dir ? [dir, -dir] : [-1, 1]) {
        const cx = Math.floor(this.x + d * (o.w / 2 + .3));
        for (let cy = r0; cy <= r1 && !this.wall; cy++) if (this.solid(cx, cy)) this.wall = d;
        if (this.wall) break;
      }
    }
  }
}
