#!/usr/bin/env python3
"""Hear a Pixelite song with numbers: render it offline with the engine's own Sampler in headless Chromium, and report levels.

  python3 -I .claude/skills/pixelite-song/levels.py games/<game>/music/<id>.song.json                  whole mix: peak, clipping, loudness per bar
  python3 -I .../levels.py <song> --solo 4 12 [Track ...]     each track alone over bars 4-11 (bars from 0): RMS and peak, to balance the mix
  python3 -I .../levels.py <song> --wav out.wav               also save the render (to give the owner something to listen to)

Why: a session cannot listen. Track gain is volume squared, so a fader of 0.5 is a quarter of the level, and a first mix is usually wrong
(drums twice the lead's level, a pad you cannot hear). Aim for: no clipping (peak under ~0.5), a whole-mix RMS of 0.07-0.10 (Cargo Bay
and Escape Velocity are both 0.082 with a peak of 0.43), and in the solo table the melody about as loud as the drums, the bass a little
under, the backing 1/3 to 1/2 of the melody. All numbers are over both channels.
A full render takes ~20 s, a solo table ~1 s per track and bar. Needs `pip install playwright numpy` (see CLAUDE.md for the version).
"""
import argparse, base64, json, sys, wave
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
BAR = 384
RATE = 32000

ap = argparse.ArgumentParser()
ap.add_argument('song')
ap.add_argument('--solo', nargs='+', metavar=('FROM', 'TO'), help='FROM TO [track names...]')
ap.add_argument('--wav')
args = ap.parse_args()

song = json.loads(Path(args.song).read_text())
sampler = (ROOT / 'engine/13_sampler.js').read_text()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content('<html></html>')
    page.evaluate(sampler + ';window.Sampler=Sampler;')

    def render(s, from_bar, to_bar, stereo=False):
        """-> float32 array [n] or [n, 2]; the song rendered from one bar to another, every track as `s` mutes them"""
        b64 = page.evaluate('''async ([song, a, b]) => {
            const s = Sampler.check(JSON.parse(song)), from = a * 384;
            const buf = await Sampler.render(s, { from, seconds: Sampler.secAt(s, b * 384) - Sampler.secAt(s, from) + 1.5, sampleRate: 32000, loop: false });
            const L = buf.getChannelData(0), R = buf.getChannelData(1), out = new Float32Array(L.length * 2);
            for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
            const u = new Uint8Array(out.buffer); let bin = '';
            for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
            return btoa(bin);
        }''', [json.dumps(s), from_bar, to_bar])
        return np.frombuffer(base64.b64decode(b64), dtype=np.float32).reshape(-1, 2)

    # seconds per bar from the song's own tempo map (bars are not equal if the song changes tempo)
    secs = page.evaluate('''song => { const s = Sampler.check(JSON.parse(song)); return Array.from({ length: s.bars + 1 }, (_, i) => Sampler.secAt(s, i * 384)); }''', json.dumps(song))

    if args.solo:
        lo, hi = int(args.solo[0]), int(args.solo[1])
        names = args.solo[2:]
        print(f'{"track":<14}{"rms":>8}{"peak":>8}   (alone, bars {lo}-{hi - 1}, from 0)')
        for i, t in enumerate(song['tracks']):
            if names and t['name'] not in names:
                continue
            s = json.loads(json.dumps(song))
            for j, u in enumerate(s['tracks']):
                u['mute'] = j != i
            a = render(s, lo, hi)
            a = a[: int((secs[hi] - secs[lo]) * RATE)]
            rms, peak = float(np.sqrt((a ** 2).mean())), float(np.abs(a).max())
            if peak > 1e-4:
                print(f'{t["name"]:<14}{rms:>8.4f}{peak:>8.3f}')
    else:
        a = render(song, 0, song['bars'])
        peak = float(np.abs(a).max())
        print(f'peak {peak:.3f}   clipped samples {int((np.abs(a) >= 0.999).sum())}   length {secs[-1]:.1f} s   page errors {errors or "none"}')
        row = []
        for b in range(song['bars']):
            seg = a[int(secs[b] * RATE): int(secs[b + 1] * RATE)]
            row.append(f'{b:>2} rms {np.sqrt((seg ** 2).mean()):.3f} pk {np.abs(seg).max():.2f}')
        for i in range(0, len(row), 2):
            print('   |   '.join(row[i:i + 2]))
        whole = a[: int(secs[-1] * RATE)]
        print(f'whole mix rms {float(np.sqrt((whole ** 2).mean())):.3f}')
        if args.wav:
            w = wave.open(args.wav, 'wb')
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())
            w.close()
            print(f'saved {args.wav}')
    browser.close()
