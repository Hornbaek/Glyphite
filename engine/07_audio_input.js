// ===================== ENGINE · audio (synthesised, starts on first input) and input =====================
// Sfx: procedural one-shots plus a filtered-noise "thrust hum" loop (engine(throttle) 0..1).
// Sound that travels through air. In a vacuum (setAtmosphere 0, the default) a sound is heard at once at full volume, as if felt
// through the ground. With an atmosphere it arrives distance / 343 m/s later, and the farther it is the quieter and duller it
// is, so a flash can be followed by thunder you can count. Sfx.heard(x, y) says how a sound at (x, y) is heard; pass the result
// as the last argument of burst() / boom(). The listener is the camera's centre unless GAME.listener() returns [x, y].
const HEARD_NOW = { delay: 0, gain: 1, muffle: 1, m: 0 };
const Sfx = {
  ctx: null, master: null, noiseBuf: null, engGain: null, engFilt: null, buzzGain: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : .5; this.master.connect(c.destination);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      this.engFilt = c.createBiquadFilter(); this.engFilt.type = 'lowpass'; this.engFilt.frequency.value = 200;
      this.engGain = c.createGain(); this.engGain.gain.value = 0;
      src.connect(this.engFilt); this.engFilt.connect(this.engGain); this.engGain.connect(this.master); src.start();
      // mains hum for buzzing lamps and live wires: a 100 Hz sawtooth, filtered (buzz(level))
      const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 100;
      const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 400; hf.Q.value = .8;
      this.buzzGain = c.createGain(); this.buzzGain.gain.value = 0;
      hum.connect(hf); hf.connect(this.buzzGain); this.buzzGain.connect(this.master); hum.start();
      Chip.init(c, this.master);
      document.addEventListener('visibilitychange', () => { if (document.hidden) c.suspend(); else c.resume(); });
    } catch (e) { this.ctx = null; }
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : .5; },
  engine(th) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(th * .55, t, .05); this.engFilt.frequency.setTargetAtTime(160 + th * 520, t, .05);
  },
  // electrical buzz 0..1 (a dying tube, a live cable); set it every frame, e.g. from flickerAt() times how near it is
  buzz(level) { if (this.buzzGain) this.buzzGain.gain.setTargetAtTime(clamp(level, 0, 1) * .09, this.ctx.currentTime, .015); },
  heard(x, y) {
    if (!(ATMOS > 0)) return HEARD_NOW;
    const l = (GAME.listener && GAME.listener()) || [cam.x + R.cols / 2, cam.y + R.rows * ASPECT / 2];
    const m = Math.hypot(x - l[0], y - l[1]) * UNIT_M;   // metres
    return { delay: m / 343, gain: 1 / (1 + m / 120), muffle: Math.max(.2, 1 / (1 + m / 250)), m };
  },
  burst(dur, f0, f1, vol, type = 'lowpass', q = 1, at = HEARD_NOW) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + at.delay;
    vol *= at.gain; f0 *= at.muffle; f1 *= at.muffle;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = .7 + Math.random() * .4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + .05);
  },
  tone(freq, dur, vol = .15, type = 'square', delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  },
  boom(p, at = HEARD_NOW) {
    this.burst(1.2 + p * .4, 900, 40, Math.min(1, .45 + p * .35), 'lowpass', 1, at); this.burst(.25, 3000, 400, .25, 'bandpass', .7, at);
    if (at.m > 100) this.burst(1.4 + p * .5 + at.m / 150, 300, 28, .45, 'lowpass', 1, at);   // far away: a long low rumble, thunder
  },
  launch() { this.burst(.45, 2200, 300, .35, 'bandpass', 1.2); },
  thud(v) { this.burst(.25, 300, 60, Math.min(.6, v * .06)); },
  pickup() { this.tone(1320, .12, .12, 'sine'); this.tone(1760, .18, .1, 'sine', .07); },
  alarm() { this.tone(880, .09, .08); this.tone(660, .09, .08, 'square', .11); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .25, .12, 'triangle', i * .11)); }
};

// ---------- input ----------
// keys: KeyboardEvent.code values held now; pressed: codes that went down since the last step, plus
// 'Tap' for a click or tap and 'TapAlt' for a right click (cleared after every step); aim: where the last tap was (0..1 of the
// canvas) or null; touch: on-screen hold buttons by name.
const Input = {
  keys: new Set(), fireQueued: false, aim: null, mouseX: 0, mouseY: 0, mouseSeen: 0,
  touch: {}, pressed: new Set()
};
// Touch controls come from GAME.touch: button groups laid out along the bottom edge, e.g.
//   [[{ label: '[ < ]', aria: 'Rotate left', hold: 'left' }], [{ label: '[ FIRE ]', aria: 'Fire', tap: true }]]
// hold: Input.touch[name] is true while held; tap: acts like tapping the screen without aiming.
function setupInput(canvas, onKey, touchSpec) {
  const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', e => {
    if (block.has(e.code)) e.preventDefault();
    Sfx.init();
    if (!Input.keys.has(e.code)) Input.pressed.add(e.code);
    Input.keys.add(e.code);
    onKey && onKey(e.code);
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  window.addEventListener('blur', () => { Input.keys.clear(); for (const k in Input.touch) Input.touch[k] = false; });
  const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now(); } });
  canvas.addEventListener('pointerdown', e => {
    Sfx.init(); if (e.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now();
    Input.aim = [x, y];
    if (e.button === 2) { Input.pressed.add('TapAlt'); return; }   // right click: cancel, deselect (no browser menu)
    Input.fireQueued = true; Input.pressed.add('Tap');
    if (e.pointerType !== 'mouse') showTouch();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') Input.mouseSeen = 0; });   // off the canvas: no aim
  const bind = (b, sp) => {
    const key = sp.hold;
    if (key) Input.touch[key] = false;
    const on = e => { e.preventDefault(); Sfx.init(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { } if (sp.tap) { Input.fireQueued = true; Input.aim = null; Input.pressed.add('Tap'); } else if (key) Input.touch[key] = true; };
    const off = e => { b.classList.remove('on'); if (key) Input.touch[key] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  const box = document.getElementById('touch');
  if (!box || !touchSpec || !touchSpec.length) return;
  box.textContent = '';
  for (const grp of touchSpec) {
    const g = document.createElement('div'); g.className = 'grp';
    for (const sp of grp) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = sp.label;
      if (sp.id) b.id = sp.id; if (sp.aria) b.setAttribute('aria-label', sp.aria);
      g.appendChild(b); bind(b, sp);
    }
    box.appendChild(g);
  }
  if (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches) showTouch();
}
function showTouch() { const t = document.getElementById('touch'); if (t && t.hidden && t.childElementCount) t.hidden = false; }
const touchShown = () => { const t = document.getElementById('touch'); return !!t && !t.hidden; };
// the mouse cursor as an aim point (0..1 of the canvas), for 6 s after it last moved
function mouseAim() { return Input.mouseSeen && performance.now() - Input.mouseSeen < 6000 ? [Input.mouseX, Input.mouseY] : null; }
const keyDown = (...codes) => codes.some(c => Input.keys.has(c));
