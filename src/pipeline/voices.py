"""Generate anchor voices with Kokoro (free, open source, Apache 2.0) and assemble the episode audio track.

Input  (argv[1]): JSON {"model":..., "voices":..., "outDir":..., "leadIn":s, "tail":s,
                        "lines":[{"id","text","voice","speed","gapBefore"}]}
Output: <outDir>/lines/<id>.wav for each line, <outDir>/episode.wav, and prints JSON timeline to stdout.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = job["outDir"]
    lines_dir = os.path.join(out_dir, "lines")
    os.makedirs(lines_dir, exist_ok=True)

    kokoro = Kokoro(job["model"], job["voices"])
    sr = 24000
    pieces = [np.zeros(int(job["leadIn"] * sr), dtype=np.float32)]
    cursor = job["leadIn"]
    timeline = []

    for i, line in enumerate(job["lines"]):
        samples, sr = kokoro.create(line["text"], voice=line["voice"], speed=line.get("speed", 1.0), lang="en-us")
        samples = np.asarray(samples, dtype=np.float32)
        # trim leading/trailing near-silence so lip sync and gaps are tight
        idx = np.where(np.abs(samples) > 0.01)[0]
        if len(idx):
            samples = samples[max(0, idx[0] - int(0.03 * sr)): min(len(samples), idx[-1] + int(0.08 * sr))]
        # normalize each line to the same loudness so both anchors match
        peak = float(np.max(np.abs(samples))) or 1.0
        samples = samples * (0.85 / peak)

        gap = float(line.get("gapBefore", 0.3)) if i > 0 else 0.0
        if gap > 0:
            pieces.append(np.zeros(int(gap * sr), dtype=np.float32))
            cursor += gap
        path = os.path.join(lines_dir, f"{line['id']}.wav")
        sf.write(path, samples, sr)
        dur = len(samples) / sr
        timeline.append({"id": line["id"], "start": round(cursor, 3), "end": round(cursor + dur, 3), "wav": path})
        pieces.append(samples)
        cursor += dur
        print(f"  voice {i + 1}/{len(job['lines'])} {dur:.1f}s", file=sys.stderr, flush=True)

    pieces.append(np.zeros(int(job["tail"] * sr), dtype=np.float32))
    audio = np.concatenate(pieces)
    sf.write(os.path.join(out_dir, "episode.wav"), audio, sr)
    print(json.dumps({"sampleRate": sr, "duration": round(len(audio) / sr, 3), "timeline": timeline}))


if __name__ == "__main__":
    main()
