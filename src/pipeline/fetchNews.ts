import Parser from "rss-parser";
import { ChannelConfig, log } from "../config";

export interface NewsItem {
  id: string;
  outlet: string;
  region: "us" | "world";
  title: string;
  summary: string;
  link: string;
  published: string; // ISO
}

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsDeskBot/1.0)" },
});

function clean(s: string | undefined): string {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchNews(cfg: ChannelConfig): Promise<NewsItem[]> {
  const cutoff = Date.now() - cfg.maxItemAgeHours * 3600_000;
  const results = await Promise.allSettled(
    cfg.feeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return { feed, items: parsed.items ?? [] };
    }),
  );

  const items: NewsItem[] = [];
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  let okFeeds = 0;

  for (const r of results) {
    if (r.status === "rejected") {
      log("news", `feed failed: ${String(r.reason).slice(0, 120)}`);
      continue;
    }
    okFeeds++;
    const { feed, items: raw } = r.value;
    let kept = 0;
    for (const it of raw) {
      if (kept >= cfg.maxItemsPerFeed) break;
      const title = clean(it.title);
      const link = (it.link ?? "").trim();
      if (!title || !link) continue;
      const dateStr = it.isoDate ?? it.pubDate;
      const ts = dateStr ? Date.parse(dateStr) : NaN;
      if (!Number.isNaN(ts) && ts < cutoff) continue;
      const key = title.toLowerCase();
      if (seenLinks.has(link) || seenTitles.has(key)) continue;
      seenLinks.add(link);
      seenTitles.add(key);
      items.push({
        id: "",
        outlet: feed.outlet,
        region: feed.region,
        title,
        summary: clean(it.contentSnippet ?? it.content ?? (it as any).summary).slice(0, 220),
        link,
        published: Number.isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString(),
      });
      kept++;
    }
    log("news", `${feed.outlet}: ${kept} items`);
  }

  if (okFeeds < 2) throw new Error(`Only ${okFeeds} feeds loaded — not enough to cross-check stories.`);
  items.forEach((it, i) => (it.id = `n${i + 1}`));
  log("news", `total ${items.length} items from ${okFeeds}/${cfg.feeds.length} feeds`);
  return items;
}
