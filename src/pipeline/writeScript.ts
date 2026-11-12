import { spawn } from "node:child_process";
import { ChannelConfig, env, log, prettyDate } from "../config";
import type { NewsItem } from "./fetchNews";
import { checkScript, Script, ScriptSchema, softFix } from "./schema";
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

  const Af = A.split(" ")[0];
  const Bf = B.split(" ")[0];
  return `You are the head writer for "${cfg.channelName}", a fast, fun, upbeat daily animated news show focused on the UNITED STATES, with a quick roundup of the biggest stories from around the world. Think: a sharp morning show with real news delivered by two anchors who have great chemistry. The goal is a show people WANT to watch every day and subscribe to.
Anchor A is ${A} (male): dry, deadpan wit, the "straight man" who lands understated one-liners.
Anchor B is ${B} (female): quick, playful, sharp; teases ${Af} and gets the bigger laughs.
Today is ${prettyDate(date)}.

TASK
Pick ${cfg.storyCount.min}-${cfg.storyCount.max} stories from the wire items below and write the script:
- About ${usCount} UNITED STATES stories (scope "us"): politics and government, courts, economy and jobs, weather, public safety, health, science and tech, big business news, notable state stories.
- Then at least ${cfg.focus.minWorldStories} important WORLD stories (scope "world"), with a fun transition into the world roundup.
- Order: US stories (most important first), then world stories, then ONE "kicker" story LAST: a light, quirky or feel-good story (an animal, an odd record, a funny local story) introduced with "And finally..." Mark it with "kicker": true. Use 1+ source ids for the kicker.

FACTS (strict, never broken)
1. Only state facts that appear in the wire items. Never invent names, numbers, quotes, places or details, not even for a joke.
2. Every story except the kicker MUST be covered by at least 2 different outlets in the list. Many items are single-source: skip those. List the item ids in "sourceIds".
3. Attribute claims ("officials said", "according to NPR"). If figures differ, use the more cautious wording.

TONE AND HUMOR
4. Deliver the facts clearly FIRST, then add personality: a wry one-liner, a playful reaction, light teasing between the anchors. Aim for 1-2 light moments per story where appropriate, plus the kicker.
5. Humor must be clever and good-natured: wordplay, irony, relatable everyday observations, gentle teasing between ${Af} and ${Bf}. Nothing mean-spirited, crude or sexual, and no profanity.
6. SERIOUS STORIES GET NO JOKES: deaths, injuries, violence, shootings, war, terrorism, disasters with victims, serious illness, abuse, or anything tragic. Report those straight, warm and respectful, then lighten up only at the NEXT story's transition.
7. POLITICS: report evenly and neutrally. Never mock a party, its voters, or anyone's identity, religion, race, gender or appearance. Light jokes about politics are fine only if they poke at the situation itself (gridlock, bureaucracy, long speeches, deadlines) and treat both sides alike.
8. Never present a joke as fact. Jokes are clearly reactions or commentary.
9. For any line that is a joke, quip or playful tease, add "tone": "joke" so the other anchor visibly laughs. Use it on 6-12 lines per episode.

PACING
10. Upbeat and quick: short punchy sentences, active verbs, no filler. Each line under 45 words. Mix in very short reaction lines ("Only in Florida." / "I have questions.") between longer ones.
11. Hand-offs between stories are snappy and often include a quick quip.
12. Write for the EAR: say "percent" not "%", spell out abbreviations on first use, no URLs, no parentheses, no emoji, no stage directions.

STRUCTURE
13. COLD OPEN: 3 teasers for the top 3 stories (in story order), each 8-14 words, punchy and witty but factual. No clickbait questions.
14. INTRO: EXACTLY 2 very short, upbeat lines, no headline preview. ${Af}: "Good morning! I'm ${A}, and this is ${cfg.channelName} for <weekday, month day>." ${Bf}: a quick playful line plus "Let's get into it."
15. KEY FACTS: every story gets 2-3 "keyFacts" for the screen: under 50 characters, concrete facts from the wire items (numbers, names, places, dates). Example: "Vote: 52-48 in the Senate".
16. OUTRO: fun sign-off with a bit of banter. Clearly ask viewers to subscribe and comment, and say there's a new episode every morning.
17. WRITE FOR THE EAR: lines are read aloud by a voice that pauses at every comma. Use commas only where a newscaster would really take a breath. Prefer short sentences over comma chains, no comma after short openers ("So", "Now", "Meanwhile"), no Oxford commas, and write numbers without thousands separators.
18. Total spoken length about ${words} words (${cfg.targetMinutes} minutes).

OUTPUT
Return ONLY a JSON object (no markdown fences) with this exact shape:
{
  "episodeTitle": "short episode title",
  "youtubeTitle": "SEO YouTube title, 55-70 chars: lead with the biggest searchable keyword (the top story's main name/place/topic people would type into search), then a second story, then the date like 'Nov 9'. Accurate, no ALL CAPS words, no fake urgency. Example: 'Senate Passes Funding Bill, Tokyo Quake Update & More | Nov 9'",
  "summary": "2-3 sentence YouTube description opener. The first sentence must work as the search snippet: name the top 2-3 stories with their key names and places. Natural, no keyword stuffing.",
  "tags": ["15-20 search tags: the specific people, places, organizations and topics from today's stories (e.g. 'senate funding bill', 'tokyo earthquake'), plus a few broader ones like 'news today'. Lowercase, each under 30 chars"],
  "hashtags": ["3 hashtags without spaces, most searchable first, e.g. '#news', '#senate', '#tokyo'"],
  "ticker": ["8-12 short factual headlines under 70 chars for the scrolling ticker, mostly US, from the wire items"],
  "coldOpen": [ { "story": 1, "text": "teaser for story 1" }, { "story": 2, "text": "teaser for story 2" }, { "story": 3, "text": "teaser for story 3" } ],
  "segments": [
    { "type": "intro", "lines": [ { "speaker": "A", "text": "..." }, { "speaker": "B", "text": "...", "tone": "joke" } ] },
    { "type": "story", "scope": "us", "headline": "on-screen headline under 50 chars", "countryCode": "US", "usState": "2-letter state code if about one state, else \\"\\"", "location": "City, State (or Washington, D.C. / United States)", "sourceIds": ["n3", "n17"], "keyFacts": ["short fact", "short fact"], "lines": [ { "speaker": "B", "text": "..." }, { "speaker": "A", "text": "...", "tone": "joke" } ] },
    { "type": "story", "scope": "world", "headline": "...", "countryCode": "ISO alpha-2 code or \\"\\" if global", "usState": "", "location": "City, Country", "sourceIds": ["n40", "n52"], "keyFacts": ["short fact", "short fact"], "lines": [ { "speaker": "A", "text": "..." } ] },
    { "type": "story", "kicker": true, "scope": "us", "headline": "...", "countryCode": "US", "usState": "", "location": "...", "sourceIds": ["n77"], "keyFacts": ["short fact", "short fact"], "lines": [ { "speaker": "B", "text": "And finally..." } ] },
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

async function callGemini(prompt: string, secondPass = false): Promise<string> {
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
  if (!secondPass) {
    log("script", "all Gemini models busy — waiting 90s and trying again");
    await sleep(90000);
    return callGemini(prompt, true);
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
  if (Array.isArray(obj.tags)) obj.tags = obj.tags.map((t: unknown) => clip(t, 40)).slice(0, 25);
  if (Array.isArray(obj.hashtags)) obj.hashtags = obj.hashtags.map((t: unknown) => String(t).replace(/[^#\w]/g, "")).filter((t: string) => t.length > 1).map((t: string) => (t.startsWith("#") ? t : `#${t}`)).slice(0, 5);
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
    if (outlets.size < (s.kicker ? 1 : 2)) {
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
  const main = stories.filter((s) => !s.kicker);
  const ordered = [
    segments[0],
    ...main.filter((s) => s.scope === "us"),
    ...main.filter((s) => s.scope !== "us"),
    ...stories.filter((s) => s.kicker).slice(0, 1),
    segments[segments.length - 1],
  ];
  // teaser numbering no longer matches if stories were dropped or reordered
  const fixed: Script = { ...script, segments: ordered, coldOpen: dropped.length ? [] : script.coldOpen };
  softFix(fixed);

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
    let raw: string;
    try {
      raw = await call(prompt);
    } catch (e) {
      lastProblems = [(e as Error).message.split("\n")[0].slice(0, 200)];
      log("script", `AI service failed on attempt ${attempt}: ${lastProblems[0]}`);
      if (candidates.length) break; // repair the best script we already have
      continue;
    }
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

    if (script) {
      const notes = softFix(script);
      if (notes.length) log("script", `auto-fixed: ${notes.join("; ")}`);
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
