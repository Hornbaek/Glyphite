#!/usr/bin/env python3
"""Pixelite plugin bridge: plays a VST3 instrument (or a SoundFont) note by note and keeps each note as a WAV, for the
SOUND STUDIO's library. A game cannot run a plugin (it is a program for Windows or macOS, and a game page loads nothing),
but it can play the plugin's notes as samples: this is how they are made.

  python pixelite_bridge.py serve [--port 47390]      the studio's "Sample a plugin" talks to it, on this computer only
  python pixelite_bridge.py list                      the VST3 plugins found in the usual folders
  python pixelite_bridge.py sample <plugin.vst3 | file.sf2> --name "Grand Piano" --out <folder>
      [--from C1] [--to C7] [--step 3] [--velocity 100] [--hold 2] [--tail 1.5] [--bank 0] [--program 0]

Needs Python 3.9+ and `pip install pedalboard numpy` (pedalboard is Spotify's open-source plugin host). A SoundFont needs
the FluidSynth program on the PATH. The studio's "Start the plugin bridge" gives the PowerShell command that sets it up.
"""
import argparse, base64, io, json, os, queue, re, shutil, struct, subprocess, sys, tempfile, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = 1
PORT = 47390
# the pages that may use the bridge: the site, and the studio served on this computer (npm run serve)
ORIGINS = {'https://glyphite.hornbaek.org', 'https://pixelite.hornbaek.org', 'http://localhost:8787', 'http://127.0.0.1:8787'}
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
SR = 44100


def note_name(n):   # 60 -> 'C4' (the studio's names)
    return f'{NAMES[n % 12]}{n // 12 - 1}'


def note_number(text):   # 'C4' -> 60, 'F#2' -> 42, 'Bb3' -> 58, '60' -> 60
    m = re.fullmatch(r'([A-Ga-g])([#sb]?)(-?\d)', str(text).strip())
    if not m:
        if str(text).strip().isdigit():
            return int(text)
        raise ValueError(f'not a note: {text}')
    return NAMES.index(m[1].upper()) + {'': 0, '#': 1, 's': 1, 'b': -1}[m[2]] + (int(m[3]) + 1) * 12


# ---------- where plugins are kept ----------
def plugin_dirs():
    home = Path.home()
    if sys.platform == 'win32':
        dirs = [Path(os.environ.get('CommonProgramFiles', r'C:\Program Files\Common Files')) / 'VST3',
                Path(os.environ.get('LOCALAPPDATA', home / 'AppData/Local')) / 'Programs/Common/VST3']
    elif sys.platform == 'darwin':
        dirs = [Path('/Library/Audio/Plug-Ins/VST3'), home / 'Library/Audio/Plug-Ins/VST3']
    else:
        dirs = [home / '.vst3', Path('/usr/lib/vst3'), Path('/usr/local/lib/vst3')]
    extra = [Path(p) for p in os.environ.get('PIXELITE_VST3_PATH', '').split(os.pathsep) if p]
    return [d for d in extra + dirs if d.is_dir()]


def find_plugins():
    """Every .vst3 in the plugin folders (a bundle is a folder: it is not looked into)."""
    found, seen = [], set()
    for d in plugin_dirs():
        for root, subdirs, files in os.walk(d):
            for n in sorted(subdirs + files):
                if n.lower().endswith('.vst3'):
                    p = str(Path(root) / n)
                    if p not in seen:
                        seen.add(p)
                        found.append({'name': n[:-5], 'path': p})
            subdirs[:] = [s for s in subdirs if not s.lower().endswith('.vst3')]
    return sorted(found, key=lambda f: f['name'].lower())


# ---------- the instruments: a VST3 plugin, or a SoundFont played by FluidSynth ----------
class Plugin:
    def __init__(self, path):
        try:
            from pedalboard import load_plugin
        except ImportError:
            sys.exit('pedalboard is missing: pip install pedalboard numpy')
        self.path, self.plugin = path, load_plugin(path)
        self.name, self.instrument, self.channels = self.plugin.name, self.plugin.is_instrument, None

    def notes(self, notes, velocity, hold, tail):
        """[(note, float32 samples)]: each note played on its own, from a quiet plugin (reset between notes)."""
        import numpy as np
        for n in notes:
            msgs = [(bytes([0x90, n, velocity]), 0.0), (bytes([0x80, n, 0]), hold)]
            for ch in ([self.channels] if self.channels else [2, 1]):   # (some instruments have one output, Kars for one)
                try:
                    a = self.plugin(msgs, duration=hold + tail, sample_rate=SR, num_channels=ch, reset=True)
                    self.channels = ch
                    break
                except ValueError as e:
                    if 'channel' not in str(e) or ch == 1:
                        raise
            yield n, np.asarray(a, dtype=np.float32).mean(axis=0)

    def show(self, close=None):
        self.plugin.show_editor(close)


class SoundFont:
    def __init__(self, path, bank=0, program=0):
        self.path, self.bank, self.program = path, bank, program
        self.name, self.instrument = Path(path).stem, True
        self.fluid = shutil.which('fluidsynth')
        if not self.fluid:
            sys.exit('FluidSynth is missing (a SoundFont is played by it): install it, or open the SoundFont in the studio itself')

    def notes(self, notes, velocity, hold, tail):
        """All the notes in one MIDI file, far apart, rendered once (the SoundFont is loaded once), then cut apart."""
        import numpy as np
        step = hold + tail + .5
        tpq, tempo = 480, 500000   # (480 ticks a beat at 120 BPM: 960 ticks a second)
        tick = lambda s: int(round(s * 960))
        ev = [(0, bytes([0xB0, 0, self.bank >> 7 & 127])), (0, bytes([0xB0, 32, self.bank & 127])), (0, bytes([0xC0, self.program & 127]))]
        for i, n in enumerate(notes):
            ev += [(tick(i * step + .25), bytes([0x90, n, velocity])), (tick(i * step + .25 + hold), bytes([0x80, n, 0]))]
        end = tick(len(notes) * step + 1)
        ev.sort(key=lambda e: e[0])
        trk, t0 = bytearray(b'\x00\xff\x51\x03' + tempo.to_bytes(3, 'big')), 0
        for t, m in ev + [(end, b'\xff\x2f\x00')]:
            d, t0 = t - t0, t
            vl = [d & 127]
            while d > 127:
                d >>= 7; vl.insert(0, (d & 127) | 128)
            trk += bytes(vl) + m
        with tempfile.TemporaryDirectory() as tmp:
            mid, wav = Path(tmp) / 'notes.mid', Path(tmp) / 'notes.wav'
            mid.write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, tpq) + b'MTrk' + struct.pack('>I', len(trk)) + bytes(trk))
            subprocess.run([self.fluid, '-ni', '-q', '-R', '0', '-C', '0', '-g', '0.5', '-r', str(SR), '-T', 'wav', '-O', 's16', '-F', str(wav), self.path, str(mid)],
                           check=True, capture_output=True)
            with wave.open(str(wav)) as w:
                ch, raw = w.getnchannels(), w.readframes(w.getnframes())
        x = np.frombuffer(raw, dtype='<i2').reshape(-1, ch).mean(axis=1).astype(np.float32) / 32768
        for i, n in enumerate(notes):
            a = int((i * step + .25) * SR)
            yield n, x[a:a + int((hold + tail) * SR)]


# ---------- notes into WAV files ----------
def finish(taken, name):
    """One gain for every note (they keep their loudness against each other), the loudest at -1 dBFS; each note's silent
    end cut off, with a short fade where it is cut. -> [(file name, note, wav bytes)], [notes that made no sound]"""
    import numpy as np
    peak = max((float(np.abs(x).max()) for _, x in taken), default=0)
    if peak <= 1e-6:
        return [], [n for n, _ in taken]
    gain, files, silent = .89 / peak, [], []
    for n, x in taken:
        x = x * gain
        loud = np.nonzero(np.abs(x) > .001)[0]   # (-60 dB of full scale)
        if not len(loud):
            silent.append(n)
            continue
        x = x[:min(len(x), loud[-1] + int(.05 * SR))].copy()
        f = min(len(x), int(.01 * SR))
        x[len(x) - f:] *= np.linspace(1, 0, f, dtype=np.float32)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        files.append((f'{name} {note_name(n)}.wav', n, buf.getvalue()))
    return files, silent


def sample(inst, name, lo, hi, step, velocity, hold, tail, progress=None):
    notes = list(range(lo, hi + 1, step))
    taken = []
    for i, (n, x) in enumerate(inst.notes(notes, velocity, hold, tail)):
        taken.append((n, x))
        if progress:
            progress(f'{note_name(n)} ({i + 1} of {len(notes)})')
    return finish(taken, name)


def safe_name(s):
    s = ''.join(c for c in str(s) if c not in '<>:"/\\|?*' and ord(c) >= 32).strip(' .')
    return s[:60] or 'Instrument'


def check_spec(o):
    """The studio's request, in bounds (a page cannot ask for 10 minutes of notes)."""
    lo, hi = note_number(o.get('from', 'C1')), note_number(o.get('to', 'C7'))
    step, vel, hold, tail = int(o.get('step', 3)), int(o.get('velocity', 100)), float(o.get('hold', 2)), float(o.get('tail', 1.5))
    if not (0 <= lo <= hi <= 127 and 1 <= step <= 12 and 1 <= vel <= 127 and .05 <= hold <= 10 and 0 <= tail <= 10):
        raise ValueError('a range of notes 0..127, a step of 1..12, velocity 1..127, hold up to 10 s and tail up to 10 s')
    if len(range(lo, hi + 1, step)) > 88:
        raise ValueError('at most 88 notes at a time')
    return safe_name(o.get('name') or 'Instrument'), lo, hi, step, vel, hold, tail


# ---------- the server: the studio's page asks, the plugin plays here ----------
class Bridge:
    """Plugins are touched only on the main thread (their windows and some of their code insist on it): the web
    requests hand it jobs and wait."""
    def __init__(self, origins, port):
        self.origins, self.port, self.jobs = origins, port, queue.Queue()
        self.plugins, self.inst, self.busy, self.editor, self.error = find_plugins(), None, '', False, ''

    def on_main(self, fn, wait=True):
        box, done = {}, threading.Event()
        def job():
            try:
                box['v'] = fn()
            except BaseException as e:   # (a plugin's own error goes back to the page)
                box['e'] = e
            done.set()
        self.jobs.put(job)
        if not wait:
            return None
        done.wait()
        if 'e' in box:
            raise box['e']
        return box['v']

    def status(self):
        i = self.inst
        return {'app': 'pixelite-bridge', 'version': VERSION, 'busy': self.busy, 'editor': self.editor, 'error': self.error,
                'plugin': {'name': i.name, 'path': i.path, 'instrument': i.instrument} if i else None, 'plugins': len(self.plugins)}

    def open(self, path):
        if path not in {p['path'] for p in self.plugins}:
            raise ValueError('not one of the plugins found on this computer')
        def load():
            self.busy, self.inst = f'opening {Path(path).stem}...', None
            try:
                self.inst = Plugin(path)
            finally:
                self.busy = ''
            return self.status()['plugin']
        return self.on_main(load)

    def show(self):
        if not self.inst:
            raise ValueError('open a plugin first')
        def run():
            self.editor, self.error = True, ''
            try:
                self.inst.show()
            except Exception as e:
                self.error = f'its window could not be opened: {e}'
            finally:
                self.editor = False
        self.on_main(run, wait=False)

    def sample(self, spec):
        if not self.inst:
            raise ValueError('open a plugin first')
        name, lo, hi, step, vel, hold, tail = check_spec(spec)
        def run():
            try:
                return sample(self.inst, name, lo, hi, step, vel, hold, tail, progress=lambda t: setattr(self, 'busy', f'playing {t}'))
            finally:
                self.busy = ''
        files, silent = self.on_main(run)
        return {'files': [{'file': f, 'note': n, 'wav': base64.b64encode(b).decode()} for f, n, b in files], 'silent': [note_name(n) for n in silent]}

    def loop(self):
        while True:
            try:
                self.jobs.get(timeout=.25)()
            except queue.Empty:
                pass


def handler(bridge):
    class H(BaseHTTPRequestHandler):
        def log_message(self, fmt, *a):
            if self.command == 'POST':
                print(time.strftime('%H:%M:%S'), self.path, flush=True)

        def allowed(self):
            # only the studio's own pages, and only by this computer's name (a web page that points its own name at
            # this computer still sends its own Origin, and is turned away)
            host = (self.headers.get('Host') or '').lower()
            if host not in (f'127.0.0.1:{bridge.port}', f'localhost:{bridge.port}'):
                return False
            origin = self.headers.get('Origin')
            return origin in bridge.origins if origin or self.command != 'GET' else True

        def send(self, code, body=None):
            data = json.dumps(body if body is not None else {}).encode()
            self.send_response(code)
            origin = self.headers.get('Origin')
            if origin in bridge.origins:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            if not self.allowed():
                return self.send(403, {'error': 'not allowed'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin'))
            self.send_header('Access-Control-Allow-Methods', 'GET, POST')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')   # (Chrome asks this of a page that calls this computer)
            self.send_header('Access-Control-Max-Age', '600')
            self.send_header('Vary', 'Origin')
            self.end_headers()

        def do_GET(self):
            if not self.allowed():
                return self.send(403, {'error': 'not allowed'})
            if self.path == '/status':
                return self.send(200, bridge.status())
            if self.path.startswith('/plugins'):
                if 'rescan' in self.path:
                    bridge.plugins = find_plugins()
                return self.send(200, {'plugins': bridge.plugins, 'folders': [str(d) for d in plugin_dirs()]})
            self.send(404, {'error': 'no such thing'})

        def do_POST(self):
            if not self.allowed() or 'application/json' not in (self.headers.get('Content-Type') or ''):
                return self.send(403, {'error': 'not allowed'})
            try:
                o = json.loads(self.rfile.read(min(int(self.headers.get('Content-Length') or 0), 65536)) or b'{}')
                if self.path == '/open':
                    return self.send(200, bridge.open(str(o.get('path', ''))))
                if self.path == '/editor':
                    bridge.show()
                    return self.send(200, {'ok': True})
                if self.path == '/sample':
                    return self.send(200, bridge.sample(o))
                self.send(404, {'error': 'no such thing'})
            except Exception as e:
                self.send(400, {'error': str(e) or e.__class__.__name__})
    return H


def serve(port, more_origins):
    bridge = Bridge(ORIGINS | set(more_origins), port)
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', port), handler(bridge))
    except OSError:
        sys.exit(f'Port {port} is taken: is the bridge already running in another window?')
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f'Pixelite plugin bridge {VERSION}, at http://127.0.0.1:{port} (this computer only). Leave this window open while you sample;'
          f' close it (or press Ctrl+C) to stop.\nFound {len(bridge.plugins)} VST3 plugins in: ' + (', '.join(str(d) for d in plugin_dirs()) or 'no plugin folder'), flush=True)
    try:
        bridge.loop()
    except KeyboardInterrupt:
        print('stopped')


def main():
    ap = argparse.ArgumentParser(description='Sample VST3 instruments and SoundFonts into WAV files for the Pixelite SOUND STUDIO.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('serve', help='let the studio use the plugins of this computer')
    s.add_argument('--port', type=int, default=PORT)
    s.add_argument('--allow-origin', action='append', default=[], help='one more page that may use the bridge (a test server)')
    sub.add_parser('list', help='the VST3 plugins found')
    s = sub.add_parser('sample', help='sample a plugin or a SoundFont into a folder of WAVs')
    s.add_argument('source', help='a .vst3 plugin or a .sf2 SoundFont')
    s.add_argument('--name', help='the instrument\'s name (the files are "<name> C4.wav"...)')
    s.add_argument('--out', required=True, help='the folder the WAVs go into')
    for k, v in (('from', 'C1'), ('to', 'C7'), ('step', 3), ('velocity', 100), ('hold', 2), ('tail', 1.5), ('bank', 0), ('program', 0)):
        s.add_argument(f'--{k}', default=v)
    a = ap.parse_args()
    if a.cmd == 'serve':
        return serve(a.port, a.allow_origin)
    if a.cmd == 'list':
        for p in find_plugins():
            print(f"{p['name']:32} {p['path']}")
        return
    inst = SoundFont(a.source, int(a.bank), int(a.program)) if a.source.lower().endswith('.sf2') else Plugin(a.source)
    name, lo, hi, step, vel, hold, tail = check_spec({'name': a.name or inst.name, 'from': getattr(a, 'from'), 'to': a.to, 'step': a.step, 'velocity': a.velocity, 'hold': a.hold, 'tail': a.tail})
    files, silent = sample(inst, name, lo, hi, step, vel, hold, tail, progress=lambda t: print(' ', t, end='\r', flush=True))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for f, _, b in files:
        (out / f).write_bytes(b)
    print(f'\n{len(files)} notes of {name} in {out}' + (f'; silent (left out): {", ".join(note_name(n) for n in silent)}' if silent else ''))


if __name__ == '__main__':
    main()
