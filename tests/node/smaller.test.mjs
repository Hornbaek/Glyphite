// Smaller pages: the optional engine parts (game.json "engine", the stand-ins in engine/stubs/) and the minifier (tools/minify.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { assemble, enginePartsFor, lineMap } from '../../tools/assemble.mjs';
import { minifyScript, minifyPage } from '../../tools/minify.mjs';
import { MANIFEST_KEYS, checkAuthor } from '../../tools/authorcheck.mjs';
import { loadEngine } from './engine-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const engine = JSON.parse(read('engine/engine.json'));
const full = { version: 'x', parts: engine.parts.map(name => ({ name, code: read(`engine/${name}`) })), optional: engine.optional,
  stubs: Object.fromEntries(Object.values(engine.optional).map(([, stub]) => [stub, read(`engine/${stub}`)])) };
const names = (m) => enginePartsFor(full, m).map(p => p.name);
const gameDirs = ['games', 'templates'].flatMap(b => readdirSync(join(ROOT, b)).filter(n => existsSync(join(ROOT, b, n, 'game.json'))).map(n => `${b}/${n}`));
const pageOf = (dir, extra = {}) => {
  const m = { ...JSON.parse(read(`${dir}/game.json`)), ...extra };
  return assemble({ shell: read('engine/shell.html'), engine: full, manifest: m, head: m.head ? read(`${dir}/${m.head}`) : '', parts: m.parts.map(name => ({ name, code: read(`${dir}/${name}`) })) });
};

test('optional engine parts: a game without the "engine" key carries everything; with it, what it leaves out becomes a stand-in in the same place', () => {
  assert.deepEqual(names({}), engine.parts, 'no key: every part, as always');
  assert.deepEqual(names({ engine: ['chip', 'iso', 'sampler'] }), engine.parts, 'all named: every part');
  const none = names({ engine: [] });
  assert.ok(!none.includes('13_sampler.js') && !none.includes('08_chip.js') && !none.includes('12_iso.js'));
  assert.deepEqual(none.filter(n => n.startsWith('stubs/')).sort(), ['stubs/chip.js', 'stubs/iso.js', 'stubs/sampler.js']);
  assert.equal(none.indexOf('stubs/sampler.js'), engine.parts.indexOf('13_sampler.js'), 'a stand-in takes its part\'s place (load order)');
  assert.deepEqual(names({ engine: ['sampler'] }).filter(n => n.startsWith('stubs/')), ['stubs/chip.js', 'stubs/iso.js']);
  assert.deepEqual(enginePartsFor({ parts: full.parts }, { engine: [] }), full.parts, 'an engine object without the optional map (an older editor) gets every part');
  assert.ok(engine.parts.includes('08_music.js'), 'the beat, b64buf and note names stay in the page whatever the list says');
});

test('a page without the Sampler, the Chip or the isometric ground still loads and runs; calling a missing part says what to add', () => {
  const E = loadEngine({ engine: [] });
  E.run('setResVars(2); defineMaterial("rock", { tough: 5 }); worldInit(64, 64); lightAlloc(40, 30); syncSkyline(); computeLighting(2, 2, [], 1e9)');   // lighting, the beat and the sound's start-up do not need them
  E.run('Beat.step(1); Beat.pulse(); Beat.blink(1)');
  assert.equal(E.run('Chip.playing'), false); assert.equal(E.run('Sampler.playing'), false); assert.equal(E.run('Sampler.forced'), null);
  E.run('Chip.init(null, null); Sampler.init(null, null); Sampler.force(null); Chip.stop(.2); Sampler.stop(.2); Sampler.setVolume(.3)');
  assert.throws(() => E.run('Sampler.play({})'), /add "sampler" to the "engine" list in game\.json/);
  assert.throws(() => E.run('Chip.play({})'), /add "chip"/);
  assert.throws(() => E.run('isoInit(4, 4)'), /add "iso"/);
  assert.equal(E.run('typeof b64buf'), 'function'); assert.equal(E.run('noteName(60)'), 'C-4');
  assert.equal(E.run('Pixelite.version'), 'test');
});

test('the pages carry what their game.json says, and are smaller for it', () => {
  const pages = {}, manifests = {};
  for (const d of gameDirs) { const m = JSON.parse(read(`${d}/game.json`)); manifests[m.id] = m; pages[m.id] = pageOf(d); }   // assembled here, not read from dist/ (other tests rebuild it)
  const has = (id, part) => pages[id].includes(`// ----- engine/${part} -----`);
  for (const [id, m] of Object.entries(manifests)) {
    for (const [key, [part, stub]] of Object.entries(engine.optional)) {
      const wanted = !Array.isArray(m.engine) || m.engine.includes(key);
      assert.equal(has(id, part), wanted, `${id}: ${part}`); assert.equal(has(id, stub), !wanted, `${id}: ${stub}`);
    }
  }
  assert.ok(Array.isArray(manifests.starter.engine) && manifests.starter.engine.length === 0, 'the starter uses none of them');
  assert.ok(manifests.spacemouse.engine.includes('sampler') && manifests.regolith.engine.includes('chip') && manifests.fjordheim.engine.includes('iso'), 'each game names what it plays with');
  assert.ok(pages.starter.length < pages.spacemouse.length - 50 * 1024, "the starter's page is well under a page with the sampler in it");
});

test('"engine" is a known game.json key', () => {
  assert.ok(MANIFEST_KEYS.includes('engine'));
  const r = checkAuthor({ path: 'games/x', manifest: { id: 'x', engine: ['sampler'] }, parts: [] });
  assert.deepEqual(r.errors, []);
});

test('minify: comments, indentation and trailing spaces go; strings, templates and regular expressions stay as they are', () => {
  const m = minifyScript;
  assert.equal(m('  const a = 1; // note   \n    /* x */ b();  \n'), 'const a = 1;\nb();\n');
  assert.equal(m("const u = 'http://x', v = \"/* no */ // no\", w = '\\'//';\n"), "const u = 'http://x', v = \"/* no */ // no\", w = '\\'//';\n");
  const tpl = 'const t = `a\n   // not a comment\n    /* nor this */ b ${ x } c`;\n';
  assert.equal(m(tpl), tpl, 'a template is data: its indentation and what looks like comments stay');
  assert.equal(m('f(`a ${ g(`b ${ h({ k: 1 }) }`) } c`); // gone\n'), 'f(`a ${ g(`b ${ h({ k: 1 }) }`) } c`);\n', 'templates nest, with braces inside');
  assert.equal(m('const r = /\\/\\/ ----- (.+) -----$/.exec(s); // c\n'), 'const r = /\\/\\/ ----- (.+) -----$/.exec(s);\n', 'a regular expression holding two slashes is not a comment');
  assert.equal(m('if (/["\']/.test(a)) b(); // c\n'), 'if (/["\']/.test(a)) b();\n', 'a quote in a regular expression does not open a string');
  assert.equal(m('const q = /[/]\\//g; // c\n'), 'const q = /[/]\\//g;\n', 'a slash in a [class]');
  assert.equal(m('x = a / b / c; // d\ny = i++ / 2; // d\nz = (a + b) / 2 / 3; // d\n'), 'x = a / b / c;\ny = i++ / 2;\nz = (a + b) / 2 / 3;\n', 'division is not a regular expression');
  assert.equal(m('return /a b/.test(s); // c\n'), 'return /a b/.test(s);\n');
  assert.equal(m('x = s.split(/,\\s*/); // c\n'), 'x = s.split(/,\\s*/);\n');
  assert.equal(m('a = 1;\n// ----- games/x/main.js -----\n  b = 2; // ----- not a marker -----\n'), 'a = 1;\n// ----- games/x/main.js -----\nb = 2;\n', 'a marker line stays; the same words after code are a comment');
  assert.equal(m('a = 1;\n  // ----- live MIDI bytes -----\nb = 2;\n'), 'a = 1;\n\nb = 2;\n', 'an indented comment that merely looks like a marker is dropped (lineMap would take it for one once it stood at the start of its line)');
  assert.equal(m('a = 1; /* two\n lines */ b = 2;\n'), 'a = 1;\n\nb = 2;\n'.replace('\n\nb', '\nb'.padStart(2, '\n')), 'a block comment keeps its line breaks');
  assert.equal(m('x = a+/* c */+b;\n'), 'x = a+ +b;\n', 'a comment between two tokens leaves a space, so + + does not become ++');
  assert.equal(m('a\n  .b()  \n'), 'a\n.b()\n', 'no line is joined: automatic semicolons behave as before');
  const once = m(tpl + 'f(a / b); // x\n'); assert.equal(m(once), once, 'idempotent');
});

test('minify: every line stays where it was, and what comes out compiles and does the same', () => {
  const sources = [...engine.parts.map(p => `engine/${p}`), ...Object.values(engine.optional).map(([, s]) => `engine/${s}`), ...gameDirs.flatMap(d => JSON.parse(read(`${d}/game.json`)).parts.map(p => `${d}/${p}`))];
  let before = 0, after = 0;
  for (const f of sources) {
    const code = read(f), min = minifyScript(code);
    assert.equal(min.split('\n').length, code.split('\n').length, `${f}: the number of lines`);
    assert.doesNotThrow(() => new vm.Script(min, { filename: f }), `${f} compiles`);
    before += code.length; after += min.length;
  }
  assert.ok(after < before * .85, `the sources shrink by a fifth or more (${before} -> ${after})`);
  for (const d of gameDirs) {   // a whole page: the same markers on the same lines, so errors map to the same file and line
    const page = pageOf(d), min = minifyPage(page);
    assert.equal(min.split('\n').length, page.split('\n').length, `${d}: lines`);
    const a = lineMap(page), b = lineMap(min);
    assert.deepEqual(b.map(x => x && x[0]), a.map(x => x && x[0]), `${d}: which file each line belongs to`);
    assert.ok(min.includes('PIXELITE_LINE0 = ') && min.length < page.length * .85, `${d}: smaller`);
  }
  // the same engine, minified, runs the same: sand falls, bodies rest, the seeded random gives the same pile
  const run = opts => {
    const E = loadEngine(opts);
    E.run(`defineMaterial('rock', { tough: 5, anchor: true }); defineMaterial('sand', { granular: true }); worldMaterials({ edge: 1, rubble: 2 }); worldInit(80, 60); seedRandom(11);
      for (let x = 0; x < W; x++) for (let y = H - 4; y < H; y++) setC(x, y, 1); for (let y = 10; y < 26; y++) for (let x = 20; x < 36; x++) setC(x, y, 2);`);
    E.run('for (let i = 0; i < 700; i++) { frameNo++; stepParticles(DT); simGranular(); }');
    return E.run('(() => { let h = 0; for (let i = 0; i < cells.length; i++) h = (Math.imul(h, 31) + cells[i]) | 0; return h; })()');
  };
  assert.equal(run({ minify: true }), run({}), 'the minified engine makes the same world');
});
