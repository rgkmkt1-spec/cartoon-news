export type Speaker = "A" | "B";

export type MouthShape = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

export interface MouthCue {
  start: number; // seconds, absolute in episode
  end: number;
  value: MouthShape;
}

export interface EpisodeLine {
  id: string;
  speaker: Speaker;
  text: string;
  tone?: "joke" | "normal";
  start: number;
  end: number;
  segmentIndex: number;
  cues: MouthCue[];
}

export interface EpisodeSegment {
  type: "cold" | "intro" | "story" | "outro";
  scope: "us" | "world";
  usState: string; // 2-letter postal code for US stories about one state, else ""
  headline: string;
  countryCode: string; // ISO alpha-2 upper case, "" = global
  flagCode: string; // same as countryCode if a flag image exists, else ""
  location: string;
  keyFacts: string[];
  kicker?: boolean;
  storyNumber: number; // 1-based among stories (cold open: the story it teases), else 0
  start: number;
  end: number;
}

export interface EpisodeProps {
  channelName: string;
  tagline: string;
  dateLabel: string; // "Monday, November 9, 2026"
  shortDate: string; // "NOV 9"
  anchors: Record<Speaker, { name: string }>;
  audioFile: string; // relative to public/
  durationSec: number;
  leadIn: number;
  stingStart: number; // logo sting window (seconds)
  stingEnd: number;
  storyCount: number;
  segments: EpisodeSegment[];
  lines: EpisodeLine[];
  ticker: string[];
  studio?: StudioMeta;
}

export interface StudioAnchor {
  body: string;
  head: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pivot: [number, number];
  mouth: { x: number; y: number; w: number; h: number; slight: string; mid: string; wide: string; laugh?: string };
  blink: { src: string; x: number; y: number; w: number; h: number };
  talkHead?: string;
  laughHead?: string;
  lower?: { x: number; y: number; w: number; h: number; ah: string; closed: string };
  /** AI lip sync: reference face + where the redrawn mouth patch sits */
  lip?: { ref: string; box: number[]; patch: number[]; size: [number, number]; x: number; y: number; w: number; h: number };
  /** set per episode when the AI lip-sync frames were made: sprite sheets + frame index */
  lipAtlas?: { dir: string; cols: number; rows: number; pad: number; size: [number, number]; runs: number[][] };
}

/** A real studio built from the user's own artwork (background plate + image anchors). */
export interface StudioMeta {
  plate: string;
  screen: { x: number; y: number; w: number; h: number };
  anchors: Record<Speaker, StudioAnchor>;
  close: Record<Speaker, { fx: number; fy: number; cx: number; cy: number; s: number }>;
}

export const FPS = 30;
