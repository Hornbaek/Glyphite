#!/usr/bin/env python3
"""Engine sound-through-air and beat features, checked in a real page: Sfx.heard (delay, volume and dullness with distance,
only with an atmosphere), explode() using it, the Beat pulse from drum hits, material beatGlow and the bloom pulse.
Uses Regolith as the host game.

  python3 tests/engine_audio.py [2d|gl ...]      (build first: npm run build)

Exits 1 and prints what failed.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'dist' / 'games' / 'regolith' / 'index.html'
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


SOUND = """() => {
  Glyphite.test.start(); Glyphite.test.step(3, []); const o = {};
  const real = Sfx.burst, calls = []; Sfx.burst = (...a) => calls.push(a);
  const lx = L.body.x, ly = L.body.y;
  const fire = (dx) => { calls.length = 0; explode(lx + dx, ly, 6 * RES, 1.2); return calls.map(a => ({ at: a[6], vol: a[3], f0: a[1], dur: a[0], f1: a[2], alive: L.alive })); };
  setAtmosphere(0);
  o.vac_heard = Sfx.heard(lx + 400 * RES, ly);                       // far away, but no air
  o.vac_calls = fire(400 * RES);
  setAtmosphere(1);
  o.air_near = Sfx.heard(lx + 4, ly); o.air_mid = Sfx.heard(lx + 100 * RES, ly); o.air_far = Sfx.heard(lx + 400 * RES, ly);
  o.near_calls = fire(24); o.far_calls = fire(400 * RES);
  // the listener is the lander (GAME.listener), not the camera
  cam.x = lx + 600; o.listener_is_lander = Sfx.heard(lx + 8 * RES, ly).m < 20;
  // with the real audio graph: delayed, muffled bursts schedule without error
  Sfx.burst = real; Sfx.init(); o.ctx = !!Sfx.ctx; let err = null;
  try { Sfx.boom(2, Sfx.heard(lx + 300 * RES, ly)); Sfx.boom(2); } catch (e) { err = String(e); }
  o.err = err; setAtmosphere(0);
  return o;
}"""

BEAT = """() => {
  Glyphite.test.start(); Glyphite.test.step(3, []); const o = {};
  o.pulse_off = (setBeatPulse(0), Beat.hit(1), Beat.pulse()); Beat.v = 0;
  setBeatPulse(1); Beat.hit(.6); o.pulse_on = Beat.pulse();
  Beat.t = 10; for (let i = 1; i <= 30; i++) Beat.step(10 + i / 60); o.after_half_second = Beat.v;
  // drum hits from the chip's meter: hi-hat level (5) is ignored, a snare-like hit (12) fires once, held it does not fire again
  const realPlaying = Chip.playing, realMeter = Chip.meter; let drum = 0, beat = 0.2;
  Chip.playing = true; Chip.meter = () => ({ drum, beat });
  Beat.v = 0; Beat.last = 0; Beat.t = 20;
  drum = 5; Beat.step(20.02); o.weak = Beat.v;
  drum = 12; Beat.step(20.04); o.hit = Beat.v;
  const before = Beat.v; drum = 12; Beat.step(20.06); o.held_decays = Beat.v < before;
  o.phase = Beat.phase(); o.blink_early = Beat.blink(0); beat = .6; o.blink_late = Beat.blink(0); beat = 3.2; o.blink_custom = Beat.blink(0, 1.6, .5);
  Chip.playing = false; o.silent_phase = Beat.phase(); o.silent_blink = [Beat.blink(0), Beat.blink(.7), Beat.blink(1.0)];
  Chip.playing = realPlaying; Chip.meter = realMeter;
  return o;
}"""

GLOW = """() => {
  Glyphite.test.start(); setEyeAdaptation(0); TUNE.atmosphere = 0; startSite(1); Glyphite.test.step(3, []); Glyphite.test.freeze(); R.bloom = true;
  // a view with He-3 veins in it
  let c = -1; for (let i = W * 8; i < W * (H - 8) && c < 0; i++) if (cells[i] === CRYST) c = i;
  if (c < 0) return { error: 'no crystal vein found' };
  const cx = c % W, cy = (c / W) | 0;
  for (let dy = 1; dy <= 3 * RES; dy++) for (let dx = -3 * RES; dx <= 3 * RES; dx++) if (cells[(cy - dy) * W + cx + dx] !== CRYST) cells[(cy - dy) * W + cx + dx] = EMPTY;   // veins are buried: open a pocket so one is in view
  cam.x = cx - R.cols / 2; cam.y = cy * ASPECT - R.rows * ASPECT / 2;
  const frame = (v, k) => { setBeatPulse(k); Beat.v = v; Beat.t = 500; draw(500); draw(500);
    const o = L_OX, p = L_OY; let sum = 0, n = 0, bl = 0;
    for (let j = 0; j < R.RH; j++) for (let i = 0; i < R.RW; i++) { const q = (j * R.RW + i) * 4; if (R.wG[j * R.RW + i]) bl += R.bloomPix[q] + R.bloomPix[q + 1] + R.bloomPix[q + 2]; }
    for (let j = 0; j < R.RH; j++) for (let i = 0; i < R.RW; i++) if (getC(o + i, p + j) === CRYST) { const q = (j * R.RW + i) * 4; sum += R.wPix[q] + R.wPix[q + 1] + R.wPix[q + 2]; n++; }
    return { crystal: n ? sum / n : 0, bloom: bl, n }; };
  const o = { quiet: frame(0, 1), hit: frame(1, 1), hit_but_off: frame(1, 0), half: frame(.5, 1) };
  setBeatPulse(0); Glyphite.test.unfreeze(); return o;
}"""


def run(mode):
    print(f'--- {mode}')
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS[mode])
        pg = b.new_page(viewport={'width': 1100, 'height': 640})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(PAGE.as_uri() + '#' + mode)
        pg.wait_for_timeout(700)
        s = pg.evaluate(SOUND)
        check('sound: in a vacuum a far blast is heard at once at full volume', s['vac_heard']['delay'] == 0 and s['vac_heard']['gain'] == 1 and all(c['at']['delay'] == 0 for c in s['vac_calls']), s['vac_heard'])
        check('sound: in air, delay = distance / 343 m/s', abs(s['air_far']['delay'] - s['air_far']['m'] / 343) < 1e-6 and 0.4 < s['air_far']['delay'] < 1.5, s['air_far'])
        check('sound: farther is later, quieter and duller', s['air_near']['delay'] < s['air_mid']['delay'] < s['air_far']['delay'] and s['air_near']['gain'] > s['air_mid']['gain'] > s['air_far']['gain'] and s['air_near']['muffle'] > s['air_far']['muffle'] >= .2, s)
        check('sound: a close blast is heard almost at once', s['air_near']['delay'] < .02 and all(c['at']['delay'] < .06 for c in s['near_calls']), s['air_near'])
        check('sound: explode() passes how it is heard to every burst', len(s['near_calls']) == 2 and all(c['alive'] for c in s['near_calls']) and all(c['at']['delay'] > .4 for c in s['far_calls']), s)
        check('sound: a far blast adds a long low rumble (thunder)', len(s['far_calls']) == 3 and s['far_calls'][2]['dur'] > 2 and s['far_calls'][2]['f1'] < 40, s['far_calls'])
        check('sound: GAME.listener (the lander) sets where it is heard from, not the camera', s['listener_is_lander'])
        check('sound: the real audio graph takes delayed bursts without error', s['err'] is None, s['err'])
        e = pg.evaluate(BEAT)
        check('beat: off means no pulse', e['pulse_off'] == 0)
        check('beat: a hit pulses at its strength and fades within half a second', abs(e['pulse_on'] - .6) < 1e-9 and e['after_half_second'] < .05, e)
        check('beat: only a real drum hit fires it (not a hi-hat level), and a held level does not re-fire', e['weak'] < .01 and .7 < e['hit'] < .9 and e['held_decays'], e)
        check('beat: blink follows the music beat when playing', e['phase'] == .2 and e['blink_early'] is True and e['blink_late'] is False and e['blink_custom'] is True, e)
        check('beat: with no music it blinks on a clock instead', e['silent_phase'] == -1 and e['silent_blink'] == [True, False, False] or e['silent_blink'] == [True, True, False] or len(set(e['silent_blink'])) > 1, e['silent_blink'])
        g = pg.evaluate(GLOW)
        if 'error' in g:
            check('glow: ' + g['error'], False)
        else:
            q, h, off, half = g['quiet'], g['hit'], g['hit_but_off'], g['half']
            check('glow: He-3 veins are brighter on a hit than between hits', h['crystal'] > q['crystal'] * 1.1, (q['crystal'], h['crystal']))
            check('glow: half a hit is in between', q['crystal'] < half['crystal'] < h['crystal'], g)
            check('glow: with the pulse off a hit changes nothing', abs(off['crystal'] - q['crystal']) < 1 and abs(off['bloom'] - q['bloom']) < 1, g)
            check('glow: the bloom swells on a hit', h['bloom'] > q['bloom'] * 1.1, (q['bloom'], h['bloom']))
        check('no page errors', not errs, errs[:2])
        b.close()


if __name__ == '__main__':
    for m in sys.argv[1:] or ['2d', 'gl']:
        run(m)
    print('FAILED: ' + ', '.join(failures) if failures else 'all sound and beat checks passed')
    sys.exit(1 if failures else 0)
