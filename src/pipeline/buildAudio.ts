import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { ChannelConfig, ROOT, env, log, prettyDate } from "../config";
import type { Script } from "./schema";
import type { EpisodeLine, EpisodeProps, EpisodeSegment, MouthCue } from "../../remotion/types";

export const LEAD_IN = 4.0; // seconds of logo sting before first line
export const TAIL = 3.0;

function run(cmd: string, args: string[], opts: { input?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      err += d;
      const s = String(d).trim();
      if (s.startsWith("voice")) process.stdout.write(`    ${s}\n`);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`)),
    );
    if (opts.input) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

export function rhubarbPath(): string {
  const fromEnv = env("RHUBARB_PATH");
  if (fromEnv) return fromEnv;
  const binDir = path.join(ROOT, ".cache", "bin");
  const exe = process.platform === "win32" ? "rhubarb.exe" : "rhubarb";
  if (fs.existsSync(binDir)) {
    for (const d of fs.readdirSync(binDir)) {
      const p = path.join(binDir, d, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("Rhubarb not found. Run: npm run setup");
}

async function lipSync(wav: string, text: string): Promise<{ start: number; end: number; value: string }[]> {
  const dialog = wav.replace(/\.wav$/, ".txt");
  fs.writeFileSync(dialog, text, "utf8");
  const jsonOut = wav.replace(/\.wav$/, ".cues.json");
  await run(rhubarbPath(), ["-f", "json", "-q", "--extendedShapes", "GHX", "-d", dialog, "-o", jsonOut, wav]);
  const raw = fs.existsSync(jsonOut) ? fs.readFileSync(jsonOut, "utf8") : "";
  if (!raw.trim()) throw new Error(`Rhubarb produced no output for ${wav}`);
  return JSON.parse(raw).mouthCues;
}

async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (next < arr.length) {
        const i = next++;
        out[i] = await fn(arr[i], i);
      }
    }),
  );
  return out;
}

/** Turns the script into audio + lip-sync data and returns the props for the Remotion video. */
export async function buildAudio(cfg: ChannelConfig, script: Script, date: string, workDir: string): Promise<EpisodeProps> {
  const audioDir = path.join(workDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  // Flatten lines; longer pause between segments than within a segment.
  const flat: { id: string; speaker: "A" | "B"; text: string; segmentIndex: number; gapBefore: number }[] = [];
  script.segments.forEach((seg, si) => {
    seg.lines.forEach((l, li) => {
      const prev = flat[flat.length - 1];
      const gap = li === 0 ? 0.9 : prev && prev.speaker !== l.speaker ? 0.45 : 0.3;
      flat.push({ id: `l${String(flat.length + 1).padStart(3, "0")}`, speaker: l.speaker, text: l.text, segmentIndex: si, gapBefore: gap });
    });
  });

  const models = path.join(ROOT, ".cache", "models");
  const job = {
    model: env("KOKORO_MODEL", path.join(models, "kokoro-v1.0.int8.onnx")),
    voices: env("KOKORO_VOICES", path.join(models, "voices-v1.0.bin")),
    outDir: audioDir,
    leadIn: LEAD_IN,
    tail: TAIL,
    lines: flat.map((l) => ({
      id: l.id,
      text: l.text,
      voice: cfg.anchors[l.speaker].voice,
      speed: cfg.anchors[l.speaker].speed,
      gapBefore: l.gapBefore,
    })),
  };
  const jobFile = path.join(audioDir, "job.json");
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));

  log("audio", `generating ${flat.length} voice lines with Kokoro`);
  const python = env("PYTHON", process.platform === "win32" ? "python" : "python3")!;
  const result = JSON.parse(await run(python, [path.join(ROOT, "src", "pipeline", "voices.py"), jobFile]));
  log("audio", `episode audio ${result.duration.toFixed(1)}s`);

  log("lipsync", `running Rhubarb on ${flat.length} lines`);
  const cueSets = await mapLimit(result.timeline, Math.max(1, os.cpus().length), async (t: any, i: number) => {
    const cues = await lipSync(t.wav, flat[i].text);
    return cues.map((c) => ({ start: +(c.start + t.start).toFixed(3), end: +(c.end + t.start).toFixed(3), value: c.value })) as MouthCue[];
  });

  const lines: EpisodeLine[] = flat.map((l, i) => ({
    id: l.id,
    speaker: l.speaker,
    text: l.text,
    start: result.timeline[i].start,
    end: result.timeline[i].end,
    segmentIndex: l.segmentIndex,
    cues: cueSets[i],
  }));

  const segments: EpisodeSegment[] = script.segments.map((s, si) => {
    const ls = lines.filter((l) => l.segmentIndex === si);
    return {
      type: s.type,
      scope: s.scope ?? "world",
      usState: (s.usState ?? "").toUpperCase(),
      headline: s.headline ?? "",
      countryCode: (s.countryCode ?? "").toUpperCase(),
      flagCode:
        s.countryCode && fs.existsSync(path.join(ROOT, "public", "flags", `${s.countryCode.toLowerCase()}.svg`))
          ? s.countryCode.toUpperCase()
          : "",
      location: s.location ?? "",
      start: si === 0 ? 0 : ls[0].start - 0.4,
      end: ls[ls.length - 1].end + 0.4,
    };
  });

  // Copy audio into Remotion's public folder so the renderer can serve it.
  const publicDir = path.join(ROOT, "public", "current");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(path.join(audioDir, "episode.wav"), path.join(publicDir, "episode.wav"));

  const [y, m, d] = date.split("-").map(Number);
  const shortDate = new Date(Date.UTC(y, m - 1, d, 12))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();

  return {
    channelName: cfg.channelName,
    tagline: cfg.tagline,
    dateLabel: prettyDate(date),
    shortDate,
    anchors: { A: { name: cfg.anchors.A.name }, B: { name: cfg.anchors.B.name } },
    audioFile: "current/episode.wav",
    durationSec: result.duration,
    leadIn: LEAD_IN,
    segments,
    lines,
    ticker: script.ticker,
  };
}
