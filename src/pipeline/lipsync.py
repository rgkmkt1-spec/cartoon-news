"""AI lip sync (Wav2Lip, free/open model) for one anchor.

Redraws the anchor's mouth for every video frame from the voice audio, using the anchor's
"talking face" as the reference picture. Writes the redrawn mouth patches into JPEG sprite sheets (job["outDir"]) and prints
a JSON index mapping show frames to sheet cells.

Input (argv[1]): JSON {"model", "fps", "duration", "ref", "box":[x0,y0,x1,y1] (face square in ref),
                       "patch":[x0,y0,x1,y1] (relative 0..1 of the face square), "size":[w,h],
                       "lines":[{"start","end","wav"}]}
"""
import json
import os
import sys
import wave

import cv2
import numpy as np
import onnxruntime as ort


def load_wav16k(path):
    w = wave.open(path)
    sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        a = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"unsupported sample width {sw}")
    if ch > 1:
        a = a.reshape(-1, ch).mean(1)
    if sr != 16000:
        t = np.arange(0, len(a) / sr, 1 / 16000)
        a = np.interp(t, np.arange(len(a)) / sr, a).astype(np.float32)
    return a


def _hz_to_mel(f):
    f = np.asanyarray(f, dtype=np.float64)
    fsp, minlog = 200.0 / 3, 1000.0
    logstep = np.log(6.4) / 27.0
    return np.where(f >= minlog, minlog / fsp + np.log(np.maximum(f, 1e-10) / minlog) / logstep, f / fsp)


def _mel_to_hz(m):
    m = np.asanyarray(m, dtype=np.float64)
    fsp, minlog = 200.0 / 3, 1000.0
    logstep = np.log(6.4) / 27.0
    return np.where(m >= minlog / fsp, minlog * np.exp(logstep * (m - minlog / fsp)), fsp * m)


def _mel_basis(sr=16000, n_fft=800, n_mels=80, fmin=55, fmax=7600):
    fft = np.linspace(0, sr / 2, 1 + n_fft // 2)
    pts = _mel_to_hz(np.linspace(_hz_to_mel(fmin), _hz_to_mel(fmax), n_mels + 2))
    fd = np.diff(pts)
    ramps = pts[:, None] - fft[None, :]
    w = np.zeros((n_mels, len(fft)))
    for i in range(n_mels):
        w[i] = np.maximum(0, np.minimum(-ramps[i] / fd[i], ramps[i + 2] / fd[i + 1]))
    return w * (2.0 / (pts[2:n_mels + 2] - pts[:n_mels]))[:, None]


def melspec(a):
    """Same mel spectrogram Wav2Lip was trained on (16 kHz, hop 200, 80 mels, [-4, 4])."""
    a = np.append(a[0], a[1:] - 0.97 * a[:-1])
    a = np.pad(a, 400, mode="reflect")
    win = np.hanning(801)[:-1]
    nfr = 1 + (len(a) - 800) // 200
    fr = np.lib.stride_tricks.as_strided(a, (nfr, 800), (a.strides[0] * 200, a.strides[0]))
    spec = np.abs(np.fft.rfft(fr * win, axis=1)).T
    S = 20 * np.log10(np.maximum(1e-5, _mel_basis() @ spec)) - 20
    return np.clip(8 * ((S + 100) / 100) - 4, -4, 4).astype(np.float32)


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    fps = job["fps"]
    nframes = int(np.ceil(job["duration"] * fps))
    W, H = job["size"]
    # Mouth frames go into sprite sheets (JPEG grids), only for frames where this anchor talks.
    out_dir = job["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    COLS, ROWS, PAD = job.get("cols", 10), job.get("rows", 10), 2
    CW, CH = W + 2 * PAD, H + 2 * PAD
    sheet = np.zeros((ROWS * CH, COLS * CW, 3), np.uint8)
    slot = 0
    sheets = 0
    runs = []  # [firstFrame, firstSlot, count]

    def save_sheet():
        nonlocal sheet, sheets
        cv2.imwrite(os.path.join(out_dir, f"s{sheets:03d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94])
        sheets += 1
        sheet = np.zeros_like(sheet)

    def emit_talk(i, img):
        nonlocal slot
        k = slot % (COLS * ROWS)
        r, c = divmod(k, COLS)
        sheet[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW] = cv2.copyMakeBorder(img, PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE)
        if runs and runs[-1][0] + runs[-1][2] == i and runs[-1][1] + runs[-1][2] == slot:
            runs[-1][2] += 1
        else:
            runs.append([i, slot, 1])
        slot += 1
        if slot % (COLS * ROWS) == 0:
            save_sheet()

    # this anchor's voice only, placed on the episode timeline
    track = np.zeros(int(job["duration"] * 16000) + 16000, dtype=np.float32)
    talk = np.zeros(nframes, dtype=bool)
    for ln in job["lines"]:
        a = load_wav16k(ln["wav"])
        s = int(ln["start"] * 16000)
        track[s:s + len(a)] += a[: max(0, len(track) - s)]
        talk[max(0, int(ln["start"] * fps) - 6): min(nframes, int(np.ceil(ln["end"] * fps)) + 8)] = True
    mel = melspec(track)

    ref = cv2.imread(job["ref"])
    x0, y0, x1, y1 = job["box"]
    face = ref[y0:y1, x0:x1].astype(np.float32)
    S = x1 - x0
    face96 = cv2.resize(face, (96, 96), interpolation=cv2.INTER_AREA) / 255.0
    masked = face96.copy()
    masked[48:] = 0
    target = np.concatenate([masked, face96], axis=2).transpose(2, 0, 1)[None].astype(np.float32)

    # soft oval around the mouth: only this part of the redrawn face is used
    mask = np.zeros((S, S), np.float32)
    cv2.ellipse(mask, (S // 2, int(S * 0.72)), (int(S * 0.27), int(S * 0.17)), 0, 0, 360, 1, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), S * 0.035)[..., None]

    px0, py0, px1, py1 = [int(round(v * S)) for v in job["patch"]]


    opts = ort.SessionOptions()
    sess = ort.InferenceSession(job["model"], opts, providers=["CPUExecutionProvider"])

    done = 0
    batch = []

    def flush():
        nonlocal done
        if not batch:
            return
        src = np.stack([c for _, c in batch])[:, None]
        res = sess.run(None, {"source": src, "target": np.repeat(target, len(batch), 0)})[0]
        for (fi, _), r in zip(batch, res):
            up = cv2.resize(r.transpose(1, 2, 0) * 255.0, (S, S), interpolation=cv2.INTER_CUBIC)
            up = cv2.addWeighted(up, 1.5, cv2.GaussianBlur(up, (0, 0), 2), -0.5, 0)
            fr = face * (1 - mask) + up * mask
            patch = cv2.resize(fr[py0:py1, px0:px1], (W, H), interpolation=cv2.INTER_AREA)
            emit_talk(fi, patch.clip(0, 255).astype(np.uint8))
        done += len(batch)
        batch.clear()

    total_talk = int(talk.sum())
    for i in range(nframes):
        if not talk[i]:
            flush()
            continue
        s = int(i * 80.0 / fps)
        c = mel[:, s:s + 16]
        if c.shape[1] < 16:
            c = mel[:, -16:]
        batch.append((i, c))
        if len(batch) >= 64:
            flush()
            print(f"  lipsync {done}/{total_talk}", file=sys.stderr, flush=True)
    flush()
    if slot % (COLS * ROWS):
        save_sheet()
    print(json.dumps({"slots": slot, "sheets": sheets, "cols": COLS, "rows": ROWS, "pad": PAD, "runs": runs}), flush=True)


if __name__ == "__main__":
    main()
