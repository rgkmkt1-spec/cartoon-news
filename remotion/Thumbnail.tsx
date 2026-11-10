import React from "react";
import { AbsoluteFill } from "remotion";
import { Anchor } from "./Anchor";
import { COLORS, FONT_HEAD, FONT_BODY, Flag, Logo } from "./Graphics";
import type { EpisodeProps } from "./types";

export const Thumbnail: React.FC<EpisodeProps> = (props) => {
  const top = props.segments.find((s) => s.type === "story");
  const headline = (top?.headline ?? props.channelName).toUpperCase();
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
