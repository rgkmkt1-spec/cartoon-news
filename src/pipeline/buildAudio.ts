import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { ChannelConfig, ROOT, env, log, prettyDate } from "../config";
import type { Script } from "./schema";
import { FPS } from "../../remotion/types";
import type { EpisodeLine, EpisodeProps, EpisodeSegment, MouthCue, StudioMeta } from "../../remotion/types";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const ONES_ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const TENS_ORD = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];

function ordinalWords(n: number): string | null {
  if (n >= 100 && n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${ONES[h]} hundredth` : `${ONES[h]} hundred ${ordinalWords(r)}`;
  }
  if (n < 1 || n > 99) return null;
  if (n < 20) return ONES_ORD[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS_ORD[t] : `${TENS[t]}-${ONES_ORD[o]}`;
}

/** Text as the voice should say it: "November 4th" -> "November fourth" (the voice model reads "4th" as "four t h"). */
export function speakable(text: string): string {
  return text.replace(/\b(\d{1,3})(st|nd|rd|th)\b/gi, (m, num) => ordinalWords(Number(num)) ?? m);
}

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
      lines: [{ speaker: (i % 2 === 0 ? "B" : "A") as "A" | "B", text: c.text, tone: "normal" as const }],
    }));
  let storyNo = 0;
  const allSegs: Seg[] = [
    ...cold,
    ...script.segments.map((s) => ({ ...s, storyNumber: s.type === "story" ? ++storyNo : 0 }) as Seg),
  ];
  const hasCold = cold.length > 0;

  // Flatten lines; longer pause between segments than within a segment, and room for the logo sting.
  const flat: { id: string; speaker: "A" | "B"; text: string; tone: "joke" | "normal"; segmentIndex: number; gapBefore: number }[] = [];
  allSegs.forEach((seg, si) => {
    seg.lines.forEach((l, li) => {
      const prev = flat[flat.length - 1];
      // snappy pacing: short pauses, a beat after a joke so it lands
      let gap = li === 0 ? 0.6 : prev && prev.speaker !== l.speaker ? 0.28 : 0.18;
      if (prev?.tone === "joke") gap += 0.35;
      if (seg.type === "cold" && li === 0) gap = 0.35;
      if (seg.type === "intro" && li === 0 && hasCold) gap = STING + 0.25;
      if (seg.type === "story" && li === 0 && allSegs[si - 1]?.type === "intro") gap = 0.5;
      flat.push({ id: `l${String(flat.length + 1).padStart(3, "0")}`, speaker: l.speaker, text: l.text, tone: l.tone ?? "normal", segmentIndex: si, gapBefore: gap });
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
      text: speakable(l.text),
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
    const cues = await lipSync(t.wav, speakable(flat[i].text));
    return cues.map((c) => ({ start: +(c.start + t.start).toFixed(3), end: +(c.end + t.start).toFixed(3), value: c.value })) as MouthCue[];
  });

  const lines: EpisodeLine[] = flat.map((l, i) => ({
    id: l.id,
    speaker: l.speaker,
    text: l.text,
    tone: l.tone,
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
      kicker: !!s.kicker,
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
      storyStarts: segments.filter((s) => s.type === "story").map((s) => s.start),
      bed: env("MUSIC_BED", "on") !== "off",
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

  const studio: StudioMeta | undefined =
    cfg.studio === "custom" && fs.existsSync(path.join(ROOT, "public", "studio", "studio.json"))
      ? JSON.parse(fs.readFileSync(path.join(ROOT, "public", "studio", "studio.json"), "utf8"))
      : undefined;

  // AI lip sync (Wav2Lip): one small "mouth video" per anchor, frame-locked to the show
  const w2l = env("WAV2LIP_MODEL", path.join(models, "wav2lip_gan_96.onnx"))!;
  if (studio && env("LIPSYNC", "ai") !== "off" && fs.existsSync(w2l)) {
    for (const s of ["A", "B"] as const) {
      const a = studio.anchors[s];
      if (!a.lip) continue;
      const mine = lines.map((l, i) => ({ l, wav: result.timeline[i].wav as string })).filter((x) => x.l.speaker === s);
      const job = {
        model: w2l,
        fps: FPS,
        duration: result.duration,
        ref: path.join(ROOT, "public", a.lip.ref),
        box: a.lip.box,
        patch: a.lip.patch,
        size: a.lip.size,
        lines: mine.map((x) => ({ start: x.l.start, end: x.l.end, wav: x.wav })),
      };
      const dirName = `lip_${s}`;
      const outDir = path.join(publicDir, dirName);
      fs.rmSync(outDir, { recursive: true, force: true });
      const jobFile = path.join(audioDir, `lipsync-${s}.json`);
      fs.writeFileSync(jobFile, JSON.stringify({ ...job, outDir }));
      log("lipsync", `AI lip sync for ${cfg.anchors[s].name} (${mine.length} lines)`);
      try {
        const out = await run(python, [path.join(ROOT, "src", "pipeline", "lipsync.py"), jobFile]);
        const idx = JSON.parse(out.trim().split("\n").pop()!);
        const missing = Array.from({ length: idx.sheets }, (_, k) => `s${String(k).padStart(3, "0")}.jpg`).filter(
          (f) => !fs.existsSync(path.join(outDir, f)),
        );
        if (!idx.slots || missing.length) throw new Error(`sprite sheets incomplete (${missing.length} missing)`);
        a.lipAtlas = { dir: `current/${dirName}`, cols: idx.cols, rows: idx.rows, pad: idx.pad, size: a.lip.size, runs: idx.runs };
        log("lipsync", `mouth frames ready for ${cfg.anchors[s].name} (${idx.slots} frames, ${idx.sheets} sheets)`);
      } catch (e) {
        log("lipsync", `AI lip sync failed for ${cfg.anchors[s].name} - using picture mouths (${String((e as Error).message).slice(0, 200)})`);
      }
    }
  } else if (studio && env("LIPSYNC", "ai") !== "off") {
    log("lipsync", "AI lip-sync model not found (run npm run setup) - using picture mouths");
  }

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
    studio,
  };
}
