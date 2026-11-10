import { z } from "zod";
import countries from "i18n-iso-countries";
import type { NewsItem } from "./fetchNews";
import { US_STATES } from "../../remotion/usStates";

export const LineSchema = z.object({
  speaker: z.enum(["A", "B"]),
  text: z.string().min(2).max(600),
  tone: z.enum(["joke", "normal"]).optional().default("normal"),
});

export const SegmentSchema = z.object({
  type: z.enum(["intro", "story", "outro"]),
  scope: z.enum(["us", "world"]).optional().default("world"),
  kicker: z.boolean().optional().default(false),
  usState: z.string().max(2).optional().default(""),
  headline: z.string().max(70).optional().default(""),
  countryCode: z.string().max(2).optional().default(""),
  location: z.string().max(60).optional().default(""),
  sourceIds: z.array(z.string()).optional().default([]),
  keyFacts: z.array(z.string().max(80)).max(4).optional().default([]),
  lines: z.array(LineSchema).min(1),
});

export const ScriptSchema = z.object({
  episodeTitle: z.string().min(3).max(120),
  youtubeTitle: z.string().min(3).max(100),
  summary: z.string().min(10).max(600),
  tags: z.array(z.string().max(40)).max(15).default([]),
  ticker: z.array(z.string().max(90)).min(3).max(14),
  segments: z.array(SegmentSchema).min(3),
  coldOpen: z
    .array(z.object({ story: z.number().int().min(1), text: z.string().min(3).max(220) }))
    .max(4)
    .optional()
    .default([]),
});

export type Line = z.infer<typeof LineSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Script = z.infer<typeof ScriptSchema>;

/** Extra editorial checks the model must pass. Returns a list of problems (empty = OK). */
export function checkScript(
  script: Script,
  items: NewsItem[],
  opts: { minStories: number; maxStories: number; targetMinutes: number; usShare: number; minWorldStories: number },
): string[] {
  const problems: string[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const segs = script.segments;

  if (segs[0]?.type !== "intro") problems.push("First segment must be type 'intro'.");
  if (segs[segs.length - 1]?.type !== "outro") problems.push("Last segment must be type 'outro'.");

  const stories = segs.filter((s) => s.type === "story");
  if (stories.length < opts.minStories || stories.length > opts.maxStories) {
    problems.push(`Need ${opts.minStories}-${opts.maxStories} stories, got ${stories.length}.`);
  }

  const main = stories.filter((s) => !s.kicker);
  const kickers = stories.filter((s) => s.kicker);
  if (kickers.length > 1) problems.push("Only one kicker story allowed.");
  if (kickers.length === 1 && !stories[stories.length - 1].kicker) problems.push("The kicker story must be the last story.");
  const us = main.filter((s) => s.scope === "us").length;
  const world = main.length - us;
  const minUs = Math.floor(main.length * opts.usShare) - 1;
  if (us < minUs) problems.push(`Need at least ${minUs} US stories (scope "us"), got ${us}.`);
  if (world < opts.minWorldStories) problems.push(`Need at least ${opts.minWorldStories} world stories (scope "world"), got ${world}.`);
  const firstWorld = main.findIndex((s) => s.scope === "world");
  if (firstWorld !== -1 && main.slice(firstWorld).some((s) => s.scope === "us")) {
    problems.push("Order stories with all US stories first, then all world stories.");
  }

  stories.forEach((s, i) => {
    const label = `Story ${i + 1} ("${s.headline}")`;
    if (s.scope === "us" && s.countryCode !== "US") problems.push(`${label}: US stories must have countryCode "US".`);
    if (s.usState && !US_STATES[s.usState.toUpperCase()]) problems.push(`${label}: usState "${s.usState}" is not a valid 2-letter US state code.`);
    if (!s.headline) problems.push(`${label}: missing headline.`);
    if (s.headline.length > 55) problems.push(`${label}: headline over 55 characters.`);
    const missing = s.sourceIds.filter((id) => !byId.has(id));
    if (missing.length) problems.push(`${label}: unknown sourceIds ${missing.join(", ")}.`);
    const outlets = new Set(s.sourceIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!.outlet));
    if (outlets.size < (s.kicker ? 1 : 2)) problems.push(`${label}: must cite items from at least ${s.kicker ? 1 : 2} different outlets.`);
    if (s.countryCode && !countries.isValid(s.countryCode.toUpperCase())) {
      problems.push(`${label}: countryCode "${s.countryCode}" is not a valid ISO alpha-2 code.`);
    }
  });

  const words = segs.flatMap((s) => s.lines).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const minWords = Math.round(opts.targetMinutes * 150 * 0.7);
  const maxWords = Math.round(opts.targetMinutes * 150 * 1.3);
  if (words < minWords) problems.push(`Script too short: ${words} words (need at least ${minWords}).`);
  if (words > maxWords) problems.push(`Script too long: ${words} words (max ${maxWords}).`);

  segs.forEach((s) =>
    s.lines.forEach((l) => {
      if (l.text.split(/\s+/).length > 75) problems.push(`A line is over 75 words — split it: "${l.text.slice(0, 50)}..."`);
    }),
  );

  const speakers = new Set(segs.flatMap((s) => s.lines.map((l) => l.speaker)));
  if (speakers.size < 2) problems.push("Both anchors (A and B) must speak.");

  return problems;
}

/** Nice-to-haves: logged and auto-fixed, never a reason to reject a script. */
export function softFix(script: Script): string[] {
  const notes: string[] = [];
  const stories = script.segments.filter((s) => s.type === "story");
  script.coldOpen = (script.coldOpen ?? []).filter((c) => c.story >= 1 && c.story <= stories.length);
  script.coldOpen.forEach((c) => {
    const words = c.text.split(/\s+/);
    if (words.length > 18) {
      c.text = stories[c.story - 1].headline.replace(/[.!?]*$/, ".");
      notes.push(`teaser ${c.story} too long — using its headline`);
    }
  });
  if (script.coldOpen.length < 3) {
    const have = new Set(script.coldOpen.map((c) => c.story));
    for (let i = 1; i <= Math.min(3, stories.length) && script.coldOpen.length < 3; i++) {
      if (!have.has(i)) script.coldOpen.push({ story: i, text: stories[i - 1].headline.replace(/[.!?]*$/, ".") });
    }
    script.coldOpen.sort((x, y) => x.story - y.story);
    notes.push("cold open filled in from headlines");
  }
  const missing = stories.filter((s) => (s.keyFacts ?? []).length === 0).length;
  if (missing) notes.push(`${missing} stories without key facts (panel skipped)`);
  return notes;
}
