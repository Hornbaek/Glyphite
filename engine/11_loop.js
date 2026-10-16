// ===================== ENGINE · runtime: loop, camera, detail, boot =====================
// A game is one object of hooks handed to Glyphite.run() (see engine/API.md for the full contract):
//   Glyphite.run({
//     id: 'mygame',                       saved settings are keyed by it
//     touch: [[...], [...]],              on-screen buttons (see setupInput)
//     keys: { detail, bloom, mute, pause } built-in keys; each defaults to true
//     detail: { default: 2, narrow: 1.5 } starting detail level on wide / narrow screens
//     particles: 9000,                    particle budget at RES 1 (scaled by RES)
//     cameraTop: -80,                     how far above the world top the camera may go (base units)
//     init(data)                          once, after the renderer is ready (data: hot-reload snapshot)
//     regenerate()                        the detail level changed: rebuild the world at the new RES
//     update(dt)                          one fixed step of game logic; the engine's world systems run after it
//     camera(VW, VH, out)                 where the camera wants its top-left corner: out = [x, y] in units
//     markDyn()                           mark moving bodies as shadow casters; return the top row they cover
//     lights(t, out)                      push this frame's lights
//     draw(t)                             draw game objects into the world grid
//     hud(t)                              draw the HUD grid
//     afterFrame(t)                       after the frame is presented (music, DOM updates)
//     onKey(code)                         one-shot key presses the built-in keys did not take
//     onBlast(x, y, R, power, quiet)      after every explosion
//     chunkStep(ch)                       for each falling chunk, every step (collide it with game bodies)
//     skyBegin, sky, stars                paint the sky layer (see renderSky)
//     onTune(key, value)                  a tunable changed while running (the web editor)
//     start()                             leave the title screen (tests call it; default: press Enter)
//     snapshot()                          state to keep across a hot reload
//     probe()                             a small JSON-able summary of the game, for tests and AI sessions
//   })
// The game state is the engine globals `state` (a string) and `stateT` (seconds in it); setState()
// switches. 'title' shows the #titleBar buttons, 'paused' stops time, 'play' is where slow-frame hints
// appear. Everything else is up to the game.
let state = 'title', stateT = 0, perfAvg = 16, toastMsg = null;
function setState(s) { state = s; stateT = 0; }
function say(text) { toastMsg = { text: text.slice(0, Math.max(10, R.hcols - 6)), t0: performance.now() / 1000 }; }
const storeKey = k => `${GAME.id || 'glyphite'}.${k}`;
const detailLabel = () => `${RES.toFixed(1)}x`;

// ---------- tunables: numbers a game exposes in game.json, editable live from the web editor ----------
// TUNE.<key> starts at the manifest value, overridden by window.GLYPHITE_TUNE (set by the editor's
// preview) and by ?tune={"key":value} in the page URL. The editor sends changes while the game runs;
// GAME.onTune(key, value) hears them.
const TUNE = {};
function loadTunables(manifest) {
  const defs = (manifest && manifest.tunables) || {};
  for (const k in defs) TUNE[k] = defs[k].value;
  let url = null; try { url = JSON.parse(new URLSearchParams(location.search).get('tune') || 'null'); } catch (e) { }
  for (const src of [window.GLYPHITE_TUNE, url]) if (src && typeof src === 'object') for (const k in src) if (k in defs && typeof src[k] === typeof defs[k].value) TUNE[k] = src[k];
}
loadTunables(typeof GAME_MANIFEST !== 'undefined' ? GAME_MANIFEST : null);
window.addEventListener('message', e => {
  const d = e.data;
  if (e.source !== window.parent || !d || d.type !== 'glyphite:tune' || !d.values) return;
  for (const k in d.values) if (k in TUNE && typeof d.values[k] === typeof TUNE[k]) { TUNE[k] = d.values[k]; if (GAME.onTune) GAME.onTune(k, TUNE[k]); }
});

// ---------- camera ----------
const _camT = [0, 0];
function updateCamera(dt, snap) {
  const VW = R.cols, VH = R.rows * ASPECT;
  _camT[0] = cam.x; _camT[1] = cam.y;
  if (GAME.camera) GAME.camera(VW, VH, _camT);
  const tx = clamp(_camT[0], 0, Math.max(0, W - VW)), ty = clamp(_camT[1], (GAME.cameraTop ?? -80) * RES, H * ASPECT - VH);
  const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

// ---------- one fixed step, one frame ----------
// Tests and AI probes step the game with update(DT) in a loop and freeze it with window.update = () => {}.
function update(dt) {
  frameNo++; stateT += dt;
  if (GAME.update) GAME.update(dt);
  Input.pressed.clear(); Input.fireQueued = false;
  stepWorld(dt);
  updateCamera(dt);
}
// the engine's world systems: falling chunks, particles, sand, heat and effects
function stepWorld(dt) {
  if (chunks.length || rechecks.length) stepChunks(dt);
  stepParticles(dt); simGranular();
  const cx = Math.floor(cam.x), cy = Math.floor(cam.y / ASPECT), m = Math.round(20 * RES);
  coolHeat(cx - m, cy - m, cx + R.cols + m, cy + R.rows + m);
  stepFX(dt);
}

const _lights = [];
function gatherLights(t) {
  _lights.length = 0;
  if (GAME.lights) GAME.lights(t, _lights);
  const S = RES;
  for (const l of FX.lights) { const u = l.age / l.life; _lights.push({ x: l.x, y: l.y, r: Math.min(48 * S, l.r), c: l.c, I: l.I * (1 - u) * (1 - u), shadow: l.shadow }); }
  return _lights;
}
function drawToast() {
  const t = performance.now() / 1000;
  if (!toastMsg || t - toastMsg.t0 > 1.6) return;
  const s = toastMsg.text, c0 = Math.floor((R.hcols - s.length - 4) / 2), r0 = state === 'title' ? Math.floor(R.hrows * .32) : Math.max(5, Math.floor(R.hrows * .76));
  hudBox(c0, r0, s.length + 4, 3, HC.dim, true); hudText(c0 + 2, r0 + 1, s, HC.cyan);
}
function draw(t) {
  updateSkyline();
  clearDyn();
  let dynTop = markChunksDyn();
  if (GAME.markDyn) dynTop = Math.min(dynTop, GAME.markDyn());
  const ox = Math.floor(cam.x) - 1, oy = Math.floor(cam.y / ASPECT) - 1;
  const fx = cam.x - Math.floor(cam.x), fy = cam.y / ASPECT - Math.floor(cam.y / ASPECT);
  computeLighting(ox, oy, gatherLights(t), dynTop);
  renderScene(ox, oy, t, GAME.draw ? () => GAME.draw(t) : null);
  hudClear(); if (GAME.hud) GAME.hud(t); drawToast();
  presentFrame(fx, fy, t);
  const bar = document.getElementById('titleBar');
  if (bar && bar.hidden !== (state !== 'title')) bar.hidden = state !== 'title';
  if (GAME.afterFrame) GAME.afterFrame(t);
}

let lastT = 0, acc = 0, slowT = 0, slowHinted = false;
function frame(now) {
  const real = Math.min(.1, (now - lastT) / 1000 || DT); lastT = now;
  if (FX.slowT > 0) { FX.slowT -= real; FX.slow = .22; } else FX.slow = Math.min(1, FX.slow + real * 1.2);
  acc += real * (state === 'paused' ? 0 : FX.slow);
  let n = 0; while (acc >= DT && n < 3) { update(DT); acc -= DT; n++; }
  if (n === 3) acc = 0;
  draw(now / 1000);
  perfAvg = lerp(perfAvg, real * 1000, .04);
  // once per session, suggest coarser detail when frames are slow
  if (perfAvg > 34 && state === 'play' && RES > 1) { slowT += real; if (slowT > 4 && !slowHinted) { slowHinted = true; say('RUNNING SLOW - PRESS - FOR LESS DETAIL'); } } else slowT = 0;
  requestAnimationFrame(frame);
}

// ---------- detail level: rebuilds the world with more (or fewer) characters per metre ----------
let resizeNow = () => { };
function setDetail(r, announce) {
  if (!DETAIL_LEVELS.includes(r)) r = 2;
  setResVars(r);
  particlesAlloc(Math.round((GAME.particles || 9000) * r));
  try { localStorage.setItem(storeKey('detail'), String(r)); } catch (e) { }
  resizeNow();
  if (GAME.regenerate) GAME.regenerate();
  updateCamera(0, true);
  const btn = document.getElementById('detailBtn'); if (btn) btn.textContent = `[ DETAIL ${detailLabel()} ]`;
  if (announce) say(`DETAIL ${detailLabel()} - ${R.cols} x ${R.rows} CHARACTERS`);
}
function stepDetail(dir) {
  const i = DETAIL_LEVELS.indexOf(RES), j = clamp(i + dir, 0, DETAIL_LEVELS.length - 1);
  if (j !== i) setDetail(DETAIL_LEVELS[j], true);
}

// built-in keys first (each can be switched off with GAME.keys), then the game's own
function engineKey(code) {
  const k = GAME.keys || {};
  if (k.mute !== false && code === 'KeyM') Sfx.toggle();
  else if (k.bloom !== false && code === 'KeyG') R.bloom = !R.bloom;
  else if (k.detail !== false && (code === 'Minus' || code === 'NumpadSubtract')) stepDetail(-1);
  else if (k.detail !== false && (code === 'Equal' || code === 'NumpadAdd')) stepDetail(1);
  else if (k.pause !== false && (code === 'KeyP' || code === 'Escape') && (state === 'play' || state === 'paused')) state = state === 'play' ? 'paused' : 'play';
  else if (GAME.onKey) GAME.onKey(code);
}

function boot(data) {
  data = data || {};
  const stage = document.getElementById('stage');
  renderInit(document.getElementById('screen'));
  resizeNow = () => { const r = stage.getBoundingClientRect(); if (r.width > 0 && r.height > 0) renderResize(r.width, r.height); };
  let saved = 0; try { saved = parseFloat(localStorage.getItem(storeKey('detail'))); } catch (e) { }
  const narrow = stage.getBoundingClientRect().width < 640, dd = GAME.detail || {};
  const r0 = DETAIL_LEVELS.includes(data.detail) ? data.detail : DETAIL_LEVELS.includes(saved) ? saved : narrow ? (dd.narrow ?? 1.5) : (dd.default ?? 2);
  setResVars(r0); particlesAlloc(Math.round((GAME.particles || 9000) * r0));
  resizeNow();
  const onResize = () => { resizeNow(); if (W) updateCamera(0, true); };
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage); else window.addEventListener('resize', onResize);
  setupInput(R.canvas, engineKey, GAME.touch);
  const btn = document.getElementById('detailBtn');
  if (btn) {
    btn.textContent = `[ DETAIL ${detailLabel()} ]`;
    btn.addEventListener('click', e => { e.stopPropagation(); const i = DETAIL_LEVELS.indexOf(RES); setDetail(DETAIL_LEVELS[(i + 1) % DETAIL_LEVELS.length], true); });
  }
  if (GAME.init) GAME.init(data);
  updateCamera(0, true);
  if (document.fonts && document.fonts.load) document.fonts.load(`700 16px "JetBrains Mono"`).then(() => document.fonts.load(`16px "JetBrains Mono"`)).then(() => { if (R.cw) { buildAtlases(); SPR_SHAPES = null; } }).catch(() => { });
  window.claude?.hot?.snapshot?.(() => ({ detail: RES, ...(GAME.snapshot ? GAME.snapshot() : {}) }));
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

// ---------- the public object: run a game, and drive it from tests ----------
const _engineUpdate = update;
const Glyphite = {
  version: '0.4.0',
  run(game) {
    GAME = game;
    window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
  },
  // Test and probe helpers (headless checks, AI sessions). They step the simulation directly, so they
  // work while the frame loop is frozen and run far faster than real time.
  test: {
    start() { if (GAME.start) GAME.start(); else engineKey('Enter'); },
    press(code) { Input.pressed.add(code); engineKey(code); },
    // n fixed steps with these KeyboardEvent codes held (e.g. ['ArrowUp']); returns probe()
    step(n = 1, keys = []) {
      for (const k of keys) Input.keys.add(k);
      for (let i = 0; i < n; i++) _engineUpdate(DT);
      for (const k of keys) Input.keys.delete(k);
      return Glyphite.test.probe();
    },
    freeze() { if (!window.__glyphiteUpdate) { window.__glyphiteUpdate = window.update; window.update = () => { }; } },
    unfreeze() { if (window.__glyphiteUpdate) { window.update = window.__glyphiteUpdate; window.__glyphiteUpdate = null; } },
    render(t = performance.now() / 1000) { draw(t); },
    probe() {
      return { state, stateT: +stateT.toFixed(2), frame: frameNo, res: RES, renderer: R.mode, cols: R.cols, rows: R.rows,
        world: [W, H], cam: [+cam.x.toFixed(1), +cam.y.toFixed(1)], particles: P.n, chunks: chunks.length, perfMs: +perfAvg.toFixed(1),
        tune: { ...TUNE }, game: GAME.probe ? GAME.probe() : null };
    }
  }
};
window.Glyphite = Glyphite;
