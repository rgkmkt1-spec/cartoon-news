import React from "react";
import { AbsoluteFill } from "remotion";
import { Anchor } from "./Anchor";
import { COLORS, FONT_HEAD, FONT_BODY, Flag, Logo } from "./Graphics";
import { ImageStudio } from "./ImageStudio";
import type { EpisodeProps } from "./types";

export const Thumbnail: React.FC<EpisodeProps> = (props) => {
  const top = props.segments.find((s) => s.type === "story");
  const headline = (top?.headline ?? props.channelName).toUpperCase();
  if (props.studio) {
    const k = 0.84;
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <div style={{ position: "absolute", width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${640 - 1000 * k}px, ${290 - 420 * k}px) scale(${k})` }}>
          <ImageStudio
            studio={props.studio}
            screen={<AbsoluteFill style={{ background: "linear-gradient(135deg,#0E3570,#071a3a)", alignItems: "center", justifyContent: "center" }}><Logo name={props.channelName} frame={0} scale={0.7} /></AbsoluteFill>}
            mouthFor={() => ({ talk: 0, open: 0, closed: 0 })}
            laughFor={() => 0}
          />
        </div>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(5,13,28,0.92) 72%)" }} />
        <div style={{ position: "absolute", left: 40, top: 30, display: "flex", gap: 0 }}>
          <div style={{ background: COLORS.red, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 38, padding: "4px 20px" }}>TODAY'S NEWS</div>
          <div style={{ background: "white", color: COLORS.ink, fontFamily: FONT_BODY, fontWeight: 800, fontSize: 32, padding: "8px 18px" }}>{props.shortDate}</div>
        </div>
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 34, display: "flex", alignItems: "center", gap: 24 }}>
          {top?.flagCode && <Flag code={top.flagCode} height={78} />}
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: headline.length > 32 ? 66 : 80, lineHeight: 1.02, color: "white", textShadow: "0 6px 18px rgba(0,0,0,0.7)" }}>{headline}</div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 70% 30%, #1D4A86 0%, #0B1F3A 60%, #050D1C 100%)" }}>
      <div style={{ position: "absolute", right: -40, top: 150, width: 420, height: 546 }}>
        <Anchor variant="female" mouth="X" talking={false} look={0} seed={7} />
      </div>
      <div style={{ position: "absolute", right: 250, top: 190, width: 400, height: 520 }}>
        <Anchor variant="male" mouth="X" talking={false} look={0} seed={1} />
      </div>
      <div style={{ position: "absolute", left: 50, top: 40 }}>
        <Logo name={props.channelName} frame={0} scale={0.85} />
      </div>
      <div style={{ position: "absolute", left: 50, top: 190, width: 700 }}>
        {top?.flagCode && (
          <div style={{ marginBottom: 18 }}>
            <Flag code={top.flagCode} height={80} />
          </div>
        )}
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: headline.length > 34 ? 70 : 86,
            lineHeight: 1.02,
            color: "white",
            textShadow: "0 6px 18px rgba(0,0,0,0.6)",
          }}
        >
          {headline}
        </div>
      </div>
      <div style={{ position: "absolute", left: 50, bottom: 40, display: "flex", gap: 14 }}>
        <div style={{ background: COLORS.red, color: "white", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 40, padding: "4px 22px" }}>TOP STORIES</div>
        <div style={{ background: "white", color: COLORS.ink, fontFamily: FONT_BODY, fontWeight: 800, fontSize: 34, padding: "8px 22px" }}>{props.shortDate}</div>
      </div>
    </AbsoluteFill>
  );
};
