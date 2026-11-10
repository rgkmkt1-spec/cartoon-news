import { spawn } from "node:child_process";
import { ChannelConfig, env, log, prettyDate } from "../config";
import type { NewsItem } from "./fetchNews";
import { checkScript, Script, ScriptSchema } from "./schema";
import countries from "i18n-iso-countries";
import { US_STATES } from "../../remotion/usStates";

function buildPrompt(cfg: ChannelConfig, items: NewsItem[], date: string): string {
  const A = cfg.anchors.A.name;
  const B = cfg.anchors.B.name;
  const words = cfg.targetMinutes * 150;
  const total = cfg.storyCount.max;
  const usCount = Math.round(total * cfg.focus.usShare);
  const feed = items
    .map((i) => `[${i.id}] (${i.region.toUpperCase()} feed · ${i.outlet} · ${i.published.slice(0, 16)}Z) ${i.title} — ${i.summary}`)
    .join("\n");

  return `You are the head writer for "${cfg.channelName}", a daily animated news broadcast focused on the UNITED STATES, with a short roundup of the most important stories from around the world.
Two anchors read the news at a desk: anchor A is ${A} (male), anchor B is ${B} (female).
Today is ${prettyDate(date)}.

TASK
Pick ${cfg.storyCount.min}-${cfg.storyCount.max} stories from the wire items below and write the broadcast script:
- About ${usCount} UNITED STATES stories (scope "us"): national politics and government, courts, the economy and jobs, weather and disasters, public safety, health, science and technology, major business news, and big stories from individual states.
- Then at least ${cfg.focus.minWorldStories} of the most important WORLD stories (scope "world"), introduced with a clear transition such as "Now to news from around the world."
- Order: all US stories first (most important first), then the world stories.

EDITORIAL RULES (strict)
1. Straight news. Neutral, factual, calm, professional. No jokes, no opinions, no editorializing, no speculation, no predictions.
2. Only state facts that appear in the wire items. Never invent names, numbers, quotes, places or details.
3. Every story MUST be covered by at least 2 different outlets in the list. Many wire items are covered by only one outlet: SKIP those. First find events reported by 2+ different outlets, then choose only from them. List those item ids in "sourceIds" (ids from at least 2 different outlets).
4. Attribute claims ("officials said", "according to NPR", "the White House said"). If figures differ between outlets, say so or use the more cautious wording.
5. POLITICS: be strictly even-handed. Use neutral, non-loaded language. Use official titles. When outlets report reactions or positions from more than one side (for example both parties), include them fairly and in similar length. Never characterize motives.
6. Skip celebrity gossip, sports results, opinion columns, product promotions and minor local crime.
7. Deaths, violence and disasters: plain, respectful language. No graphic detail.
8. Write for the EAR: short sentences, spell out abbreviations on first use, say "percent" not "%", no URLs, no parentheses, no emoji, no stage directions.
9. Anchors alternate stories. Hand-offs are brief and natural ("Thanks, ${B.split(" ")[0]}."). Keep banter minimal and professional.
10. Intro: ${A} greets viewers, names the show and the date; ${B} previews the top 3 headlines. Outro: brief sign-off from both, invite viewers to subscribe for tomorrow's edition.
11. COLD OPEN: write 3 teasers for the top 3 stories (in story order), each one punchy but factual sentence under 20 words, e.g. "A government shutdown deadline is days away as talks stall in Congress." No clickbait, no questions, no exaggeration.
12. KEY FACTS: every story gets 2-3 "keyFacts" shown on screen: very short (under 50 characters), concrete facts taken from the wire items — numbers, names, places, dates. Example: "Vote: 52-48 in the Senate", "Damage: est. $2 billion", "Where: Maui County, Hawaii".
13. Total spoken length about ${words} words (${cfg.targetMinutes} minutes). Give US lead stories more depth (about 150-200 words); world stories about 90-130 words. Each line under 60 words.

OUTPUT
Return ONLY a JSON object (no markdown fences) with this exact shape:
{
  "episodeTitle": "short episode title",
  "youtubeTitle": "YouTube title under 90 chars, factual, names the top story and includes the date like 'Nov 9'",
  "summary": "2-3 sentence neutral summary of the episode for the YouTube description",
  "tags": ["5-12 short tags"],
  "ticker": ["8-12 short factual headlines under 70 chars each for the scrolling ticker, mostly US, drawn from the wire items"],
  "coldOpen": [ { "story": 1, "text": "teaser for story 1" }, { "story": 2, "text": "teaser for story 2" }, { "story": 3, "text": "teaser for story 3" } ],
  "segments": [
    { "type": "intro", "lines": [ { "speaker": "A", "text": "..." }, { "speaker": "B", "text": "..." } ] },
    { "type": "story", "scope": "us", "headline": "on-screen headline under 50 chars", "countryCode": "US", "usState": "2-letter state code if the story is about one state, else \"\"", "location": "City, State  (or Washington, D.C. / United States)", "sourceIds": ["n3", "n17"], "keyFacts": ["short fact", "short fact"], "lines": [ { "speaker": "B", "text": "..." } ] },
    { "type": "story", "scope": "world", "headline": "...", "countryCode": "ISO 3166-1 alpha-2 code of the main country, or \"\" if global", "usState": "", "location": "City, Country (or Region)", "sourceIds": ["n40", "n52"], "keyFacts": ["short fact", "short fact"], "lines": [ { "speaker": "A", "text": "..." } ] },
    { "type": "outro", "lines": [ { "speaker": "A", "text": "..." }, { "speaker": "B", "text": "..." } ] }
  ]
}

WIRE ITEMS
${feed}
`;
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(t.slice(start, end + 1));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGemini(prompt: string): Promise<string> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const models = (env("GEMINI_MODEL", "gemini-flash-latest,gemini-flash-lite-latest") as string)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  let lastErr = "";
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(240_000),
        });
      } catch (e) {
        // network hiccup (connection reset, timeout) -> retry instead of crashing
        lastErr = `${model} network error: ${(e as any)?.cause?.code ?? (e as Error).message}`;
        log("script", `retrying (${attempt}/3): ${lastErr}`);
        if (attempt < 3) await sleep(attempt * 10000);
        continue;
      }
      if (res.ok) {
        const data: any = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
        if (text) {
          log("script", `Gemini model ${model} responded`);
          return text;
        }
        lastErr = `empty response from ${model}: ${JSON.stringify(data).slice(0, 300)}`;
      } else {
        lastErr = `${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        if (res.status === 404 || res.status === 400) break; // model not available -> next model
      }
      log("script", `retrying (${attempt}/3): ${lastErr.split("\n")[0].slice(0, 160)}`);
      if (attempt < 3) await sleep(attempt * 10000);
    }
  }
  // Every model busy: wait a minute and try the whole list once more (free tier spikes are usually short)
  if (!(globalThis as any).__geminiSecondPass) {
    (globalThis as any).__geminiSecondPass = true;
    log("script", "all Gemini models busy — waiting 60s and trying again");
    await sleep(60000);
    return callGemini(prompt);
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

/** Uses Claude Code in headless mode (`claude -p`). Requires Claude Code installed and logged in. */
async function callClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], {
      shell: process.platform === "win32",
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${err}`))));
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Shorten text at a word boundary. */
function clip(t: unknown, max: number): unknown {
  if (typeof t !== "string" || t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : t.slice(0, max)).replace(/[\s,;:—-]+$/, "");
}

/** Fix cosmetic problems (over-long ticker items, titles, headlines) instead of rejecting a good script. */
function tidy(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  obj.episodeTitle = clip(obj.episodeTitle, 120);
  obj.youtubeTitle = clip(obj.youtubeTitle, 100);
  obj.summary = clip(obj.summary, 600);
  if (Array.isArray(obj.tags)) obj.tags = obj.tags.map((t: unknown) => clip(t, 40)).slice(0, 15);
  if (Array.isArray(obj.coldOpen)) obj.coldOpen = obj.coldOpen.slice(0, 3).map((c: any) => ({ ...c, text: clip(c?.text, 200) }));
  if (Array.isArray(obj.ticker)) obj.ticker = obj.ticker.map((t: unknown) => clip(t, 88)).slice(0, 14);
  if (Array.isArray(obj.segments)) {
    for (const seg of obj.segments) {
      if (!seg || typeof seg !== "object") continue;
      seg.headline = clip(seg.headline, 55);
      seg.location = clip(seg.location, 60);
      if (Array.isArray(seg.keyFacts)) seg.keyFacts = seg.keyFacts.map((f: unknown) => clip(f, 60)).slice(0, 3);
      if (typeof seg.countryCode === "string") seg.countryCode = seg.countryCode.trim().slice(0, 2);
      if (typeof seg.usState === "string") seg.usState = seg.usState.trim().slice(0, 2);
    }
  }
  return obj;
}

/**
 * Last-resort repair of an almost-good script: drop stories that don't have 2 outlets,
 * blank invalid map codes, and accept it if enough stories and length remain.
 */
function salvage(cfg: ChannelConfig, script: Script, items: NewsItem[]): { script: Script; dropped: string[] } | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const dropped: string[] = [];
  const segments = script.segments.filter((s) => {
    if (s.type !== "story") return true;
    const outlets = new Set(s.sourceIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!.outlet));
    if (outlets.size < 2) {
      dropped.push(s.headline);
      return false;
    }
    return true;
  });
  for (const s of segments) {
    if (s.countryCode && !countries.isValid(s.countryCode)) s.countryCode = "";
    if (s.usState && !US_STATES[s.usState]) s.usState = "";
    if (s.scope === "us") s.countryCode = "US";
  }
  // keep US stories before world stories
  const stories = segments.filter((s) => s.type === "story");
  const ordered = [segments[0], ...stories.filter((s) => s.scope === "us"), ...stories.filter((s) => s.scope !== "us"), segments[segments.length - 1]];
  // teaser numbering no longer matches if stories were dropped or reordered
  const fixed: Script = { ...script, segments: ordered, coldOpen: dropped.length ? [] : script.coldOpen };

  const words = ordered.flatMap((s) => s.lines).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const okStructure = ordered[0]?.type === "intro" && ordered[ordered.length - 1]?.type === "outro";
  const okCount = stories.length >= Math.max(4, cfg.storyCount.min - 3);
  const okWords = words >= cfg.targetMinutes * 150 * 0.45;
  if (!okStructure || !okCount || !okWords) return null;
  return { script: fixed, dropped };
}

export async function writeScript(cfg: ChannelConfig, items: NewsItem[], date: string): Promise<Script> {
  const provider = env("SCRIPT_PROVIDER", "gemini");
  const call = provider === "claude" ? callClaudeCli : callGemini;
  let prompt = buildPrompt(cfg, items, date);
  log("script", `provider=${provider}, ${items.length} wire items`);

  let lastProblems: string[] = [];
  const candidates: Script[] = [];
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await call(prompt);
    let problems: string[] = [];
    let script: Script | undefined;
    try {
      const parsed = ScriptSchema.safeParse(tidy(extractJson(raw)));
      if (!parsed.success) {
        problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      } else {
        script = parsed.data;
        script.segments.forEach((s) => {
          s.countryCode = s.countryCode.toUpperCase();
          s.usState = s.usState.toUpperCase();
        });
        problems = checkScript(script, items, {
          minStories: cfg.storyCount.min,
          maxStories: cfg.storyCount.max,
          targetMinutes: cfg.targetMinutes,
          usShare: cfg.focus.usShare,
          minWorldStories: cfg.focus.minWorldStories,
        });
      }
    } catch (e) {
      problems = [`Invalid JSON: ${(e as Error).message}`];
    }

    if (script && problems.length === 0) {
      log("script", `script OK on attempt ${attempt}`);
      return script;
    }
    if (script) candidates.push(script);
    lastProblems = problems;
    log("script", `attempt ${attempt} rejected:\n  - ${problems.join("\n  - ")}`);
    prompt =
      buildPrompt(cfg, items, date) +
      `\n\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix these problems and return the full corrected JSON:\n- ${problems.join("\n- ")}`;
  }
  // No perfect script: repair the best one (most stories) instead of losing the day's episode.
  candidates.sort((a, b) => b.segments.length - a.segments.length);
  for (const c of candidates) {
    const fixed = salvage(cfg, c, items);
    if (fixed) {
      log("script", `accepted repaired script${fixed.dropped.length ? ` (dropped single-source stories: ${fixed.dropped.join("; ")})` : ""}`);
      return fixed.script;
    }
  }
  throw new Error(`Script failed validation after ${MAX_ATTEMPTS} attempts:\n- ${lastProblems.join("\n- ")}`);
}
