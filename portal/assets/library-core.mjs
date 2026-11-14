// Sound libraries for the SOUND STUDIO's import: what a zip, a folder or a handful of files holds, read into drum kits the studio can make.
// Read: zips (stored or deflated), plain audio files mapped by their names (kick, snare, hhclosed, tomlo…, with round robins like kick01rr1..rr6
// grouped as one pad's variations), and the open sampler formats that say exactly which sound plays on which note: SFZ (.sfz), Decent Sampler
// (.dspreset, .dslibrary) and SoundFont 2 (.sf2, which holds its sounds itself). Closed formats (Kontakt .nki, Logic .exs) are recognised and
// said so: their folder's sounds are mapped by name instead. No DOM here (it runs in Node for the tests); the studio decodes the audio.

// ---------- names: which drum a file is ----------
// [pattern on the plain name, kind, General MIDI note]; first match wins, so the specific comes before the general (open hat before hat)
const KINDS = [
  [/open ?h(i ?hat|at|h)|hh ?open|\bohh?\b|hh ?o\b|\bopen\b/, 'open hat', 46],
  [/pedal/, 'pedal hat', 44],
  [/closed|hh ?closed|\bchh?\b|hh ?c\b|hi ?hat|hihat|\bhh\b|\bhat\b|hats?\b/, 'closed hat', 42],
  [/kick|bass ?drum|\bbd\b|\bkik\b|\bkck\b/, 'kick', 36],
  [/side ?stick|rim/, 'rim', 37],
  [/snare|\bsnr?\b|\bsd\b/, 'snare', 38],
  [/clap|\bcp\b|\bclp\b/, 'clap', 39],
  [/floor ?tom/, 'low tom', 41],
  [/tom/, 'tom', 45],
  [/china/, 'china', 52], [/splash/, 'splash', 55],
  [/crash|cymbal|\bcym\b|\bcy\b/, 'crash', 49],
  [/ride/, 'ride', 51],
  [/tamb/, 'tambourine', 54],
  [/cow ?bell|\bcb\b/, 'cowbell', 56],
  [/bongo/, 'bongo', 60], [/conga|tumba/, 'conga', 63], [/timbale/, 'timbale', 65], [/agogo/, 'agogo', 67],
  [/cabasa/, 'cabasa', 69], [/maraca/, 'maracas', 70], [/whistle/, 'whistle', 71], [/guiro/, 'guiro', 73],
  [/clave/, 'claves', 75], [/wood ?block|\bblock\b/, 'wood block', 76], [/triangle/, 'triangle', 81], [/shak|\bshk\b/, 'shaker', 82],
  [/\bperc|\bfx\b|noise|zap|laser/, 'percussion', 0]
];
// a kind's other General MIDI notes: where a second tom, conga or bongo goes, by its pitch word
const PITCHED = { tom: { low: 41, mid: 45, high: 48 }, conga: { low: 64, mid: 63, high: 62 }, bongo: { low: 61, high: 60 }, timbale: { low: 66, high: 65 }, agogo: { low: 68, high: 67 }, 'wood block': { low: 77, high: 76 } };
// General MIDI drum names, for pads that come from a mapping file (35..81)
export const GM_DRUMS = { 35: 'Kick 2', 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 40: 'Snare 2', 41: 'Low floor tom', 42: 'Closed hat', 43: 'High floor tom', 44: 'Pedal hat', 45: 'Low tom', 46: 'Open hat', 47: 'Low-mid tom', 48: 'High-mid tom', 49: 'Crash', 50: 'High tom', 51: 'Ride', 52: 'China', 53: 'Ride bell', 54: 'Tambourine', 55: 'Splash', 56: 'Cowbell', 57: 'Crash 2', 58: 'Vibraslap', 59: 'Ride 2', 60: 'High bongo', 61: 'Low bongo', 62: 'Mute high conga', 63: 'High conga', 64: 'Low conga', 65: 'High timbale', 66: 'Low timbale', 67: 'High agogo', 68: 'Low agogo', 69: 'Cabasa', 70: 'Maracas', 71: 'Short whistle', 72: 'Long whistle', 73: 'Short guiro', 74: 'Long guiro', 75: 'Claves', 76: 'High wood block', 77: 'Low wood block', 78: 'Mute cuica', 79: 'Open cuica', 80: 'Mute triangle', 81: 'Open triangle', 82: 'Shaker' };
// the kinds in the order a kit lists them, and the hats' choke group (a closed hat ends an open one)
export const KIND_ORDER = ['kick', 'snare', 'rim', 'clap', 'closed hat', 'pedal hat', 'open hat', 'low tom', 'tom', 'crash', 'china', 'splash', 'ride', 'tambourine', 'cowbell', 'conga', 'bongo', 'timbale', 'agogo', 'cabasa', 'maracas', 'shaker', 'guiro', 'claves', 'wood block', 'whistle', 'triangle', 'percussion', 'other'];
const CHOKE = { 'closed hat': 1, 'pedal hat': 1, 'open hat': 1 };

// 'Kick_01-RR3.wav' -> 'kick 01 rr3': lower case, the extension gone, separators and letter/number joins as spaces
export function plainName(path) {
  const base = String(path).split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '');
  return base.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[_\-.()[\]+]+/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}
// a round robin's base and number: 'kick01rr3' -> ['kick 01', 3]; also 'rr 3', 'round robin 3', 'take 3', 'alt 3', 'var 3'; null when it is none
export function roundRobin(path) {
  const m = /^(.*?)\s*(?:rr|round robin|roundrobin|take|alt|var|variation)\s*(\d+)$/.exec(plainName(path));
  return m && m[1] ? [m[1], +m[2]] : null;
}
// which drum a file is, from its name (its folder's name helps when the file's own does not say: 'Kicks/01.wav')
export function classify(path) {
  const parts = String(path).split('/'), name = plainName(parts.pop()), dir = parts.slice(-2).map(plainName).join(' ');
  for (const text of [name, dir]) {
    for (const [re, kind, note] of KINDS) {
      if (!re.test(text)) continue;
      const pitch = /\b(lo|low|floor|bottom|deep)\b|lo$|low$/.test(text) || /(lo|low)\b/.test(name) ? 'low' : /\b(mid|middle|med)\b|mid$/.test(text) ? 'mid' : /\b(hi|high|top)\b|hi$|high$/.test(text) ? 'high' : null;
      const alt = PITCHED[kind];
      return { kind, note: alt && pitch ? alt[pitch] ?? note : note, pitch };
    }
  }
  return { kind: 'other', note: 0, pitch: null };
}
// 'kick 2' before 'kick 10'
export const naturally = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

// ---------- zips ----------
// a zip's files: [{ path, data }] (folders, Mac resource forks and hidden files left out); stored and deflated entries
export async function readZip(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  const out = [], dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const path = dec.decode(u.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    if (path.endsWith('/') || /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(path)) continue;
    const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), raw = u.subarray(start, start + size);
    if (method === 0) out.push({ path, data: raw.slice() });
    else if (method === 8) out.push({ path, data: new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) });
  }
  return out;
}

// ---------- the open sampler formats: regions (a sound on a note, with its velocity layer and its turn) ----------
// a region: { file | pcm, lo, hi, root, lovel, hivel, seq, rand, tune (semitones), level (gain), pan (-1..1), choke (a group number, 0: none) }
const noteNum = v => {
  if (v == null || v === '') return null;
  const n = +v; if (Number.isFinite(n)) return Math.round(n);
  const m = /^([a-g])(#|b)?(-?\d+)$/i.exec(String(v).trim()); if (!m) return null;
  return 12 * (+m[3] + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const dbGain = db => Math.pow(10, (+db || 0) / 20);
// SFZ: headers (<control>, <global>, <master>, <group>, <region>) with opcodes that the later ones inherit; a value runs to the next opcode (paths have spaces)
export function parseSfz(text) {
  const defs = {};
  text = String(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  text = text.replace(/^\s*#define\s+(\$\w+)\s+(.*)$/gm, (_, k, v) => { defs[k] = v.trim(); return ''; }).replace(/\$\w+/g, k => defs[k] ?? k);
  const regions = [], scope = { control: {}, global: {}, master: {}, group: {} };
  for (const part of text.split(/(?=<\w+>)/)) {
    const h = /^<(\w+)>/.exec(part); if (!h) continue;
    const body = part.slice(h[0].length), op = {}, keys = [...body.matchAll(/([A-Za-z0-9_]+)=/g)];
    keys.forEach((m, i) => { op[m[1]] = body.slice(m.index + m[0].length, i + 1 < keys.length ? keys[i + 1].index : body.length).trim(); });
    const kind = h[1].toLowerCase();
    if (kind === 'control') scope.control = op;
    else if (kind === 'global') { scope.global = op; scope.master = {}; scope.group = {}; }
    else if (kind === 'master') { scope.master = op; scope.group = {}; }
    else if (kind === 'group') scope.group = op;
    else if (kind === 'region') {
      const o = { ...scope.global, ...scope.master, ...scope.group, ...op };
      if (!o.sample || (o.trigger && o.trigger !== 'attack' && o.trigger !== 'first')) continue;   // (release triggers and the like: not a hit)
      const key = noteNum(o.key), lo = noteNum(o.lokey) ?? key ?? 0, hi = noteNum(o.hikey) ?? key ?? 127;
      regions.push({ file: ((scope.control.default_path || '') + o.sample).replace(/\\/g, '/'), lo, hi, root: noteNum(o.pitch_keycenter) ?? key ?? lo,
        lovel: +o.lovel || 0, hivel: o.hivel == null ? 127 : +o.hivel, seq: +o.seq_position || 0, rand: o.lorand != null || o.hirand != null ? +o.lorand || 0 : null,
        tune: (+o.transpose || 0) + (+o.tune || 0) / 100, level: dbGain(o.volume), pan: (+o.pan || 0) / 100,
        choke: o.group != null ? +o.group || 0 : 0, offBy: o.off_by != null ? +o.off_by || 0 : 0 });
    }
  }
  return regions;
}
// Decent Sampler: <groups> and <group> attributes that their <sample>s inherit
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')]));
const dsVolume = v => { if (v == null) return 1; const s = String(v).trim(); return /db$/i.test(s) ? dbGain(parseFloat(s)) : Math.max(0, +s || 0); };
export function parseDspreset(text) {
  const regions = []; let groups = {}, group = null, gi = 0;
  for (const m of String(text).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)(groups|group|sample)\b([^>]*?)(\/?)>/gi)) {
    const [, close, tag, rest] = m, t = tag.toLowerCase();
    if (t === 'groups') { groups = close ? {} : attrs(rest); continue; }
    if (t === 'group') { if (close) group = null; else { group = { ...attrs(rest), _i: ++gi }; } continue; }
    if (close) continue;
    const o = { ...groups, ...(group || {}), ...attrs(rest) };
    if (!o.path || (o.trigger && o.trigger !== 'attack')) continue;
    const root = noteNum(o.rootNote), lo = noteNum(o.loNote) ?? root ?? 0, hi = noteNum(o.hiNote) ?? root ?? 127;
    const mode = String(o.seqMode || '').toLowerCase();
    regions.push({ file: o.path.replace(/\\/g, '/'), lo, hi, root: root ?? lo, lovel: +o.loVel || 0, hivel: o.hiVel == null ? 127 : +o.hiVel,
      seq: +o.seqPosition || 0, rand: mode.includes('random') ? 0 : null, tune: (+o.tuning || 0), level: dsVolume(o.volume), pan: (+o.pan || 0) / 100, choke: 0, offBy: 0 });
  }
  return regions;
}
// SoundFont 2: presets (bank 128 = drum kits) made of instruments made of zones, each a sample of the file's own on a range of notes
export function parseSf2(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const id = at => String.fromCharCode(u[at], u[at + 1], u[at + 2], u[at + 3]);
  if (id(0) !== 'RIFF' || id(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');
  const ch = {};
  const walk = (a, b) => { for (let p = a; p + 8 <= b;) { const t = id(p), n = v.getUint32(p + 4, true); if (t === 'LIST') walk(p + 12, p + 8 + n); else ch[t] = [p + 8, n]; p += 8 + n + (n & 1); } };
  walk(12, u.length);
  if (!ch.smpl || !ch.phdr || !ch.shdr) throw new Error('a SoundFont without its samples or presets');
  const name = (p) => { let s = ''; for (let i = 0; i < 20 && u[p + i]; i++) s += String.fromCharCode(u[p + i]); return s.trim(); };
  const recs = (t, size, f) => { const [p, n] = ch[t] || [0, 0], out = []; for (let i = 0; i + size <= n; i += size) out.push(f(p + i)); return out; };
  const phdr = recs('phdr', 38, p => ({ name: name(p), preset: v.getUint16(p + 20, true), bank: v.getUint16(p + 22, true), bag: v.getUint16(p + 24, true) }));
  const bag = t => recs(t, 4, p => v.getUint16(p, true)), gen = t => recs(t, 4, p => ({ op: v.getUint16(p, true), lo: u[p + 2], hi: u[p + 3], amt: v.getInt16(p + 2, true), uamt: v.getUint16(p + 2, true) }));
  const pbag = bag('pbag'), pgen = gen('pgen'), ibag = bag('ibag'), igen = gen('igen');
  const inst = recs('inst', 22, p => ({ name: name(p), bag: v.getUint16(p + 20, true) }));
  const shdr = recs('shdr', 46, p => ({ name: name(p), start: v.getUint32(p + 20, true), end: v.getUint32(p + 24, true), rate: v.getUint32(p + 36, true), pitch: u[p + 40], corr: v.getInt8(p + 41) }));
  const smpl = new Int16Array(u.buffer.slice(u.byteOffset + ch.smpl[0], u.byteOffset + ch.smpl[0] + (ch.smpl[1] & ~1)));
  // the zones of a list of bags: each a map of its generators; a first zone without its target (instrument or sample) is the global one
  const zones = (bags, gens, from, to, target) => {
    const zs = []; let glob = null;
    for (let b = from; b < to; b++) {
      const g = {}; for (let k = bags[b]; k < (bags[b + 1] ?? gens.length); k++) g[gens[k].op] = gens[k];
      if (!(target in g)) { if (b === from) glob = g; continue; }
      zs.push({ ...(glob || {}), ...g });
    }
    return zs;
  };
  const pcmCache = new Map();
  const kits = [];
  phdr.slice(0, -1).forEach((ph, k) => {
    const regions = [];
    for (const pz of zones(pbag, pgen, ph.bag, phdr[k + 1].bag, 41)) {
      const ins = inst[pz[41].uamt], next = inst[pz[41].uamt + 1]; if (!ins || !next) continue;
      const pkr = pz[43] ? [pz[43].lo, pz[43].hi] : [0, 127];
      for (const z of zones(ibag, igen, ins.bag, next.bag, 53)) {
        const sh = shdr[z[53].uamt]; if (!sh || sh.end <= sh.start) continue;
        const start = sh.start + (z[0]?.amt || 0) + 32768 * (z[4]?.amt || 0), end = sh.end + (z[1]?.amt || 0) + 32768 * (z[12]?.amt || 0);
        const key = `${start}:${end}`;
        if (!pcmCache.has(key)) { const d = new Float32Array(Math.max(0, end - start)); for (let i = 0; i < d.length; i++) d[i] = (smpl[start + i] || 0) / 32768; pcmCache.set(key, { data: d, sr: sh.rate || 44100, name: sh.name }); }
        const lo = Math.max(z[43] ? z[43].lo : 0, pkr[0]), hi = Math.min(z[43] ? z[43].hi : 127, pkr[1]); if (hi < lo) continue;
        const root = z[58] && z[58].amt >= 0 ? z[58].amt : sh.pitch <= 127 ? sh.pitch : 60;
        regions.push({ pcm: pcmCache.get(key), lo, hi, root, lovel: z[44] ? z[44].lo : 0, hivel: z[44] ? z[44].hi : 127, seq: 0, rand: null,
          tune: (z[51]?.amt || 0) + (pz[51]?.amt || 0) + ((z[52]?.amt || 0) + (pz[52]?.amt || 0) + sh.corr) / 100,
          level: dbGain(-((z[48]?.amt || 0) + (pz[48]?.amt || 0)) / 10 * .4), pan: Math.max(-1, Math.min(1, (z[17]?.amt || 0) / 500)), choke: z[57]?.amt || 0, offBy: z[57]?.amt || 0 });
      }
    }
    if (regions.length) kits.push({ name: ph.name || `Preset ${ph.preset}`, drums: ph.bank === 128, regions });
  });
  return kits.sort((a, b) => b.drums - a.drums);
}

// ---------- regions into pads ----------
// One pad per note (the General MIDI drum notes first, 32 at most). On a note: the velocity layer that holds a medium-hard hit (100; a game's
// drums are mostly that), and in it the sounds a hit goes round (round robin by position, or random). Choke groups from the format's own.
export function padsFromRegions(regions, nameOf = r => GM_DRUMS[r.root] || '') {
  const byNote = new Map();
  for (const r of regions) {
    // a drum region is one note; a region over a range of notes plays on each, so it sits on its root (or its lowest note) once
    const n = r.lo === r.hi ? r.lo : r.root >= r.lo && r.root <= r.hi ? r.root : r.lo;
    if (!byNote.has(n)) byNote.set(n, []); byNote.get(n).push(r);
  }
  // choke groups: the format's groups that cut one another (SFZ group and off_by, a SoundFont's exclusive class) are joined into one, numbered 1..8
  const up = new Map(), root = g => { while (up.get(g) !== g) g = up.get(g); return g; };
  const join = (a, b) => { for (const g of [a, b]) if (!up.has(g)) up.set(g, g); up.set(root(a), root(b)); };
  for (const r of regions) if (r.offBy) join(r.choke || r.offBy, r.offBy);
  const chokes = new Map(), chokeOf = r => {
    const g = up.has(r.choke) ? root(r.choke) : r.offBy ? root(r.offBy) : 0; if (!g) return 0;
    if (!chokes.has(g)) { if (chokes.size >= 8) return 0; chokes.set(g, chokes.size + 1); }
    return chokes.get(g);
  };
  const notes = [...byNote.keys()].sort((a, b) => (b >= 35 && b <= 82) - (a >= 35 && a <= 82) || a - b).slice(0, 32);
  return notes.map(note => {
    const rs = byNote.get(note), layer = rs.filter(r => r.lovel <= 100 && r.hivel >= 100);
    const pick = (layer.length ? layer : rs.filter(r => r.hivel === Math.max(...rs.map(x => x.hivel)))).sort((a, b) => a.seq - b.seq || (a.rand ?? 0) - (b.rand ?? 0)).slice(0, 9);
    const first = pick[0];
    return { note, name: nameOf({ ...first, root: note }) || (first.file ? plainName(first.file) : first.pcm ? first.pcm.name : `Note ${note}`), layers: pick,
      pick: pick.some(r => r.rand != null) ? 'random' : 'cycle', tune: Math.max(-24, Math.min(24, Math.round((note - first.root + first.tune) * 10) / 10)),
      level: Math.max(0, Math.min(2, Math.round(first.level * 100) / 100)), pan: Math.round(first.pan * 100) / 100, choke: chokeOf(first) };
  });
}

// ---------- a whole library ----------
const AUDIO = /\.(wav|wave|mp3|ogg|oga|flac|m4a|aac|opus|webm)$/i, AIFF = /\.(aif|aiff|aifc)$/i;
const CLOSED = [[/\.nki$/i, 'Kontakt instrument', 'Kontakt instruments', '.nki'], [/\.nkm$/i, 'Kontakt multi', 'Kontakt multis', '.nkm'], [/\.exs$/i, 'Logic sampler instrument', 'Logic sampler instruments', '.exs'], [/\.(adg|adv)$/i, 'Ableton rack', 'Ableton racks', '.adg']];
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
// a path relative to a folder ('../Samples/kick.wav' from 'Lib/Presets'), found among the files whatever its case
function resolver(paths) {
  const lower = new Map(paths.map(p => [p.toLowerCase(), p]));
  return (from, rel) => {
    const parts = from ? from.split('/') : [];
    for (const s of rel.replace(/\\/g, '/').split('/')) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); }
    const want = parts.join('/').toLowerCase(), tail = '/' + rel.replace(/\\/g, '/').replace(/^(\.\.?\/)+/, '').toLowerCase();
    if (lower.has(want)) return lower.get(want);
    const near = [...lower.keys()].find(k => k.endsWith(tail));   // (a mapping file moved away from its sounds: the same path under another folder)
    return near ? lower.get(near) : null;
  };
}
// files: [{ path, data }] (zips already opened) -> { sounds, kits, notes }. A sound: { id, path, name, kind, note, rr: [base, n] | null, data | pcm }.
// A kit: { name, from ('names' | 'sfz' | 'dspreset' | 'sf2'), pads: [{ note, name, kind?, sounds: [ids], pick, tune, level, pan, choke }] }.
export async function readLibrary(files) {
  const all = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.path)) { try { for (const z of await readZip(f.data)) all.push({ path: `${f.path.replace(/\.zip$/i, '')}/${z.path}`, data: z.data }); } catch (e) { all.push({ path: f.path, data: null, bad: e.message }); } }
    else all.push(f);
  }
  // a single top folder that wraps everything (a zip of one folder) is no part of a name
  const notes = [], sounds = [], kits = [], paths = all.map(f => f.path);
  const byPath = new Map(), byPcm = new Map(), find = resolver(paths);
  const soundFor = (path, data) => {
    if (byPath.has(path)) return byPath.get(path);
    const c = classify(path), s = { id: `s${sounds.length + 1}`, path, name: path.split('/').pop().replace(/\.[a-z0-9]+$/i, ''), kind: c.kind, note: c.note, rr: roundRobin(path), data };
    sounds.push(s); byPath.set(path, s); return s;
  };
  // a sound a SoundFont holds itself: one per sample of the file, named after it (its drum from its name, else from the note it sits on)
  const pcmSound = (kit, r, note) => {
    if (byPcm.has(r.pcm)) return byPcm.get(r.pcm);
    const s = soundFor(`${kit}/${r.pcm.name || 'note ' + note} #${byPcm.size + 1}`, null);
    s.name = r.pcm.name || GM_DRUMS[note] || `Note ${note}`; s.pcm = r.pcm;
    if (!s.note && GM_DRUMS[note]) { const c = classify(GM_DRUMS[note]); s.kind = c.kind; s.note = note; }
    byPcm.set(r.pcm, s); return s;
  };
  for (const f of all) if (AUDIO.test(f.path) && f.data) soundFor(f.path, f.data);
  const aiff = all.filter(f => AIFF.test(f.path)).length;
  if (aiff) notes.push(`${aiff} AIFF file${aiff > 1 ? 's' : ''} left out: the browser cannot read AIFF (WAV, FLAC, OGG and MP3 it can).`);
  for (const f of all) if (f.bad) notes.push(`${f.path.split('/').pop()}: ${f.bad}.`);
  const text = d => new TextDecoder().decode(d);
  const mapped = (from, path, regions) => {
    const rs = regions.map(r => { if (r.pcm) return r; const p = find(dirOf(path), r.file); return p && byPath.get(p) ? { ...r, sound: byPath.get(p) } : null; }).filter(Boolean);
    const missing = regions.length - rs.length;
    if (missing) notes.push(`${path.split('/').pop()}: ${missing} sound${missing > 1 ? 's' : ''} it names ${missing > 1 ? 'are' : 'is'} not among the files.`);
    return rs;
  };
  for (const f of all) {
    if (!f.data) continue;
    try {
      if (/\.sfz$/i.test(f.path)) { const rs = mapped('sfz', f.path, parseSfz(text(f.data))); if (rs.length) kits.push(kitOf(plainTitle(f.path), 'sfz', rs, pcmSound)); }
      else if (/\.dspreset$/i.test(f.path)) { const rs = mapped('dspreset', f.path, parseDspreset(text(f.data))); if (rs.length) kits.push(kitOf(plainTitle(f.path), 'dspreset', rs, pcmSound)); }
      else if (/\.sf2$/i.test(f.path)) { for (const k of parseSf2(f.data)) kits.push(kitOf(k.name, 'sf2', k.regions, pcmSound, k.drums)); }
    } catch (e) { notes.push(`${f.path.split('/').pop()} could not be read: ${e.message}.`); }
  }
  // closed formats: said once each, and their folders mapped by the sounds' names
  for (const [re, one, many, ext] of CLOSED) {
    const n = all.filter(f => re.test(f.path)).length;
    if (n) notes.push(`${n === 1 ? `A ${one}` : `${n} ${many}`} (${ext}) found. ${many[0].toUpperCase() + many.slice(1)} keep their mapping in a format only their own program reads, so the sounds beside ${n > 1 ? 'them' : 'it'} were mapped by their names (round robins like rr1, rr2… became a pad's variations).`);
  }
  // every folder of sounds that no mapping file covers becomes a kit made from the names
  const covered = new Set(kits.flatMap(k => k.pads.flatMap(p => p.sounds)));
  const dirs = [...new Set(sounds.filter(s => s.data && !covered.has(s.id)).map(s => dirOf(s.path)))].sort(naturally);
  for (const d of dirs) {
    const here = sounds.filter(s => s.data && !covered.has(s.id) && dirOf(s.path) === d);
    if (here.length) kits.push(namesKit(d ? plainTitle(d) : 'Sounds', here));
  }
  return { sounds, kits, notes };
}
// a pad's name from its sound: 'High tom', 'Low conga', 'Open hat', else General MIDI's
const padName = s => { const c = classify(s.path), t = c.pitch && PITCHED[c.kind] ? `${c.pitch} ${c.kind}` : c.kind !== 'other' && c.kind !== 'percussion' ? c.kind : GM_DRUMS[s.note] || s.name; return t[0].toUpperCase() + t.slice(1); };
const plainTitle = p => { const parts = String(p).split('/').filter(Boolean), last = parts.pop().replace(/\.[a-z0-9]+$/i, ''); const t = /^(samples?|sounds?|wav|audio|kit)$/i.test(last) && parts.length ? parts.pop() : last; return t.replace(/[_]+/g, ' ').slice(0, 40); };
// a kit from a mapping file's regions: each pad's sounds are the files it names (or, in a SoundFont, the samples it holds)
function kitOf(name, from, regions, pcmSound, drums = true) {
  const pads = padsFromRegions(regions).map(p => ({ note: p.note, name: p.name, kind: classify(p.name).kind, sounds: [...new Set(p.layers.map(r => (r.sound || pcmSound(name, r, p.note)).id))],
    pick: p.pick, tune: p.tune, level: p.level, pan: p.pan, choke: p.choke }));
  return { name, from, drums, pads };
}
// a kit from the sounds' names: one pad per kind on its General MIDI note, the first sound of the kind (by name) on it; a round robin's takes are
// that pad's variations; a second tom, conga or bongo goes to its pitch's note. The other sounds stay in the library to choose from.
export function namesKit(name, here) {
  const pads = new Map(), sorted = here.slice().sort((a, b) => naturally(a.name, b.name));
  for (const s of sorted) {
    if (!s.note) continue;
    const pad = pads.get(s.note);
    if (!pad) { pads.set(s.note, { note: s.note, name: padName(s), kind: s.kind, sounds: [s.id], rr: s.rr ? s.rr[0] : null, pick: 'cycle', tune: 0, level: 1, pan: 0, choke: CHOKE[s.kind] || 0 }); continue; }
    if (pad.rr && s.rr && s.rr[0] === pad.rr && pad.sounds.length < 9) pad.sounds.push(s.id);   // another take of the same round robin
  }
  const list = [...pads.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.note - b.note).slice(0, 32);
  return { name, from: 'names', drums: true, pads: list.map(({ rr, ...p }) => p) };
}
