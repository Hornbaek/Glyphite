// The pixel lab (/lab/): Pixel Snapper (WebAssembly in /vendor/pixel-snapper/, the same build tools/snap.mjs runs) cleans up
// AI-made pixel art, the normal-map generator (normalmap-core.mjs, shared with tools/normalmap.mjs) gives it normals, and a
// preview lights it the way the engine does (sprRelief in engine/10_sprite.js). The page hands the settings to a Claude
// session as a prompt with the exact commands, so the result is made again from the repository's own files.
import init, { process_image } from '/vendor/pixel-snapper/spritefusion_pixel_snapper.js';
import { NORMALS, normalsFromRGBA, normalsFromMapRGBA, normalMapRGBA, relief } from './normalmap-core.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { name: '', bytes: null, src: null, snapped: null, snapPNG: null, snapArgs: null, idx: null, light: null, mapName: null };
let snapperReady = null;

// a picture shown enlarged by a whole step, so every pixel stays square
const zoomFor = (w, h) => Math.max(1, Math.min(16, Math.floor(320 / Math.max(w, h))));
function show(el, img, z = zoomFor(img.width, img.height)) {
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').putImageData(img, 0, 0); cv.style.width = img.width * z + 'px'; cv.style.height = img.height * z + 'px';
  el.replaceChildren(cv); return cv;
}
async function decode(bytes, type = 'image/png') {
  const bmp = await createImageBitmap(new Blob([bytes], { type })), cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height; const x = cv.getContext('2d'); x.drawImage(bmp, 0, 0);
  return x.getImageData(0, 0, bmp.width, bmp.height);
}
const pngOf = img => new Promise(res => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').putImageData(img, 0, 0); cv.toBlob(res, 'image/png'); });
function download(a, blob, name) { a.href = URL.createObjectURL(blob); a.download = name; a.hidden = false; }
const stem = n => n.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');

async function load(bytes, name, type) {
  S.bytes = bytes; S.name = name; S.snapped = S.snapPNG = S.snapArgs = S.idx = null;
  S.src = await decode(bytes, type);
  show($('#srcPic'), S.src);
  $('#srcInfo').textContent = `${name} · ${S.src.width} x ${S.src.height} px`;
  $('#snapBtn').disabled = false; $('#snapPic').replaceChildren(); $('#snapInfo').textContent = ''; $('#snapDl').hidden = true;
  if ($('#skipSnap').checked) normals(); else await snap();
}

async function snap() {
  if (!S.bytes) return;
  snapperReady ??= init();
  await snapperReady;
  const colors = +$('#colors').value || 16, ps = +$('#pixelSize').value || null, pal = $('#palette').value.replace(/[#\s]/g, '') || null;
  try {
    const out = process_image(S.bytes, colors, ps, pal);
    S.snapPNG = new Blob([out], { type: 'image/png' }); S.snapped = await decode(out);
    S.snapArgs = { colors, ps, pal };
  } catch (e) { $('#snapInfo').textContent = `Could not snap it: ${e.message || e}`; return; }
  show($('#snapPic'), S.snapped);
  const est = (S.src.width / S.snapped.width).toFixed(2);
  $('#snapInfo').textContent = `${S.snapped.width} x ${S.snapped.height} art pixels (about ${est} image pixels each${ps ? ', as given' : ', guessed'})`;
  download($('#snapDl'), S.snapPNG, `${stem(S.name)}_snapped.png`);
  normals();
}

const opts = () => ({ bevel: +$('#bevel').value, detail: +$('#detail').value, strength: +$('#strength').value, smooth: $('#smooth').checked });
const working = () => $('#skipSnap').checked ? S.src : S.snapped;
async function normals() {
  const img = working(); if (!img) return;
  S.mapName = null; $('#nrmInfo').textContent = '';
  S.idx = normalsFromRGBA(img.data, img.width, img.height, opts()).idx;
  await showNormals(img);
}
// a normal map made elsewhere (Pixel Art Lighter): the same size as the picture, green up
async function loadMap(file) {
  const img = working(); if (!img) { $('#nrmInfo').textContent = 'Open the picture first.'; return; }
  const map = await decode(new Uint8Array(await file.arrayBuffer()));
  if (map.width !== img.width || map.height !== img.height) { $('#nrmInfo').textContent = `That map is ${map.width} x ${map.height}; the picture is ${img.width} x ${img.height}.`; return; }
  const mask = Uint8Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4 + 3] > 0 ? 1 : 0);
  S.idx = normalsFromMapRGBA(map.data, img.width, img.height, { mask }); S.mapName = file.name;
  $('#nrmInfo').textContent = `Normals from ${file.name} (green up), snapped to the engine's 33 directions.`;
  await showNormals(img);
}
async function showNormals(img) {
  const nm = new ImageData(normalMapRGBA(S.idx, img.width, img.height), img.width, img.height);
  show($('#nrmPic'), nm);
  download($('#nrmDl'), await pngOf(nm), `${stem(S.name)}_normals.png`);
  if (!S.light) S.light = [-img.width * .3, -img.height * .3];
  lit();
  $('#copyPrompt').disabled = $('#copyRows').disabled = false;
  $('#prompt').textContent = prompt();
}

// the sprite lit by a lamp at S.light (in its pixels), as the engine lights a sprite pixel at full light: the art's colour,
// brighter where its normal faces the lamp (sprRelief), never dark
function lit() {
  const img = working(); if (!img || !S.idx) return;
  const { width: w, height: h } = img, out = new ImageData(w, h), flat = $('#flat').checked, [Lx, Ly] = S.light;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, q = i * 4; if (S.idx[i] === 255) continue;
    const dx = Lx - x - .5, dy = Ly - y - .5, d = Math.hypot(dx, dy) || 1;
    const f = 1.15 * (.5 + .5 * (flat ? 1 : relief(NORMALS[S.idx[i]], dx / d, dy / d, .35)));
    out.data[q] = img.data[q] * f; out.data[q + 1] = img.data[q + 1] * f; out.data[q + 2] = img.data[q + 2] * f; out.data[q + 3] = 255;
  }
  const z = zoomFor(w, h), cv = show($('#litPic'), out, z);
  cv.onpointermove = e => { const r = cv.getBoundingClientRect(); S.light = [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; lit(); };
}

function rows() {
  const { width: w, height: h } = working();
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => { const v = S.idx[y * w + x]; return v === 255 ? '.' : v.toString(36); }).join(''));
}
function prompt() {
  const o = opts(), img = working(), src = S.game ? `games/${S.game}/ref/${S.file}` : S.name, out = `${stem(S.name)}_snapped.png`;
  const lines = [`Pixel art for a Pixelite game, made in the PIXEL LAB from ${src} (${S.src.width} x ${S.src.height} px).`];
  let input = src;
  if (!$('#skipSnap').checked && S.snapArgs) {
    const a = S.snapArgs;
    lines.push(`1. Snap it to its grid: node tools/snap.mjs ${src} ${out} --colors ${a.colors}${a.ps ? ` --pixel-size ${a.ps}` : ''}${a.pal ? ` --palette ${a.pal}` : ''}`,
      `   (I got ${img.width} x ${img.height} art pixels.)`);
    input = out;
  } else lines.push('1. It is already clean pixel art: no snapping.');
  lines.push(S.mapName ? `2. Normals from Pixel Art Lighter: I attach ${S.mapName}; node tools/normalmap.mjs --from-map ${S.mapName} --rows`
      : `2. Normals: node tools/normalmap.mjs ${input} --rows --bevel ${o.bevel} --detail ${o.detail} --strength ${o.strength}${o.smooth ? '' : ' --no-smooth'}`,
    '   and give the sprite those rows as its `normals` (engine/API.md, Sprites), so lamps model it.',
    '3. Keep the original image as the reference-art rules say, wire the sprite in, and verify it (pixelite-verify).',
    S.game ? `Game: ${S.game}. What the sprite is for: ` : 'Game and what the sprite is for: ');
  return lines.join('\n');
}

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); $('#copied').textContent = `${what} copied.`; }
  catch { $('#copied').textContent = 'Could not copy: select the text below instead.'; }
}

// the games' reference art, to start from a drawing that is already in the repository
async function games() {
  let list = [];
  try { list = (await (await fetch('/games.json', { cache: 'no-store' })).json()).games.filter(g => g.ref); } catch { }
  $('#game').insertAdjacentHTML('beforeend', list.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join(''));
}
async function frames(id) {
  const sel = $('#frame'); sel.innerHTML = '<option value="">drawing…</option>'; sel.disabled = !id; if (!id) return;
  const ref = await (await fetch(`/games/${encodeURIComponent(id)}/ref/ref.json`, { cache: 'no-store' })).json();
  sel.insertAdjacentHTML('beforeend', ref.sheets.flatMap(sh => sh.frames.map(f => `<option value="${esc(f.file)}">${esc(f.name)}${f.used ? '' : ' (not used yet)'}</option>`)).join(''));
}

$('#file').onchange = async e => { const f = e.target.files[0]; if (f) { S.game = null; await load(new Uint8Array(await f.arrayBuffer()), f.name, f.type); } };
$('#game').onchange = e => frames(e.target.value);
$('#frame').onchange = async e => {
  const id = $('#game').value, file = e.target.value; if (!file) return;
  const r = await fetch(`/games/${encodeURIComponent(id)}/ref/${file}`);
  S.game = id; S.file = file;
  await load(new Uint8Array(await r.arrayBuffer()), file, r.headers.get('content-type') || 'image/png');
};
$('#snapBtn').onclick = snap;
$('#skipSnap').onchange = () => { $('#snapBtn').disabled = $('#skipSnap').checked || !S.bytes; if ($('#skipSnap').checked) normals(); else snap(); };
for (const id of ['bevel', 'detail', 'strength']) $('#' + id).oninput = () => { $(`#${id}Out`).textContent = $('#' + id).value; normals(); };
$('#smooth').onchange = normals; $('#flat').onchange = lit;
$('#nrmFile').onchange = e => { const f = e.target.files[0]; if (f) loadMap(f); };
$('#copyPrompt').onclick = () => copy(prompt(), 'Prompt');
$('#copyRows').onclick = () => copy(rows().map(r => `'${r}'`).join(',\n'), 'Normals rows');
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drag'); });
addEventListener('dragleave', () => document.body.classList.remove('drag'));
addEventListener('drop', async e => {
  e.preventDefault(); document.body.classList.remove('drag');
  const f = e.dataTransfer.files[0]; if (f && /image\/(png|jpeg)/.test(f.type)) { S.game = null; await load(new Uint8Array(await f.arrayBuffer()), f.name, f.type); }
});
games();
