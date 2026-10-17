# Fjordheim: notes

Keep this file current: the next Claude session reads it before changing the game.

## Design

The owner's brief: "a small rts game ... inspired by anno 1404 and settlers 6. No fighting, just build a base and leave
peacefully with nature. Build a homestead for a new family in the Viking Age in Scandinavia", in an isometric view.

- **Player**: chooses what to build and where. Nobody is ordered about: like in The Settlers, the family hands out the
  work by itself (`assignJobs` in `folk.js`, every half second).
- **Goal**: reach the second spring (four seasons of `daysPerSeason` days of `dayLength` seconds: 8 minutes by default).
- **Lost**: three hungry dawns in a row (not enough food for everyone), or three cold winter nights (no longhouse, or no
  wood for its hearth). The family sails home.
- **World**: a 30 × 30 tile valley (`world.js`, `genValley`, seed 7, the next seed after a loss). The fjord runs along
  the lower left edge, a beach above it, meadow and grass, forest to the upper right, a rocky hillside at the top.
- **Look**: the owner's Gemini sheets, cut by `tools/art.py`. The ground is drawn in the back wall with thin texture
  glyphs; everything standing on it is a sprite, drawn back to front (`engine/12_iso.js`).

## Who does what

Priority, for each adult: building (a worker leaves the hut and goes back after) → an empty workplace (woodcutter,
fisher, sawyer) → the farmer (if there is a field) → breaking stone → resting. The child picks lingonberries in summer
and autumn, else plays.

| Job | Output |
|---|---|
| woodcutter | a log per tree (about 10 s with the walk); plants a tree for every two logs |
| fisher | rows out for 12 s: 2 food, 3 with a drying rack |
| sawyer | a log into a plank every 6 s; in autumn and winter leaves 6 logs for the fire |
| farmer | sows fields in spring and summer, reaps when ripe (`harvest` food); breaks stone in between |
| stone | a stone per trip from the nearest rock (boulders hold 8, small rocks 3) |
| child | a berry per bush visit (3 a bush each summer) |

Buildings and costs are in `BUILDINGS` (`homestead.js`). The first newcomer comes by knarr when the longhouse has a free
bed and there are two days of food; later ones only to a homestead with a well. Food over `foodCap()` spoils (40, plus 60
per storehouse). The smithy makes all work a third faster.

## Balance (checked by `tests/playthrough.py`)

A sensible order (longhouse, woodcutter, fishing hut, two fields, sawpit, rack, a second woodcutter, well, storehouse,
smithy) ends the year with six people, every building done and no hungry or cold night; the forest at about 87% (the
deer need 85%). A player who builds nothing loses to the cold in the first winter. Starting food (16) lasts about six
days for three.

## Controls
See `game.json` "controls" (shown on the game list).
- **Mouse**: the building shows under the cursor and a click builds it; resting on a screen edge scrolls (`pointer()` in
  `main.js`, not `mouseAim()`, which forgets a cursor after 6 s still); right click or Esc cancels.
- **Touch** (`TOUCH()`: `Input.pointer`): there is no cursor, so the first tap on the map shows where the building would
  stand (`PEND`) and a second tap on the same spot builds it. Drag pans (a mouse can drag too). No on-screen arrows.
- Clicks and taps act on release (`'TapUp'`), so a drag never builds. The tap that starts the game is ignored on the map.
- The HUD's buttons (`hudButton`, `MENU`): the build bar, `[>>]` (time x3) and `[?]` (help) on the top row, `[CANCEL]`.
  On a touch screen the bar's rows are a row apart and each button takes taps a row and a column around it; the last
  row stays empty for the phone's gesture bar. Texts in boxes wrap to the screen (`wrapBox`): a phone has about 54 columns.

## Tunables
See `game.json` "tunables" (sliders in the web editor).
- `dayLength` 40 s: long enough to watch the work, short enough that a year takes 8 minutes.
- `daysPerSeason` 3: the winter is three nights, as many as it takes to lose.
- `startFood` 16: enough to build a hut for food before anyone is hungry, not enough to ignore food.
- `deerForest` 85%: two woodcutters all year thin the forest to about this.

## Art

`tools/art.py` (run it after changing a box): cuts the three sheets in `ref/` into `ref/frames/` (all 92 drawings, used
or not), writes `sprites.js` (the 70 used ones; characters share a palette per group) and `ref/ref.json` / `README.md`.
- Labels touching a drawing are masked with `drop` boxes (the smithy, the storehouse, the autumn birch, a deer, three
  fields): look at a contact sheet of `ref/frames/` after any change.
- `unpink`: the JPEG bled the raspberry background into the outlines; magenta-tinted palette colours become outline
  (dark) or transparent (light).
- `dense(pal, things=True)`: buildings, trees and goods get a dense glyph by material (thatch `%`, log walls `=`, stone
  `#` / `@`); people and animals keep `#`, `%`, `&`, `@`.
- `art.js` lifts every palette by a gamma of .8 and sizes sprites: people and trees by height (`HEIGHT`), buildings by
  their footprint's width.

## Decisions and known issues
- The world is static (no physics): the ground is the back wall, so lamps light it and nothing falls.
- Trees, rocks and buildings are cached sprites (`drawSprite` `cache`); people and animals are drawn fresh each frame.
- Not used yet from the sheets: the fence, goods (bread, firewood, iron, wool), the rams, the chopping block, the
  father chopping a log down, the black ravens. Sheep only wander.
- The ground at night and in winter is dim; buildings are readable but dark. A cell background colour in the engine
  would help both (roadmap, phase 4).
- No saving: a game is about 8 minutes.
