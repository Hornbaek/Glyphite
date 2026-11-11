// Loads the engine's parts into a Node vm context behind a tiny DOM shim, so physics can be tested fast and without a browser.
//   const E = loadEngine();           // E.run('expr') evaluates in the engine's own scope (all parts share one script scope)
//   E.run('worldInit(64, 64)')
// The shim is only enough for the parts to load; nothing here draws.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function loadEngine({ gameCode = '', version = 'test' } = {}) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'engine/engine.json'), 'utf8'));
  const noop = () => { };
  const el = () => new Proxy(function () { }, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { add: noop, remove: noop } : k === 'getBoundingClientRect' ? () => ({ width: 640, height: 400, left: 0, top: 0 }) : k === 'getContext' ? () => null : noop, set: () => true, apply: () => el() });
  const win = { matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop, parent: null, location: { search: '' }, requestAnimationFrame: noop, AudioContext: undefined, claude: undefined };
  win.parent = win;
  const doc = { getElementById: () => el(), querySelector: () => null, createElement: () => el(), addEventListener: noop, body: el(), hidden: false, documentElement: el() };
  const ctx = vm.createContext({ window: win, document: doc, location: win.location, navigator: {}, performance: { now: () => 0 }, console, localStorage: { getItem: () => null, setItem: noop },
    matchMedia: win.matchMedia, requestAnimationFrame: noop, setTimeout, clearTimeout, ResizeObserver: undefined, Float32Array, Uint8Array, Int32Array, Uint32Array, Uint8ClampedArray, Math });
  win.window = win;
  let code = `const ENGINE_VERSION = ${JSON.stringify(version)};\nconst GAME_MANIFEST = { id: 'harness', title: 'harness', tunables: {} };\n`;
  for (const p of manifest.parts) code += `\n// ----- engine/${p} -----\n` + readFileSync(join(ROOT, 'engine', p), 'utf8') + '\n';
  code += '\n' + gameCode + '\n;globalThis.__eval = s => eval(s);';
  vm.runInContext(code, ctx, { filename: 'engine' });
  return { run: expr => ctx.__eval(expr), ctx };
}
