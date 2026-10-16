// What's new: turns docs/HISTORY.md (one numbered section per request: the request quoted, then what was done) and
// the merged pull requests (the squash commits on main, "Title (#N)") into data/changes.json for the site's
// What's new page. The build writes it; the page renders it.
import { execFileSync } from 'node:child_process';

// '## 13. Ideas from the idea bank (Claude Code, 2026-10-16)' → { n: 13, title, date, by }
function heading(line) {
  const m = /^## (\d+)\. (.+)$/.exec(line); if (!m) return null;
  let title = m[2].trim(), date = null, by = null;
  const p = /\s*\(([^()]*?)\)\s*$/.exec(title);
  if (p) { const d = /(\d{4}-\d{2}-\d{2})/.exec(p[1]); if (d) { date = d[1]; by = p[1].replace(d[0], '').replace(/[,\s]+$/, '').trim() || null; title = title.slice(0, p.index).trim(); } }
  return { n: +m[1], title, date, by };
}

const clean = s => s.replace(/\s+/g, ' ').trim();

export function parseHistory(text) {
  const lines = text.split('\n'), sections = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) { cur = null; const h = heading(line); if (h) { cur = { ...h, quote: [], items: [], intro: '' }; sections.push(cur); } continue; }
    if (!cur) continue;
    if (line.startsWith('>')) {                                   // the request, quoted: one string per quoted paragraph
      const body = line.replace(/^>\s?/, '').trim();
      const last = cur.quote.length ? cur.quote[cur.quote.length - 1] : null;
      if (!body) { cur._gap = true; continue; }
      if (last === null || cur._gap || cur._open === false) cur.quote.push(body); else cur.quote[cur.quote.length - 1] += ' ' + body;
      cur._gap = false; cur._open = true; continue;
    }
    cur._open = false;
    if (/^- /.test(line)) { cur.items.push(line.slice(2)); cur._inItem = true; continue; }      // a top-level bullet
    if (cur._inItem && /^ {2,}\S/.test(line)) { cur.items[cur.items.length - 1] += ' ' + line.trim(); continue; }   // its continuation
    cur._inItem = false;
    if (!cur.items.length && !cur.intro && line.trim() && !/^[|#`-]/.test(line.trim()) && !/^\d+\./.test(line.trim())) cur.intro = line.trim();
  }
  return sections.map(s => ({
    n: s.n, title: s.title, date: s.date, by: s.by,
    quote: s.quote.map(q => clean(q).replace(/^["“]+|["”]+$/g, '')).filter(Boolean),
    items: (s.items.length ? s.items : s.intro ? [s.intro] : []).map(clean).slice(0, 14)
  }));
}

// squash-merge commits on main: "Title (#12)". Best effort: a shallow clone has little history and that is fine.
export function mergedPullRequests(root, limit = 30) {
  try {
    const out = execFileSync('git', ['log', '--first-parent', `-n${limit}`, '--format=%cI\t%s'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map(l => l.split('\t')).filter(p => p.length === 2).map(([date, subject]) => {
      const m = /^(.*) \(#(\d+)\)$/.exec(subject); return m ? { pr: +m[2], title: m[1], date: date.slice(0, 10) } : null;
    }).filter(Boolean);
  } catch (e) { return []; }
}

export function buildChanges(historyText, root) {
  const sections = parseHistory(historyText).sort((a, b) => b.n - a.n);
  return { latest: sections.length ? sections[0].n : 0, sections, merged: mergedPullRequests(root) };
}
