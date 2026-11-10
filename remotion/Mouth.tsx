import React from "react";
import type { MouthShape } from "./types";

/**
 * Preston-Blair mouth shapes used by Rhubarb Lip Sync.
 * A: closed (M,B,P)  B: slightly open, teeth  C: open  D: wide open
 * E: rounded  F: puckered (OO/W)  G: F/V teeth on lip  H: L, tongue up  X: rest
 */
const SHAPES: Record<MouthShape, { w: number; h: number; teeth: number; tongue: number; closed?: boolean }> = {
  X: { w: 34, h: 0, teeth: 0, tongue: 0, closed: true },
  A: { w: 30, h: 0, teeth: 0, tongue: 0, closed: true },
  B: { w: 36, h: 9, teeth: 1, tongue: 0 },
  C: { w: 38, h: 16, teeth: 0.6, tongue: 0.3 },
  D: { w: 42, h: 26, teeth: 0.45, tongue: 0.6 },
  E: { w: 30, h: 18, teeth: 0.3, tongue: 0.3 },
  F: { w: 18, h: 13, teeth: 0, tongue: 0.2 },
  G: { w: 34, h: 8, teeth: 1, tongue: 0 },
  H: { w: 36, h: 17, teeth: 0.5, tongue: 1 },
};

export const Mouth: React.FC<{ shape: MouthShape; lip: string; idPrefix: string; smile?: number }> = ({
  shape,
  lip,
  idPrefix,
  smile = 0,
}) => {
  const s = SHAPES[shape] ?? SHAPES.X;
  if (s.closed) {
    const w = s.w / 2;
    const curve = shape === "X" ? 5 + smile * 4 : 1.5;
    return (
      <g>
        <path d={`M ${-w} 0 Q 0 ${curve} ${w} 0`} stroke={lip} strokeWidth={shape === "A" ? 5 : 3.5} fill="none" strokeLinecap="round" />
        <path d={`M ${-w * 0.5} ${curve * 0.5 + 6} Q 0 ${curve * 0.5 + 10} ${w * 0.5} ${curve * 0.5 + 6}`} stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.25} />
        {shape === "X" && (
          <>
            <path d={`M ${-w - 2} -1.5 q -2 2 0 4`} stroke={lip} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.6} />
            <path d={`M ${w + 2} -1.5 q 2 2 0 4`} stroke={lip} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.6} />
          </>
        )}
      </g>
    );
  }
  const w = s.w / 2;
  const h = s.h;
  const top = -h * 0.35;
  const bottom = h * 0.65;
  const d = `M ${-w} 0 Q 0 ${-h * 0.7} ${w} 0 Q 0 ${h * 1.3} ${-w} 0 Z`;
  const clipId = `${idPrefix}-mouth`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill="#4A1414" />
      <g clipPath={`url(#${clipId})`}>
        {s.teeth > 0 && <rect x={-w} y={top - 2} width={w * 2} height={Math.max(3, h * 0.32 * s.teeth) + 2} fill="#F7F3EE" />}
        {s.tongue > 0 && <ellipse cx={0} cy={bottom - h * 0.12 * (shape === "H" ? 2.2 : 1)} rx={w * 0.6} ry={h * 0.32 * s.tongue + 2} fill="#D7666B" />}
      </g>
      <path d={d} fill="none" stroke={lip} strokeWidth={3.2} strokeLinejoin="round" />
    </g>
  );
};
