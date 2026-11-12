// Loads the engine's parts into a Node vm context behind a tiny DOM shim, so physics can be tested fast and without a browser.
//   const E = loadEngine();           // E.run('expr') evaluates in the engine's own scope (all parts share one script scope)
//   E.run('worldInit(64, 64)')
// The shim is only enough for the parts to load; nothing here draws.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// opts.game: a game id (games/<id> or templates/<id>): its parts are loaded after the engine with Pixelite.run replaced by a recorder, so the
// game's functions and globals can be called without a page (E.run('newLevel()')); E.hooks is the object the game passed to Pixelite.run.
export function loadEngine({ gameCode = '', version = 'test', game = '', tune = {} } = {}) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'engine/engine.json'), 'utf8'));
  const noop = () => { };
  const el = () => new Proxy(function () { }, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { add: noop, remove: noop } : k === 'getBoundingClientRect' ? () => ({ width: 640, height: 400, left: 0, top: 0 }) : k === 'getContext' ? () => null : noop, set: () => true, apply: () => el() });
  const win = { matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop, parent: null, location: { search: '' }, requestAnimationFrame: noop, AudioContext: undefined, claude: undefined };
  win.parent = win;
  const doc = { getElementById: () => el(), querySelector: () => null, createElement: () => el(), addEventListener: noop, body: el(), hidden: false, documentElement: el() };
  const ctx = vm.createContext({ window: win, document: doc, location: win.location, navigator: {}, performance: { now: () => 0 }, console, localStorage: { getItem: () => null, setItem: noop },
    matchMedia: win.matchMedia, requestAnimationFrame: noop, setTimeout, clearTimeout, ResizeObserver: undefined, Float32Array, Uint8Array, Int32Array, Uint32Array, Uint8ClampedArray, Math, structuredClone, Set, Map });
  win.window = win;
  let code = `const ENGINE_VERSION = ${JSON.stringify(version)};\nconst GAME_MANIFEST = { id: 'harness', title: 'harness', tunables: {} };\n`;
  for (const p of manifest.parts) code += `\n// ----- engine/${p} -----\n` + readFileSync(join(ROOT, 'engine', p), 'utf8') + '\n';
  code += '\n' + gameCode + '\n;globalThis.__eval = s => eval(s);';
  vm.runInContext(code, ctx, { filename: 'engine' });
  const E = { run: expr => ctx.__eval(expr), ctx, hooks: null };
  if (game) {
    const dir = ['games', 'templates'].map(d => join(ROOT, d, game)).find(d => existsSync(join(d, 'game.json')));
    const m = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
    ctx.__rec = h => { E.hooks = h; };
    const tun = { ...Object.fromEntries(Object.entries(m.tunables || {}).map(([k, v]) => [k, v.value])), ...tune };
    vm.runInContext(`Pixelite.run = __rec; for (const k in TUNE) delete TUNE[k]; Object.assign(TUNE, ${JSON.stringify(tun)}); Object.assign(GAME_MANIFEST, { actions: ${JSON.stringify(m.actions || {})} }); loadActions(GAME_MANIFEST);`, ctx);
    let gcode = ''; for (const p of m.parts) gcode += `\n// ----- games/${game}/${p} -----\n` + readFileSync(join(dir, p), 'utf8').replace(/\r\n/g, '\n') + '\n';
    vm.runInContext(gcode, ctx, { filename: 'game' });
  }
  return E;
}
