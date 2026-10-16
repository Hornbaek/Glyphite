// Level maps inside a game's source, for the editor's LEVELS tab (and the unit tests). No DOM here.
//
// A game declares its maps in game.json:
//   "levels": { "file": "sectors.js", "legend": { "#": { "name": "hull", "color": "#4a5263" }, "P": { ..., "on": ".", "unique": true } },
//               "marks": { "signs": { "kind": "text", "color": "#ffd278" }, "lowG": { "kind": "rect", "color": "#78dcff", "label": "low gravity" } } }
// In that file every map is a String.raw template literal whose rows start on the line after the backtick, named by the
// closest `name: '...'` before it:
//   { name: 'CARGO BAY', signs: [[6, 15, 'CARGO BAY 1']], map: String.raw`
//   ######
//   #P..c#
//   ######`.slice(1).split('\n') }
// One character is one tile. `on` draws an object over another tile's colour; `unique` allows one per map (the start).
// `marks` are read-only overlays read from the same object: "text" entries are [x, y, 'text'], "rect" ones [x0, y0, x1, y1].

const MAP_RE = /String\.raw`\n([^`]*)`/g;

// every map in the file: { index, name, start, end, rows, head } (start/end: the rows' span in the text; head: its object's
// text from the name to the map, where the marks live)
export function findLevels(text) {
  const out = []; let m, prevEnd = 0;
  MAP_RE.lastIndex = 0;
  while ((m = MAP_RE.exec(text))) {
    const start = m.index + 'String.raw`\n'.length, end = start + m[1].length;
    let head = text.slice(prevEnd, m.index), name = `map ${out.length + 1}`, at = 0;
    for (const n of head.matchAll(/name:\s*(['"])(.*?)\1/g)) { name = n[2]; at = n.index; }
    head = head.slice(at);   // this map's own object, from its name on
    out.push({ index: out.length, name, start, end, rows: m[1].split('\n'), head });
    prevEnd = end;
  }
  return out;
}

// the file with one map's rows replaced (they must not contain a backtick)
export function setLevel(text, level, rows) {
  const body = rows.join('\n');
  if (body.includes('`')) throw new Error('a map cannot contain a backtick');
  return text.slice(0, level.start) + body + text.slice(level.end);
}

// problems that would break the game: ragged rows, characters the legend doesn't know, a unique tile missing or doubled
export function problems(rows, legend) {
  const out = [], w = rows[0] ? rows[0].length : 0, seen = {};
  if (!rows.length || !w) return ['the map is empty'];
  rows.forEach((r, y) => { if (r.length !== w) out.push(`row ${y} is ${r.length} wide, not ${w}`); });
  const unknown = new Set();
  rows.forEach(r => { for (const c of r) { if (!legend[c]) unknown.add(c); seen[c] = (seen[c] || 0) + 1; } });
  if (unknown.size) out.push(`unknown tiles: ${[...unknown].map(c => JSON.stringify(c)).join(' ')}`);
  for (const c in legend) if (legend[c].unique && seen[c] !== 1) out.push(`${legend[c].name} (${c}) must be placed exactly once (now ${seen[c] || 0})`);
  return out;
}

// ---------- edits: each returns new rows ----------
const put = (rows, x, y, c) => rows[y].slice(0, x) + c + rows[y].slice(x + 1);
export function paint(rows, cells, ch, legend) {
  const out = rows.slice();
  if (legend && legend[ch] && legend[ch].unique) {   // moving the one-and-only tile: clear the old one, place it once
    const under = legend[ch].on || '.';
    out.forEach((r, y) => { if (r.includes(ch)) out[y] = r.split(ch).join(under); });
    cells = cells.slice(-1);
  }
  for (const [x, y] of cells) if (y >= 0 && y < out.length && x >= 0 && x < out[y].length) out[y] = put(out, x, y, ch);
  return out;
}
export function rectCells(x0, y0, x1, y1) {
  const out = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]);
  return out;
}
// the cells of a straight line (so a fast stroke leaves no gaps)
export function lineCells(x0, y0, x1, y1) {
  const out = [], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)]);
  return out;
}
export function floodCells(rows, x, y) {
  const h = rows.length, w = rows[0].length, from = rows[y][x], seen = new Uint8Array(w * h), out = [], stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h || seen[cy * w + cx] || rows[cy][cx] !== from) continue;
    seen[cy * w + cx] = 1; out.push([cx, cy]);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return out;
}
// grow or shrink at the right and the bottom (so every coordinate in the level's marks stays where it was)
export function resize(rows, w, h, fill = '#') {
  const out = rows.slice(0, h).map(r => r.length >= w ? r.slice(0, w) : r + fill.repeat(w - r.length));
  while (out.length < h) out.push(fill.repeat(w));
  return out;
}

// ---------- marks (read-only overlays) ----------
function arrayAfter(text, key) {   // the [...] literal after the last `key:` (the one nearest the map), bracket-matched
  let m = null; for (const x of text.matchAll(new RegExp(`\\b${key}\\s*:\\s*\\[`, 'g'))) m = x;
  if (!m) return '';
  let i = m.index + m[0].length - 1, depth = 0;
  for (let j = i; j < text.length; j++) { if (text[j] === '[') depth++; else if (text[j] === ']' && --depth === 0) return text.slice(i + 1, j); }
  return '';
}
export function readMarks(level, marks = {}) {
  const out = [];
  for (const key in marks) {
    const spec = marks[key], body = arrayAfter(level.head, key);
    if (spec.kind === 'text') for (const m of body.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\3\s*\]/g)) out.push({ key, kind: 'text', x: +m[1], y: +m[2], text: m[4], color: spec.color });
    else if (spec.kind === 'rect') for (const m of body.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)) out.push({ key, kind: 'rect', x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: spec.label || key, color: spec.color });
  }
  return out;
}

// ---------- pictures: one pixel per tile ----------
export const rgb = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
// every tile's own colour (objects too, so a picture keeps them apart)
export const tileColor = (legend, c) => { const e = legend[c]; return e ? rgb(e.color) : [255, 0, 255]; };
export function toPixels(rows, legend) {
  const h = rows.length, w = rows[0].length, data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const [R, G, B] = tileColor(legend, r[x]), k = (y * w + x) * 4; data[k] = R; data[k + 1] = G; data[k + 2] = B; data[k + 3] = 255; } });
  return data;
}
// back from a picture: each pixel becomes the tile whose colour is nearest (so a PNG painted elsewhere comes back exactly,
// and a slightly off colour still lands on the right tile); fully transparent pixels become `clear`
export function fromPixels(data, w, h, legend, clear = '.') {
  const keys = Object.keys(legend), cols = keys.map(k => rgb(legend[k].color)), rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (data[k + 3] < 128) { r += clear; continue; }
      let best = 0, bd = 1e9;
      cols.forEach((c, i) => { const d = (c[0] - data[k]) ** 2 + (c[1] - data[k + 1]) ** 2 + (c[2] - data[k + 2]) ** 2; if (d < bd) { bd = d; best = i; } });
      r += keys[best];
    }
    rows.push(r);
  }
  return rows;
}
