// Line diff → unified diff text that `git apply` accepts. Small and dependency-free: common prefix and
// suffix are trimmed first, then a longest-common-subsequence table covers the changed middle, which
// for hand edits is small.

function splitLines(s) {
  const lines = s.split('\n'), eol = lines.length > 0 && lines[lines.length - 1] === '';
  if (eol) lines.pop();
  return { lines, eol };
}

// edit script: [['=', line] | ['-', line] | ['+', line], ...]
function lineOps(a, b) {
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf), n = A.length, m = B.length;
  const ops = a.slice(0, pre).map(l => ['=', l]);
  if (n * m > 4e7) {   // too big for the table: replace the middle wholesale
    for (const l of A) ops.push(['-', l]); for (const l of B) ops.push(['+', l]);
  } else {
    const T = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      T[i * (m + 1) + j] = A[i] === B[j] ? T[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(T[(i + 1) * (m + 1) + j], T[i * (m + 1) + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push(['=', A[i]]); i++; j++; }
      else if (T[(i + 1) * (m + 1) + j] >= T[i * (m + 1) + j + 1]) ops.push(['-', A[i++]]);
      else ops.push(['+', B[j++]]);
    }
    while (i < n) ops.push(['-', A[i++]]);
    while (j < m) ops.push(['+', B[j++]]);
  }
  for (const l of a.slice(a.length - suf)) ops.push(['=', l]);
  return ops;
}

/** Unified diff of one file (path relative to the repo root); '' when the texts are equal. */
export function unifiedDiff(path, before, after, context = 3) {
  if (before === after) return '';
  const A = splitLines(before), B = splitLines(after), ops = lineOps(A.lines, B.lines);
  // a missing final newline counts as a change of the last line
  if (A.eol !== B.eol) {
    const lastA = A.lines.length - 1, lastB = B.lines.length - 1;
    if (lastA >= 0 && lastB >= 0 && A.lines[lastA] === B.lines[lastB]) {
      const k = ops.map(o => o[0]).lastIndexOf('=');
      if (k >= 0) ops.splice(k, 1, ['-', A.lines[lastA]], ['+', B.lines[lastB]]);
    }
  }
  // where each op sits in the old (ai) and new (bi) file
  const at = []; let ai = 0, bi = 0;
  for (const [t] of ops) { at.push([ai, bi]); if (t !== '+') ai++; if (t !== '-') bi++; }
  const changes = []; ops.forEach((o, k) => { if (o[0] !== '=') changes.push(k); });
  // group changes closer than two contexts into one hunk
  const groups = [];
  for (const k of changes) { const g = groups[groups.length - 1]; if (g && k - g[1] <= context * 2 + 1) g[1] = k; else groups.push([k, k]); }
  const out = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
  for (const [first, last] of groups) {
    const s0 = Math.max(0, first - context), s1 = Math.min(ops.length, last + 1 + context), body = [];
    let ac = 0, bc = 0;
    for (let k = s0; k < s1; k++) {
      const [t, l] = ops[k], [ka, kb] = at[k];
      body.push((t === '=' ? ' ' : t) + l);
      if (t !== '+') ac++;
      if (t !== '-') bc++;
      const endA = t !== '+' && ka === A.lines.length - 1 && !A.eol, endB = t !== '-' && kb === B.lines.length - 1 && !B.eol;
      if (endA || endB) body.push('\\ No newline at end of file');
    }
    const [a0, b0] = at[s0];
    out.push(`@@ -${ac ? a0 + 1 : a0},${ac} +${bc ? b0 + 1 : b0},${bc} @@`, ...body);
  }
  return out.join('\n') + '\n';
}
