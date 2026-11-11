import type { EpisodeLine, EpisodeProps, MouthShape, Speaker } from "./types";

export function lineAt(p: EpisodeProps, t: number): EpisodeLine | undefined {
  // binary search over sorted lines
  let lo = 0;
  let hi = p.lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const l = p.lines[mid];
    if (t < l.start) hi = mid - 1;
    else if (t > l.end) lo = mid + 1;
    else return l;
  }
  return undefined;
}

/** Most recent line that started at or before t (used for shots during pauses). */
export function lastLineBefore(p: EpisodeProps, t: number): EpisodeLine | undefined {
  let found: EpisodeLine | undefined;
  for (const l of p.lines) {
    if (l.start <= t) found = l;
    else break;
  }
  return found;
}

export function mouthFor(p: EpisodeProps, speaker: Speaker, t: number): MouthShape {
  const l = lineAt(p, t);
  if (!l || l.speaker !== speaker) return "X";
  for (const c of l.cues) if (t >= c.start && t < c.end) return c.value;
  return "X";
}

export function segmentAt(p: EpisodeProps, t: number) {
  const l = lastLineBefore(p, t);
  const idx = l ? l.segmentIndex : 0;
  return { index: idx, seg: p.segments[idx] };
}

export type Shot =
  | { kind: "wide" }
  | { kind: "close"; speaker: Speaker }
  | { kind: "map" }
  | { kind: "cold" };

/**
 * Directing rules (all deterministic):
 * - intro / outro lines -> wide two-shot
 * - first line of each story -> wide (the handoff), then cut to the reader's close-up after ~3 s
 * - story lines -> close-up on speaker; long lines (> 9 s) cut to the full-screen map for their middle third
 */
export function shotAt(p: EpisodeProps, t: number): { shot: Shot; shotStart: number } {
  const l = lastLineBefore(p, t);
  if (!l) return { shot: { kind: "wide" }, shotStart: 0 };
  const seg = p.segments[l.segmentIndex];
  if (seg.type === "cold") return { shot: { kind: "cold" }, shotStart: seg.start };
  if (seg.type !== "story") return { shot: { kind: "wide" }, shotStart: l.start };

  const firstInSeg = p.lines.find((x) => x.segmentIndex === l.segmentIndex)!;
  if (l.id === firstInSeg.id) {
    const cut = l.start + Math.min(3, (l.end - l.start) * 0.5);
    if (t < cut) return { shot: { kind: "wide" }, shotStart: seg.start };
    return { shot: { kind: "close", speaker: l.speaker }, shotStart: cut };
  }
  const dur = l.end - l.start;
  if (dur > 9) {
    const a = l.start + dur / 3;
    const b = l.start + (2 * dur) / 3;
    if (t >= a && t < b) return { shot: { kind: "map" }, shotStart: a };
    if (t >= b) return { shot: { kind: "close", speaker: l.speaker }, shotStart: b };
  }
  return { shot: { kind: "close", speaker: l.speaker }, shotStart: l.start };
}

/** First time each anchor speaks (for name straps). */
export function firstLineOf(p: EpisodeProps, s: Speaker) {
  return p.lines.find((l) => l.speaker === s);
}

/** How open each Rhubarb shape is (0 = closed .. 1 = wide). */
const OPEN: Record<MouthShape, number> = { X: 0, A: 0, B: 0.3, F: 0.25, G: 0.3, C: 0.65, E: 0.55, H: 0.55, D: 1 };

function cueAt(p: EpisodeProps, s: Speaker, t: number): { open: number; closed: number } {
  const l = lineAt(p, t);
  if (!l || l.speaker !== s) return { open: 0, closed: 0 };
  for (const c of l.cues) if (t >= c.start && t < c.end) return { open: OPEN[c.value] ?? 0, closed: c.value === "A" ? 1 : 0 };
  return { open: 0, closed: 0 };
}

const TAPS: [number, number][] = [[1, 0.25], [0, 0.5], [-1, 0.25]];

/** Smoothed jaw openness (0..1) — light smoothing so it stays snappy. */
export function mouthOpenness(p: EpisodeProps, s: Speaker, t: number, fps = 30): number {
  let v = 0;
  for (const [k, w] of TAPS) v += w * cueAt(p, s, t + k / fps).open;
  return v;
}

/** Smoothed "lips pressed" amount for M/B/P sounds. */
export function lipsClosed(p: EpisodeProps, s: Speaker, t: number, fps = 30): number {
  let v = 0;
  for (const [k, w] of TAPS) v += w * cueAt(p, s, t + k / fps).closed;
  return v;
}

/** 0..1: fades the "talking face" in just before a line and out just after it. */
export function talkAmount(p: EpisodeProps, s: Speaker, t: number): number {
  let best = 0;
  for (const l of p.lines) {
    if (l.speaker !== s) continue;
    if (l.start - 0.3 > t) break;
    const a = Math.min(1, Math.max(0, (t - (l.start - 0.15)) / 0.12));
    const b = Math.min(1, Math.max(0, (l.end + 0.2 - t) / 0.15));
    best = Math.max(best, Math.min(a, b));
  }
  return best;
}

/** Seconds since this speaker's current line started, or -1 when they aren't talking. */
export function lineBeat(p: EpisodeProps, s: Speaker, t: number): number {
  const l = lineAt(p, t);
  return l && l.speaker === s ? t - l.start : -1;
}
