/**
 * Daily pipeline:  news -> script -> voices -> lip sync -> video -> YouTube -> email
 *
 *   npm run daily                 full run
 *   npm run daily -- --script-only   just fetch news + write script + email it (fast check)
 *   npm run daily -- --sample        skip news/AI, use samples/sample-script.json (tests voices + video)
 *   npm run daily -- --no-upload     render but don't upload to YouTube
 *   npm run daily -- --reuse-script  use today's already-written script (skips news + Gemini)
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, episodeDate, loadConfig, loadDotEnv, log, prettyDate } from "./config";
import { fetchNews, NewsItem } from "./pipeline/fetchNews";
import { writeScript } from "./pipeline/writeScript";
import { buildAudio } from "./pipeline/buildAudio";
import { renderEpisode } from "./pipeline/render";
import { buildDescription, runUrl, scriptAsText, sendEmail, uploadToYouTube } from "./pipeline/publish";
import type { Script } from "./pipeline/schema";

async function main() {
  loadDotEnv();
  const args = new Set(process.argv.slice(2));
  const cfg = loadConfig();
  const date = episodeDate();
  const outDir = path.join(ROOT, "out", date);
  fs.mkdirSync(outDir, { recursive: true });
  const save = (name: string, data: unknown) =>
    fs.writeFileSync(path.join(outDir, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));

  log("run", `${cfg.channelName} — ${prettyDate(date)} -> ${path.relative(ROOT, outDir)}`);

  // 1. News + 2. Script
  let items: NewsItem[] = [];
  let script: Script;
  const todayScript = path.join(outDir, "script.json");
  const todayNews = path.join(outDir, "news.json");
  if (args.has("--reuse-script") && fs.existsSync(todayScript)) {
    script = JSON.parse(fs.readFileSync(todayScript, "utf8"));
    if (fs.existsSync(todayNews)) items = JSON.parse(fs.readFileSync(todayNews, "utf8"));
    log("run", "reusing today's script.json");
  } else if (args.has("--sample")) {
    script = JSON.parse(fs.readFileSync(path.join(ROOT, "samples", "sample-script.json"), "utf8"));
    log("run", "using sample script");
  } else {
    items = await fetchNews(cfg);
    save("news.json", items);
    script = await writeScript(cfg, items, date);
  }
  save("script.json", script);
  const scriptText = scriptAsText(cfg, script);
  save("script.txt", scriptText);
  let description = buildDescription(cfg, script, items, date);
  save("description.txt", description);

  if (args.has("--script-only")) {
    await sendEmail({
      subject: `[${cfg.channelName}] Script for ${prettyDate(date)}`,
      text: `${script.youtubeTitle}\n\n${scriptText}\n\n---- YouTube description ----\n${description}`,
    });
    log("run", "done (script only)");
    return;
  }

  // 3. Voices + lip sync
  const props = await buildAudio(cfg, script, date, outDir);
  save("props.json", props);
  description = buildDescription(cfg, script, items, date, props); // now with chapter timestamps
  save("description.txt", description);

  // 4. Video + thumbnail
  const { videoPath, thumbPath } = await renderEpisode(props, outDir);

  // 5. YouTube
  let yt: Awaited<ReturnType<typeof uploadToYouTube>> = null;
  if (!args.has("--no-upload")) {
    yt = await uploadToYouTube({ cfg, script, description, videoPath, thumbPath });
  }

  // 6. Email
  const mins = (props.durationSec / 60).toFixed(1);
  const lines = [
    `${script.youtubeTitle}`,
    `Length: ${mins} min`,
    yt ? `YouTube: ${yt.url}  (${yt.status})` : "YouTube: not uploaded — download the video from the run below and upload it yourself.",
    runUrl() ? `Run + video download (Artifacts section): ${runUrl()}` : `Video: ${videoPath}`,
    "",
    "Please check names, numbers and facts against the sources below before it goes public.",
    yt && yt.status.startsWith("scheduled")
      ? "To STOP it from publishing: YouTube Studio > Content > this video > Visibility > Private."
      : "",
    "",
    "================ SCRIPT ================",
    scriptText,
    "",
    "================ DESCRIPTION / SOURCES ================",
    description,
  ];
  await sendEmail({
    subject: `[${cfg.channelName}] ${yt?.status.startsWith("scheduled") ? "Scheduled" : "Ready for review"}: ${prettyDate(date)}`,
    text: lines.join("\n"),
    attachments: [{ filename: "thumbnail.png", path: thumbPath }],
  });
  log("run", "all done ✔");
}

main().catch(async (err) => {
  console.error(err);
  try {
    loadDotEnv();
    const cfg = loadConfig();
    await sendEmail({
      subject: `[${cfg.channelName}] ❌ Daily episode FAILED`,
      text: `The daily run failed.\n\n${(err as Error).stack ?? err}\n\n${runUrl() ?? ""}`,
    });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
