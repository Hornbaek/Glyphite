"""Original soundtrack for Regolith Lander, written out as Standard MIDI Files.

Four pieces: a title theme, an in-game descent loop, and two short jingles.
Run: python3 games/regolith/tools/compose.py  -> writes music/*.mid and songs.js (paths relative to games/regolith/)
"""
import base64, os, struct

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # work from games/regolith/

TPQ = 480
S16 = TPQ // 4
LETTER = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def nn(name):
    i, acc = 1, 0
    while name[i] in '#b':
        acc += 1 if name[i] == '#' else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + LETTER[name[0]] + acc


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def track(events):
    events.sort(key=lambda e: (e[0], e[1]))
    out, last = bytearray(), 0
    for tick, _, b in events:
        out += vlq(tick - last) + b
        last = tick
    return bytes(out)


def meta_name(s):
    return b'\xff\x03' + vlq(len(s)) + s.encode('ascii')


def write_midi(path, title, bpm, total16, tracks):
    end = total16 * S16
    conductor = [(0, 0, meta_name(title)),
                 (0, 0, b'\xff\x51\x03' + struct.pack('>I', round(60_000_000 / bpm))[1:]),
                 (0, 0, b'\xff\x58\x04\x04\x02\x18\x08'),
                 (end, 9, b'\xff\x2f\x00')]
    chunks = [track(conductor)]
    for tr in tracks:
        ch, ev = tr['ch'], [(0, 0, meta_name(tr['name']))]
        if ch != 9:
            ev.append((0, 1, bytes([0xC0 | ch, tr['prog']])))
        ev.append((0, 1, bytes([0xB0 | ch, 7, tr['vol']])))
        for s, l, n, v in tr['notes']:
            assert 0 <= s and s + l <= total16, (tr['name'], s, l, total16)
            ev.append((s * S16, 3, bytes([0x90 | ch, n, v])))
            ev.append(((s + l) * S16 - 12, 2, bytes([0x80 | ch, n, 0])))
        ev.append((end, 9, b'\xff\x2f\x00'))
        chunks.append(track(ev))
    data = b'MThd' + struct.pack('>IHHH', 6, 1, len(chunks), TPQ)
    for c in chunks:
        data += b'MTrk' + struct.pack('>I', len(c)) + c
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    return data


def melody(bars, vel=100, start_bar=0):
    """bars: list of bars, each a list of (note|'r', sixteenths) summing to 16"""
    out, pos = [], start_bar * 16
    for b, bar in enumerate(bars):
        assert sum(d for _, d in bar) == 16, (b, bar)
        for n, d in bar:
            if n != 'r':
                out.append((pos, d, nn(n), vel))
            pos += d
    return out


def chords(prog, voicing, rhythm, vel):
    out = []
    for b, c in enumerate(prog):
        for s, l in rhythm:
            for n in voicing[c]:
                out.append((b * 16 + s, l, nn(n), vel))
    return out


def bass(prog, roots, pattern, vel=110):
    out = []
    for b, c in enumerate(prog):
        r = nn(roots[c])
        for s, l, up in pattern:
            out.append((b * 16 + s, l, r + 12 * up, vel))
    return out


KICK, SNARE, HAT, OPEN, CRASH = 36, 38, 42, 46, 49

# ----------------------------------------------------------------------------- title theme
T_PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'E', 'F', 'G', 'Em', 'Am', 'Dm', 'F', 'E', 'Am']
T_VOICE = {'Am': ['A3', 'C4', 'E4'], 'F': ['F3', 'A3', 'C4'], 'C': ['G3', 'C4', 'E4'], 'G': ['G3', 'B3', 'D4'],
           'E': ['G#3', 'B3', 'E4'], 'Em': ['G3', 'B3', 'E4'], 'Dm': ['A3', 'D4', 'F4']}
T_ROOT = {'Am': 'A2', 'F': 'F2', 'C': 'C3', 'G': 'G2', 'E': 'E2', 'Em': 'E2', 'Dm': 'D2'}
T_LEAD = [
    [('E5', 4), ('A5', 4), ('B5', 2), ('C6', 2), ('B5', 2), ('A5', 2)],
    [('C6', 6), ('A5', 2), ('F5', 4), ('A5', 4)],
    [('G5', 4), ('E5', 4), ('C5', 2), ('E5', 2), ('G5', 4)],
    [('D5', 8), ('B4', 4), ('D5', 4)],
    [('E5', 4), ('A5', 4), ('B5', 2), ('C6', 2), ('D6', 4)],
    [('C6', 4), ('A5', 4), ('F5', 4), ('A5', 4)],
    [('G#5', 6), ('B5', 2), ('E6', 8)],
    [('D6', 4), ('C6', 4), ('B5', 4), ('G#5', 4)],
    [('A5', 4), ('C6', 4), ('F6', 8)],
    [('E6', 4), ('D6', 4), ('B5', 8)],
    [('G5', 4), ('B5', 4), ('E6', 4), ('D6', 2), ('C6', 2)],
    [('A5', 12), ('r', 4)],
    [('F5', 4), ('A5', 4), ('D6', 4), ('C6', 2), ('A5', 2)],
    [('C6', 8), ('A5', 4), ('F5', 4)],
    [('G#5', 4), ('B5', 4), ('D6', 4), ('B5', 4)],
    [('A5', 8), ('E5', 4), ('r', 4)],
]
TRESILLO = [(0, 3), (3, 3), (6, 2), (8, 3), (11, 3), (14, 2)]
EIGHTHS_OCT = [(s, 2, (s // 2) % 2) for s in range(0, 16, 2)]


def title_drums():
    out = []
    for b in range(16):
        o = b * 16
        if b in (0, 8):
            out.append((o, 4, CRASH, 100))
        for s in (0, 6, 8):
            out.append((o + s, 2, KICK, 110))
        fill = b == 15
        for s in (4, 12):
            out.append((o + s, 2, SNARE, 105))
        if fill:
            out += [(o + 13, 1, SNARE, 80), (o + 14, 1, SNARE, 90), (o + 15, 1, SNARE, 100)]
        for s in range(2, 16, 2):
            if s in (4, 6, 8, 12) or (fill and s >= 12):
                continue
            out.append((o + s, 2, OPEN if (s == 14 and b % 4 == 3) else HAT, 60))
    return out


# ---------------------------------------------------------------------------- descent loop
D_PROG = ['Em', 'C', 'D', 'B', 'Em', 'C', 'Am', 'B'] * 2
D_VOICE = {'Em': ['E4', 'G4', 'B4'], 'C': ['E4', 'G4', 'C5'], 'D': ['D4', 'F#4', 'A4'], 'B': ['D#4', 'F#4', 'B4'], 'Am': ['E4', 'A4', 'C5']}
D_ROOT = {'Em': 'E2', 'C': 'C2', 'D': 'D2', 'B': 'B1', 'Am': 'A1'}
D_LEAD = [
    [('E5', 2), ('r', 2), ('E5', 2), ('G5', 2), ('B5', 4), ('A5', 2), ('G5', 2)],
    [('E5', 8), ('r', 8)],
    [('D5', 2), ('r', 2), ('D5', 2), ('F#5', 2), ('A5', 4), ('G5', 2), ('F#5', 2)],
    [('D#5', 8), ('r', 8)],
    [('E5', 2), ('r', 2), ('E5', 2), ('G5', 2), ('B5', 4), ('A5', 2), ('G5', 2)],
    [('G5', 4), ('E5', 4), ('C5', 8)],
    [('A4', 2), ('C5', 2), ('E5', 2), ('A5', 2), ('G5', 4), ('E5', 4)],
    [('F#5', 8), ('D#5', 8)],
    [('B4', 4), ('E5', 4), ('G5', 4), ('F#5', 4)],
    [('E5', 6), ('G5', 2), ('C6', 8)],
    [('A5', 4), ('F#5', 4), ('D5', 4), ('F#5', 4)],
    [('D#5', 8), ('F#5', 4), ('B5', 4)],
    [('G5', 4), ('B5', 4), ('E6', 4), ('D6', 4)],
    [('C6', 4), ('B5', 4), ('G5', 4), ('E5', 4)],
    [('A5', 4), ('C6', 4), ('E6', 4), ('C6', 4)],
    [('B5', 12), ('D#5', 4)],
]
D_COUNTER = [[('r', 16)]] * 8 + [[(n, 16)] for n in ['G4', 'G4', 'F#4', 'F#4', 'B4', 'C5', 'C5', 'B4']]
DRIVE = [(s, 2, up) for s, up in zip(range(0, 16, 2), [0, 0, 1, 0, 0, 1, 0, 1])]


def descent_drums():
    out = []
    for b in range(16):
        o = b * 16
        if b in (0, 8):
            out.append((o, 4, CRASH, 100))
        kicks = (0, 8, 10) if b % 2 == 0 else (0, 6, 8, 10)
        for s in kicks:
            out.append((o + s, 2, KICK, 115))
        fill = b in (7, 15)
        for s in (4, 12):
            out.append((o + s, 2, SNARE, 110))
        if fill:
            out += [(o + 13, 1, SNARE, 85), (o + 14, 1, SNARE, 95), (o + 15, 1, SNARE, 105)]
        for s in range(2, 16, 2):
            if s in kicks or s in (4, 12) or (fill and s >= 12):
                continue
            out.append((o + s, 2, HAT, 70 if s % 4 else 55))
    return out


def build():
    songs = {}
    songs['title'] = ('SEA OF TRANQUILITY', write_midi('music/title.mid', 'Sea of Tranquility', 100, 16 * 16, [
        dict(ch=0, prog=80, vol=112, name='Lead', notes=melody(T_LEAD, 100)),
        dict(ch=1, prog=0, vol=78, name='Chords', notes=chords(T_PROG, T_VOICE, TRESILLO, 80)),
        dict(ch=2, prog=33, vol=120, name='Bass', notes=bass(T_PROG, T_ROOT, EIGHTHS_OCT)),
        dict(ch=9, prog=0, vol=100, name='Drums', notes=title_drums()),
    ]))
    songs['descent'] = ('POWERED DESCENT', write_midi('music/descent.mid', 'Powered Descent', 132, 16 * 16, [
        dict(ch=0, prog=81, vol=104, name='Lead', notes=melody(D_LEAD, 100)),
        dict(ch=1, prog=50, vol=70, name='Arpeggio', notes=chords(D_PROG, D_VOICE, [(0, 8), (8, 8)], 90)),
        dict(ch=2, prog=38, vol=120, name='Bass', notes=bass(D_PROG, D_ROOT, DRIVE)),
        dict(ch=3, prog=72, vol=70, name='Counter', notes=melody(D_COUNTER, 60)),
        dict(ch=9, prog=0, vol=100, name='Drums', notes=descent_drums()),
    ]))
    songs['touchdown'] = ('CONTACT LIGHT', write_midi('music/touchdown.mid', 'Contact Light', 150, 32, [
        dict(ch=0, prog=80, vol=115, name='Lead', notes=melody([[('G4', 2), ('C5', 2), ('E5', 2), ('G5', 2), ('C6', 8)],
                                                               [('A5', 2), ('B5', 2), ('C6', 12)]], 105)),
        dict(ch=1, prog=0, vol=80, name='Chords', notes=[(0, 8, n, 85) for n in map(nn, ['C4', 'E4', 'G4'])]
             + [(8, 8, n, 85) for n in map(nn, ['F4', 'A4', 'C5'])] + [(16, 4, n, 85) for n in map(nn, ['G3', 'B3', 'D4'])]
             + [(20, 12, n, 85) for n in map(nn, ['C4', 'E4', 'G4'])]),
        dict(ch=2, prog=33, vol=120, name='Bass', notes=[(0, 8, nn('C3'), 110), (8, 8, nn('F2'), 110), (16, 4, nn('G2'), 110), (20, 12, nn('C3'), 110)]),
        dict(ch=9, prog=0, vol=100, name='Drums', notes=[(0, 4, CRASH, 100), (0, 2, KICK, 110), (8, 2, KICK, 110), (12, 1, SNARE, 80),
                                                        (13, 1, SNARE, 90), (14, 1, SNARE, 100), (15, 1, SNARE, 110), (16, 4, CRASH, 110), (16, 2, KICK, 120)]),
    ]))
    songs['lost'] = ('LOSS OF SIGNAL', write_midi('music/lost.mid', 'Loss of Signal', 84, 32, [
        dict(ch=0, prog=80, vol=105, name='Lead', notes=melody([[('E5', 4), ('D5', 4), ('C5', 4), ('B4', 4)], [('A4', 12), ('r', 4)]], 95)),
        dict(ch=1, prog=0, vol=75, name='Chords', notes=[(0, 8, n, 80) for n in map(nn, ['A3', 'C4', 'E4'])]
             + [(8, 8, n, 80) for n in map(nn, ['G#3', 'B3', 'E4'])] + [(16, 12, n, 80) for n in map(nn, ['A3', 'C4', 'E4'])]),
        dict(ch=2, prog=33, vol=120, name='Bass', notes=[(0, 8, nn('A2'), 110), (8, 8, nn('E2'), 110), (16, 12, nn('A2'), 110)]),
        dict(ch=9, prog=0, vol=100, name='Drums', notes=[(0, 2, KICK, 100), (8, 2, KICK, 90), (16, 6, CRASH, 70)]),
    ]))
    lines = ['// ===================== GAME · soundtrack =====================',
             '// Original compositions for this game, stored as real Standard MIDI Files (base64) and',
             '// played through the Chip exactly like a .mid file you drop onto the page.',
             'const SONG_DATA = {']
    for key, (title, data) in songs.items():
        lines.append(f"  {key}: {{ name: '{title}', b64: '{base64.b64encode(data).decode()}' }},")
    lines += ['};', '']   # b64buf (base64 → ArrayBuffer) comes with the engine's Chip
    with open('songs.js', 'w') as f:
        f.write('\n'.join(lines))
    for k, (t, d) in songs.items():
        print(k, t, len(d), 'bytes')


if __name__ == '__main__':
    build()
