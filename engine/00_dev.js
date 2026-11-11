// ===================== ENGINE · author checks (dev mode) =====================
// Mistakes that used to fail silently: a misspelt material option or hook name, a NaN in a body or a light. With ?dev in the
// page address, and in the web editor's preview (DEV, part 11), they are reported with the nearest valid name; a player's
// page runs none of this. The build checks the rest (duplicate keys in the hooks object, unknown game.json keys).
function devNear(name, list) {
  let best = '', bd = 3;
  for (const w of list) {
    const a = String(name).toLowerCase(), b = w.toLowerCase(), d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (d[a.length][b.length] < bd) { bd = d[a.length][b.length]; best = w; }
  }
  return best;
}
// warn about every key of `obj` that is not in `known`
function devKeys(what, obj, known) {
  if (!DEV || !obj) return;
  for (const k of Object.keys(obj)) if (!known.includes(k)) { const n = devNear(k, known); console.warn(`${what}: unknown option "${k}"${n ? ` (did you mean "${n}"?)` : ''}`); }
}
// every number must be finite
function devFinite(what, ...nums) {
  if (!DEV) return;
  for (const v of nums) if (!Number.isFinite(v)) { const m = `${what}: ${v} where a number was expected`; console.error(m); reportError(m); return; }
}
