'use strict';
// ===================== GAME · the folk: the family, newcomers, their work; sheep, deer and ravens =====================
// Nobody is ordered about: like in The Settlers, every adult takes the most useful work there is (building first, then an
// empty workplace, then the fields, then gathering stone), and the child picks lingonberries. A person walks tile to tile
// along an A* path (world.js) and works through small steps (seek → walk → work → carry → deliver).
const NAMES = { father: ['Ulf', 'Bjorn', 'Leif', 'Halvard'], mother: ['Sigrid', 'Astrid', 'Ingrid', 'Gudrun'], child: ['Eir'] };
let FOLK = [], ANIMALS = [], RAVENS = [], BOATS = [], LANDING = [0, 0];
const _w = [0, 0];

function newPerson(kind, i, j) {
  const used = FOLK.filter(p => p.kind === kind).length;
  const p = { name: NAMES[kind][used % NAMES[kind].length], kind, u: i + .5, v: j + .5, ti: i, tj: j, path: [], job: null, task: 'idle',
    t: 0, carry: null, dx: 1, dy: 1, phase: 0, hidden: false, doing: 'arriving', target: null, logs: 0 };
  FOLK.push(p); return p;
}
function arrive() {   // a newcomer steps off the knarr
  const adults = FOLK.filter(p => p.kind !== 'child');
  const kind = adults.filter(p => p.kind === 'father').length <= adults.filter(p => p.kind === 'mother').length ? 'father' : 'mother';
  const p = newPerson(kind, LANDING[0], LANDING[1]);
  say(`${p.name.toUpperCase()} HAS COME TO LIVE AT FJORDHEIM`); HOME.arrivals++;
  return p;
}
const isAdult = p => p.kind !== 'child';
const store = () => { const l = built('longhouse')[0]; return l ? [l.i, l.j, l.w, l.h] : [LANDING[0], LANDING[1] - 1, 1, 1]; };

// ---------- walking ----------
function goTo(p, goal) {
  const path = goal(p.ti, p.tj) ? [] : findPath(p.ti, p.tj, goal);
  if (!path) return false;
  p.path = path; return true;
}
const goBeside = (p, i, j, a = 1, b = 1) => goTo(p, besideFoot(i, j, a, b));
function walk(p, dt, speed = TUNE.walk) {
  if (!p.path.length) return true;
  const [i, j] = p.path[0], tu = i + .5, tv = j + .5, du = tu - p.u, dv = tv - p.v, d = Math.hypot(du, dv), s = speed * dt;
  if (d > 1e-4) { p.dx = du - dv; p.dy = du + dv; }
  p.phase = (p.phase + s * 1.6) % 1;
  if (d <= s) { p.u = tu; p.v = tv; p.ti = i; p.tj = j; p.path.shift(); return !p.path.length; }
  p.u += du / d * s; p.v += dv / d * s;
  return false;
}
const faceTo = (p, i, j) => { const du = i + .5 - p.u, dv = j + .5 - p.v; if (Math.abs(du) + Math.abs(dv) > .01) { p.dx = du - dv; p.dy = du + dv; } };

// ---------- who does what ----------
function assignJobs() {
  const free = () => FOLK.filter(p => isAdult(p) && (!p.job || p.job.type === 'stone' || p.job.type === 'idle') && p.task !== 'carry');
  for (const b of HOME.buildings) {
    if (b.done || (b.builder && FOLK.includes(b.builder))) continue;
    let p = nearest(free(), b.i, b.j);
    // nobody free and nobody building: one worker leaves the workplace to build, and goes back to it afterwards
    if (!p && !FOLK.some(q => q.job && q.job.type === 'build')) {
      p = nearest(FOLK.filter(q => isAdult(q) && q.job && q.job.b && q.task !== 'carry' && !q.hidden), b.i, b.j);
      if (p) { const back = p.job; setJob(p, { type: 'build', b }); p.back = back; b.builder = p; }
      continue;
    }
    if (p) setJob(p, { type: 'build', b }), b.builder = p;
  }
  for (const b of HOME.buildings) {
    const def = BUILDINGS[b.type];
    if (!b.done || !def.job || def.job === 'farmer' || (b.worker && FOLK.includes(b.worker))) continue;
    const p = nearest(free(), b.i, b.j); if (p) setJob(p, { type: def.job, b }), b.worker = p;
  }
  if (HOME.buildings.some(b => b.type === 'field' && b.done) && !FOLK.some(p => p.job && p.job.type === 'farmer')) {
    const p = nearest(free(), store()[0], store()[1]); if (p) setJob(p, { type: 'farmer' });
  }
  for (const p of free()) if (!p.job) setJob(p, rocks.some(r => r.stone > 0) && HOME.stock.stone < 40 ? { type: 'stone' } : { type: 'idle' });
  for (const p of FOLK) if (!isAdult(p) && !p.job) setJob(p, { type: 'berries' });
}
function backToWork(p) { const back = p.back; p.back = null; if (back) setJob(p, back); else p.job = null; }
function setJob(p, job) { p.job = job; p.task = 'seek'; p.path = []; p.t = 0; p.carry = null; p.hidden = false; }
function nearest(list, i, j) { let best = null, bd = 1e9; for (const p of list) { const d = Math.hypot(p.ti - i, p.tj - j); if (d < bd) { bd = d; best = p; } } return best; }

// the nearest tile matching test(i, j) within r of (ci, cj), by straight distance
function nearTile(ci, cj, r, test) {
  let best = null, bd = 1e9;
  for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
    if (!test(i, j)) continue; const d = Math.hypot(i - ci, j - cj); if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
}

function stepPerson(p, dt) {
  const job = p.job || { type: 'idle' }, sp = workSpeed();
  if (p.task === 'walk' || p.task === 'carry') { if (!walk(p, dt)) return; p.task = p.task === 'carry' ? 'deliver' : 'work'; p.t = 0; }
  switch (job.type) {
    case 'build': {
      const b = job.b;
      if (b.done || !HOME.buildings.includes(b)) { backToWork(p); return; }
      if (p.task === 'seek') { if (goBeside(p, b.i, b.j, b.w, b.h)) { p.task = 'walk'; p.doing = `building the ${BUILDINGS[b.type].name.toLowerCase()}`; } else wait(p, 'cannot reach the building site'); return; }
      if (p.task === 'work') {
        faceTo(p, b.i, b.j); b.progress += dt * sp / BUILDINGS[b.type].work; p.anim = 'work';
        if (Math.random() < dt * 3) chips(b.i + b.w / 2, b.j + b.h / 2, [.75, .6, .4]);
        if (b.progress >= 1) { finishBuilding(b); p.anim = null; backToWork(p); }
      }
      return;
    }
    case 'woodcutter': {
      const b = job.b;
      if (p.task === 'seek') {
        if (p.logs >= 2) {   // every second log, plant a tree: the forest stays
          const spot = nearTile(b.i + 1, b.j + 1, 5, (i, j) => !thingAt(i, j) && (groundAt(i, j) === G_GRASS || groundAt(i, j) === G_MEADOW) && !FOLK.some(q => q.ti === i && q.tj === j) && !nearBuilding(i, j));
          if (spot && goTo(p, (i, j) => i === spot[0] && j === spot[1])) { p.target = spot; p.task = 'walk'; p.mode = 'plant'; p.doing = 'planting a tree'; return; }
          p.logs = 0;
        }
        const t = nearTile(b.i + 1, b.j + 1, 9, (i, j) => thingAt(i, j) === T_TREE);
        if (t && goBeside(p, t[0], t[1])) { p.target = t; p.task = 'walk'; p.mode = 'fell'; p.doing = `felling a ${trees[ref[tidx(t[0], t[1])]].kind}`; }
        else wait(p, 'no trees within reach');
        return;
      }
      if (p.task === 'work') {
        const [ti, tj] = p.target; faceTo(p, ti, tj);
        if (p.mode === 'plant') {
          if ((p.t += dt * sp) > 2) {
            if (!thingAt(ti, tj)) addTree(ti, tj, Math.random() < .5 ? 'pine' : 'birch', 0);
            p.logs = 0; p.task = 'seek'; p.mode = null;
          }
          return;
        }
        if (thingAt(ti, tj) !== T_TREE) { p.task = 'seek'; return; }
        p.anim = 'chop';
        if (Math.random() < dt * 4) chips(ti + .5, tj + .5, [.8, .7, .5]);
        if ((p.t += dt * sp) > 4) {
          thing[tidx(ti, tj)] = T_STUMP; Sfx.thud(4); p.anim = null;
          p.carry = 'log'; p.task = goBeside(p, b.i, b.j, b.w, b.h) ? 'carry' : 'deliver'; p.doing = 'carrying a log home';
        }
      }
      if (p.task === 'deliver') { HOME.stock.wood++; p.logs++; p.carry = null; p.task = 'seek'; floatText(p, '+1 WOOD'); }
      return;
    }
    case 'fisher': {
      const b = job.b, rack = built('rack').length;
      if (p.task === 'seek') {
        const shore = nearTile(b.i, b.j, 6, (i, j) => walkable(i, j) && DIRS.some(([a, c]) => inMap(i + a, j + c) && groundAt(i + a, j + c) === G_WATER));
        if (shore && goTo(p, (i, j) => i === shore[0] && j === shore[1])) { p.task = 'walk'; p.doing = 'going down to the boat'; }
        else wait(p, 'no shore within reach');
        return;
      }
      if (p.task === 'work') {
        if (!p.hidden) {   // push the boat out
          const wet = DIRS.map(([a, c]) => [p.ti + a, p.tj + c]).find(([i, j]) => inMap(i, j) && groundAt(i, j) === G_WATER);
          p.hidden = true; p.t = 0; p.doing = 'fishing on the fjord';
          BOATS.push({ who: p, u0: wet[0] + .5, v0: wet[1] + .5, u: wet[0] + .5, v: wet[1] + .5, t: 0 });
        }
        if ((p.t += dt * sp) > 12) {
          BOATS = BOATS.filter(o => o.who !== p); p.hidden = false;
          p.carry = 'fish'; p.task = goBeside(p, b.i, b.j, b.w, b.h) ? 'carry' : 'deliver'; p.doing = 'bringing the catch home';
        }
      }
      if (p.task === 'deliver') { const n = rack ? 3 : 2; HOME.stock.food += n; p.carry = null; p.task = 'seek'; floatText(p, `+${n} FOOD`); }
      return;
    }
    case 'sawyer': {
      const b = job.b;
      if (p.task === 'seek') { if (goBeside(p, b.i, b.j, b.w, b.h)) { p.task = 'walk'; p.doing = 'going to the sawpit'; } else wait(p, 'cannot reach the sawpit'); return; }
      if (p.task === 'work') {
        faceTo(p, b.i, b.j);
        // in autumn and winter the sawyer leaves the hearth its firewood
        if (HOME.stock.wood <= (HOME.season >= 2 ? 6 : 0)) { p.doing = HOME.season >= 2 ? 'leaving the logs for the fire' : 'waiting for logs'; p.anim = null; return; }
        p.doing = 'sawing planks'; p.anim = 'work';
        if (Math.random() < dt * 5) chips(b.i + 1, b.j + 1, [.9, .8, .6]);
        if ((p.t += dt * sp) > 6) { p.t = 0; HOME.stock.wood--; HOME.stock.planks++; floatText(p, '+1 PLANK'); }
      }
      return;
    }
    case 'farmer': {
      if (p.mode === 'stone') { if (breakStone(p, dt, sp)) p.mode = null; return; }   // between sowing and reaping
      if (p.task === 'seek') {
        const warm = HOME.season < 2;
        const f = HOME.buildings.find(f => f.type === 'field' && f.done && ((f.stage === 0 && warm) || f.stage === 3));
        if (f && goBeside(p, f.i, f.j, f.w, f.h)) { p.target = f; p.task = 'walk'; p.doing = f.stage === 3 ? 'reaping the barley' : 'sowing barley'; }
        else {
          p.mode = 'stone';
          if (HOME.stock.stone >= 40 || breakStone(p, dt, sp) === 'none') { p.mode = null; idleNear(p, HOME.buildings.find(f => f.type === 'field') || null, 'waiting for the barley to ripen'); }
        }
        return;
      }
      if (p.task === 'work') {
        const f = p.target; faceTo(p, f.i, f.j); p.anim = f.stage === 3 ? 'reap' : 'work';
        if ((p.t += dt * sp) > (f.stage === 3 ? 5 : 3)) {
          if (f.stage === 3) { f.stage = 4; HOME.stock.food += TUNE.harvest; floatText(p, `+${TUNE.harvest} FOOD`); Sfx.pickup(); }
          else if (f.stage === 0) { f.stage = 1; f.grow = 0; }
          p.anim = null; p.task = 'seek';
        }
      }
      return;
    }
    case 'stone': if (breakStone(p, dt, sp) === 'none') p.job = { type: 'idle' }; return;
    case 'berries': {
      if (p.task === 'seek') {
        const bush = bushes.filter(b => b.berries > 0 && thingAt(b.i, b.j) === T_BUSH).sort((a, c) => Math.hypot(a.i - p.ti, a.j - p.tj) - Math.hypot(c.i - p.ti, c.j - p.tj))[0];
        if (bush && HOME.season > 0 && HOME.season < 3 && goBeside(p, bush.i, bush.j)) { p.target = bush; p.task = 'walk'; p.doing = 'picking lingonberries'; }
        else { p.job = null; idleNear(p, null, 'playing by the longhouse'); p.job = { type: 'play' }; }
        return;
      }
      if (p.task === 'work') {
        const b = p.target; faceTo(p, b.i, b.j);
        if ((p.t += dt) > 4) { b.berries--; const s = store(); p.carry = 'berries'; p.task = goBeside(p, ...s) ? 'carry' : 'deliver'; p.doing = 'bringing berries home'; }
      }
      if (p.task === 'deliver') { HOME.stock.food++; p.carry = null; p.task = 'seek'; floatText(p, '+1 FOOD'); }
      return;
    }
    default:   // idle or playing: stroll about near the home; assignJobs hands out work when there is some
      if (p.task === 'seek' || p.task === 'work') idleNear(p, null, isAdult(p) ? 'resting' : 'playing by the longhouse');
  }
}
// one trip for stone: to the nearest rock, break off a stone, carry it home. true when delivered, 'none' if no rock is left
function breakStone(p, dt, sp) {
  if (p.task === 'seek') {
    const s = store(), r = rocks.filter(r => r.stone > 0).sort((a, c) => Math.hypot(a.i - s[0], a.j - s[1]) - Math.hypot(c.i - s[0], c.j - s[1]))[0];
    if (r && goBeside(p, r.i, r.j)) { p.target = r; p.task = 'walk'; p.doing = 'breaking stone'; return false; }
    return 'none';
  }
  if (p.task === 'work') {
    const r = p.target; faceTo(p, r.i, r.j); p.anim = 'chop';
    if (r.stone <= 0) { p.anim = null; p.task = 'seek'; return false; }
    if (Math.random() < dt * 4) chips(r.i + .5, r.j + .5, [.7, .7, .7]);
    if ((p.t += dt * sp) > 4) {
      p.anim = null;
      if (--r.stone <= 0) { const k = tidx(r.i, r.j); thing[k] = 0; ref[k] = -1; }
      const s = store(); p.carry = 'stone'; p.task = goBeside(p, ...s) ? 'carry' : 'deliver'; p.doing = 'carrying stone';
    }
  }
  if (p.task === 'deliver') { HOME.stock.stone++; p.carry = null; p.task = 'seek'; floatText(p, '+1 STONE'); return true; }
  return false;
}
function wait(p, why) { p.doing = why; p.task = 'seekLater'; p.t = 0; }
function idleNear(p, b, why) {
  const s = b ? [b.i, b.j, b.w, b.h] : store(), spot = nearTile(s[0] + (s[2] >> 1), s[1] + (s[3] >> 1), 3, (i, j) => walkable(i, j) && Math.random() < .3);
  p.doing = why;
  if (spot && goTo(p, (i, j) => i === spot[0] && j === spot[1])) { p.task = 'walk'; p.idleWalk = true; } else { p.task = 'rest'; p.t = 0; }
}
const nearBuilding = (i, j) => DIRS.some(([a, c]) => thingAt(i + a, j + c) === T_BUILDING || thingAt(i + a, j + c) === T_FIELD);
function floatText(p, text) { isoToWorld(p.u, p.v, _w); addText(_w[0], _w[1] - 6 * RES, text, [255, 214, 120], 1.4); }

function stepFolk(dt) {
  for (const p of FOLK) {
    // a pause: after resting (idle) or waiting (nothing to do at the workplace), look again; the idle may take new work
    if (p.task === 'seekLater' || p.task === 'rest') {
      if ((p.t += dt) > (p.task === 'rest' ? 3 : 2)) { p.task = 'seek'; if (!p.job || p.job.type === 'idle' || p.job.type === 'play') p.job = null; }
      continue;
    }
    if (p.task === 'walk' && p.idleWalk) { if (walk(p, dt, TUNE.walk * .5)) { p.idleWalk = false; p.task = 'rest'; p.t = 0; } continue; }
    stepPerson(p, dt);
  }
  for (const o of BOATS) { o.t += dt * workSpeed(); const out = Math.sin(Math.min(1, o.t / 12) * Math.PI) * 3; o.u = o.u0 - out * .3; o.v = o.v0 + out; }
}

// ---------- animals: sheep on the meadow, deer in the forest, ravens overhead ----------
function newAnimals() {
  ANIMALS = []; RAVENS = [];
  const add = (kind, n, test, near) => {
    for (let k = 0; k < n; k++) {
      const s = nearTile(near[0] + ((Math.random() * 6) | 0) - 3, near[1] + ((Math.random() * 6) | 0) - 3, 6, (i, j) => walkable(i, j) && test(i, j));
      if (s) ANIMALS.push({ kind, u: s[0] + .5, v: s[1] + .5, ti: s[0], tj: s[1], path: [], t: Math.random() * 4, dx: 1, dy: 1, phase: 0, leaving: false });
    }
  };
  add('sheep', 3, (i, j) => groundAt(i, j) === G_MEADOW || groundAt(i, j) === G_GRASS, [LANDING[0] + 3, LANDING[1] - 6]);
  const forest = trees.length ? trees[(trees.length * .6) | 0] : { i: N - 5, j: 5 };
  add('deer', 2, (i, j) => DIRS.some(([a, c]) => thingAt(i + a, j + c) === T_TREE), [forest.i, forest.j]);
}
function stepAnimals(dt) {
  const forest = grownTrees(), need = TUNE.deerForest / 100 * HOME.forest0;
  if (forest < need && !HOME.deerGone) { HOME.deerGone = true; say('THE DEER HAVE LEFT THE FOREST: let it grow back'); for (const a of ANIMALS) if (a.kind === 'deer') a.leaving = true; }
  if (forest > need + 8 && HOME.deerGone) {
    HOME.deerGone = false; say('A STAG IS BACK IN THE FOREST');
    const s = nearTile(N - 2, 1, 6, walkable); if (s) ANIMALS.push({ kind: 'deer', u: s[0] + .5, v: s[1] + .5, ti: s[0], tj: s[1], path: [], t: 0, dx: 1, dy: 1, phase: 0 });
  }
  for (const a of ANIMALS) {
    if (a.path.length) { walk(a, dt, a.kind === 'deer' ? .9 : .45); continue; }
    if ((a.t -= dt) > 0) continue;
    a.t = 3 + Math.random() * 5;
    if (a.leaving) {
      a.path = findPath(a.ti, a.tj, (i, j) => i === N - 1 || j === 0) || [];
      if (!a.path.length) a.gone = true;
      continue;
    }
    const want = a.kind === 'deer' ? (i, j) => DIRS.some(([p, q]) => thingAt(i + p, j + q) === T_TREE) : (i, j) => groundAt(i, j) !== G_SAND;
    const s = nearTile(a.ti + ((Math.random() * 7) | 0) - 3, a.tj + ((Math.random() * 7) | 0) - 3, 2, (i, j) => walkable(i, j) && want(i, j));
    if (s) a.path = findPath(a.ti, a.tj, (i, j) => i === s[0] && j === s[1]) || [];
  }
  ANIMALS = ANIMALS.filter(a => !(a.leaving && (a.gone || (!a.path.length && (a.ti === N - 1 || a.tj === 0)))));
  // a raven crosses the sky now and then
  if (Math.random() < dt / 25) { const y = cam.y + R.rows * ASPECT * (.1 + Math.random() * .4); RAVENS.push({ x: cam.x - 10 * RES, y, vx: 26 * RES, t: 0 }); if (Math.random() < .4) Sfx.tone(380, .12, .03, 'sawtooth'); }
  for (const r of RAVENS) { r.x += r.vx * dt; r.y += Math.sin(r.t * 2) * 3 * RES * dt; r.t += dt; }
  RAVENS = RAVENS.filter(r => r.x < cam.x + R.cols + 20 * RES);
}

// wood chips, stone dust, sawdust: a few grains thrown up from where someone works
function chips(u, v, c) {
  isoToWorld(u, v, _w);
  spawnP(PT_CHIP, _w[0] + rr(-1, 1) * RES, _w[1] - 2 * RES, rr(-6, 6) * RES, rr(-14, -6) * RES, rr(.3, .6), pick(".,'`"), 0);
  CHIP_C[0] = c[0]; CHIP_C[1] = c[1]; CHIP_C[2] = c[2];
}
const CHIP_C = [.8, .7, .5];
const PT_CHIP = defineParticle({ gravity: 1.2, drag: 0, look(i, k, life, time, out) { out[0] = CHIP_C[0] * 1.4; out[1] = CHIP_C[1] * 1.4; out[2] = CHIP_C[2] * 1.4; return P.g[i]; } });
