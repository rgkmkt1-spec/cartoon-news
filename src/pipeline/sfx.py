"""Opening music + sound effects, generated in code (original, no licensing issues).

Mixes into <outDir>/episode.wav:
  - an original news theme under the cold open (ducked while anchors speak), full volume on the logo sting
  - whoosh + impact on every cold-open headline, a big hit on the sting
  - a short music tail under the end card
If public/music/intro.(mp3|wav) exists it is used instead of the generated theme.

Input argv[1]: JSON {"wav", "sr", "coldStarts":[s..], "stingStart", "stingEnd", "voice":[[start,end]..],
                     "outroStart", "duration", "customMusic": path|null}
"""
import json
import sys

import numpy as np
import soundfile as sf

SR = 24000
BPM = 120.0
BEAT = 60.0 / BPM
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- helpers
def band(x, lo=None, hi=None):
    """Static FFT filter: keep lo..hi Hz with soft edges."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, n).astype(np.float32)


def env(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return (a * np.exp(-t / decay_tau)).astype(np.float32)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    for d in (-detune, 0, detune) if detune else (0,):
        ph = (t * freq * (1 + d)) % 1.0
        out += (2 * ph - 1).astype(np.float32)
    return out / (3 if detune else 1)


def note_hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def place(buf, clip, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * gain


# ---------------------------------------------------------------- instruments
def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = band(rng.standard_normal(n).astype(np.float32), 1500, 6000) * env(n, 0.0005, 0.004) * 0.4
    return (np.sin(ph) * env(n, 0.001, 0.12) + click).astype(np.float32)


def clap():
    n = int(0.3 * SR)
    noise = band(rng.standard_normal(n).astype(np.float32), 900, 5000)
    e = env(n, 0.001, 0.09)
    for k in (0.012, 0.024):  # multi-hit clap
        e[int(k * SR):] += env(n - int(k * SR), 0.001, 0.02) * 0.6
    return noise * e * 0.6


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return band(rng.standard_normal(n).astype(np.float32), 7000, None) * env(n, 0.0005, 0.06 if open_ else 0.012) * 0.35


def bass(midi, dur):
    n = int(dur * SR)
    s = saw(note_hz(midi), n) * 0.6 + np.sin(2 * np.pi * note_hz(midi) * np.arange(n) / SR)
    return band(s, None, 700) * env(n, 0.004, dur * 0.9) * 0.55


def pad(chord, dur):
    n = int(dur * SR)
    s = sum(saw(note_hz(m), n, 0.004) for m in chord) / len(chord)
    a = np.minimum(1, np.arange(n) / (0.25 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.2 * SR))
    return band(s, 150, 2200) * a.astype(np.float32) * 0.22


def stab(chord, dur=0.45):
    n = int(dur * SR)
    s = sum(saw(note_hz(m + 12), n, 0.006) for m in chord) / len(chord)
    return band(s, 250, 5000) * env(n, 0.003, 0.16) * 0.5


def whoosh(dur=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    lo = band(rng.standard_normal(n).astype(np.float32), 300, 1500)
    hi = band(rng.standard_normal(n).astype(np.float32), 1500, 7000)
    mix = lo * (1 - t / dur) + hi * (t / dur)  # rising brightness
    return (mix * shape).astype(np.float32) * 0.5


def impact(big=False):
    n = int((1.4 if big else 0.8) * SR)
    t = np.arange(n) / SR
    f = 32 + 90 * np.exp(-t / 0.06)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.45 if big else 0.25)
    crack = band(rng.standard_normal(n).astype(np.float32), 200, 6000) * env(n, 0.0008, 0.05 if big else 0.03)
    return (boom * 0.9 + crack * 0.5).astype(np.float32)


def riser(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 200 * (6 ** (t / dur))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    noise = band(rng.standard_normal(n).astype(np.float32), 2000, 9000) * 0.5
    return ((tone + noise) * (t / dur) ** 2).astype(np.float32) * 0.5


# ---------------------------------------------------------------- the theme
# D minor, i - VI - III - VII  (Dm, Bb, F, C): urgent, classic news feel
CHORDS = [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]]
ROOTS = [38, 34, 41, 36]


def theme(seconds):
    n = int(seconds * SR) + SR
    out = np.zeros(n, np.float32)
    bar = 4 * BEAT
    bars = int(np.ceil(seconds / bar)) + 1
    K, C, H, HO = kick(), clap(), hat(), hat(True)
    for b in range(bars):
        t0 = b * bar
        ch, root = CHORDS[b % 4], ROOTS[b % 4]
        place(out, pad(ch, bar), t0)
        place(out, stab(ch), t0, 0.9)
        for beat in range(4):
            tb = t0 + beat * BEAT
            if beat in (0, 2) or (beat == 3 and b % 2 == 1):
                place(out, K, tb, 0.9)
            if beat in (1, 3):
                place(out, C, tb, 0.7)
            for e in range(2):  # driving 8th-note bass + hats
                te = tb + e * BEAT / 2
                place(out, bass(root, BEAT / 2 * 0.9), te)
                place(out, HO if e == 1 and beat == 3 else H, te, 0.8)
        if b % 2 == 1:  # brass-style pickup stabs
            place(out, stab(ch, 0.25), t0 + 3.5 * BEAT, 0.6)
    return out[: int(seconds * SR)]


def load_custom(path, seconds):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:  # simple linear resample
        idx = np.arange(0, len(x) - 1, sr / SR)
        x = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
    need = int(seconds * SR)
    if len(x) < need:
        x = np.tile(x, int(np.ceil(need / len(x))))
    x = x[:need]
    return x / (np.max(np.abs(x)) or 1) * 0.8


def fade(n, fin, fout):
    a = np.ones(n, np.float32)
    i, o = int(fin * SR), int(fout * SR)
    if i:
        a[:i] = np.linspace(0, 1, i)
    if o:
        a[-o:] *= np.linspace(1, 0, o)
    return a


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    voice, sr = sf.read(job["wav"], dtype="float32")
    assert sr == SR, f"expected {SR} Hz, got {sr}"
    total = len(voice)
    music = np.zeros(total, np.float32)
    fx = np.zeros(total, np.float32)

    # ---- opening music: start -> a little after the sting
    open_end = job["stingEnd"] + 0.8
    src = load_custom(job["customMusic"], open_end) if job.get("customMusic") else theme(open_end)
    src = src[: int(open_end * SR)] * fade(int(open_end * SR), 0.05, 1.0)

    # ducking: quieter under speech, full during title card and sting
    gain = np.full(total, 0.55, np.float32)
    for s, e in job["voice"]:
        if s < open_end:
            gain[int(max(0, s - 0.08) * SR): int((e + 0.1) * SR)] = 0.2
    gain[int(job["stingStart"] * SR): int(job["stingEnd"] * SR)] = 0.75
    k = int(0.06 * SR)
    gain = np.convolve(gain, np.ones(k) / k, mode="same").astype(np.float32)  # smooth
    music[: len(src)] += src
    music *= gain

    # ---- outro music under the end card
    if job.get("outroStart") is not None:
        o0 = job["outroStart"]
        dur = max(0.5, job["duration"] - o0)
        tail = (load_custom(job["customMusic"], dur) if job.get("customMusic") else theme(dur)) * fade(int(dur * SR), 0.8, 2.0) * 0.5
        place(music, tail, o0)

    # ---- sound effects
    for i, t in enumerate(job["coldStarts"]):
        place(fx, whoosh(0.45), max(0, t - 0.4), 0.55)
        place(fx, impact(), t, 0.7)
    if job["coldStarts"]:
        place(fx, riser(1.0), max(0, job["stingStart"] - 1.0), 0.5)
    place(fx, impact(big=True), job["stingStart"], 0.85)
    place(fx, whoosh(0.5), max(0, job["stingEnd"] - 0.45), 0.5)

    mix = voice + music + fx
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # glue + soft limit
    sf.write(job["wav"], np.clip(mix, -0.98, 0.98).astype(np.float32), SR)
    print(json.dumps({"ok": True, "custom": bool(job.get("customMusic"))}))


if __name__ == "__main__":
    main()
