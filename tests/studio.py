#!/usr/bin/env python3
"""The SOUND STUDIO (/studio/) and the engine's Sampler, in a real browser against the built site (serves dist/ itself, with
a stand-in for the songs API). The sound is checked by rendering offline: pitch, the SNES voice limit, the echo dying away,
the EQ, every instrument at a like loudness. The studio is driven like a person would: notes with the mouse, undo, a fake
MIDI keyboard recording with the sustain pedal, the computer keyboard, saving (and a save that clashes), the draft
surviving a reload, a WAV export, MIDI files out and in. Automation: a tempo change, a volume lane, glide, lanes drawn with the mouse. Projects: the picker, songs kept per game. Samples: a recorded tone loaded, its note heard,
played at the right pitch, looped, with a loop end of its own, recorded with a (fake) microphone, several samples as one multisample. More lanes:
the echo and reverb sends, pitch bend, the loop point, the echo's own level; curves, tempo ramps. MIDI: a choice of instruments. WHERE IT PLAYS: the places saved in the song, the level opened in the game with the song inside.
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

SOUND2 = r"""
async () => {
  const S = Sampler, out = {}, quiet = { echo: 0, reverb: 0 };
  const base = { format: 'pixelite-song', bpm: 120, bars: 4, master: { reverb: { volume: 0 }, comp: 0, echo: { delay: 8, feedback: .9, fir: 'flat', volume: .9 } } };
  const rms = (b, t0, t1) => { const d = b.getChannelData(0), sr = b.sampleRate; let s = 0, n = 0; for (let i = Math.round(t0 * sr); i < t1 * sr; i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
  const pitch = (b, t0, t1) => { const d = b.getChannelData(0), sr = b.sampleRate, a = Math.round(t0 * sr), n = Math.round((t1 - t0) * sr); let best = 0, bf = 0;
    for (let f = 150; f < 1200; f *= 1.002) { let re = 0, im = 0; for (let i = 0; i < n; i += 2) { const w = 2 * Math.PI * f * i / sr; re += d[a + i] * Math.cos(w); im += d[a + i] * Math.sin(w); } if (re * re + im * im > best) { best = re * re + im * im; bf = f; } } return bf; };
  const render = (song, secs) => S.render(S.check(song), { seconds: secs, loop: false });
  // the echo send lane: closed for the first note, open for the second; the echo's own level lane the same
  const marimba = auto => ({ ...base, tracks: [{ instrument: 'marimba', notes: [[0, 24, 72, 120], [768, 24, 72, 120]], sends: { echo: 1, reverb: 0 }, auto }] });
  const sendLane = await render(marimba({ echo: [[0, 0], [767, 0], [768, 1]] }), 7);
  out.send = [rms(sendLane, .2, 1.2), rms(sendLane, 4.2, 5.2)];
  const levelLane = await render({ ...marimba({}), auto: { echo: [[0, 0], [767, 0], [768, .9]] } }, 7);
  out.level = [rms(levelLane, .2, 1.2), rms(levelLane, 4.2, 5.2)];
  const open = await render(marimba({}), 7); out.open = [rms(open, .2, 1.2), rms(open, 4.2, 5.2)];
  // the pitch lane: an organ A4 that bends up an octave in the first second
  const bent = await render({ ...base, tracks: [{ instrument: 'organ', notes: [[0, 1536, 69, 110]], sends: quiet, auto: { pitch: [[0, 0], [96, 0], [192, 12]] } }] }, 3);
  out.bend = [pitch(bent, .15, .4), pitch(bent, 1.4, 1.9)];
  // a tempo ramp: 120 → 60 BPM over the first four beats; a note at tick 384 begins when the ramp ends, at 4 * ln2 / ... = 2.77 s
  const ramp = (await render({ ...base, tempo: [[384, 60, 1]], tracks: [{ instrument: 'marimba', notes: [[384, 24, 72, 120]], sends: quiet }] }, 4)).getChannelData(0);
  out.ramp = -1; for (let i = 0; i < ramp.length; i++) if (Math.abs(ramp[i]) > .02) { out.ramp = i / 44100; break; }
  // a curved volume lane: rushes down, then settles; halfway it is far quieter than the straight line's
  const fade = c => render({ ...base, tracks: [{ instrument: 'organ', notes: [[0, 1536, 60, 110]], sends: quiet, auto: { volume: [[0, 1], [384, 0, c]] } }] }, 3);
  out.curve = [rms(await fade(0), .9, 1.1), rms(await fade(-1), .9, 1.1)];
  // a sample whose loop ends before the end of the sound: a 440 Hz half, then an 880 Hz half
  const rate = 32000, n = 12800, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * (i < 6400 ? 440 : 880) * i / rate) * .8;
  const two = loopEnd => ({ ...base, samples: { two: { name: 'Two', rate, root: 69, loop: 0, ...(loopEnd ? { loopEnd } : {}), brr: S.toB64(S.brrEncode(x)) } }, tracks: [{ instrument: 'sample:two', notes: [[0, 288, 69, 110]], sends: quiet }] });
  out.loopEnd = [pitch(await render(two(6400), 1.6), .62, .78), pitch(await render(two(0), 1.6), .62, .78)];
  // a multisample: the note picks the zone by its range (the samples' declared notes are deliberately wrong for the ranges)
  const tone = f => S.toB64(S.brrEncode(Float32Array.from({ length: 16000 }, (_, i) => Math.sin(2 * Math.PI * f * i / rate) * .8)));
  const multi = await render({ ...base, samples: { lo: { name: 'Lo', root: 60, brr: tone(220) }, hi: { name: 'Hi', root: 70, brr: tone(660) } },
    multis: { m: { name: 'M', zones: [{ sample: 'lo', lo: 0, hi: 70 }, { sample: 'hi', lo: 71, hi: 127 }] } }, tracks: [{ instrument: 'multi:m', notes: [[0, 96, 69, 110], [192, 96, 76, 110]], sends: quiet }] }, 2);
  out.multi = [pitch(multi, .1, .4), pitch(multi, 1.1, 1.4)];
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True, permissions=['microphone'])
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

    # ---- MIDI files: the song as a .mid, and a .mid opened as a new song (in a studio of its own, so this one's draft is left alone) ----
    pg.click('#moreBtn')
    with pg.expect_download() as dl: pg.click('#midiExportBtn')
    mid_path = Path(dl.value.path()); mid = mid_path.read_bytes()
    check('MIDI export: a Standard MIDI File named for the song', mid[:4] == b'MThd' and mid[14:18] == b'MTrk' and dl.value.suggested_filename.endswith('.mid'), (mid[:20], dl.value.suggested_filename))
    mine = st('st.song.tracks.map(t => [t.name, t.instrument, t.notes])')
    ctx2 = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    pg2 = ctx2.new_page(); errs2 = []; dialogs = []; answer = {'accept': True}
    pg2.on('pageerror', lambda e: errs2.append(str(e)))
    pg2.on('dialog', lambda d: (dialogs.append(d.message), d.accept() if answer['accept'] else d.dismiss()))
    pg2.route('**/api/songs**', api); pg2.route('**/fonts.g*/**', lambda r: r.abort())
    pg2.goto(f'{BASE}/studio/?game=spacemouse'); pg2.wait_for_function('window.studio && studio.st.song')
    st2 = lambda js: pg2.evaluate(f'(() => {{ const st = studio.st; return {js}; }})()')
    def choose(page, only=None):   # the instrument picker: all ticked, or only these
        page.wait_for_selector('#midiPick[open]')
        if only is not None:
            for i in range(page.locator('#midiPickList input').count()):
                page.locator('#midiPickList input').nth(i).set_checked(i in only)
        page.click('#midiPickOk')
    pg2.set_input_files('#importMidi', str(mid_path)); choose(pg2); pg2.wait_for_function("studio.st.song.title === 'Test tune'")
    check('MIDI import: the exported file opens as the same song (names, instruments, every note)', st2('st.song.tracks.map(t => [t.name, t.instrument, t.notes])') == mine, st2('st.song.tracks.map(t => [t.name, t.instrument, t.notes.length])'))
    check('a MIDI file opens as a new song: not saved, not the old one', st2('st.dirty') and st2('st.meta.id') is None and 'MIDI file opened' in pg2.text_content('#saved'), pg2.text_content('#saved'))
    answer['accept'] = False
    pg2.set_input_files('#importMidi', str(ROOT / 'games/regolith/music/descent.mid')); choose(pg2); pg2.wait_for_timeout(500)
    check('opening another file asks before it throws away unsaved changes, and "cancel" keeps them', any('Replace the song' in m for m in dialogs) and st2('st.song.title') == 'Test tune', dialogs)
    answer['accept'] = True
    pg2.set_input_files('#importMidi', str(ROOT / 'games/regolith/music/descent.mid'))
    names = pg2.eval_on_selector_all('#midiPickList .pickrow b', 'bs => bs.map(b => b.textContent)')
    check('a MIDI file with several instruments asks which to open, listing them all', names == ['Lead', 'Arpeggio', 'Bass', 'Counter', 'Drums'], names)
    choose(pg2, only=[2, 4]); pg2.wait_for_function("studio.st.song.title === 'Powered Descent'")
    check('opening some of them: just those tracks, and only their notes make the song', st2('st.song.tracks.map(t => t.name)') == ['Bass', 'Drums'], st2('st.song.tracks.map(t => t.name)'))
    pg2.set_input_files('#importMidi', str(ROOT / 'games/regolith/music/descent.mid')); choose(pg2); pg2.wait_for_function('studio.st.song.tracks.length === 5')
    check('a MIDI file made elsewhere (Regolith\'s descent) opens: tempo, drums, tracks', st2('st.song.bpm') == 132 and st2("st.song.tracks.some(t => t.instrument === 'kit')") and st2('st.song.tracks.length') == 5, st2('[st.song.bpm, st.song.tracks.map(t => t.instrument)]'))
    pg2.click('#playBtn'); pg2.wait_for_timeout(700)
    check('and it plays', st2('studio.S.playing'))
    pg2.click('#playBtn')
    pg2.set_input_files('#importMidi', files=[{'name': 'nope.mid', 'mimeType': 'audio/midi', 'buffer': b'this is not a MIDI file at all'}]); pg2.wait_for_timeout(400)
    check('a file that is not MIDI says so and changes nothing', any('cannot be opened' in m and 'not a MIDI file' in m for m in dialogs) and st2('st.song.title') == 'Powered Descent', dialogs)
    check('no page errors in the MIDI studio', not errs2, errs2)
    ctx2.close()

    # ---- beats: the BEAT grid, a beat as a pattern a clip plays, a beat made of selected notes ----
    ctx3 = b.new_context(viewport={'width': 1440, 'height': 900})
    pg3 = ctx3.new_page(); errs3 = []
    pg3.on('pageerror', lambda e: errs3.append(str(e))); pg3.on('dialog', lambda d: d.accept())
    pg3.route('**/api/songs**', api); pg3.route('**/fonts.g*/**', lambda r: r.abort())
    pg3.goto(f'{BASE}/studio/?game=spacemouse'); pg3.wait_for_function('window.studio && studio.st.song')
    st3 = lambda js: pg3.evaluate(f'(() => {{ const st = studio.st; return {js}; }})()')
    cell = lambda note, i: pg3.locator(f'#beatGrid .grow[data-note="{note}"] .gc').nth(i)
    pg3.click('#trackList .trk:nth-child(4)'); pg3.click('#addBeat')
    check('+ BEAT: a beat of a bar, a clip of it at the start, and the step grid open', st3('[Object.keys(st.song.patterns), st.song.tracks[3].clips]') == [['beat-1'], [{'at': 0, 'p': 'beat-1', 'len': 384, 'off': 0}]] and st3("st.open.p") == 'beat-1' and pg3.is_visible('#beatGrid') and pg3.is_hidden('.rollWrap'), st3('st.song.patterns'))
    check('the grid has a row for each main sound and 16 steps in a bar', pg3.locator('#beatGrid .grow').count() == 12 and pg3.locator('#beatGrid .grow').first.locator('.gc').count() == 16)
    for i in (0, 4, 8, 12): cell(36, i).click()
    check('a click puts a hit on the step, at its tick, medium hard', st3('st.song.patterns["beat-1"].notes.map(n => [n[0], n[2], n[3]])') == [[0, 36, 100], [96, 36, 100], [192, 36, 100], [288, 36, 100]], st3('st.song.patterns["beat-1"].notes'))
    check('and the track plays them through its clip, where the clip is', st3('Sampler.notesOf(st.song, st.song.tracks[3]).map(n => n[0])') == [0, 96, 192, 288])
    cell(38, 4).click(modifiers=['Shift']); v1 = st3('st.song.patterns["beat-1"].notes.find(n => n[2] === 38)[3]')
    cell(38, 4).click(modifiers=['Shift']); v2 = st3('st.song.patterns["beat-1"].notes.find(n => n[2] === 38)[3]')
    cell(38, 4).click(modifiers=['Shift']); v3 = st3('st.song.patterns["beat-1"].notes.find(n => n[2] === 38)[3]')
    cell(38, 4).click(modifiers=['Shift']); v4 = st3('st.song.patterns["beat-1"].notes.find(n => n[2] === 38)[3]')
    check('shift-click goes round soft, medium, hard and soft again', [v1, v2, v3, v4] == [70, 100, 127, 70], [v1, v2, v3, v4])
    check('the accent shows on the cell', cell(38, 4).get_attribute('class').split() .count('a0') == 1)
    g0 = cell(42, 0).bounding_box(); g7 = cell(42, 7).bounding_box()
    pg3.mouse.move(g0['x'] + 5, g0['y'] + 5); pg3.mouse.down(); pg3.mouse.move(g7['x'] + 5, g7['y'] + 5, steps=12); pg3.mouse.up()
    hats = st3('st.song.patterns["beat-1"].notes.filter(n => n[2] === 42).map(n => n[0] / 24)')
    check('dragging across a row paints a run of hits', hats == list(range(8)), hats)
    pg3.keyboard.press('Control+z')
    check('a painted run is one undo step', st3('st.song.patterns["beat-1"].notes.filter(n => n[2] === 42).length') == 0)
    pg3.mouse.move(g0['x'] + 5, g0['y'] + 5); pg3.mouse.down(); pg3.mouse.move(g7['x'] + 5, g7['y'] + 5, steps=12); pg3.mouse.up()
    cell(42, 2).hover(); b2 = cell(42, 2).bounding_box(); b5 = cell(42, 5).bounding_box()
    pg3.mouse.move(b2['x'] + 5, b2['y'] + 5); pg3.mouse.down(); pg3.mouse.move(b5['x'] + 5, b5['y'] + 5, steps=8); pg3.mouse.up()
    check('starting on a hit and dragging erases a run', st3('st.song.patterns["beat-1"].notes.filter(n => n[2] === 42).map(n => n[0] / 24)') == [0, 1, 6, 7])
    pg3.select_option('#beatGrid .grow[data-note="46"] .gfill', '4')
    check('FILL: every 4th step of a row', st3('st.song.patterns["beat-1"].notes.filter(n => n[2] === 46).map(n => n[0] / 24)') == [0, 4, 8, 12])
    pg3.select_option('#beatGrid .grow[data-note="46"] .gfill', '0')
    check('FILL: clear takes them away', st3('st.song.patterns["beat-1"].notes.filter(n => n[2] === 46).length') == 0)
    # the beat on its own
    pg3.click('#patPlay'); pg3.wait_for_function('studio.S.playing && studio.S.position() > 100')
    check('▶ BEAT plays just the beat, looped: the Sampler holds a copy of the song, not the song', st3('Sampler.song !== st.song && !!st.beat && Sampler.song.loop.end') == 384 and pg3.locator('#beatGrid .gc.now').count() == 12)
    n0 = st3('Sampler.notesOf(st.beat, st.beat.tracks[3]).length'); cell(49, 1).click()
    check('a step clicked while it plays is in what plays (live), and the other tracks are silent', st3('Sampler.notesOf(st.beat, st.beat.tracks[3]).length') == n0 + 1 and st3('st.beat.tracks.filter((t, i) => i !== 3).every(t => Sampler.notesOf(st.beat, t).length === 0)'))
    check('the song itself is untouched while a beat plays (its notes stay empty, the beat is the Sampler\'s copy)', st3('st.song.tracks[3].notes.length') == 0 and st3('Sampler.song !== st.song'), [st3('st.song.tracks[3].notes.length'), st3('Sampler.song !== st.song'), st3('Sampler.playing')])
    check('a beat plays without the song\'s tempo changes and automation lanes', st3('Sampler.song.tempo.length') == 0 and st3('Sampler.song.tracks.every(t => t.auto.volume.length === 0 && t.auto.pan.length === 0)'))
    pg3.keyboard.press('Space'); pg3.wait_for_function('!studio.S.playing')
    check('Space stops it, and the song is the Sampler\'s again', st3('Sampler.song === st.song && !st.beat'))
    # length and the beat's notes
    pg3.fill('#patBar .plen', '0.5'); pg3.dispatch_event('#patBar .plen', 'change')
    check('a shorter beat keeps only the notes inside it (half a bar: steps 0..7)', st3('st.song.patterns["beat-1"].len') == 192 and all(n[0] < 192 for n in st3('st.song.patterns["beat-1"].notes')) and pg3.locator('#beatGrid .grow').first.locator('.gc').count() == 8, st3('st.song.patterns["beat-1"]'))
    pg3.evaluate('document.activeElement.blur()'); pg3.keyboard.press('Control+z')
    check('undo gives the length and the notes back', st3('st.song.patterns["beat-1"].len') == 384 and st3('st.song.patterns["beat-1"].notes.length') > 8, st3('st.song.patterns["beat-1"]'))
    pg3.click('#patBar [data-v="roll"]')
    check('ROLL: the same beat as notes in the piano roll, named for the kit', pg3.is_visible('.rollWrap') and pg3.is_hidden('#beatGrid'))
    # editing in an open beat never takes a note past its end
    saved = st3('JSON.stringify(st.song.patterns["beat-1"].notes)')
    st3('(st.song.patterns["beat-1"].notes = [[360, 24, 36, 100]], st.picked = new Set(st.song.patterns["beat-1"].notes), st.start = 1152, st.focus = "roll", 0)')
    pg3.focus('#roll'); pg3.keyboard.press('ArrowRight')
    check('a note at the last step is not moved off the end of the beat (it would be lost)', st3('st.song.patterns["beat-1"].notes.map(n => n[0])') == [360], st3('st.song.patterns["beat-1"].notes'))
    pg3.keyboard.press('Control+c'); pg3.keyboard.press('Control+v')
    check('paste in an open beat goes to its own start (not the song\'s start mark), and cannot push an empty undo step', st3('st.song.patterns["beat-1"].notes.map(n => n[0])') == [0, 360], st3('st.song.patterns["beat-1"].notes'))
    n_undo = st3('st.undo.length'); st3('st.picked = new Set([st.song.patterns["beat-1"].notes[1]])'); pg3.keyboard.press('Control+d')
    check('duplicating a note at the end of the beat has no room: nothing is added and no undo step is made', len(st3('st.song.patterns["beat-1"].notes')) == 2 and st3('st.undo.length') == n_undo, st3('st.song.patterns["beat-1"].notes'))
    st3(f'(st.song.patterns["beat-1"].notes = {saved}, 0)')
    pg3.keyboard.press('Escape')
    check('Escape closes the beat', st3('st.open') is None and pg3.is_hidden('#patBar') and pg3.is_visible('.rollWrap'))
    check('the beat list says what plays it, and a beat a clip plays cannot be deleted', pg3.locator('#beatList .beat').count() == 1 and pg3.locator('#beatList .bdel').is_disabled() and '×1' in pg3.text_content('#beatList .beat'))
    pg3.dblclick('#arr', position={'x': 30, 'y': 18 + 3 * 26 + 13})
    check('double-clicking a clip in the overview opens its beat', st3('st.open && st.open.p') == 'beat-1' and st3('st.sel') == 3)
    pg3.keyboard.press('Escape'); pg3.keyboard.press('Escape')
    check('Escape clears the clip selection first, then closes the beat', st3('st.cs.size') == 0 and st3('st.open') is None)
    # the arranger: clips as blocks in the lanes
    abox = pg3.locator('#arr').bounding_box(); kk = (abox['width'] - 2) / st3('Sampler.songEnd(st.song)')
    ax = lambda t: abox['x'] + t * kk; ay = lambda i: abox['y'] + 18 + i * 26 + 13
    def drag(x0, y0, x1, y1, mods=()):
        for m in mods: pg3.keyboard.down(m)
        pg3.mouse.move(x0, y0); pg3.mouse.down(); pg3.mouse.move(x1, y1, steps=8); pg3.mouse.up()
        for m in mods: pg3.keyboard.up(m)
    clips = lambda: st3('st.song.tracks[3].clips.map(c => [c.at, c.len, c.off])')
    per_bar = len(st3('st.song.patterns["beat-1"].notes'))
    drag(ax(384) - 3, ay(3), ax(1536), ay(3))
    check('dragging the right edge loops the beat: four bars, on the bar', clips() == [[0, 1536, 0]] and len(st3('Sampler.notesOf(st.song, st.song.tracks[3])')) == 4 * per_bar, clips())
    pg3.keyboard.press('Control+z')
    check('and it is one undo step', clips() == [[0, 384, 0]])
    drag(ax(100), ay(3), ax(100 + 768), ay(3))
    check('dragging the body moves the clip, to a bar', clips() == [[768, 384, 0]], clips())
    drag(ax(900), ay(3), ax(900 - 384), ay(3), mods=['Alt'])
    check('Alt-drag copies the clip', clips() == [[384, 384, 0], [768, 384, 0]] and st3('st.cs.size') == 1, clips())
    drag(ax(1152) - 3, ay(3), ax(1536), ay(3))
    drag(ax(768) + 2, ay(3), ax(768 + 96), ay(3), mods=['Shift'])
    check('dragging the left edge trims the start: the end stays, the beat starts 96 ticks in', clips()[1] == [864, 672, 96], clips())
    pg3.keyboard.press('Control+z'); pg3.keyboard.press('Control+z')
    st3('(st.start = 960, st.cs = new Set([st.song.tracks[3].clips[1]]), st.focus = "arr")')
    pg3.keyboard.press('Control+e')
    check('Ctrl+E cuts the selected clip at the start mark into two clips of the same beat', clips() == [[384, 384, 0], [768, 192, 0], [960, 192, 192]], clips())
    pg3.keyboard.press('Control+z')
    st3('(st.cs = new Set([st.song.tracks[3].clips[1]]), st.focus = "arr")')
    pg3.keyboard.press('Control+d')
    check('Ctrl+D duplicates the selected clip after itself', clips() == [[384, 384, 0], [768, 384, 0], [1152, 384, 0]] and st3('st.cs.size') == 1, clips())
    pg3.keyboard.press('Delete')
    check('Delete removes the selected clip, the beat stays', clips() == [[384, 384, 0], [768, 384, 0]] and st3('Object.keys(st.song.patterns).length') == 1)
    pg3.mouse.click(ax(900), ay(3), button='right')
    items = pg3.eval_on_selector_all('#ctx button', 'bs => bs.map(b => b.textContent)')
    check('right-click a clip: its menu', any(i.startswith('Make unique') for i in items) and 'Open the beat' in items and 'Delete the clip' in items, items)
    pg3.click('#ctx button:has-text("Make unique")')
    check('Make unique: the clip gets a copy of the beat, the other clip stays linked to the old one', st3('Object.keys(st.song.patterns).length') == 2 and st3('st.song.tracks[3].clips.map(c => c.p)') == ['beat-1', 'beat-2'], st3('st.song.tracks[3].clips'))
    before = st3('JSON.stringify(Sampler.notesOf(st.song, st.song.tracks[3]))')
    pg3.mouse.click(ax(900), ay(3), button='right'); pg3.click('#ctx button:has-text("Turn into notes")')
    check('Turn into notes: the clip is gone, the track plays the same notes, now its own', st3('st.song.tracks[3].clips.length') == 1 and st3('JSON.stringify(Sampler.notesOf(st.song, st.song.tracks[3]))') == before and st3('st.song.tracks[3].notes.length') == per_bar, st3('st.song.tracks[3].notes.length'))
    # review fixes: a copy dragged back, a short clip's edge, a right-click, a deleted track's clips
    st3('(st.song.tracks[3].clips = [{ at: 0, p: "beat-1", len: 384, off: 0 }], st.song.tracks[3].notes = [], st.cs.clear(), st.rev++, 0)'); pg3.mouse.click(ax(3000), ay(0))
    n_u = st3('st.undo.length'); pg3.keyboard.down('Alt'); pg3.mouse.move(ax(100), ay(3)); pg3.mouse.down(); pg3.mouse.move(ax(100 + 768), ay(3), steps=6); pg3.mouse.move(ax(100), ay(3), steps=6); pg3.mouse.up(); pg3.keyboard.up('Alt')
    check('an Alt-drag that ends where it started makes no copy and no undo step', clips() == [[0, 384, 0]] and st3('st.undo.length') == n_u, [clips(), st3('st.undo.length'), n_u])
    st3('(st.song.tracks[3].clips = [{ at: 768, p: "beat-1", len: 96, off: 0 }], st.cs.clear(), st.rev++, 0)'); pg3.mouse.click(ax(3000), ay(0))
    drag(ax(768) + 2, ay(3), ax(768 + 24) + 2, ay(3))
    check('the start of a clip shorter than a bar moves by the grid, not by a jump of a bar', clips() == [[792, 72, 24]], clips())
    st3('(st.start = 0, 0)'); pg3.mouse.click(ax(2000), ay(2), button='right'); pg3.keyboard.press('Escape')
    check('a right-click on a lane does not move the start mark', st3('st.start') == 0)
    pg3.keyboard.press('Escape')
    pg3.mouse.click(ax(800), ay(3)); n3 = st3('st.song.tracks.length')
    pg3.click('#strip [data-a="del"]')
    check('clips of a deleted track are no longer selected', st3('st.song.tracks.length') == n3 - 1 and st3('st.cs.size') == 0, st3('st.cs.size'))
    pg3.keyboard.press('Control+z')
    # a beat dragged from the list
    pg3.drag_and_drop('#beatList .beat:first-child .bopen', '#arr', target_position={'x': ax(1536) - abox['x'], 'y': 18 + 1 * 26 + 13})
    check('a beat dragged from the list onto a lane makes a clip there, on the bar', st3('st.song.tracks[1].clips') == [{'at': 1536, 'p': 'beat-1', 'len': 384, 'off': 0}], st3('st.song.tracks[1].clips'))
    pg3.keyboard.press('Control+z'); pg3.keyboard.press('Control+z'); pg3.keyboard.press('Control+z'); pg3.keyboard.press('Control+z')
    # a beat out of selected notes
    pg3.click('#trackList .trk:nth-child(1)')
    pg3.evaluate("() => { const t = studio.st.song.tracks[0]; t.notes = [[0, 96, 60, 100], [96, 96, 64, 100], [192, 96, 67, 100], [384, 96, 72, 100]]; studio.st.picked = new Set(t.notes.slice(0, 3)); }")
    before = st3('JSON.stringify(Sampler.notesOf(st.song, st.song.tracks[0]))')
    pg3.focus('#roll'); pg3.keyboard.press('ArrowRight'); pg3.keyboard.press('ArrowLeft')   # (a key redraws the roll, which enables the button)
    pg3.click('#beatFromSel')
    check('FROM SELECTION: the picked notes become a beat and a clip plays them where they were', st3('Object.keys(st.song.patterns).length') == 2 and st3('st.song.tracks[0].notes.length') == 1 and st3('st.song.tracks[0].clips.length') == 1, st3('st.song.tracks[0].clips'))
    check('and the track sounds exactly the same', st3('JSON.stringify(Sampler.notesOf(st.song, st.song.tracks[0]))') == before)
    check('the new beat is open in the piano roll (it is not drums)', st3('!!st.open') and pg3.is_visible('.rollWrap') and pg3.is_hidden('#beatGrid') and pg3.locator('#patBar .pstep').count() == 0)
    # a note put into the beat in the roll goes to every clip of the beat: the track's own notes stay
    box3 = pg3.locator('#roll').bounding_box(); k3 = st3('[st.view.zoom, st.view.x, st.view.top]')
    pg3.mouse.click(box3['x'] + 54 + (96 - k3[1]) * k3[0] + 4, box3['y'] + 18 + (k3[2] - 71) * 12 + 6)
    check('a click in the roll of an open beat puts the note into the beat, not the track', len(st3('st.song.patterns[st.open.p].notes')) == 4 and st3('st.song.tracks[0].notes.length') == 1, st3('st.song.patterns'))
    pg3.keyboard.press('Control+z'); pg3.keyboard.press('Control+z')
    check('undo takes the beat and its clip back', st3('Object.keys(st.song.patterns || {}).length') == 1 and st3('st.song.tracks[0].notes.length') == 4, st3('st.song.patterns'))
    check('no page errors in the beat studio', not errs3, errs3)
    ctx3.close()

    # ---- drum kits: pads of the built-in sounds and of your own samples ----
    def wav(freq, secs=.5, sr=44100):
        fr = b''.join(struct.pack('<h', int(26000 * math.sin(2 * math.pi * freq * i / sr))) for i in range(int(sr * secs)))
        o = io.BytesIO(); w = wave.open(o, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(fr); w.close(); return o.getvalue()
    ctx4 = b.new_context(viewport={'width': 1440, 'height': 900}); pg4 = ctx4.new_page(); errs4 = []
    pg4.on('pageerror', lambda e: errs4.append(str(e))); pg4.on('dialog', lambda d: d.accept())
    pg4.route('**/api/songs**', api); pg4.route('**/fonts.g*/**', lambda r: r.abort())
    pg4.goto(f'{BASE}/studio/?game=spacemouse'); pg4.wait_for_function('window.studio && studio.st.song')
    st4 = lambda js: pg4.evaluate(f'(() => {{ const st = studio.st; return {js}; }})()')
    pg4.select_option('#addIns', 'strings'); pg4.click('#addTrack'); n4 = st4('st.song.tracks.length')
    pg4.select_option(f'#trackList .trk:nth-child({n4}) .tins', '__kit')
    check('+ New drum kit…: a kit of 16 pads, the track plays it, the strip shows the pads', st4('Object.keys(st.song.kits)') == ['kit'] and st4('st.song.kits.kit.pads.length') == 16 and st4('st.song.tracks[st.sel].instrument') == 'drums:kit' and pg4.locator('#strip .pad').count() == 16, st4('st.song.kits'))
    names4 = pg4.eval_on_selector_all('#strip .pad b', 'bs => bs.map(b => b.textContent)')
    check('the pads are named for their sounds, from the kick', names4[:4] == ['Kick', 'Snare', 'Rim', 'Clap'], names4)
    DROP = """([sel, files]) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: 'audio/wav' }));
      document.querySelector(sel).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }"""
    import base64
    drop = lambda sel, files: pg4.evaluate(DROP, [sel, files])   # files dropped on an element, as a person would
    tone = lambda name, f: {'name': name, 'b64': base64.b64encode(wav(f)).decode()}
    drop('#strip .pad[data-note="36"]', [tone('Big thump.wav', 440)])
    pg4.wait_for_function("Object.keys(studio.st.song.samples).length === 1", timeout=15000)
    pad = st4('st.song.kits.kit.pads.find(p => p.note === 36)')
    check('a file dropped on a pad becomes its sample (16 kHz) and the built-in sound goes', pad.get('sample') == 'big-thump' and 'sound' not in pad and st4('st.song.samples["big-thump"].rate') == 16000 and st4('st.song.samples["big-thump"].name') == 'Big thump', pad)
    FREQ = """async tune => {
      const s = JSON.parse(JSON.stringify(studio.st.song)); s.kits.kit.pads.find(p => p.note === 36).tune = tune;
      s.tracks = [{ ...s.tracks[s.tracks.length - 1], notes: [[0, 96, 36, 100]], sends: { echo: 0, reverb: 0 } }]; s.master = { ...s.master, reverb: { volume: 0 }, echo: { volume: 0 }, comp: 0 };
      const b = await Sampler.render(Sampler.check(s), { seconds: 1, loop: false }), d = b.getChannelData(0), sr = b.sampleRate;
      let z = 0; const a = Math.round(.03 * sr), e = Math.round(.2 * sr);
      for (let i = a + 1; i < e; i++) if (d[i - 1] < 0 && d[i] >= 0) z++;
      let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
      return { f: z / ((e - a) / sr), peak };
    }"""
    f0, f12 = pg4.evaluate(FREQ, 0), pg4.evaluate(FREQ, 12)
    check('the pad plays the sample at its own pitch (440 Hz), and tuned up an octave at 880 Hz', f0['peak'] > .05 and abs(f0['f'] / 440 - 1) < .04 and abs(f12['f'] / 880 - 1) < .04, [f0, f12])
    drop('#strip .pads', [tone('Kick 3.wav', 120), tone('snare drum.wav', 300), tone('open hat.wav', 900), tone('Mystery.wav', 200)])
    pg4.wait_for_function("Object.keys(studio.st.song.samples).length === 4", timeout=15000)
    has = lambda note: st4(f'st.song.kits.kit.pads.find(p => p.note === {note}).sample || null')
    check('several files fill the pads by the words in their names (kick, snare, open hat), the rest into the next free pad', has(36) == 'kick-3' and has(38) == 'snare-drum' and has(46) == 'open-hat' and has(37) == 'mystery', [has(n) for n in (36, 38, 46, 37)])
    check('the old kick sample went with the pad (nothing plays it)', 'big-thump' not in st4('Object.keys(st.song.samples)'), st4('Object.keys(st.song.samples)'))
    pg4.keyboard.press('Control+z')
    check('all of it is one undo step', st4('Object.keys(st.song.samples)') == ['big-thump'] and has(36) == 'big-thump', st4('Object.keys(st.song.samples)'))
    pg4.click('#strip .pad[data-note="38"]')
    tune = pg4.locator('#strip .ctl:has(span:text-is("Tune")) input'); tune.fill('5'); tune.dispatch_event('input'); tune.dispatch_event('change')
    check('the pad inspector sets tune (in semitones) on the chosen pad', st4('st.song.kits.kit.pads.find(p => p.note === 38).tune') == 5 and st4('st.pad') == 38, st4('st.song.kits.kit.pads.find(p => p.note === 38)'))
    pg4.select_option('#strip .ctl:has(span:text-is("Sound")) select', 'd:clap')
    check('a pad can be switched to another built-in sound', st4('st.song.kits.kit.pads.find(p => p.note === 38).sound') == 'clap')
    pg4.click('#addBeat')   # the kit in the BEAT grid
    check('the beat grid of a kit has a row for each pad, named for its sound', pg4.locator('#beatGrid .grow').count() == 16 and pg4.locator('#beatGrid .grow .gplay').first.text_content() == 'Big thump', pg4.locator('#beatGrid .grow .gplay').first.text_content())
    pg4.keyboard.press('Escape'); pg4.keyboard.press('Escape')
    st4('(st.song.samples["big-thump"].brr = "A".repeat(400 * 1024), 0)')   # a lot of samples: the warning
    pg4.click('#trackList .trk:nth-child(1)'); pg4.click(f'#trackList .trk:nth-child({n4})')
    check('a kit over 300 KB warns that the song travels inside every game page', pg4.locator('#strip .meta.warn').count() == 1, pg4.locator('#strip .meta').all_text_contents())
    st4('(st.song.samples["big-thump"].brr = studio.S.toB64(studio.S.brrEncode(new Float32Array(1600))), 0)')
    pg4.select_option('#addIns', 'strings'); pg4.click('#addTrack'); n5 = st4('st.song.tracks.length')   # a sample taken out of the song: its pad goes back to a built-in sound
    pg4.select_option(f'#trackList .trk:nth-child({n5}) .tins', 'sample:big-thump')
    pg4.click('#strip [data-a="remove"]')
    pad = st4('st.song.kits.kit.pads.find(p => p.note === 36)')
    check('removing a sample a pad played puts a built-in sound on the pad (the kick)', 'sample' not in pad and pad.get('sound') == 'kick' and 'big-thump' not in st4('Object.keys(st.song.samples)'), pad)
    pg4.click(f'#trackList .trk:nth-child({n4})'); pg4.click('#strip button:has-text("DELETE KIT")')
    check('DELETE KIT: the track plays the built-in kit, and the samples only the kit played go', st4('st.song.kits') is None and st4('st.song.tracks[st.sel].instrument') == 'kit' and st4('Object.keys(st.song.samples).length') == 0, st4('Object.keys(st.song.samples)'))
    check('no page errors in the kit studio', not errs4, errs4)
    ctx4.close()

    # ---- automation: tempo changes, lanes, glide ----
    auto = pg.evaluate('''async () => {
      const S = Sampler, base = { format: 'pixelite-song', bpm: 120, bars: 4, master: { reverb: { volume: 0 }, echo: { volume: 0 }, comp: 0 } }, quiet = { echo: 0, reverb: 0 };
      const rms = (b, t0, t1) => { const d = b.getChannelData(0), sr = b.sampleRate; let s = 0, n = 0; for (let i = Math.round(t0 * sr); i < t1 * sr; i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
      const pitch = (b, t0, t1) => { const d = b.getChannelData(0), sr = b.sampleRate, a = Math.round(t0 * sr), n = Math.round((t1 - t0) * sr); let best = 0, bf = 0;
        for (let f = 150; f < 900; f *= 1.002) { let re = 0, im = 0; for (let i = 0; i < n; i += 2) { const w = 2 * Math.PI * f * i / sr; re += d[a + i] * Math.cos(w); im += d[a + i] * Math.sin(w); } if (re * re + im * im > best) { best = re * re + im * im; bf = f; } } return bf; };
      const t = S.check({ ...base, tempo: [[384, 60]], tracks: [{ instrument: 'marimba', notes: [[480, 24, 72, 120]], sends: quiet }] });
      const tb = (await S.render(t, { seconds: 4, loop: false })).getChannelData(0); let on = -1; for (let i = 0; i < tb.length; i++) if (Math.abs(tb[i]) > .02) { on = i / 44100; break; }
      const v = await S.render(S.check({ ...base, tracks: [{ instrument: 'organ', notes: [[0, 1536, 60, 110]], auto: { volume: [[0, 1], [384, 0]] }, sends: quiet }] }), { seconds: 3, loop: false });
      const g = await S.render(S.check({ ...base, tracks: [{ instrument: 'square', notes: [[0, 240, 57, 110], [192, 384, 64, 110]], sound: { glide: .5, vibrato: [0, 5, 1] }, sends: quiet }] }), { seconds: 3, loop: false });
      return { onset: on, vol: [rms(v, .1, .4), rms(v, 1, 1.3), rms(v, 2.2, 2.6)], glide: [pitch(g, .2, .45), pitch(g, 1.18, 1.32), pitch(g, 1.8, 2.2)] };
    }''')
    check('a tempo change: a note after 120 BPM for a bar, then 60, starts at 3 s', abs(auto['onset'] - 3) < .02, auto['onset'])
    check('a volume lane fades a held chord out', auto['vol'][0] > auto['vol'][1] * 1.5 and auto['vol'][2] < auto['vol'][0] * .02, auto['vol'])
    check('glide: a mono lead slides from A3 to E4 (220 → in between → 330 Hz)', abs(auto['glide'][0] - 220) < 3 and 235 < auto['glide'][1] < 315 and abs(auto['glide'][2] - 329.6) < 4, auto['glide'])
    s2 = pg.evaluate(SOUND2)
    check('the echo SEND lane: closed for one note (almost no echo), open for the next (the echo rings on)', s2['send'][1] > s2['send'][0] * 2 and s2['send'][0] < s2['open'][0] * .6, [s2['send'], s2['open']])
    check("the ECHO LEVEL lane (the song's own): the same, for the echo's return", s2['level'][1] > s2['level'][0] * 2, s2['level'])
    check('the PITCH BEND lane: an A4 bends up an octave (440 → 880 Hz)', abs(s2['bend'][0] - 440) < 6 and abs(s2['bend'][1] - 880) < 12, s2['bend'])
    check('a tempo RAMP: 120 BPM gliding to 60 over four beats takes 2.77 s, not the 2 s of a step', abs(s2['ramp'] - 2.7726) < .03, s2['ramp'])
    check('a curved lane: bent to rush down then settle, it is far quieter at the middle than the straight line', s2['curve'][1] < s2['curve'][0] * .3, s2['curve'])
    check("a sample's loop END: the loop stops at its own end (440 Hz) and never reaches the sound after it (880 Hz)", abs(s2['loopEnd'][0] - 440) < 8 and abs(s2['loopEnd'][1] - 880) < 14, s2['loopEnd'])
    check('a multisample: the note picks the zone by its range (A4 from the low zone, E5 from the high one)', abs(s2['multi'][0] - 370) < 6 and abs(s2['multi'][1] - 933) < 14, s2['multi'])
    pg.goto(f'{BASE}/studio/?game=spacemouse'); pg.wait_for_function('window.studio && studio.st.song')
    pg.click('#trackList .trk:nth-child(1)'); pg.select_option('#lane', 'volume')
    # (measured at every click: the hint under the roll changes with the lane, and when it wraps the roll gets shorter)
    def pt(tick, frac):
        box = pg.locator('#roll').bounding_box()
        return (box['x'] + 54 + (tick - st('st.view.x')) * st('st.view.zoom') + 1, box['y'] + box['height'] - 72 + 5 + (1 - frac) * 62)
    pg.mouse.click(*pt(96, .9)); pg.mouse.click(*pt(384, .2))
    vol = st('st.song.tracks[0].auto.volume')
    check('VOLUME lane: clicks add points on the grid, at the height clicked', [p[0] for p in vol] == [96, 384] and vol[0][1] > .8 and vol[1][1] < .3, vol)
    x0, y0 = pt(384, .2); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0 + 96 * st('st.view.zoom'), y0 - 20, steps=5); pg.mouse.up()
    check('dragging a point moves it', st('st.song.tracks[0].auto.volume[1][0]') == 480 and st('st.song.tracks[0].auto.volume[1][1]') > .3, st('st.song.tracks[0].auto.volume'))
    pg.mouse.click(*pt(96, .9), button='right')
    check('right-click deletes a point', len(st('st.song.tracks[0].auto.volume')) == 1)
    pg.select_option('#lane', 'tempo'); pg.mouse.click(*pt(768, .5))
    check('TEMPO lane: a tempo change for the whole song', len(st('st.song.tempo')) == 1 and st('st.song.tempo[0][0]') == 768 and 150 < st('st.song.tempo[0][1]') < 180, st('st.song.tempo'))
    pg.keyboard.press('Control+z'); pg.keyboard.press('Control+z')
    check('lane edits undo like notes', st('st.song.tempo.length') == 0 and len(st('st.song.tracks[0].auto.volume')) == 2)
    pg.select_option('#lane', 'echo'); pg.mouse.click(*pt(96, .8)); pg.mouse.click(*pt(384, .1))
    check('ECHO SEND lane: points go into the track\'s own lane', [p[0] for p in st('st.song.tracks[0].auto.echo')] == [96, 384], st('st.song.tracks[0].auto.echo'))
    pg.keyboard.down('Shift'); x1, y1 = pt(240, .45); pg.mouse.move(x1, y1); pg.mouse.down(); pg.mouse.move(x1, y1 + 30, steps=5); pg.mouse.up(); pg.keyboard.up('Shift')
    bend = st('st.song.tracks[0].auto.echo[1][2]') or 0
    check('shift-drag on a stretch of the line bends it (the segment arriving at the point)', abs(bend) > .3 and len(st('st.song.tracks[0].auto.echo')) == 2, st('st.song.tracks[0].auto.echo'))
    pg.keyboard.down('Shift'); pg.mouse.click(*pt(384, .1)); pg.keyboard.up('Shift')
    check('shift-click on a bent point makes the segment straight again', len(st('st.song.tracks[0].auto.echo[1]')) == 2)
    pg.select_option('#lane', 'mecho'); pg.mouse.click(*pt(192, .5))
    check("ECHO LEVEL lane: it is the song's, not the track's", len(st('st.song.auto.echo')) == 1 and len(st('st.song.tracks[0].auto.echo')) == 2)
    pg.select_option('#lane', 'pitch'); pg.mouse.click(*pt(96, .75))
    check('PITCH BEND lane: a point above the middle bends up', st('st.song.tracks[0].auto.pitch[0][1]') > 3, st('st.song.tracks[0].auto.pitch'))
    pg.select_option('#lane', 'tempo'); pg.mouse.click(*pt(768, .5)); bpm = st('st.song.tempo[0][1]')
    pg.keyboard.down('Shift'); pg.mouse.click(*pt(768, (bpm - 30) / 270)); pg.keyboard.up('Shift')
    check('TEMPO lane: shift-click on a point makes the tempo glide to it (a ramp)', st('st.song.tempo[0]') == [768, bpm, 1], st('st.song.tempo'))
    check('the hint under the roll says how', 'glide' in pg.text_content('#hint'))
    pg.select_option('#lane', 'vel')

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
    check('LOOP offers a loop end and a crossfade', pg.locator('#strip label.ctl', has_text='Loop end').count() == 1 and pg.locator('#strip label.ctl', has_text='Crossfade').count() == 1)
    wv = pg.locator('#strip canvas.wave').bounding_box(); n_s = st('Sampler.sampleLen(Object.values(st.song.samples)[0])')
    pg.keyboard.down('Shift'); pg.mouse.click(wv['x'] + wv['width'] * .8, wv['y'] + 45); pg.keyboard.up('Shift')
    le = st('Object.values(st.song.samples)[0].loopEnd') or 0
    check('shift-click on the sound sets where the loop ends', abs(le / n_s - .8) < .04, [le, n_s])
    pg.locator('#strip label.ctl', has_text='Crossfade').locator('input').fill('20')
    xf = st('Object.values(st.song.samples)[0].xfade') or 0
    check('the crossfade slider sets a crossfade of that many milliseconds at the seam', abs(xf - 640) < 40, xf)
    pg.select_option('#strip .sec select', '16000'); pg.wait_for_function('Object.values(studio.st.song.samples)[0].rate === 16000', timeout=10000)
    check('more grit: the sample made again at 16 kHz, half the size', st('Object.values(st.song.samples)[0].brr.length') < sm['brr'].__len__() * .6)
    check('the loop follows the sample to its new grit: end and crossfade scale with it', st('Object.values(st.song.samples)[0].loopEnd') < le * .6 and 250 < st('Object.values(st.song.samples)[0].xfade') < 400, st('Object.values(st.song.samples)[0]').keys())
    pg.select_option('#addIns', 'strings'); pg.click('#addTrack'); n2 = st('st.song.tracks.length')
    pg.select_option(f'#trackList .trk:nth-child({n2}) .tins', '__multi')
    check('a new multisample on a track: one zone over every note', st(f'st.song.tracks[{n2 - 1}].instrument') == 'multi:multi' and st('st.song.multis.multi.zones') == [{'sample': 'glass-hum', 'lo': 0, 'hi': 127}], st('st.song.multis'))
    pg.click('#strip [data-a="add"]'); pg.wait_for_function('studio.st.song.multis.multi.zones.length === 2')
    pg.locator('#strip .zrow').nth(0).locator('input').nth(1).fill('59'); pg.locator('#strip .zrow').nth(0).locator('input').nth(1).press('Enter')
    check('a zone\'s range is set with its note numbers', st('st.song.multis.multi.zones[0].hi') == 59, st('st.song.multis.multi.zones'))
    pg.click('#strip [data-a="roots"]')
    z = st('st.song.multis.multi.zones'); check('FROM THEIR NOTES shares the keyboard between the zones (no gap, no overlap)', z[0]['lo'] == 0 and z[1]['hi'] == 127 and z[0]['hi'] + 1 == z[1]['lo'], z)
    pg.click('#strip [data-a="remove"]'); pg.wait_for_function("studio.st.song.multis === undefined")
    check('removing a multisample sends its track back to the piano and keeps the samples', st(f'st.song.tracks[{n2 - 1}].instrument') == 'piano' and len(st('Object.keys(st.song.samples)')) == 1)
    # the microphone (Chromium's fake one: a beeping tone)
    pg.select_option('#addIns', 'strings'); pg.click('#addTrack'); n3 = st('st.song.tracks.length')
    pg.select_option(f'#trackList .trk:nth-child({n3}) .tins', '__record'); pg.wait_for_selector('#recDlg[open]')
    pg.click('#recGo'); pg.wait_for_timeout(1500); pg.click('#recGo')
    pg.wait_for_function('Object.keys(studio.st.song.samples).length === 2', timeout=20000)
    check('the microphone: a recording becomes a sample (Recording 1) played by the track', st(f'st.song.tracks[{n3 - 1}].instrument') == 'sample:recording-1' and st('st.song.samples["recording-1"].name') == 'Recording 1', st('Object.keys(st.song.samples)'))
    check('and the recording is a real sound (BRR with some length)', st('Sampler.sampleLen(st.song.samples["recording-1"])') > 4000, st('Sampler.sampleLen(st.song.samples["recording-1"])'))
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
