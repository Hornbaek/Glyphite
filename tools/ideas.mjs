#!/usr/bin/env node
// The idea bank: docs/ideas.json is the data (a brainstorm of everything the engine could have), this
// writes docs/IDEAS.md from it. The site's /ideas/ page reads the same JSON and keeps stars and status in
// Cloudflare D1 (worker/ideas.js), so the repository holds the ideas and the database holds what we decided.
//
//   node tools/ideas.mjs            rewrite docs/IDEAS.md
//   node tools/ideas.mjs --check    fail if docs/IDEAS.md is out of date (the unit tests run this)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'docs', 'ideas.json');
const MD_PATH = join(ROOT, 'docs', 'IDEAS.md');

// Pitches are full of '*' crystals, A*, _ . - ~ glyph lists and <id> paths: keep `code` spans as they are and
// escape what GitHub would read as emphasis, links, strikethrough or HTML everywhere else.
const esc = t => t.replace(/([\\`*_[\]~])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function md(s) {
  if ((s.match(/`/g) || []).length % 2) return esc(s);   // a lone backtick is the glyph itself, not a code span
  return s.split(/(`[^`]*`)/).map((p, i) => (i % 2 ? p : esc(p))).join('');
}

export function loadIdeas() { return JSON.parse(readFileSync(JSON_PATH, 'utf8')); }

export function validate(data) {
  const SIZES = ['tiny', 'small', 'medium', 'large', 'moonshot'], WILD = ['practical', 'bold', 'crazy'];
  const seen = new Set();
  for (const c of data.categories) for (const i of c.ideas) {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(i.id)) throw new Error(`bad idea id: ${i.id}`);
    if (seen.has(i.id)) throw new Error(`duplicate idea id: ${i.id}`);
    seen.add(i.id);
    if (!i.title || !i.pitch) throw new Error(`idea without title or pitch: ${i.id}`);
    if (!SIZES.includes(i.size)) throw new Error(`bad size on ${i.id}: ${i.size}`);
    if (!WILD.includes(i.wildness)) throw new Error(`bad wildness on ${i.id}: ${i.wildness}`);
  }
  return seen.size;
}

export function renderMarkdown(data) {
  const total = validate(data);
  const lines = [
    '# Idea bank', '',
    `Every feature Glyphite could have, from one-glyph polish to moonshots: ${total} ideas in ${data.categories.length} categories.`,
    `Generated ${data.generated} by a multi-agent brainstorm (14 angles, curated, gap-hunted, then de-duplicated). Nothing here is planned or`,
    'promised: `docs/ROADMAP.md` is the plan. Use this as a quarry: pick an idea, check it against `CLAUDE.md`',
    '(engine vs game, ASCII only, both renderers), and build it in a session.', '',
    'The data is `docs/ideas.json` and this file is generated from it (`node tools/ideas.mjs`): edit the JSON, not this file.',
    'On the site, **glyphite.hornbaek.org/ideas/** shows the same ideas with stars, a status and a note for each, kept in',
    'Cloudflare D1 (see "The idea bank" in `CLAUDE.md` for how a session reads them).', '',
    'Size: tiny · small · medium · large · moonshot. Wildness: practical · bold · crazy.', '',
    '## Categories', ''
  ];
  for (const c of data.categories) {
    const anchor = c.name.toLowerCase().replace(/[&,]/g, '').replace(/ /g, '-');   // GitHub's heading anchors
    lines.push(`- [${c.name}](#${anchor}) (${c.ideas.length})`);
  }
  for (const c of data.categories) {
    lines.push('', `## ${c.name}`, '');
    for (const i of c.ideas) {
      const hook = i.hook ? ` *${md(i.hook)}*` : '';
      lines.push(`- **${md(i.title)}** (${i.size}, ${i.wildness}): ${md(i.pitch)}${hook}`);
    }
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = renderMarkdown(loadIdeas());
  if (process.argv.includes('--check')) {
    if (readFileSync(MD_PATH, 'utf8') !== text) { console.error('docs/IDEAS.md is out of date: run node tools/ideas.mjs'); process.exit(1); }
    console.log('docs/IDEAS.md is up to date');
  } else { writeFileSync(MD_PATH, text); console.log(`wrote docs/IDEAS.md (${text.split('\n').length} lines)`); }
}
