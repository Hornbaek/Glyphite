// ===================== GAME · loop =====================
function updateCamera(dt, snap) {
  const VW = R.cols, VH = R.rows * ASPECT; let tx, ty;
  if (state === 'title' || !L) { tx = (W - VW) * (.5 + .45 * Math.sin(stateT * .035)); const mid = clamp(Math.floor(tx + VW / 2), 0, W - 1); ty = colTop[mid] * ASPECT - VH * .6; }
  else { const b = L.body; tx = b.x + b.vx * .9 - VW / 2; ty = b.y + b.vy * .45 - VH * .42; }
  tx = clamp(tx, 0, Math.max(0, W - VW)); ty = clamp(ty, -80 * RES, H * ASPECT - VH);
  const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

function startSite(lv) { genLevel(lv); spawnLander(); state = 'play'; stateT = 0; updateCamera(0, true); }
function advance() {
  if (state === 'title') { score = 0; lives = 3; startSite(1); }
  else if (state === 'landed' && stateT > 1.2) startSite(LEVEL.lv + 1);
  else if (state === 'crashed' && stateT > 1.6) { if (lives <= 0) { score = 0; lives = 3; startSite(1); } else startSite(LEVEL.lv); }
}

// ---------- detail level: rebuilds the world with more (or fewer) characters per metre ----------
let resizeNow = () => { };
function setDetail(r, announce) {
  if (!DETAIL_LEVELS.includes(r)) r = 2;
  const lv = LEVEL ? LEVEL.lv : 1, was = state;
  setResVars(r);
  particlesAlloc(Math.round(9000 * r));
  try { localStorage.setItem('regolith.detail', String(r)); } catch (e) { }
  resizeNow();
  genLevel(was === 'title' || !LEVEL ? lv : (was === 'crashed' && lives <= 0 ? 1 : lv));
  if (was === 'title' || !L || (was === 'crashed' && lives <= 0)) { state = 'title'; L = null; }
  else { spawnLander(); state = 'play'; }
  stateT = 0; updateCamera(0, true);
  const btn = document.getElementById('detailBtn'); if (btn) btn.textContent = `[ DETAIL ${detailLabel()} ]`;
  if (announce) toast = { text: `DETAIL ${detailLabel()} - ${R.cols} x ${R.rows} CHARACTERS`, t0: performance.now() / 1000 };
}
function stepDetail(dir) {
  const i = DETAIL_LEVELS.indexOf(RES), j = clamp(i + dir, 0, DETAIL_LEVELS.length - 1);
  if (j !== i) setDetail(DETAIL_LEVELS[j], true);
}

function onKey(code) {
  if (code === 'KeyM') Sfx.toggle();
  else if (code === 'KeyG') R.bloom = !R.bloom;
  else if (code === 'KeyN') Music.toggle();
  else if (code === 'KeyV') { Music.meters = !Music.meters; say(Music.meters ? 'SOUND CHIP METERS ON' : 'SOUND CHIP METERS OFF'); }
  else if (code === 'KeyL' && L) L.lights = !L.lights;
  else if (code === 'Minus' || code === 'NumpadSubtract') stepDetail(-1);
  else if (code === 'Equal' || code === 'NumpadAdd') stepDetail(1);
  else if (code === 'KeyP' || code === 'Escape') { if (state === 'play') state = 'paused'; else if (state === 'paused') state = 'play'; }
  else if (code === 'Enter' || code === 'NumpadEnter' || (code === 'KeyR' && state === 'crashed')) advance();
  else if (code === 'Space') { if (state === 'play') fireRocket(mouseAim()); else if (state !== 'paused') advance(); }
}

function update(dt) {
  frameNo++; stateT += dt;
  if (Input.pressed.has('Tap')) {
    if (state === 'play') { if (Input.fireQueued) fireRocket(Input.aim); }
    else if (state !== 'paused') advance();
  }
  Input.pressed.clear(); Input.fireQueued = false;
  if (state === 'play' && L.alive) controlLander(dt);
  else if (L) { L.throttle = 0; L.ef[0] = L.ef[1] = 0; L.ef[2] = clamp(-L.body.w * 7, -5, 5) * L.body.I * (L.alive ? 1 : 0); }
  if (L && L.alive && state !== 'title') {
    for (let s = 0; s < 2; s++) {
      const b = L.body; b.fx = L.ef[0]; b.fy = L.ef[1]; b.tq = L.ef[2];
      legForces(dt / 2); b.step(dt / 2);
      if (state === 'play') { evalContacts(dt / 2); if (!L.alive) break; }
    }
    if (state === 'landed') { L.body.vx *= .9; L.body.w *= .9; }
  }
  stepBoulders(dt); stepLamps(dt); stepChunks(dt);
  if (state === 'title' && Math.random() < dt * .5) spawnMeteor(cam.x + rr(.15, .85) * R.cols);
  stepRockets(dt); stepMeteors(dt); stepParticles(dt); simGranular();
  const cx = Math.floor(cam.x), cy = Math.floor(cam.y / ASPECT), m = Math.round(20 * RES);
  coolHeat(cx - m, cy - m, cx + R.cols + m, cy + R.rows + m);
  stepFX(dt); updateCamera(dt);
}

function draw(t) {
  updateSkyline();
  const dynTop = markDyn();
  const ox = Math.floor(cam.x) - 1, oy = Math.floor(cam.y / ASPECT) - 1;
  const fx = cam.x - Math.floor(cam.x), fy = cam.y / ASPECT - Math.floor(cam.y / ASPECT);
  computeLighting(ox, oy, gatherLights(t), dynTop);
  renderScene(ox, oy, t, () => drawExtras(t));
  hudClear(); drawHUD(t);
  presentFrame(fx, fy, t);
  const bar = document.getElementById('titleBar');
  if (bar && bar.hidden !== (state !== 'title')) bar.hidden = state !== 'title';
  Music.update(state);
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
  // the 1202 lamp is on; once per session, suggest coarser detail
  if (perfAvg > 34 && state === 'play' && RES > 1) { slowT += real; if (slowT > 4 && !slowHinted) { slowHinted = true; toast = { text: 'RUNNING SLOW - PRESS - FOR LESS DETAIL', t0: now / 1000 }; } } else slowT = 0;
  requestAnimationFrame(frame);
}

function boot(data) {
  data = data || {};
  const stage = document.getElementById('stage');
  renderInit(document.getElementById('screen'));
  resizeNow = () => { const r = stage.getBoundingClientRect(); if (r.width > 0 && r.height > 0) renderResize(r.width, r.height); };
  let saved = 0; try { saved = parseFloat(localStorage.getItem('regolith.detail')); } catch (e) { }
  const narrow = stage.getBoundingClientRect().width < 640;
  const r0 = DETAIL_LEVELS.includes(data.detail) ? data.detail : DETAIL_LEVELS.includes(saved) ? saved : narrow ? 1.5 : 2;
  setResVars(r0); particlesAlloc(Math.round(9000 * r0));
  resizeNow();
  const onResize = () => { resizeNow(); if (LEVEL) updateCamera(0, true); };
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage); else window.addEventListener('resize', onResize);
  setupInput(R.canvas, onKey); setupMusicInput();
  const btn = document.getElementById('detailBtn');
  btn.textContent = `[ DETAIL ${detailLabel()} ]`;
  btn.addEventListener('click', e => { e.stopPropagation(); const i = DETAIL_LEVELS.indexOf(RES); setDetail(DETAIL_LEVELS[(i + 1) % DETAIL_LEVELS.length], true); });
  score = data.score | 0; lives = data.lives > 0 ? data.lives : 3;
  genLevel(data.level > 0 ? data.level : 1);
  if (data.state === 'play') { spawnLander(); state = 'play'; } else state = 'title';
  stateT = 0; updateCamera(0, true);
  if (document.fonts && document.fonts.load) document.fonts.load(`700 16px "JetBrains Mono"`).then(() => document.fonts.load(`16px "JetBrains Mono"`)).then(() => { if (R.cw) buildAtlases(); }).catch(() => { });
  window.claude?.hot?.snapshot?.(() => ({ level: LEVEL ? LEVEL.lv : 1, score, lives, detail: RES, state: state === 'title' ? 'title' : 'play' }));
  requestAnimationFrame(t => { lastT = t; frame(t); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
</script>
