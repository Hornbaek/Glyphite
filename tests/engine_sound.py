#!/usr/bin/env python3
"""The engine's sound parts in a real browser (real Web Audio), with Space Mouse as the host game because it has songs: instruments made in
slices between frames (F4), sounds as data placed in the world with pan, the voice cap and the player's volumes kept between visits (F1), and
the music director's crossfade, layers and stingers (F3). The unit tests (tests/node/sound.test.mjs, music.test.mjs, sampler.test.mjs) look at
the audio graph with a recording stand-in; this checks the same things run against the browser's own.

  python3 tests/engine_sound.py [2d|gl ...]      (build first: npm run build)

Exits 1 and prints what failed.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'dist' / 'games' / 'spacemouse' / 'index.html'
ARGS = {'2d': ['--disable-gpu'], 'gl': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {detail}' if detail and not ok else ''))
    if not ok:
        failures.append(name)


def run(mode):
    import os
    print('---', mode)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS[mode] + ['--autoplay-policy=no-user-gesture-required'], channel=os.environ.get('PIXELITE_BROWSER_CHANNEL') or None)
        page = browser.new_page(viewport={'width': 1000, 'height': 640})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(PAGE.as_uri() + '#' + mode)
        page.evaluate("try { localStorage.removeItem('spacemouse.sound'); localStorage.removeItem('spacemouse.settings'); } catch (e) {}")
        page.reload()
        page.wait_for_function("typeof Music !== 'undefined' && Pixelite.test", timeout=15000)

        # F4: the songs' instruments are made between frames in the background, in slices
        page.wait_for_function("Sampler.ready(SONGS['cargo-bay'])", timeout=60000)
        b = page.evaluate('({ slices: Sampler.build.slices, longest: Sampler.build.longest, work: Sampler.build.work })')
        print(f"     instruments: {b['slices']} slices, longest {b['longest']:.1f} ms, {b['work']:.0f} ms of work in all")
        check('instruments are made in many slices, the longest well under a frame or two', b['slices'] > 20 and b['longest'] < 40, str(b))
        check('before any input the director remembers the place and nothing plays', page.evaluate("Music.current === 'cargo-bay' && !Sampler.ctx && !Sampler.playing"))

        # the first input starts the sound and the song, without a stall
        page.keyboard.press('Space')
        page.wait_for_function('Sampler.ctx && Sampler.playing', timeout=20000)
        check('the title song plays with the first input', page.evaluate("Sampler.song.title === SONGS['cargo-bay'].title"))
        check('the music is on its own bus under the master', page.evaluate("Sfx.musicBus && Sfx.master && Sampler.dest === Sfx.musicBus"))

        # F1: sounds as data, placed in the world
        o = page.evaluate("""() => {
          defineSound('test-chime', { vol: .8, layers: [{ tone: 660, dur: .2, type: 'sine' }, { note: 76, instrument: 'bell', dur: .3 }] });
          const near = Sfx.place(cam.x + R.cols / 2, cam.y + R.rows / 2), left = Sfx.place(cam.x + 5, cam.y + R.rows / 2), right = Sfx.place(cam.x + R.cols - 5, cam.y + R.rows / 2);
          const far = Sfx.place(cam.x + R.cols * 6, cam.y + R.rows / 2);
          let err = null, played = [];
          try { played.push(Sfx.play('test-chime'), Sfx.play('test-chime', { x: cam.x + 5, y: cam.y + 5 }), Sfx.play('test-chime', { x: cam.x + R.cols - 5, y: cam.y + 5, pitch: 1.5 })); Sfx.thud(8); Sfx.boom(2, Sfx.place(cam.x, cam.y)); } catch (e) { err = String(e); }
          return { pans: [left.pan, near.pan, right.pan], gains: [near.gain, far.gain], err, played, panner: typeof StereoPannerNode };
        }""")
        check('place: left is negative, centre zero, right positive', o['pans'][0] < 0 and o['pans'][1] == 0 and o['pans'][2] > 0, str(o))
        check('place: a far sound is quieter', o['gains'][1] < o['gains'][0] / 3, str(o))
        check('Sfx.play with panned, pitched, placed sounds and a note layer raises no error', o['err'] is None and o['played'][0] and o['panner'] == 'function', str(o))
        page.wait_for_function("Sampler.ready([{ instrument: 'bell' }])", timeout=30000)
        check('a note layer plays once its instrument is made', page.evaluate("Sfx.play('test-chime')"))
        v = page.evaluate("""() => { let n = 0; for (let i = 0; i < 300; i++) Sfx.thud(10); return { voices: Sfx.voices.length, max: Sfx.maxVoices, stats: Sfx.stats }; }""")
        check('the voice cap holds under 300 thuds in one frame', v['voices'] <= v['max'], str(v))

        # the player's volumes: kept, and applied at the next visit
        page.evaluate("Sfx.setVolumes({ music: .35, sfx: .6 }); Sfx.setMuted(false)")
        page.wait_for_timeout(200)
        g = page.evaluate("({ m: Sfx.musicBus.gain.value, s: Sfx.sfxBus.gain.value, master: Sfx.master.gain.value, settings: [SETTINGS.music, SETTINGS.sfx] })")
        check('the buses follow setVolumes; the master stays .5', abs(g['m'] - .35) < .02 and abs(g['s'] - .6) < .02 and abs(g['master'] - .5) < .02, str(g))
        check('the settings system sees the same volumes', g['settings'] == [.35, .6], str(g))
        page.keyboard.press('KeyM'); page.wait_for_timeout(200)
        check('M mutes: the master goes to 0 and Sfx.muted says so', page.evaluate('Sfx.muted && Sfx.master.gain.value < .01'))
        page.reload()
        page.wait_for_function("typeof Music !== 'undefined' && Pixelite.test", timeout=15000)
        page.keyboard.press('Space')
        page.wait_for_function('Sfx.ctx', timeout=20000)
        a = page.evaluate('({ v: Sfx.getVolumes(), master: Sfx.master.gain.value, music: Sfx.musicBus.gain.value })')
        check('the volumes and the mute come back at the next visit', a['v']['music'] == .35 and a['v']['sfx'] == .6 and a['v']['muted'] and a['master'] == 0 and abs(a['music'] - .35) < .01, str(a))
        page.evaluate('Sfx.setMuted(false)')

        # F3: the director
        page.wait_for_function('Sampler.playing', timeout=30000)
        # (the game asks for the song of its place every frame, so move it to a place with another song: Hydroponics plays Escape Velocity)
        page.wait_for_function("Sampler.ready(SONGS['escape-velocity'])", timeout=60000)
        page.evaluate('startSector(2)')
        page.wait_for_function("Sampler.ghosts.length === 1", timeout=5000)
        c = page.evaluate("({ now: Sampler.song.title, old: Sampler.ghosts[0].song.title, playing: Sampler.playing })")
        check('a crossfade keeps the old song going in a deck of its own', c['old'] == SONG_TITLE_CARGO(page) and c['now'] == SONG_TITLE_ESCAPE(page) and c['playing'], str(c))
        page.wait_for_function('Sampler.ghosts.length === 0', timeout=8000)
        check('the old deck lets go when the fade is over', page.evaluate('Sampler.playing && Sampler.song.title') == SONG_TITLE_ESCAPE(page))
        page.evaluate("Music.layer('Drums', false); Music.layer('Drums', false)")
        t = page.evaluate("Sampler.mix.strips.map((S, i) => [Sampler.song.tracks[i] && Sampler.song.tracks[i].name, S.layer])")
        check('a layer takes its tracks out', any(n == 'Drums' and l == 0 for n, l in t) or not any(n == 'Drums' for n, _ in t), str(t))
        page.evaluate("Music.layer('Drums', true)")
        page.evaluate("""Music.define('test-hit', { format: 'pixelite-song', title: 'Hit', bpm: 240, bars: 1, tracks: [{ instrument: 'bell', notes: [[0, 96, 72, 110], [96, 96, 79, 110]] }] })""")
        page.evaluate("Music.stinger('test-hit')")   # its bell is made first if it is not there yet, then it plays
        page.wait_for_function('Music.ducked === 1', timeout=30000)
        page.wait_for_timeout(250)
        duck = page.evaluate('({ ducked: Music.ducked, level: Sampler.out.gain.value, music: Sampler.playing })')
        check('a stinger ducks the music and the music goes on', duck['ducked'] == 1 and duck['level'] < .9 and duck['music'], str(duck))
        page.wait_for_function('Music.ducked === 0', timeout=8000)
        page.wait_for_timeout(1500)
        check('the music comes back up when the stinger is over', page.evaluate('Sampler.out.gain.value') > .95)

        check('no page errors', not errors, '; '.join(errors[:3]))
        browser.close()


def SONG_TITLE_CARGO(page):
    return page.evaluate("SONGS['cargo-bay'].title")


def SONG_TITLE_ESCAPE(page):
    return page.evaluate("SONGS['escape-velocity'].title")


if __name__ == '__main__':
    for m in (sys.argv[1:] or ['2d', 'gl']):
        run(m)
    if failures:
        print('FAILED:', ', '.join(failures))
        sys.exit(1)
    print('all engine sound checks passed')
