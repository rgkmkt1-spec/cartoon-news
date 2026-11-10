import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { UsMap, WorldMap } from "./WorldMap";
import { COLORS, FONT_BODY, FONT_HEAD, Flag, Globe } from "./Graphics";
import type { EpisodeProps, EpisodeSegment } from "./types";

const out3 = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const MapFor: React.FC<{ seg: EpisodeSegment; w: number; h: number; progress: number; frame: number }> = ({ seg, w, h, progress, frame }) =>
  seg.scope === "us" || seg.countryCode === "US" ? (
    <UsMap width={w} height={h} state={seg.usState} progress={progress} pulse={frame} />
  ) : (
    <WorldMap width={w} height={h} countryCode={seg.countryCode} progress={progress} pulse={frame} />
  );

/** Fast-paced opening: "TOP STORIES" title, then one full-screen card per teaser. */
export const ColdOpen: React.FC<{ props: EpisodeProps; t: number; frame: number; fps: number }> = ({ props, t, frame, fps }) => {
  const colds = props.segments.filter((s) => s.type === "cold");
  if (!colds.length) return null;
  const idx = colds.reduce((acc, s, i) => (t >= s.start ? i : acc), -1);

  if (idx === -1) {
    // title card before the first teaser
    const k = interpolate(t, [0, 0.18], [0, 1], clamp);
    const shake = Math.max(0, 1 - (t - 0.18) / 0.25) * (t > 0.18 ? 1 : 0);
    return (
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 50%, #1B4F9C 0%, #0B1F3A 65%, #050D1C 100%)", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 170, color: "white", letterSpacing: 8, transform: `translate(${Math.sin(frame * 2.3) * 14 * shake}px, ${Math.cos(frame * 3.1) * 10 * shake}px) scale(${1.6 - 0.6 * out3(k)})`, opacity: k }}>
          TOP STORIES
        </div>
        <div style={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: 40, color: COLORS.gold, opacity: k }}>{props.dateLabel}</div>
      </AbsoluteFill>
    );
  }

  const seg = colds[idx];
  const age = t - seg.start;
  const slide = out3(interpolate(age, [0.05, 0.3], [0, 1], clamp));
  const flash = interpolate(age, [0, 0.15], [0.9, 0], clamp);
  const shake = interpolate(age, [0.3, 0.6], [1, 0], clamp) * (age > 0.3 ? 1 : 0);
  const sx = Math.sin(frame * 2.7) * 12 * shake;
  const sy = Math.cos(frame * 3.3) * 8 * shake;
  const sweep = interpolate(age, [0, 0.32], [-900, 2400], clamp);
  return (
    <AbsoluteFill style={{ background: "#000", transform: `translate(${sx}px, ${sy}px)` }}>
      <AbsoluteFill style={{ transform: `scale(${1.04 + age * 0.015})` }}>
        <MapFor seg={seg} w={1920} h={1080} progress={age / 1.3} frame={frame} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(5,13,28,0.92) 0%, rgba(5,13,28,0.65) 45%, rgba(5,13,28,0.05) 75%)" }} />
      <div style={{ position: "absolute", left: 110, top: 90, display: "flex", alignItems: "center", gap: 0 }}>
        <div style={{ background: COLORS.red, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 40, letterSpacing: 4, padding: "6px 22px" }}>TOP STORIES</div>
        <div style={{ background: "white", color: COLORS.ink, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 40, padding: "6px 20px" }}>
          {idx + 1} / {colds.length}
        </div>
      </div>
      <div style={{ position: "absolute", left: 110, top: 360, width: 1100, transform: `translateX(${(1 - slide) * -260}px) scale(${1.12 - 0.12 * slide})`, transformOrigin: "left center", opacity: slide }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
          {seg.flagCode ? <Flag code={seg.flagCode} height={54} /> : <Globe size={60} rotate={frame} />}
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 38, color: COLORS.gold, letterSpacing: 3 }}>{(seg.location || "World").toUpperCase()}</div>
        </div>
        <div style={{ borderLeft: `14px solid ${COLORS.red}`, paddingLeft: 30, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 104, lineHeight: 1.02, color: "white", textShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
          {seg.headline.toUpperCase()}
        </div>
      </div>
      <div style={{ position: "absolute", top: -200, left: sweep, width: 260, height: 1500, background: COLORS.red, transform: "skewX(-18deg)", opacity: 0.9 }} />
      <AbsoluteFill style={{ background: "white", opacity: flash }} />
    </AbsoluteFill>
  );
};

/** "KEY FACTS" panel: cards slide in one by one while the story is read. */
export const KeyFacts: React.FC<{ seg: EpisodeSegment; t: number; side: "left" | "right" }> = ({ seg, t, side }) => {
  const facts = seg.keyFacts ?? [];
  if (!facts.length) return null;
  const dur = seg.end - seg.start;
  const first = seg.start + Math.min(3.6, dur * 0.25);
  const step = Math.min(3.2, (dur * 0.55) / facts.length);
  const fadeOut = interpolate(t, [seg.end - 0.9, seg.end - 0.4], [1, 0], clamp);
  const headerIn = interpolate(t, [first - 0.4, first], [0, 1], clamp);
  if (headerIn <= 0) return null;
  return (
    <div style={{ position: "absolute", top: 210, width: 640, ...(side === "right" ? { right: 70 } : { left: 70 }), opacity: fadeOut }}>
      <div style={{ display: "inline-block", background: COLORS.gold, color: COLORS.ink, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 30, letterSpacing: 4, padding: "4px 18px", opacity: headerIn }}>
        KEY FACTS
      </div>
      {facts.map((f, i) => {
        const k = out3(interpolate(t, [first + i * step, first + i * step + 0.45], [0, 1], clamp));
        if (k <= 0) return null;
        return (
          <div
            key={i}
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "rgba(7,20,41,0.97)",
              borderLeft: `8px solid ${COLORS.red}`,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "16px 22px",
              transform: `translateX(${(1 - k) * (side === "right" ? 120 : -120)}px)`,
              opacity: k,
            }}
          >
            <div style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: 20, background: COLORS.red, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {i + 1}
            </div>
            <div style={{ color: "white", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 34, lineHeight: 1.2 }}>{f}</div>
          </div>
        );
      })}
    </div>
  );
};
