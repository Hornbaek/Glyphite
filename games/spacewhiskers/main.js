'use strict';
// ===================== GAME · the level, the view, the look, the HUD, Pixelite.run =====================
// One detail level (RES 2: one cell is one pixel of Pip's art) and a view of TUNE.screenWidth game pixels across (480 x 270, the agreed
// screen): the engine's zoom makes each cell a whole number of device pixels, about the screen's size, whatever the window (fitView).
let SW_MAP = null, SW_CHEESE = [], SW_LAMPS = [], SW_GOAL = null;
const listOf = v => (!v ? [] : typeof v[0] === 'number' ? [v] : v);   // loadTileMap keeps a single spawn as [x, y]

function newLevel() {
  PROPS.length = 0;
  SW_MAP = loadTileMap(levelRows(), LEGEND, { tile: 4 });
  paintBackWall(SW_MAP);
  SW_CHEESE = listOf(SW_MAP.spawns.cheese).map(([x, y]) => ({ x, y, got: false }));
  SW_LAMPS = listOf(SW_MAP.spawns.lamp).map(([x, y]) => ({ x, y: y - SW_MAP.tc * ASPECT }));   // a lamp hangs from the top of its tile
  SW_GOAL = listOf(SW_MAP.spawns.goal).map(([x, y]) => ({ x, y, got: false }))[0] || null;
  const [px, py] = listOf(SW_MAP.spawns.pip)[0];
  spawnPip(px, py);
  setCamera({ follow: PIP.c, lead: .22, deadzone: [.16, .3], bounds: [0, 0, W, H * ASPECT], offset: [0, -12 * PX] });
  updateCamera(0, true);
}

// the view: about TUNE.screenWidth game pixels across (and 9/16 of that down), every cell a whole number of device pixels, the window
// filled. The cell size is rounded, not floored, so a window between two sizes shows a view near the agreed one (a 1366 x 768 laptop:
// 455 x 256) instead of one much bigger; 1920 x 1080 is exactly 480 x 270. Two device pixels a cell is the engine's least.
function fitView() {
  const stage = R.canvas && R.canvas.parentElement; if (!stage || !R.cw1) return;
  const r = stage.getBoundingClientRect(), dpr = R.dpr || 1, w = TUNE.screenWidth, h = Math.round(w * 9 / 16);
  const cw = Math.max(2, Math.round(Math.min(r.width * dpr / w, r.height * dpr / h)));
  if (cw !== R.cw) setZoom(cw / R.cw1);
}

// a blue planet in the shipyard's big window, on the slow sky layer (the stars are the engine's)
const SKY = [0, 0];
const PLANET = { x: 330, y: 70, r: 64 };
function skyCell(i, j, out) {
  const dx = (SKY[0] + i - PLANET.x) / PLANET.r, dy = (SKY[1] + j - PLANET.y) / PLANET.r, d2 = dx * dx + dy * dy;
  if (d2 > 1) return 0;
  const lit = clamp(.35 + .75 * (-dx * .6 - dy * .5 + Math.sqrt(1 - d2) * .6), .12, 1.2), band = Math.sin((dy * 9 + dx * 2) * 1.3) > .55 ? 1.12 : 1;
  out[0] = .18 * lit * band; out[1] = .34 * lit * band; out[2] = .85 * lit; return SOLID;
}

function gameLights(t, out) {
  for (const l of SW_LAMPS) out.push({ x: l.x, y: l.y + 6 * PX, r: 150 * PX, c: [1, .86, .62], I: 2.4, shadow: true, skip: 8 * PX });
  if (PIP) out.push({ x: PIP.c.x, y: PIP.c.y - 38 * PX, r: 30 * PX, c: [.6, .8, 1], I: .35, shadow: false });   // the helmet's glass catches the light
  if (SW_GOAL && !SW_GOAL.got) out.push({ x: SW_GOAL.x, y: SW_GOAL.y - 10 * PX, r: 60 * PX, c: [1, .8, .35], I: .9, shadow: true });
}

function gameDraw() {
  for (const l of SW_LAMPS) {
    for (let y = SW_MAP.tc * ASPECT; y < l.y; y += 8 * PX) drawSprite(CABLE_SPR, l.x, y, 0, {});
    drawSprite(LAMP_SPR, l.x, l.y, 0, {});
  }
  for (const ch of SW_CHEESE) if (!ch.got) drawSprite(CHEESE_SPR, ch.x, ch.y - (2 + Math.sin(stateT * 3 + ch.x) * 1.5) * PX, 0, {});
  if (SW_GOAL) drawSprite(GOAL_SPR, SW_GOAL.x, SW_GOAL.y, 0, { flash: SW_GOAL.got ? 0 : .08 + .06 * Math.sin(stateT * 4) });
  if (PIP) pipDraw();
}

function gameHud() {
  if (state !== 'play' || !PIP) return;
  hudText(2, 1, `CHEESE ${PIP.cheese}/${SW_CHEESE.length}`, HC.gold);
  const c = PIP.c, what = !c.onGround ? 'JUMP' : Math.abs(c.vx) < 8 * PX ? 'IDLE' : action('run') > .5 && Math.abs(c.vx) > TUNE.walkSpeed * 1.15 * PX ? 'RUN' : 'WALK';
  hudText(2, 2, what, HC.dim);
}

Pixelite.run({
  id: 'spacewhiskers',
  detail: { levels: [2], default: 2 },
  zoom: { default: 1, min: .1, max: 8, wheel: false, pinch: false },   // only fitView zooms: the screen is the agreed size
  stars: 1,
  shell: true,
  touch: [[{ label: '[<]', aria: 'Left', hold: 'left' }, { label: '[>]', aria: 'Right', hold: 'right' }, { label: '[v]', aria: 'Down', hold: 'down' }],
    [{ label: '[RUN]', aria: 'Run', hold: 'run' }, { label: '[JUMP]', aria: 'Jump', hold: 'jump' }]],
  init() {
    setSun(null); setAmbient([.17, .18, .24]); setBackdrop({ dim: .95, shadow: .55, lamps: true }); setBackground(8, 10, 20);
    newLevel(); setState('title');
    window.addEventListener('resize', () => setTimeout(fitView, 0));
  },
  regenerate() { const was = state; newLevel(); setState(was === 'play' ? 'play' : 'title'); },
  start() { setState('play'); },
  restart() { newLevel(); setState('play'); },
  update(dt) { fitView(); if (state === 'play') pipUpdate(dt); },
  lights: gameLights,
  draw: gameDraw,
  hud: gameHud,
  skyBegin(ox, oy) { SKY[0] = ox; SKY[1] = oy; },
  sky: skyCell,
  onTune(key) { if (key === 'screenWidth') fitView(); else pipTune(); },
  probe: () => ({
    pip: PIP && { x: +PIP.c.x.toFixed(1), y: +PIP.c.y.toFixed(1), vx: +PIP.c.vx.toFixed(1), vy: +PIP.c.vy.toFixed(1), ground: PIP.c.onGround, facing: PIP.c.facing, frame: Object.keys(PIP_SPR).find(k => PIP_SPR[k] === PIP.frame), cheese: PIP.cheese },
    cheese: SW_CHEESE.length, goal: !!(SW_GOAL && SW_GOAL.got), view: [R.cols, R.rows], zoom: getZoom(),
  }),
});
