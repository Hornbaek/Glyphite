// ===================== ENGINE · runtime: loop, camera, detail, boot =====================
// A game is one object of hooks handed to Pixelite.run() (see engine/API.md for the full contract):
//   Pixelite.run({
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
//     levels: { play(i, tile), check(i) } the web editor's LEVELS tab: start map i (at tile [x, y]); can map i be finished?
//   })
// The game state is the engine globals `state` (a string) and `stateT` (seconds in it); setState()
// switches. 'title' shows the #titleBar buttons, 'paused' stops time, 'play' is where slow-frame hints
// appear. Everything else is up to the game.
let state = 'title', stateT = 0, perfAvg = 16;
function setState(s) { const prev = state; if (STATES && STATES[prev] && STATES[prev].exit) STATES[prev].exit(s); state = s; stateT = 0; if (STATES && STATES[s] && STATES[s].enter) STATES[s].enter(prev); }
// Pause is a flag, so a game in any state can be paused. A game that names its pause state 'paused' keeps working: setting
// state = 'paused' pauses, and pausing from 'play' still switches to it. Pixelite.pause(on) flips it; the page pauses itself
// when it is hidden (a game that loses focus must not keep falling).
let PAUSED = false;
const isPaused = () => PAUSED || state === 'paused';
function setPaused(on) {
  on = on === undefined ? !isPaused() : !!on;
  if (on === isPaused()) return;
  if (on) { if (state === 'play') state = 'paused'; else PAUSED = true; }
  else { PAUSED = false; if (state === 'paused') state = 'play'; }
  Input.pressed.clear(); Input.fireQueued = false; Input.drag[0] = Input.drag[1] = 0; Input.pinch = 0;
}
// The simulation's clock for drawing: whole steps plus the part of a step not yet run. It stops in pause and slows in slow motion,
// and a test that steps by hand gets the same time every run (the wall clock only runs the toast).
let clockT = 0, REC = null;
// ---------- errors: shown, not swallowed ----------
// In ?dev and in the editor's preview an overlay says what broke and where (the source file and line, from the '// ----- path -----'
// markers the assembler writes); a player sees one line on the HUD instead of a frozen picture.
const DEV = /[?&]dev\b/.test(location.search) || window.parent !== window;
const ERRORS = [];
function sourceLine(line) {   // a line of the page's script -> 'games/<id>/file.js:line'
  const el = document.querySelector('body > script'); if (!el || typeof PIXELITE_LINE0 === 'undefined') return '';
  const lines = el.textContent.split('\n'), n = line - PIXELITE_LINE0 + 1;   // index into the script text (its first line is PIXELITE_LINE0 + 0 of the page)
  for (let i = Math.min(n, lines.length) - 1, k = 0; i >= 0; i--, k++) { const m = /^\/\/ ----- (.+) -----$/.exec(lines[i]); if (m) return `${m[1]}:${k}`; }
  return '';
}
function reportError(msg, line) {
  const where = line ? sourceLine(line) : '';
  ERRORS.push(where ? `${msg} (${where})` : String(msg));
  if (ERRORS.length > 1) return;
  if (DEV) {
    const d = document.createElement('pre'); d.id = 'pixeliteError';
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;margin:0;padding:8px 12px;background:#300;color:#fdd;font:12px/1.4 ui-monospace,Consolas,monospace;white-space:pre-wrap;z-index:9;max-height:40vh;overflow:auto';
    d.textContent = ERRORS[0]; document.body.appendChild(d);
  }
}
window.addEventListener('error', e => reportError(e.message || 'error', e.lineno));
window.addEventListener('unhandledrejection', e => reportError('unhandled promise: ' + (e.reason && e.reason.message || e.reason)));
const storeKey = k => `${GAME.id || 'glyphite'}.${k}`;   // the old name stays in the key, so saves made before the rename to Pixelite survive
const detailLabel = () => `${RES.toFixed(1)}x`;

// ---------- tunables: numbers a game exposes in game.json, editable live from the web editor ----------
// TUNE.<key> starts at the manifest value, overridden by window.PIXELITE_TUNE (set by the editor's
// preview) and by ?tune={"key":value} in the page URL. The editor sends changes while the game runs;
// GAME.onTune(key, value) hears them.
const TUNE = {};
function loadTunables(manifest) {
  const defs = (manifest && manifest.tunables) || {};
  for (const k in defs) TUNE[k] = defs[k].value;
  let url = null; try { url = JSON.parse(new URLSearchParams(location.search).get('tune') || 'null'); } catch (e) { }
  for (const src of [window.PIXELITE_TUNE, url]) if (src && typeof src === 'object') for (const k in src) if (k in defs && typeof src[k] === typeof defs[k].value) TUNE[k] = src[k];
}
loadTunables(typeof GAME_MANIFEST !== 'undefined' ? GAME_MANIFEST : null);
window.addEventListener('message', e => {
  const d = e.data;
  if (e.source !== window.parent || !d || d.type !== 'pixelite:tune' || !d.values) return;
  for (const k in d.values) if (k in TUNE && typeof d.values[k] === typeof TUNE[k]) { TUNE[k] = d.values[k]; if (GAME.onTune) GAME.onTune(k, TUNE[k]); }
});
// The editor's LEVELS tab drives the preview: { type: 'pixelite:level', action: 'play', level, tile } starts that map (at that
// tile) and 'check' asks the game whether it can be finished; the answer goes back as 'pixelite:levelcheck'.
window.addEventListener('message', e => {
  const d = e.data;
  if (e.source !== window.parent || !d || d.type !== 'pixelite:level' || !GAME.levels) return;
  if (d.action === 'play' && GAME.levels.play) { GAME.levels.play(d.level | 0, d.tile || null); updateCamera(0, true); try { R.canvas.focus({ preventScroll: true }); } catch (err) { } }
  else if (d.action === 'check') {
    let result;
    try { result = GAME.levels.check ? GAME.levels.check(d.level | 0) : { error: 'this game cannot check its levels' }; } catch (err) { result = { error: String(err && err.message || err) }; }
    window.parent.postMessage({ type: 'pixelite:levelcheck', id: d.id, level: d.level, result }, '*');
  }
});

// The SOUND STUDIO previews a song inside the game: { type: 'pixelite:music', song } plays it instead of the game's own music
// (Sampler.force), song: null gives the music back to the game.
window.addEventListener('message', e => {
  const d = e.data;
  if (e.source !== window.parent || !d || d.type !== 'pixelite:music') return;
  try { Sampler.force(d.song || null); } catch (err) { console.warn('pixelite:music', err); }
});

// ---------- camera ----------
// A camera rig (setCamera) does what every platformer wrote by hand; the game's camera() hook still overrides it if both are there.
//   setCamera({ follow: hero | () => [x, y], lead: .3, deadzone: [.2, .3], ease: 3.2, bounds: [x0, y0, x1, y1], rooms: { w, h }, offset: [0, -4] })
// follow: anything with x and y (a Character, an entity: its middle is aimed at; a Character's vx / vy give the look-ahead); lead: seconds of
// its velocity to look ahead; deadzone: the share of the view [width, height] it can move in before the camera follows (it also stops the
// camera trailing a long fall: the dead zone is on the camera's actual position); rooms: screen-by-screen, the camera jumps from room to
// room (w, h in units; default the view); bounds: the most the camera may show (units); ease: how fast it catches up (per second).
// setCamera(null) goes back to the game's own camera(). cameraShake(n) adds trauma (0..1) to the screen shake.
let CAMRIG = null;
function setCamera(o) { CAMRIG = o ? { ...o } : null; }
const cameraShake = n => { FX.shake = Math.min(1.4, FX.shake + n); };
function rigCamera(VW, VH, out) {
  const rig = CAMRIG, f = rig.follow; if (!f) return;
  let tx, ty, vx = 0, vy = 0;
  if (typeof f === 'function') { const p = f(); tx = p[0]; ty = p[1]; } else { tx = f.x; ty = f.y - (f.o ? f.o.h * .6 : (f.h || 0) * .5); vx = f.vx || 0; vy = f.vy || 0; }
  if (rig.offset) { tx += rig.offset[0] * RES; ty += rig.offset[1] * RES; }
  if (rig.rooms) {
    const rw = (rig.rooms.w || VW), rh = (rig.rooms.h || VH), cx = Math.floor(tx / rw), cy = Math.floor(ty / rh);
    out[0] = cx * rw - Math.max(0, VW - rw) / 2; out[1] = cy * rh - Math.max(0, VH - rh) / 2;
  } else {
    tx += vx * (rig.lead || 0); ty += vy * (rig.lead || 0) * .5;
    const dz = rig.deadzone, ccx = cam.x + VW / 2, ccy = cam.y + VH / 2;
    let nx = tx, ny = ty;
    if (dz) { const hw = VW * dz[0] / 2, hh = VH * dz[1] / 2; nx = tx > ccx + hw ? tx - hw : tx < ccx - hw ? tx + hw : ccx; ny = ty > ccy + hh ? ty - hh : ty < ccy - hh ? ty + hh : ccy; }
    out[0] = nx - VW / 2; out[1] = ny - VH / 2;
  }
  if (rig.bounds) { out[0] = clamp(out[0], rig.bounds[0], Math.max(rig.bounds[0], rig.bounds[2] - VW)); out[1] = clamp(out[1], rig.bounds[1], Math.max(rig.bounds[1], rig.bounds[3] - VH)); }
}
const _camT = [0, 0];
function updateCamera(dt, snap) {
  const VW = R.cols, VH = R.rows * ASPECT;
  _camT[0] = cam.x; _camT[1] = cam.y;
  if (CAMRIG) rigCamera(VW, VH, _camT);
  if (GAME.camera) GAME.camera(VW, VH, _camT);
  const tx = clamp(_camT[0], 0, Math.max(0, W - VW)), ty = clamp(_camT[1], (GAME.cameraTop ?? -80) * RES, H * ASPECT - VH);
  const k = snap ? 1 : 1 - Math.exp(-dt * (CAMRIG ? CAMRIG.ease ?? (CAMRIG.rooms ? 7 : 3.2) : GAME.cameraEase ?? 3.2));
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

// ---------- one fixed step, one frame ----------
// Tests and AI probes step the game with update(DT) in a loop and freeze it with window.update = () => {}.
function update(dt) {
  const q = performance.now();
  frameNo++; stateT += dt;
  stepActions(); stepCapture(); stepUi(); stepShell();
  if (stepRewind()) { updateCamera(dt); return; }   // held rewind: this step puts the world back instead of playing
  if (chunks.length) stepPlatforms(dt);
  if (GAME.update) GAME.update(dt);
  if (STATES && STATES[state] && STATES[state].update) STATES[state].update(dt);
  stepEntities(dt); stepTimers(dt); stepTriggers();
  if (CHUNK_CONTACTS && chunks.length > 1) stepChunkContacts();
  Input.pressed.clear(); Input.fireQueued = false; Input.drag[0] = Input.drag[1] = 0; Input.pinch = 0;
  stepWorld(dt);
  updateCamera(dt);
  perfAdd('step', performance.now() - q);
}
// the engine's world systems: falling chunks, particles, sand, heat and effects
function stepWorld(dt) {
  if (chunks.length || rechecks.length) stepChunks(dt);
  stepParticles(dt); simGranular();
  const cx = Math.floor(cam.x), cy = Math.floor(cam.y / ASPECT), m = Math.round(20 * RES);
  coolHeat(cx - m, cy - m, cx + R.cols + m, cy + R.rows + m);
  stepFX(dt);
}

const _lights = [], _lightPool = [];
// the effect lights and the moment-copies of flickering lights are pooled objects, reused from frame to frame instead of allocated; they
// always carry the same fields, so a lamp never sees a cone or a skip left over from an earlier use
function poolLight(n) { return _lightPool[n] || (_lightPool[n] = { x: 0, y: 0, r: 0, c: null, I: 0, shadow: false, flicker: null, seed: 0, cos: undefined, dx: undefined, dy: undefined, skip: undefined }); }
function gatherLights(t) {
  _lights.length = 0;
  if (GAME.lights) GAME.lights(t, _lights);
  if (entities.length) entityLights(t, _lights);
  if (DEV) for (const l of _lights) devFinite('a light', l.x, l.y, l.r, l.I);
  const S = RES; let used = 0;
  for (const l of FX.lights) { const u = l.age / l.life, o = poolLight(used++); o.x = l.x; o.y = l.y; o.r = Math.min(48 * S, l.r); o.c = l.c; o.I = l.I * (1 - u) * (1 - u); o.shadow = l.shadow; o.flicker = l.flicker; o.seed = l.seed; o.cos = o.dx = o.dy = o.skip = undefined; _lights.push(o); }
  // flickering lights get a copy with this moment's intensity (games may push the same object every frame)
  for (let i = 0; i < _lights.length; i++) {
    const L = _lights[i]; if (!L.flicker) continue;
    const o = poolLight(used++); o.x = L.x; o.y = L.y; o.r = L.r; o.c = L.c; o.I = L.I * flickerAt(L.flicker, t, L.seed || 0); o.shadow = L.shadow; o.flicker = null; o.seed = L.seed; o.cos = L.cos; o.dx = L.dx; o.dy = L.dy; o.skip = L.skip; _lights[i] = o;
  }
  return _lights;
}
function draw(t) {
  perfBegin();
  syncSkyline();
  clearDyn();
  let dynTop = markChunksDyn();
  if (GAME.markDyn) dynTop = Math.min(dynTop, GAME.markDyn());
  if (entities.length) dynTop = Math.min(dynTop, markEntitiesDyn());
  const ox = Math.floor(cam.x) - 1, oy = Math.floor(cam.y / ASPECT) - 1;
  const fx = cam.x - Math.floor(cam.x), fy = cam.y / ASPECT - Math.floor(cam.y / ASPECT);
  computeLighting(ox, oy, gatherLights(t), dynTop); perfLap('light');
  renderScene(ox, oy, t, () => {
    if (PROPS.length) drawProps(false); if (entities.length) drawEntities(t, false); if (STATES && STATES[state] && STATES[state].draw) STATES[state].draw(t); if (GAME.draw) GAME.draw(t);
    // the front pass: what stands in front of everything above (a character walks behind grass and pillars)
    if (PROPS.length) drawProps(true); if (entities.length) drawEntities(t, true); if (STATES && STATES[state] && STATES[state].drawFront) STATES[state].drawFront(t); if (GAME.drawFront) GAME.drawFront(t);
  }); perfLap('scene');
  hudClear(); HUDBTNS.length = 0; ACTIVE_MENU = null;
  if (GAME.hud) GAME.hud(t); if (STATES && STATES[state] && STATES[state].hud) STATES[state].hud(t);
  drawFloatingTexts(); drawShell(t); drawFeed(); perfOverlay(); perfLap('hud');
  presentFrame(fx, fy, t); perfLap('present');
  const bar = document.getElementById('titleBar');
  if (bar && bar.hidden !== (state !== 'title')) bar.hidden = state !== 'title';
  if (GAME.afterFrame) GAME.afterFrame(t);
}

let lastT = 0, acc = 0, slowT = 0, slowHinted = false;
function frame(now) {
  const real = Math.min(.1, (now - lastT) / 1000 || DT); lastT = now;
  if (FX.slowT > 0) { FX.slowT -= real; FX.slow = .22; } else FX.slow = Math.min(1, FX.slow + real * 1.2);
  const paused = isPaused();
  acc += real * (paused ? 0 : FX.slow);
  // presses made while paused would all fire on the first step after resuming: drop them (while running, update() clears them)
  if (paused) { stepActions(); stepCapture(); stepUi(); Input.pressed.clear(); Input.fireQueued = false; Input.drag[0] = Input.drag[1] = 0; Input.pinch = 0; }
  let n = 0; while (acc >= DT && n < 3) { update(DT); acc -= DT; n++; }
  if (n === 3) acc = 0;
  clockT = frameNo * DT + acc;
  draw(clockT);
  perfAvg = lerp(perfAvg, real * 1000, .04);
  // once per session, suggest coarser detail when frames are slow
  if (perfAvg > 34 && state === 'play' && !PAUSED && RES > 1) { slowT += real; if (slowT > 4 && !slowHinted) { slowHinted = true; say('RUNNING SLOW - PRESS - FOR LESS DETAIL'); } } else slowT = 0;
  requestAnimationFrame(frame);
}

// ---------- detail level: rebuilds the world with more (or fewer) characters per metre ----------
let resizeNow = () => { };
// The detail levels this game offers: all five, or the few it lists in Pixelite.run({ detail: { levels: [2] } }) (pixel art has one native size:
// then the keys and button are gone, and tests and the "same at RES 1-3" rule only cover the declared levels).
const levelsOf = () => (GAME.detail && GAME.detail.levels) || DETAIL_LEVELS;
function setDetail(r, announce) {
  const lv = levelsOf(); if (!lv.includes(r)) r = lv.includes(2) ? 2 : lv[0];
  const was = RES;
  setResVars(r);
  particlesAlloc(Math.round((GAME.particles || 9000) * r));
  try { localStorage.setItem(storeKey('detail'), String(r)); } catch (e) { }
  resizeNow();
  if (GAME.regenerate) GAME.regenerate(); else rescaleWorld(RES / was);   // no regenerate(): the same world, resampled
  updateCamera(0, true);
  const btn = document.getElementById('detailBtn'); if (btn) btn.textContent = `[ DETAIL ${detailLabel()} ]`;
  if (announce) say(`DETAIL ${detailLabel()} - ${R.cols} x ${R.rows} PIXELS`);
}
function stepDetail(dir) {
  const lv = levelsOf(), i = lv.indexOf(RES), j = clamp(i + dir, 0, lv.length - 1);
  if (j !== i) setDetail(lv[j], true);
}

// built-in keys first (each can be switched off with GAME.keys), then the game's own
function engineKey(code) {
  const k = GAME.keys || {};
  if (CAPTURE) captureKey(code);
  else if (k.mute !== false && code === 'KeyM') setSetting('mute', !SETTINGS.mute);
  else if (k.bloom !== false && code === 'KeyG') setSetting('bloom', !R.bloom);
  else if (k.detail !== false && (code === 'Minus' || code === 'NumpadSubtract')) stepDetail(-1);
  else if (k.detail !== false && (code === 'Equal' || code === 'NumpadAdd')) stepDetail(1);
  else if (k.pause !== false && (code === 'KeyP' || code === 'Escape') && state !== 'title') setPaused();
  else if (GAME.onKey) GAME.onKey(code);
}

function boot(data) {
  data = data || {};
  const stage = document.getElementById('stage');
  renderInit(document.getElementById('screen'));
  loadSettings(); loadActions(typeof GAME_MANIFEST !== 'undefined' ? GAME_MANIFEST : null); applySettings();
  resizeNow = () => { const r = stage.getBoundingClientRect(); if (r.width > 0 && r.height > 0) renderResize(r.width, r.height); };
  let saved = 0; try { saved = parseFloat(localStorage.getItem(storeKey('detail'))); } catch (e) { }
  const narrow = stage.getBoundingClientRect().width < 640, dd = GAME.detail || {};
  const lv = levelsOf(), pick0 = narrow ? (dd.narrow ?? 1.5) : (dd.default ?? 2), r0 = lv.includes(data.detail) ? data.detail : lv.includes(saved) ? saved : lv.includes(pick0) ? pick0 : lv.includes(2) ? 2 : lv[0];
  setResVars(r0); particlesAlloc(Math.round((GAME.particles || 9000) * r0));
  resizeNow();
  const onResize = () => { resizeNow(); if (W) updateCamera(0, true); };
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage); else window.addEventListener('resize', onResize);
  setupInput(R.canvas, engineKey, GAME.touch || touchFromActions());
  const btn = document.getElementById('detailBtn');
  if (btn) {
    btn.textContent = `[ DETAIL ${detailLabel()} ]`;
    btn.hidden = lv.length < 2;
    btn.addEventListener('click', e => { e.stopPropagation(); const l2 = levelsOf(), i = l2.indexOf(RES); setDetail(l2[(i + 1) % l2.length], true); });
  }
  if (GAME.init) GAME.init(data);
  updateCamera(0, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state !== 'title') setPaused(true); });
  window.claude?.hot?.snapshot?.(() => ({ detail: RES, ...(GAME.snapshot ? GAME.snapshot() : {}) }));
  if (window.parent !== window) window.parent.postMessage({ type: 'pixelite:ready', id: GAME.id, levels: !!GAME.levels }, '*');   // the editor's preview
  requestAnimationFrame(t => { lastT = t; frame(t); });
  const rp = new URLSearchParams(location.search).get('replay');
  if (rp) { const play = log => { try { Pixelite.test.replay(log); } catch (err) { reportError('replay: ' + err.message); } };
    if (rp.trim().startsWith('{')) play(JSON.parse(rp)); else fetch(rp).then(r => r.json()).then(play).catch(err => reportError('replay: ' + err.message)); }
}

// ---------- the public object: run a game, and drive it from tests ----------
const _engineUpdate = update;
// every key Pixelite.run() reads (a misspelt hook would be ignored without a word)
const HOOKS = ['id', 'touch', 'keys', 'detail', 'particles', 'cameraTop', 'cameraEase', 'init', 'regenerate', 'update', 'camera', 'markDyn', 'lights', 'draw', 'drawFront', 'hud',
  'afterFrame', 'shell', 'menu', 'restart', 'quit', 'floatText', 'saveVersion', 'migrate', 'onKey', 'onBlast', 'chunkStep', 'skyBegin', 'sky', 'stars', 'starGlare', 'onTune', 'start', 'snapshot', 'probe', 'levels', 'listener'];
const Pixelite = {
  version: typeof ENGINE_VERSION === 'string' ? ENGINE_VERSION : '0.0.0',
  get settings() { return SETTINGS; }, setSetting, save: saveGame, load: loadGame, saves: listSaves, erase: eraseSave,
  get paused() { return isPaused(); },
  pause(on) { setPaused(on); },
  seed(n) { seedRandom(n); },   // the simulation's random numbers start from n: same seed + same inputs = same world
  get errors() { return ERRORS.slice(); },
  cache: CACHE,   // the lamp cache and the still-frame reuse: switches and counters (engine/API.md, Performance)
  perf: PERF,   // stage timers in ms (engine/API.md, Performance): step, light, scene, gameDraw, hud, present, draw; mean(), reset(), sync, show
  run(game) {
    GAME = game;
    devKeys('Pixelite.run', game, HOOKS);
    window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
  },
  // Test and probe helpers (headless checks, AI sessions). They step the simulation directly, so they
  // work while the frame loop is frozen and run far faster than real time.
  test: {
    // leave the title screen. The step counter and the random numbers go back to their start first (frames run live before a test
    // gets here, and no two page loads run the same number), so one seed and one list of inputs always make the same run.
    start() { frameNo = 0; seedRandom(_seed0); if (GAME.start) GAME.start(); else engineKey('Enter'); },
    press(code) { if (REC) REC.steps.push({ press: code }); Input.pressed.add(code); engineKey(code); },
    // a tap or click at a world point (x in cells, y in units): the next step sees 'Tap', 'TapUp' and Input.aim there
    tap(wx, wy) {
      if (REC) REC.steps.push({ tap: [wx, wy] });
      Input.aim = [(wx - cam.x) / R.cols, (wy - cam.y) / (R.rows * ASPECT)]; Input.fireQueued = true; Input.pressed.add('Tap'); Input.pressed.add('TapUp');
    },
    // n fixed steps with these KeyboardEvent codes held (e.g. ['ArrowUp']); returns probe()
    step(n = 1, keys = []) {
      if (REC) REC.steps.push({ n, keys: keys.slice() });
      for (const k of keys) Input.keys.add(k);
      for (let i = 0; i < n; i++) _engineUpdate(DT);
      for (const k of keys) Input.keys.delete(k);
      return Pixelite.test.probe();
    },
    // step with these keys held until fn(probe) is true (or max steps); { steps, probe, ok }
    stepUntil(fn, max = 3600, keys = []) {
      let n = 0, p = Pixelite.test.probe();
      while (n < max && !fn(p)) { p = Pixelite.test.step(1, keys); n++; }
      return { steps: n, probe: p, ok: !!fn(p) };
    },
    // Record what the test does (step / press / tap) and play it back on a fresh page started with ?seed=<log.seed>: the same
    // inputs on the same seed give the same run. A bug report or a level's solution is that small JSON file.
    // a checksum of the whole world (cells, back wall, heat) and the particle count: equal after equal runs
    hash() {
      let h = 2166136261 | 0;
      for (let i = 0; i < cells.length; i++) h = Math.imul(h ^ (cells[i] + 31 * backCells[i]), 16777619);
      for (let i = 0; i < heat.length; i += 7) h = Math.imul(h ^ Math.round(heat[i] * 100), 16777619);
      return (h ^ P.n) >>> 0;
    },
    record() { REC = { version: Pixelite.version, seed: _seed0, steps: [] }; },
    stop() { const r = REC; REC = null; return r; },
    replay(log) {
      const was = REC; REC = null;
      for (const e of log.steps) { if (e.press) Pixelite.test.press(e.press); else if (e.tap) Pixelite.test.tap(e.tap[0], e.tap[1]); else Pixelite.test.step(e.n, e.keys); }
      REC = was; return Pixelite.test.probe();
    },
    freeze() { if (!window.__pixeliteUpdate) { window.__pixeliteUpdate = window.update; window.update = () => { }; } },
    unfreeze() { if (window.__pixeliteUpdate) { window.update = window.__pixeliteUpdate; window.__pixeliteUpdate = null; } },
    render(t = clockT) { draw(t); },
    probe() {
      return { state, stateT: +stateT.toFixed(2), frame: frameNo, version: Pixelite.version, paused: isPaused(), errors: ERRORS.length, res: RES, renderer: R.mode, cols: R.cols, rows: R.rows,
        world: [W, H], cam: [+cam.x.toFixed(1), +cam.y.toFixed(1)], particles: P.n, chunks: chunks.length, perfMs: +perfAvg.toFixed(1), perf: PERF.avg(),
        tune: { ...TUNE }, levels: levelsOf(), entities: entityCounts(), states: entityStates(), game: GAME.probe ? GAME.probe() : null };
    }
  }
};
window.Pixelite = Pixelite;
