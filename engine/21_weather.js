// ===================== ENGINE · weather, wind, fog and the time of day (E8) =====================
// A small kit on existing parts, every piece off until a game asks for it (a game that never calls any of it renders and plays bit for bit as before):
//   setTimeOfDay(hour)             the sun's angle, colour and strength, the ambient light, the sky's colours and the stars from the clock; setSun, setAmbient and
//                                  setSkyGradient underneath, so a game can still set any of them by hand
//   setSkyGradient({ top, horizon, stars, at })   the sky layer's base colour, top of the screen to `at` (the share of its height, default the bottom), and how visible the stars are
//   setWeather('rain' | 'snow', { amount, pile, pileChance })   an emitter above the view; drops are particles that quench heat, splash and can pile up as cells
//   setWind(speed, gust)           a force on smoke, vapour, dust and the weather (and on any particle type that has a `wind` coupling)
//   setFog({ colour, density, ground })        a veil over the world, thicker over the backdrops and the sky, lit by the scene so it is dark at night
// Time is the simulation's (a fixed step at a time), so pause, slow motion and replays hold.

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth01 = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const colour3 = (c, what) => {
  if (!Array.isArray(c) || c.length < 3 || !c.slice(0, 3).every(Number.isFinite)) throw new Error(`${what}: a colour is [r, g, b] in light units`);
  return [c[0], c[1], c[2]];
};

// ---------- the sky's base colour ----------
// renderSky (06_scene.js) paints this under the stars and under what GAME.sky paints; the stars are brighter than it where they show. It is the whole screen's, top to
// `at` (a share of its height, default 1: the bottom; a game whose ground fills the bottom third puts it at .7, so the horizon colour is the sky just above the ground),
// in light units like every colour the engine draws (through the exposure and the tone curve).
const SKYG = { on: false, t: [0, 0, 0], h: [0, 0, 0], stars: 1, at: 1, rev: 0, q: '' };
function setSkyGradient(o) {
  if (!o) { if (SKYG.on) { SKYG.on = false; SKYG.rev++; } return; }
  devKeys('setSkyGradient', o, ['top', 'horizon', 'stars', 'at']);
  const top = colour3(o.top, 'setSkyGradient top'), hor = o.horizon ? colour3(o.horizon, 'setSkyGradient horizon') : top, stars = clamp(o.stars ?? 1, 0, 1), at = clamp(o.at ?? 1, .2, 1);
  const q = [...top, ...hor, stars, at].map(v => Math.round(v * 64)).join();   // the sky is cached: it is made again when a colour has moved by about a sixty-fourth
  SKYG.t = top; SKYG.h = hor; SKYG.stars = stars; SKYG.at = at;
  if (!SKYG.on || q !== SKYG.q) { SKYG.rev++; SKYG.q = q; }
  SKYG.on = true;
}
function skyGradAt(j, RH, out) { const u = Math.min(1, j / (RH * SKYG.at)), t = SKYG.t, h = SKYG.h; out[0] = t[0] + (h[0] - t[0]) * u; out[1] = t[1] + (h[1] - t[1]) * u; out[2] = t[2] + (h[2] - t[2]) * u; }

// ---------- fog ----------
// A veil of one colour over what is drawn: `density` 0..1 is how much of it covers the world, `ground` 0..1 makes it thicker toward the bottom of the screen and thinner
// toward the top (a ground mist). The backdrops are further away, so more of it covers them (the farthest most) and the sky more still. The colour is in light units
// and is lit by the scene (the ambient light and the sun's height), so a fog is grey by day and dark at night; it is applied to the finished bytes, after the light and
// before a palette lock.
const FOG = { on: false, c: [.85, .9, 1], d: 0, ground: 0, rev: 0, bytes: [0, 0, 0], key: '' };
function setFog(o) {
  if (!o || !(o.density > 0)) { if (FOG.on) { FOG.on = false; FOG.rev++; FOG.key = ''; } return; }
  devKeys('setFog', o, ['colour', 'density', 'ground']);
  FOG.c = o.colour ? colour3(o.colour, 'setFog colour') : [.85, .9, 1];
  FOG.d = clamp(+o.density, 0, 1); FOG.ground = clamp(+(o.ground ?? 0), 0, 1);
  if (!FOG.on) FOG.rev++;
  FOG.on = true;
}
// the fog's colour as bytes this frame; FOG.key changes when it does, so the cached sky and backdrops are made again
function fogPrep(E) {
  if (!FOG.on) return;
  const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
  const lit = lum(AMB_C) + (SUN_ON ? lum(SUN_C) * .5 * Math.sin(Math.min(SUN_EL, 180 - SUN_EL) * Math.PI / 180) : 0);
  for (let i = 0; i < 3; i++) FOG.bytes[i] = Math.round(toneF(FOG.c[i] * lit * E) * 255);
  FOG.key = `${FOG.rev},${FOG.bytes[0]},${FOG.bytes[1]},${FOG.bytes[2]}`;
}
// mix a finished layer (RW wide) toward the fog: d0 is this layer's density, the ground bias is in the screen's rows
function fogLayer(D, RW, RH, d0) {
  const fr = FOG.bytes[0], fg = FOG.bytes[1], fb = FOG.bytes[2], gr = FOG.ground;
  for (let j = 0; j < RH; j++) {
    const a = Math.min(1, Math.max(0, d0 * (1 + gr * (2 * j / RH - 1)))); if (a === 0) continue;
    for (let i = 0, q = j * RW * 4; i < RW; i++, q += 4) {
      if (!D[q + 3]) continue;
      D[q] += (fr - D[q]) * a; D[q + 1] += (fg - D[q + 1]) * a; D[q + 2] += (fb - D[q + 2]) * a;
    }
  }
}

// ---------- wind ----------
// setWind(speed, gust = 0): speed in base units a second (positive blows right; scaled by RES like every speed a game writes), gust 0..1 how much it swells and
// drops. A particle is pulled toward the wind's speed at its type's `wind` coupling (a share a second): smoke and vapour .9, dust 1.5, rain 4, snow 2.5, and any type a game
// defines with `wind: k`. 0, the default, is no wind, and then nothing here runs.
const WIND = { speed: 0, gust: 0 }, WIND_K = [];
WIND_K[PT_SMOKE] = .9; WIND_K[PT_VAPOR] = .9; WIND_K[PT_DUST] = 1.5;
function setWind(speed, gust = 0) { devFinite('setWind', speed, gust); WIND.speed = Number.isFinite(+speed) ? +speed : 0; WIND.gust = clamp(Number.isFinite(+gust) ? +gust : 0, 0, 1); }
const windNow = () => WIND.speed * RES * (1 + WIND.gust * (vnoise1(clockT * .35, 21) * 2 - 1));   // (units a second, now)

// ---------- rain and snow ----------
// An emitter above the view: drops are particles of two types (made the first time a game asks, so a game that never does keeps its particle numbers). Rain falls fast,
// takes heat out of what it hits (fire and hot rock cool), splashes and rejoins a liquid; snow drifts and sways. `amount` 0..1 is how heavy (default .5). `pile: material`
// turns some of what lands into cells of that material (`pileChance` of the drops, default .03 for snow and 0 for rain): a snow material that is granular piles into drifts
// and slides down slopes, a liquid one makes puddles that flow (D2). Piles are mass the weather adds, so keep the chance small and let a game melt them if it should.
const WEATHER = { kind: null, amount: .5, pile: 0, pileChance: 0, acc: 0, pt: null };
const WEATHER_KINDS = {
  rain: { perCol: 2.4, fall: 95, quench: .12, chance: .01, streak: .011 },   // chance: the share of drops that become cells when a game gives a `pile` material; streak: seconds of fall between the two pixels of a drop
  snow: { perCol: 1.1, fall: 11, quench: .04, chance: .03 }
};
function weatherTypes() {
  if (WEATHER.pt) return WEATHER.pt;
  const S = () => RES, tint = (c, floor, k, out) => { out[0] = c[0] * Math.max(floor, LR[k]); out[1] = c[1] * Math.max(floor, LG[k]); out[2] = c[2] * Math.max(floor, LB[k]); return SOLID; };
  const hit = (i, cx, cy, m, kind) => {   // a drop met a solid cell: cool it, splash (rain), maybe pile up, and end
    const ci = cy * W + cx, k = WEATHER_KINDS[kind];
    if (heat[ci] > 0) heat[ci] = Math.max(0, heat[ci] - k.quench);
    if (kind === 'rain' && !P.rest[i] && P.n < PMAX && rnd() < .55) {
      const j = spawnP(WEATHER.pt.rain, P.x[i], P.y[i], rr(-7, 7) * S(), -rr(7, 17) * S(), rr(.18, .34), SOLID, 0);
      if (j >= 0) P.rest[j] = 1;   // a splash droplet: it falls back under gravity and does not splash again
    }
    if (WEATHER.pile && !P.rest[i] && rnd() < WEATHER.pileChance) deposit(P.x[i], P.y[i], WEATHER.pile);
    return true;
  };
  WEATHER.pt = {
    rain: defineParticle({ gravity: 0, wind: 4, bounce: 0, friction: 0,
      update(i, dt) { if (P.rest[i]) P.vy[i] += G * 1.4 * dt; },
      look(i, k, life, time, out) { return tint([.5, .64, .95], .22, k, out); },
      onHit(i, cx, cy, m) { return hit(i, cx, cy, m, 'rain'); },
      onLiquid(i, m) { if (!P.rest[i] && P.n < PMAX && rnd() < .4) { const j = spawnP(WEATHER.pt.rain, P.x[i], P.y[i], rr(-5, 5) * S(), -rr(5, 12) * S(), rr(.15, .3), SOLID, 0); if (j >= 0) P.rest[j] = 1; } return true; } }),
    snow: defineParticle({ gravity: 0, wind: 2.5, bounce: 0, friction: 0,
      update(i, dt) { P.vx[i] += Math.sin(P.age[i] * 2.1 + P.s[i]) * 7 * RES * dt; },
      look(i, k, life, time, out) { return tint([.95, .97, 1], .35, k, out); },
      onHit(i, cx, cy, m) { return hit(i, cx, cy, m, 'snow'); },
      onLiquid() { return true; } })
  };
  return WEATHER.pt;
}
function setWeather(kind, o = {}) {
  devKeys('setWeather', o, ['amount', 'pile', 'pileChance']);
  if (!kind || kind === 'none') { WEATHER.kind = null; return; }
  if (!WEATHER_KINDS[kind]) throw new Error(`setWeather: '${kind}' is not a kind of weather (${Object.keys(WEATHER_KINDS).join(', ')})`);
  weatherTypes();
  WEATHER.kind = kind; WEATHER.amount = clamp(+(o.amount ?? .5), 0, 1); WEATHER.pile = o.pile | 0;
  WEATHER.pileChance = WEATHER.pile ? clamp(+(o.pileChance ?? WEATHER_KINDS[kind].chance), 0, 1) : 0;
}
function emitWeather(dt) {
  const k = WEATHER_KINDS[WEATHER.kind], S = RES;
  if (!R.cols || !W) return;
  WEATHER.acc += dt * k.perCol * R.cols * WEATHER.amount;
  let n = Math.floor(WEATHER.acc); WEATHER.acc -= n;
  n = Math.min(n, Math.max(0, Math.floor(PMAX * .75) - P.n));   // never starve the game's own effects of particles
  if (!n) return;
  const wx = WIND.speed ? windNow() : 0, t = WEATHER.pt[WEATHER.kind], view = R.rows * ASPECT + 10 * S;
  const drift = wx * .9 * view / (k.fall * S);   // how far sideways a drop goes on its way down: it must start that much upwind of where it should land
  const x0 = cam.x - Math.max(0, drift) - 6 * S, x1 = cam.x + R.cols - Math.min(0, drift) + 6 * S;
  for (let i = 0; i < n; i++) {
    const vy = k.fall * S * rr(.85, 1.15), x = rr(x0, x1), y = cam.y - 3 * S, life = view / vy + .6;
    spawnP(t, x, y, wx * .9, vy, life, SOLID, 0);
    if (k.streak && ++i < n) spawnP(t, x - wx * .9 * k.streak, y - vy * k.streak, wx * .9, vy, life, SOLID, 0);   // a second pixel right behind it, flying the same way: a streak
  }
}

// ---------- the time of day ----------
// setTimeOfDay(hour, opts?): hour 0..24 (12 is noon; it wraps). The sun rises on the left at `sunrise` (6) and sets on the right at `sunset` (18), climbing and falling
// by a sine, so its shadows swing across the world; its colour goes from a thin red at the horizon to white by about a third of the way up, and its strength follows
// its height (it is off, setSun(null), at night). The ambient light and the sky go from night blue to day, with a warm band an hour or so either side of sunrise and sunset,
// and the stars fade as the sun climbs. `rate`: hours a second to run the clock by itself (the engine steps it); `sky: false` and `ambient: false` leave those to the game
// (`setSkyGradient`, `setAmbient`); `sun: 1` is the day sun's strength; `horizon: .75` is how far down the screen the sky reaches its horizon colour (where the ground is: the
// warm band of a sunset is there). Options stay set until changed. Returns what it did.
const TOD = { on: false, h: 12, rise: 6, set: 18, sun: 1, rate: 0, sky: true, ambient: true, horizon: 1 };
// where the clock puts the sun: u 0..1 across the day (up: it is in the sky), alt 0 at the horizon to 1 at noon, and from it the sun's strength, how far its colour has gone from
// red to white, how much of the day's light the world has, and tw: the warm band around sunrise and sunset
function todShape(h) {
  const u = (h - TOD.rise) / Math.max(.5, TOD.set - TOD.rise), up = u > 0 && u < 1, alt = up ? Math.sin(Math.PI * u) : 0;
  return { u, up, alt, sunI: smooth01(alt / .16), far: smooth01(alt / .5), d: smooth01(alt / .35), tw: Math.max(0, 1 - Math.abs(h - TOD.rise) / 1.5, 1 - Math.abs(h - TOD.set) / 1.5) };
}
function setTimeOfDay(hour, o) {
  if (hour === null) { TOD.on = false; TOD.rate = 0; setSkyGradient(null); return null; }   // off: the clock stops and the sky's gradient goes; the sun and the ambient light stay as they were
  if (o) {
    devKeys('setTimeOfDay', o, ['sunrise', 'sunset', 'rate', 'sky', 'ambient', 'sun', 'horizon']);
    if (o.sunrise !== undefined) TOD.rise = +o.sunrise; if (o.sunset !== undefined) TOD.set = +o.sunset; if (o.horizon !== undefined) TOD.horizon = +o.horizon;
    if (o.rate !== undefined) TOD.rate = +o.rate || 0; if (o.sun !== undefined) TOD.sun = +o.sun;
    if ('sky' in o) TOD.sky = !!o.sky; if ('ambient' in o) TOD.ambient = !!o.ambient;
  }
  devFinite('setTimeOfDay', hour);
  const h = ((+hour || 0) % 24 + 24) % 24, { u, up, alt, sunI, far, d, tw } = todShape(h);
  TOD.h = h; TOD.on = true;
  let sunAngle = null;
  if (up && sunI > .015) {
    sunAngle = 8 + 164 * u;                                  // (not the last few degrees: a shadow that long is a stripe across the world)
    const k = TOD.sun * sunI; setSun(sunAngle, [(1.3 + (1.12 - 1.3) * far) * k, (.55 + (1.08 - .55) * far) * k, (.2 + (.98 - .2) * far) * k]);
  } else setSun(null);
  if (TOD.ambient) { const a = lerp3([.05, .065, .12], [.3, .34, .44], d); setAmbient([a[0] + .09 * tw, a[1] + .04 * tw, a[2] + .01 * tw]); }
  if (TOD.sky) {
    const top = lerp3(lerp3([.012, .016, .05], [.2, .42, .95], d), [.25, .2, .5], tw * .5), hor = lerp3(lerp3([.03, .04, .09], [.6, .78, 1], d), [1.1, .5, .25], tw * .85);
    // the stars come out once the sun is down and the sky has darkened: gone by the time it is a few degrees up, and still faint for an hour after sunset
    setSkyGradient({ top, horizon: hor, stars: Math.min(1, (1 - smooth01(alt / .12)) * (1 - .75 * tw)), at: TOD.horizon });
  }
  return { hour: h, daylight: d, sunAngle };
}
const getTimeOfDay = () => ({ hour: TOD.h, on: TOD.on, sunrise: TOD.rise, sunset: TOD.set, rate: TOD.rate, daylight: TOD.on ? todShape(TOD.h).d : 1 });   // daylight 0..1: how much of the day's light there is (a game's own "is it night" test)

// the engine's step of all of it (stepWorld, 11_loop.js)
function stepWeather(dt) {
  if (TOD.rate) setTimeOfDay(TOD.h + TOD.rate * dt);
  if (WEATHER.kind) emitWeather(dt);
}
