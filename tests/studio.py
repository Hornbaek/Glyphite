#!/usr/bin/env python3
"""The SOUND STUDIO (/studio/) and the engine's Sampler, in a real browser against the built site (serves dist/ itself, with
a stand-in for the songs API). The sound is checked by rendering offline: pitch, the SNES voice limit, the echo dying away,
the EQ, every instrument at a like loudness. The studio is driven like a person would: notes with the mouse, undo, a fake
MIDI keyboard recording with the sustain pedal, the computer keyboard, saving (and a save that clashes), the draft
surviving a reload, a WAV export. Projects: the picker, songs kept per game. Samples: a recorded tone loaded, its note heard,
played at the right pitch, looped. WHERE IT PLAYS: the places saved in the song, the level opened in the game with the song inside.
Build first: npm run build.

  python3 tests/studio.py
"""
import io, json, threading, functools, struct, wave, math
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else f'  {detail}'))
    if not ok: failures.append(name)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'

# the songs API, as worker/songs.js answers it
DB, CLASH = {}, {'once': False}
def api(route):
    req = route.request; rest = req.url.split('/api/songs', 1)[1].split('?')[0].strip('/')
    if req.method == 'GET' and not rest:
        return route.fulfill(json={'items': [{'id': k, 'title': v['song']['title'], 'game': v['game'], 'updated_at': v['at'], 'updated_by': 'me', 'size': 1} for k, v in DB.items()]})
    if req.method == 'GET':
        v = DB[rest]; return route.fulfill(json={'id': rest, 'title': v['song']['title'], 'game': v['game'], 'updated_at': v['at'], 'updated_by': 'me', 'song': v['song']})
    if req.method == 'PUT':
        body = json.loads(req.post_data)
        if req.headers.get('x-pixelite') != '1': return route.fulfill(status=403, json={'error': 'no header'})
        cur = DB.get(rest)
        if CLASH['once'] and cur:
            CLASH['once'] = False; cur['at'] = 'elsewhere'
            return route.fulfill(status=409, json={'error': 'changed', 'updated_at': 'elsewhere', 'updated_by': 'other@example.com'})
        if cur and body.get('base') != cur['at']: return route.fulfill(status=409, json={'error': 'changed', 'updated_at': cur['at'], 'updated_by': 'x'})
        at = f't{len(DB)}-{len(json.dumps(body))}'
        DB[rest] = {'song': body['song'], 'game': body.get('game', ''), 'at': at}
        return route.fulfill(json={'id': rest, 'updated_at': at})
    DB.pop(rest, None); route.fulfill(json={'deleted': True})

# a MIDI keyboard the test plays: window.__midi([status, data1, data2])
FAKE_MIDI = """
navigator.requestMIDIAccess = async () => {
  const input = { name: 'Test Keys', type: 'input', onmidimessage: null };
  window.__midi = data => input.onmidimessage && input.onmidimessage({ data: Uint8Array.from(data) });
  return { inputs: new Map([['k', input]]), onstatechange: null };
};"""

SOUND = r"""
async () => {
  const S = Sampler, out = {};
  const song = (ins, notes, extra = {}) => S.check({ format: 'pixelite-song', bpm: 120, bars: 2, ...extra, tracks: [{ instrument: ins, notes, sends: { echo: 0, reverb: 0 } }] });
  const rms = (b, t0, t1) => { const d = b.getChannelData(0), sr = b.sampleRate; let s = 0, n = 0; for (let i = Math.round(t0 * sr); i < t1 * sr; i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
  const pitch = (b, t0, t1) => {   // the strongest frequency between 100 Hz and 1.2 kHz
    const d = b.getChannelData(0), sr = b.sampleRate, a = Math.round(t0 * sr), n = Math.round((t1 - t0) * sr); let best = 0, bf = 0;
    for (let f = 100; f < 1200; f *= 1.001) { let re = 0, im = 0; for (let i = 0; i < n; i += 3) { const w = 2 * Math.PI * f * i / sr; re += d[a + i] * Math.cos(w); im += d[a + i] * Math.sin(w); } const m = re * re + im * im; if (m > best) { best = m; bf = f; } }
    return bf;
  };
  for (const ins of ['piano', 'flute', 'square', 'organ', 'epiano']) out['pitch_' + ins] = pitch(await S.render(song(ins, [[0, 192, 69, 110]]), { seconds: .8, loop: false }), .15, .55);
  const lv = [];
  for (const { id } of S.INSTRUMENTS) lv.push(rms(await S.render(song(id, id === 'kit' ? [[0, 48, 36, 100], [48, 48, 38, 100]] : [[0, 96, 60, 100]]), { seconds: .6, loop: false }), .02, .5));
  out.levels = [Math.min(...lv), Math.max(...lv)];
  const chord = Array.from({ length: 12 }, (_, k) => [0, 384, 48 + k * 3, 100]);
  out.voices = [rms(await S.render(song('organ', chord), { seconds: 1, loop: false }), .3, .8), rms(await S.render(song('organ', chord, { snes: true }), { seconds: 1, loop: false }), .3, .8)];
  const echo = song('marimba', [[0, 24, 72, 120]], { master: { echo: { delay: 8, feedback: .9, fir: 'bright', volume: .8 }, reverb: { volume: 0 } } });
  echo.tracks[0].sends.echo = 1;
  const eb = await S.render(echo, { seconds: 12, loop: false });
  out.echo = [rms(eb, .5, 1.5), rms(eb, 10, 12)];
  const bass = song('fingerbass', [[0, 384, 36, 110]]), b1 = await S.render(bass, { seconds: 1, loop: false });
  bass.tracks[0].eq.low = -15; const b2 = await S.render(bass, { seconds: 1, loop: false });
  out.eq = [rms(b1, .05, .8), rms(b2, .05, .8)];
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.route('**/api/songs**', api)
    pg.route('**/fonts.g*/**', lambda r: r.abort())
    # no project yet: the picker, the listed games and the sketches
    pg.goto(f'{BASE}/studio/'); pg.wait_for_selector('#projects:not([hidden]) .proj')
    names = pg.eval_on_selector_all('#projects .proj b', 'bs => bs.map(b => b.textContent)')
    check('without a project the studio asks for one: the listed games and the sketches', 'Space Mouse' in names and 'Sketches' in names and 'Cave Drone' not in names, names)
    pg.click('#projects .proj:has-text("Space Mouse")'); pg.wait_for_function('window.studio && studio.st.song')
    check('a project opens its studio', 'game=spacemouse' in pg.url and pg.text_content('#projName') == 'Space Mouse')

    # ---- the sound itself ----
    snd = pg.evaluate(SOUND)
    check('pitch: an A4 sounds at 440 Hz on every kind of instrument', all(abs(snd[k] / 440 - 1) < .012 for k in snd if k.startswith('pitch_')), {k: round(v, 1) for k, v in snd.items() if k.startswith('pitch_')})
    check('every instrument makes sound, all within 3x of each other\'s loudness', snd['levels'][0] > .003 and snd['levels'][1] / snd['levels'][0] < 3, snd['levels'])
    check('SNES limits: 12 notes at once, only 8 sound', snd['voices'][1] < snd['voices'][0] * .85, snd['voices'])
    check('the SNES echo at 90% feedback dies away (its filter never gains)', snd['echo'][1] < snd['echo'][0] * .3, snd['echo'])
    check('EQ: -15 dB of low shelf takes the weight out of the bass', snd['eq'][1] < snd['eq'][0] * .6, snd['eq'])

    # ---- the studio ----
    st = lambda js: pg.evaluate(f'(() => {{ const st = studio.st; return {js}; }})()')
    check('opens with a four-track song', st('st.song.tracks.map(t => t.instrument)') == ['piano', 'fingerbass', 'strings', 'kit'])
    roll = pg.locator('#roll'); box = roll.bounding_box()
    view = lambda: st('({ keyw: 54, ruler: 18, rh: 12, zoom: st.view.zoom, top: st.view.top, x: st.view.x })')   # where the roll is scrolled now
    def at(tick, note):
        g = view(); return (box['x'] + g['keyw'] + (tick - g['x']) * g['zoom'] + 4, box['y'] + g['ruler'] + (g['top'] - note) * g['rh'] + 6)
    geo = view()
    pg.mouse.click(*at(96, 72)); pg.mouse.click(*at(192, 76))
    check('clicking the roll adds notes on the grid', st('st.song.tracks[0].notes.map(n => [n[0], n[2]])') == [[96, 72], [192, 76]], st('st.song.tracks[0].notes'))
    x0, y0 = at(96, 72); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0 + 96 * geo['zoom'], y0 - 2 * geo['rh'], steps=6); pg.mouse.up()
    check('dragging a note moves it in time and pitch', st('st.song.tracks[0].notes.map(n => [n[0], n[2]])') == [[192, 74], [192, 76]], st('st.song.tracks[0].notes'))
    pg.keyboard.press('Control+z')
    check('undo puts it back', st('st.song.tracks[0].notes.map(n => [n[0], n[2]])') == [[96, 72], [192, 76]])
    pg.keyboard.press('Control+Shift+z'); pg.keyboard.press('Control+z')
    pg.mouse.click(*at(192, 76), button='right')
    check('right-click deletes', st('st.song.tracks[0].notes.length') == 1)

    pg.keyboard.press('Space'); pg.wait_for_timeout(900)
    check('play moves the position on', st('Sampler.playing') and st('Sampler.position()') > 96, st('Sampler.position()'))
    pg.keyboard.press('Space'); pg.wait_for_timeout(100)
    check('and stops', not st('Sampler.playing'))

    # record from the MIDI keyboard, no count-in: a C major arpeggio, the last note held by the sustain pedal
    pg.click('#midiBtn'); pg.wait_for_function("document.querySelector('#midiInfo').textContent.includes('Test Keys')")
    check('a MIDI keyboard is found', 'Test Keys' in pg.text_content('#midiInfo'))
    pg.click('#trackList .trk:nth-child(3)')
    check('choosing a track selects it', st('st.sel') == 2)
    pg.click('#countBtn'); pg.keyboard.press('KeyR'); pg.wait_for_timeout(150)
    midi = lambda d: pg.evaluate(f'window.__midi({json.dumps(d)})')
    for n in (60, 64, 67):
        midi([0x90, n, 100]); pg.wait_for_timeout(260); midi([0x80, n, 0]); pg.wait_for_timeout(30)
    midi([0xB0, 64, 127]); midi([0x90, 72, 90]); pg.wait_for_timeout(120); midi([0x80, 72, 0]); pg.wait_for_timeout(400)
    live = st('st.live.size'); midi([0xB0, 64, 0]); pg.wait_for_timeout(50)
    check('the sustain pedal holds a note after its key is let go, and lets it go', live == 1 and st('st.live.size') == 0, live)
    pg.keyboard.press('Space'); pg.wait_for_timeout(100)
    rec = st('st.song.tracks[2].notes')
    check('recording keeps what was played, on the grid', [n[2] for n in rec] == [60, 64, 67, 72] and all(n[0] % 24 == 0 for n in rec)
          and rec[0][0] < rec[1][0] < rec[2][0] < rec[3][0], rec)
    check('the pedal made the last note longer than its key press', rec[3][1] > rec[0][1], rec)
    pg.keyboard.press('Control+z'); undone = st('st.song.tracks[2].notes.length'); pg.keyboard.press('Control+Shift+z')
    check('a recording is one undo step', undone == 0 and st('st.song.tracks[2].notes.length') == 4, undone)

    # the computer keyboard plays the selected track
    pg.click('#keysBtn'); pg.keyboard.down('KeyA'); pg.wait_for_timeout(60)
    check('KEYS: A plays a C', st('[...st.live.values()].map(l => l.note)') == [60])
    pg.keyboard.up('KeyA'); pg.click('#keysBtn')

    # instruments, SNES limits
    pg.select_option('#trackList .trk:nth-child(3) .tins', 'choir')
    check('changing the instrument renames a track named after the old one', st('[st.song.tracks[2].instrument, st.song.tracks[2].name]') == ['choir', 'Choir'])
    pg.click('#snesBtn')
    check('SNES LIMITS greys out what the console did not have', st('st.song.snes') and pg.locator('#strip .sec.off').count() == 2)
    pg.click('#snesBtn')

    # saving, a clash, the list, the draft
    pg.fill('#title', 'Test tune'); pg.press('#title', 'Enter')
    pg.click('#saveBtn'); pg.wait_for_function("document.querySelector('#saved').textContent === 'saved'")
    sid = st('st.meta.id')
    check('save sends the song to the site', sid in DB and DB[sid]['song']['tracks'][2]['instrument'] == 'choir', list(DB))
    pg.click('#trackList .trk:nth-child(1)'); pg.mouse.click(*at(384, 79)); CLASH['once'] = True
    pg.click('#saveBtn'); pg.wait_for_function("document.querySelector('#saved').textContent === 'saved'")
    check('a song saved elsewhere since is saved over only when the owner says so', len(DB[sid]['song']['tracks'][0]['notes']) == 2)
    check('the saved songs are listed', pg.locator('#songs option', has_text='Test tune').count() == 1)
    pg.mouse.click(*at(480, 81)); pg.wait_for_timeout(800)
    pg.reload(); pg.wait_for_function('window.studio && studio.st.song')
    check('the draft (unsaved changes too) comes back after a reload', st('st.song.tracks[0].notes.length') == 3 and st('st.meta.id') == sid and st('st.dirty'))

    # a WAV of the song
    pg.click('#moreBtn')
    with pg.expect_download() as dl: pg.click('#wavBtn')
    data = Path(dl.value.path()).read_bytes()
    pcm = struct.unpack('<%dh' % ((len(data) - 44) // 2), data[44:44 + (len(data) - 44) // 2 * 2])
    check('WAV export: a 16-bit stereo file with music in it', data[:4] == b'RIFF' and data[8:12] == b'WAVE' and max(abs(v) for v in pcm) > 1000, len(data))

    # ---- samples: a tone a little sharp of A4 (440 Hz + 2 harmonics), loaded onto a new track ----
    pg.goto(f'{BASE}/studio/?game=spacemouse'); pg.wait_for_function('window.studio && studio.st.song')
    sr, f0 = 44100, 440 * 2 ** (30 / 1200)
    frames = b''.join(struct.pack('<h', int(32000 * math.exp(-i / sr / 1.2) * (.6 * math.sin(2 * math.pi * f0 * i / sr) + .25 * math.sin(4 * math.pi * f0 * i / sr)))) for i in range(int(sr * 2)))
    buf = io.BytesIO(); w = wave.open(buf, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b'\0\0' * 3000 + frames); w.close()
    pg.select_option('#addIns', 'strings'); pg.click('#addTrack'); n = st('st.song.tracks.length')
    pg.select_option(f'#trackList .trk:nth-child({n}) .tins', '__load')
    pg.set_input_files('#sampleFile', files=[{'name': 'Glass hum.wav', 'mimeType': 'audio/wav', 'buffer': buf.getvalue()}])
    pg.wait_for_function('Object.keys(studio.st.song.samples).length === 1', timeout=15000)
    sm = st('Object.values(st.song.samples)[0]')
    check('a sound loads as a sample: named after the file, the note it plays heard (A4 + 30 cents)', sm['name'] == 'Glass hum' and abs(sm['root'] - 69.3) < .12, {k: sm[k] for k in ('name', 'root', 'rate', 'loop')})
    check('the track plays it', st(f'st.song.tracks[{n - 1}].instrument') == 'sample:glass-hum' and st(f'st.song.tracks[{n - 1}].name') == 'Glass hum')
    pitch = pg.evaluate('''async () => {
      const s = JSON.parse(JSON.stringify(studio.st.song)); const t = s.tracks.find(t => t.instrument.startsWith('sample:'));
      s.tracks = [{ ...t, notes: [[0, 192, 76, 110]], sends: { echo: 0, reverb: 0 }, chorus: { mix: 0, rate: 1, depth: 0 } }];
      const b = await Sampler.render(s, { seconds: .8, loop: false }), d = b.getChannelData(0), sr = b.sampleRate, a = Math.round(.1 * sr), n = Math.round(.4 * sr);
      let best = 0, bf = 0; for (let f = 500; f < 900; f *= 1.0005) { let re = 0, im = 0; for (let i = 0; i < n; i += 2) { const w = 2 * Math.PI * f * i / sr; re += d[a + i] * Math.cos(w); im += d[a + i] * Math.sin(w); } if (re * re + im * im > best) { best = re * re + im * im; bf = f; } }
      return bf; }''')
    check('played as an E5 it sounds at 659 Hz (pitched from the note it plays)', abs(pitch / 659.26 - 1) < .01, pitch)
    pg.click('#strip [data-a="loop"]')
    check('LOOP holds a note by repeating the sample\'s end', st('Object.values(st.song.samples)[0].loop') > 0)
    pg.select_option('#strip .sec select', '16000'); pg.wait_for_function('Object.values(studio.st.song.samples)[0].rate === 16000', timeout=10000)
    check('more grit: the sample made again at 16 kHz, half the size', st('Object.values(st.song.samples)[0].brr.length') < sm['brr'].__len__() * .6)
    pg.click('#saveBtn'); pg.wait_for_function("document.querySelector('#saved').textContent === 'saved'")
    saved = DB[st('st.meta.id')]
    check('the sample is saved inside the song, for the project', 'glass-hum' in saved['song']['samples'] and saved['game'] == 'spacemouse')

    # ---- WHERE IT PLAYS: the places, and the level opened in the game with this song inside ----
    pg.click('#tabWhere'); pg.wait_for_selector('#where .place')
    places = pg.eval_on_selector_all('#where .pname', 'p => p.map(x => x.textContent)')
    check('the places: the title screen and every level by name', places[:2] == ['Title screen', 'Cargo Bay'] and len(places) == 4, places)
    pg.check('#where [data-place="title"]'); pg.check('#where [data-place="1"]')
    pg.fill('#where textarea', 'when the peas start falling'); pg.dispatch_event('#where textarea', 'change')
    check('ticked places are kept in the song', st('st.song.places') == {'title': True, 'levels': [1], 'note': 'when the peas start falling'}, st('st.song.places'))
    pg.click('#where [data-go="1"]')
    pg.wait_for_function("document.querySelector('#pvFrame').contentWindow.location.pathname.startsWith('/games/spacemouse/')", timeout=10000)
    game = next(f for f in pg.frames if '/games/spacemouse/' in f.url)   # the engine's names are the page's own (const), not window's
    game.wait_for_function("typeof Sampler !== 'undefined' && Sampler.forced && SEC && SEC.n === 2", timeout=15000)
    check('▶ HERE opens that level in the game, playing this song instead of its own', game.evaluate('SEC.n') == 2 and game.evaluate('Sampler.forced.title') == st('st.song.title'))
    game.click('canvas'); pg.wait_for_timeout(600)
    check('one click in the game and the song sounds there', game.evaluate('Sampler.playing') and game.evaluate("Sampler.song.tracks.some(t => t.instrument === 'sample:glass-hum')"))
    pg.click('#pvOwn'); pg.wait_for_timeout(200)
    check("GAME'S OWN MUSIC gives the music back", game.evaluate('Sampler.forced') is None)
    pg.click('#tabNotes')
    check('no page errors', not errs, errs)
    b.close()
srv.shutdown()
print('all studio checks passed' if not failures else 'FAILED: ' + ', '.join(failures))
raise SystemExit(1 if failures else 0)
