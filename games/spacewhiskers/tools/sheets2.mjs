#!/usr/bin/env node
// Space Whiskers: the Bubbling Moon's second round of art: what the level needed and the first pack could not give (the owner's list "art still needed"):
// the known gaps, the pink and damaged ones redrawn, the pipe slide at Pip's size, Miss Clou and the cats, the scrapbook, the ground and the hall, the animations,
// more backgrounds. Same method as sheets.mjs (one big picture per sheet through the image API, the owner's pictures as style references, a row plan, a clean
// pixel-art block) with one change: the ground is flat GREEN (#00FF00), not magenta, because pale and pink things (mist, steam, curds, paw prints, Pip's ears) were
// eaten by the magenta key. Each row is one group, and each item is named for the file it will be: games/spacewhiskers/ref/ -> sprites/<group>/<name>.png in the pack.
//
//   NODE_USE_ENV_PROXY=1 node games/spacewhiskers/tools/sheets2.mjs [sheet ...] [--quality high --model gpt-image-2.6-flare] [--dry] [--names]
//
// --names writes tools/bubblingmoon2_names.json (per sheet, per row: "group/name"), which tools/cut_sheets.py reads.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, defaultModel } from '../../../tools/art/gen/openai.mjs';
import { fromPNG, toPNG } from '../../../tools/art/image.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..'), REF = join(GAME, 'ref'), PREFIX = 'bubblingmoon2_';

const REFS = [
  { file: 'levelinspirationprops.png', shrink: 2, name: 'owner_props_sheet.png', says: 'the game\'s own props sheet (its green ground is the ground to use here too)' },
  { file: 'bubblingmoon_station.png', shrink: 2, name: 'moon_station_sheet.png', says: 'a finished sheet of this level\'s pumping-station props: match its pixel size, line weight, colours and shading exactly' },
  { file: 'frames/bubblingmoon2_pipeslide_straight.png', shrink: 1, name: 'slide_straight_piece.png', says: 'the straight slide piece already drawn: every tube piece you draw must have EXACTLY this outer height and this clear milk-filled inside height (the shaft the same outer WIDTH), the same collars, the same glass, the same colours' },
  { file: 'pip.png', shrink: 1, name: 'pip_sprites.png', says: 'the hero, Pip the mouse astronaut: he is 49 art pixels tall, which fixes the scale of everything' },
];

const STYLE = (REFS) => `STYLE (a program cuts this picture into pixel-art sprites for a game, so follow it exactly)
- TRUE 16-bit (Super Nintendo style) pixel art on a strict fixed grid: every art pixel is a perfectly square, evenly coloured 4 x 4 block of image pixels, so every pixel can be counted by eye. Edges of shapes are clean staircases of whole square pixels: never smooth curves, never soft or noisy shading, never JPEG-like speckle, no anti-aliasing, no gradients, no blur, no glow halos, no dithering noise, no drop shadows, no cast shadows on the ground. Each shade is ONE exact flat colour; use only a small palette of about 32 colours for the whole picture, the same colour every time it is used.
- A clean, continuous, dark near-black-brown (#1A1410) outline exactly 1 art pixel (4 image pixels) thick round EVERY item (except where a line says "no outline", for soft things), also round white, cream and pale items so they stand out from the green; used ONLY for outlines. No fill colour darker than #40382F. Inside the outline shade each material with 2 or 3 flat tones and a few hard-edged pixel highlights, like the references.
- Match the ${REFS.length === 1 ? 'one' : REFS.length === 2 ? 'two' : 'three'} attached reference picture${REFS.length === 1 ? '' : 's'} in pixel size, line weight, saturation and level of detail: ${REFS.map((r, i) => `(${i + 1}) ${r.says}`).join('; ')}.
- SCALE: Pip is 49 art pixels (196 image pixels) tall; everything is drawn at that same pixel size. Sizes below are in art pixels (width x height), only roughly.
- Glass, bubbles and windows are drawn in opaque pale colours with a white highlight: nothing is see-through, and nothing is drawn behind an item.
- No text inside the items except where a line gives the words. Seen strictly from the side (a 2D platformer), light from the upper left.`;

const WORLD = `THE WORLD: the Bubbling Moon, a strange, silly and slightly sad moon in a children's game (never scary). Its milk lakes have dried into cracked, glossy white crust that mirrors the sky. Giant cheese craters full of Swiss-cheese holes are the pits. Bubbles of old milk pop up out of the ground on a slow beat, as if the moon had hiccups. A big wobbling curd drifts across the dry lake like a slow boat. The cats built an old, half-finished, high-tech milk pumping station here: steel grey with orange and yellow trim, rust, paw-print logos and coloured cables. Palette: milk white, cream, butter yellow, cheese orange, pale lavender and blue-grey shadows, a deep violet night sky.`;

const MISS_CLOU = `MISS CLOU (use exactly this design): an orange tabby she-cat with big green eyes and a calm, sharp, slightly smug face, a dark brown nose, pointed ears, a long fluffy orange tail. She wears a white space suit with orange and dark-grey trim, black gloves and boots, dark knee and elbow pads, a dark tool belt, a small round glowing CYAN gauge in the middle of the chest, and a round clear glass bubble helmet over her ears. On her back a compact white and orange life-support pack with two small ion boosters (a little cyan flame when they fire). NOT a dark blue suit, NO cape. About 52 art pixels tall standing, a little taller than Pip.`;

const FORMAT = (w, h) => `FORMAT
- One PNG, ${w} x ${h}, landscape. Background: ONE flat, solid, bright pure green (#00FF00) everywhere behind the items. No checkerboard, no scenery, no ground strip, no frames or boxes round items, no title, no legend. No bright green inside the items (the green eyes of Miss Clou and any mould are a darker, duller green).
- Follow the row plan below, rows from top to bottom, items from left to right, exactly the items listed (one drawing each, nothing extra, nothing missing; the frames of one animation are the same size, side by side, on the same ground line, identical in colours and proportions). Items stand on a common ground line in their row. Leave at least 6 art pixels (24 image pixels) of empty green all round every item; no item may touch another item or the edge.
- Under each item a short label in small plain white text (catalogue style) with a clear gap between the label and the item above it and the tops of the items in the row below. The label is the item's name exactly as given in quotes. Keep the labels short.`;

const PANEL_FORMAT = `FORMAT
- One PNG, 3840 x 2160, landscape: the TOP panel fills the top 1080 rows, the BOTTOM panel the bottom 1080 rows. No labels, no title, no frame. The game screen is 480 x 270 art pixels; each panel is two screens wide (960 x 270 art pixels = 3840 x 1080 image pixels) and scrolls sideways behind the action. EACH PANEL MUST REPEAT SEAMLESSLY: its left edge continues exactly into its right edge, with no feature cut at the edges. Where a panel says "on green", everything that is not part of the layer is flat pure green (#00FF00) so a program can cut it out, and the layer is solid down to the bottom edge of its panel; no bright green inside the layers.`;

// one row: group, what it is, items [name, description]
// a sheet may name its own reference pictures (by file); the rest use all three
const refsOf = s => s.refs ? REFS.filter(r => s.refs.includes(r.file)) : REFS;
const R = (group, head, items) => ({ group, head, items });

export const SHEETS2 = {
  fixes: {
    title: 'Bubbling Moon round 2, fixes: the known gaps, the pink or damaged items redrawn, white curds',
    use: 'the sprites the first pack lacked or had damaged: crater caps, map piece 2, the pump housing, ladders, the rope fence, paw prints, mist, steam, the dust beam, milk haze, white curds',
    rows: [
      R('terrain', 'CRATER CAPS', [['crater-cap-l', 'the left end of a crater\'s rim: a rolled lip of glossy white dried-milk crust over orange Swiss cheese with a few holes, sloping down to the right (60 x 40)'], ['crater-cap-r', 'its mirror image, the right end of a crater\'s rim (60 x 40)']]),
      R('station', 'THE PUMP', [['map-piece-2', 'the second torn jigsaw-shaped piece of a pale blue blueprint of a pipe network: white lines of pipes, valves and tanks, ragged torn edges, a corner of a "lakes to fortress" plan (42 x 43)'], ['pump-housing', 'a rounded steel canister that is the pump\'s housing: squat, with a ring of four big bolts round its middle, a small valve wheel on top, an orange band and a cat paw plate, clearly different from a round milk tank (40 x 50)'], ['pump-housing-loose', 'the same housing a little tilted, its four bolts popped out and floating just beside it, a gap of air under it (44 x 54)'], ['hiccup-lamp-off', 'the round red warning lamp on its bracket with the letters "HIC", switched OFF: the glass is a dull dark maroon, no glow (42 x 40)'], ['ladder', 'a clean steel ladder, plain, two rails and rungs, no pink anywhere (21 x 67)'], ['main-ladder', 'a clean steel ladder with a safety cage round it, for the side of a giant pipe (38 x 84)']]),
      R('milk', 'WOOD AND ROPE', [['short-ladder', 'a short wooden ladder, plain (46 x 60)'], ['rope-fence', 'two wooden posts with a sagging rope between them (71 x 50)']]),
      R('terrain', 'PAW PRINTS (GREY-BROWN, NEVER PINK)', [['paws-a', 'a trail of two grey-brown cat paw prints pressed into dust, flat on the ground line (54 x 31)'], ['paws-b', 'a trail of two paw prints, a different spacing (54 x 33)'], ['paws-c', 'a trail of two paw prints, one smaller (58 x 24)']]),
      R('fg_outdoor', 'SOFT THINGS (flat opaque pale colours, 2 or 3 stacked tones with hard pixel steps, NO outline, never pink)', [['mist-a', 'a long low bank of mist in pale lavender-white tones (180 x 30)'], ['mist-b', 'a shorter bank of mist (120 x 25)'], ['milk-fog', 'a rounded cloud of pale cream fog (80 x 40)'], ['dust-drift', 'a low drift of fine pale dust with a few flying specks (90 x 25)']]),
      R('fg_station', 'SOFT THINGS (flat opaque pale colours, NO outline, never pink)', [['steam-a', 'a low drift of white steam in two tones (80 x 40)'], ['steam-b', 'a puff of steam rising, a different shape (60 x 50)'], ['dust-beam', 'a slanting beam of dusty light from a window: flat pale yellow bands (80 x 200)'], ['milk-haze', 'a low haze of cream fog (160 x 40)']]),
      R('milk', 'WHITE CURDS (the curds of the first sheet were rosy: these are WHITE and cream, no pink tint at all; a big wobbling lump with a flat bottom, no face)', [['curd-white', 'the curd at rest (73 x 52)'], ['curd-squash-white', 'squashed wide and low (82 x 33)'], ['curd-stretch-white', 'stretched tall and narrow (57 x 63)'], ['curd-tilt-l-white', 'wobbling, tilted left (71 x 50)'], ['curd-tilt-r-white', 'wobbling, tilted right (67 x 50)'], ['curd-sail-white', 'the curd with a small sail made of an orange cheese-rind slice on a stick (70 x 67)'], ['curd-small-white', 'a small curd blob (54 x 28)'], ['curd-chunk-white', 'a broken-off piece (41 x 28)']]),
    ],
  },

  slide: {
    title: 'Bubbling Moon round 2: the pipe slide at Pip\'s size, flow frames, a tall support leg, the giant bubble',
    use: 'the pipe slide (P7): pipes big enough to put Pip inside, the milk flow, the tall pipeline leg, the giant bubble for the slow ride',
    rows: [
      R('pipeslide', 'THE SLIDE PIPES (a big transparent glass tube filled with milk: Pip, a mouse 49 art pixels tall, must fit INSIDE it, so the clear inside is at least 80 art pixels tall (more than one and a half Pip heights: the whole tube is about 100 art pixels tall) and flat, unobstructed, drawn in opaque cream-white milk with a few pale streaks and white glass highlights; the glass shell is pale blue-white with a thin dark outline; a steel collar with an orange band every 70 art pixels; seen from the side)', [['straight', 'a straight piece that tiles end to end (140 x 100)'], ['end-left', 'the open mouth on the LEFT end: a steel flange ring, the tube opening towards the left (100 x 100)'], ['end-right', 'the open end on the RIGHT end that spits things out: a flange ring and a small spout of milk drips (110 x 100)'], ['tee-up', 'a T junction: a horizontal tube with a branch going UP (140 x 170)'], ['tee-down', 'a T junction: a horizontal tube with a branch going DOWN (140 x 170)']]),
      R('pipeslide', 'MORE SLIDE PIPES (same look)', [['shaft', 'a vertical straight shaft that tiles top to bottom (100 x 140)'], ['corner-up', 'a corner: the tube comes in from the left and turns UP (120 x 120)'], ['corner-down', 'a corner: the tube comes in from the left and turns DOWN (120 x 120)']]),
      R('pipeslide', 'THE FLOW (only the milk inside a straight piece, 140 x 80 each, four frames of one loop; the streaks of the thick milk slide to the right a little in every frame and the last frame continues into the first, so it tiles)', [['flow-1', 'cream-white milk with pale blue-white streaks, frame 1'], ['flow-2', 'frame 2: the streaks moved right'], ['flow-3', 'frame 3'], ['flow-4', 'frame 4']]),
      R('station', 'THE PIPELINE LEG', [['main-support-tall', 'a tall A-frame steel support leg for a giant pipeline, with cross bracing, rivets and an orange band, standing on a base plate (44 x 112)']]),
      R('milk', 'THE GIANT BUBBLE', [['bubble-giant', 'one giant milk bubble, milky white with a cream rim and bright white highlights, pale blue shadow, drawn with fine pixels so it does not look chunky (150 x 150)']]),
    ],
  },

  slide2: {
    title: 'Bubbling Moon round 2: the slide pieces redrawn to the size of the straight piece (shaft, corners, flow frames)',
    use: 'the pipe slide (P7): the pieces of the first take that came out too small inside: the vertical shaft, the two corners and the four milk flow frames',
    refs: ['frames/bubblingmoon2_pipeslide_straight.png', 'bubblingmoon_station.png'],
    rows: [
      R('pipeslide', 'SLIDE PIPES IN THE SIZE OF THE FIRST PICTURE (the tube body is exactly as thick as the reference piece is tall, 63 art pixels, with a clear milk-filled inside of 52 art pixels or more, the same collars, glass and colours; a vertical piece is as wide as the reference is tall; a corner is two such tubes meeting in a rounded steel elbow)', [['shaft', 'a vertical straight shaft that tiles top to bottom (63 x 140)'], ['corner-up', 'a corner: the tube comes in from the left and turns UP (110 x 110)'], ['corner-down', 'a corner: the tube comes in from the left and turns DOWN (110 x 110)']]),
      R('pipeslide', 'THE FLOW (a straight piece like the reference, 170 x 63 each, four frames of one loop; only the milk inside differs: cream-white milk with pale blue-white streaks that slide a little to the right in every frame, the last frame continuing into the first)', [['flow-1', 'frame 1'], ['flow-2', 'frame 2: the streaks moved right'], ['flow-3', 'frame 3'], ['flow-4', 'frame 4']]),
    ],
  },

  characters: {
    title: 'Bubbling Moon round 2: Miss Clou, the helmeted cat and its trolley, Pip crawling, Pip\'s rocket',
    use: 'Miss Clou (stand, cool, startled, hover, in the box), the helmeted cat asleep on a pump trolley and freed, Pip crawling through a hole, the rocket with the fuel tank',
    rows: [
      R('missclou_old', 'MISS CLOU, side view facing RIGHT (the design above)', [['stand', 'standing calmly, arms by her sides, a slight smug smile, tail curled behind'], ['cool', 'arms folded across her chest, one eyebrow raised, smug and mysterious, weight on one leg'], ['startled', 'startled: ears flat back, eyes wide, both arms up, tail puffed up, one foot lifted'], ['hover-1', 'hovering a little above the ground on her boosters, a small cyan flame under the pack, legs dangling, arms folded'], ['hover-2', 'the same hover, the cyan flame flickering a different shape']]),
      R('missclou_old', 'MISS CLOU IN THE BOX (a plain brown cardboard box with a cat paw stamp, front view, about 46 x 30; she has NO helmet in the box)', [['box-open-cat', 'the open box with Miss Clou\'s orange tabby head and her two paws over the rim, ears flat, green eyes narrowed in a deep glare, grumpy and sulking'], ['box-closed-cat', 'the box with its flaps folded shut over her, only two narrowed glaring green eyes in a slit and her orange tail hanging over the side']]),
      R('cat', 'THE HELMETED CAT (a big grey tabby cat in a bulky metal mind-control helmet: a grey dome with a small antenna on top and a blinking red light in front, glazed sleepy eyes; a victim, not a monster)', [['trolley', 'an empty low steel pump trolley: a flat cart with four wheels, a handle and a small pump nozzle, paw logo (80 x 36)'], ['helmet-asleep-1', 'the grey cat curled up asleep on the trolley, the helmet on, the red light ON (80 x 50)'], ['helmet-asleep-2', 'the same, breathing in: the body a little higher, the red light dim (80 x 52)'], ['helmet', 'the helmet alone on the ground, its dome cracked open in two halves, the red light dead (30 x 24)'], ['freed', 'the same grey cat without the helmet, sitting up, plain surprised eyes wide, ears up (40 x 44)']]),
      R('pip', 'PIP CRAWLING (Pip the mouse astronaut from the third reference picture: the same orange mouse, big pink ears, round glass helmet, white suit, red scarf, tank; side view facing RIGHT, on hands and knees, about 36 art pixels long and 30 tall)', [['crawl-1', 'crawl cycle frame 1: left hand and right knee forward'], ['crawl-2', 'frame 2: passing'], ['crawl-3', 'frame 3: right hand and left knee forward'], ['crawl-4', 'frame 4: passing'], ['pop-out-1', 'popping out of a hole: arms up and stretched forward, head high, mid-leap, 40 x 46'], ['pop-out-2', 'landing from the pop: crouched, arms down, 40 x 36']]),
      R('ending', 'PIP\'S BOTTLE ROCKET (a home-made rocket: a clear plastic bottle as the body, a tin can as the cockpit, three little mismatched rocket motors at the back, loose wires and lots of silver duct tape, a wobbly fin; side view pointing RIGHT, about 120 x 56)', [['rocket', 'the rocket as it is'], ['rocket-tank', 'the same rocket with a squat steel canister (a pump housing with a ring of bolts and an orange band) bolted under the bottle as a fuel tank'], ['bolt-1', 'the canister held in the air just under the bottle, unbolted'], ['bolt-2', 'the canister against the bottle, two bolts in'], ['bolt-3', 'the canister bolted on, a wrench resting on it']]),
    ],
  },

  missclou: {
    title: 'Bubbling Moon round 2: Miss Clou (a second try, drawn without the picture of Pip)',
    use: 'Miss Clou: stand, cool, startled, hover, in the cardboard box (open and closed), seen from the side',
    refs: ['levelinspirationprops.png', 'bubblingmoon_station.png'],
    pre: MISS_CLOU + '\nShe is a CAT, not a mouse: a pointed triangular cat ear on each side of the top of her head (clearly pointed, never round), a small pink-nosed muzzle with whiskers, a long fluffy tail. She does NOT look like the hero Pip (a round-eared mouse).',
    rows: [
      R('missclou', 'MISS CLOU, side view facing RIGHT (the design above), about 52 art pixels tall', [['stand', 'standing calmly, arms by her sides, a slight smug smile, tail curled behind'], ['cool', 'arms folded across her chest, one eyebrow raised, smug and mysterious, weight on one leg'], ['startled', 'startled: ears flat back, eyes wide, both arms up, tail puffed up, one foot lifted'], ['hover-1', 'hovering a little above the ground on her boosters, a small cyan flame under the pack, legs dangling, arms folded'], ['hover-2', 'the same hover, the cyan flame flickering a different shape']]),
      R('missclou', 'MISS CLOU IN THE BOX (a plain brown cardboard box with a cat paw stamp, front view, about 46 x 30; she has NO helmet in the box)', [['box-open-cat', 'the open box with Miss Clou\'s orange tabby head with two clearly POINTED ears and her two paws over the rim, ears flat, green eyes narrowed in a deep glare, grumpy and sulking'], ['box-closed-cat', 'the box with its flaps folded shut over her, only two narrowed glaring green eyes in a slit and her orange tail hanging over the side'], ['box-empty', 'the same cardboard box, open and empty, flaps up']]),
    ],
  },

  scrapbook: {
    title: 'Bubbling Moon round 2: the scrapbook: polaroid frame, the photos, the camera, the map page, HUD icons',
    use: 'the scrapbook (Pip\'s instant camera): a polaroid frame, a picture for every photo of the moon, the camera icon, the pipe map as a full page, the HUD icons',
    pre: 'The photos are SMALL SCENES drawn as the pictures in an instant-camera photo: each scene fills its own rectangle (about 80 x 72) with a thin dark outline, and shows a whole little picture, not an icon.',
    rows: [
      R('scrapbook', 'THE POLAROID FRAME AND THE ICONS', [['polaroid-frame', 'an instant-camera photo frame: a white-cream border, thicker at the bottom, with an EMPTY window in the middle filled with the same flat green as the background (96 x 112)'], ['camera-icon', 'a little old instant camera seen from the side with a lens, a flash and a red button (28 x 22)'], ['hud-photo-icon', 'a tiny photo icon: a small polaroid, simple (16 x 16)'], ['hud-map-icon', 'a tiny rolled-up blueprint icon, simple (16 x 16)'], ['hud-camera-icon', 'a tiny camera icon, simple (16 x 16)']]),
      R('scrapbook', 'THE PHOTOS (small scenes, about 80 x 72)', [['photo-reflection', 'a glossy dried-milk lake seen from above at a slant: the dark violet sky with a thin broken Milky Way is reflected in it UPSIDE DOWN, a single small figure-less foreground'], ['photo-curd-sail', 'the big cream curd with its orange rind sail drifting on a thin film of whey across the dry lake, the far shore behind'], ['photo-milkyway-top', 'a view from the top of a moon: a curved horizon, a dark violet sky filled with stars and a thin pale Milky Way arching across it'], ['photo-missclou-box', 'an orange tabby cat with narrowed green eyes sulking in a small cardboard box on a steel floor, funny'], ['photo-plaque', 'a bronze wall plaque with the words "FIRST PUMPING DAY" on a steel wall']]),
      R('scrapbook', 'MORE PHOTOS (small scenes, about 80 x 72)', [['photo-old-ceremony', 'an old faded SEPIA photograph (brown and cream tones only) of a ribbon-cutting ceremony: a small cat and a small mouse standing side by side holding a pair of giant scissors over a ribbon, a crowd of tiny blurred figures, no clear faces, worn and creased'], ['photo-pipe-map', 'a pale blue blueprint of a network of pipes running from lakes to a fortress, white lines'], ['photo-new-bubble', 'one single small milk bubble rising from a bare cracked white plain under a violet sky, tender and hopeful'], ['photo-blank', 'a blank grey-blue photo, a developing photo before the picture appears: a plain flat pale panel with a soft darker vignette made of flat steps']]),
      R('scrapbook', 'THE MAP PAGE (one big page, 200 x 140): a full scrapbook page of old yellowed paper with taped corners, on it the assembled pipe map: a pale blue blueprint drawing of pipes running from lakes through a pumping station to a fortress, white lines, a few cat paw stamps', [['map-page', 'the page']]),
    ],
  },

  ground: {
    title: 'Bubbling Moon round 2: the ground: end caps, pit walls, underground fills, the milk pool',
    use: 'the outdoor ground (left and right end caps, the inner walls of the pits in crust and in cheese, underground fills that do not repeat) and the milk pool surface',
    rows: [
      R('ground', 'END CAPS AND PIT WALLS (side view of the edge of the ground; the top is a flat horizontal surface)', [['cap-left', 'the LEFT end of the ground: a slab of glossy white dried-milk crust on top of layered chalky strata, the end face rounded and crumbling, 64 x 64'], ['cap-right', 'the RIGHT end of the ground, its mirror image, 64 x 64'], ['pit-wall-crust-l', 'the inner wall on the LEFT side of a pit cut in crust: layered chalky white and cream strata, with a thin glossy lip at the top; 32 wide, 64 tall, the pieces stack top to bottom'], ['pit-wall-crust-r', 'the inner wall on the RIGHT side of a pit, the mirror image, 32 x 64'], ['pit-wall-cheese-l', 'the inner wall on the LEFT side of a pit cut in butter-yellow Swiss cheese with round holes and an orange rind lip at the top, 32 x 64'], ['pit-wall-cheese-r', 'the inner wall on the RIGHT side of a pit in cheese, the mirror image, 32 x 64']]),
      R('ground', 'UNDERGROUND FILLS (what is under the ground: big, different from each other so they do not look repeated; no top surface, they fill the area under the ground, 128 x 96 each)', [['fill-a', 'layers of chalky white and cream milk-stone strata with a few cracks and one small hole'], ['fill-b', 'butter-yellow Swiss cheese with many round holes of different sizes'], ['fill-c', 'a mix: crust strata above, cheese with holes below, a vein of dried milk skin between'], ['fill-d', 'dark violet-blue deep rock with pale veins and a few small cheese pockets']]),
      R('ground', 'THE MILK POOL SURFACE (a shallow pool of old milk seen from the side: only the surface strip, 123 x 20 each, three frames of gentle waves that tile left to right and loop 1-2-3-1; opaque cream-white milk with a bright white top line and pale blue-grey tones below)', [['milk-pool-1', 'waves frame 1'], ['milk-pool-2', 'waves frame 2: the crests moved right'], ['milk-pool-3', 'waves frame 3']]),
    ],
  },

  hall: {
    title: 'Bubbling Moon round 2: the pump hall: floor, ceiling, partition, ladder, door frames, exterior wall, the big entrance',
    use: 'the inside of Pump No. 1 at Pip\'s size: a steel floor tile with a top edge, a ceiling girder and pipe row, a wall partition, a ladder, door frames, the hall\'s exterior wall, a bigger "PUMP No. 1" entrance',
    rows: [
      R('hall', 'FLOOR AND CEILING (tileable pieces of a half-finished cat pumping station: steel grey with orange and yellow trim, rivets, a paw logo now and then)', [['floor-tile', 'a steel floor tile with a bright top edge and rivets that tiles left to right, 48 x 24'], ['floor-end-l', 'the left end of a steel floor: the same with the end face visible, 48 x 24'], ['floor-end-r', 'the right end of a steel floor, 48 x 24'], ['ceiling-girder', 'a ceiling steel girder with rivets and an orange stripe that tiles left to right, 96 x 28'], ['ceiling-pipes', 'a row of three fat pipes with flanges running along under a ceiling that tiles left to right, 96 x 28']]),
      R('hall', 'WALLS AND DOORS', [['wall-partition', 'a steel wall partition that tiles top to bottom, riveted panels with an orange stripe, 48 x 96'], ['wall-partition-top', 'the top end of that partition with a girder cap, 48 x 32'], ['ladder', 'a steel ladder at Pip\'s size with a cage, 18 x 90'], ['door-frame', 'a door frame: two steel posts and a lintel with hazard stripes, the opening empty and filled with the same flat green as the background, 62 x 76'], ['door-frame-tall', 'a taller door frame for a big door, the opening filled with the same flat green, 70 x 100']]),
      R('hall', 'THE OUTSIDE OF THE HALL', [['exterior-wall', 'a big wall of the pumping hall seen from outside: riveted steel panels, orange trim, a paw logo, a few portholes, rust streaks, the top edge a flat roofline, 160 x 120'], ['entrance-big', 'a big entrance arch with a steel door frame, a roof sign with the words "PUMP No. 1" in white letters on a dark panel, hazard stripes, a paw logo, the doorway dark, 140 x 120']]),
    ],
  },

  anim_a: {
    title: 'Bubbling Moon round 2, animation frames A: bubbles, glow, the fan, the curd, the thin crust, the new bubble',
    use: 'frames for the bubbles (more swell frames, glow, bubbles with a crumb, the one new bubble rising), the half fan spinning and its gust, the curd wobbling, the thin crust cracking and falling',
    rows: [
      R('anim', 'BUBBLE SWELL (milky white bubble, cream rim, white highlight; one bubble growing from a bud to full size in 8 steps (the model drew 7 of them: the frame 5 step is missing, so the cut names them 1 to 7), same ground line, bottom aligned)', [['bubble-swell-1', 'a tiny bud on a crack (14 x 12)'], ['bubble-swell-2', '20 x 18'], ['bubble-swell-3', '28 x 26'], ['bubble-swell-4', '36 x 34'], ['bubble-swell-5', '52 x 50'], ['bubble-swell-6', '58 x 56'], ['bubble-swell-7', 'full, just before it pops, slightly stretched (64 x 62)']]),
      R('anim', 'BUBBLE WITH A CRUMB (a bubble with a cheese crumb floating inside, swelling and popping)', [['bubble-crumb-1', 'small, the crumb tiny inside (28 x 28)'], ['bubble-crumb-2', 'medium (44 x 44)'], ['bubble-crumb-3', 'large (60 x 60)'], ['bubble-crumb-pop', 'the bubble burst, the crumb falling, a few drops (50 x 50)']]),
      R('anim', 'SOFT GLOW (a soft glow for the bubbles, drawn as flat concentric rings of pale blue-white getting paler outward, NO outline, a round disc, so a program can add it as light)', [['bubble-glow-s', 'a small glow disc (48 x 48)'], ['bubble-glow-m', 'a medium glow disc (80 x 80)'], ['bubble-glow-l', 'a large glow disc (130 x 130)']]),
      R('anim', 'THE HALF FAN (a steel fan in a square frame with only TWO of its four blades fitted, 50 x 50) and THE GUST', [['fan-spin-1', 'the two blades pointing up and down'], ['fan-spin-2', 'rotated 45 degrees'], ['fan-spin-3', 'rotated 90 degrees: left and right'], ['fan-spin-4', 'rotated 135 degrees'], ['gust-1', 'a gust of wind: three flat pale curved wind streaks, NO outline (90 x 40), frame 1'], ['gust-2', 'the gust frame 2: the streaks longer'], ['gust-3', 'the gust frame 3: the streaks thin and fading']]),
      R('anim', 'THE CURD WOBBLING (a big cream-WHITE jelly lump with a flat bottom, no face, 73 x 52, same ground line)', [['curd-landed-1', 'just landed on: squashed wide and low'], ['curd-landed-2', 'rebounding: stretched tall'], ['curd-landed-3', 'settling: a small wobble to the right'], ['curd-wheel-1', 'the curd carrying a big cheese wheel on its top, tilted a little left'], ['curd-wheel-2', 'the same, tilted a little right']]),
      R('anim', 'THIN CRUST CRACKING (a slab of thin glossy white crust with a blue sheen, 100 x 18, seen from the side)', [['crust-crack-1', 'one hairline crack'], ['crust-crack-2', 'a spiderweb of cracks'], ['crust-crack-3', 'broken into pieces, lifting'], ['crust-crack-4', 'about to fall: the pieces apart'], ['crust-fall-1', 'a falling chunk, tilted (40 x 20)'], ['crust-fall-2', 'a falling chunk, tilted the other way (40 x 20)']]),
      R('anim', 'THE ONE NEW BUBBLE RISING (a single small clean glassy bubble, with a white highlight, rising from a bare cracked crust; 4 frames, same ground line)', [['bubble-rise-1', 'a tiny bud in a crack (14 x 14)'], ['bubble-rise-2', 'a small bubble just above the crack (22 x 24)'], ['bubble-rise-3', 'a bigger bubble lifting off, a shine (30 x 34)'], ['bubble-rise-4', 'floating up, perfect and round, a sparkle (34 x 38)']]),
    ],
  },

  anim_b: {
    title: 'Bubbling Moon round 2, animation frames B: valves, the geyser, the pump (hiccup, sigh), the housing coming loose',
    use: 'frames for the valves (lit paw counts, turning, the wrong-order geyser, the drain wheels) and the pump (the hiccup rattle, the long sigh, off, the housing coming loose)',
    rows: [
      R('anim', 'VALVE WHEELS WITH THEIR PAW COUNT LIT (a big valve wheel on a short pipe stub, 48 x 43: the paw marks on the hub GLOW bright yellow-white: ONE paw on the red wheel, TWO on the blue, THREE on the yellow)', [['wheel-red-lit', 'the red wheel, one paw lit'], ['wheel-blue-lit', 'the blue wheel, two paws lit'], ['wheel-yellow-lit', 'the yellow wheel, three paws lit']]),
      R('anim', 'THE WHEELS TURNING (the same valve wheels with their spokes rotated: frame 1 is 30 degrees, frame 2 is 60 degrees, frame 3 is 90 degrees from the upright position; same position, size and colours)', [['wheel-red-turn-1', 'red wheel, 30 degrees'], ['wheel-red-turn-2', 'red wheel, 60 degrees'], ['wheel-red-turn-3', 'red wheel, 90 degrees'], ['wheel-blue-turn-1', 'blue wheel, 30 degrees'], ['wheel-blue-turn-2', 'blue wheel, 60 degrees'], ['wheel-blue-turn-3', 'blue wheel, 90 degrees'], ['wheel-yellow-turn-1', 'yellow wheel, 30 degrees'], ['wheel-yellow-turn-2', 'yellow wheel, 60 degrees'], ['wheel-yellow-turn-3', 'yellow wheel, 90 degrees']]),
      R('anim', 'THE GEYSER (a burst of steam shooting UP out of a pipe end, white and pale blue-grey flat tones, thin outline; 5 frames, the pipe end at the bottom; for a wrong order of valves)', [['geyser-1', 'a small puff at the pipe end (40 x 30)'], ['geyser-2', 'a column starting to rise (40 x 60)'], ['geyser-3', 'the full tall column with a cloud on top (50 x 100)'], ['geyser-4', 'the column thinning, the cloud wide (60 x 90)'], ['geyser-5', 'only wisps left (50 x 50)']]),
      R('anim', 'THE DRAIN WHEELS (a big steel wheel on a drain valve of a tank, a bit larger and grey with a yellow rim, 56 x 50)', [['drain-wheel-1', 'upright'], ['drain-wheel-2', 'turned 45 degrees'], ['drain-wheel-3', 'turned 90 degrees']]),
      R('anim', 'THE PUMP (the big half-built pump engine with scaffolding still round it, a paw logo, 110 x 90, same ground line; frames of the HICCUP: it rattles)', [['pump-hiccup-1', 'rest, steam-free'], ['pump-hiccup-2', 'the whole engine jumped 3 pixels up, the pistons up, bolts rattling'], ['pump-hiccup-3', 'landing back 2 pixels down, the pistons down, a puff of steam from a joint'], ['pump-off', 'switched off, quiet, dull, no steam']]),
      R('anim', 'THE LONG SIGH (a puff of steam let out by the pump, white and pale grey flat tones, thin outline, 5 frames: a big cloud that grows and then thins and is gone; 100 x 90 at most)', [['pump-sigh-1', 'a big puff leaving a vent'], ['pump-sigh-2', 'a bigger cloud billowing'], ['pump-sigh-3', 'the cloud at its widest'], ['pump-sigh-4', 'the cloud thinning, rising'], ['pump-sigh-5', 'a last thin wisp']]),
      R('anim', 'THE HOUSING COMING LOOSE (the pump housing: a squat steel canister with a ring of four big bolts, a small valve wheel on top and an orange band, 40 x 50)', [['housing-loose-1', 'bolted on, one bolt starting to lift'], ['housing-loose-2', 'two bolts out and in the air, the canister loosening'], ['housing-loose-3', 'all four bolts out, the canister tilted and sliding, free']]),
    ],
  },

  bg_outdoor: {
    title: 'Bubbling Moon round 2 backgrounds, outdoors: the middle plain with the LARGE pumping station (top), the near pipeline legs (bottom)',
    use: 'the approach to the pumping station (zones D and E): the same plain as before but the station is near and large; and a near layer of the pipeline marching past on legs',
    panels: [['middle-plain-large', false], ['near-pipeline', false]],
    prompt: `PANEL 1 (top), THE MIDDLE LAYER, APPROACH VERSION, on green: the same kind of plain as in the first pack (rolling cheese hills and Swiss-cheese craters, the dried milk lakes between them as long flat glossy white-blue crust that reflects the sky, a few bubbles of milk) but now the half-finished cat PUMPING STATION is NEAR and LARGE in the middle of the panel (it fills a third of the panel's width and half its height): grey and orange steel, a crane, three huge round milk tanks, a stack, a big paw-print logo, scaffolding, and the thick PIPELINE on tall legs running out of it to both edges of the panel. Everything above the hills and the station is flat green. The bottom 25 percent is solid ground colour down to the bottom edge.
PANEL 2 (bottom), THE NEAR PIPELINE LAYER, on green: the great pipeline marching past in the near distance: three enormous steel pipes with orange bands and flanges running along the whole width of the panel on tall A-frame legs, cables looping between them, the odd valve wheel and a ladder; under them a rocky cheese-and-crust slope at the bottom edge, solid down to the bottom of the panel. The middle of the panel stays open (flat green) so the action is readable; the pipes sit in the lower half.`,
  },
  bg_station_a: {
    title: 'Bubbling Moon round 2 backgrounds, inside: the arrival hall wall (top), the tank room wall (bottom)',
    use: 'interior backgrounds for the first two rooms of Pump No. 1 (opaque walls, repeat sideways)',
    panels: [['arrival-hall', true], ['tank-room', true]],
    prompt: `Both panels are FULL, OPAQUE pictures (no green at all): the inside wall of a room of the half-finished cat pumping station, dim and calm so the hero and the props stand out, low contrast, blue-grey with orange and yellow trim, riveted steel panels, pipes, gauges, a paw logo. Both repeat seamlessly.
PANEL 1 (top), THE ARRIVAL HALL: the entrance hall: a wall with a reception counter along the bottom with a dusty bell, coat hooks with a cat-size hard hat, a big noticeboard, a clock stopped at ten past ten, a few lockers, a stack of crates, half the wall painted and half bare primer with pencil guidelines, hanging lamps unlit, a porthole showing the night.
PANEL 2 (bottom), THE TANK ROOM: a wall of huge round milk tanks standing in a row (some with sight glasses showing milk levels full, half and empty), a tangle of pipes and valves between them, ladders and gauges, a steel catwalk rail along the wall, drip stains, a faint milky glow from the tanks.`,
  },
  bg_station_b: {
    title: 'Bubbling Moon round 2 backgrounds, inside: the scaffold hall wall (top), a second deep hall layer (bottom)',
    use: 'interior backgrounds for the pump hall with the main pump (opaque wall; the deep layer on green), repeat sideways',
    panels: [['scaffold-hall', true], ['deep-hall-2', false]],
    prompt: `PANEL 1 (top), THE SCAFFOLD HALL, a FULL, OPAQUE picture (no green): the inside of the big pump hall under construction: scaffolding and ladders and planks everywhere against a half-finished wall of bare steel frame and grey primer, a few finished panels with orange trim, cables and pipes hanging, a big unlit window, tool boxes and paint cans left on the planks, hanging lamps unlit; dim, calm, low contrast, blue-grey with a little orange.
PANEL 2 (bottom), A SECOND DEEP HALL LAYER, on green: silhouette-like machinery further back: a forest of tall pipes, a row of giant gears, a gantry crane, round tanks and a catwalk lattice, dim blue-grey with only two shades per material and a little orange trim; everything that is not machinery is flat green; the machinery is solid down to the bottom edge.`,
  },
};

// ---------- the prompts ----------
function rowPlan(s) {
  return s.rows.map((r, i) => `Row ${i + 1}, ${r.head} (every item in this row belongs to the group "${r.group}"), ${r.items.length} item${r.items.length > 1 ? 's' : ''}: ` + r.items.map(([n, d], k) => `${k + 1} "${n}" ${d}`).join('; ') + '.').join('\n');
}
export function promptOf(id) {
  const s = SHEETS2[id];
  if (s.panels) return `${WORLD}\n\nYou are drawing TWO BACKGROUND PANELS for the Bubbling Moon level of a side-view platformer, stacked in one picture.\n\n${PANEL_FORMAT}\n\n${s.prompt}\n\n${STYLE(refsOf(s))}\n(In this picture there are no sprites and no items on a ground line; ignore the lines about labels and items.)`;
  return `${WORLD}\n\n${s.pre ? s.pre + '\n\n' : ''}You are drawing a SPRITE SHEET for the Bubbling Moon level of a side-view platformer. Everything is seen strictly from the side (a 2D platformer; not isometric, not top-down).\n\n${FORMAT(3840, 2160)}\n\n${STYLE(refsOf(s))}\n\nROW PLAN (${s.rows.length} rows)\n${rowPlan(s)}`;
}
export const namesOf = () => Object.fromEntries(Object.entries(SHEETS2).map(([id, s]) => [id, s.panels ? s.panels.map(([n, opaque]) => ({ name: n, opaque })) : s.rows.map(r => r.items.map(([n]) => `${r.group}/${n}`))]));

// ---------- running ----------
const shrinkBox = (im, f) => {
  if (f === 1) return im;
  const w = Math.floor(im.width / f), h = Math.floor(im.height / f), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += im.data[((y * f + j) * im.width + x * f + i) * 4 + c]; out[(y * w + x) * 4 + c] = Math.round(s / (f * f)); }
  return { width: w, height: h, data: out };
};
const loadRefs = () => REFS.map(r => ({ name: r.name, png: toPNG(shrinkBox(fromPNG(readFileSync(join(REF, r.file))), r.shrink)) }));
const freeName = base => { let n = `${PREFIX}${base}.png`, i = 2; while (existsSync(join(REF, n))) n = `${PREFIX}${base}_${i++}.png`; return n; };

async function main(argv) {
  const opt = { quality: 'high', model: 'gpt-image-2.6-flare', dry: false }, names = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') opt.dry = true;
    else if (a === '--names') { writeFileSync(join(GAME, 'tools', 'bubblingmoon2_names.json'), JSON.stringify(namesOf(), null, 1) + '\n'); console.log('wrote tools/bubblingmoon2_names.json'); return; }
    else if (a === '--quality') opt.quality = argv[++i];
    else if (a === '--model') opt.model = argv[++i];
    else if (SHEETS2[a]) names.push(a);
    else throw new Error(`unknown argument "${a}" (sheets: ${Object.keys(SHEETS2).join(', ')})`);
  }
  const todo = names.length ? names : Object.keys(SHEETS2);
  mkdirSync(join(REF, 'prompts'), { recursive: true });
  const allRefs = loadRefs();
  for (const n of todo) {
    const s = SHEETS2[n], prompt = promptOf(n);
    if (opt.dry) { console.log(`--- ${n} (${prompt.length} characters)\n${prompt}\n`); continue; }
    let r = null, err = null;
    for (let t = 1; t <= 3 && !r; t++) {
      try { r = await generate({ prompt, refs: allRefs.filter(x => refsOf(s).some(y => y.name === x.name)), size: '3840x2160', transparent: false, model: opt.model, quality: opt.quality, retryMs: 8000 }); }
      catch (e) { err = e; console.log(`${n}: try ${t} failed: ${e.message}`); await new Promise(res => setTimeout(res, 5000)); }
    }
    if (!r) { console.log(`${n}: FAILED ${err && err.message}`); continue; }
    const file = freeName(n);
    writeFileSync(join(REF, file), r.png);
    writeFileSync(join(REF, 'prompts', file.replace(/\.png$/, '.json')), JSON.stringify({ file, sheet: n, title: s.title, date: new Date().toISOString(), model: r.model, params: r.params, requestId: r.requestId, usage: r.usage, references: refsOf(s).map(x => x.file), prompt }, null, 2) + '\n');
    console.log(`${n}: wrote ref/${file} (${(r.png.length / 1e6).toFixed(1)} MB, ${r.params.size}, ${r.model}, ${r.params.quality})`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
