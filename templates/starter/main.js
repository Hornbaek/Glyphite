// ===================== GAME · states, drawing, HUD and the hooks handed to the engine =====================
// States: title → play → over (crashed) or cleared → play ...  The engine owns the loop, the camera
// smoothing, detail levels and the built-in keys (- + detail, G bloom, M sound, P pause).
// Hook functions are named game* so they never clash with the engine's own globals (update, draw...).

function startCave(n) { genCave(n); spawnDrone(); setState('play'); updateCamera(0, true); }
function advance() {
  if (state === 'title') { score = 0; startCave(1); }
  else if (state === 'over' && stateT > 1) { score = 0; startCave(CAVE.n); }
  else if (state === 'cleared' && stateT > 1) startCave(CAVE.n + 1);
}

function gameUpdate(dt) {
  if (Input.pressed.has('Tap')) { if (state === 'play') fireBolt(Input.aim); else if (state !== 'paused') advance(); }
  if (D && D.alive && state === 'play') {
    controlDrone(dt);
    D.body.step(dt);
    droneContacts();
    if (D.alive && D.gems >= TUNE.gemsToWin) { setState('cleared'); Sfx.win(); Sfx.engine(0); }
  }
  stepBolts(dt);
}

function gameKey(code) {
  if (code === 'Enter' || code === 'NumpadEnter') advance();
  else if (code === 'Space') { if (state === 'play') fireBolt(mouseAim()); else if (state !== 'paused') advance(); }
}

function gameLights(t, out) {
  if (!D || !D.alive) return;
  const b = D.body, S = RES, [dx, dy] = aimDir(state === 'play' ? mouseAim() : null);
  out.push({ x: b.x, y: b.y, r: 90 * S, c: [.85, .92, 1], I: 2.2, shadow: true, dx, dy, cos: Math.cos(.65), skip: 3 * S });  // headlamp
  out.push({ x: b.x, y: b.y, r: 40 * S, c: [.5, .7, 1], I: .7, shadow: true, skip: 3 * S });                                 // light all around the drone
  for (const o of bolts) out.push({ x: o.x, y: o.y, r: 16 * S, c: [.6, .85, 1], I: 1, shadow: true });
}

function gameDraw(t) {
  for (const o of bolts) putEmit(Math.floor(o.x), Math.floor(o.y / ASPECT), slopeGlyph(o.vx, o.vy), .9, 1.3, 1.6);
  if (D && D.alive && state !== 'title') drawSprite(DRONE_SPRITE, D.body.x, D.body.y, D.body.a);
}

function gameHud(t) {
  if (state === 'title') {
    msgBox([
      ['CAVE DRONE', HC.gold], ['', HC.txt],
      ['THRUST  W / UP     ROTATE  A D', HC.txt],
      ['FIRE  SPACE, or click to aim', HC.txt],
      [`Catch ${TUNE.gemsToWin} glowing gems to clear the cave.`, HC.dim], ['', HC.txt],
      [((t * 1.5) | 0) % 2 ? '[ PRESS ENTER OR TAP TO START ]' : '', HC.amber]
    ]);
    return;
  }
  hudText(1, 0, `CAVE ${CAVE.n}`, HC.gold);
  hudFlow(1, [[`GEMS ${D.gems}/${TUNE.gemsToWin}`, HC.txt], [`SCORE ${String(score).padStart(5, '0')}`, HC.txt], [`SPEED ${(Math.hypot(D.body.vx, D.body.vy) * UNIT_M).toFixed(1)} M/S`, HC.dim]]);
  for (const tx of FX.texts) { const p = worldToHud(tx.x, tx.y - tx.age * 5 * RES, [0, 0]); hudText(p[0] - (tx.text.length >> 1), p[1], tx.text, tx.c); }
  if (state === 'paused') msgBox([['PAUSED', HC.amber], ['P or ESC to resume', HC.dim]]);
  if (state === 'over' && stateT > .8) msgBox([['DRONE LOST', HC.red], [D.reason, HC.txt], ['', HC.txt], ['[ ENTER / TAP ]  TRY AGAIN', HC.amber]]);
  if (state === 'cleared' && stateT > .8) msgBox([['CAVE CLEARED', HC.green], [`SCORE ${score}`, HC.gold], ['', HC.txt], ['[ ENTER / TAP ]  NEXT CAVE', HC.amber]]);
}

Glyphite.run({
  id: 'starter',
  touch: [
    [{ label: '[ < ]', aria: 'Rotate left', hold: 'left' }, { label: '[ > ]', aria: 'Rotate right', hold: 'right' }],
    [{ label: '[ FIRE ]', aria: 'Fire', tap: true }, { label: '[ UP ]', aria: 'Thrust', hold: 'thrust' }]
  ],
  stars: 0,                 // a cave: no sky
  init() { setGravity(TUNE.gravity); genCave(1); setState('title'); },
  regenerate() { const was = state; genCave(CAVE ? CAVE.n : 1); if (was === 'title') D = null; else { spawnDrone(); setState('play'); } },
  update: gameUpdate, onKey: gameKey, lights: gameLights, draw: gameDraw, hud: gameHud,
  camera(VW, VH, out) {
    if (D && state !== 'title') { out[0] = D.body.x + D.body.vx * .5 - VW / 2; out[1] = D.body.y + D.body.vy * .3 - VH / 2; }
    else { out[0] = CAVE.spawn.x - VW / 2; out[1] = CAVE.spawn.y - VH / 2; }
  },
  markDyn() { return D && D.alive && state !== 'title' ? markSpriteDyn(DRONE_SPRITE, D.body.x, D.body.y, D.body.a) : 1e9; },
  chunkStep(ch) { if (D && D.alive && state === 'play') chunkVsBody(ch, D.body, v => { if (v > 8 * RES) { crashDrone('CRUSHED BY FALLING ROCK'); return true; } }); },
  onBlast(x, y, R0) { if (D && D.alive && Math.hypot(D.body.x - x, D.body.y - y) < R0 * 1.1) crashDrone('CAUGHT IN YOUR OWN BLAST'); },
  onTune(key, v) { if (key === 'gravity') setGravity(v); },
  start() { if (state === 'title') advance(); },
  probe: () => ({ cave: CAVE && CAVE.n, score, drone: D && { alive: D.alive, gems: D.gems, reason: D.reason, x: +D.body.x.toFixed(1), y: +D.body.y.toFixed(1) } })
});
