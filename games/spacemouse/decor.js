// ===================== GAME · overgrowth and wiring: what makes the station look abandoned =====================
// As in the art sheet: moss hanging from ceilings and creeping over ledges, red cables sagging in loops under the ceilings,
// cobwebs in corners. All of it is decoration: worked out from the map once per build (in base units, so it looks alike at
// every detail), drawn by the game lit by the scene, and never solid. Where something fills its cell (sand, a chunk), it hides.
const DECOR_OPEN = '.PcKSLlA' + 'kmpohtgfbn';   // tiles that are open room (props included)
const DECOR_SOLID = '#=_xwrBCG';               // tiles a strand can hang from or a tuft grow on

function buildDecor(sec) {
  const map = sec.def.map, S = RES, tw = sec.tw, th = sec.th, out = [];
  const t = (tx, ty) => tileAt(map, tx, ty), open = (tx, ty) => DECOR_OPEN.includes(t(tx, ty)), solid = (tx, ty) => DECOR_SOLID.includes(t(tx, ty));
  const add = (cx, cy, g, c) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H && cells[cy * W + cx] === EMPTY) out.push({ i: cy * W + cx, g: g.charCodeAt(0), c }); };
  const green = h => [.24 + .14 * h, .48 + .2 * h, .1 + .1 * h];
  for (let ty = 0; ty < sec.mh; ty++) for (let tx = 0; tx < sec.mw; tx++) {
    if (!open(tx, ty)) continue;
    const h = hash2(tx, ty, 91), h2 = hash2(tx, ty, 92);
    // moss strands hanging from the ceiling
    if (solid(tx, ty - 1) && h < .42) {
      const n = 1 + Math.floor(h2 * 4);
      for (let s = 0; s < n; s++) {
        const hs = hash2(tx * 7 + s, ty, 93), cx = Math.floor((tx + (s + .2 + .6 * hs) / n) * tw), len = Math.max(1, Math.round((1.2 + 5 * hash2(tx, ty * 5 + s, 94)) * S / ASPECT));
        for (let r = 0; r < len && r < th * 2; r++) {
          if (!open(tx, Math.floor((ty * th + r) / th))) break;
          add(cx + (r > 2 && (r + s) % 4 === 0 ? 1 : 0), ty * th + r, r === len - 1 ? pick1(',;\'', hs + r) : pick1('|(){', hs * 3 + r), green(hash2(cx, r, 95)));
        }
      }
    }
    // tufts on the floor and moss spilling over a ledge
    if (solid(tx, ty + 1) && h2 < .3) for (let k = 0; k < tw; k++) if (hash2(tx * tw + k, ty, 96) < .45) add(tx * tw + k, (ty + 1) * th - 1, pick1('\',"`;', hash2(k, ty, 97)), green(hash2(k, tx, 98)));
    if (solid(tx, ty + 1) && open(tx + 1, ty + 1) && h < .5) for (let r = 0; r < Math.round(2.5 * S / ASPECT); r++) add((tx + 1) * tw, (ty + 1) * th + r, pick1('|(;', h + r), green(h));
    if (solid(tx, ty + 1) && open(tx - 1, ty + 1) && h2 > .5) for (let r = 0; r < Math.round(2 * S / ASPECT); r++) add(tx * tw - 1, (ty + 1) * th + r, pick1('|);', h2 + r), green(h2));
    // a cobweb in a top corner
    const left = solid(tx - 1, ty), right = solid(tx + 1, ty);
    if (solid(tx, ty - 1) && (left || right) && hash2(tx, ty, 99) < .3) {
      const n = Math.max(2, Math.round(1.6 * S)), x0 = left ? tx * tw : (tx + 1) * tw - 1, d = left ? 1 : -1, y0 = ty * th, web = [.5, .55, .62];
      for (let k = 0; k < n; k++) { add(x0 + d * k, y0 + Math.floor(k / 2), d > 0 ? '\\' : '/', web); if (k % 2 === 0) add(x0 + d * k, y0, '-', web); }
      for (let r = 1; r < Math.ceil(n / 2); r++) add(x0, y0 + r, '|', web);
    }
  }
  // red cables sagging in loops under the ceilings, between anchors a few tiles apart
  for (let ty = 0; ty < sec.mh; ty++) {
    let tx = 0;
    while (tx < sec.mw) {
      if (!(open(tx, ty) && solid(tx, ty - 1) && open(tx, ty + 1))) { tx++; continue; }
      let e = tx; while (e + 1 < sec.mw && open(e + 1, ty) && solid(e + 1, ty - 1)) e++;
      for (let a = tx + Math.floor(hash2(tx, ty, 101) * 3); a + 3 <= e; ) {
        const len = 3 + Math.floor(hash2(a, ty, 102) * 4), b = Math.min(e + 1, a + len), sag = (.7 + .9 * hash2(a, ty, 103)) * TILE * S;
        if (hash2(a, ty, 104) < .6) for (const off of hash2(a, ty, 105) < .35 ? [0, .35 * TILE * S] : [0]) {
          const x0 = a * tw, x1 = b * tw, y0 = ty * th * ASPECT + .6 + off * .4;
          let py = null;
          for (let cx = x0; cx < x1; cx++) {
            const u = (cx + .5 - x0) / (x1 - x0), y = y0 + (sag - off * .5) * Math.sin(Math.PI * u), dy = (sag - off * .5) * Math.PI * Math.cos(Math.PI * u) / (x1 - x0);
            add(cx, Math.floor(y / ASPECT), Math.abs(dy) < .35 ? (py !== null && Math.floor(y / ASPECT) === py ? '-' : '_') : dy > 0 ? '\\' : '/', [.78, .14, .08]);
            py = Math.floor(y / ASPECT);
          }
        }
        a = b + 1 + Math.floor(hash2(b, ty, 106) * 3);
      }
      tx = e + 1;
    }
  }
  return out;
}
// a stable pick from a string by a number (decor must be the same every build)
const pick1 = (s, h) => s[Math.floor(Math.abs(h * 7919)) % s.length];

function drawDecor() {
  const x0 = Math.floor(cam.x) - 2, x1 = x0 + R.cols + 4, y0 = Math.floor(cam.y / ASPECT) - 2, y1 = y0 + R.rows + 4;
  for (const d of SEC.decor) {
    const cx = d.i % W, cy = (d.i / W) | 0;
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1 || cells[d.i] !== EMPTY) continue;
    putLit(cx, cy, d.g, d.c[0], d.c[1], d.c[2], .14);
  }
}
