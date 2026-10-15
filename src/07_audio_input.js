// ===================== audio (synthesised, starts on first input) =====================
const Sfx = {
  ctx: null, master: null, noiseBuf: null, engGain: null, engFilt: null, muted: false,
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
      Chip.init(c, this.master);
      document.addEventListener('visibilitychange', () => { if (document.hidden) c.suspend(); else c.resume(); });
    } catch (e) { this.ctx = null; }
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : .5; },
  engine(th) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(th * .55, t, .05); this.engFilt.frequency.setTargetAtTime(160 + th * 520, t, .05);
  },
  burst(dur, f0, f1, vol, type = 'lowpass', q = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
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
  boom(p) { this.burst(1.2 + p * .4, 900, 40, Math.min(1, .45 + p * .35)); this.burst(.25, 3000, 400, .25, 'bandpass', .7); },
  launch() { this.burst(.45, 2200, 300, .35, 'bandpass', 1.2); },
  thud(v) { this.burst(.25, 300, 60, Math.min(.6, v * .06)); },
  pickup() { this.tone(1320, .12, .12, 'sine'); this.tone(1760, .18, .1, 'sine', .07); },
  alarm() { this.tone(880, .09, .08); this.tone(660, .09, .08, 'square', .11); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .25, .12, 'triangle', i * .11)); }
};

// ===================== input =====================
const Input = {
  keys: new Set(), fireQueued: false, aim: null, mouseX: 0, mouseY: 0, mouseSeen: 0,
  touch: { left: false, right: false, thrust: false }, pressed: new Set()
};
function setupInput(canvas, onKey) {
  const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', e => {
    if (block.has(e.code)) e.preventDefault();
    Sfx.init();
    if (!Input.keys.has(e.code)) Input.pressed.add(e.code);
    Input.keys.add(e.code);
    onKey && onKey(e.code);
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  window.addEventListener('blur', () => { Input.keys.clear(); Input.touch.left = Input.touch.right = Input.touch.thrust = false; });
  const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now(); } });
  canvas.addEventListener('pointerdown', e => {
    Sfx.init(); if (e.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now();
    Input.aim = [x, y]; Input.fireQueued = true; Input.pressed.add('Tap');
    if (e.pointerType !== 'mouse') showTouch();
  });
  const bind = (id, key) => {
    const b = document.getElementById(id);
    const on = e => { e.preventDefault(); Sfx.init(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { } if (key === 'fire') { Input.fireQueued = true; Input.aim = null; Input.pressed.add('Tap'); } else Input.touch[key] = true; };
    const off = e => { b.classList.remove('on'); if (key !== 'fire') Input.touch[key] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  bind('tLeft', 'left'); bind('tRight', 'right'); bind('tThrust', 'thrust'); bind('tFire', 'fire');
  if (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches) showTouch();
}
function showTouch() { const t = document.getElementById('touch'); if (t.hidden) { t.hidden = false; } }
const keyDown = (...codes) => codes.some(c => Input.keys.has(c));
