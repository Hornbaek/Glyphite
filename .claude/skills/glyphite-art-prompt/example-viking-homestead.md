# Example: the Viking homestead sheet (2026-10-16)

The game: a small, peaceful side-view settlement builder (inspired by Anno 1404 and The Settlers), set in Viking Age
Scandinavia. A family lands by ship and builds a homestead on a fjord, with short production chains (logs to planks,
stone, fish, barley to bread, wool, firewood). The aim is to get through the first winter in balance with nature. There
is no fighting.

## Budget

A = the adult's height = 24 art pixels = 48 image pixels (2 × 2 blocks). Sizes are in image pixels.

| Row | Items | Widths + 24 px gaps | Height |
|---|---|---|---|
| 1 People | 17 frames: father 8, mother 7, child 2 | ~510 + 384 = ~900 | 48 |
| 2 Buildings | longhouse 384, storehouse 72, woodcutter's hut 120, sawpit 120, smithy 120, fishing hut + rack 192, well 48 | 1056 + 144 = 1200 | 120 |
| 3 Nature | pine 96, 3 birches 288, sapling 24, stump 29, felled log 144, boulder 96, rock 29, bush 48 | 754 + 216 = 970 | 240 |
| 4 Animals, fields | sheep 2 × 43, deer 2 × 67, raven 2 × 29, barley 4 × 96 | 662 + 216 = 878 | 62 |
| 5 Boats, building | knarr 384, rowing boat 144, fence 96, building site 144 | 768 + 72 = 840 | 168 |
| 6 Goods | 9 items of ~30 | 270 + 192 = 462 | 24 |

Heights: 662, plus 6 labels of 16 and 7 gaps of 24, comes to 926, under the 950 limit. 55 drawings.

## The prompt

```
Create a pixel-art sprite sheet for a peaceful 2D side-view settlement game set in Viking Age Scandinavia (around 900 AD): a family builds a homestead on a fjord and lives in harmony with nature. No fighting: no weapons, armour or soldiers, and no horned helmets.

FORMAT
- One PNG image, 1536 x 1024, landscape.
- Background: one flat, solid magenta (#FF00FF) everywhere behind the sprites. No checkerboard, no scenery, no ground strip, no boxes or frames around items, no title, no legend.
- Follow the row plan below. Leave at least 24 pixels of empty magenta around every item; no item may touch another item or the edge of the image.
- Under each item, a short label in small plain white text, with a clear gap so it never touches or overlaps the sprite.

STYLE (important: a program converts this art into coloured ASCII characters)
- True pixel art on a fixed grid: every art pixel is a square block of 2 x 2 image pixels. Flat colours. No anti-aliasing, no gradients, no blur, no glow halos, no dithering, no drop shadows.
- Strictly side view (profile, like a 2D platformer). NOT isometric, NOT top-down. Every item stands on an invisible flat ground line at its bottom edge.
- A 1-art-pixel near-black outline (#1A1410) around every sprite. Use that near-black ONLY for outlines. No fill colour may be darker than #40382F: draw dark things (tarred wood, iron, raven feathers, shadowed doorways) in dark browns and greys, never black.
- Soft light from the upper left, 2-3 shades per material. No cast shadows on the ground, no smoke, no flames, no sparkles, no motion lines, no sweat drops (the game adds its own light, shadow, smoke and fire).
- Nothing is see-through, and nothing (no wall, no scenery) is drawn behind a character.
- A muted, natural palette of about 32 colours: weathered pine and oak, tar-dark brown, green turf roofs on brown sod, golden straw, grey granite, white birch bark, iron grey, ember orange, and wool clothing in madder red, woad blue, weld yellow, undyed cream and brown. No pink or magenta anywhere in the sprites.
- Thin parts (legs, tails, antlers, axe handles, oars, ropes) at least 2 art pixels thick.
- Everything that moves faces RIGHT. The frames of one animation are the same size, side by side in one row, on the same ground line, and identical in colours and proportions.
- No text, letters or runes inside the sprites.

SCALE: one scale for the whole sheet. An adult (A) is 24 art pixels (48 image pixels) tall; every size below is given in A.

ROW 1, PEOPLE (adults 1 A tall, the child 0.65 A)
- Father (brown tunic, cream trousers, short beard): walk cycle, 4 frames; chopping wood with an axe, 2 frames (axe raised, axe struck down); walking with a log on his shoulder, 2 frames.
- Mother (woad-blue apron dress over a cream underdress, head scarf): walk cycle, 4 frames; harvesting barley with a sickle, 2 frames; walking with a basket, 1 frame.
- Child (madder-red tunic): walk cycle, 2 frames.

ROW 2, BUILDINGS (finished, each on its ground line)
- Longhouse: long, gently curved walls of vertical planks, a thick turf roof with a smoke hole, a door in the long side. 8 A long, 2.5 A high: the biggest item on the sheet.
- Storehouse raised on short stilts (stabbur), plank walls, turf roof. 1.5 A wide, 2 A high.
- Woodcutter's hut with an axe stuck in a chopping block outside. 2.5 A wide.
- Sawpit: an open-sided shed with a log resting on trestles. 2.5 A wide.
- Smithy: a small stone-and-turf hut with a glowing forge inside its open front, an anvil outside. 2.5 A wide.
- Fishing hut with a wooden drying rack of hanging stockfish beside it. 4 A wide together.
- Well with a stone rim, a wooden winch and a bucket. 1 A wide.

ROW 3, NATURE
- Pine tree, 5 A tall; birch tree, 4 A tall, three times: summer, autumn (yellow leaves) and bare in winter; a sapling (1 A); a tree stump; a felled log lying on the ground (3 A long); a large grey granite boulder (2 A wide); a small rock; a lingonberry bush.

ROW 4, ANIMALS AND FIELDS
- Sheep (cream wool), 2 walk frames; red deer stag, 2 walk frames; raven flying, 2 frames.
- Barley field strip, 2 A wide, in 4 stages: sprouts, green, ripe gold, harvested stubble.

ROW 5, BOATS AND BUILDING
- Knarr trading ship with a red-and-white striped square sail, 8 A long, drawn without any water.
- Small rowing boat with the father at the oars, 3 A long, without water.
- Wattle fence segment (woven branches between posts), 2 A wide, that can repeat side by side.
- Building site: a stone foundation with a bare timber frame standing on it, half built, 3 A wide.

ROW 6, GOODS (small, about 0.5 A each)
- Pile of logs, stack of planks, pile of stones, stack of firewood, sack of grain, bundle of dried fish, bundle of wool, iron bar, round flatbread.
```
