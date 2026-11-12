import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ROOT, env, log } from "../config";
import type { EpisodeProps } from "../../remotion/types";

export async function renderEpisode(props: EpisodeProps, outDir: string) {
  log("render", "bundling Remotion project");
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion", "index.ts"),
    publicDir: path.join(ROOT, "public"),
  });

  const browserExecutable = env("REMOTION_BROWSER") ?? null;
  const licenseKey = env("REMOTION_LICENSE_KEY", "free-license"); // individuals/≤3-person companies are free
  const inputProps = props as unknown as Record<string, unknown>;

  const thumbPath = path.join(outDir, "thumbnail.png");
  const thumbComp = await selectComposition({ serveUrl, id: "Thumbnail", inputProps, browserExecutable });
  await renderStill({ composition: thumbComp, serveUrl, output: thumbPath, inputProps, browserExecutable });
  log("render", `thumbnail -> ${thumbPath}`);

  // If an old episode.mp4 is open in a video player, Windows locks it and the final rename fails.
  // Delete it first; if that's impossible, write to a new file name instead.
  let videoPath = path.join(outDir, "episode.mp4");
  try {
    if (fs.existsSync(videoPath)) fs.rmSync(videoPath);
  } catch {
    videoPath = path.join(outDir, `episode-${Date.now()}.mp4`);
    log("render", `episode.mp4 is open in another program — saving as ${path.basename(videoPath)}`);
  }

  const renderWith = async (p: EpisodeProps) => {
    const ip = p as unknown as Record<string, unknown>;
    const comp = await selectComposition({ serveUrl, id: "NewsShow", inputProps: ip, browserExecutable });
    let lastPct = -1;
    const started = Date.now();
    await renderMedia({
      composition: comp,
      serveUrl,
      codec: "h264",
      crf: 20,
      x264Preset: "veryfast",
      audioCodec: "aac",
      audioBitrate: "192k",
      outputLocation: videoPath,
      inputProps: ip,
      browserExecutable,
      licenseKey,
      concurrency: Number(env("RENDER_CONCURRENCY", String(Math.max(1, os.cpus().length)))),
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct % 10 === 0 && pct !== lastPct) {
          lastPct = pct;
          log("render", `${pct}% (${Math.round((Date.now() - started) / 1000)}s)`);
        }
      },
    });
  };

  const usesAiLips = !!props.studio && Object.values(props.studio.anchors).some((a) => a.lipAtlas);
  try {
    await renderWith(props);
  } catch (e) {
    if (!usesAiLips) throw e;
    // Safety net: never lose an episode over the AI mouths — render again with the picture mouths.
    log("render", `AI lip-sync video could not be read (${String((e as Error).message).split("\n")[0].slice(0, 160)}) — rendering again with picture mouths`);
    const anchors = Object.fromEntries(
      Object.entries(props.studio!.anchors).map(([k, a]) => [k, { ...a, lipAtlas: undefined }]),
    ) as NonNullable<EpisodeProps["studio"]>["anchors"];
    await renderWith({ ...props, studio: { ...props.studio!, anchors } });
  }
  log("render", `video -> ${videoPath}`);
  return { videoPath, thumbPath };
}
