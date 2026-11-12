// ===================== GAME · the look: hills, grass, the day, the weather (engine plan E1 to E8) =====================
// The engine's look packages in one place. The hills (backdrops, E5), the grass the hero walks behind (the front pass, E5) and the torches' glowing flames (E3) are always
// there; the day and night, the weather, the wind, the fog and the screen look are tunables (game.json), all off by default so the level plays as it always did. The
// zoom (E7) is the mouse wheel and a pinch (`zoom` in Pixelite.run).
const GB4 = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#05070c'];   // four greens and the background colour (a palette needs the background in it)
const LOOK_KEYS = new Set(['daylight', 'hour', 'dayRate', 'weather', 'wind', 'fog', 'look']);
const daylightNow = () => TUNE.daylight ? getTimeOfDay().daylight : 1;   // 0 at night, 1 by day; 1 when the clock is off
const nightNow = () => 1 - daylightNow();

// the hills: two layers, the far one bluer and slower. They are painted, not lit, so they follow the hour themselves (their `key` makes them rebuild as it changes)
function lookBackdrops() {
  const tc = MAP.tc, S = RES, row = GROUND * tc;
  const hills = (par, amp, freq, col, seed) => addBackdrop({
    parallax: par, horizon: row,
    key: () => Math.round(daylightNow() * 16),
    paint(gx, dy, out) {
      const x = gx / S, top = -(amp + .55 * amp * Math.sin(x * freq + seed) + .3 * amp * Math.sin(x * freq * 2.7 + seed * 2)) * S;
      if (dy < top) return 0;
      const d = .22 + .78 * daylightNow(), shade = 1 - .35 * Math.min(1, (dy - top) / (14 * S));
      out[0] = col[0] * d * shade; out[1] = col[1] * d * shade; out[2] = col[2] * d * shade; return SOLID;
    }
  });
  hills(.12, 9, .021, [.34, .5, .62], 1.3);   // far: lower, lighter, hazier
  hills(.32, 5, .036, [.2, .4, .36], 4.1);    // near: lower still, and greener
}

// the grass, in the front pass: it stands on the plain rock of the ground and the hero walks behind it. It leans with the wind
const GRASS_PAL = [[40, 104, 52, 1], [84, 168, 70, 1], [150, 220, 108, 1]];
const GRASS = [['.2.2.', '.1.1.', '01101', '00100'], ['2.2..', '.1.1.', '01.01', '00100'], ['..2.2', '.1.1.', '10.10', '00100']]
  .map(rows => defineSprite({ w: 5, h: 4, pal: GRASS_PAL, rows }, { k: .5, ox: 2.5, oy: 4 }));
function lookFront(t) {
  if (!colTop) return;
  const S = RES, x0 = Math.max(0, Math.floor(cam.x / 3) * 3), x1 = Math.min(W - 1, Math.floor(cam.x + R.cols)), lean = WIND.speed ? Math.sign(WIND.speed) : 0, minRow = GROUND * MAP.tc - 2;
  for (let x = x0; x <= x1; x += 3) {
    const top = colTop[x]; if (top < minRow || top >= H || cells[top * W + x] !== ROCK || getC(x, top - 1) !== EMPTY) continue;
    const v = lean ? (lean > 0 ? 2 : 1) : Math.sin(t * 1.6 + x * .31) > .55 ? 1 + (x % 2) : 0;   // a breeze now and then
    drawSprite(GRASS[v], x + 1 + (x * 7 % 3) * .4, top * ASPECT, 0, { cache: true });
  }
}

// the tunables: the clock, the weather, the wind, the fog and the screen look
function applyLook() {
  if (TUNE.daylight) { setTimeOfDay(TUNE.hour, { rate: TUNE.dayRate, sunrise: 6, sunset: 18, horizon: .74 }); GAME.stars = 1; }
  else { setTimeOfDay(null); GAME.stars = 0; setSun(52, [1, .93, .8]); setAmbient([.5, .56, .72]); }   // the daytime the level always had
  setWeather(TUNE.weather === 1 ? 'rain' : TUNE.weather === 2 ? 'snow' : null, { amount: .7, pile: TUNE.weather === 2 ? SNOW : 0, pileChance: .02 });
  setWind(TUNE.wind, .4);
  setFog(TUNE.fog > 0 ? { colour: [.85, .9, 1], density: TUNE.fog * .7, ground: .6 } : null);
  setPost(TUNE.look === 1 ? { palette: GB4, dither: .5, bloom: false, vignette: .3, scanlines: 0 }
    : TUNE.look === 2 ? { palette: null, dither: 0, bloom: true, vignette: .7, scanlines: .3 }
    : { palette: null, dither: 0, bloom: true, vignette: .42, scanlines: 0 });
}
