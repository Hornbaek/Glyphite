// ===================== GAME · the lander, the crash, the hooks handed to the engine =====================
// One short run: the lander drops from the top with a few seconds of fuel and ends in a crater, because there is no
// page to land on. A soft touchdown is possible, but it is on a page that does not exist. Enter or a tap tries again.
let SHIP = null;
const FUEL_USE = 22;       // % of the tank per second at full burn

function startRun() {
  const S = RES, rng = Math.random;
  genSite();
  SHIP = { x: SITE.x0 + (SITE.x1 - SITE.x0) * (.25 + .5 * rng()), y: 10 * S * ASPECT, vx: 0, vy: 0, fuel: 100, burn: 0, alive: true, reason: '' };
  setState('play'); updateCamera(0, true);
}

function stepShip(dt) {
  const s = SHIP, S = RES;
  const up = keyDown('ArrowUp', 'KeyW') || Input.touch.thrust, dir = ((keyDown('ArrowRight', 'KeyD') || Input.touch.right) ? 1 : 0) - ((keyDown('ArrowLeft', 'KeyA') || Input.touch.left) ? 1 : 0);
  const burn = up && s.fuel > 0;
  s.burn += ((burn ? 1 : 0) - s.burn) * Math.min(1, dt * 12);
  s.vy += (G - (burn ? 2.1 * G : 0)) * dt;
  if (dir && s.fuel > 0) s.vx += dir * 1.1 * G * dt;
  if (burn || (dir && s.fuel > 0)) s.fuel = Math.max(0, s.fuel - dt * (burn ? FUEL_USE : 8));
  Sfx.engine(s.burn * .6);
  if (s.burn > .1) for (let i = 0; i < 2 * S; i++) spawnP(PT_GAS, s.x + rr(-1, 1) * S, s.y + 2.2 * S, s.vx * .5 + rr(-4, 4) * S, 30 * S * s.burn + s.vy * .3, rr(.2, .45), 0, 0);
  const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) * dt / .5));
  for (let i = 0; i < n; i++) {
    s.x = clamp(s.x + s.vx * dt / n, 4 * S, W - 4 * S); s.y += s.vy * dt / n;
    if (shipTouches()) { touchdown(); return; }
  }
}
// the lander is a 5 x 2 cell shape; any rock in those cells is a touch
function shipTouches() {
  const cx = Math.floor(SHIP.x), cy = Math.floor(SHIP.y / ASPECT);
  for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) if (getC(cx + dx, cy + dy) !== EMPTY) return true;
  return false;
}
function touchdown() {
  const s = SHIP, S = RES, v = Math.hypot(s.vx, s.vy) * UNIT_M;
  s.alive = false; Sfx.engine(0);
  if (v < 1.4 && s.vy >= 0) { s.reason = 'SOFT TOUCHDOWN ON A PAGE THAT DOES NOT EXIST'; setState('landed'); Sfx.win(); return; }
  s.reason = v > 6 ? 'IMPACT AT ' + v.toFixed(1) + ' M/S' : 'GROUNDED AT ' + v.toFixed(1) + ' M/S';
  setState('crashed');
  explode(s.x, s.y, 6 * S, 1.6);
  for (let k = 0; k < 30 * S; k++) spawnP(PT_WRECK, s.x + rr(-3, 3) * S, s.y + rr(-3, 1) * S, s.vx * .5 + rr(-22, 22) * S, s.vy * -.3 - rr(6, 26) * S, rr(5, 9), pick('/\\|=#%[]o_'), 0);
  FX.slow = .25; FX.slowT = 1.3; FX.flashCol = [1, .7, .45];
}

function gameUpdate(dt) {
  if (Input.pressed.has('Tap') && state !== 'play' && stateT > .9) startRun();
  if (state === 'play' && SHIP.alive) stepShip(dt);
}
function gameKey(code) { if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && state !== 'play' && stateT > .9) startRun(); }

function gameLights(t, out) {
  if (!SHIP || !SHIP.alive) return;
  if (SHIP.burn > .03) out.push({ x: SHIP.x, y: SHIP.y + 3 * RES, r: (14 + 30 * SHIP.burn) * RES, c: [1, .62, .28], I: 1.5 * SHIP.burn + .2, shadow: true });
  out.push({ x: SHIP.x, y: SHIP.y - RES, r: 12 * RES, c: [.5, .75, 1], I: .4, shadow: false });
}
function gameDraw(t) {
  if (!SHIP || !SHIP.alive) return;
  const cx = Math.floor(SHIP.x), cy = Math.floor(SHIP.y / ASPECT), flame = SHIP.burn > .2;
  const hull = [[-1, -1, 94], [0, -1, 65], [1, -1, 94], [-2, 0, 47], [-1, 0, 35], [0, 0, 35], [1, 0, 35], [2, 0, 92]];   // ^A^ over /###\ roughly
  for (const [dx, dy, code] of hull) putLit(cx + dx, cy + dy, code, .85, .88, .95, .35);
  if (flame) putEmit(cx, cy + 1, ((t * 14) | 0) & 1 ? 94 : 118, 1.6, .9, .3);
}
function gameHud(t) {
  hudText(1, 0, '404', HC.amber);
  hudText(6, 0, SITE.text, HC.dim);
  if (SHIP) {
    const fb = Math.round(SHIP.fuel / 10), sp = Math.hypot(SHIP.vx, SHIP.vy) * UNIT_M;
    hudFlow(1, [[`FUEL [${'#'.repeat(fb)}${'-'.repeat(10 - fb)}]`, SHIP.fuel < 20 ? HC.amber : HC.txt], [`SPEED ${sp.toFixed(1)} M/S`, sp > 4 ? HC.amber : HC.dim]]);
  }
  if (state === 'play' && stateT < 6) { const hint = 'W / UP burn   A D drift'; hudText(Math.max(0, (R.hcols - hint.length) >> 1), R.hrows - (touchShown() ? 9 : 2), hint, HC.dim); }
  if (state === 'crashed' && stateT > 1.1) msgBox([['404', HC.red], ['PAGE NOT FOUND', HC.txt], [SITE.text, HC.gold], ['', HC.txt], [SHIP.reason, HC.dim], ['', HC.txt], [stateT > 1.4 ? '[ ENTER / TAP ]  TRY AGAIN' : '', HC.amber]]);
  if (state === 'landed' && stateT > .8) msgBox([['404', HC.green], ['PAGE NOT FOUND', HC.txt], [SITE.text, HC.gold], ['', HC.txt], [SHIP.reason, HC.dim], ['', HC.txt], [stateT > 1.2 ? '[ ENTER / TAP ]  AGAIN' : '', HC.amber]]);
}

Glyphite.run({
  id: 'notfound',
  touch: [
    [{ label: '[ < ]', aria: 'Drift left', hold: 'left' }, { label: '[ > ]', aria: 'Drift right', hold: 'right' }],
    [{ label: '[ BURN ]', aria: 'Burn', hold: 'thrust' }]
  ],
  init() { setGravity(TUNE.gravity); startRun(); },
  regenerate() { startRun(); },
  update: gameUpdate, onKey: gameKey, lights: gameLights, draw: gameDraw, hud: gameHud,
  camera(VW, VH, out) { out[0] = SHIP.x - VW / 2; out[1] = SHIP.y - VH * (SHIP.alive || state === 'landed' ? .35 : .5); },
  onTune(key, v) { if (key === 'gravity') setGravity(v); },
  start() { if (state !== 'play') startRun(); },
  probe: () => ({ text: SITE && SITE.text, letters: SITE && SITE.letters, rockNow: SITE && countLetters(), ship: SHIP && { alive: SHIP.alive, reason: SHIP.reason, x: +SHIP.x.toFixed(1), y: +SHIP.y.toFixed(1), fuel: +SHIP.fuel.toFixed(0) } })
});
