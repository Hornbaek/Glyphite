// ===================== ENGINE · actions (keys, gamepad, touch), settings and saves =====================
// A game names what the player can do in game.json and reads that, not raw keys:
//   "actions": { "left": ["ArrowLeft", "KeyA", "pad:left", "touch:left"], "jump": ["Space", "ArrowUp", "KeyW", "pad:a", "touch:jump"], ... }
// A token is a KeyboardEvent code, `pad:<button>` (a b x y lb rb lt rt select start l3 r3 up down left right; `left` `right` `up`
// `down` are also the left stick, as an analog value) or `touch:<name>` (an on-screen hold button). In game code:
//   action('jump')            0..1 while held (an analog stick or trigger gives the in-between)
//   actionPressed('jump')     true for the step it went down (a press shorter than a step still counts)
//   actionReleased('jump')    true for the step it came up
//   axis('left', 'right')     -1..1
// All of it is worked out once at the start of every step, so it reads the same anywhere in that step. If the game has actions
// called left / right / jump (or up, down, fire) and no `touch` buttons, the touch buttons are made from them. Players can rebind
// actions in the shell's pause menu; the choice is kept in the settings.
const ACTIONS = {}, ACT = { v: {}, prev: {}, pressed: {}, released: {} };
const PAD_BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right'];
let PADV = {};   // pad buttons now: name → 0..1
const TOUCH_LABELS = { left: '[ < ]', right: '[ > ]', up: '[ ^ ]', down: '[ v ]', jump: '[ JUMP ]', fire: '[ FIRE ]' };
function loadActions(manifest) {
  for (const k in ACTIONS) delete ACTIONS[k];
  const m = (manifest && manifest.actions) || {};
  for (const k in m) ACTIONS[k] = { tokens: m[k].slice(), defaults: m[k].slice() };
  const UI = { 'ui.up': ['ArrowUp', 'KeyW', 'pad:up'], 'ui.down': ['ArrowDown', 'KeyS', 'pad:down'], 'ui.left': ['ArrowLeft', 'KeyA', 'pad:left'], 'ui.right': ['ArrowRight', 'KeyD', 'pad:right'], 'ui.ok': ['Enter', 'NumpadEnter', 'Space', 'pad:a', 'pad:start'] };   // menus and the title
  for (const k in UI) ACTIONS[k] = { tokens: UI[k].slice(), defaults: UI[k].slice() };
  const bound = SETTINGS.keys || {};
  for (const k in bound) if (ACTIONS[k]) ACTIONS[k].tokens = bound[k].slice();
}
// touch buttons made from the actions when the game gave none
function touchFromActions() {
  const A = ACTIONS, mk = (n, tap) => ({ label: TOUCH_LABELS[n], aria: n, hold: n });
  if (!A.left || !A.right) return null;
  for (const n of ['left', 'right', 'up', 'down', 'jump', 'fire']) if (A[n] && !A[n].tokens.includes('touch:' + n)) A[n].tokens.push('touch:' + n);
  const l = [mk('left'), mk('right')]; if (A.down) l.push(mk('down'));
  const r = []; if (A.fire) r.push(mk('fire')); if (A.jump) r.push(mk('jump'));
  return r.length ? [l, r] : [l];
}
function pollPads() {
  PADV = {};
  const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    p.buttons.forEach((b, i) => { const n = PAD_BUTTONS[i]; if (n) PADV[n] = Math.max(PADV[n] || 0, b.value || (b.pressed ? 1 : 0)); });
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, dz = .25, sc = v => Math.min(1, (Math.abs(v) - dz) / (1 - dz));
    if (ax < -dz) PADV.left = Math.max(PADV.left || 0, sc(ax)); if (ax > dz) PADV.right = Math.max(PADV.right || 0, sc(ax));
    if (ay < -dz) PADV.up = Math.max(PADV.up || 0, sc(ay)); if (ay > dz) PADV.down = Math.max(PADV.down || 0, sc(ay));
  }
}
const tokenValue = t => t.startsWith('pad:') ? PADV[t.slice(4)] || 0 : t.startsWith('touch:') ? (Input.touch[t.slice(6)] ? 1 : 0) : Input.keys.has(t) ? 1 : 0;
// once per step, before the game's update
function stepActions() {
  pollPads();
  let padAny = false; for (const k in PADV) if (PADV[k] > .5) padAny = true;
  if (padAny) Input.pointer = 'pad';
  for (const k in ACTIONS) {
    let v = 0, quick = false;
    for (const t of ACTIONS[k].tokens) { v = Math.max(v, tokenValue(t)); if (!t.includes(':') && Input.pressed.has(t)) quick = true; }
    const was = ACT.prev[k] || 0;
    ACT.v[k] = v; ACT.pressed[k] = (v > .5 && was <= .5) || quick; ACT.released[k] = v <= .5 && was > .5; ACT.prev[k] = v;
  }
}
const action = n => ACT.v[n] || 0;
const actionPressed = n => !!ACT.pressed[n];
const actionReleased = n => !!ACT.released[n];
const axis = (neg, pos) => (ACT.v[pos] || 0) - (ACT.v[neg] || 0);
// what to show a player for an action: the first key token, or the pad button when a pad was used last ("SPACE", "A")
function actionLabel(name) {
  const a = ACTIONS[name]; if (!a) return name.toUpperCase();
  const pad = Input.pointer === 'pad' && a.tokens.find(t => t.startsWith('pad:')), key = a.tokens.find(t => !t.includes(':')), t = pad || key || a.tokens[0] || name;
  return t.replace(/^pad:/, 'PAD ').replace(/^touch:/, '').replace(/^Key/, '').replace(/^Arrow/, '').replace(/^Digit/, '').toUpperCase();
}
// bind an action to a new key or pad button, keeping its other kinds of token (a rebind replaces the first token of the same kind)
function bindAction(name, token) {
  const a = ACTIONS[name]; if (!a) return;
  const kind = t => t.startsWith('pad:') ? 'pad' : t.startsWith('touch:') ? 'touch' : 'key', k = kind(token), at = a.tokens.findIndex(t => kind(t) === k);
  if (at >= 0) a.tokens[at] = token; else a.tokens.unshift(token);
  SETTINGS.keys = { ...(SETTINGS.keys || {}), [name]: a.tokens.slice() }; saveSettings();
}
function resetActions() { for (const k in ACTIONS) ACTIONS[k].tokens = ACTIONS[k].defaults.slice(); SETTINGS.keys = {}; saveSettings(); }

// ---------- settings: what a player chose, kept between visits ----------
// Pixelite.settings: { music: 0..1, sfx: 0..1, mute, bloom, reducedMotion, keys: { action: [tokens] } }. Pixelite.setSetting(key, value) changes
// one, keeps it (localStorage, under the game's id) and applies it: mute and bloom at once, the volumes to Sfx when it has them.
const SETTINGS = { music: .8, sfx: .8, mute: false, bloom: true, reducedMotion: false, keys: {} };
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(storeKey('settings')) || 'null'); if (s && typeof s === 'object') for (const k in SETTINGS) if (k in s && typeof s[k] === typeof SETTINGS[k]) SETTINGS[k] = s[k]; } catch (e) { }
}
function saveSettings() { try { localStorage.setItem(storeKey('settings'), JSON.stringify(SETTINGS)); } catch (e) { } }
function applySettings() {
  Sfx.muted = SETTINGS.mute; if (Sfx.master) Sfx.master.gain.value = SETTINGS.mute ? 0 : .5;
  R.bloom = SETTINGS.bloom;
  if (Sfx.setVolumes) Sfx.setVolumes({ music: SETTINGS.music, sfx: SETTINGS.sfx });
}
function setSetting(k, v) {
  if (!(k in SETTINGS)) throw new Error(`no setting '${k}' (${Object.keys(SETTINGS).join(', ')})`);
  SETTINGS[k] = v; saveSettings(); applySettings();
}

// ---------- saves ----------
// Pixelite.save('slot1', data) keeps any JSON under the game's id; Pixelite.load('slot1') → data, or null when there is none or it was
// saved by another version (GAME.saveVersion, default 1; GAME.migrate(oldVersion, data) → data may upgrade an old one). saves() lists
// the slots (name, time), erase(slot) deletes one.
function saveGame(slot, data) {
  try { localStorage.setItem(storeKey('save.' + slot), JSON.stringify({ v: GAME.saveVersion || 1, t: Date.now(), data })); return true; } catch (e) { return false; }
}
function loadGame(slot) {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey('save.' + slot)) || 'null'); if (!s) return null;
    if (s.v === (GAME.saveVersion || 1)) return s.data;
    return GAME.migrate ? GAME.migrate(s.v, s.data) ?? null : null;
  } catch (e) { return null; }
}
function listSaves() {
  const out = [], p = storeKey('save.');
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) { const s = JSON.parse(localStorage.getItem(k)); out.push({ slot: k.slice(p.length), t: s.t, v: s.v }); } } } catch (e) { }
  return out;
}
function eraseSave(slot) { try { localStorage.removeItem(storeKey('save.' + slot)); } catch (e) { } }
// run-length packing of a byte grid: [value, count, value, count, ...]
function rlePack(a) { const out = []; let v = a[0], n = 0; for (let i = 0; i < a.length; i++) { if (a[i] === v && n < 65535) n++; else { out.push(v, n); v = a[i]; n = 1; } } if (a.length) out.push(v, n); return out; }
function rleUnpack(p, a) { let i = 0; for (let k = 0; k < p.length; k += 2) { a.fill(p[k], i, i + p[k + 1]); i += p[k + 1]; } return a; }
// the whole world as JSON: cells and back wall packed, entities by their plain fields. worldLoad(s) puts it back (entities need their
// defineEntity first). Heat, particles and chunks are not kept: save when the world is calm.
function worldSave() {
  const ents = entities.filter(e => !e.dead).map(e => { const o = { type: e.type, x: e.x, y: e.y }; for (const k in e) if (!['def', 'char', 'fsm', 'input', 'x', 'y', 'w', 'h', 'type'].includes(k) && (e[k] === null || ['number', 'string', 'boolean'].includes(typeof e[k]) || Array.isArray(e[k]) && e[k].every(v => typeof v === 'number'))) o[k] = e[k]; return o; });
  return { v: 1, res: RES, W, H, cells: rlePack(cells), back: rlePack(backCells), entities: ents };
}
function worldLoad(s) {
  if (!s || s.v !== 1) throw new Error('worldLoad: not a worldSave()');
  if (s.res !== RES) throw new Error(`worldLoad: saved at detail ${s.res}, now ${RES}`);
  worldInit(s.W, s.H); rleUnpack(s.cells, cells); rleUnpack(s.back, backCells);
  for (let i = 0; i < cells.length; i++) if (cells[i]) wakeAt(i % W, (i / W) | 0);
  for (const o of s.entities) { const { type, x, y, ...props } = o; spawn(type, x, y, props); }
}
