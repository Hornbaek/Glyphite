// ===================== GAME · the lander, drawn from its pixel-art sprite =====================
// The engine's sprite renderer does the work (engine/10_sprite.js). The two legs are separate
// parts of the sprite: each one slides up its strut as its damper compresses, and the footpad
// soles count as paint so the pads sit right on the ground.
const LANDER_SPRITE = defineSprite(SPRITE_LANDER, {
  k: .28, ox: 24, oy: 28,   // base units per sprite pixel; origin = centre of mass
  // legs: the struts and pads below the knuckles (0 body, 1 left leg, 2 right leg)
  part: (c, r) => r >= 36 && c <= (r === 36 ? 9 : 12) ? 1 : r >= 36 && c >= (r === 36 ? 38 : 35) ? 2 : 0,
  paint: (c, r, p) => p && r >= SPRITE_LANDER.h - 2
});
const _lmShift = [0, 0, 0, 0], _lmOpt = { shift: _lmShift, foot: 0 };
// leg offsets and the foot line for the lander's current compression
function landerSpriteOpts(b) {
  _lmShift.fill(0);
  let foot = LEG0.fy * RES;
  if (L && L.body === b) {
    for (const leg of L.legs) { const [ux, uy] = legDir(leg.side), o = leg.side < 0 ? 0 : 2; _lmShift[o] = ux * leg.c; _lmShift[o + 1] = uy * leg.c; }
    foot -= (L.legs[0].c + L.legs[1].c) * .5 * legDir(1)[1];
  }
  _lmOpt.foot = foot;
  return _lmOpt;
}
function drawLanderArt(b) { drawSprite(LANDER_SPRITE, b.x, b.y, b.a, landerSpriteOpts(b)); }
function markLanderDyn(b) { return markSpriteDyn(LANDER_SPRITE, b.x, b.y, b.a, landerSpriteOpts(b)); }
