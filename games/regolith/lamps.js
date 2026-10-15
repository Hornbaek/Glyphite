// ===================== GAME · floodlamps riding their masts =====================
// Every lamp is an engine mount on the steel cell it hangs from (lp.mount). When a rocket cuts the
// mast (or brings the x3 roof down) the lamp rides the falling chunk, keeps its position and aim
// relative to it, flickers on impacts and only breaks when the end it sits on hits the ground hard.
const LAMP_MOUNT = {
  onRide(ch) {
    this.lx = this.x - ch.X0; this.ly = this.y - ch.Y0; this.ldx = this.dx; this.ldy = this.dy;
    this.lhx = this.hx + .5 - ch.X0; this.lhy = (this.hy + .5) * ASPECT - ch.Y0; this.rot = 0;
  },
  onMove(ch) {
    const b = ch.body, c = Math.cos(b.a), s = Math.sin(b.a);
    this.x = b.x + this.lx * c - this.ly * s; this.y = b.y + this.lx * s + this.ly * c;
    this.dx = this.ldx * c - this.ldy * s; this.dy = this.ldx * s + this.ldy * c; this.rot = b.a;
    const hx = b.x + this.lhx * c - this.lhy * s, hy = b.y + this.lhx * s + this.lhy * c;
    this.hx = Math.floor(hx); this.hy = Math.floor(hy / ASPECT);
  },
  onImpact(ch, vb, hx, hy) {
    if (this.dead) return;
    // the lamp only breaks when the end it sits on is what hits the ground hard
    const near = Math.hypot(this.x - hx, this.y - hy) < 6 * RES;
    if (near && vb > 9) shatterLamp(this); else this.flick = Math.max(this.flick, .4 + vb * .08);
  },
  onLand(ch, placed) {
    // re-anchor on the nearest frozen cell next to the lamp head
    let best = -1, bd = 1e9;
    for (const i of placed) { const d = (i % W - this.hx) ** 2 + (((i / W) | 0) - this.hy) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 9 * RES * RES) this.dead = true; else this.mount = best;
  },
  onLost() { this.dead = true; }
};

function shatterLamp(lp) {
  if (lp.dead) return;
  lp.dead = true;
  for (let k = 0; k < 12 * RES; k++) spawnP(PT_SPARK, lp.x, lp.y - RES, rr(-14, 14) * RES, rr(-12, 4) * RES, rr(.3, .9), pick("*'`"), 0);
  addLight(lp.x, lp.y, 18 * RES, lp.c, 2, .18);
}
function stepLamps(dt) { if (LEVEL) for (const lp of LEVEL.lamps) if (lp.flick > 0) lp.flick = Math.max(0, lp.flick - dt); }
