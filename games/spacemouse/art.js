// ===================== GAME · pixel art: Pip the space mouse, cheese, cat-bots and the station's objects =====================
// Engine sprite format (engine/10_sprite.js): '.' is empty, every other character indexes pal; pal entries are
// [r, g, b, ink (0 = outline), dense glyph]. All face right; drawSprite's flip turns them round.
// Everything here comes from the owner's art sheets (ref/) through tools/art.py, which writes sprites.js: the mouse in
// nineteen frames sharing one palette (origin at the feet under the helmet), the cat-bot in twelve (origin under its
// legs, with where its eyes are), the checkpoint, the great cheese, lamps, the alarm beacon and the props.
const MOUSE_K = .25;   // base units per sprite pixel: about 7 units tall, the helmet a little above the mouse's box
const MOUSE_SPR = {};
for (const k in MOUSE_FRAMES) { const f = MOUSE_FRAMES[k]; MOUSE_SPR[k] = defineSprite({ w: f.w, h: f.h, pal: MOUSE_PAL, rows: f.rows }, { k: MOUSE_K, ox: f.ox, oy: f.oy }); }
// props from the same sheets: they stand on the floor of their tile, or hang on the wall in its middle
const PROP_SPR = {};
for (const ch in PROP_ART) { const p = PROP_ART[ch]; PROP_SPR[ch] = defineSprite(p, { k: p.k, ox: p.w / 2, oy: p.place === 'floor' ? p.h : p.h / 2 }); }
// a crumb of cheese
const CHEESE_SPR = defineSprite(SPRITE_CHEESE, { k: .13, ox: SPRITE_CHEESE.w / 2, oy: SPRITE_CHEESE.h / 2 });

// The cat-bot: a grey robot cat with red eyes and an antenna tail, about as tall as the mouse (ears included).
// eye: where its eyes are, in base units from the origin (facing right), for the glow drawn over them.
const CAT_K = .19;
const CAT_SPR = {};
for (const k in CAT_FRAMES) {
  const f = CAT_FRAMES[k];
  CAT_SPR[k] = defineSprite({ w: f.w, h: f.h, pal: CAT_PAL, rows: f.rows }, { k: CAT_K, ox: f.ox, oy: f.oy });
  CAT_SPR[k].eye = f.eye && [(f.eye[0] + .5 - f.ox) * CAT_K, (f.eye[1] + .5 - f.oy) * CAT_K];
}

// The station's objects. The checkpoint stands on its tile's floor; lamps hang from the ceiling by their top edge; the
// alarm beacon is drawn upside down from the ceiling, so its origin is the middle of its base.
const objSprite = (a, ox, oy) => defineSprite(a, { k: a.k, ox, oy });
const CHECK_SPR = { off: objSprite(OBJ_ART.check_off, OBJ_ART.check_off.w / 2, OBJ_ART.check_off.h), on: objSprite(OBJ_ART.check_on, OBJ_ART.check_on.w / 2, OBJ_ART.check_on.h) };
const LAMP_SPR = { off: objSprite(OBJ_ART.lamp_off, OBJ_ART.lamp_off.w / 2, 0), on: objSprite(OBJ_ART.lamp_on, OBJ_ART.lamp_on.w / 2, 0) };
const ALARM_SPR = [OBJ_ART.alarm1, OBJ_ART.alarm2].map(a => objSprite(a, a.w / 2, a.h));
// the great cheese on its pedestal: sized to its sector's goal area when the sector is built (goalSprite in station.js)
const goalSprite = height => defineSprite(OBJ_ART.goal, { k: height / OBJ_ART.goal.h, ox: OBJ_ART.goal.w / 2, oy: OBJ_ART.goal.h });
