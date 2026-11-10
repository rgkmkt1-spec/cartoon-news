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
}

export const FPS = 30;
