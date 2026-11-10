import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { ChannelConfig, ROOT, env, log, prettyDate } from "../config";
import type { Script } from "./schema";
import type { EpisodeLine, EpisodeProps, EpisodeSegment, MouthCue } from "../../remotion/types";

export const LEAD_IN = 4.0; // seconds of logo sting before first line
export const TAIL = 3.0;
export const STING = 2.6; // logo sting between the cold open and the intro
export const COLD_LEAD = 0.9; // "TOP STORIES" title before the first teaser

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

  // Build the running order: cold-open teasers (if any), then the script's segments.
  type Seg = Omit<Script["segments"][number], "type"> & { type: "cold" | "intro" | "story" | "outro"; storyNumber: number };
  const stories = script.segments.filter((s) => s.type === "story");
  const cold: Seg[] = (script.coldOpen ?? [])
    .filter((c) => stories[c.story - 1])
    .slice(0, 3)
    .map((c, i) => ({
      ...stories[c.story - 1],
      type: "cold" as const,
      storyNumber: c.story,
      lines: [{ speaker: (i % 2 === 0 ? "B" : "A") as "A" | "B", text: c.text }],
    }));
  let storyNo = 0;
  const allSegs: Seg[] = [
    ...cold,
    ...script.segments.map((s) => ({ ...s, storyNumber: s.type === "story" ? ++storyNo : 0 }) as Seg),
  ];
  const hasCold = cold.length > 0;

  // Flatten lines; longer pause between segments than within a segment, and room for the logo sting.
  const flat: { id: string; speaker: "A" | "B"; text: string; segmentIndex: number; gapBefore: number }[] = [];
  allSegs.forEach((seg, si) => {
    seg.lines.forEach((l, li) => {
      const prev = flat[flat.length - 1];
      let gap = li === 0 ? 0.9 : prev && prev.speaker !== l.speaker ? 0.45 : 0.3;
      if (seg.type === "cold" && li === 0) gap = 0.35;
      if (seg.type === "intro" && li === 0 && hasCold) gap = STING + 0.25;
      if (seg.type === "story" && li === 0 && allSegs[si - 1]?.type === "intro") gap = 0.5;
      flat.push({ id: `l${String(flat.length + 1).padStart(3, "0")}`, speaker: l.speaker, text: l.text, segmentIndex: si, gapBefore: gap });
    });
  });

  const models = path.join(ROOT, ".cache", "models");
  const job = {
    model: env("KOKORO_MODEL", path.join(models, "kokoro-v1.0.int8.onnx")),
    voices: env("KOKORO_VOICES", path.join(models, "voices-v1.0.bin")),
    outDir: audioDir,
    leadIn: hasCold ? COLD_LEAD : LEAD_IN,
    tail: TAIL,
    lines: flat.map((l) => ({
      id: l.id,
      text: l.text,
      voice: cfg.anchors[l.speaker].voice,
      speed: cfg.anchors[l.speaker].speed * (allSegs[l.segmentIndex].type === "cold" ? 1.08 : 1),
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

  const segments: EpisodeSegment[] = allSegs.map((s, si) => {
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
      keyFacts: s.keyFacts ?? [],
      storyNumber: s.storyNumber,
      start: si === 0 && s.type !== "cold" ? 0 : ls[0].start - (s.type === "cold" ? 0.35 : 0.4),
      end: ls[ls.length - 1].end + (s.type === "cold" ? 0.35 : 0.4),
    };
  });

  const lastCold = [...lines].reverse().find((l) => allSegs[l.segmentIndex].type === "cold");
  const firstIntro = lines.find((l) => allSegs[l.segmentIndex].type === "intro");
  const stingStart = hasCold && lastCold ? lastCold.end + 0.35 : 0;
  const stingEnd = hasCold && firstIntro ? firstIntro.start - 0.2 : LEAD_IN;

  // Opening music, sound effects and end-card music (generated in code; or your own public/music/intro.mp3|wav)
  if (env("SOUND_FX", "on") !== "off") {
    const custom = ["mp3", "wav"].map((x) => path.join(ROOT, "public", "music", `intro.${x}`)).find((p) => fs.existsSync(p)) ?? null;
    const lastLine = lines[lines.length - 1];
    const sfxJob = {
      wav: path.join(audioDir, "episode.wav"),
      coldStarts: segments.filter((s) => s.type === "cold").map((s) => s.start),
      stingStart,
      stingEnd,
      voice: lines.map((l) => [l.start, l.end]),
      outroStart: lastLine ? lastLine.end + 0.5 : null,
      duration: result.duration,
      customMusic: custom,
    };
    const sfxFile = path.join(audioDir, "sfx.json");
    fs.writeFileSync(sfxFile, JSON.stringify(sfxJob));
    await run(python, [path.join(ROOT, "src", "pipeline", "sfx.py"), sfxFile]);
    log("audio", `music + sound effects mixed${custom ? ` (your track: ${path.basename(custom)})` : " (built-in theme)"}`);
  }

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
    stingStart,
    stingEnd,
    storyCount: stories.length,
    segments,
    lines,
    ticker: script.ticker,
  };
}
