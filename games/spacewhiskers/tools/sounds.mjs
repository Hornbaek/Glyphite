#!/usr/bin/env node
// Space Whiskers: sounds and music for the Bubbling Moon, generated through Replicate (the key is a network secret of the cloud environment).
//
//   NODE_USE_ENV_PROXY=1 node games/spacewhiskers/tools/sounds.mjs [ids or groups ...] [--dry] [--force]
//   python3 games/spacewhiskers/tools/sounds_prep.py          (then: trim, convert, loop, measure, manifest)
//
// Groups: sfx, ambience, music, stinger. Models: Stable Audio 2.5 (stability-ai/stable-audio-2.5: music and sound from a prompt, any length to 190 s) for the
// effects, the ambiences, the stingers and the free-form music; MusicGen Looper (andreasjansson/musicgen-looper: loops of whole bars at an exact tempo) for the
// three level themes, so that the music keeps the pump's beat: at 80 BPM a bar is 3.0 seconds, and the moon's hiccup is one every 3 seconds (BUBBLING_MOON.md).
// The raw files are kept as they came (audio/raw/<id>.<ext>, with audio/raw/<id>.json: the prompt, the model, what the API said); a take that is already there
// is not overwritten (a new one is <id>_2). Nobody can listen here: sounds_prep.py measures them, the owner listens.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, download } from '../../../tools/art/gen/replicate.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..'), RAW = join(GAME, 'audio', 'raw');

const NOMUSIC = 'an isolated sound effect, clean and dry, no music, no voice, no background noise';
const sfx = (id, seconds, prompt, use, o = {}) => ({ id, group: 'sfx', model: 'stable', seconds, prompt: `${prompt}, ${NOMUSIC}`, use, ...o });
const amb = (id, seconds, prompt, use) => ({ id, group: 'ambience', model: 'stable', seconds, loop: true, prompt: `${prompt}, a seamless ambient loop, no music, no melody, no voice`, use });

export const SOUNDS = [
  // ---- the bubbles
  sfx('bubble-swell', 2, 'a soft round milk bubble slowly swelling and inflating, a gentle rising wobbly liquid bloop, cute cartoon', 'a bubble growing on the beat (P2)'),
  sfx('bubble-pop-a', 1.2, 'a single soft milk bubble popping with a tiny wet splash, cute cartoon pop', 'a bubble popping'),
  sfx('bubble-pop-b', 1.2, 'a single bigger bubble bursting with a wet plop and a few droplets, cartoon', 'a bubble popping (variation)'),
  sfx('bubble-pop-c', 1.2, 'a quick small bubble pop, a squeaky wet tick, cartoon', 'a bubble popping (variation)'),
  sfx('bubble-bounce-a', 1.2, 'a squishy rubbery boing as a small character lands on a big soft bubble and bounces up, cartoon', 'landing on a bubble and bouncing'),
  sfx('bubble-bounce-b', 1.2, 'a bigger springy bouncy boing with a wet squelch, a very high bounce, cartoon', 'a bounce from a large bubble (held jump)'),
  // ---- milk
  sfx('milk-drip-a', 1.2, 'a single drop of milk falling into a shallow pool, a soft liquid plink', 'a drip from a hole (P3)'),
  sfx('milk-drip-b', 1.2, 'a single heavy drip landing in a puddle with a small splash, echoing slightly in a cave', 'a drip from a hole (variation)'),
  sfx('milk-splash', 1.2, 'a medium splash of thick liquid as something drops into a pool', 'falling into the milk of a pit or the lake'),
  sfx('milk-pour', 4, 'milk pouring steadily from a pipe into a pool, a smooth liquid stream', 'a pipe end spilling; a pour', { loop: true }),
  sfx('pipe-flow-loop', 6, 'thick milk flowing slowly through a hollow metal pipe, soft gurgling with a hollow resonant tube sound', 'the slide pipes: the flow', { loop: true }),
  sfx('pipe-slide-whoosh', 3, 'a small character whooshing fast through a long hollow tube on a rush of liquid, echoing, cartoon', 'riding the pipe slide (P7)'),
  sfx('pipe-slide-exit', 1.4, 'a character popping out of a pipe end with a wet splurt, cartoon', 'leaving the slide'),
  // ---- the crust
  sfx('thin-crust-crackle', 2.5, 'thin glass-like crust cracking underfoot, fine crackling spreading, ice crack', 'standing on thin crust (P1): the warning'),
  sfx('thin-crust-break', 2, 'a slab of thin dried crust breaking and falling away with a crunchy crash and a wet plop', 'thin crust giving way'),
  sfx('step-crust-a', 0.6, 'a single light footstep on hard glossy crust, a short dry tick', 'footstep on crust'),
  sfx('step-crust-b', 0.6, 'a single light footstep on hard chalky stone, a short dull tap', 'footstep on matte crust'),
  sfx('step-metal', 0.6, 'a single light footstep on a steel catwalk, a short metallic tap', 'footstep on pipes and catwalks'),
  // ---- the pipeline and the station
  sfx('valve-turn', 2.2, 'a big heavy metal valve wheel being turned, a rusty creak and squeak, metallic', 'turning a valve wheel (P6)'),
  sfx('valve-wrong-geyser', 2, 'a sudden burst of steam geysering out of a pipe, a hissing blast and a pop, cartoon', 'a wrong order of valves: the geyser'),
  sfx('valve-right-ding', 1.8, 'a satisfying pressure gauge click, a friendly bell ding and a soft machine hum rising', 'the right order: the gauge goes green'),
  sfx('lever-clunk', 1, 'a big lever switch thrown with a heavy metallic clunk', 'a lever (P5, P7)'),
  sfx('plate-press', 1, 'a heavy floor pressure plate clicking down, a metal clunk and a click', 'a pressure plate (P8)'),
  sfx('door-open', 2.5, 'a heavy steel door sliding open with a hydraulic hiss and a clunk', 'a door opening'),
  sfx('door-shut', 1.5, 'a heavy steel door slamming shut with a hydraulic hiss and a clang', 'a door closing'),
  sfx('box-scoot', 2, 'a cardboard box scraping and sliding along a metal floor, a rough scrape', 'pushing the box (P8)'),
  sfx('cat-grumble', 2, 'a grumpy house cat muttering, a low irritated trill and one short sulky meow', 'Miss Clou sulking in the box'),
  // ---- the curd and the fan
  sfx('curd-wobble-a', 1.5, 'a huge lump of jelly wobbling, a squishy gelatinous wobble, cartoon', 'the curd wobbling'),
  sfx('curd-wobble-b', 1.5, 'a big jelly jiggling slowly with a low wet squelch, cartoon', 'the curd wobbling (variation)'),
  sfx('curd-land', 1, 'a soft heavy squish and thud of a character landing on a giant jelly, cartoon', 'landing on the curd'),
  sfx('curd-slide-loop', 5, 'a huge blob sliding slowly over a wet surface, a soft squelchy drag', 'the curd moving', { loop: true }),
  sfx('fan-gust', 2.5, 'a big fan blowing a strong gust of wind, a whoosh with rattly blades', 'the half fan: a gust (P5)'),
  sfx('fan-spin-loop', 4, 'a half-built fan spinning unevenly, rattling and whirring', 'the half fan spinning', { loop: true }),
  // ---- the pump (the hiccup)
  sfx('pump-hiccup', 2, 'a giant industrial pump hiccup: a deep thump, then a rattle of pipes and a wet gulp, big machine, comic', 'THE HICCUP: one on the beat (every 3 seconds)'),
  sfx('pump-hiccup-small', 1.5, 'a smaller weaker machine hiccup, a soft thump and a short rattle, comic', 'the hiccup after valves are closed (P10)'),
  sfx('pump-rattle', 2.5, 'pipes and metal parts rattling and shaking on a big machine', 'the pump shaking between hiccups'),
  sfx('pump-sigh', 6, 'a huge machine slowly letting out one long sigh of steam, a long hiss fading to silence, relief, big and gentle', 'THE SIGH: the hiccup is cured (P10)'),
  sfx('piston-pump-loop', 4, 'a slow piston pump chugging, a rhythmic clank and hiss', 'the working pump', { loop: true }),
  sfx('housing-loose', 2, 'heavy metal bolts popping loose one after another and a big canister clunking free', 'the pump housing comes loose'),
  sfx('bolt-ratchet', 2.5, 'a ratchet wrench tightening bolts, a quick series of metallic clacks, then a final clunk', 'bolting the housing on the rocket (reward 3)'),
  sfx('tank-glug', 3, 'liquid glugging and gurgling into a metal tank, filling up', 'fuel into the rocket / a tank filling'),
  sfx('tank-drain', 3.5, 'a big metal tank draining, liquid gurgling out of a pipe and a swirl', 'draining the tank (P9)'),
  // ---- finding things
  sfx('crumb-pickup', 0.8, 'a cute bright little pickup chime, a tiny sparkle, a game collectible', 'a cheese crumb'),
  sfx('great-cheese', 2.5, 'a joyful sparkling reward jingle with a bright bell, a happy little flourish, game item get', 'the great cheese'),
  sfx('photo-snap', 2, 'an old instant camera shutter click followed by a mechanical whirr as the photo prints out', 'taking a scrapbook photo'),
  sfx('photo-develop', 3, 'a photograph slowly developing, a soft whirr and a gentle shimmer, magical and quiet', 'the photo appears in the book'),
  sfx('map-piece-collect', 1.8, 'a paper rustle and a magical little rising jingle', 'a torn map piece (P9)'),
  sfx('map-complete', 3.5, 'a blueprint being unrolled and clicked together and then a satisfying chime, an achievement sound', 'the pipe map is assembled'),
  sfx('hole-crawl', 2, 'a small creature scrambling through a narrow tunnel in soft cheese, scuffling and squishy', 'going through a hole (P4)'),
  sfx('hole-pop-out', 0.9, 'a small creature popping out of a hole with a soft pop and a squeak', 'coming out of the matching hole'),
  sfx('new-bubble', 3.5, 'one single delicate glass-like bubble rising and floating up with a soft shimmering chime, hopeful and tender', 'the one new bubble at the end'),
  // ---- the ambiences
  amb('moon-ambience', 30, 'a quiet lunar night, a faint low wind, tiny far-off bubbling and soft popping, spacious and lonely', 'outdoors, zones A to D'),
  amb('station-hum', 30, 'a large half-empty industrial hall room tone, a low machine hum, distant pipe creaks and slow drips', 'inside Pump No. 1, zone E'),
  amb('crater-echo', 30, 'inside giant cheese craters, soft drips with long echoing reverb and a hollow cave air', 'zone B, the craters and holes'),

  // ---- the music: MusicGen Looper: whole bars at an exact tempo (80 BPM: a bar is 3.0 s, the hiccup) ----
  { id: 'moon-theme', group: 'music', model: 'looper', bpm: 80, seconds: 18, variations: 3, loop: true, use: 'zones A to C: the Bubbling Moon',
    prompt: '16-bit Super Nintendo platformer soundtrack, instrumental, a strange playful but melancholy lunar landscape, soft marimba and glockenspiel melody over a warm synth pad, plucked bubbly arpeggios, a slow soft bass thump on the first beat of every bar like a big hiccup, sparse and spacious, gentle reverb, D minor' },
  { id: 'pipeline-theme', group: 'music', model: 'looper', bpm: 80, seconds: 18, variations: 2, loop: true, use: 'zone D: the pipeline',
    prompt: '16-bit Super Nintendo platformer soundtrack, instrumental, curious and playful machinery, rhythmic pizzicato strings and muted clanking pipe percussion, a quirky tuba bassline, a bubbling synth arpeggio, a soft deep thump on the first beat of every bar, steady and friendly, G minor' },
  { id: 'pump-hall-theme', group: 'music', model: 'looper', bpm: 80, seconds: 18, variations: 2, loop: true, use: 'zone E: Pump No. 1',
    prompt: '16-bit Super Nintendo soundtrack, instrumental, a half-finished industrial hall, a low pulsing drone and a heavy soft thump on the first beat of every bar like a giant machine hiccup, clock-like ticking, music box and vibraphone, tension building slowly but never scary, gentle and a little silly, A minor' },
  // ---- free-form music: Stable Audio 2.5
  { id: 'quiet-after-hiccup', group: 'music', model: 'stable', seconds: 50, loop: false, use: 'the ending: the pump has sighed, the beat is gone, one new bubble rises',
    prompt: '16-bit Super Nintendo soundtrack, instrumental, calm and hopeful after a long sadness, soft celesta and warm strings, a gentle solo flute melody, no drums, no percussion, tender, spacious, slow, a quiet resolution, D major' },
  { id: 'miss-clou-jazz', group: 'music', model: 'stable', seconds: 40, loop: true, use: "Miss Clou's theme: a slow, jazzy music whenever she talks (the review notes)",
    prompt: 'a slow cool smoky jazz trio in the style of a 16-bit game soundtrack, instrumental, upright bass, brushed drums, a muted trumpet melody that is mysterious and a little smug, 70 BPM, one note slightly wobbly, intimate' },
  // ---- stingers
  { id: 'stinger-photo', group: 'stinger', model: 'stable', seconds: 3, use: 'a scrapbook photo is taken', prompt: 'a very short sparkly rising chime jingle with a glockenspiel and a soft camera click at the start, cheerful, 16-bit game stinger, instrumental' },
  { id: 'stinger-map', group: 'stinger', model: 'stable', seconds: 5, use: 'the pipe map is complete', prompt: 'a short triumphant but silly fanfare with a trumpet and a xylophone, an achievement stinger, 16-bit game, instrumental, ends cleanly' },
  { id: 'stinger-hope', group: 'stinger', model: 'stable', seconds: 6, use: 'the moon is quiet at last; one new bubble', prompt: 'a short tender hopeful stinger, a single high glassy bell and soft strings swelling then fading, 16-bit game, instrumental, ends gently' },
];

const take = id => { let n = id, i = 2; while (['mp3', 'wav'].some(e => existsSync(join(RAW, `${n}.${e}`)))) n = `${id}_${i++}`; return n; };

async function make(s) {
  const input = s.model === 'looper'
    ? { prompt: s.prompt, bpm: s.bpm, max_duration: s.seconds, variations: s.variations || 2, model_version: 'large', output_format: 'wav', temperature: 1, classifier_free_guidance: 3 }
    : { prompt: s.prompt, duration: Math.max(2, Math.ceil(s.seconds)), steps: s.group === 'music' ? 12 : 8, cfg_scale: s.group === 'music' ? 2 : 1 };
  const model = s.model === 'looper' ? 'andreasjansson/musicgen-looper' : 'stability-ai/stable-audio-2.5';
  const r = await run(model, input, { log: () => { }, maxWaitMs: 900000 });
  const files = await download(r.output);
  const urls = Array.isArray(r.output) ? r.output : [r.output];
  const names = [];
  files.forEach((buf, k) => {
    const ext = urls[k].split('.').pop().split('?')[0] || 'mp3', base = take(files.length > 1 ? `${s.id}-v${k + 1}` : s.id);
    writeFileSync(join(RAW, `${base}.${ext}`), buf);
    writeFileSync(join(RAW, `${base}.json`), JSON.stringify({ id: base, sound: s.id, group: s.group, use: s.use, loop: !!s.loop, bpm: s.bpm || null, seconds: s.seconds, model, version: r.version, input, metrics: r.metrics, predictionId: r.id, date: new Date().toISOString() }, null, 2) + '\n');
    names.push(`${base}.${ext}`);
  });
  return names;
}

async function main(argv) {
  const dry = argv.includes('--dry'), force = argv.includes('--force'), want = argv.filter(a => !a.startsWith('--'));
  const todo = SOUNDS.filter(s => !want.length || want.includes(s.id) || want.includes(s.group));
  mkdirSync(RAW, { recursive: true });
  const have = s => ['mp3', 'wav'].some(e => existsSync(join(RAW, `${s.id}.${e}`)) || existsSync(join(RAW, `${s.id}-v1.${e}`)));
  const fresh = todo.filter(s => force || !have(s));
  console.log(`${todo.length} sounds asked for, ${fresh.length} to make${dry ? ' (dry run)' : ''}`);
  if (dry) { for (const s of fresh) console.log(`  ${s.group.padEnd(8)} ${s.id.padEnd(22)} ${s.seconds}s  ${s.model}`); return; }
  let i = 0, failed = [];
  const worker = async () => {
    for (; ;) {
      const s = fresh[i++]; if (!s) return;
      // Replicate's free rate limit is 6 requests a minute (burst 1): one at a time, a pause between, and a retry after a 429
      let done = false;
      for (let t = 1; t <= 3 && !done; t++) {
        try { const names = await make(s); console.log(`${s.id}: ${names.join(', ')}`); done = true; }
        catch (e) { console.log(`${s.id}: try ${t} failed ${e.message.slice(0, 160)}`); await new Promise(r => setTimeout(r, 15000 * t)); }
      }
      if (!done) failed.push(s.id);
      await new Promise(r => setTimeout(r, 11000));
    }
  };
  await worker();
  console.log(failed.length ? `failed: ${failed.join(', ')}` : 'all made');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
