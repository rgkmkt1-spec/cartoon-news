import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Anchor } from "./Anchor";
import { UsMap, WorldMap } from "./WorldMap";
import { COLORS, FONT_BODY, FONT_HEAD, Flag, Globe, Logo, LowerThird, NameStrap, Ticker } from "./Graphics";
import { firstLineOf, lineAt, mouthFor, segmentAt, shotAt } from "./timeline";
import { ColdOpen, KeyFacts } from "./Segments";
import type { EpisodeProps, EpisodeSegment, Speaker } from "./types";

// ---- stage geometry (1920x1080) ----
const ANCHOR_W = 500;
const ANCHOR_H = 650;
const ANCHOR_TOP = 262;
const POS: Record<Speaker, number> = { A: 470, B: 1450 }; // center x
const SCREEN = { x: 680, y: 120, w: 560, h: 315 };
const DESK_Y = 790;

function cameraFor(kind: "wide" | "close", speaker: Speaker | undefined, push: number) {
  if (kind === "wide") {
    const s = 1 + push * 0.025;
    return { s, tx: 960 - 960 * s, ty: 540 - 540 * s };
  }
  const s = 1.5 + push * 0.05;
  const f = { x: POS[speaker!], y: 520 };
  const c = { x: speaker === "A" ? 690 : 1230, y: 560 };
  return { s, tx: c.x - f.x * s, ty: c.y - f.y * s };
}

const StudioBackground: React.FC<{ frame: number }> = ({ frame }) => (
  <>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #1D4A86 0%, #0E2547 55%, #071429 100%)" }} />
    {/* back wall panels */}
    <svg width={1920} height={1080} style={{ position: "absolute" }}>
      {Array.from({ length: 13 }).map((_, i) => (
        <rect key={i} x={i * 150 - 15} y={60} width={6} height={680} fill="#5BA7FF" opacity={0.08 + 0.05 * Math.sin(frame / 30 + i)} />
      ))}
      <path d="M 0 610 Q 960 560 1920 610 L 1920 720 L 0 720 Z" fill="#0A1C38" />
      <path d="M 0 612 Q 960 562 1920 612" stroke="#5BA7FF" strokeOpacity={0.6} strokeWidth={3} fill="none" />
      {/* side city silhouettes */}
      {[[0, 1], [1920, -1]].map(([x0, dir], k) => (
        <g key={k} opacity={0.35}>
          {Array.from({ length: 7 }).map((_, i) => {
            const w = 46;
            const h = 120 + ((i * 53) % 160);
            const x = (x0 as number) + (dir as number) * (i * 52) - (dir === -1 ? w : 0);
            return <rect key={i} x={x} y={600 - h} width={w} height={h} fill="#1E4C8C" />;
          })}
        </g>
      ))}
    </svg>
    {/* screen frame */}
    <div
      style={{
        position: "absolute",
        left: SCREEN.x - 14,
        top: SCREEN.y - 14,
        width: SCREEN.w + 28,
        height: SCREEN.h + 28,
        borderRadius: 18,
        background: "linear-gradient(180deg,#2C3E5C,#141F33)",
        boxShadow: "0 0 60px rgba(91,167,255,0.35)",
      }}
    />
  </>
);

const ScreenContent: React.FC<{ seg: EpisodeSegment; t: number; frame: number; props: EpisodeProps; full?: boolean }> = ({ seg, t, frame, props, full }) => {
  const w = full ? 1920 : SCREEN.w;
  const h = full ? 1080 : SCREEN.h;
  const k = full ? 1920 / SCREEN.w : 1;
  const tk = full ? 1.7 : 1; // text/flag scale (keep labels readable, not huge)
  if (seg.type !== "story") {
    return (
      <AbsoluteFill style={{ background: "linear-gradient(135deg,#0E3570,#071a3a)", alignItems: "center", justifyContent: "center" }}>
        <Logo name={props.channelName} frame={frame} scale={0.85 * k} />
      </AbsoluteFill>
    );
  }
  const progress = (t - seg.start) / 2.6;
  return (
    <AbsoluteFill>
      {seg.scope === "us" || seg.countryCode === "US" ? (
        <UsMap width={w} height={h} state={seg.usState} progress={progress} pulse={frame} />
      ) : (
        <WorldMap width={w} height={h} countryCode={seg.countryCode} progress={progress} pulse={frame} />
      )}
      <div style={{ position: "absolute", left: full ? 110 : 16, top: full ? 60 : 14 }}>
        {seg.flagCode ? <Flag code={seg.flagCode} height={46 * tk} /> : <Globe size={52 * tk} rotate={frame} />}
      </div>
      {seg.location && (
        <div
          style={{
            position: "absolute",
            right: full ? 110 : 14,
            ...(full ? { top: 120 } : { bottom: 14 }),
            background: "rgba(7,20,41,0.85)",
            color: "white",
            fontFamily: FONT_HEAD,
            fontWeight: 600,
            fontSize: 22 * tk,
            letterSpacing: 1.5 * tk,
            padding: `${3 * tk}px ${12 * tk}px`,
            borderLeft: `${5 * tk}px solid ${COLORS.gold}`,
          }}
        >
          {seg.location.toUpperCase()}
        </div>
      )}
    </AbsoluteFill>
  );
};

const Desk: React.FC = () => (
  <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
    <defs>
      <linearGradient id="desk-top" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#E7EEF7" />
        <stop offset="1" stopColor="#AFC0D6" />
      </linearGradient>
      <linearGradient id="desk-front" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#173A6B" />
        <stop offset="1" stopColor="#0A1B33" />
      </linearGradient>
    </defs>
    <path d={`M 90 ${DESK_Y} L 1830 ${DESK_Y} L 1890 ${DESK_Y + 46} L 30 ${DESK_Y + 46} Z`} fill="url(#desk-top)" />
    <rect x={30} y={DESK_Y + 46} width={1860} height={1080 - DESK_Y - 46} fill="url(#desk-front)" />
    <rect x={30} y={DESK_Y + 46} width={1860} height={8} fill={COLORS.red} />
    <rect x={30} y={DESK_Y + 120} width={1860} height={3} fill="#5BA7FF" opacity={0.6} />
    {/* papers */}
    <path d={`M 360 ${DESK_Y + 8} L 540 ${DESK_Y + 4} L 560 ${DESK_Y + 34} L 350 ${DESK_Y + 38} Z`} fill="#FFFFFF" />
    <path d={`M 1370 ${DESK_Y + 4} L 1550 ${DESK_Y + 8} L 1560 ${DESK_Y + 38} L 1350 ${DESK_Y + 34} Z`} fill="#FFFFFF" />
    {/* mug */}
    <rect x={1640} y={DESK_Y - 40} width={44} height={52} rx={6} fill={COLORS.red} />
    <path d={`M 1684 ${DESK_Y - 30} q 20 4 0 26`} stroke={COLORS.red} strokeWidth={7} fill="none" />
    {Array.from({ length: 9 }).map((_, i) => (
      <rect key={i} x={160 + i * 200} y={DESK_Y + 150} width={120} height={4} rx={2} fill="#5BA7FF" opacity={0.25} />
    ))}
  </svg>
);

const IntroSting: React.FC<{ props: EpisodeProps; frame: number; fps: number; length: number }> = ({ props, frame, fps, length }) => {
  const t = frame / fps;
  const lead = length;
  const logoIn = interpolate(t, [0.2, 1.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });
  const dateIn = interpolate(t, [1.0, 1.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wipe = interpolate(t, [lead - 0.6, lead], [0, 2200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${wipe}px)` }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #1B4F9C 0%, #0B1F3A 60%, #050D1C 100%)" }} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <circle key={i} cx={960} cy={470} r={200 + i * 90 + ((frame * 3) % 90)} fill="none" stroke="#5BA7FF" strokeOpacity={0.12} strokeWidth={2} />
        ))}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34 }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * logoIn})`, opacity: logoIn }}>
          <Logo name={props.channelName} frame={frame} scale={2} />
        </div>
        <div style={{ opacity: dateIn, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 40, color: "white", letterSpacing: 2 }}>{props.dateLabel}</div>
        <div style={{ opacity: dateIn, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 30, color: COLORS.gold }}>{props.tagline}</div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: wipe - 60, top: 0, bottom: 0, width: 60, background: COLORS.red }} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ props: EpisodeProps; frame: number; opacity: number }> = ({ props, frame, opacity }) => (
  <AbsoluteFill style={{ opacity, background: "radial-gradient(circle at 50% 45%, #1B4F9C 0%, #0B1F3A 60%, #050D1C 100%)", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
    <Logo name={props.channelName} frame={frame} scale={1.7} />
    <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 52, color: "white", letterSpacing: 3 }}>THANKS FOR WATCHING</div>
    <div style={{ background: COLORS.red, color: "white", fontFamily: FONT_BODY, fontWeight: 800, fontSize: 34, padding: "12px 34px", borderRadius: 10 }}>
      SUBSCRIBE FOR TOMORROW'S EDITION
    </div>
  </AbsoluteFill>
);

export const NewsShow: React.FC<EpisodeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  const current = lineAt(props, t);
  const { seg } = segmentAt(props, t);
  const { shot, shotStart } = shotAt(props, t);
  const push = Math.min(1, (t - shotStart) / 8);
  const cam =
    shot.kind === "map" || shot.kind === "cold"
      ? cameraFor("wide", undefined, 0)
      : cameraFor(shot.kind, shot.kind === "close" ? shot.speaker : undefined, push);
  const stingStart = props.stingStart ?? 0;
  const stingEnd = props.stingEnd ?? props.leadIn;
  const inSting = t >= stingStart && t < stingEnd;
  const inCold = t < stingStart;

  const lastEnd = props.lines[props.lines.length - 1]?.end ?? props.durationSec;
  const endOpacity = interpolate(t, [lastEnd + 0.5, lastEnd + 1.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const speakingNow = current?.speaker;
  const lookFor = (s: Speaker) => {
    if (speakingNow === s) return 0;
    if (speakingNow) return s === "A" ? 0.85 : -0.85;
    return 0;
  };

  // Lower thirds
  let overlay: React.ReactNode = null;
  if (seg.type === "story" && shot.kind !== "map") {
    const age = (t - seg.start - 0.6) * fps;
    if (age >= 0) overlay = (
        <LowerThird
          label={seg.scope === "world" ? `World · ${seg.location || "Global"}` : seg.location || "United States"}
          title={seg.headline}
          age={age}
          fps={fps}
        />
      );
  } else if (seg.type === "intro") {
    for (const s of ["A", "B"] as Speaker[]) {
      const fl = firstLineOf(props, s);
      if (fl && fl.segmentIndex === 0 && t >= fl.start && t < Math.min(fl.end, fl.start + 5)) {
        overlay = <NameStrap name={props.anchors[s].name} channel={props.channelName} age={(t - fl.start) * fps} fps={fps} right={s === "B"} />;
      }
    }
  }

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Audio src={staticFile(props.audioFile)} />

      {/* studio world, moved by the virtual camera */}
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
        <StudioBackground frame={frame} />
        <div style={{ position: "absolute", left: SCREEN.x, top: SCREEN.y, width: SCREEN.w, height: SCREEN.h, borderRadius: 8, overflow: "hidden" }}>
          <ScreenContent seg={seg} t={t} frame={frame} props={props} />
        </div>
        {(["A", "B"] as Speaker[]).map((s) => (
          <div key={s} style={{ position: "absolute", left: POS[s] - ANCHOR_W / 2, top: ANCHOR_TOP, width: ANCHOR_W, height: ANCHOR_H }}>
            <Anchor variant={s === "A" ? "male" : "female"} mouth={mouthFor(props, s, t)} talking={speakingNow === s} look={lookFor(s)} seed={s === "A" ? 1 : 7} />
          </div>
        ))}
        <Desk />
      </AbsoluteFill>

      {shot.kind === "map" && (
        <AbsoluteFill>
          <ScreenContent seg={seg} t={t} frame={frame} props={props} full />
          <div style={{ position: "absolute", left: 110, bottom: 112, background: "rgba(7,20,41,0.9)", borderLeft: `12px solid ${COLORS.red}`, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 56, padding: "6px 30px" }}>
            {seg.headline}
          </div>
        </AbsoluteFill>
      )}

      {/* channel bug */}
      <div style={{ position: "absolute", top: 34, right: 44, display: "flex", alignItems: "center", gap: 10, background: "rgba(7,20,41,0.7)", padding: "6px 14px", borderRadius: 8 }}>
        <Globe size={40} rotate={frame} />
        <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 26, color: "white", letterSpacing: 2 }}>{props.shortDate}</span>
      </div>

      {overlay}
      <Ticker items={props.ticker} frame={frame} label={props.channelName.split(" ").slice(0, 2).join(" ")} date={props.shortDate} />

      {seg.type === "story" && (shot.kind === "close" || shot.kind === "map") && (
        <KeyFacts seg={seg} t={t} side={shot.kind === "close" && shot.speaker === "B" ? "left" : "right"} />
      )}

      {inCold && <ColdOpen props={props} t={t} frame={frame} fps={fps} />}
      {inSting && <IntroSting props={props} frame={frame - Math.round(stingStart * fps)} fps={fps} length={stingEnd - stingStart} />}
      {endOpacity > 0 && <EndCard props={props} frame={frame} opacity={endOpacity} />}
      {/* final fade */}
      <AbsoluteFill style={{ background: "#000", opacity: interpolate(frame, [durationInFrames - 15, durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
    </AbsoluteFill>
  );
};
