// ===================== ENGINE · HUD kit, messages and the standard shell =====================
// ---------- the kit (in GAME.hud, on the HUD grid; colours are [r, g, b] bytes, HC.* are the shared ones) ----------
//   hudButton(c, r, label, { onClick, id, disabled })   a 3-row button; returns true on the frame after it was tapped or clicked, and calls
//                                                       onClick when it is (in the game's step, so it may change the game). A tap that hits a
//                                                       button is not also a tap on the world.
//   hudPanel(c, r, w, h, title)                          a framed, opaque box with a title in its top edge
//   hudBar(c, r, w, value, max, col, label)              [#####   ] meter
//   hudWrap(text, width) → lines                         word wrap
//   hudMenu(id, items, { title, c, r, w })               items: [{ label, onSelect(), value }]: arrow keys / W S / pad d-pad move, Enter / Space /
//                                                        pad A or a tap choose; the highlighted line is returned as an index
//   hudPointer() → [c, r] | null                         the HUD cell under the mouse or the last tap
//   hudTitle(c, r, text, col)                            big letters (6 x 5 cells each), for a title screen
const HUDBTNS = [], HUDMENUS = new Map();
let HUDCLICK = null;
function hudPointer() {
  const a = mouseAim() || (Input.held ? Input.aim : null); if (!a) return null;
  return [Math.floor(a[0] * R.hcols), Math.floor(a[1] * R.hrows)];
}
function hudButton(c, r, label, o = {}) {
  const id = o.id || label, w = label.length + 4, h = 3, p = hudPointer(), over = !o.disabled && p && p[0] >= c && p[0] < c + w && p[1] >= r && p[1] < r + h;
  const col = o.disabled ? HC.dim : over ? HC.amber : HC.txt;
  hudBox(c, r, w, h, col, true); hudText(c + 2, r + 1, label, col);
  if (!o.disabled) HUDBTNS.push({ id, c, r, w, h, onClick: o.onClick });
  if (HUDCLICK === id) { HUDCLICK = null; return true; }
  return false;
}
function hudPanel(c, r, w, h, title, col = HC.dim) {
  hudBox(c, r, w, h, col, true);
  if (title) { const t = ' ' + title.slice(0, w - 6) + ' '; hudText(c + 2, r, t, HC.txt); }
}
function hudBar(c, r, w, value, max, col = HC.green, label = '') {
  if (label) { hudText(c, r, label, HC.txt); c += label.length + 1; }
  const n = Math.round(clamp(value / max, 0, 1) * w);
  hudPut(c - 1, r, 91, ...HC.dim); for (let i = 0; i < w; i++) hudPut(c + i, r, 127, ...(i < n ? col : [28, 34, 44])); hudPut(c + w, r, 93, ...HC.dim);
}
function hudWrap(text, width) {
  const lines = []; let line = '';
  for (const w of String(text).split(/\s+/)) { if (!w) continue; if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; }
  if (line) lines.push(line); return lines;
}
function hudTitle(c, r, text, col) {
  const s = text.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i), base = code * FONT_H * FONT_W; if (code < 32 || code > 126) continue;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      let lit = 0; for (let k = 0; k < 2; k++) { const fy = y * 2 + k + 1; if (fy < FONT_H && FONT[base + fy * FONT_W + x]) lit = 1; }
      if (lit) hudPut(c + i * 6 + x, r + y, 127, col[0], col[1], col[2]);
    }
  }
}
const hudTitleWidth = s => s.length * 6;
// a menu: draws it, remembers which line is chosen, and (in the step) moves and selects. Returns the chosen index.
function hudMenu(id, items, o = {}) {
  let m = HUDMENUS.get(id); if (!m) HUDMENUS.set(id, m = { sel: 0, items, rects: [] });
  m.items = items; m.seen = frameNo; m.sel = clamp(m.sel, 0, items.length - 1);
  const w = o.w || Math.min(R.hcols - 2, Math.max(16, (o.title || '').length + 6, ...items.map(i => i.label.length + (i.value !== undefined ? String(i.value).length + 3 : 0) + 6)));
  const h = items.length + 2 + (o.title ? 1 : 0), c = o.c ?? Math.floor((R.hcols - w) / 2), r = o.r ?? Math.floor((R.hrows - h) / 2);
  hudPanel(c, r, w, h, o.title);
  const p = hudPointer(); m.rects.length = 0;
  items.forEach((it, i) => {
    const y = r + 1 + (o.title ? 1 : 0) + i, on = i === m.sel, col = it.disabled ? HC.dim : on ? HC.amber : HC.txt;
    const txt = (on ? '> ' : '  ') + it.label + (it.value !== undefined ? '  ' + it.value : '');
    hudText(c + 2, y, txt.slice(0, w - 4), col);
    m.rects.push({ c: c + 1, r: y, w: w - 2 });
    if (p && p[1] === y && p[0] > c && p[0] < c + w - 1 && Input.mouseSeen && performance.now() - Input.mouseSeen < 1500 && !it.disabled) m.sel = i;
  });
  ACTIVE_MENU = m; return m.sel;
}
let ACTIVE_MENU = null, CAPTURE = null;
// once per step (and per frame while paused, when no step runs): taps on buttons and menus, menu keys
function stepUi() {
  const tap = Input.pressed.has('Tap') && Input.aim, p = tap ? [Math.floor(Input.aim[0] * R.hcols), Math.floor(Input.aim[1] * R.hrows)] : null;
  if (p) {
    for (const b of HUDBTNS) if (p[0] >= b.c && p[0] < b.c + b.w && p[1] >= b.r && p[1] < b.r + b.h) {
      HUDCLICK = b.id; Input.pressed.delete('Tap'); Input.pressed.delete('TapUp'); Input.fireQueued = false; if (b.onClick) b.onClick(); break;
    }
  }
  const m = ACTIVE_MENU;
  if (m && m.seen >= frameNo - 2 || m && isPaused() && m.seen === frameNo) {
    if (p) m.rects.forEach((rc, i) => { if (p[1] === rc.r && p[0] >= rc.c && p[0] < rc.c + rc.w && !m.items[i].disabled) { m.sel = i; Input.pressed.delete('Tap'); Input.pressed.delete('TapUp'); Input.fireQueued = false; if (m.items[i].onSelect) m.items[i].onSelect(m.items[i]); } });
    if (actionPressed('ui.up')) m.sel = (m.sel + m.items.length - 1) % m.items.length;
    if (actionPressed('ui.down')) m.sel = (m.sel + 1) % m.items.length;
    const it = m.items[m.sel];
    if (it && !it.disabled) {
      if (actionPressed('ui.ok') && it.onSelect) it.onSelect(it);
      if (actionPressed('ui.left') && it.onAdjust) it.onAdjust(-1, it);
      if (actionPressed('ui.right') && it.onAdjust) it.onAdjust(1, it);
    }
  }
  HUDBTNS.length = 0; ACTIVE_MENU = null;
}

// ---------- messages: a feed of lines and the floating texts ----------
// say(text, { time: 1.6, colour }) adds a line to the feed (up to four stack, newest at the bottom); addText(x, y, text, colour, life)
// (a floating label in the world: +10, CHECKPOINT) is drawn by the engine, rising and fading, unless the game sets floatText: false.
const FEED = [];
function say(text, o = {}) {
  text = text.slice(0, Math.max(10, R.hcols - 6));
  if (FEED.length && FEED[FEED.length - 1].text === text) { FEED[FEED.length - 1].t0 = performance.now() / 1000; return; }
  FEED.push({ text, col: o.colour || HC.cyan, time: o.time || 1.6, t0: performance.now() / 1000 }); if (FEED.length > 4) FEED.shift();
}
function drawFeed() {
  if (ERRORS.length && !DEV) { const s = 'SOMETHING BROKE - RELOAD THE PAGE', c0 = Math.floor((R.hcols - s.length - 4) / 2); hudBox(c0, 2, s.length + 4, 3, HC.dim, true); hudText(c0 + 2, 3, s, HC.cyan); return; }
  const t = performance.now() / 1000;
  for (let i = FEED.length - 1; i >= 0; i--) if (t - FEED[i].t0 > FEED[i].time) FEED.splice(i, 1);
  const base = state === 'title' ? Math.floor(R.hrows * .32) : Math.max(5, Math.floor(R.hrows * .76));
  FEED.forEach((f, i) => { const c0 = Math.floor((R.hcols - f.text.length - 4) / 2), r0 = base - (FEED.length - 1 - i) * 3; hudBox(c0, r0, f.text.length + 4, 3, HC.dim, true); hudText(c0 + 2, r0 + 1, f.text, f.col); });
}
function drawFloatingTexts() {
  if (GAME.floatText === false) return;
  const tmp = [0, 0];
  for (const tx of FX.texts) {
    const p = worldToHud(tx.x, tx.y - tx.age * 5 * RES, tmp), k = 1 - clamp((tx.age / tx.life - .7) / .3, 0, 1);
    hudText(p[0] - (tx.text.length >> 1), p[1], tx.text, k < 1 ? tx.c.map(v => v * k) : tx.c);
  }
}

// ---------- the standard shell: title, pause menu, controls, result ----------
// Pixelite.run({ shell: true }) (or { title, pause, result }): the engine draws the title screen from game.json (title, tagline, controls,
// and a blinking prompt), starts the game on Enter / Space / tap / pad A (GAME.start(), else setState('play')), and shows a pause menu on
// P or Esc: RESUME, RESTART (if GAME.restart), SOUND, DETAIL, CONTROLS (rebind actions), FULL SCREEN, QUIT (back to the title).
// A game replaces any of it by not switching it on. screenResult({ title, lines, prompt }) draws a result box ("LEVEL CLEAR",
// the lines under it) for a game's own end state; GAME.menu: [{ label, onSelect }] adds entries to the pause menu.
let SHELL_SCREEN = 'menu';
function shellOn(k) { const s = GAME.shell; return !!s && (s === true || s[k] !== false); }
function drawTitleScreen(t) {
  const m = typeof GAME_MANIFEST !== 'undefined' ? GAME_MANIFEST : {}, title = (m.title || GAME.id || '').toUpperCase();
  const big = hudTitleWidth(title) <= R.hcols - 4, r0 = Math.max(2, Math.floor(R.hrows * .12));
  if (big) hudTitle(Math.floor((R.hcols - hudTitleWidth(title) + 1) / 2), r0, title, HC.gold); else hudText(Math.floor((R.hcols - title.length) / 2), r0 + 2, title, HC.gold);
  let r = r0 + (big ? 7 : 4);
  if (m.tagline) for (const l of hudWrap(m.tagline, Math.min(60, R.hcols - 6))) { hudText(Math.floor((R.hcols - l.length) / 2), r++, l, HC.txt); }
  const ctl = (m.controls || []).slice(0, Math.max(0, R.hrows - r - 6));
  if (ctl.length && !(Input.pointer === 'touch')) {
    r++; const kw = Math.max(...ctl.map(c => c[0].length));
    for (const [k, d] of ctl) { const w = kw + 3 + d.length, c0 = Math.floor((R.hcols - w) / 2); hudText(c0, r, k, HC.amber); hudText(c0 + kw + 3, r, d, HC.dim); r++; }
  }
  const prompt = Input.pointer === 'touch' ? 'TAP TO START' : Input.pointer === 'pad' ? 'PRESS A TO START' : 'PRESS ENTER OR SPACE TO START';
  if (Math.floor(t * 1.6) % 2 === 0) hudText(Math.floor((R.hcols - prompt.length) / 2), Math.min(R.hrows - 3, r + 2), prompt, HC.cyan);
}
function drawPauseMenu() {
  if (SHELL_SCREEN === 'controls') { drawControlsMenu(); return; }
  const items = [{ label: 'RESUME', onSelect: () => setPaused(false) }];
  if (GAME.restart) items.push({ label: 'RESTART', onSelect: () => { setPaused(false); GAME.restart(); } });
  items.push({ label: 'SOUND', value: SETTINGS.mute ? 'OFF' : 'ON', onSelect: () => setSetting('mute', !SETTINGS.mute), onAdjust: () => setSetting('mute', !SETTINGS.mute) });
  if (Sfx.setVolumes) items.push({ label: 'MUSIC', value: Math.round(SETTINGS.music * 10) + '/10', onAdjust: d => setSetting('music', clamp(Math.round((SETTINGS.music + d * .1) * 10) / 10, 0, 1)) },
    { label: 'EFFECTS', value: Math.round(SETTINGS.sfx * 10) + '/10', onAdjust: d => setSetting('sfx', clamp(Math.round((SETTINGS.sfx + d * .1) * 10) / 10, 0, 1)) });
  if (levelsOf().length > 1) items.push({ label: 'DETAIL', value: detailLabel(), onSelect: () => stepDetail(RES >= DETAIL_LEVELS[DETAIL_LEVELS.length - 1] ? -4 : 1), onAdjust: d => stepDetail(d) });
  items.push({ label: 'REDUCED MOTION', value: SETTINGS.reducedMotion ? 'ON' : 'OFF', onSelect: () => setSetting('reducedMotion', !SETTINGS.reducedMotion) });
  if (Object.keys(ACTIONS).some(k => !k.startsWith('ui.'))) items.push({ label: 'CONTROLS', onSelect: () => { SHELL_SCREEN = 'controls'; } });
  for (const it of GAME.menu || []) items.push(it);
  if (document.fullscreenEnabled) items.push({ label: 'FULL SCREEN', onSelect: () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { } } });
  items.push({ label: 'QUIT TO TITLE', onSelect: () => { setPaused(false); if (GAME.quit) GAME.quit(); else setState('title'); } });
  hudMenu('pause', items, { title: 'PAUSED' });
}
function drawControlsMenu() {
  const names = Object.keys(ACTIONS).filter(k => !k.startsWith('ui.'));
  const items = names.map(n => ({ label: n.toUpperCase(), value: CAPTURE && CAPTURE.name === n ? 'PRESS A KEY OR BUTTON...' : ACTIONS[n].tokens.filter(t => !t.startsWith('touch:')).map(t => t.replace(/^Key|^Arrow|^Digit/, '').replace(/^pad:/, 'PAD ').toUpperCase()).join(' / '),
    onSelect: () => { CAPTURE = { name: n, apply: tok => bindAction(n, tok) }; } }));
  items.push({ label: 'RESET TO DEFAULTS', onSelect: resetActions }, { label: 'BACK', onSelect: () => { SHELL_SCREEN = 'menu'; } });
  hudMenu('controls', items, { title: 'CONTROLS' });
}
// a key or pad button pressed while a rebind waits: bind it (Esc cancels)
function captureKey(code) { const c = CAPTURE; CAPTURE = null; if (code !== 'Escape') c.apply(code); }
function stepCapture() {
  if (!CAPTURE) return;
  for (const b in PADV) if (PADV[b] > .5 && !CAPTURE.padHeld) { const c = CAPTURE; CAPTURE = null; c.apply('pad:' + b); return; }
  CAPTURE.padHeld = false; for (const b in PADV) if (PADV[b] > .5) CAPTURE.padHeld = true;
}
function screenResult(o) {
  const lines = [[o.title || 'DONE', HC.gold], ...(o.lines || []).map(l => [l, HC.txt])];
  if (o.prompt !== false) lines.push(['', HC.txt], [o.prompt || (Input.pointer === 'touch' ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE'), HC.cyan]);
  msgBox(lines);
}
// the shell's part of a step: leave the title
function stepShell() {
  if (state === 'title' && shellOn('title') && (actionPressed('ui.ok') || Input.pressed.has('Tap') || Input.pressed.has('Enter'))) { Input.pressed.delete('Tap'); Input.pressed.delete('Enter'); if (GAME.start) GAME.start(); else setState('play'); }
}
function drawShell(t) {
  if (state === 'title' && shellOn('title')) drawTitleScreen(t);
  else if (isPaused() && shellOn('pause')) drawPauseMenu();
  else SHELL_SCREEN = 'menu';
}
