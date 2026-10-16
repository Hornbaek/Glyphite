// ===================== GAME · drawing the world objects, lights, HUD =====================
const _h = [0, 0];

// moving bodies cast sun shadows (the engine marks its own falling chunks)
function markDyn() {
  markBouldersDyn();
  let top = 1e9;
  for (const bo of boulders) if (!bo.dead) top = Math.min(top, Math.floor((bo.y - bo.r) / ASPECT));
  if (!L || !L.alive || state === 'title') return top;
  return Math.min(top, markLanderDyn(L.body));
}
function hasCrystalNear(c) {
  const cx = Math.floor(c.x), cy = Math.floor(c.y / ASPECT), ri = Math.round(4 * RES), rj = Math.round(2 * RES);
  for (let j = -rj; j <= rj; j++) for (let i = -ri; i <= ri; i++) if (getC(cx + i, cy + j) === CRYST) return true;
  return false;
}
function beaconSpots(p) { const y = p.postTop - 1; return [[p.x0 - 1 - (p.pw - 1) / 2, y, [1, .25, .2]], [p.x1 + (p.pw - 1) / 2, y, [.3, 1, .4]]]; }
function regolithLights(t, out) {
  const S = RES;
  if (L && L.alive) {
    const b = L.body;
    if (L.throttle > .03) { b.toWorld(0, 5.6 * S, tmp2); out.push({ x: tmp2[0], y: tmp2[1], r: (14 + 32 * L.throttle) * S, c: [1, .62, .28], I: (1.5 * L.throttle + .2) * rr(.85, 1.15), shadow: true }); }
    if (L.lights) {
      b.toWorld(0, 4.5 * S, tmp2); const d = b.dirWorld(0, 1, [0, 0]);
      out.push({ x: tmp2[0], y: tmp2[1], r: 76 * S, c: [.72, .84, 1], I: 1.8, shadow: true, dx: d[0], dy: d[1], cos: Math.cos(.55) });
      for (const sd of [-1, 1]) {   // landing lights on the leg struts
        b.toWorld(sd * 4.5 * S, 2.6 * S, tmp2); const e = b.dirWorld(sd * .36, .93, [0, 0]);
        out.push({ x: tmp2[0], y: tmp2[1], r: 66 * S, c: [1, .95, .84], I: 1.6, shadow: true, dx: e[0], dy: e[1], cos: Math.cos(.36), skip: .8 * S });
      }
    }
    out.push({ x: b.x, y: b.y - 2 * S, r: 11 * S, c: [.5, .75, 1], I: .38, shadow: false });
  }
  for (const r of rockets) out.push({ x: r.x, y: r.y, r: 20 * S, c: [1, .7, .35], I: 1.1, shadow: true });
  for (const m of meteors) out.push({ x: m.x, y: m.y, r: 24 * S, c: [1, .55, .25], I: 1.3, shadow: true });
  if (Beat.blink(t)) for (const p of LEVEL.pads) for (const [bx, by, col] of beaconSpots(p)) out.push({ x: bx + .5, y: (by + .5) * ASPECT, r: 13 * S, c: col, I: .9 * (1 + .8 * Beat.pulse()), shadow: true });   // the beacons follow the beat, and flare on a drum hit
  const vx0 = cam.x - 25 * S, vx1 = cam.x + R.cols + 25 * S;
  for (const c of LEVEL.crystals) {
    if (c.dead || c.x < vx0 || c.x > vx1) continue;
    if (frameNo % 20 === 0 && !hasCrystalNear(c)) { c.dead = true; continue; }
    out.push({ x: c.x, y: c.y, r: 17 * S, c: [.3, 1, .85], I: .5 + .12 * Math.sin(t * 3 + c.x), shadow: true, skip: 3 * S });
  }
  for (const lp of LEVEL.lamps) {
    if (lp.dead || lp.x + lp.r < cam.x || lp.x - lp.r > cam.x + R.cols) continue;
    if (!lp.chunk && cells[lp.mount] === EMPTY) { lp.dead = true; continue; }   // its mast or roof was blown away
    const I = lp.flick > 0 && Math.random() < .55 ? lp.I * .12 : lp.I;
    out.push({ x: lp.x, y: lp.y, r: lp.r, c: lp.c, I, shadow: true, dx: lp.dx, dy: lp.dy, cos: lp.cos });
  }
}

// beacons, lamps, boulders, rockets, meteors and the lander (the engine has drawn the falling chunks)
function drawWorld(t) {
  const on = Beat.blink(t);
  for (const p of LEVEL.pads) for (const [bx, by, col] of beaconSpots(p)) for (let q = 0; q < p.pw; q++) putEmit(Math.round(bx - (p.pw - 1) / 2) + q, by, on ? 42 : 46, on ? col[0] * 1.6 : .3, on ? col[1] * 1.6 : .2, on ? col[2] * 1.6 : .15);
  for (const lp of LEVEL.lamps) {
    if (lp.hx < cam.x - 10 * RES || lp.hx > cam.x + R.cols + 10 * RES) continue;
    const on = !lp.dead && !(lp.flick > 0 && Math.random() < .55);
    if (lp.rot) {   // riding a falling post: the shade tumbles with it
      const c = Math.cos(lp.rot), s = Math.sin(lp.rot), hx = lp.hx + .5, hy = (lp.hy + .5) * ASPECT;
      for (let q = -lp.w; q <= lp.w; q++) {
        const cx = Math.floor(hx + q * c), cy = Math.floor((hy + q * s) / ASPECT), edge = Math.abs(q) === lp.w;
        if (edge) putLit(cx, cy, slopeGlyph(c, s), .75, .77, .8, .18);
        else if (on) putEmit(cx, cy, 42, 1.7 * lp.c[0], 1.7 * lp.c[1], 1.7 * lp.c[2]); else putLit(cx, cy, 46, .4, .4, .42, .15);
      }
      continue;
    }
    putLit(lp.hx - lp.w, lp.hy, 47, .75, .77, .8, .18); putLit(lp.hx + lp.w, lp.hy, 92, .75, .77, .8, .18);
    for (let q = -lp.w + 1; q <= lp.w - 1; q++) {
      if (on) putEmit(lp.hx + q, lp.hy, 118, 1.7 * lp.c[0], 1.7 * lp.c[1], 1.7 * lp.c[2]);
      else putLit(lp.hx + q, lp.hy, 46, .4, .4, .42, .15);
    }
  }
  drawBoulders(t);
  for (const r of rockets) putEmit(Math.floor(r.x), Math.floor(r.y / ASPECT), slopeGlyph(r.vx, r.vy), 1.6, 1.4, 1.1);
  for (const m of meteors) putEmit(Math.floor(m.x), Math.floor(m.y / ASPECT), 64, 1.6, 1.0, .6);
  if (L && L.alive && state !== 'title') {
    drawLanderArt(L.body);
    const aim = state === 'play' ? mouseAim() : null;
    if (aim) {   // dotted firing line toward the cursor
      const w = aimToWorld(aim), b = L.body, dx = w[0] - b.x, dy = w[1] - b.y, l = Math.hypot(dx, dy) || 1;
      for (let k = 2; k <= 7; k++) { const d = k * 3.2 * RES; if (d > l) break; putEmit(Math.floor(b.x + dx / l * d), Math.floor((b.y + dy / l * d) / ASPECT), 46, .7, .5, .2); }
    }
  }
}

// ---------- HUD (its own readable grid: R.hcols x R.hrows) ----------
function altitude() {
  const S = RES, b = L.body, footY = b.y + LEG0.fy * S; let best = 1e9;
  for (const ox of [-6, 0, 6]) {
    const x = Math.floor(b.x + ox * S); let cy = Math.max(0, Math.floor(footY / ASPECT));
    while (cy < H && getC(x, cy) === EMPTY) cy++;
    best = Math.min(best, cy * ASPECT - footY);
  }
  return Math.max(0, best);
}
const LOGO = [
  '####   #####   ####    ###   #      ###  #####  #   #',
  '#   #  #      #       #   #  #       #     #    #   #',
  '####   ####   #  ##   #   #  #       #     #    #####',
  '#  #   #      #   #   #   #  #       #     #    #   #',
  '#   #  #####   ####    ###   #####  ###    #    #   #'
];
function drawTitle(t) {
  const r0 = Math.max(1, Math.floor(R.hrows * .14)), wide = R.hcols >= LOGO[0].length + 4;
  if (wide) LOGO.forEach((l, i) => { const c0 = Math.floor((R.hcols - l.length) / 2); for (let k = 0; k < l.length; k++) if (l[k] !== ' ') { const q = Math.round((.75 + .25 * Math.sin(t * 2 + k * .15 - i * .4)) * 4) / 4; hudPut(c0 + k, r0 + i, 35, 255 * q | 0, 200 * q | 0, 120 * q | 0); } });
  else hudText(Math.floor((R.hcols - 8) / 2), r0 + 2, 'REGOLITH', HC.gold);
  const lines = [
    ['A LUNAR DESCENT IN 95 PRINTABLE CHARACTERS', HC.txt],
    ['', HC.txt],
    ['BURN  W / UP     ROTATE  A D / LEFT RIGHT', HC.txt],
    ['ROCKET  SPACE, or click / tap to aim', HC.txt],
    ['LIGHTS L   BLOOM G   PAUSE P   SOUND M', HC.dim],
    ['MUSIC N   METERS V   or drop in a .mid file', HC.dim],
    [`DETAIL  - / +   now ${detailLabel()}, ${R.cols} columns`, HC.cyan],
    ['', HC.txt],
    ['Land on a pad. Under 1 m/s pays extra.', HC.dim],
    ['x2 and x3 pads pay double and triple.', HC.dim],
    ['Blast basalt to free glowing He-3', HC.dim],
    ['crystals, then fly through the shards.', HC.dim],
    ['', HC.txt],
    [((t * 1.5) | 0) % 2 ? '[ PRESS ENTER OR TAP TO LAUNCH ]' : '                                ', HC.amber]
  ];
  const top = r0 + (wide ? 7 : 4);
  msgBox(lines, top);
  if (R.hrows - (top + lines.length + 2) > 9) drawChipMeters(Math.floor((R.hcols - 38) / 2), top + lines.length + 3, true);
}
// floating text and pad labels are anchored in the world but drawn on the HUD grid
function drawWorldLabels() {
  for (const p of LEVEL.pads) {
    const lx = (p.x0 + p.x1) / 2, ly = (p.postTop - 2) * ASPECT;
    if (L && L.alive && Math.abs(L.body.x - lx) < 9 * RES && ly > L.body.y - 8 * RES && ly < L.body.y + 7 * RES) continue;   // don't print over the lander
    worldToHud(lx, ly, _h);
    const s = `x${p.mult}`; hudText(_h[0] - 1, _h[1], s, [242, 178, 76]);
  }
  for (const tx of FX.texts) {
    const u = tx.age / tx.life, f = u < .7 ? 1 : 1 - (u - .7) / .3;
    worldToHud(tx.x, tx.y - tx.age * 5 * RES, _h);
    hudText(_h[0] - (tx.text.length >> 1), _h[1], tx.text, [tx.c[0] * f, tx.c[1] * f, tx.c[2] * f]);
  }
}
// is a floodlamp's beam on this point? (the engine's visibility query, with each lamp's own cone and shadows)
function lampLit(x, y) {
  for (const lp of LEVEL.lamps) if (!lp.dead && isLitBy({ x: lp.x, y: lp.y, r: lp.r, I: lp.I, shadow: true, dx: lp.dx, dy: lp.dy, cos: lp.cos }, x, y) > .08) return true;
  return false;
}
function drawHUD(t) {
  if (state === 'title') { drawTitle(t); return; }
  drawWorldLabels();
  const b = L.body, blink = ((t * 3) | 0) & 1, HCOL = R.hcols;
  const altM = L.alive ? altitude() * UNIT_M : 0, hv = b.vx * UNIT_M, vv = -b.vy * UNIT_M, att = b.a * 180 / Math.PI;
  const fuel = L.fuel / LEVEL.fuelMax, nb = 10, fb = Math.round(fuel * nb);
  hudText(1, 0, `SITE ${LEVEL.lv}  ${LEVEL.site.name}`, HC.gold);
  const right = `SCORE ${String(score).padStart(6, '0')}   LM ${'A'.repeat(Math.max(0, lives))}`;
  if (HCOL > 40 + right.length) hudText(HCOL - right.length - 1, 0, right, HC.txt);
  let row = 1;
  if (HCOL <= 40 + right.length) row = hudFlow(row, [[right, HC.txt]]);
  row = hudFlow(row, [
    [`ALT ${altM.toFixed(1).padStart(6, '0')} M`, HC.txt],
    [`H.VEL ${fmtS(hv, 4, 1)}`, Math.abs(hv) > 2 ? HC.amber : HC.txt],
    [`V.VEL ${fmtS(vv, 4, 1)} M/S`, vv < -2 ? HC.amber : HC.txt],
    [`ATT ${fmtS(att, 2, 0)}`, Math.abs(att) > 15 ? HC.amber : HC.txt],
    [`FUEL [${'#'.repeat(fb)}${'-'.repeat(nb - fb)}] ${String(Math.round(fuel * 100)).padStart(3, '0')}%`, fuel < .2 ? HC.amber : HC.txt],
    [`RKT ${L.rockets}`, L.rockets ? HC.txt : HC.dim]
  ]);
  const lamps = [
    ['ALT', L.alive && altM < 15 && vv < -2.5],
    ['VEL', L.alive && (Math.abs(hv) > 2 || vv < -4)],
    ['ATT', L.alive && Math.abs(att) > 20],
    ['FUEL', fuel < .2 && blink],
    ['CONTACT', L.alive && (b.feetDown > 0 || L.legs[0].touch || L.legs[1].touch)],
    ['1202', perfAvg > 30],
    ['METEOR', shower && blink],
    ['SUN', L.alive && sunAt(b.x, b.y)],
    ['LAMP', L.alive && lampLit(b.x, b.y)]
  ];
  let c = 1;
  for (const [name, lit] of lamps) { const s = `[${name}]`; if (c + s.length > HCOL - 1) { row++; c = 1; } hudText(c, row, s, lit ? (name === 'CONTACT' || name === 'LAMP' ? HC.cyan : name === 'SUN' ? HC.gold : HC.amber) : HC.dim); c += s.length + 1; }
  row += 2;
  // pads beyond the edge of the screen
  for (const p of LEVEL.pads) {
    const sx = (p.x0 + p.x1) / 2 - cam.x, dist = Math.abs((p.x0 + p.x1) / 2 - b.x) * UNIT_M;
    if (sx < 1) { hudText(1, row++, `<< x${p.mult} PAD ${dist.toFixed(0)} M`, HC.gold); }
    else if (sx > R.cols - 1) { const s = `x${p.mult} PAD ${dist.toFixed(0)} M >>`; hudText(HCOL - s.length - 1, row++, s, HC.gold); }
  }
  if (b.y < cam.y - 2) { worldToHud(b.x, cam.y, _h); hudText(_h[0], row, '^', HC.amber); }
  if (state === 'play' && stateT < 14 && R.hrows > 20) {
    const touch = touchShown();
    const hint = touch ? 'hold BURN - turn with < > - tap sky to fire' : HCOL > 110 ? 'W/UP burn   A D rotate   SPACE or click: rocket   L lights   G bloom   - + detail   P pause   M sound' : 'W burn  A D rotate  SPACE rocket  - + detail';
    hudText(Math.max(0, Math.floor((HCOL - hint.length) / 2)), R.hrows - (touch ? 9 : 2), hint, HC.dim);
  }
  if (Music.meters && R.hrows > 24) drawChipMeters(R.hcols - 39, R.hrows - 12, true);
  if (state === 'play') { const a = mouseAim(); if (a) hudPut(Math.floor(a[0] * HCOL), Math.floor(a[1] * R.hrows), 43, ...HC.amber); }
  if (state === 'paused') msgBox([['PAUSED', HC.amber], ['P or ESC to resume', HC.dim]]);
  if (state === 'landed' && stateT > .6) {
    const g = lastLanding;
    msgBox([
      ['CONTACT LIGHT.  ENGINE STOP.', HC.cyan],
      [`${LEVEL.site.name} BASE HERE - LANDED ON x${g.mult}`, HC.txt],
      ['', HC.txt],
      [`PAD BONUS    +${g.base}`, HC.txt],
      [`PROPELLANT   +${g.fuelB}`, HC.txt],
      [`TOUCHDOWN ${g.soft.toFixed(1)} M/S   +${g.softB}`, g.softB ? HC.green : HC.dim],
      [`He-3 CARRIED  ${g.crystals}`, HC.txt],
      ['', HC.txt],
      [`SCORE ${String(score).padStart(6, '0')}`, HC.gold],
      [stateT > 1.2 ? '[ ENTER / TAP ]  NEXT SITE' : '', HC.amber]
    ]);
  }
  if (state === 'crashed' && stateT > 1.1) {
    const over = lives <= 0;
    msgBox([
      [over ? 'MISSION OVER' : 'LANDER LOST', HC.red],
      [L.reason, HC.txt],
      ['', HC.txt],
      [over ? `FINAL SCORE ${String(score).padStart(6, '0')}` : `LANDERS LEFT ${lives}`, HC.gold],
      [stateT > 1.6 ? (over ? '[ ENTER / TAP ]  NEW MISSION' : '[ ENTER / TAP ]  RETRY SITE') : '', HC.amber]
    ]);
  }
}

// ---------- the Earth in the sky (painted on the engine's sky layer) ----------
// It is pinned in sky coordinates: upper right of the screen when the camera is mid-world, lit from
// the same sun, with continents and clouds from noise, turning slowly.
const EARTH_RAMP = Array.from(' .:-=+*#%@', c => c.charCodeAt(0));
const _earth = { rx: 0, ry: 0, cx: 0, cy: 0, t: 0 };
function earthBegin(ox, oy, time) {
  _earth.rx = clamp(R.RW * .045, 4 * RES, 9 * RES); _earth.ry = _earth.rx / 2;
  _earth.cx = R.cols * .76 + (W - R.cols) * .5 * SKY_PAR - ox; _earth.cy = R.rows * .2 + H * .45 * SKY_PAR - oy;
  _earth.t = time | 0;
}
function earthCell(i, j, out) {
  const ex = (i + .5 - _earth.cx) / _earth.rx, ey = (j + .5 - _earth.cy) / _earth.ry, e2 = ex * ex + ey * ey;
  if (e2 >= 1) return 0;
  const nz = Math.sqrt(1 - e2), lit = Math.max(0, ex * -.72 + ey * -.38 + nz * .58);
  if (lit <= .03) return -1;   // the night side hides the stars behind it
  const lon = Math.atan2(ex, nz) * 1.4 + _earth.t * .015, land = fbm2(lon * 2.2, ey * 2.6, 99, 3) > .55, cloud = fbm2(lon * 3.1 + 5, ey * 5, 7, 3) > .58;
  const cc = cloud ? [1, 1, 1] : land ? [.38, .62, .3] : [.16, .36, .9];
  out[0] = cc[0] * lit * 1.3; out[1] = cc[1] * lit * 1.3; out[2] = cc[2] * lit * 1.3;
  if (e2 > .78) { out[2] += .25 * lit; out[1] += .08 * lit; }
  return EARTH_RAMP[clamp((lit * 10.5) | 0, 1, 9)];
}
