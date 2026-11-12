import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";

export const COLORS = {
  navy: "#0B1F3A",
  navy2: "#132F57",
  red: "#D62F3A",
  gold: "#F2B33D",
  white: "#FFFFFF",
  ink: "#0E1A2B",
  sky: "#5BA7FF",
};

export const FONT_HEAD = "Oswald, 'Arial Narrow', sans-serif";
export const FONT_BODY = "Inter, Arial, sans-serif";

const LAND = feature(land110 as any, (land110 as any).objects.land) as any;

/** Spinning cartoon globe used in the logo. */
export const Globe: React.FC<{ size: number; rotate: number }> = ({ size, rotate }) => {
  const proj = geoOrthographic()
    .scale(size / 2 - 4)
    .translate([size / 2, size / 2])
    .rotate([rotate, -15]);
  const path = geoPath(proj);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="globe-ocean" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#3D8BFF" />
          <stop offset="100%" stopColor="#0B3A85" />
        </radialGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="url(#globe-ocean)" stroke="#BFE0FF" strokeWidth={3} />
      <path d={path(geoGraticule10()) ?? ""} stroke="#9CC9FF" strokeOpacity={0.35} strokeWidth={1} fill="none" />
      <path d={path(LAND) ?? ""} fill="#7FD49B" stroke="#2E7D4F" strokeWidth={1} />
      <ellipse cx={size * 0.36} cy={size * 0.3} rx={size * 0.16} ry={size * 0.09} fill="#FFFFFF" opacity={0.18} />
    </svg>
  );
};

export const Flag: React.FC<{ code: string; height: number }> = ({ code, height }) => {
  if (!code) return null;
  return (
    <Img maxRetries={8}
      src={staticFile(`flags/${code.toLowerCase()}.svg`)}
      style={{ height, width: (height * 4) / 3, borderRadius: 6, boxShadow: "0 4px 14px rgba(0,0,0,0.45)", border: "3px solid white" }}
    />
  );
};

export const Logo: React.FC<{ name: string; frame: number; scale?: number }> = ({ name, frame, scale = 1 }) => {
  const words = name.toUpperCase().split(" ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 * scale }}>
      <Globe size={96 * scale} rotate={frame * 0.8} />
      <div style={{ fontFamily: FONT_HEAD, color: COLORS.white, lineHeight: 0.95 }}>
        <div style={{ fontSize: 58 * scale, fontWeight: 700, letterSpacing: 2 * scale }}>{words[0]}</div>
        {words.length > 1 && <div style={{ fontSize: 30 * scale, fontWeight: 500, letterSpacing: 8 * scale, color: COLORS.gold }}>{words.slice(1).join(" ")}</div>}
      </div>
    </div>
  );
};

export const LowerThird: React.FC<{ label: string; title: string; age: number; fps: number }> = ({ label, title, age, fps }) => {
  const slide = interpolate(age, [0, 0.4 * fps], [-1300, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });
  const labelIn = interpolate(age, [0.25 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 110, bottom: 112, transform: `translateX(${slide}px)` }}>
      <div
        style={{
          display: "inline-block",
          background: COLORS.red,
          color: "white",
          fontFamily: FONT_HEAD,
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: 3,
          padding: "4px 18px",
          opacity: labelIn,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          background: "linear-gradient(180deg,#FFFFFF,#E9EEF5)",
          color: COLORS.ink,
          fontFamily: FONT_HEAD,
          fontWeight: 700,
          fontSize: 56,
          padding: "6px 30px 10px 24px",
          borderLeft: `12px solid ${COLORS.red}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          maxWidth: 1250,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
    </div>
  );
};

export const NameStrap: React.FC<{ name: string; channel: string; age: number; fps: number; right?: boolean }> = ({ name, channel, age, fps, right }) => {
  const k = interpolate(age, [0, 0.35 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 112,
        ...(right ? { right: 110 } : { left: 110 }),
        opacity: k,
        transform: `translateY(${(1 - k) * 30}px)`,
        textAlign: right ? "right" : "left",
      }}
    >
      <div style={{ background: COLORS.navy, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 46, padding: "4px 24px", borderBottom: `6px solid ${COLORS.gold}` }}>
        {name.toUpperCase()}
      </div>
      <div style={{ display: "inline-block", background: "white", color: COLORS.ink, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 22, padding: "4px 24px", letterSpacing: 1 }}>
        {channel.toUpperCase()}
      </div>
    </div>
  );
};

export const Ticker: React.FC<{ items: string[]; frame: number; label: string; date: string }> = ({ items, frame, label, date }) => {
  const text = items.map((s) => s.toUpperCase()).join("   •   ") + "   •   ";
  // Repeat until one copy is wider than the screen, then scroll two identical copies and
  // wrap at exactly 50% of their combined width -> seamless loop, no font measuring needed
  // (measuring can differ between render tabs and caused jumps).
  const unit = text.repeat(Math.max(1, Math.ceil(160 / text.length)));
  const approxWidth = unit.length * 17;
  const pct = (((frame * 3) / approxWidth) * 50) % 50;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, display: "flex", isolation: "isolate", background: COLORS.navy, borderTop: `4px solid ${COLORS.gold}` }}>
      <div style={{ zIndex: 2, background: COLORS.red, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 30, letterSpacing: 2, padding: "0 26px", display: "flex", alignItems: "center", gap: 14 }}>
        {label.toUpperCase()}
        <span style={{ fontFamily: FONT_BODY, fontSize: 20, fontWeight: 700, background: "rgba(0,0,0,0.25)", padding: "2px 10px", borderRadius: 4 }}>{date}</span>
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 14, left: 0, transform: `translateX(-${pct}%)`, whiteSpace: "nowrap", color: "white", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 28 }}>
          {unit}
          {unit}
        </div>
      </div>
    </div>
  );
};
