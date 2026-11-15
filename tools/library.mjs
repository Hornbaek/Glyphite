#!/usr/bin/env node
// The owner's sound library from a session: the same sorting the SOUND STUDIO's "Sort the Inbox" does (portal/assets/library-core.mjs, planSort),
// for files the owner hands over. The result is a zip shaped like the library (Drum kits/…, One-shots/Kicks/…), to unzip into the library folder.
//
//   node tools/library.mjs plan <zip | folder | file>...             where each would go, what is converted, renamed or taken out
//   node tools/library.mjs sort <zip | folder | file>... --out x.zip  the same, done: the sorted files in a zip (AIFF made WAV)
//   node tools/library.mjs layout --out x.zip                          the library's empty folders and its README, to start one
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { readZip, planSort, parseAiff, encodeWav, LAYOUT, README } from '../portal/assets/library-core.mjs';

// a zip of [path, bytes] (folders end in '/'), deflated where it helps, with real CRCs (Windows checks them)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function writeZip(entries) {
  const parts = [], central = []; let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [path, data] of entries) {
    const name = Buffer.from(path, 'utf8'), raw = data || new Uint8Array(0), packed = raw.length > 64 ? deflateRawSync(raw) : null, deflate = packed && packed.length < raw.length;
    const body = deflate ? packed : raw, crc = crc32(raw), m = deflate ? 8 : 0, flags = 0x0800;   // (0x0800: the name is UTF-8)
    const local = [...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(m), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0)];
    central.push(Buffer.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(m), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(path.endsWith('/') ? 0x10 : 0), ...u32(off)]), name);
    parts.push(Buffer.from(local), name, Buffer.from(body)); off += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cd.length), ...u32(off), ...u16(0)]);
  return Buffer.concat([...parts, cd, end]);
}
// an input as the planner sees it, with a way to read each of its files
async function itemOf(p) {
  if (statSync(p).isDirectory()) {
    const files = [], walk = d => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else files.push({ path: relative(p, f).split('\\').join('/'), read: () => readFileSync(f) }); } };
    walk(p); return { name: basename(p), type: 'dir', files };
  }
  if (/\.(zip|dslibrary)$/i.test(p)) { const z = await readZip(new Uint8Array(readFileSync(p))); return { name: basename(p), type: 'zip', files: z.map(f => ({ path: f.path, read: () => f.data })) }; }
  return { name: basename(p), type: 'file', files: [{ path: basename(p), read: () => readFileSync(p) }] };
}
// two files bound for one place: the later one is "name 2", "name 3"…
const taken = new Set(), free = to => { let t = to, k = 2; while (taken.has(t.toLowerCase())) t = to.replace(/(\.[a-z0-9]+)?$/i, m => ` ${k++}${m}`); taken.add(t.toLowerCase()); return t; };
function print(plans) {
  for (const p of plans) {
    const keep = p.ops.filter(o => o.op !== 'drop'), drop = p.ops.filter(o => o.op === 'drop');
    console.log(`\n${p.checked ? '[x]' : '[ ]'} ${p.name}  →  ${p.dest || '(left in the Inbox)'}\n    ${p.reason}`);
    for (const o of keep) console.log(`    ${o.op === 'convert' ? 'convert' : 'copy   '} ${o.from}  →  ${o.to}`);
    for (const o of drop) console.log(`    remove  ${o.from}  (${o.why})`);
  }
}
// (run as a command; imported, as the tests do, it only lends writeZip)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
async function main() {
  const [cmd, ...rest] = process.argv.slice(2), at = rest.indexOf('--out'), out = at >= 0 ? rest[at + 1] : null, inputs = rest.filter((a, i) => i !== at && i !== at + 1);
  if (cmd === 'layout') {
    if (!out) throw new Error('layout needs --out <file.zip>');
    writeFileSync(out, writeZip([...LAYOUT.map(d => [`${d}/`, null]), ['README.txt', Buffer.from(README.replace(/\n/g, '\r\n'))]]));
    console.log(`${out}: ${LAYOUT.length} folders and README.txt; unzip it where the library should live`);
  } else if (cmd === 'plan' || cmd === 'sort') {
    if (!inputs.length) throw new Error(`${cmd} needs files, folders or zips`);
    const items = await Promise.all(inputs.map(itemOf)), plans = planSort(items);
    print(plans);
    if (cmd === 'sort') {
      if (!out) throw new Error('sort needs --out <file.zip>');
      const entries = [];
      plans.forEach((p, i) => { if (!p.checked) return; for (const o of p.ops) {
        if (o.op === 'drop') continue;
        const bytes = items[i].files.find(f => f.path === o.from).read();
        let data = new Uint8Array(bytes);
        if (o.op === 'convert') { const a = parseAiff(data); data = encodeWav(a.channels, a.sr, a.bits > 16 ? 24 : 16); }
        entries.push([free(o.to), data]);
      } });
      writeFileSync(out, writeZip(entries));
      console.log(`\n${out}: ${entries.length} files; unzip it into the library folder (next to Inbox, Drum kits, One-shots…)`);
    }
  } else console.log('node tools/library.mjs plan|sort <zip | folder | file>... [--out sorted.zip]\nnode tools/library.mjs layout --out library.zip');
}
