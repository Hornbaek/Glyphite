// A conservative minifier for a built page's script (node tools/pixelite.mjs build --minify): it takes out comments, the indentation of
// each line and trailing spaces, and nothing else. No names are shortened and no line is joined or removed, so every statement keeps its
// line: the `// ----- path -----` markers the assembler writes stay where they are, the page's line numbers still map to source lines
// (lineMap, PIXELITE_LINE0 and sourceLine in engine/11_loop.js), automatic semicolons come out as before, and an error in a minified page names the
// same file and line as in the full one. Strings, template literals (their text is data: the levels' String.raw maps are templates) and regular
// expressions are copied as they are.
// No dependencies. A regular expression is told from a division by what comes before the slash (the usual rule, and enough for this code
// base; the build checks that the result compiles, tests/node/minify.test.mjs pins the tricky cases, and the games run the same minified).

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'instanceof', 'new', 'delete', 'void', 'throw', 'yield', 'await']);
const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const WORD = /[A-Za-z0-9_$]/;
const MARKER = /^\/\/ ----- .+ -----$/;

export function minifyScript(code) {
  const n = code.length, out = [], braces = [];   // braces: for each ${ } being read inside a template, the { opened in it so far
  let i = 0, atLineStart = true, lineHasCode = false, last = '', word = '', outTail = '', recent = '';   // recent: the last two characters of code that were not spaces
  const emit = s => { out.push(s); if (s) outTail = s; };
  const trimTrailing = () => {   // spaces and tabs at the end of the line so far
    while (out.length) { const s = out[out.length - 1]; if (s === '\n') return; const t = s.replace(/[ \t\r]+$/, ''); if (t === s) return; if (t) { out[out.length - 1] = t; return; } out.pop(); }
  };
  // the text of a template from i: copied to the closing backtick, or to a ${ (which goes back to reading code until its closing brace)
  const templateText = from => {
    let j = from;
    while (j < n) {
      const ch = code[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') { emit(code.slice(from, j + 1)); return j + 1; }
      if (ch === '$' && code[j + 1] === '{') { emit(code.slice(from, j + 2)); braces.push(0); return j + 2; }
      j++;
    }
    emit(code.slice(from)); return n;
  };
  while (i < n) {
    const c = code[i];
    if (c === '\n') { trimTrailing(); emit('\n'); i++; atLineStart = true; lineHasCode = false; continue; }
    if (atLineStart && (c === ' ' || c === '\t' || c === '\r')) { i++; continue; }   // indentation
    atLineStart = false;
    const d = code[i + 1];
    if (c === '/' && d === '/') {   // a line comment (a marker line stays)
      let e = code.indexOf('\n', i); if (e < 0) e = n;
      const text = code.slice(i, e).replace(/\s+$/, '');
      if ((i === 0 || code[i - 1] === '\n') && MARKER.test(text)) emit(text);   // only at the very start of a line: an indented one is a comment, as lineMap sees it
      i = e; continue;
    }
    if (c === '/' && d === '*') {   // a block comment: its line breaks stay, a space keeps two tokens apart
      const e = code.indexOf('*/', i + 2), end = e < 0 ? n : e + 2, lines = (code.slice(i, end).match(/\n/g) || []).length;
      if (lines) { trimTrailing(); emit('\n'.repeat(lines)); atLineStart = true; lineHasCode = false; }
      else if (lineHasCode) { if (!/\s$/.test(outTail)) emit(' '); } else atLineStart = true;   // a comment on a line of its own leaves no space behind
      i = end; continue;
    }
    if (c === '"' || c === "'") {   // a string
      let j = i + 1; while (j < n && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      emit(code.slice(i, j + 1)); i = j + 1; lineHasCode = true; last = c; word = ''; continue;
    }
    if (c === '`') { emit('`'); i = templateText(i + 1); lineHasCode = true; last = braces.length ? '{' : '`'; word = ''; continue; }
    if (c === '/') {
      const doubled = recent === '++' || recent === '--';   // x++ / 2
      if (last === '' || (REGEX_AFTER.has(last) && !doubled) || last === '}' || (word && KEYWORDS_BEFORE_REGEX.has(word))) {   // a regular expression: to the next unescaped / outside a [class]
        let j = i + 1, cls = false;
        while (j < n && (cls || code[j] !== '/') && code[j] !== '\n') { if (code[j] === '\\') j++; else if (code[j] === '[') cls = true; else if (code[j] === ']') cls = false; j++; }
        emit(code.slice(i, j + 1)); i = j + 1; lineHasCode = true; last = ')'; word = ''; continue;   // after a literal, a / divides
      }
    }
    if (braces.length) {   // inside a template's ${ }: the braces tell where it ends
      if (c === '{') braces[braces.length - 1]++;
      else if (c === '}') {
        if (braces[braces.length - 1] === 0) { braces.pop(); emit('}'); i = templateText(i + 1); lineHasCode = true; last = braces.length ? '{' : '`'; word = ''; continue; }
        braces[braces.length - 1]--;
      }
    }
    emit(c); i++; lineHasCode = true;
    if (c !== ' ' && c !== '\t' && c !== '\r') { last = c; recent = (recent + c).slice(-2); word = WORD.test(c) ? word + c : ''; }
  }
  return out.join('');
}

// the script of a built page (between its <script> tags), minified
export function minifyPage(page) {
  const a = page.indexOf('<script>\n') + 9, b = page.lastIndexOf('</script>');
  if (a < 9 || b < 0) return page;
  return page.slice(0, a) + minifyScript(page.slice(a, b)) + page.slice(b);
}
