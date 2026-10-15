// Assemble a Glyphite game into one self-contained HTML page: the engine's shell, the game's own
// HTML, and one <script> holding the engine parts followed by the game parts, in order. Shared by the
// Node build (tools/glyphite.mjs) and the web editor (which rebuilds its preview in the browser),
// so both produce exactly the same page. No dependencies; runs in Node and in browsers.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON that is safe inside a <script> element (no '</', and the two line separators JSON allows but old JS did not)
const LS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
const scriptJSON = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, c => '\\u' + c.charCodeAt(0).toString(16));

/**
 * @param {object} o
 * @param {string} o.shell     engine/shell.html
 * @param {object} o.engine    engine/engine.json plus the code: { version, parts: [{ name, code }] }
 * @param {object} o.manifest  the game's game.json
 * @param {string} [o.head]    the game's extra HTML (inside #stage)
 * @param {Array}  o.parts     the game's parts in order: [{ name, code }]
 * @param {object} [o.tune]    tunable overrides baked into the page (the editor's preview)
 * @param {string} [o.renderer] '2d' or 'gl' to force a renderer
 * @returns {string} the page
 */
export function assemble({ shell, engine, manifest, head = '', parts, tune = null, renderer = '' }) {
  const id = manifest.id;
  const pre = [
    `const GAME_MANIFEST = ${scriptJSON({ id, title: manifest.title, tunables: manifest.tunables || {} })};`,
    tune ? `window.GLYPHITE_TUNE = ${scriptJSON(tune)};` : '',
    renderer ? `window.GLYPHITE_RENDERER = ${scriptJSON(renderer)};` : ''
  ].filter(Boolean).join('\n');
  const section = (path, code) => `\n// ----- ${path} -----\n${code.replace(/\s+$/, '')}\n`;
  const script = pre + '\n'
    + engine.parts.map(p => section(`engine/${p.name}`, p.code)).join('')
    + parts.map(p => section(`games/${id}/${p.name}`, p.code)).join('');
  const bad = script.search(/<\/script/i);
  if (bad >= 0) throw new Error(`"</script" inside the game's code would end the page's script early (near: ${script.slice(Math.max(0, bad - 60), bad + 10)})`);
  const vals = {
    TITLE: esc(manifest.title || id),
    DESCRIPTION: esc(manifest.tagline || manifest.description || ''),
    ARIA: esc(manifest.aria || `${manifest.title}: ${manifest.tagline || ''}`),
    ENGINE_VERSION: esc(engine.version || ''),
    HTML: head.replace(/\s+$/, ''),
    SCRIPT: script
  };
  return shell.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : m));
}

// Where each line of an assembled page came from: map[pageLine] = [source path, line in that file]
// (1-based), so an error reported against the page can point at the right source file.
export function lineMap(page) {
  const lines = page.split('\n'), map = new Array(lines.length + 1);
  let file = 'page', n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\/\/ ----- (.+) -----$/.exec(lines[i]);
    if (m) { file = m[1]; n = 0; map[i + 1] = [file, 0]; continue; }
    map[i + 1] = [file, ++n];
  }
  return map;
}
