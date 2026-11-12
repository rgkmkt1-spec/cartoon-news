import React from "react";
import { Img as RImg, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// extra retries: a brief network hiccup on the PC shouldn't fail a whole render
const Img: React.FC<React.ComponentProps<typeof RImg>> = (p) => <RImg maxRetries={8} {...p} />;
import { blinkAmount } from "./Anchor";
import type { Speaker, StudioAnchor, StudioMeta } from "./types";

const abs = (x: number, y: number, w: number, h: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface MouthState {
  talk: number; // 0..1 talking face visible
  open: number; // 0..1 jaw open
  closed: number; // 0..1 lips pressed (m/b/p)
  listen?: number; // 0..1 the other anchor is talking
  beat?: number; // seconds since this anchor's current line started (-1 = not talking)
}

const Layer: React.FC<{ src?: string; box: { x: number; y: number; w: number; h: number }; opacity: number }> = ({ src, box, opacity }) =>
  src && opacity > 0.02 ? <Img src={staticFile(src)} style={{ ...abs(box.x, box.y, box.w, box.h), opacity: Math.min(1, opacity) }} /> : null;

/** Which sprite-sheet cell holds the AI mouth for this frame (null = not talking). */
function atlasCell(at: NonNullable<StudioAnchor["lipAtlas"]>, frame: number) {
  for (const [f0, s0, n] of at.runs) {
    if (frame >= f0 && frame < f0 + n) {
      const slot = s0 + (frame - f0);
      const per = at.cols * at.rows;
      const k = slot % per;
      const [w, h] = at.size;
      return { sheet: Math.floor(slot / per), row: Math.floor(k / at.cols), col: k % at.cols, w, h, cw: w + 2 * at.pad, ch: h + 2 * at.pad, pad: at.pad };
    }
  }
  return null;
}

const ImageAnchor: React.FC<{ a: StudioAnchor; m: MouthState; laugh: number; seed: number; side: 1 | -1 }> = ({ a, m, laugh, seed, side }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const talk = m.talk;
  const listen = (m.listen ?? 0) * (1 - talk);

  // whole body: breathing + slow sway (never perfectly still)
  const breath = Math.sin((t / 3.6) * Math.PI * 2 + seed);
  const sway = Math.sin(t / 2.9 + seed * 1.7) * 0.8 + Math.sin(t / 1.3 + seed) * 0.35 * talk;
  const bodyTf = `translate(${sway}px, ${-breath * 0.6}px) scale(${1 + breath * 0.004}, ${1 + breath * 0.007})`;

  // head: speech-driven nods, an emphasis dip at the start of each line, idle drift,
  // and a lean toward the co-anchor while listening
  const beat = m.beat ?? -1;
  const emph = beat >= 0 && beat < 0.7 ? Math.sin((beat / 0.7) * Math.PI) : 0;
  const nod =
    talk * (m.open * 3.2 + Math.sin(t * 5.1 + seed) * 1.4 + Math.sin(t * 2.3 + seed * 3) * 1.6 + emph * 4) +
    (1 - talk) * Math.sin(t / 1.9 + seed) * 0.8 +
    laugh * (Math.abs(Math.sin(frame * 0.9)) * 4 - 1.5);
  const tilt =
    talk * (Math.sin(t * 1.15 + seed * 2) * 2.2 + Math.sin(t * 3.1 + seed) * 0.8) +
    (1 - talk) * Math.sin(t / 2.7 + seed * 2) * 0.6 +
    listen * 2.4 * side +
    laugh * 1.8 * (seed % 2 ? 1 : -1);
  const shift = listen * 3 * side + talk * Math.sin(t * 0.9 + seed) * 1.5;

  const blink = blinkAmount(frame, seed);
  const lg = clamp01((laugh - 0.15) / 0.45) * (1 - talk);
  const full = { x: a.x, y: a.y, w: a.w, h: a.h };
  const lower = a.lower;
  const lip = a.lip && a.lipAtlas ? a.lip : undefined;
  const cell = lip ? atlasCell(a.lipAtlas!, frame) : null;
  const base = `${a.pivot[0]}px ${a.y + a.h}px`;

  return (
    <div style={{ ...abs(0, 0, 1920, 1080), transformOrigin: base, transform: bodyTf }}>
      <Img src={staticFile(a.body)} style={abs(a.x, a.y, a.w, a.h)} />
      <div style={{ ...abs(0, 0, 1920, 1080), transformOrigin: `${a.pivot[0]}px ${a.pivot[1]}px`, transform: `translate(${shift}px, ${nod}px) rotate(${tilt}deg)` }}>
        {/* resting (smiling) face */}
        <Img src={staticFile(a.head)} style={abs(a.x, a.y, a.w, a.h)} />
        {lip ? (
          <>
            {/* talking face + AI-redrawn mouth (frame-locked video) */}
            <Layer src={a.talkHead} box={full} opacity={talk} />
            {talk > 0.02 && cell && (
              <div style={{ ...abs(lip.x, lip.y, lip.w, lip.h), overflow: "hidden", opacity: Math.min(1, talk) }}>
                <Img
                  src={staticFile(`${a.lipAtlas!.dir}/s${String(cell.sheet).padStart(3, "0")}.jpg`)}
                  style={{
                    position: "absolute",
                    left: -(cell.col * cell.cw + cell.pad) * (lip.w / cell.w),
                    top: -(cell.row * cell.ch + cell.pad) * (lip.h / cell.h),
                    width: a.lipAtlas!.cols * cell.cw * (lip.w / cell.w),
                    height: a.lipAtlas!.rows * cell.ch * (lip.h / cell.h),
                    maxWidth: "none",
                  }}
                />
              </div>
            )}
          </>
        ) : lower && a.talkHead ? (
          <>
            <Layer src={a.talkHead} box={full} opacity={talk} />
            <Layer src={lower.ah} box={lower} opacity={talk * clamp01((m.open - 0.3) / 0.55)} />
            <Layer src={lower.closed} box={lower} opacity={talk * m.closed * 0.9} />
          </>
        ) : (
          <>
            <Layer src={a.mouth.slight} box={a.mouth} opacity={talk * clamp01(m.open / 0.45)} />
            <Layer src={a.mouth.mid} box={a.mouth} opacity={talk * clamp01((m.open - 0.45) / 0.4)} />
          </>
        )}
        {/* laughing reaction */}
        <Layer src={a.laughHead ?? a.mouth.laugh} box={a.laughHead ? full : a.mouth} opacity={lg} />
        {blink > 0.5 && lg < 0.5 && <Img src={staticFile(a.blink.src)} style={abs(a.blink.x, a.blink.y, a.blink.w, a.blink.h)} />}
      </div>
    </div>
  );
};

/** Background plate + anchors. `screen` is rendered between them (behind the anchors). */
export const ImageStudio: React.FC<{
  studio: StudioMeta;
  screen: React.ReactNode;
  mouthFor: (s: Speaker) => MouthState;
  laughFor: (s: Speaker) => number;
}> = ({ studio, screen, mouthFor, laughFor }) => (
  <>
    <Img src={staticFile(studio.plate)} style={abs(0, 0, 1920, 1080)} />
    <div style={{ ...abs(studio.screen.x, studio.screen.y, studio.screen.w, studio.screen.h), overflow: "hidden", borderRadius: 4 }}>{screen}</div>
    {(["B", "A"] as Speaker[]).map((s) => (
      <ImageAnchor key={s} a={studio.anchors[s]} m={mouthFor(s)} laugh={laughFor(s)} seed={s === "A" ? 1 : 7} side={s === "A" ? -1 : 1} />
    ))}
  </>
);
