// The SOUND STUDIO's library import (portal/assets/library-core.mjs): drum names in file names, round robins, zips, SFZ, Decent Sampler,
// SoundFont 2, closed formats said so, and a whole library made into kits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { classify, roundRobin, plainName, readZip, parseSfz, parseDspreset, parseSf2, padsFromRegions, readLibrary } from '../../portal/assets/library-core.mjs';

const enc = s => new TextEncoder().encode(s);
// a zip of [path, bytes, deflate?] (just enough of the format: local headers, the central directory, its end)
function zip(entries) {
  const parts = [], central = []; let off = 0;
  const u16 = n => [n & 255, n >> 8], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [path, data, deflate] of entries) {
    const name = enc(path), body = deflate ? new Uint8Array(deflateRawSync(data)) : data, m = deflate ? 8 : 0;
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(m), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(m), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]);
    parts.push(Uint8Array.from(local), name, body); off += local.length + name.length + body.length;
  }
  const cd = central.flat(), end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cd.length), ...u32(off), ...u16(0)];
  const all = [...parts, Uint8Array.from(cd), Uint8Array.from(end)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}

test('drum names: the BPB Cassette 808 library and the usual short names find their General MIDI notes', () => {
  const at = n => [classify(n).kind, classify(n).note];
  assert.deepEqual(at('Clean Kit/kick01rr1.wav'), ['kick', 36]);
  assert.deepEqual(at('hhclosed.wav'), ['closed hat', 42]); assert.deepEqual(at('hhopen.wav'), ['open hat', 46]);
  assert.deepEqual(at('tomlo.wav'), ['tom', 41]); assert.deepEqual(at('tommid.wav'), ['tom', 45]); assert.deepEqual(at('tomhi.wav'), ['tom', 48]);
  assert.deepEqual(at('congahi.wav'), ['conga', 62]); assert.deepEqual(at('congalo.wav'), ['conga', 64]);
  assert.deepEqual(at('cymbal.wav'), ['crash', 49]); assert.deepEqual(at('maracas.wav'), ['maracas', 70]); assert.deepEqual(at('clave.wav'), ['claves', 75]);
  assert.deepEqual(at('rimshot.wav'), ['rim', 37]); assert.deepEqual(at('cowbell.wav'), ['cowbell', 56]); assert.deepEqual(at('clap.wav'), ['clap', 39]);
  assert.deepEqual(at('BD_01.wav'), ['kick', 36]); assert.deepEqual(at('SD-02.wav'), ['snare', 38]); assert.deepEqual(at('Hi Hat Open.wav'), ['open hat', 46]);
  assert.deepEqual(at('OH.wav'), ['open hat', 46]); assert.deepEqual(at('CH 3.wav'), ['closed hat', 42]); assert.deepEqual(at('Ride Bell.wav'), ['ride', 51]);
  assert.deepEqual(at('Kicks/01.wav'), ['kick', 36], 'a folder named for the drum says it when the file does not');
  assert.deepEqual(at('whatever.wav'), ['other', 0]);
});

test('round robins: rr1..rrN, "RR 2", take 3 and the like; a plain number is no round robin', () => {
  assert.deepEqual(roundRobin('kick01rr3.wav'), ['kick 01', 3]);
  assert.deepEqual(roundRobin('Snare_RR_2.wav'), ['snare', 2]);
  assert.deepEqual(roundRobin('Hat Take 4.flac'), ['hat', 4]);
  assert.equal(roundRobin('snare01.wav'), null); assert.equal(roundRobin('rr1.wav'), null);
  assert.equal(plainName('A/B/Kick_01-RR3.wav'), 'kick 01 rr 3');
});

test('zips: stored and deflated files, folders, Mac resource forks and hidden files left out', async () => {
  const z = zip([['Kit/kick.wav', enc('KICKDATA'), false], ['Kit/snare.wav', enc('SNARE'.repeat(50)), true], ['__MACOSX/Kit/._kick.wav', enc('x'), false], ['Kit/.DS_Store', enc('x'), false]]);
  const files = await readZip(z);
  assert.deepEqual(files.map(f => f.path), ['Kit/kick.wav', 'Kit/snare.wav']);
  assert.equal(new TextDecoder().decode(files[1].data), 'SNARE'.repeat(50));
  await assert.rejects(() => readZip(enc('not a zip at all')), /not a zip/);
});

test('SFZ: inherited opcodes, note names, paths with spaces, round robins, a velocity layer, choke groups; release triggers are no hits', () => {
  const sfz = `// a kit
<control> default_path=Samples/
#define $KICK 36
<global> volume=-6
<group> key=$KICK seq_length=2
<region> sample=Kick A.wav seq_position=1
<region> sample=Kick B.wav seq_position=2
<group> key=c#2 lovel=0 hivel=80
<region> sample=rim soft.wav
<group> key=c#2 lovel=81 hivel=127
<region> sample=rim hard.wav
<group> key=42 group=1 off_by=2
<region> sample=hat\\closed.wav
<group> key=46 group=2 off_by=1 pan=-50 tune=50
<region> sample=hat open.wav
<region> key=46 sample=release.wav trigger=release`;
  const r = parseSfz(sfz);
  assert.equal(r.length, 6, 'the release region is left out');
  assert.equal(r[0].file, 'Samples/Kick A.wav'); assert.equal(r[0].lo, 36); assert.equal(r[0].seq, 1); assert.ok(Math.abs(r[0].level - .501) < .01, 'volume -6 dB from <global>');
  assert.equal(r[2].lo, 37, 'c#2 is note 37'); assert.equal(r[4].file, 'Samples/hat/closed.wav');
  const pads = padsFromRegions(r);
  const kick = pads.find(p => p.note === 36), rim = pads.find(p => p.note === 37), hat = pads.find(p => p.note === 42), open = pads.find(p => p.note === 46);
  assert.deepEqual(kick.layers.map(l => l.file), ['Samples/Kick A.wav', 'Samples/Kick B.wav'], 'two round robins in their order');
  assert.equal(kick.pick, 'cycle');
  assert.deepEqual(rim.layers.map(l => l.file), ['Samples/rim hard.wav'], 'the velocity layer that holds a hit of 100');
  assert.ok(hat.choke && hat.choke === open.choke, 'off_by joins the hats in one choke group');
  assert.equal(open.pan, -.5); assert.equal(open.tune, .5);
});

test('Decent Sampler: group attributes inherited, random mode, volume in dB or plain', () => {
  const ds = `<DecentSampler><groups volume="-3dB"><group seqMode="random" loNote="38" hiNote="38" rootNote="38">
    <sample path="Samples/snare 1.wav"/><sample path="Samples/snare 2.wav" volume="0.5"/></group>
    <group><sample path="Samples/kick.wav" rootNote="36" loNote="36" hiNote="36"/><sample path="Samples/tail.wav" rootNote="36" trigger="release"/></group></groups></DecentSampler>`;
  const r = parseDspreset(ds);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0].level - .708) < .01 && r[1].level === .5);
  const pads = padsFromRegions(r), snare = pads.find(p => p.note === 38);
  assert.equal(snare.pick, 'random'); assert.equal(snare.layers.length, 2);
  assert.deepEqual(pads.map(p => p.note).sort(), [36, 38]);
});

// a SoundFont 2 of one drum preset (bank 128): an instrument of two zones (a kick on 36 and a hat on 42 in exclusive class 1), its samples inside
function sf2() {
  const chunk = (id, data) => { const b = new Uint8Array(8 + data.length + (data.length & 1)); b.set(enc(id)); new DataView(b.buffer).setUint32(4, data.length, true); b.set(data, 8); return b; };
  const list = (id, parts) => chunk('LIST', cat([enc(id), ...parts]));
  const cat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const rec = (size, fill) => { const b = new Uint8Array(size), v = new DataView(b.buffer); fill(v, b); return b; };
  const name = (b, s) => b.set(enc(s.slice(0, 19)));
  const n = 400, smpl = rec(2 * (2 * n + 92), v => { for (let i = 0; i < n; i++) { v.setInt16(2 * i, Math.round(Math.sin(i * .3) * 16000), true); v.setInt16(2 * (n + 46 + i), Math.round(Math.sin(i * .9) * 8000), true); } });
  const phdr = cat([rec(38, (v, b) => { name(b, 'Kit'); v.setUint16(20, 0, true); v.setUint16(22, 128, true); v.setUint16(24, 0, true); }), rec(38, (v, b) => { name(b, 'EOP'); v.setUint16(24, 1, true); })]);
  const bag = arr => cat(arr.map(([g]) => rec(4, v => v.setUint16(0, g, true))));
  const gen = arr => cat(arr.map(([op, a, b]) => rec(4, (v, u) => { v.setUint16(0, op, true); if (b === undefined) v.setInt16(2, a, true); else { u[2] = a; u[3] = b; } })));
  const pbag = bag([[0], [1]]), pgen = gen([[41, 0], [0, 0]]);
  const inst = cat([rec(22, (v, b) => { name(b, 'Drums'); v.setUint16(20, 0, true); }), rec(22, (v, b) => { name(b, 'EOI'); v.setUint16(20, 2, true); })]);
  const ibag = bag([[0], [3], [7]]), igen = gen([[43, 36, 36], [58, 36], [53, 0], [43, 42, 42], [57, 1], [58, 42], [53, 1], [0, 0]]);
  const sh = (nm, s, e, root) => rec(46, (v, b) => { name(b, nm); v.setUint32(20, s, true); v.setUint32(24, e, true); v.setUint32(36, 22050, true); b[40] = root; v.setUint16(44, 1, true); });
  const shdr = cat([sh('Kick', 0, n, 36), sh('Hat', n + 46, 2 * n + 46, 42), sh('EOS', 0, 0, 0)]);
  return cat([enc('RIFF'), new Uint8Array(4), enc('sfbk'), list('INFO', [chunk('ifil', new Uint8Array(4))]), list('sdta', [chunk('smpl', smpl)]),
    list('pdta', [chunk('phdr', phdr), chunk('pbag', pbag), chunk('pmod', new Uint8Array(10)), chunk('pgen', pgen), chunk('inst', inst), chunk('ibag', ibag), chunk('imod', new Uint8Array(10)), chunk('igen', igen), chunk('shdr', shdr)])]);
}

test('SoundFont 2: a drum preset becomes a kit whose sounds are the samples the file holds, with their notes and exclusive class', () => {
  const kits = parseSf2(sf2());
  assert.equal(kits.length, 1); assert.equal(kits[0].name, 'Kit'); assert.ok(kits[0].drums, 'bank 128 is drums');
  const pads = padsFromRegions(kits[0].regions);
  assert.deepEqual(pads.map(p => p.note), [36, 42]);
  assert.equal(pads[0].layers[0].pcm.data.length, 400); assert.equal(pads[0].layers[0].pcm.sr, 22050);
  assert.ok(Math.abs(pads[0].layers[0].pcm.data[5] - Math.sin(1.5) * 16000 / 32768) < 1e-4, 'the sample\'s own PCM, as numbers -1..1');
  assert.equal(pads[0].tune, 0); assert.ok(pads[1].choke > 0, 'exclusive class: a choke group');
  assert.throws(() => parseSf2(enc('RIFF....WAVE')), /not a SoundFont/);
});

test('a library: a zip of folders becomes a kit per folder, round robins are one pad\'s variations, and closed formats are said so', async () => {
  const wav = enc('RIFF----WAVEfmt ');
  const z = zip([['808/Clean/kick01rr1.wav', wav], ['808/Clean/kick01rr2.wav', wav], ['808/Clean/kick02.wav', wav], ['808/Clean/hhclosed.wav', wav],
    ['808/Clean/hhopen.wav', wav], ['808/Clean/Clean.nki', enc('hsin')], ['808/Hot/kick01.wav', wav], ['808/Hot/snare01.wav', wav, true], ['808/Hot/notes.aif', wav]]);
  const lib = await readLibrary([{ path: '808.zip', data: z }]);
  assert.equal(lib.sounds.length, 7, 'every sound, the ones no pad uses too (kick02 is there to choose)');
  assert.deepEqual(lib.kits.map(k => k.name), ['Clean', 'Hot']);
  const clean = lib.kits[0], name = id => lib.sounds.find(s => s.id === id).name;
  assert.deepEqual(clean.pads.map(p => [p.note, p.sounds.map(name)]), [[36, ['kick01rr1', 'kick01rr2']], [42, ['hhclosed']], [46, ['hhopen']]]);
  assert.ok(clean.pads[1].choke === 1 && clean.pads[2].choke === 1, 'the hats choke each other');
  assert.ok(lib.notes.some(n => /Kontakt instrument \(\.nki\)/.test(n)) && lib.notes.some(n => /AIFF/.test(n)), lib.notes);
});

test('a library with an SFZ: its kit comes from the mapping, and the sounds it does not name still make a kit of their own', async () => {
  const wav = enc('RIFF----WAVEfmt ');
  const lib = await readLibrary([{ path: 'Kit/kit.sfz', data: enc('<region> key=36 sample=one/boom.wav\n<region> key=38 sample=one/crack.wav\n<region> key=40 sample=gone.wav') },
    { path: 'Kit/one/boom.wav', data: wav }, { path: 'Kit/one/crack.wav', data: wav }, { path: 'Kit/extra/snare 9.wav', data: wav }]);
  const sfz = lib.kits.find(k => k.from === 'sfz');
  assert.deepEqual(sfz.pads.map(p => p.note), [36, 38], 'boom on 36 and crack on 38, though their names say nothing');
  assert.ok(lib.notes.some(n => /1 sound it names is not among the files/.test(n)), lib.notes);
  assert.ok(lib.kits.some(k => k.from === 'names' && k.pads[0].note === 38), 'the snare no mapping covers is in a kit made from its name');
});
