// The What's new page: renders /changes.json (tools/changes.mjs, written by the build from docs/HISTORY.md and the merged
// pull requests). Entries newer than the last visit are marked; the last section seen is remembered in this browser.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// text from HISTORY.md is escaped first; then `code`, **bold** and *italic* become tags
const rich = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
const KEY = 'glyphite.whatsnew.seen';
const store = {
  get() { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } },
  set(n) { try { localStorage.setItem(KEY, String(n)); } catch { } }
};
const entry = (s, seen) => `<article class="entry${s.n > seen ? ' fresh' : ''}" id="s${s.n}">
  <h2><span class="no">${s.n}</span> <span>${esc(s.title)}</span>${s.date ? `<span class="when">${esc(s.date)}</span>` : ''}${s.n > seen ? '<span class="new">NEW</span>' : ''}</h2>
  ${s.quote.length ? `<blockquote>${s.quote.map(q => `<p>${rich(q)}</p>`).join('')}</blockquote>` : ''}
  ${s.items.length ? `<ul>${s.items.map(i => `<li>${rich(i)}</li>`).join('')}</ul>` : ''}
</article>`;

async function main() {
  let data;
  try { const r = await fetch('/changes.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); data = await r.json(); }
  catch (e) { $('#log').innerHTML = `<p class="empty">Could not load the changes (${esc(e.message)}).</p>`; return; }
  const seen = store.get(), recent = data.sections.filter(s => s.n >= 10), older = data.sections.filter(s => s.n < 10);
  $('#log').innerHTML = recent.map(s => entry(s, seen)).join('') +
    (older.length ? `<details class="older"><summary>Earlier history (sections 1–${Math.max(...older.map(s => s.n))}, from the first session)</summary>${older.map(s => entry(s, seen)).join('')}</details>` : '');
  if (data.merged.length) {
    $('#mergedList').innerHTML = data.merged.map(m => `<li><span class="pr">#${m.pr}</span> ${esc(m.title)}<span class="d">${esc(m.date)}</span></li>`).join('');
    $('#merged').hidden = false;
  }
  if (data.latest > seen) store.set(data.latest);   // marked as seen once it has been shown
}
main();
