import React from "react";
import { useCurrentFrame } from "remotion";
import { Mouth } from "./Mouth";
import type { MouthShape } from "./types";

/**
 * Pixar-inspired anchors drawn in SVG: big head-to-body ratio, large glossy eyes,
 * soft gradient "3D" shading, rim light, ambient-occlusion shadows and a fake head-turn parallax.
 */
export type AnchorLook = {
  skinLight: string;
  skin: string;
  skinShade: string;
  skinDeep: string;
  hairLight: string;
  hair: string;
  hairDark: string;
  suitLight: string;
  suit: string;
  suitShade: string;
  shirt: string;
  shirtShade: string;
  accent: string;
  accentShade: string;
  lip: string;
  iris: string;
  irisLight: string;
  brow: string;
};

export const MALE: AnchorLook = {
  skinLight: "#FFE0C4",
  skin: "#F2C29C",
  skinShade: "#D99A72",
  skinDeep: "#B9775A",
  hairLight: "#8A5E3F",
  hair: "#5B3A26",
  hairDark: "#2E1C12",
  suitLight: "#3B5BA0",
  suit: "#24396F",
  suitShade: "#152447",
  shirt: "#FFFFFF",
  shirtShade: "#D3DCEA",
  accent: "#D33A3A",
  accentShade: "#8E1F25",
  lip: "#A85848",
  iris: "#3F78B5",
  irisLight: "#8EC3F0",
  brow: "#4A2E1E",
};

export const FEMALE: AnchorLook = {
  skinLight: "#E9B48E",
  skin: "#CB8D65",
  skinShade: "#A86C4A",
  skinDeep: "#86523A",
  hairLight: "#6B4130",
  hair: "#3A2218",
  hairDark: "#1A0E09",
  suitLight: "#2BA3A8",
  suit: "#167A82",
  suitShade: "#0B4F57",
  shirt: "#FFF6E8",
  shirtShade: "#E3D3BA",
  accent: "#F2C14E",
  accentShade: "#B68A26",
  lip: "#B23A4E",
  iris: "#6B4226",
  irisLight: "#C08A55",
  brow: "#2A1810",
};

function rand(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 0 = open, 1 = closed. Blinks every ~2.5–5.5 s. */
function blinkAmount(frame: number, seed: number) {
  let t = 0;
  for (let i = 0; t <= frame; i++) {
    const next = t + 75 + Math.floor(rand(seed * 31 + i) * 90);
    if (frame >= next && frame < next + 6) return [0.45, 0.9, 1, 0.85, 0.45, 0.1][frame - next];
    t = next;
  }
  return 0;
}

export const Anchor: React.FC<{
  variant: "male" | "female";
  mouth: MouthShape;
  talking: boolean;
  look: number; // -1 screen-left .. 1 screen-right, 0 = camera
  seed: number;
  laugh?: number; // 0..1 — reacting to a joke
}> = ({ variant, mouth, talking, look, seed, laugh = 0 }) => {
  const frame = useCurrentFrame();
  const c = variant === "male" ? MALE : FEMALE;
  const id = `${variant}-${seed}`;
  const u = (n: string) => `url(#${id}-${n})`;

  const breathe = Math.sin(frame / 22 + seed) * 0.5 + 0.5;
  const talkAmt = talking ? 1 : 0.3;
  const tilt = Math.sin(frame / 37 + seed * 2) * 1.8 * talkAmt + look * 3 + laugh * (variant === "male" ? -4 : 4);
  const nod =
    (talking ? Math.sin(frame / 9 + seed) * 1.8 + Math.sin(frame / 23) * 1.2 : Math.sin(frame / 40 + seed) * 0.7) +
    laugh * (Math.abs(Math.sin(frame * 0.9)) * 5 - 2); // chuckle bounce
  const blink = blinkAmount(frame, seed);
  const browLift = (talking ? Math.max(0, Math.sin(frame / 31 + seed * 3)) * 4 : 0) + laugh * 6;
  const turn = look * 7; // face features slide = fake 3D head turn
  const pupil = look * 5;

  // ---------- eye ----------
  const EYE_Y = 178;
  const Eye = ({ cx, side }: { cx: number; side: -1 | 1 }) => {
    const x = cx + turn;
    // upper lid line height: 0 (open) .. 1 (closed); resting lid covers top of iris a little
    const lid = Math.min(1, 0.18 + laugh * 0.32 + blink * 0.82); // happy squint
    const top = EYE_Y - 25;
    const lidY = top + lid * 50;
    const clip = `${id}-eye${side}`;
    return (
      <g>
        <defs>
          <clipPath id={clip}>
            <ellipse cx={x} cy={EYE_Y} rx={23} ry={25} />
          </clipPath>
        </defs>
        {/* socket shadow */}
        <ellipse cx={x} cy={EYE_Y + 2} rx={28} ry={30} fill={c.skinShade} opacity={0.16} filter={u("soft")} />
        <g clipPath={`url(#${clip})`}>
          <ellipse cx={x} cy={EYE_Y} rx={23} ry={25} fill={u("sclera")} />
          <circle cx={x + pupil} cy={EYE_Y + 2} r={15.5} fill={u("iris")} />
          <circle cx={x + pupil} cy={EYE_Y + 2} r={15.5} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={2} />
          <circle cx={x + pupil} cy={EYE_Y + 2} r={8} fill="#0B0B0F" />
          <ellipse cx={x + pupil + 5} cy={EYE_Y - 4} rx={5} ry={6} fill="#FFFFFF" />
          <circle cx={x + pupil - 5} cy={EYE_Y + 9} r={2.4} fill="#FFFFFF" opacity={0.85} />
          {/* eyelid (skin) sweeping down from the top */}
          <rect x={x - 30} y={top - 40} width={60} height={lidY - top + 40} fill={u("lid")} />
          <path d={`M ${x - 26} ${lidY} Q ${x} ${lidY + 5} ${x + 26} ${lidY}`} stroke={c.skinDeep} strokeWidth={3} fill="none" opacity={0.6} />
          {/* lid shadow on eyeball */}
          <rect x={x - 30} y={lidY} width={60} height={7} fill="#000" opacity={0.12} />
        </g>
        {/* lash line */}
        <path
          d={`M ${x - 25} ${Math.max(EYE_Y - 2, lidY) - 1} Q ${x} ${Math.min(lidY, EYE_Y + 10) - 8} ${x + 25} ${Math.max(EYE_Y - 2, lidY) - 1}`}
          stroke="#1E120C"
          strokeWidth={variant === "female" ? 4.5 : 3}
          fill="none"
          strokeLinecap="round"
          opacity={blink > 0.9 ? 1 : 0.9}
        />
        {variant === "female" && blink < 0.9 && (
          <path d={`M ${x + side * 23} ${Math.max(EYE_Y - 2, lidY) - 2} q ${side * 5} -1 ${side * 8} -6`} stroke="#1E120C" strokeWidth={3} fill="none" strokeLinecap="round" />
        )}
        {/* lower lid */}
        <path d={`M ${x - 18} ${EYE_Y + 24} Q ${x} ${EYE_Y + 30} ${x + 18} ${EYE_Y + 24}`} stroke={c.skinShade} strokeWidth={2.5} fill="none" opacity={0.7} />
      </g>
    );
  };

  return (
    <svg viewBox="0 0 400 520" width="100%" height="100%" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-face`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={c.skinLight} />
          <stop offset="55%" stopColor={c.skin} />
          <stop offset="100%" stopColor={c.skinShade} />
        </radialGradient>
        <linearGradient id={`${id}-lid`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.skin} />
          <stop offset="1" stopColor={c.skinShade} />
        </linearGradient>
        <radialGradient id={`${id}-sclera`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="85%" stopColor="#F1EEF0" />
          <stop offset="100%" stopColor="#D9D0D4" />
        </radialGradient>
        <radialGradient id={`${id}-iris`} cx="50%" cy="65%" r="60%">
          <stop offset="0%" stopColor={c.irisLight} />
          <stop offset="70%" stopColor={c.iris} />
          <stop offset="100%" stopColor="#111" />
        </radialGradient>
        <linearGradient id={`${id}-hair`} x1="0" x2="0.4" y1="0" y2="1">
          <stop offset="0" stopColor={c.hairLight} />
          <stop offset="0.5" stopColor={c.hair} />
          <stop offset="1" stopColor={c.hairDark} />
        </linearGradient>
        <linearGradient id={`${id}-suit`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.suitLight} />
          <stop offset="0.45" stopColor={c.suit} />
          <stop offset="1" stopColor={c.suitShade} />
        </linearGradient>
        <linearGradient id={`${id}-shirt`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.shirt} />
          <stop offset="1" stopColor={c.shirtShade} />
        </linearGradient>
        <linearGradient id={`${id}-neck`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.skinDeep} />
          <stop offset="0.5" stopColor={c.skinShade} />
          <stop offset="1" stopColor={c.skin} />
        </linearGradient>
        <linearGradient id={`${id}-tie`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={c.accentShade} />
          <stop offset="0.45" stopColor={c.accent} />
          <stop offset="1" stopColor={c.accentShade} />
        </linearGradient>
        <radialGradient id={`${id}-nose`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={c.skinLight} />
          <stop offset="100%" stopColor={c.skin} />
        </radialGradient>
        <filter id={`${id}-blur2`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* ================= BODY ================= */}
      <g transform={`translate(0 ${-breathe * 1.6})`}>
        {variant === "female" && (
          <g transform={`rotate(${tilt * 0.5} 200 300)`}>
            <path d="M 92 170 Q 80 300 120 352 Q 200 372 280 352 Q 320 300 308 170 Z" fill={u("hair")} />
          </g>
        )}
        {/* torso: rounder, narrower shoulders (cartoon proportions) */}
        <path d="M 52 520 Q 52 392 112 350 Q 156 322 200 322 Q 244 322 288 350 Q 348 392 348 520 Z" fill={u("suit")} />
        {/* shoulder highlights */}
        <path d="M 112 352 Q 150 330 182 328" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={6} fill="none" strokeLinecap="round" />
        <path d="M 288 352 Q 250 330 218 328" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={6} fill="none" strokeLinecap="round" />
        {/* side shading */}
        <path d="M 52 520 Q 52 400 104 358 Q 92 440 112 520 Z" fill="#000" opacity={0.18} />
        <path d="M 348 520 Q 348 400 296 358 Q 308 440 288 520 Z" fill="#000" opacity={0.25} />
        {/* shirt */}
        <path d="M 168 326 L 200 420 L 232 326 Q 200 318 168 326 Z" fill={u("shirt")} />
        {variant === "male" ? (
          <>
            <path d="M 170 324 L 188 358 L 200 334 Z" fill={c.shirt} stroke={c.shirtShade} strokeWidth={1.5} />
            <path d="M 230 324 L 212 358 L 200 334 Z" fill={c.shirt} stroke={c.shirtShade} strokeWidth={1.5} />
            <path d="M 191 336 Q 200 332 209 336 L 212 350 L 204 358 L 196 358 L 188 350 Z" fill={u("tie")} />
            <path d="M 196 358 L 204 358 L 215 432 L 200 450 L 185 432 Z" fill={u("tie")} />
            <path d="M 197 366 L 200 366 L 207 430 L 202 436 Z" fill="#FFFFFF" opacity={0.18} />
          </>
        ) : (
          <>
            <path d="M 176 332 Q 200 372 224 332" stroke={c.accent} strokeWidth={3.5} fill="none" />
            <circle cx={200} cy={360} r={7} fill={c.accent} stroke={c.accentShade} strokeWidth={2} />
            <circle cx={198} cy={358} r={2.2} fill="#FFF" opacity={0.8} />
          </>
        )}
        {/* lapels with fold shading */}
        <path d="M 168 326 L 200 432 L 178 432 L 132 356 Q 146 332 168 326 Z" fill={c.suitShade} />
        <path d="M 232 326 L 200 432 L 222 432 L 268 356 Q 254 332 232 326 Z" fill={c.suitShade} />
        <path d="M 168 326 L 132 356" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />
        <path d="M 232 326 L 268 356" stroke="#FFFFFF" strokeOpacity={0.15} strokeWidth={3} strokeLinecap="round" />
        {/* lapel mic */}
        <rect x={variant === "male" ? 148 : 244} y={374} width={10} height={15} rx={4} fill="#1D1D22" />
        <circle cx={variant === "male" ? 153 : 249} cy={377} r={2} fill="#555" />
      </g>

      {/* ================= HEAD ================= */}
      <g transform={`translate(0 ${nod - breathe * 1.6}) rotate(${tilt} 200 320)`}>
        {/* neck + chin shadow (ambient occlusion) */}
        <path d="M 172 250 L 170 330 Q 200 344 230 330 L 228 250 Z" fill={u("neck")} />
        <ellipse cx={200} cy={268} rx={44} ry={18} fill={c.skinDeep} opacity={0.55} filter={u("soft")} />

        {/* back hair (male: none; female: framing volume) */}
        {variant === "female" && (
          <path
            d="M 96 200 Q 82 96 168 66 Q 246 44 296 104 Q 324 150 306 230 Q 300 270 314 300 Q 270 296 262 240 L 140 240 Q 132 296 86 300 Q 102 262 96 200 Z"
            fill={u("hair")}
          />
        )}

        {/* ears */}
        <g transform={`translate(${-turn * 0.6} 0)`}>
          <ellipse cx={104} cy={192} rx={15} ry={22} fill={c.skinShade} />
          <ellipse cx={106} cy={193} rx={8} ry={13} fill={c.skinDeep} opacity={0.5} />
          <ellipse cx={296} cy={192} rx={15} ry={22} fill={c.skinShade} />
          <ellipse cx={294} cy={193} rx={8} ry={13} fill={c.skinDeep} opacity={0.5} />
          {variant === "female" && (
            <>
              <circle cx={104} cy={220} r={6} fill={c.accent} stroke={c.accentShade} strokeWidth={1.5} />
              <circle cx={296} cy={220} r={6} fill={c.accent} stroke={c.accentShade} strokeWidth={1.5} />
            </>
          )}
        </g>

        {/* face: big round cranium, soft cheeks, small chin */}
        <path
          d="M 106 176 Q 104 76 200 70 Q 296 76 294 176 Q 294 236 258 266 Q 230 290 200 290 Q 170 290 142 266 Q 106 236 106 176 Z"
          fill={u("face")}
        />
        {/* rim light on the screen-right edge */}
        <path d="M 289 150 Q 296 200 272 248" stroke="#BFE3FF" strokeOpacity={0.3} strokeWidth={7} fill="none" strokeLinecap="round" filter={u("blur2")} />
        {/* cheeks */}
        <g transform={`translate(${turn * 0.8} 0)`}>
          <ellipse cx={146} cy={224} rx={22} ry={13} fill="#F07F7F" opacity={0.25} filter={u("soft")} />
          <ellipse cx={254} cy={224} rx={22} ry={13} fill="#F07F7F" opacity={0.25} filter={u("soft")} />
        </g>

        {/* front hair */}
        <g transform={`translate(${-turn * 0.3} 0)`}>
          {variant === "male" ? (
            <>
              <path
                d="M 100 182 Q 92 96 150 66 Q 210 36 266 62 Q 314 86 302 182 Q 296 136 278 118 Q 262 140 220 136 Q 176 132 150 108 Q 130 132 116 140 Q 104 156 100 182 Z"
                fill={u("hair")}
              />
              {/* swoop + highlight strands */}
              <path d="M 150 108 Q 200 70 280 116 Q 232 82 176 86 Z" fill={c.hairDark} opacity={0.35} />
              <path d="M 160 82 Q 210 60 260 80" stroke={c.hairLight} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.7} />
              <path d="M 140 98 Q 170 76 196 74" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.25} />
            </>
          ) : (
            <>
              <path
                d="M 102 196 Q 96 92 182 70 Q 258 58 294 112 Q 308 140 300 186 Q 284 138 252 118 Q 212 132 170 122 Q 128 140 114 190 Z"
                fill={u("hair")}
              />
              {/* side-swept bang */}
              <path d="M 140 104 Q 196 72 262 94" stroke={c.hairLight} strokeWidth={7} fill="none" strokeLinecap="round" opacity={0.7} />
              <path d="M 150 96 Q 180 82 210 80" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.25} />
              <path d="M 98 220 Q 92 262 104 290" stroke={c.hairLight} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.5} />
              <path d="M 302 220 Q 308 262 296 290" stroke={c.hairLight} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.35} />
            </>
          )}
        </g>

        {/* brows */}
        <g transform={`translate(${turn} ${-browLift})`}>
          <path
            d={variant === "male" ? "M 136 142 Q 160 128 186 138 Q 186 145 182 146 Q 160 138 140 150 Z" : "M 138 144 Q 162 128 186 138 Q 186 142 183 143 Q 162 136 141 150 Z"}
            fill={c.brow}
          />
          <path
            d={variant === "male" ? "M 264 142 Q 240 128 214 138 Q 214 145 218 146 Q 240 138 260 150 Z" : "M 262 144 Q 238 128 214 138 Q 214 142 217 143 Q 238 136 259 150 Z"}
            fill={c.brow}
          />
        </g>

        <Eye cx={160} side={-1} />
        <Eye cx={240} side={1} />

        {/* nose: soft bulb with shadow + highlight */}
        <g transform={`translate(${turn * 1.1} 0)`}>
          <ellipse cx={203} cy={228} rx={17} ry={8} fill={c.skinDeep} opacity={0.35} filter={u("soft")} />
          <ellipse cx={200} cy={217} rx={14} ry={13} fill={u("nose")} />
          <circle cx={195} cy={212} r={3.5} fill="#FFFFFF" opacity={0.45} />
        </g>

        {/* mouth */}
        <g transform={`translate(${200 + turn} 252) scale(1.2)`}>
          <Mouth shape={mouth} lip={c.lip} idPrefix={id} smile={talking ? 0 : 1} grin={!talking && laugh > 0.3} />
        </g>
        {/* chin highlight */}
        <ellipse cx={200 + turn * 0.7} cy={278} rx={14} ry={5} fill="#FFFFFF" opacity={0.12} />
      </g>
    </svg>
  );
};
