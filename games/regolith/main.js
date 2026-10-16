// ===================== GAME · Regolith Lander: states, keys, and the hooks handed to the engine =====================
// States: title → play ⇄ paused → landed | crashed → play (next site / retry) ... The engine owns the
// loop, camera smoothing, detail switching and built-in keys (- + detail, G bloom, M sound, P pause).

function startSite(lv) { genLevel(lv); spawnLander(); setState('play'); updateCamera(0, true); }
function advance() {
  if (state === 'title') { score = 0; lives = TUNE.lives; startSite(TUNE.startSite); }
  else if (state === 'landed' && stateT > 1.2) startSite(LEVEL.lv + 1);
  else if (state === 'crashed' && stateT > 1.6) { if (lives <= 0) { score = 0; lives = TUNE.lives; startSite(TUNE.startSite); } else startSite(LEVEL.lv); }
}

function regolithUpdate(dt) {
  if (Input.pressed.has('Tap')) {
    if (state === 'play') { if (Input.fireQueued) fireRocket(Input.aim); }
    else if (state !== 'paused') advance();
  }
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
  stepBoulders(dt); stepLamps(dt);
  if (state === 'title' && Math.random() < dt * .5) spawnMeteor(cam.x + rr(.15, .85) * R.cols);
  stepRockets(dt); stepMeteors(dt);
}

function regolithKey(code) {
  if (code === 'KeyN') Music.toggle();
  else if (code === 'KeyV') { Music.meters = !Music.meters; say(Music.meters ? 'SOUND CHIP METERS ON' : 'SOUND CHIP METERS OFF'); }
  else if (code === 'KeyL' && L) L.lights = !L.lights;
  else if (code === 'Enter' || code === 'NumpadEnter' || (code === 'KeyR' && state === 'crashed')) advance();
  else if (code === 'Space') { if (state === 'play') fireRocket(mouseAim()); else if (state !== 'paused') advance(); }
}

// the camera drifts over the landscape on the title screen and leads the lander in flight
function regolithCamera(VW, VH, out) {
  if (state === 'title' || !L) { const tx = (W - VW) * (.5 + .45 * Math.sin(stateT * .035)), mid = clamp(Math.floor(tx + VW / 2), 0, W - 1); out[0] = tx; out[1] = colTop[mid] * ASPECT - VH * .6; }
  else { const b = L.body; out[0] = b.x + b.vx * .9 - VW / 2; out[1] = b.y + b.vy * .45 - VH * .42; }
}

// the detail level changed: the same site, rebuilt with more (or fewer) characters
function regolithRegenerate() {
  const lv = LEVEL ? LEVEL.lv : 1, was = state;
  genLevel(was === 'title' || !LEVEL ? lv : (was === 'crashed' && lives <= 0 ? 1 : lv));
  if (was === 'title' || !L || (was === 'crashed' && lives <= 0)) { setState('title'); L = null; }
  else { spawnLander(); setState('play'); }
}

Glyphite.run({
  id: 'regolith',
  detail: { default: 2, narrow: 1.5 },
  touch: [
    [{ id: 'tLeft', label: '[ < ]', aria: 'Rotate left', hold: 'left' }, { id: 'tRight', label: '[ > ]', aria: 'Rotate right', hold: 'right' }],
    [{ id: 'tFire', label: '[ FIRE ]', aria: 'Fire rocket', tap: true }, { id: 'tThrust', label: '[ BURN ]', aria: 'Main engine', hold: 'thrust' }]
  ],
  init(data) {
    setGravity(TUNE.gravity);
    setEyeAdaptation(TUNE.eyeAdaptation);
    setBeatPulse(TUNE.beatPulse);
    setupMusicInput();
    score = data.score | 0; lives = data.lives > 0 ? data.lives : TUNE.lives;
    genLevel(data.level > 0 ? data.level : TUNE.startSite);
    if (data.state === 'play') { spawnLander(); setState('play'); } else setState('title');
  },
  regenerate: regolithRegenerate,
  update: regolithUpdate,
  camera: regolithCamera,
  markDyn,
  lights: regolithLights,
  draw: drawWorld,
  hud: drawHUD,
  afterFrame() { Music.update(state); },
  onKey: regolithKey,
  onBlast: onRegolithBlast,
  chunkStep(ch) {
    if (L && L.alive && state !== 'title') chunkVsBody(ch, L.body, (v, p) => {
      if (v > 3.4 * RES && p.kind !== 1) { crashLander('CRUSHED BY FALLING DEBRIS'); return true; }
    });
  },
  skyBegin: earthBegin,
  sky: earthCell,
  onTune(key, v) { if (key === 'gravity') setGravity(v); else if (key === 'atmosphere') setAtmosphere(v); else if (key === 'eyeAdaptation') setEyeAdaptation(v); else if (key === 'beatPulse') setBeatPulse(v); },
  listener: () => L && L.alive ? [L.body.x, L.body.y] : null,   // sound travels to the lander (matters with an atmosphere)
  start() { if (state === 'title') advance(); },
  snapshot: () => ({ level: LEVEL ? LEVEL.lv : 1, score, lives, state: state === 'title' ? 'title' : 'play' }),
  probe: () => ({
    site: LEVEL && LEVEL.lv, score, lives,
    lander: L && { alive: L.alive, reason: L.reason, x: +L.body.x.toFixed(1), y: +L.body.y.toFixed(1), vx: +(L.body.vx * UNIT_M).toFixed(2), vy: +(L.body.vy * UNIT_M).toFixed(2), a: +L.body.a.toFixed(3), fuel: +L.fuel.toFixed(1), rockets: L.rockets }
  })
});
