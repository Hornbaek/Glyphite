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
