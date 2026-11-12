import fs from "node:fs";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { ChannelConfig, env, log, prettyDate } from "../config";
import type { NewsItem } from "./fetchNews";
import type { Script } from "./schema";
import type { EpisodeProps } from "../../remotion/types";

function stamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** YouTube chapters from the finished timeline (needs props from buildAudio). */
function chapters(props: EpisodeProps): string[] {
  const out: [number, string][] = [[0, "Today's top stories"]];
  for (const seg of props.segments) {
    if (seg.type === "story") out.push([seg.start, seg.kicker ? `And finally: ${seg.headline}` : seg.headline]);
    if (seg.type === "outro") out.push([seg.start, "Sign-off"]);
  }
  // YouTube rules: first at 0:00, at least 3, each at least 10 seconds long
  const ok: [number, string][] = [];
  for (const c of out) if (!ok.length || c[0] - ok[ok.length - 1][0] >= 10) ok.push(c);
  return ok.length >= 3 ? ok.map(([t, h]) => `${stamp(t)} ${h}`) : [];
}

export function buildDescription(cfg: ChannelConfig, script: Script, items: NewsItem[], date: string, props?: EpisodeProps): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const parts: string[] = [];
  parts.push(`${script.summary}`);
  parts.push("");
  parts.push(`${cfg.channelName} — ${prettyDate(date)}. New episode every morning: subscribe so you don't miss tomorrow's news!`);
  parts.push("");
  const ch = props ? chapters(props) : [];
  if (ch.length) {
    parts.push("IN THIS EPISODE");
    parts.push(...ch);
    parts.push("");
  }
  const stories = script.segments.filter((s) => s.type === "story");
  for (const [label, scope] of [["U.S. STORIES & SOURCES", "us"], ["WORLD STORIES & SOURCES", "world"]] as const) {
    const group = stories.filter((s) => s.scope === scope);
    if (!group.length) continue;
    parts.push(label);
    for (const seg of group) {
      parts.push(`• ${seg.headline}`);
      for (const id of seg.sourceIds) {
        const it = byId.get(id);
        if (it) parts.push(`   ${it.outlet}: ${it.link}`);
      }
    }
    parts.push("");
  }
  parts.push(
    "About this channel: an animated daily news summary. The anchors are animated characters with synthetic voices. " +
      "Scripts are written with AI assistance using only facts reported by the news outlets linked above, and every story is checked against at least two outlets. " +
      "Please see the original reporting for full details.",
  );
  parts.push("");
  const tags = Array.from(new Set([...(script.hashtags ?? []), "#news", "#usnews", "#worldnews"].map((h) => h.toLowerCase()))).slice(0, 6);
  parts.push(tags.join(" "));
  return parts.join("\n").slice(0, 4900);
}

/** Tags for YouTube: today's specific tags first, then channel defaults, within YouTube's 500-character limit. */
export function buildTags(cfg: ChannelConfig, script: Script): string[] {
  const all = Array.from(new Set([...script.tags, ...cfg.youtube.defaultTags].map((t) => t.trim().toLowerCase()).filter(Boolean)));
  const out: string[] = [];
  let len = 0;
  for (const t of all) {
    const cost = t.length + (t.includes(" ") ? 2 : 0) + 1;
    if (len + cost > 480 || out.length >= 30) break;
    out.push(t);
    len += cost;
  }
  return out;
}

export function scriptAsText(cfg: ChannelConfig, script: Script): string {
  const name = (s: "A" | "B") => cfg.anchors[s].name.split(" ")[0].toUpperCase();
  return script.segments
    .map((seg) => {
      const head = seg.type === "story" ? `\n=== ${seg.headline} (${seg.location || "World"}) ===` : `\n=== ${seg.type.toUpperCase()} ===`;
      return head + "\n" + seg.lines.map((l) => `${name(l.speaker)}: ${l.text}`).join("\n");
    })
    .join("\n");
}

export async function uploadToYouTube(opts: {
  cfg: ChannelConfig;
  script: Script;
  description: string;
  videoPath: string;
  thumbPath: string;
}): Promise<{ id: string; url: string; status: string } | null> {
  const mode = env("YOUTUBE_MODE", "off");
  if (mode === "off") {
    log("youtube", "YOUTUBE_MODE=off — skipping upload");
    return null;
  }
  const clientId = env("YOUTUBE_CLIENT_ID");
  const clientSecret = env("YOUTUBE_CLIENT_SECRET");
  const refreshToken = env("YOUTUBE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("YouTube upload enabled but YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN missing");

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: "v3", auth });

  const status: any = { privacyStatus: "private", selfDeclaredMadeForKids: false };
  if (mode === "public") status.privacyStatus = "public";
  if (mode === "scheduled") {
    const hours = Number(env("REVIEW_WINDOW_HOURS", "2"));
    status.publishAt = new Date(Date.now() + hours * 3600_000).toISOString();
  }

  const tags = buildTags(opts.cfg, opts.script);
  log("youtube", `uploading (mode=${mode})`);
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: opts.script.youtubeTitle.slice(0, 100),
        description: opts.description,
        tags,
        categoryId: opts.cfg.youtube.categoryId,
        defaultLanguage: opts.cfg.youtube.language,
        defaultAudioLanguage: opts.cfg.youtube.language,
      },
      status,
    },
    media: { body: fs.createReadStream(opts.videoPath) },
  });
  const id = res.data.id!;
  log("youtube", `uploaded https://youtu.be/${id}`);

  try {
    await yt.thumbnails.set({ videoId: id, media: { mimeType: "image/png", body: fs.createReadStream(opts.thumbPath) } });
    log("youtube", "thumbnail set");
  } catch (e) {
    log("youtube", `thumbnail not set (channel may need phone verification): ${(e as Error).message}`);
  }
  return { id, url: `https://youtu.be/${id}`, status: mode === "scheduled" ? `scheduled for ${status.publishAt}` : status.privacyStatus };
}

export async function sendEmail(opts: { subject: string; text: string; attachments?: { filename: string; path: string }[] }) {
  const user = env("GMAIL_USER");
  const pass = env("GMAIL_APP_PASSWORD");
  const to = env("NOTIFY_EMAIL", user);
  if (!user || !pass) {
    log("email", "GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email");
    return;
  }
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } });
  await transport.sendMail({ from: user, to, subject: opts.subject, text: opts.text, attachments: opts.attachments });
  log("email", `sent to ${to}`);
}

export function runUrl(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
}
