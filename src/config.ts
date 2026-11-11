import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");

export type Speaker = "A" | "B";

export interface ChannelConfig {
  channelName: string;
  tagline: string;
  targetMinutes: number;
  storyCount: { min: number; max: number };
  focus: { usShare: number; minWorldStories: number };
  anchors: Record<Speaker, { name: string; voice: string; speed: number }>;
  feeds: { outlet: string; url: string; region: "us" | "world" }[];
  studio?: "custom" | "drawn";
  maxItemAgeHours: number;
  maxItemsPerFeed: number;
  youtube: { categoryId: string; defaultTags: string[]; language: string };
}

export function loadConfig(): ChannelConfig {
  const file = path.join(ROOT, "config", "channel.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Loads KEY=value pairs from .env (local runs). GitHub Actions passes secrets as real env vars. */
export function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

/** Date label in US Eastern time, e.g. 2026-11-09 */
export function episodeDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function log(step: string, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [${step}] ${msg}`);
}
