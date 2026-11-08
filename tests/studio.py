#!/usr/bin/env python3
"""The SOUND STUDIO (/studio/) and the engine's Sampler, in a real browser against the built site (serves dist/ itself, with
a stand-in for the songs API). The sound is checked by rendering offline: pitch, the SNES voice limit, the echo dying away,
the EQ, every instrument at a like loudness. The studio is driven like a person would: notes with the mouse, undo, a fake
MIDI keyboard recording with the sustain pedal, the computer keyboard, saving (and a save that clashes), the draft
surviving a reload, a WAV export. Build first: npm run build.

  python3 tests/studio.py
"""
import json, threading, functools, struct
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
    pg.goto(f'{BASE}/studio/'); pg.wait_for_function('window.studio && studio.st.song')

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
    check('no page errors', not errs, errs)
    b.close()
srv.shutdown()
print('all studio checks passed' if not failures else 'FAILED: ' + ', '.join(failures))
raise SystemExit(1 if failures else 0)
