'use strict';
// ===================== GAME · the level, the view, the look, the HUD, Pixelite.run =====================
// One detail level (RES 2: one cell is one pixel of Pip's art) and a view of TUNE.screenWidth game pixels across (480 x 270, the agreed
// screen): the engine's zoom makes each cell a whole number of device pixels, about the screen's size, whatever the window (fitView).
let SW_MAP = null, SW_CHEESE = [], SW_GOAL = null;
const listOf = v => (!v ? [] : typeof v[0] === 'number' ? [v] : v);   // loadTileMap keeps a single spawn as [x, y]

function newLevel() {
  PROPS.length = 0;
  SW_MAP = loadTileMap(levelRows(), LEGEND, { tile: 4 });
  paintBackWall(SW_MAP);
  SW_CHEESE = listOf(SW_MAP.spawns.cheese).map(([x, y]) => ({ x, y, got: false }));
  SW_LAMPS = [['lamp', 'ceiling'], ['alarm', 'alarm'], ['blue', 'blue']].flatMap(([spawn, kind]) => listOf(SW_MAP.spawns[spawn]).map(([x, y]) => ({ x, y: y - (kind === 'ceiling' ? SW_MAP.tc * ASPECT : SW_MAP.tc * ASPECT / 2), kind })));   // a ceiling lamp hangs from the top of its tile, a wall lamp sits in the middle of it
  SW_GOAL = listOf(SW_MAP.spawns.goal).map(([x, y]) => ({ x, y, got: false }))[0] || null;
  const [px, py] = listOf(SW_MAP.spawns.pip)[0];
  spawnPip(px, py);
  SW_CAM.fresh = true; SW_CAM.look = 0; SW_CAM.floor = py;
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

// The camera is locked to Pip on the cell grid (the engine's own easing is off, cameraEase below): the view's left edge is his whole-cell position
// minus a gentle look-ahead (about 30 cells the way he runs, eased in over half a second), so he never lags behind and a cell of him is always a cell of the picture (no shimmer, and a scrolling that is
// exactly his speed); its top edge settles on the floor he stands on, so a jump does not bob the screen, while a long fall or a high jump pulls
// it along (his feet stay between 20% and 86% of the view's height). Once per fixed step.
const SW_CAM = { look: 0, y: 0, floor: 0, fresh: true };
function swCamera(VW, VH, out) {
  const p = PIP; if (!p) return;
  const c = p.c;
  if (c.onGround) SW_CAM.floor = c.y;
  if (Math.abs(c.vx) > 30 * PX) SW_CAM.look += (Math.sign(c.vx) * VW * .06 - SW_CAM.look) * .035;   // looks ahead the way he is going; standing, it stays where it was
  const want = SW_CAM.floor - VH * .64;
  SW_CAM.y = SW_CAM.fresh ? want : SW_CAM.y + (want - SW_CAM.y) * .12; SW_CAM.fresh = false;
  SW_CAM.y = clamp(SW_CAM.y, c.y - VH * .86, c.y - VH * .2);
  out[0] = Math.round(c.x) - Math.round(VW / 2) + Math.round(SW_CAM.look);
  out[1] = Math.round(SW_CAM.y);
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

function gameDraw() {
  swLampsDraw();
  for (const ch of SW_CHEESE) if (!ch.got) drawSprite(CHEESE_SPR, ch.x, ch.y - (2 + Math.sin(stateT * 3 + ch.x) * 1.5) * PX, 0, { cache: true });
  if (SW_GOAL) drawSprite(GOAL_SPR, SW_GOAL.x, SW_GOAL.y, 0, { flash: SW_GOAL.got ? 0 : .08 + .06 * Math.sin(stateT * 4), cache: true });
  if (PIP) pipDraw();
}

function gameHud() {
  if (state !== 'play' || !PIP) return;
  hudText(2, 1, `CHEESE ${PIP.cheese}/${SW_CHEESE.length}`, HC.gold);
  hudText(2, 2, `${PIP.mode.toUpperCase()} ${Math.round(Math.abs(PIP.c.vx) / PX)}`, HC.dim);
  swLightsHud();
}

Pixelite.run({
  id: 'spacewhiskers',
  detail: { levels: [2], default: 2 },
  zoom: { default: 1, min: .1, max: 8, wheel: false, pinch: false },   // only fitView zooms: the screen is the agreed size
  cameraTop: 0, cameraEase: 1000,   // the camera never shows above the roof, and swCamera does all the smoothing (the engine's would put it off the cell grid)
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
  update(dt) { fitView(); if (state === 'play') { swTestInput(); pipUpdate(dt); } },
  camera: swCamera,
  markDyn() { return PIP ? pipMark() : 1e9; },
  onKey: swTestKey,
  lights: swLights,
  draw: gameDraw,
  hud: gameHud,
  skyBegin(ox, oy) { SKY[0] = ox; SKY[1] = oy; },
  sky: skyCell,
  onTune(key) { if (key === 'screenWidth') fitView(); else pipTune(); },
  probe: () => ({
    pip: PIP && { x: +PIP.c.x.toFixed(1), y: +PIP.c.y.toFixed(1), vx: +PIP.c.vx.toFixed(1), vy: +PIP.c.vy.toFixed(1), ground: PIP.c.onGround, facing: PIP.c.facing, frame: Object.keys(PIP_SPR).find(k => PIP_SPR[k] === PIP.frame), cheese: PIP.cheese },
    cheese: SW_CHEESE.length, lights: SW_TEST.list.length, goal: !!(SW_GOAL && SW_GOAL.got), view: [R.cols, R.rows], zoom: getZoom(),
  }),
});
