#!/usr/bin/env python3
"""Space Whiskers: the Bubbling Moon's sounds, prepared for the game (the owner's Godot level).

  python3 games/spacewhiskers/tools/sounds_prep.py [--only id ...]

Reads audio/raw/<id>.<mp3|wav> (as Replicate made them: never changed) and audio/raw/<id>.json (the prompt, the model, what it is for), and writes:
  audio/sfx|ambience|music|stinger/<id>.wav    44.1 kHz stereo 16-bit; effects and stingers are trimmed of silence, faded 5 ms in and 30 ms out and put at a peak of -2 dBFS
  audio/ambience|music/<id>.ogg                Ogg Vorbis (quality 5) of the long ones, for streaming
  <id>_loop.wav / .ogg                         for a sound that loops: a seamless loop (the end is crossfaded into the start: the file is one crossfade shorter),
                                               except the MusicGen loops, which are whole bars at an exact tempo and loop as they are
  audio/manifest.json, audio/INDEX.md          every file: group, what it is for, length, peak, mean level, loop, tempo, prompt
Music is set to -16 LUFS (peak under -1.5 dBFS), ambiences to -24 LUFS, so they sit under the effects. Nobody can listen here: the numbers are the check
(length, peak, level, silence), and the owner listens.
"""
import json, re, subprocess, sys
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent
AUDIO = GAME / 'audio'; RAW = AUDIO / 'raw'
FF = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(f"{' '.join(map(str, cmd))[:200]}: {r.stderr[:400]}")
    return r.stderr + r.stdout


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True).stdout.strip() or 0)


def levels(path):
    """peak (dBFS), mean volume (dB) and the loudest second's mean, from ffmpeg's volumedetect"""
    out = sh(FF[:1] + ['-hide_banner', '-nostats', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'])
    mx = re.search(r'max_volume: (-?[\d.]+) dB', out); mean = re.search(r'mean_volume: (-?[\d.]+) dB', out)
    return (float(mx.group(1)) if mx else None, float(mean.group(1)) if mean else None)


def lufs(path):
    out = sh(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', out)
    return float(m[-1]) if m else None


def process(meta, src, dst_dir):
    sid, group = meta['id'], meta['group']
    dst_dir.mkdir(parents=True, exist_ok=True); wav = dst_dir / f'{sid}.wav'
    tmp = dst_dir / f'_{sid}.tmp.wav'
    # to 44.1 kHz stereo 16-bit
    sh(FF + ['-i', str(src), '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', str(tmp)])
    if group in ('sfx', 'stinger') and not meta.get('loop'):
        # trim the silence at both ends, then the fades
        sh(FF + ['-i', str(tmp), '-af', 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse',
                 str(wav)])
        d = duration(wav)
        sh(FF + ['-i', str(wav), '-af', f'afade=t=in:d=0.005,afade=t=out:st={max(0, d - 0.03):.3f}:d=0.03', str(tmp)])
        peak, _ = levels(tmp); gain = -2.0 - (peak if peak is not None else 0)
        sh(FF + ['-i', str(tmp), '-af', f'volume={gain:.2f}dB', '-c:a', 'pcm_s16le', str(wav)])
    else:
        target = {'music': -16, 'ambience': -24, 'stinger': -16}.get(group, -16)
        sh(FF + ['-i', str(tmp), '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'pcm_s16le', str(wav)])
    tmp.unlink()
    return wav


def make_loop(wav, meta):
    """a seamless loop: [body] + crossfade(tail, head): one crossfade shorter, its end continues into its start"""
    d = duration(wav); xf = round(min(1.5, d * 0.12), 3)
    out = wav.with_name(wav.stem + '_loop.wav')
    flt = (f'[0:a]atrim=0:{xf},asetpts=PTS-STARTPTS[head];[0:a]atrim={xf}:{d - xf:.3f},asetpts=PTS-STARTPTS[body];[0:a]atrim={d - xf:.3f}:{d:.3f},asetpts=PTS-STARTPTS[tail];'
           f'[tail][head]acrossfade=d={xf}:c1=tri:c2=tri[x];[body][x]concat=n=2:v=0:a=1[o]')
    sh(FF + ['-i', str(wav), '-filter_complex', flt, '-map', '[o]', '-c:a', 'pcm_s16le', str(out)])
    return out


def to_ogg(wav):
    ogg = wav.with_suffix('.ogg'); sh(FF + ['-i', str(wav), '-c:a', 'libvorbis', '-q:a', '5', str(ogg)]); return ogg


def main(argv):
    only = [a for a in argv if not a.startswith('--')]
    manifest = []
    for jf in sorted(RAW.glob('*.json')):
        meta = json.loads(jf.read_text())
        if only and meta['sound'] not in only and meta['id'] not in only: continue
        src = next((p for p in (RAW / f"{meta['id']}.mp3", RAW / f"{meta['id']}.wav") if p.exists()), None)
        if not src: continue
        dst_dir = AUDIO / meta['group']
        try:
            wav = process(meta, src, dst_dir)
        except Exception as e:
            print(f"{meta['id']}: FAILED {e}"); continue
        files = [wav]
        looper = meta['model'].endswith('musicgen-looper')
        if meta.get('loop') and not looper: files.append(make_loop(wav, meta))
        if meta['group'] in ('music', 'ambience') or meta.get('loop'): files += [to_ogg(f) for f in list(files)]
        for f in files:
            peak, mean = levels(f)
            manifest.append(dict(id=f.stem, file=str(f.relative_to(AUDIO)), group=meta['group'], sound=meta['sound'], use=meta['use'], seconds=round(duration(f), 2), peak_db=peak, mean_db=mean,
                                 lufs=lufs(f) if f.suffix == '.wav' and meta['group'] in ('music', 'ambience', 'stinger') else None,
                                 loop=bool(meta.get('loop')) and (f.stem.endswith('_loop') or looper), seamless_by_bars=looper, bpm=meta.get('bpm'), prompt=meta['input']['prompt'], model=meta['model']))
        print(f"{meta['id']}: {', '.join(f.name for f in files)}")
    (AUDIO / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    lines = ['# Sounds and music: the Bubbling Moon', '', 'Made by `tools/sounds.mjs` (Replicate: Stable Audio 2.5 and MusicGen Looper), prepared by `tools/sounds_prep.py`. Raw files (as the API made them) are in `raw/`.',
             'Nobody could listen while these were made: the columns are measurements. `loop` = plays seamlessly end to start.', '']
    for g in ('sfx', 'ambience', 'music', 'stinger'):
        rows = [m for m in manifest if m['group'] == g and m['file'].endswith('.wav')]
        if not rows: continue
        lines += [f'## {g}', '', '| file | for | seconds | peak dB | mean dB | LUFS | loop |', '|---|---|---|---|---|---|---|']
        lines += [f"| `{m['file']}` | {m['use']} | {m['seconds']} | {m['peak_db']} | {m['mean_db']} | {m['lufs'] if m['lufs'] is not None else ''} | {'yes' if m['loop'] else ''}{' (bars, ' + str(m['bpm']) + ' BPM)' if m['seamless_by_bars'] else ''} |" for m in rows]
        lines.append('')
    (AUDIO / 'INDEX.md').write_text('\n'.join(lines))
    print(f'{len(manifest)} files in the manifest')


if __name__ == '__main__':
    main(sys.argv[1:])
