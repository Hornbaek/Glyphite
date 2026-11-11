// Build-time checks for the people (and sessions) who write games: mistakes that would otherwise fail without a word.
//   checkAuthor(game) -> { errors: [...], warnings: [...] }   (game: { path, manifest, parts: [{ name, code }] })
// Errors stop the build. Warnings are printed.
//  - a key that appears twice in the Pixelite.run({...}) hooks object (the second silently wins: two afterFrame hooks were a real bug)
//  - a game.json key that nothing reads (a typo: "tunable" for "tunables")
//  - Math.random in game code (it makes a run unrepeatable: use rnd(), engine/API.md "Random numbers")

// every top-level key game.json may have; add a key here when the portal, the editor, a tool or the engine starts to read it
export const MANIFEST_KEYS = ['id', 'title', 'tagline', 'description', 'order', 'listed', 'status', 'thumbnail', 'head', 'parts', 'controls',
  'tunables', 'levels', 'smoke', 'aria', 'template', 'actions', 'presets', 'detail'];

// the top-level keys of the object literal that starts at code[open] === '{', in order
export function literalKeys(code, open) {
  const keys = []; let depth = 0, i = open, atEntry = false;
  const skipWs = () => { for (;;) {
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code.startsWith('//', i)) { while (i < code.length && code[i] !== '\n') i++; }
    else if (code.startsWith('/*', i)) { const e = code.indexOf('*/', i + 2); i = e < 0 ? code.length : e + 2; }
    else return;
  } };
  while (i < code.length) {
    const c = code[i];
    if (c === '{' || c === '[' || c === '(') { depth++; i++; if (depth === 1 && c === '{') atEntry = true; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; if (depth === 0) break; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++; }
      if (depth === 1 && atEntry && q !== '`') keys.push(code.slice(i + 1, j));
      atEntry = false; i = j + 1; continue;
    }
    if (code.startsWith('//', i) || code.startsWith('/*', i)) { skipWs(); continue; }
    if (depth === 1 && c === ',') { atEntry = true; i++; continue; }
    if (depth === 1 && atEntry) {
      skipWs();
      const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 80));
      if (m) {
        let name = m[0]; i += name.length;
        if (name === 'async' || name === 'get' || name === 'set') {   // async update() {}: the key is the next word
          const w = /^\s+([A-Za-z_$][\w$]*)/.exec(code.slice(i, i + 80));
          if (w && !/^\s*[:(,}]/.test(code.slice(i, i + 3))) { name = w[1]; i += w[0].length; }
        }
        keys.push(name); atEntry = false; continue;
      }
      if (code[i] === '"' || code[i] === "'") continue;   // a quoted key: the string branch above takes it
      atEntry = false; continue;
    }
    i++;
  }
  return keys;
}

export function checkAuthor({ path, manifest, parts }) {
  const errors = [], warnings = [];
  for (const k of Object.keys(manifest)) if (!MANIFEST_KEYS.includes(k)) errors.push(`${path}/game.json: unknown key "${k}" (known: ${MANIFEST_KEYS.join(', ')})`);
  let rnds = 0;
  for (const p of parts) {
    for (const m of p.code.matchAll(/Pixelite\.run\(\s*\{/g)) {
      const open = m.index + m[0].length - 1, seen = new Set();
      for (const k of literalKeys(p.code, open)) { if (seen.has(k)) errors.push(`${path}/${p.name}: "${k}" appears twice in the Pixelite.run({...}) hooks (the second one silently wins)`); seen.add(k); }
    }
    rnds += (p.code.match(/Math\.random\(/g) || []).length;
  }
  if (rnds) warnings.push(`${path}: ${rnds} call${rnds > 1 ? 's' : ''} to Math.random in game code make a run unrepeatable: use rnd() (seeded; engine/API.md)`);
  return { errors, warnings };
}
