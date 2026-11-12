// ===================== ENGINE · input: keys, pointer, touch buttons =====================
// ---------- input ----------
// keys: KeyboardEvent.code values held now; pressed: codes that went down since the last step, plus
// 'Tap' for a click or tap (as it goes down), 'TapUp' for one let go where it began (a tap, not a drag) and 'TapAlt' for a
// right click (cleared after every step); aim: where the last tap was (0..1 of the canvas) or null; touch: on-screen hold
// buttons by name. held: a pointer is down on the canvas; drag: how far it moved since the last step (0..1 of the canvas,
// cleared after every step); pointer: what was used last, 'mouse', 'touch' (a pen counts as touch) or 'pad' (a gamepad button was pressed).
// A second finger makes a pinch: Input.pinch is how much the two fingers' distance changed since the last step, as a share of the canvas
// width (positive = apart, cleared every step); Input.touches counts the fingers down. A finger held still for 0.45 s adds 'TapHold'.
const Input = {
  keys: new Set(), fireQueued: false, aim: null, mouseX: 0, mouseY: 0, mouseSeen: 0,
  touch: {}, pressed: new Set(), held: false, drag: [0, 0], pinch: 0, touches: 0,
  pointer: window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'mouse'
};
const DRAG_PX = 10;   // a press that moves further than this (CSS pixels) is a drag, and no longer a tap
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
  // the one pointer being held (a second finger is ignored): where it went down, where it is, whether it has dragged
  let down = null;
  const touches = new Map(); let pinchD = 0, holdTimer = 0;
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now(); }
    if (e.pointerType !== 'mouse' && touches.has(e.pointerId)) {
      const t = touches.get(e.pointerId); t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 2) { const d = pinchDist(); if (pinchD) Input.pinch += (d - pinchD) / canvas.getBoundingClientRect().width; pinchD = d; if (down) down.moved = true; }
    }
    if (!down || e.pointerId !== down.id) return;
    const r = canvas.getBoundingClientRect();
    Input.drag[0] += (e.clientX - down.x) / r.width; Input.drag[1] += (e.clientY - down.y) / r.height;
    down.x = e.clientX; down.y = e.clientY;
    if (Math.hypot(e.clientX - down.x0, e.clientY - down.y0) > DRAG_PX) down.moved = true;
  });
  canvas.addEventListener('pointerdown', e => {
    Sfx.init(); if (e.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    Input.pointer = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    const [x, y] = toCanvas(e); Input.mouseX = x; Input.mouseY = y; Input.mouseSeen = performance.now();
    if (e.pointerType !== 'mouse') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); Input.touches = touches.size; if (touches.size === 2) pinchD = pinchDist(); if (touches.size > 1) return; }
    Input.aim = [x, y];
    if (e.button === 2) { Input.pressed.add('TapAlt'); return; }   // right click: cancel, deselect (no browser menu)
    Input.fireQueued = true; Input.pressed.add('Tap');
    if (!down) { down = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false }; Input.held = true; try { canvas.setPointerCapture(e.pointerId); } catch (_) { } }
    if (e.pointerType !== 'mouse') showTouch();
    clearTimeout(holdTimer); holdTimer = setTimeout(() => { if (down && !down.moved && touches.size <= 1) Input.pressed.add('TapHold'); }, 450);
  });
  const up = e => {
    touches.delete(e.pointerId); Input.touches = touches.size; pinchD = 0; clearTimeout(holdTimer);
    if (!down || e.pointerId !== down.id) return;
    if (e.type === 'pointerup' && !down.moved) { Input.aim = toCanvas(e); Input.pressed.add('TapUp'); }
    down = null; Input.held = false;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
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
