// ===================== GAME · music director, MIDI loading, chip meters =====================
const Music = {
  on: true, songs: null, custom: null, current: '', meters: false, midiIn: false, vol: -1,
  ready() {
    if (!Chip.ctx) return false;
    if (!this.songs) { this.songs = {}; for (const k in SONG_DATA) { const s = Chip.load(b64buf(SONG_DATA[k].b64)); s.title = SONG_DATA[k].name; this.songs[k] = s; } }
    return true;
  },
  // which piece belongs to a game state
  keyFor(st) { return st === 'title' ? 'title' : st === 'landed' ? 'touchdown' : st === 'crashed' ? 'lost' : 'descent'; },
  song(key) { return (key === 'title' || key === 'descent') && this.custom ? this.custom : this.songs[key]; },
  update(st) {
    if (!this.ready()) return;
    const v = st === 'paused' ? .2 : .6; if (v !== this.vol) { this.vol = v; Chip.setVolume(v); }
    const key = this.keyFor(st);
    if (key === this.current) return;
    this.current = key;
    if (!this.on) return;
    const jingle = key === 'touchdown' || key === 'lost';
    Chip.play(this.song(key), { loop: !jingle, fadeIn: jingle ? 0 : .5 });
  },
  toggle() {
    this.on = !this.on;
    if (!this.on) Chip.stop(.3); else this.current = '';
    say(this.on ? 'MUSIC ON' : 'MUSIC OFF');
  },
  async loadFile(file) {
    Sfx.init();
    if (!file) return;
    try {
      const song = Chip.load(await file.arrayBuffer());
      song.title = (song.name || file.name.replace(/\.(mid|midi|smf)$/i, '')).toUpperCase().replace(/[^\x20-\x7e]/g, '?').slice(0, 30);
      this.custom = song; this.on = true; this.current = '';
      const m = Math.floor(song.dur / 60), s = Math.round(song.dur % 60);
      say(`NOW PLAYING ${song.title}  ${m}:${String(s).padStart(2, '0')}  ${song.notes} NOTES`);
    } catch (e) { say(`CAN'T PLAY THAT FILE: ${String(e.message || e).toUpperCase()}`); }
  },
  async connect() {
    Sfx.init();
    try {
      const names = await Chip.connectMidi();
      this.midiIn = true;
      say(names.length ? `MIDI IN: ${names.join(', ').toUpperCase()}` : 'MIDI IN READY - PLUG IN A KEYBOARD');
    } catch (e) { say('MIDI DEVICES ARE BLOCKED HERE - LOAD A .MID FILE INSTEAD'); }
  }
};

// beacons and other lights can follow the beat of whatever is playing
function musicBeat() { const m = Music.on && Chip.playing ? Chip.meter() : null; return m && m.beat >= 0 ? m.beat : -1; }
function beaconOn(t) { const b = musicBeat(); return b >= 0 ? (b % 1) < .45 : ((t * 1.6) | 0) % 2 === 0; }

// ASCII sound-test panel: one row per chip lane in use, volume as a 15-step bar
function drawChipMeters(c0, r0, boxed) {
  const m = Chip.meter(); if (!m || !Chip.song) return 0;
  const rows = [];
  m.lanes.forEach((q, ch) => { if (q[3] && ch !== 9) rows.push([`CH${String(ch + 1).padStart(2, '0')} ${q[2] ? 'PULSE ' + String(Math.floor(q[2] * 100)).padStart(2, ' ') + '%' : 'TRIANGLE '}`, q[0], q[1]]); });
  if (Chip.song.events.some(e => e.ch === 9)) rows.push(['CH10 NOISE    ', -1, m.drum]);
  const w = 38, title = (Chip.song.title || Chip.song.name || 'MIDI').slice(0, 24);
  const head = `${title}${' '.repeat(Math.max(1, w - 4 - title.length - 9))}BEAT ${String(Math.max(0, Math.floor(m.beat) + 1)).padStart(3, ' ')}`;
  if (boxed) hudBox(c0, r0, w, rows.length + 3, HC.dim, true);
  hudText(c0 + 2, r0 + 1, head, HC.gold);
  rows.forEach(([label, note, v], i) => {
    const r = r0 + 2 + i, on = v > 0;
    hudText(c0 + 2, r, label, on ? HC.txt : HC.dim);
    hudText(c0 + 17, r, note >= 0 && on ? noteName(note) : '   ', HC.cyan);
    hudText(c0 + 21, r, '#'.repeat(v), [255, 179 - v * 4, 64]); hudText(c0 + 21 + v, r, '.'.repeat(15 - v), HC.dim);
  });
  return rows.length + 3;
}

function setupMusicInput() {
  const file = document.getElementById('midiFile');
  document.getElementById('loadBtn').addEventListener('click', e => { e.stopPropagation(); Sfx.init(); file.click(); });
  file.addEventListener('change', () => { if (file.files[0]) Music.loadFile(file.files[0]); file.value = ''; });
  document.getElementById('midiBtn').addEventListener('click', e => { e.stopPropagation(); Music.connect(); });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) Music.loadFile(f); });
}
