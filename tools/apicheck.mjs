// The engine's public surface, read from its source, and what the build checks of game code against it.
//   node tools/apicheck.mjs --write      writes engine/api.json (every top-level name of every engine part: kind, parameters, part)
//   node tools/apicheck.mjs              checks that engine/api.json is current and says which names API.md does not mention
// engine/api.json is generated: change the engine, run --write (tests/node/api.test.mjs fails if it is stale, or if a name is neither in
// engine/API.md nor listed in engine/internal.json: document new names, or say on purpose that they are internal).
// checkCalls(code, api, declared) is the game-code lint the build runs: a call to an engine function with more arguments than it takes
// (the extras are ignored) and a call to something nobody declares that is one or two letters away from an engine function (a typo).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// the top-level declarations of one engine part
export function partNames(code, part) {
  const out = {};
  const add = (name, kind, params) => { if (!(name in out)) out[name] = { kind, params, part }; };
  const count = p => { const s = p.trim(); if (!s) return 0; if (/\.\.\./.test(s)) return null; let d = 0, n = 1; for (const c of s) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === ',' && !d) n++; } return n; };
  for (const m of code.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm)) add(m[1], 'function', count(m[2]));
  for (const m of code.matchAll(/^class\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], 'class', null);
  for (const m of code.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/gm)) add(m[1], 'function', m[2] !== undefined ? count(m[2]) : 1);
  for (const m of code.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], 'value', null);
  return out;
}
export function engineApi() {
  const manifest = JSON.parse(rd('engine/engine.json')), names = {};
  for (const p of manifest.parts) Object.assign(names, Object.fromEntries(Object.entries(partNames(rd('engine/' + p), p)).filter(([k]) => !(k in names))));
  const sorted = {}; for (const k of Object.keys(names).sort((a, b) => a.localeCompare(b))) sorted[k] = names[k];
  return { version: manifest.version, names: sorted };
}
const mentioned = (docs, name) => new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '(?![\\w$])').test(docs);
export function undocumented(api, docs) { return Object.keys(api.names).filter(n => !n.startsWith('_') && !mentioned(docs, n)); }

const KEYWORDS = new Set('if for while switch catch return typeof function new delete void await yield else do in of with throw case super import export class const let var async get set'.split(' '));
const BUILTIN = new Set(Object.getOwnPropertyNames(globalThis).concat('window document console localStorage navigator location performance requestAnimationFrame setTimeout setInterval clearTimeout clearInterval fetch URL URLSearchParams Image Audio AudioContext Worker Blob FileReader HTMLElement matchMedia structuredClone queueMicrotask atob btoa alert prompt confirm'.split(' ')));
const dist = (a, b) => { const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
// blank out strings, template text and comments (keeping length), so calls inside them are not seen
function strip(code) {
  let out = '', i = 0;
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2), end = e < 0 ? code.length : e + 2; out += code.slice(i, end).replace(/[^\n]/g, ' '); i = end; }
    else if (c === '"' || c === "'" || c === '`') { const q = c; out += q; i++; while (i < code.length && code[i] !== q) { if (code[i] === '\\') { out += '  '; i += 2; continue; } out += code[i] === '\n' ? '\n' : ' '; i++; } out += q; i++; }
    else { out += c; i++; }
  }
  return out;
}
// every identifier the game declares: functions, variables, classes, parameters, destructured names, object keys and methods
function declaredNames(code) {
  const d = new Set();
  for (const m of code.matchAll(/\b(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*[{[]([^=]*?)[}\]]\s*=/g)) for (const w of m[1].match(/[A-Za-z_$][\w$]*/g) || []) d.add(w);
  for (const m of code.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) for (const w of m[1].match(/[A-Za-z_$][\w$]*/g) || []) d.add(w);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) d.add(m[1]);
  for (const m of code.matchAll(/(?:^|[{,\n])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?::|\()/gm)) d.add(m[1]);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=[^=>]/g)) d.add(m[1]);
  return d;
}
// the arguments of the call whose '(' is at code[open]: how many, and where it ends
function callArgs(code, open) {
  let d = 0, n = 0, any = false;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if ('([{'.includes(c)) { d++; if (d > 1) any = true; } else if (')]}'.includes(c)) { d--; if (d === 0) return { n: any ? n + 1 : 0, end: i }; }
    else if (c === ',' && d === 1) n++;
    else if (d === 1 && !/\s/.test(c)) any = true;
  }
  return null;
}
// warnings for one game file's code: engine = engineApi().names, declared = names declared anywhere in the game (use gameDeclared)
export function checkCalls(file, code, engine, declared) {
  const out = [], src = strip(code), engineNames = Object.keys(engine);
  for (const m of src.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1]; if (KEYWORDS.has(name)) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:function\s*\*?|class|new)\s*$/.test(before)) continue;
    const line = src.slice(0, m.index).split('\n').length, e = engine[name], a = callArgs(src, m.index + m[0].length - 1);
    if (a && /^\s*\{/.test(src.slice(a.end + 1, a.end + 20))) continue;   // `name(args) {`: a method being defined, not a call
    if (e && e.kind === 'function' && e.params !== null) {
      if (!declared.has(name) && a && a.n > e.params) out.push(`${file}:${line}: ${name}() is called with ${a.n} arguments but takes ${e.params} (engine/${e.part}); the extra ones are ignored`);
    } else if (!e && name.length >= 4 && !declared.has(name) && !BUILTIN.has(name)) {
      const near = engineNames.filter(n => Math.abs(n.length - name.length) <= 2 && dist(n.toLowerCase(), name.toLowerCase()) <= (name.length > 6 ? 2 : 1))[0];
      if (near) out.push(`${file}:${line}: ${name}() is not defined anywhere; did you mean ${near}()?`);
    }
  }
  return out;
}
// the names declared across all of a game's parts (the lint sees a part's calls against the whole game, since parts share one scope)
export function gameDeclared(parts) { const d = new Set(); for (const p of parts) for (const n of declaredNames(strip(p.code))) d.add(n); return d; }

if (process.argv[1] && process.argv[1].endsWith('apicheck.mjs')) {
  const api = engineApi(), text = JSON.stringify(api, null, 1) + '\n';
  if (process.argv.includes('--write')) {
    writeFileSync(join(ROOT, 'engine/api.json'), text);
    const docs = rd('engine/API.md'), old = existsSync(join(ROOT, 'engine/internal.json')) ? JSON.parse(rd('engine/internal.json')) : [];
    const internal = [...new Set([...old, ...undocumented(api, docs)])].filter(n => n in api.names).sort((a, b) => a.localeCompare(b));
    writeFileSync(join(ROOT, 'engine/internal.json'), JSON.stringify(internal, null, 1) + '\n');
    console.log(`wrote engine/api.json (${Object.keys(api.names).length} names) and engine/internal.json (${internal.length} names API.md does not mention)`);
  } else {
    const have = existsSync(join(ROOT, 'engine/api.json')) ? rd('engine/api.json') : '';
    console.log(have === text ? 'engine/api.json is current' : 'engine/api.json is stale: node tools/apicheck.mjs --write');
    const internal = existsSync(join(ROOT, 'engine/internal.json')) ? JSON.parse(rd('engine/internal.json')) : [];
    const miss = undocumented(api, rd('engine/API.md')).filter(n => !internal.includes(n));
    if (miss.length) console.log('names neither in engine/API.md nor in engine/internal.json:\n  ' + miss.join('\n  '));
  }
}
