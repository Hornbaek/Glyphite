#!/usr/bin/env python3
"""The SOUND STUDIO's plugin bridge (tools/pixelite_bridge.py) end to end: the bridge's own checks (only the studio's pages,
only by this computer's name, only plugins from the plugin folders, requests in bounds), the PowerShell command that starts
it (the script inside it whole), and the studio driving a real VST3 instrument through it: found, opened, sampled into the
library folder, made into a multisample. Needs `pip install pedalboard numpy` and a VST3 instrument: DISTRHO's Kars
(`apt-get install dpf-plugins-vst3`, as CI does). Run after `npm run build`."""
import functools, json, re, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KARS = '/usr/lib/vst3/Kars.vst3'
failures = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else f'  {detail}'))
    if not ok: failures.append(name)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


if not Path(KARS).exists():
    sys.exit(f'{KARS} is missing: apt-get install dpf-plugins-vst3')
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'
BR = 'http://127.0.0.1:47390'


def req(path, origin=BASE, body=None, host=None, ctype='application/json'):
    h = {'Origin': origin} if origin else {}
    if host: h['Host'] = host
    if body is not None and ctype: h['Content-Type'] = ctype
    r = urllib.request.Request(BR + path, data=None if body is None else json.dumps(body).encode(), headers=h, method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(r, timeout=60) as f: return f.status, json.loads(f.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(prefix='bridge-'), viewport={'width': 1280, 'height': 860})
    pg = ctx.pages[0] if ctx.pages else ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.route('**/api/songs**', lambda r: r.fulfill(json=[] if r.request.method == 'GET' else {'ok': True}))
    pg.route('**/fonts.g*/**', lambda r: r.abort())
    pg.goto(f'{BASE}/studio/?game=spacemouse'); pg.wait_for_function('window.studio && studio.st.song')
    st = lambda js: pg.evaluate(f'(() => {{ const st = studio.st; return {js}; }})()')

    # the start command: the script inside it, whole, between PowerShell's here-string marks
    cmd = pg.evaluate('studio.bridgeCommand()')
    m = re.search(r"\n@'\n(.*)\n'@ \| Set-Content", cmd, re.S)
    script = (ROOT / 'tools/pixelite_bridge.py').read_text().rstrip()
    check('the start command carries the bridge script, whole, in a here-string', bool(m) and m.group(1) == script)
    check('and nothing in the script could end the here-string early (a line starting with \'@)', not re.search(r"^'@", script, re.M))
    check('the script is plain ASCII (Windows PowerShell 5.1 pastes it safely)', script.isascii())
    check('the command installs pedalboard, starts the bridge, and installs Python only when it is missing',
          'py -m pip install --user' in cmd and 'pixelite_bridge.py" serve' in cmd and 'winget install -e --id Python.Python.3.12' in cmd and '} else {' in cmd)

    # a library folder (the browser's private one stands in), then the dialog before the bridge runs
    pg.evaluate("async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true }); }")
    pg.evaluate('async () => studio.useFolder(await navigator.storage.getDirectory())'); pg.wait_for_selector('#libraryView [data-a="setup"]')
    pg.click('#libraryView [data-a="setup"]'); pg.wait_for_function("!document.querySelector('#libraryView [data-a=\"setup\"]')")
    pg.click('#libraryView [data-a="bridge"]'); pg.wait_for_selector('#bridgeDlg[open] [data-a="copy"]')
    check('SAMPLE A PLUGIN without the bridge: how to start it, and the command to copy', 'PowerShell' in pg.text_content('#brBody') and pg.is_visible('#bridgeDlg [data-a="copy"]'))
    pg.screenshot(path=str(ROOT / 'shots/bridge-start.png'))

    # the bridge starts: the dialog finds it by itself
    bridge = subprocess.Popen([sys.executable, str(ROOT / 'tools/pixelite_bridge.py'), 'serve', '--allow-origin', BASE], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        pg.wait_for_selector('#bridgeDlg .brplugs [data-p]', timeout=20000)
        names = pg.eval_on_selector_all('#bridgeDlg .brplugs [data-p] .nm', 'n => n.map(x => x.textContent)')
        check('the dialog finds the running bridge and lists the VST3 plugins of this computer', 'Kars' in names, names)
        # the bridge's own guards
        check('the bridge answers the studio', req('/status')[0] == 200)
        check('and refuses another page', req('/status', origin='https://evil.example')[0] == 403)
        check('and a page that points its own name at this computer', req('/status', host='evil.example:47390')[0] == 403)
        check('and a POST without a page (or not JSON)', req('/open', origin=None, body={})[0] == 403 and req('/open', body={}, ctype='text/plain')[0] == 403)
        check('and opens only plugins it found', req('/open', body={'path': '/etc/passwd'}) == (400, {'error': 'not one of the plugins found on this computer'}))
        pg.click('#bridgeDlg .brplugs [data-p$="Kars.vst3"]')
        pg.wait_for_selector('#bridgeDlg .brform', timeout=60000)
        check('a plugin opened: its name, Show its window, and what to sample', 'Kars' in pg.text_content('#bridgeDlg .brhead') and pg.input_value('#bridgeDlg [data-k="name"]') == 'Kars')
        check('the bridge refuses a request out of bounds', req('/sample', body={'from': 'C0', 'to': 'C9', 'step': 1})[0] == 400)
        for k, v in (('from', 'C3'), ('to', 'C5'), ('hold', '.3'), ('tail', '.4')): pg.fill(f'#bridgeDlg [data-k="{k}"]', v)
        pg.select_option('#bridgeDlg [data-k="step"]', '12'); pg.select_option('#bridgeDlg [data-k="family"]', 'Guitar')
        check('the estimate: 3 notes into Instruments/Guitar/Kars', pg.text_content('#brEst').startswith('3 notes') and 'Instruments/Guitar/Kars' in pg.text_content('#brEst'), pg.text_content('#brEst'))
        pg.screenshot(path=str(ROOT / 'shots/bridge-form.png'))
        pg.click('#bridgeDlg [data-a="sample"]'); pg.wait_for_selector('#brDone .brok', timeout=60000)
        files = pg.evaluate("async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Instruments')).getDirectoryHandle('Guitar'); const k = await d.getDirectoryHandle('Kars'); const o = []; for await (const [n, h] of k.entries()) o.push([n, (await h.getFile()).size]); return o.sort(); }")
        check('SAMPLE IT: a WAV a note, named by its note, in the library folder', [f[0] for f in files] == ['Kars C3.wav', 'Kars C4.wav', 'Kars C5.wav'] and all(f[1] > 10000 for f in files), files)
        pg.screenshot(path=str(ROOT / 'shots/bridge-done.png'))
        pg.click('#brDone [data-a="instrument"]'); pg.wait_for_function('studio.st.song.multis && Object.keys(studio.st.song.multis).length === 1', timeout=20000)
        mu = st('Object.values(st.song.multis)[0]'); roots = [st(f'st.song.samples["{z["sample"]}"].root') for z in mu['zones']]
        check('MAKE AN INSTRUMENT: a multisample of the notes, each over the notes nearest its own', mu['name'] == 'Kars' and roots == [48, 60, 72]
              and [(z['lo'], z['hi']) for z in mu['zones']] == [(0, 54), (55, 66), (67, 127)] and pg.is_visible('#samplesView'), mu)
        check('its samples are real sound (32 kHz, BRR)', all(st(f'Sampler.sampleLen(st.song.samples["{z["sample"]}"])') > 4000 and st(f'st.song.samples["{z["sample"]}"].rate') == 32000 for z in mu['zones']))
        # the same from the Library view: a folder of notes offers it
        pg.click('#tabLibrary'); pg.click('#libraryView .side .sitem:has-text("Instruments")'); pg.click('#libraryView .side .sitem:has-text("Guitar")'); pg.click('#libraryView .side .sitem:has-text("Kars")')
        check('a folder of notes in the Library offers to make an instrument', '3 notes of an instrument, C3 to C5' in pg.text_content('#libraryView .kitbar') and pg.is_visible('#libraryView [data-a="makeinstrument"]'))
    finally:
        bridge.terminate()
        out = bridge.communicate(timeout=10)[0]
    check('no page errors', not errs, errs)
    ctx.close()
srv.shutdown()
print('all bridge checks passed' if not failures else 'FAILED: ' + ', '.join(failures))
raise SystemExit(1 if failures else 0)
