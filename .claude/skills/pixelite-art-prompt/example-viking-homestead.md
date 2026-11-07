# Example: the Viking homestead sheets (2026-10-16)

The game: a small, peaceful isometric settlement builder (inspired by Anno 1404 and The Settlers), set in Viking Age
Scandinavia. A family lands by ship and builds a homestead on a fjord, with short production chains (logs to planks,
stone, fish, barley to bread, wool, firewood). The aim is to get through the first winter in balance with nature. There
is no fighting. The owner first got a side-view prompt, then chose isometric; this is the isometric version, split into
two sheets because isometric buildings take about three times the area. How the sheets came back, and what that
changed in the rules: the lessons log in `SKILL.md` (2026-10-16).

Scale: a ground tile is a 64 × 32 image-pixel diamond (about 2 × 2 m); an adult (A) is 18 art pixels = 36 image pixels
tall; every art pixel is 2 × 2 image pixels. A footprint of a × b tiles is (a + b) × 32 px wide.

## Sheet 1: ground, buildings, nature, fields

| Row | Items (width px) | Widths + 24 px gaps | Height |
|---|---|---|---|
| 1 Ground | 6 swatch tiles × 64 | 384 + 120 = 504 | 32 |
| 2 Big buildings | longhouse 3 × 7 (320), smithy 2 × 3 (160), storehouse 2 × 2 (128), woodcutter's hut 2 × 2 (128) | 736 + 72 = 808 | 250 |
| 3 Small buildings | sawpit 2 × 3 (160), fishing hut 2 × 2 + rack 1 × 2 (224), well 1 × 1 (64), building site 2 × 2 (128), fence (64) | 640 + 96 = 736 | 130 |
| 4 Nature | pine 64, 3 birches 240, sapling 32, stump 40, felled log 96, boulder 64, rock 32, bush 40 | 608 + 216 = 824 | 196 |
| 5 Fields | barley patch 2 × 2, 4 stages × 128 | 512 + 72 = 584 | 80 |

Heights: 688, plus 5 labels of 16 and 6 gaps of 24, comes to 912 (limit about 950). 31 drawings.

## Sheet 2: people, animals, boats, goods (matched to sheet 1)

| Row | Items | Widths + gaps | Height |
|---|---|---|---|
| 1 Father | 15 frames of ~30 | 450 + 336 = ~790 | 36 |
| 2 Mother, child | 13 + 4 frames | 470 + 384 = ~850 | 36 |
| 3 Animals | sheep 4, deer 4, raven 2 | ~400 + 216 = ~620 | 48 |
| 4 Boats | knarr ~260, rowing boat ~110 | ~400 | 260 |
| 5 Goods | 9 items of ~28 | 252 + 192 = 444 | 28 |

Heights: 408, plus labels and gaps, comes to about 630. 55 drawings, but small ones.

## Prompt 1

```
Create a pixel-art sprite sheet for a peaceful isometric settlement game set in Viking Age Scandinavia (around 900 AD): a family builds a homestead on a fjord and lives in harmony with nature. No fighting: no weapons, armour or soldiers, and no horned helmets. This first sheet holds the ground, the buildings and the nature; the people come on a second sheet.

FORMAT
- One PNG image, 1536 x 1024, landscape.
- Background: one flat, solid magenta (#FF00FF) everywhere behind the sprites. No checkerboard, no scenery, no boxes or frames around items, no title, no legend.
- Follow the row plan below. Leave at least 24 pixels of empty magenta around every item; no item may touch another item or the edge of the image.
- Under each item, a short label in small plain white text, with a clear gap so it never touches or overlaps the sprite.

STYLE (important: a program converts this art into coloured ASCII characters)
- True pixel art on a fixed grid: every art pixel is a square block of 2 x 2 image pixels. Flat colours. No anti-aliasing, no gradients, no blur, no glow halos, no dithering, no drop shadows.
- Standard 2:1 pixel-art isometric: every edge that runs along the ground steps exactly 2 pixels across for 1 pixel up or down. NOT side view, NOT top-down, no perspective. The same camera corner for every item: we see the top, the left face and the right face.
- Ground tiles are flat diamonds of 64 x 32 image pixels. Every building and object stands exactly on a diamond footprint of whole tiles, given below as "a x b tiles", with no ground drawn around it.
- Light from the upper left: tops lightest, left faces middle, right faces darkest, on every item.
- A 1-art-pixel near-black outline (#1A1410) around every sprite. Use that near-black ONLY for outlines. No fill colour may be darker than #40382F: draw dark things (tarred wood, iron, shadowed doorways) in dark browns and greys, never black.
- 2-3 shades per material. No cast shadows on the ground, no smoke, no flames, no sparkles, no motion lines (the game adds its own light, shadow, smoke and fire).
- A muted, natural palette of about 32 colours: weathered pine and oak, tar-dark brown, green turf roofs on brown sod, golden straw, grey granite, white birch bark, iron grey, ember orange. No pink or magenta anywhere in the sprites.
- Thin parts (posts, branches, handles, ropes) at least 2 art pixels thick.
- No text, letters or runes inside the sprites.

SCALE: one scale for the whole sheet. A ground tile is a 64 x 32 diamond (about 2 x 2 metres). An adult person (A) would be 36 image pixels tall; heights below are given in A.

ROW 1, GROUND (one flat diamond tile each, 64 x 32)
- Grass, meadow with small flowers, bare tilled soil, beach sand, fjord water, snow.

ROW 2, BIG BUILDINGS (finished)
- Longhouse: 3 x 7 tiles, its long side running down to the right. Gently curved walls of vertical planks, a thick turf roof with a smoke hole, a door in the long side facing the viewer. Walls 1 A high, roof ridge 2.5 A.
- Smithy: 2 x 3 tiles, stone-and-turf, a glowing forge inside its open front, an anvil outside. 2 A high.
- Storehouse raised on short stilts (stabbur): 2 x 2 tiles, plank walls, turf roof. 2.5 A high.
- Woodcutter's hut: 2 x 2 tiles, turf roof, an axe stuck in a chopping block beside the door. 2 A high.

ROW 3, SMALL BUILDINGS
- Sawpit: an open-sided shed with a log resting on trestles, 2 x 3 tiles.
- Fishing hut, 2 x 2 tiles, with a wooden drying rack of hanging stockfish beside it, 1 x 2 tiles.
- Well with a stone rim, a wooden winch and a bucket, 1 x 1 tile.
- Building site: a stone foundation with a bare timber frame standing on it, half built, 2 x 2 tiles.
- Wattle fence segment (woven branches between posts) along one tile edge, running down to the right, so pieces can be joined.

ROW 4, NATURE (each on a 1 x 1 tile unless said)
- Pine tree, 5 A tall; birch tree, 4 A tall, three times: summer, autumn (yellow leaves) and bare in winter; a sapling (1 A); a tree stump; a felled log lying on the ground, 2 tiles long, running down to the right; a large grey granite boulder; a small rock; a lingonberry bush.

ROW 5, FIELDS
- Barley field, 2 x 2 tiles, in 4 stages: sprouts, green, ripe gold, harvested stubble.
```

## Prompt 2 (in the same chat, with sheet 1 attached)

```
Now a second sprite sheet for the same game. Match the attached first sheet exactly: the same 2:1 isometric camera corner, the same 64 x 32 ground tile, the same 2 x 2 pixel grid, the same near-black outline and the same palette.

Keep every rule from the first sheet: one PNG, 1536 x 1024; a flat, solid magenta (#FF00FF) background; the row plan below; at least 24 px of empty magenta around every item; small white labels under the items, clear of them; flat colours, no anti-aliasing, gradients, glow or shadows; near-black (#1A1410) only for outlines and no fill darker than #40382F; light from the upper left; no smoke, sparkles or motion lines; thin parts at least 2 art pixels thick; nothing see-through; no pink or magenta in the sprites; no text in the sprites.

Directions: everything that moves is drawn facing two ways, down-right (towards the viewer, "SE") and up-right (away from the viewer, "NE"). Never draw the left-facing directions: the game mirrors these. The frames of one animation are the same size, side by side in one row, standing on the same ground point, identical in colours and proportions.

SCALE: an adult (A) is 18 art pixels (36 image pixels) tall, the child 0.65 A.

ROW 1, THE FATHER (brown tunic, cream trousers, short beard)
- Standing, SE, 1 frame; walking SE, 4 frames; walking NE, 4 frames; chopping wood with an axe, SE, 2 frames (axe raised, axe struck down); walking with a log on his shoulder, SE, 2 frames, and NE, 2 frames.

ROW 2, THE MOTHER AND THE CHILD
- Mother (woad-blue apron dress over a cream underdress, head scarf): standing, SE, 1 frame; walking SE, 4 frames; walking NE, 4 frames; harvesting barley with a sickle, SE, 2 frames; walking with a basket, SE, 1 frame, and NE, 1 frame.
- Child (madder-red tunic): walking SE, 2 frames; walking NE, 2 frames.

ROW 3, ANIMALS
- Sheep (cream wool): walking SE, 2 frames; walking NE, 2 frames.
- Red deer stag: walking SE, 2 frames; walking NE, 2 frames.
- Raven flying, SE, 2 frames.

ROW 4, BOATS (drawn without any water, heading down to the right)
- Knarr trading ship with a red-and-white striped square sail, about 8 A long.
- Small rowing boat, about 3 A long, with the father at the oars.

ROW 5, GOODS (small, about 0.5 A each)
- Pile of logs, stack of planks, pile of stones, stack of firewood, sack of grain, bundle of dried fish, bundle of wool, iron bar, round flatbread.
```
