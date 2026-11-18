#!/usr/bin/env node
// Space Whiskers: art sheets made through the image API (one big picture with a bunch of items, cut up later).
//
//   NODE_USE_ENV_PROXY=1 node games/spacewhiskers/tools/sheets.mjs [names...] [--quality medium] [--model m] [--size 3840x2160] [--dry]
//
// Each sheet below is one call: the prompt (the game's look + the world of the chapter + the row plan), the owner's own pictures as
// style references (the props sheet, the shipyard scene, Pip's sprite sheet: they fix the pixel size, the outline and the colours), a flat
// magenta ground (the repository's rule for sheets, so a program can cut them: .claude/skills/pixelite-art-prompt). The result is kept
// untouched in ref/ (the reference-art rule), next to ref/prompts/<name>.json with what was sent and what the API said. A sheet that
// is already there is never overwritten: a new one gets _2, _3 ... Then tools/art.py lists the sheets in ref/ref.json and the README.
//
// The Bubbling Moon (STORY_V2 chapter 9, the review notes): milk lakes dried into a glossy white crust that mirrors the sky, giant
// Swiss-cheese craters (the pits), bubbles of old milk (bouncy platforms), a wobbling curd that drifts like a slow boat, and the old,
// half-finished cat pumping station that holds the pipe map. The level design and its puzzles: story/BUBBLING_MOON.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, defaultModel } from '../../../tools/art/gen/openai.mjs';
import { fromPNG, toPNG } from '../../../tools/art/image.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..'), REF = join(GAME, 'ref');
const PREFIX = 'bubblingmoon_';

// ---------- what every sheet shares ----------
const REFS = [
  { file: 'levelinspirationprops.png', shrink: 2, name: 'props_sheet.png', says: 'the game\'s existing props sheet (its green ground is NOT to be copied: yours is magenta)' },
  { file: 'levelinspiration.png', shrink: 1, name: 'shipyard_scene.png', says: 'a finished level scene: the look of the world, with background, platforms and foreground' },
  { file: 'pip.png', shrink: 1, name: 'pip_sprites.png', says: 'the hero, Pip the mouse astronaut: he is 49 art pixels tall, which fixes the scale of everything' },
];

const STYLE = `STYLE (a program cuts this picture into pixel-art sprites for a game, so follow it exactly)
- TRUE 16-bit (Super Nintendo style) pixel art on a strict fixed grid: every art pixel is a perfectly square, evenly coloured 4 x 4 block of image pixels, so every pixel can be counted by eye. Edges of shapes are clean staircases of whole square pixels: never smooth curves, never soft or noisy shading, never JPEG-like speckle, no anti-aliasing, no gradients, no blur, no glow halos, no dithering noise, no drop shadows, no cast shadows on the ground. Each shade is ONE exact flat colour; use only a small palette of about 32 colours for the whole picture, the same colour every time it is used.
- A clean, continuous, dark near-black-brown (#1A1410) outline exactly 1 art pixel (4 image pixels) thick round EVERY item, also round white, cream and pale items so they stand out from the magenta; used ONLY for outlines. No fill colour darker than #40382F. Inside the outline shade each material with 2 or 3 flat tones and a few hard-edged pixel highlights, like the references.
- Match the three attached reference pictures in pixel size, line weight, saturation and level of detail: ${REFS.map((r, i) => `(${i + 1}) ${r.says}`).join('; ')}.
- SCALE: Pip is 49 art pixels (196 image pixels) tall; everything is drawn at that same pixel size. Sizes below are in art pixels (width x height), only roughly.
- Glass, bubbles and windows are drawn in opaque pale colours with a white highlight: nothing is see-through, and nothing is drawn behind an item.
- No people, no mice, no cats in the pictures unless a line says so. No text inside the items except where a line gives the words.`;

const WORLD = `THE WORLD: the Bubbling Moon, a strange, silly and slightly sad moon in a children's game (never scary). Its milk lakes have dried into cracked, glossy white crust that mirrors the sky. Giant cheese craters full of Swiss-cheese holes are the pits. Bubbles of old milk pop up out of the ground on a slow beat, as if the moon had hiccups, and bounce things that land on them. A big wobbling curd drifts across the dry lake like a slow boat. The cats built an old, half-finished, high-tech milk pumping station here to drain the moon into pipes that run to their fortress. Palette: milk white, cream, butter yellow, cheese orange, pale lavender and blue-grey shadows, a little blue-green mould and a deep violet night sky. The cat machinery is the shipyard's steel grey with orange and yellow trim, rust, paw-print logos and coloured cables, as in the references.`;

const SHEET_FORMAT = (w, h) => `FORMAT
- One PNG, ${w} x ${h}, landscape. Background: ONE flat, solid, bright magenta (#FF00FF, pure pink-purple) everywhere behind the items. No checkerboard, no scenery, no ground strip, no frames or boxes round items, no title, no legend. NO pink, magenta or purple-pink anywhere inside the items (paw prints, cushions, noses and tongues are grey, brown, blue or cream instead).
- Follow the row plan below, rows from top to bottom, items from left to right, exactly the items listed (one drawing each, nothing extra, nothing missing). Items stand on a common ground line in their row. Leave at least 6 art pixels (24 image pixels) of empty magenta all round every item; no item may touch another item or the edge.
- Under each item a short label in small plain white text (catalogue style) with a clear gap between the label and the item above it and the tops of the items in the row below. Keep the labels short.`;

// ---------- the sheets ----------
export const SHEETS = {
  terrain: {
    title: 'Bubbling Moon props 1: ground and platforms, craters and holes, rocks, plants and ground decals',
    use: 'the level\'s ground and platforms (glossy thin crust that cracks, matte safe crust, floating chunks, Swiss-cheese ledges), the craters (pits) and holes, rocks and decals (not cut yet)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing a SPRITE SHEET of TERRAIN PIECES for the Bubbling Moon level of a side-view platformer. Everything is seen strictly from the side (profile, like a 2D platformer; not isometric, not top-down). Platform pieces have a perfectly flat, horizontal top surface the hero can stand on.

${SHEET_FORMAT('3840', '2160')}

${STYLE}

ROW PLAN (7 rows)
Row 1, PLATFORMS (long and thin, 110 to 200 x 14 to 24 each), 9 items: 1 "glossy crust" long slab of glossy white dried-milk crust, mirror-shiny top with a pale blue sheen; 2 "thin crust (cracks)" the same slab but thin, with a spiderweb of cracks and a bluer sheen (the player must see it is fragile); 3 "matte crust (safe)" a thick chalky matte white slab with no shine; 4 "crust with skin" a slab with curling dried-milk skin at one end; 5 "floating chunk L" a big chunk of crust with a rounded underside (about 90 x 36); 6 "floating chunk M" (60 x 28); 7 "floating chunk S" (36 x 20); 8 "swiss ledge" a butter-yellow Swiss-cheese slab with round holes and an orange rind edge; 9 "cheese wedge" a wedge of cheese lying flat with three steps up.
Row 2, GROUND BLOCKS (each about 48 to 64 square), 11 items: 1 "crust block" tileable ground block, glossy white top; 2 "crust block (crack)" the same with a crack; 3 "crust corner L" its left top corner; 4 "crust corner R" its right top corner; 5 "swiss block" tileable solid butter-yellow Swiss-cheese block with holes; 6 "swiss block (rind)" the same with an orange rind on top; 7 "swiss edge L"; 8 "swiss edge R"; 9 "milk stone" a chalky white block; 10 "slope up" a 45-degree crust slope rising to the right (64 x 32); 11 "slope down" its mirror image.
Row 3, CRATERS (side-view cutaway pits cut into the ground: dark cheese-yellow inside, Swiss holes in their walls, a lip of glossy crust on top), 7 items: 1 "pit S" (48 wide, 40 deep); 2 "pit M" (72 x 56); 3 "crater L" (140 x 70); 4 "crater lip" a crater with a thick rolled lip; 5 "crater cap L" the left end of a crater's rim; 6 "crater cap R" the right end; 7 "pit floor" the bottom of a pit with a mouldy floor and a bone-white crack.
Row 4, HOLES AND WALLS, 9 items: 1 "hole S" a round Swiss-cheese hole in a cheese wall (16 x 16, dark inside); 2 "hole M" (24 x 24); 3 "hole L" (a hole the hero fits in, 36 x 44); 4 "hole oval"; 5 "hole (drip)" a hole with a thread of milk running down from it; 6 "hole (rind lip)" a hole with an orange rind lip; 7 "cheese wall" a wall segment with three holes (64 x 80); 8 "tall wall" (48 x 120) with holes; 9 "wall cap" the top of a cheese wall with rind.
Row 5, ROCKS AND FORMATIONS, 11 items: 1 "boulder S" a cheese boulder with a few holes; 2 "boulder M"; 3 "boulder L"; 4 "stalagmite A" a pointed cheese stalagmite; 5 "stalagmite B"; 6 "stalactite A" hanging point (draw it hanging, tip down); 7 "stalactite B"; 8 "stalactite C"; 9 "milk spire" a tall chalky white rock spire; 10 "rind arch" a big arch of orange cheese rind with holes; 11 "crystals" a cluster of pale blue-white salt crystals.
Row 6, PLANTS AND SMALL DECOR, 11 items: 1 "mould A", 2 "mould B", 3 "mould C" low fuzzy blue-green mould patches on a little mound; 4 "dry moss A", 5 "dry moss B" tufts of dead grey-brown cheese moss; 6 "skin curl A", 7 "skin curl B" curls of dried milk skin; 8 "buried wheel" a cheese wheel half buried in the ground; 9 "crumbs" a pile of cheese crumbs; 10 "pebbles" three pebbles of milk stone; 11 "bone-white shell" a big spiral shell.
Row 7, GROUND DECALS (flat and low, 6 to 12 tall, drawn lying on the ground line), 11 items: 1 "crack A", 2 "crack B", 3 "crack C", 4 "crack D" thin pale-grey crack lines on the white crust; 5 "paws A", 6 "paws B", 7 "paws C" trails of grey-brown cat paw prints in dust (never pink); 8 "milk splat" a flat splat of spilled milk; 9 "mirror patch" a glossy flat patch that reflects the night sky (pale blue-white with tiny star dots); 10 "dust" a low pile of dust; 11 "whey puddle" a shallow thin puddle of yellowish whey.`,
  },

  milk: {
    title: 'Bubbling Moon props 2: milk bubbles, the curd boat, milk things, pickups and movables, signs',
    use: 'the bubble platforms (every state of the pop), the wobbling curd, milk churns and bottles, cheese pickups, pushable cheese wheels, the cardboard box and cat bed, signs (not cut yet)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing a SPRITE SHEET of MILK AND MOVABLE PROPS for the Bubbling Moon level of a side-view platformer. Everything is seen strictly from the side (profile, like a 2D platformer; not isometric, not top-down). Animation frames of one thing are the same size, side by side, on the same ground line.

${SHEET_FORMAT('3840', '2160')}

${STYLE}

ROW PLAN (6 rows)
Row 1, MILK BUBBLES (the bubbles are the hero's bouncy platforms; milky white with a cream rim and a bright white highlight, pale blue shadow), 12 items: 1 "bud" a tiny bubble just rising out of a crack in the ground (14 x 10); 2 "small" (24 x 24); 3 "medium" (40 x 40); 4 "large" a full, shiny bubble (64 x 64); 5 "squash" the large bubble squashed flat as if landed on (80 x 40); 6 "pop 1" the bubble bursting, first frame (a ragged ring); 7 "pop 2" the ring breaking into pieces; 8 "pop 3" a spray of opaque white milk drops; 9 "puddle" the puddle left after a pop; 10 "crack and ooze" a crack in white crust with milk oozing and a small bubble forming; 11 "cluster" three bubbles of different sizes touching; 12 "bubble with crumb" a glossy bubble with a cheese crumb trapped inside.
Row 2, THE CURD (a big wobbling lump of cream-white curd with a slightly yellow shine and a flat bottom, a bit like a jelly; it slides slowly over the dry lake like a boat; no face), 10 items: 1 "curd" resting shape (110 x 64); 2 "curd squash" squashed wide and low; 3 "curd stretch" stretched tall and narrow; 4 "curd tilt L" wobbling, tilted left; 5 "curd tilt R" tilted right; 6 "curd sail" the resting curd with a small sail made of a slice of orange cheese rind on a stick; 7 "curd small" a small curd blob (40 x 28); 8 "dock post" a steel mooring post with a paw-print ring, standing on the ground line; 9 "whey film" a long flat strip (120 x 8) of thin shiny yellowish whey that the curd glides on; 10 "curd chunk" a broken-off piece (24 x 18).
Row 3, MILK THINGS, 10 items: 1 "churn" an old steel milk churn with a paw-print logo, lid on (28 x 40); 2 "churn dented" a dented one with the lid off; 3 "bottle full" a glass milk bottle with a cardboard cap; 4 "bottle empty"; 5 "bottle crate" a crate of bottles (36 x 24); 6 "bucket" a metal bucket with milk; 7 "ladle" a big ladle; 8 "funnel"; 9 "drip" three frames in a row of a milk drop (forming on a pipe end, falling, splashing), labelled "drip 1" "drip 2" "drip 3" as one item group; 10 "pour" a vertical 8 x 32 stream of falling milk, tileable.
Row 4, PICKUPS AND MOVABLES, 14 items: 1 "crumb" a tiny cheese crumb (8 x 6); 2 "wedge" a cheese wedge (16 x 12); 3 "cube" a cheese cube; 4 "wheel S" a small cheese wheel (24 x 24), seen from the side; 5 "wheel L" a big pushable cheese wheel (36 x 36); 6 "crate" a wooden crate (32 x 32) with the cat paw stamp; 7 "box open" a cardboard box standing open, front view, big enough for a cat to sit in (44 x 28), with a paw stamp; 8 "box closed" the same box with its flaps shut; 9 "cat bed" a round cushion cat bed in blue-grey fabric with a cream paw print (40 x 14); 10 "yarn" a ball of red yarn; 11 "fish bone"; 12 "toy mouse" a small grey toy mouse on wheels (never pink); 13 "tin can"; 14 "sack" a small tied sack.
Row 5, SIGNS AND MARKERS, 12 items: 1 "thin crust" a warning sign: a red triangle with a cracked-ice symbol, on a post (24 x 40); 2 "arrow right" a signpost with an arrow; 3 "arrow down"; 4 "welcome" a half-painted wooden signpost reading "WELCOME TO THE BUBBLING MO" (the last letters unpainted); 5 "survey flag" an orange pennant on a stick with a paw; 6 "rope fence" two posts with a sagging rope; 7 "pump this way" a metal sign with a paw-arrow and the words "PUMP"; 8 "mind the holes" a sign with a hole symbol; 9 "closed" a hanging sign reading "CLOSED (BACK LATER)"; 10 "lamp post" a short steel lamp post with an orange lamp; 11 "survey tripod" a tripod with a surveying instrument; 12 "survey drone" a small round cat survey drone that has landed and stopped (28 x 24).
Row 6, LEFTOVERS OF THE BUILDERS (everything dusty, milk-stained and unfinished), 10 items: 1 "wheelbarrow" with a flat wheel; 2 "short ladder"; 3 "toolbox" open; 4 "hard hat" a cat-sized yellow hard hat with ear holes; 5 "mug" a mug with a paw; 6 "note" a sticky note pinned to a post reading "FINISH LATER"; 7 "broom"; 8 "tarp pile" a tarpaulin over a lump; 9 "paint can" a can of white paint with a brush; 10 "cat nap" an empty cat nap spot: a folded blanket on a crate.`,
  },

  station: {
    title: 'Bubbling Moon props 3: the pumping station: pipes, valves, controls, pumps, tanks, doors and the interior',
    use: 'the pumping station and its puzzles: pipes and the walkable main pipeline, valve wheels, levers, pressure plates, gauges, pumps and tanks, the pump housing (Pip\'s fuel tank), doors, the pipe map and its torn pieces, the plaque and the old photo (not cut yet)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing a SPRITE SHEET of PUMPING-STATION PROPS for the Bubbling Moon level of a side-view platformer: pipes, valves, controls, pumps, tanks, doors and the inside of the station. The cats built it: steel grey with orange and yellow trim, rust, paw-print logos and coloured cables, exactly like the pipes and machines in the first reference. It is high tech but HALF FINISHED, silly rather than scary: a pipe that stops in mid-air, a fan with only two blades, a wheel with its hub missing. Everything is seen strictly from the side (profile, like a 2D platformer; not isometric, not top-down). Pipes with a window show milk-white liquid inside.

${SHEET_FORMAT('3840', '2160')}

${STYLE}

ROW PLAN (8 rows)
Row 1, PIPES (each about 14 thick), 14 items: 1 "pipe S" a short straight horizontal pipe (48 long); 2 "pipe M" (96); 3 "pipe L" (160); 4 "pipe up S" a short vertical pipe; 5 "pipe up L" (96 tall); 6 "elbow NE", 7 "elbow NW", 8 "elbow SE", 9 "elbow SW" the four elbows; 10 "tee" a T junction; 11 "cross" a four-way junction; 12 "window pipe" a straight pipe with a round glass window showing white milk inside; 13 "open end" a pipe end with a flange and nothing coming out; 14 "unfinished" a pipe that simply stops in mid-air with bare bolt holes in its last flange.
Row 2, THE MAIN PIPELINE (a giant pipe, 40 thick, whose round top the hero can walk on; steel grey with orange bands, a row of rivets, a paw-print logo), 8 items: 1 "main L" straight (200 long); 2 "main M" (120); 3 "main up" a bend rising up to the right; 4 "main down" a bend falling to the right; 5 "main tee" a junction with a riser going up; 6 "main end" an open end with a flange (the milk used to come out here); 7 "main support" a tall A-frame support leg for the pipeline; 8 "main ladder" a vertical ladder with a cage, to climb onto the pipeline.
Row 3, VALVES AND CONTROLS, 14 items: 1 "wheel red", 2 "wheel blue", 3 "wheel yellow" three big valve wheels on a short pipe stub, with a little paw-print marking on the hub: ONE paw on the red, TWO paws on the blue, THREE paws on the yellow; 4 "lever up", 5 "lever down" a big lever switch in each position; 6 "button off", 7 "button on" a big round floor button with a paw, up and pressed down; 8 "plate up", 9 "plate down" a floor pressure plate with an orange paw, up and pressed; 10 "switchbox" a wall switch box with three toggles; 11 "gauge low" a round pressure gauge with a needle in the red zone; 12 "gauge ok" the needle in the green zone; 13 "gauge broken" a gauge with cracked glass and a hanging needle; 14 "hiccup lamp" a round red warning lamp on a bracket with the words "HIC".
Row 4, PUMPS AND TANKS, 12 items: 1 "main pump" the big pump engine, half built, with scaffolding still round it and a paw logo (110 x 90); 2 "pump housing" a rounded steel canister with a row of bolts, a valve on top and an orange band (40 x 50): this is a part the hero will take; 3 "tank full", 4 "tank half", 5 "tank empty" a round milk tank on legs with a sight glass showing the milk level (48 x 64); 6 "silo" a tall thin tank; 7 "piston 1", 8 "piston 2", 9 "piston 3" a piston pump in three frames (down, middle, up) of one stroke; 10 "bellows" a bellows, fully inflated; 11 "bellows flat" the same pressed flat; 12 "half fan" a big fan in a frame with only TWO of its four blades fitted (the other two mounts empty).
Row 5, DOORS AND ARCHITECTURE, 12 items: 1 "door shut" the station's main door, steel with a paw and orange stripes (40 x 56); 2 "door open"; 3 "shutter shut" a roll-up shutter; 4 "shutter open" rolled up; 5 "hatch" a round hatch in a floor; 6 "vent" a wall vent grate; 7 "ladder" a steel ladder (14 x 64); 8 "catwalk" a steel catwalk segment with a yellow rail (96 x 28); 9 "stairs" steel stairs going up to the right; 10 "porthole" a round window frame showing a patch of night sky; 11 "entrance" an entrance arch with a roof sign "PUMP No. 1"; 12 "scaffold" a section of scaffolding with a plank platform.
Row 6, THE INSIDE, 12 items: 1 "control desk" a desk of levers and dials; 2 "drafting table" a table with a half-rolled blueprint; 3 "notice board" a cork board with notes; 4 "pipe map" a large blueprint on a wall: a drawing of a network of pipes running from lakes to a fortress, pale blue paper with white lines (96 x 64); 5 "map piece 1", 6 "map piece 2", 7 "map piece 3", 8 "map piece 4" the same blueprint torn into four jigsaw-shaped pieces, shown separately; 9 "plaque" a bronze wall plaque reading "FIRST PUMPING DAY"; 10 "photo" a framed, faded sepia photo of a ribbon-cutting ceremony: tiny figures holding giant scissors, no clear faces, blurred (28 x 22); 11 "filing cabinet"; 12 "stopped clock" a wall clock stopped at ten past ten.
Row 7, LIGHTS AND HAZARDS, 10 items: 1 "ceiling lamp" an industrial hanging lamp, orange shade; 2 "work light" a lamp on a tripod; 3 "siren" a red rotating siren lamp on a bracket; 4 "hazard stripes" a yellow and black striped panel; 5 "hazard sign" a diamond sign with a cat head; 6 "cables A", 7 "cables B" bundles of coloured cables looping down; 8 "steam vent" a vent cap on a pipe; 9 "cone" a traffic cone; 10 "bolts" a loose pile of nuts and bolts.
Row 8, TOOLS AND SMALL THINGS, 10 items: 1 "wrench", 2 "big wrench", 3 "oil can", 4 "toolbox", 5 "hose coil", 6 "spare wheel" a spare valve wheel with no hub, 7 "gasket" a big round gasket ring, 8 "cork" a huge cork bung, 9 "plunger", 10 "red yarn" a ball of red yarn jammed in a pipe flange.`,
  },

  bg_outdoor_1: {
    title: 'Bubbling Moon backgrounds, outdoors 1: the sky (top) and the far layer of cheese mountains (bottom)',
    use: 'the slowest background layers of the outdoor zones: the night sky (opaque, repeats sideways) and the far hazy mountains (on magenta, repeats sideways)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing TWO BACKGROUND PANELS for the outdoor parts of the Bubbling Moon level of a side-view platformer, stacked in one picture. The game screen is 480 x 270 art pixels; each panel below is two screens wide (960 x 270 art pixels = 3840 x 1080 image pixels), so it scrolls sideways slowly behind the action. EACH PANEL MUST REPEAT SEAMLESSLY: its left edge continues exactly into its right edge, with no feature cut at the edges.

FORMAT
- One PNG, 3840 x 2160, landscape: the TOP panel fills the top 1080 rows, a 0-pixel gap, the BOTTOM panel fills the bottom 1080 rows. No labels, no title, no frame.

PANEL 1 (top), THE SKY: a full, opaque night sky, no ground and no horizon objects at all. Deep violet-blue at the top going to a lighter lavender-blue at the bottom, in 6 to 8 flat bands with a hard pixel step between bands (no gradient). Scattered stars of 1 to 2 art pixels in white and pale yellow, a few bigger four-point stars. A thin, faint, BROKEN Milky Way band crossing diagonally: it is fading, patchy, a ghost of what it was. A large pale planet with rings far away on one side and two small moons. A sad, quiet, beautiful sky.

PANEL 2 (bottom), THE FAR LAYER: distant hazy mountains and mesas made of cheese and chalky milk-stone, in soft pale lavender and blue-grey with a little butter yellow on their lit upper-left faces, mostly flat colour with a few Swiss-cheese holes on them; a few long thin pipelines far away running along their feet. Everything above the mountains is flat magenta (#FF00FF) so a program can cut the layer out; the bottom 30 percent of the panel is solid filled mountain colour all the way to the bottom edge. Skyline silhouette top: broken and varied, high peaks and low saddles, never a straight line.

${STYLE}
(In this picture the ONLY magenta is the empty space above the far mountains in panel 2. There are no sprites and no items on a ground line here; ignore the lines about labels and items.)`,
  },

  bg_outdoor_2: {
    title: 'Bubbling Moon backgrounds, outdoors 2: the middle layer with the far pumping station (top) and the near rock layer (bottom)',
    use: 'the middle and near background layers of the outdoor zones (on magenta, repeat sideways)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing TWO BACKGROUND PANELS for the outdoor parts of the Bubbling Moon level of a side-view platformer, stacked in one picture. The game screen is 480 x 270 art pixels; each panel below is two screens wide (960 x 270 art pixels = 3840 x 1080 image pixels), so it scrolls sideways behind the action, slower than the platforms. EACH PANEL MUST REPEAT SEAMLESSLY: its left edge continues exactly into its right edge, with no feature cut at the edges.

FORMAT
- One PNG, 3840 x 2160, landscape: the TOP panel fills the top 1080 rows, the BOTTOM panel the bottom 1080 rows. No labels, no title, no frame. Everything that is not part of a layer is flat magenta (#FF00FF) so a program can cut the layers out. The only magenta in the layers themselves must be none.

PANEL 1 (top), THE MIDDLE LAYER: a wide plain of rolling cheese hills and Swiss-cheese craters seen from afar, with the dried milk lakes between them as long flat glossy white-blue crust (mirror-like, with a pale reflection of the sky), thin cracks, a few bubbles of milk caught in the act of rising. In the middle distance the old half-finished cat PUMPING STATION as a small silhouette-like building (grey and orange, one scaffold crane, three round tanks, a smoke-free stack) with a thick PIPELINE running from it along the plain to the horizon on tall legs. A few tiny lights. Colours are mid-value and hazier than the foreground: butter yellow, cream, lavender, blue-grey. The layer's top edge is its own skyline (flat magenta above it); the bottom 25 percent is solid filled ground colour down to the bottom edge.

PANEL 2 (bottom), THE NEAR LAYER (just behind the platforms the hero walks on): big dark-ish blue-lavender and butter-yellow cheese cliffs and rock spires on the left and right sides of the panel with large round Swiss-cheese holes (some of them showing the sky through), a cheese arch, stalactites hanging from the top edge of the panel, two enormous pipes crossing diagonally through the rock, a couple of hanging cable loops. The middle of the panel stays more open (so the action is readable). Slightly darker and more saturated than panel 1, with strong 3-shade modelling. Everything not part of the rock and pipes is flat magenta (#FF00FF); the rock at the bottom edge is solid down to the bottom of the panel.

${STYLE}
(In this picture there are no sprites and no items on a ground line; ignore the lines about labels and items.)`,
  },

  bg_station: {
    title: 'Bubbling Moon backgrounds, inside the pumping station: the back wall (top) and the deep machine hall layer (bottom)',
    use: 'the interior backgrounds of the pumping station (the wall is opaque and repeats sideways, the deep layer is on magenta)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing TWO BACKGROUND PANELS for the INSIDE of the half-finished cat pumping station of the Bubbling Moon level of a side-view platformer, stacked in one picture. The game screen is 480 x 270 art pixels; each panel is two screens wide (960 x 270 art pixels = 3840 x 1080 image pixels). EACH PANEL MUST REPEAT SEAMLESSLY: its left edge continues exactly into its right edge, with no feature cut at the edges.

FORMAT
- One PNG, 3840 x 2160, landscape: the TOP panel fills the top 1080 rows, the BOTTOM panel the bottom 1080 rows. No labels, no title, no frame.

PANEL 1 (top), THE BACK WALL: a full, opaque picture of the inside wall of a big pump hall, dim and calm (it stays behind everything). Riveted steel wall panels in blue-grey with orange and yellow trim, a horizontal rib every 60 art pixels, long pipes and cables running along the wall with valves and gauges, a few round portholes and one big round window showing the dry white moon and a thin night sky, scaffolding along part of the wall, a big paw-print logo, and a HALF-FINISHED look: the left half of the wall painted and neat, the right half still bare primer grey with pencil guidelines and a ladder left standing. Lamps hang from the ceiling but are not lit; the light is dim and bluish. Calm, low contrast, so the hero and the props stand out.

PANEL 2 (bottom), THE DEEP HALL LAYER (further back than panel 1's wall but drawn in front of it, a silhouette-like layer): huge milk tanks and silos, tall pipe columns, a girder lattice with catwalks, a crane arm, a tangle of pipes, in dim blue-grey with a little orange trim and only two shades per material, a hint of rim light from the upper left. Everything that is not part of the machinery is flat magenta (#FF00FF); machinery is solid at the bottom edge.

${STYLE}
(In this picture there are no sprites and no items on a ground line; ignore the lines about labels and items. The only magenta is the empty space in panel 2.)`,
  },

  fg_outdoor: {
    title: 'Bubbling Moon foregrounds, outdoors: big pieces that pass in front of the hero',
    use: 'the front pass of the outdoor zones: pieces drawn in front of the action (hanging stalactites with drips, corner rocks with holes, a pipe crossing the screen, bubbles, mould, mist banks, cables); the hero walks behind them (not cut yet)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing a SPRITE SHEET of FOREGROUND PIECES for the outdoor parts of the Bubbling Moon level of a side-view platformer. These are drawn IN FRONT of the hero, so they are larger and a bit darker and more saturated than the props, with strong simple shapes, and they sit at the edges of the screen (the hero walks behind them). Seen strictly from the side. Use the dark violet-blue and butter yellow of the night-time moon for the shading.

${SHEET_FORMAT('3840', '2160')}

${STYLE}

ROW PLAN (5 rows)
Row 1, HANGING FROM THE TOP EDGE (draw them hanging, attached at their top), 8 items: 1 "stalactite A" a big cheese stalactite (60 x 120) with a milk drop forming at its tip; 2 "stalactite B" (40 x 90); 3 "stalactite C" a cluster of three (120 x 100); 4 "rind drape" a curtain of orange cheese rind and dried milk skin hanging down (100 x 80); 5 "pipe end drip" a broken pipe hanging from the top with a thread of milk running down (40 x 140); 6 "cables" a loop of three coloured cables hanging (110 x 70); 7 "hole rock top" a ceiling lump of cheese with big round holes (150 x 70); 8 "lamp" a dark hanging work lamp on a chain, unlit (30 x 80).
Row 2, CORNER PIECES (large, meant for the bottom corners of the screen, each about 200 x 100), 6 items: 1 "corner rock L" a mound of Swiss cheese rock with big holes, rising at the left; 2 "corner rock R" its mirror, rising at the right; 3 "corner crust L" a mound of glossy cracked white crust with a few bubbles; 4 "corner crust R" its mirror; 5 "corner pipes L" a heap of fat tangled pipes and a valve wheel; 6 "corner pipes R" its mirror.
Row 3, TALL PIECES (meant for the left and right edges of the screen, 40 to 70 x 160 to 220), 6 items: 1 "pillar A" a tall cheese-stone pillar with holes; 2 "pillar B" a leaning spire of milk stone; 3 "pipe up A" a fat vertical pipe with flanges and a dripping joint; 4 "pipe up B" two pipes side by side with a valve; 5 "pylon" a steel pylon with a dead lamp; 6 "dead tree" a bare, dried cheese tree trunk with two dry branches.
Row 4, BIG LOW SHAPES (to cross the bottom of the screen), 6 items: 1 "pipe across" a fat pipe crossing the whole picture slightly diagonally (300 x 60) with orange bands; 2 "bubble A" a big milk bubble, milky white with a white highlight (80 x 80); 3 "bubble B" (50 x 50); 4 "bubble group" three bubbles of different sizes (130 x 90); 5 "mould bank" a bank of fuzzy blue-green mould (200 x 40); 6 "crack front" a big glossy crust slab with a crack, a low foreground ledge (240 x 50).
Row 5, SOFT THINGS, drawn in flat opaque pale colours (the game will fade them), 5 items: 1 "mist A" a long low bank of mist (360 x 60) as 3 or 4 flat stacked pale lavender-white bands with hard pixel steps; 2 "mist B" (240 x 50); 3 "milk fog" a rounded cloud of pale cream fog (160 x 80); 4 "dust drift" a low drift of fine dust; 5 "cobweb" a corner cobweb of white thread (90 x 90) for the top-left corner.`,
  },

  fg_station: {
    title: 'Bubbling Moon foregrounds, inside the pumping station: big pieces that pass in front of the hero',
    use: 'the front pass inside the pumping station: close pipes, cables, beams, railings, dark machine edges, vents (not cut yet)',
    size: '3840x2160',
    prompt: `${WORLD}

You are drawing a SPRITE SHEET of FOREGROUND PIECES for the INSIDE of the half-finished cat pumping station of the Bubbling Moon level of a side-view platformer. These are drawn IN FRONT of the hero, so they are larger and darker than the props, in dim blue-grey and deep violet with only two or three shades per material and a little orange trim, strong simple shapes; they sit at the edges of the screen (the hero walks behind them). Seen strictly from the side.

${SHEET_FORMAT('3840', '2160')}

${STYLE}

ROW PLAN (5 rows)
Row 1, HANGING FROM THE CEILING (draw them hanging, attached at their top), 8 items: 1 "pipe bundle" a bundle of four fat pipes coming down and bending away (80 x 140); 2 "cables A" three thick looping cables (110 x 80); 3 "cables B" a tangle of cables and a plug (80 x 120); 4 "chain" a heavy chain with a hook (24 x 150); 5 "lamp dark" a big unlit industrial lamp; 6 "duct" a square ventilation duct with a grate (140 x 60); 7 "girder" a short hanging steel girder with rivets (200 x 32); 8 "cobweb" a corner cobweb of white thread (90 x 90).
Row 2, THE BOTTOM EDGE (large, each about 200 x 100), 6 items: 1 "machine L" the dark edge of a big machine with a gear and a lever, rising at the left; 2 "machine R" its mirror; 3 "tank L" the curved top of a big round tank with rivets and a valve; 4 "tank R" its mirror; 5 "crates L" a stack of crates with a paw stamp and a tarpaulin; 6 "crates R" its mirror.
Row 3, TALL PIECES (for the left and right edges, 40 to 70 x 160 to 220), 6 items: 1 "beam A" a tall steel I-beam column with rivets and orange trim; 2 "beam B" a column with a ladder fixed to it; 3 "pipe up A" a fat vertical pipe with flanges and a dripping joint; 4 "pipe up B" two pipes side by side with a valve wheel; 5 "scaffold" a tall scaffold tower with planks; 6 "cable drum" a giant cable drum on its side.
Row 4, LOW SHAPES (to cross the bottom of the screen), 6 items: 1 "railing" a long railing with posts (300 x 40); 2 "rail corner" a railing corner post; 3 "pipe across" a fat pipe lying across the floor in front (300 x 50) with a valve; 4 "cable trunk" a thick cable trunking with a ramp over it (200 x 30); 5 "hazard ramp" a yellow-black striped ramp; 6 "bucket line" three buckets catching drips in a row (140 x 30) with milk in them.
Row 5, SOFT THINGS, in flat opaque pale colours (the game will fade them), 5 items: 1 "steam A" a low drift of steam (flat stacked pale bands, hard pixel steps); 2 "steam B"; 3 "dust beam" a slanting beam of dusty light from a window (flat pale yellow bands, 80 x 200); 4 "vent grille" a floor vent with steam; 5 "milk haze" a low haze of cream fog.`,
  },
};

// ---------- running ----------
const shrinkBox = (im, f) => {   // an f x f box average: a big reference costs fewer input tokens and shows the same pixels
  if (f === 1) return im;
  const w = Math.floor(im.width / f), h = Math.floor(im.height / f), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += im.data[((y * f + j) * im.width + x * f + i) * 4 + c];
    out[(y * w + x) * 4 + c] = Math.round(s / (f * f));
  }
  return { width: w, height: h, data: out };
};
const loadRefs = () => REFS.map(r => ({ name: r.name, png: toPNG(shrinkBox(fromPNG(readFileSync(join(REF, r.file))), r.shrink)) }));
const freeName = base => { let n = `${PREFIX}${base}.png`, i = 2; while (existsSync(join(REF, n))) n = `${PREFIX}${base}_${i++}.png`; return n; };

async function main(argv) {
  const opt = { quality: 'medium', model: defaultModel, size: null, dry: false }, names = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') opt.dry = true;
    else if (a === '--quality') opt.quality = argv[++i];
    else if (a === '--model') opt.model = argv[++i];
    else if (a === '--size') opt.size = argv[++i];
    else if (SHEETS[a]) names.push(a);
    else throw new Error(`unknown argument "${a}" (sheets: ${Object.keys(SHEETS).join(', ')})`);
  }
  const todo = names.length ? names : Object.keys(SHEETS);
  mkdirSync(join(REF, 'prompts'), { recursive: true });
  const refs = loadRefs();
  for (const n of todo) {
    const s = SHEETS[n], size = opt.size || s.size;
    if (opt.dry) { console.log(`--- ${n} (${size}, ${opt.quality}, ${opt.model}, ${refs.length} references: ${refs.map(r => `${r.name} ${(r.png.length / 1e6).toFixed(1)} MB`).join(', ')})\n${s.prompt}\n`); continue; }
    let r = null, err = null;
    for (let t = 1; t <= 3 && !r; t++) {
      try { r = await generate({ prompt: s.prompt, refs, size, transparent: false, model: opt.model, quality: opt.quality, retryMs: 8000 }); }
      catch (e) { err = e; console.log(`${n}: try ${t} failed: ${e.message}`); await new Promise(res => setTimeout(res, 5000)); }
    }
    if (!r) throw err;
    const file = freeName(n);
    writeFileSync(join(REF, file), r.png);
    writeFileSync(join(REF, 'prompts', file.replace(/\.png$/, '.json')), JSON.stringify({ file, sheet: n, title: s.title, date: new Date().toISOString(), model: r.model, params: r.params, requestId: r.requestId, usage: r.usage, references: REFS.map(x => x.file), prompt: s.prompt }, null, 2) + '\n');
    console.log(`${n}: wrote ref/${file} (${(r.png.length / 1e6).toFixed(1)} MB, ${r.params.size}, ${r.model}, ${r.params.quality}) usage ${JSON.stringify(r.usage)}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
