import React from "react";
import { Composition, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import { NewsShow } from "./NewsShow";
import { Thumbnail } from "./Thumbnail";
import { FPS, type EpisodeProps } from "./types";
import sample from "../samples/sample-props.json";

const FONTS: [string, string, string][] = [
  ["Oswald", "oswald-latin-500-normal.woff2", "500"],
  ["Oswald", "oswald-latin-600-normal.woff2", "600"],
  ["Oswald", "oswald-latin-700-normal.woff2", "700"],
  ["Inter", "inter-latin-500-normal.woff2", "500"],
  ["Inter", "inter-latin-700-normal.woff2", "700"],
  ["Inter", "inter-latin-800-normal.woff2", "800"],
];
for (const [family, file, weight] of FONTS) {
  loadFont({ family, url: staticFile(`fonts/${file}`), weight });
}

const defaults = sample as unknown as EpisodeProps;

export const Root: React.FC = () => (
  <>
    <Composition
      id="NewsShow"
      component={NewsShow as any}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={Math.ceil(defaults.durationSec * FPS)}
      defaultProps={defaults as any}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil((props as any).durationSec * FPS) })}
    />
    <Composition
      id="Thumbnail"
      component={Thumbnail as any}
      fps={FPS}
      width={1280}
      height={720}
      durationInFrames={1}
      defaultProps={defaults as any}
    />
  </>
);
