import React, { useMemo } from "react";
import { geoAlbersUsa, geoNaturalEarth1, geoPath, geoGraticule10, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import countries from "i18n-iso-countries";
import world from "world-atlas/countries-50m.json";
import usStates from "us-atlas/states-10m.json";
import { US_STATES } from "./usStates";

type Feat = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id?: string };

const COUNTRIES: Feat[] = (feature(world as any, (world as any).objects.countries) as any).features;
const COUNTRY_BY_ID = new Map(COUNTRIES.map((f) => [String(f.id), f]));
const STATES: Feat[] = (feature(usStates as any, (usStates as any).objects.states) as any).features;
const STATE_BY_NAME = new Map(STATES.map((f) => [f.properties.name, f]));

export function findCountry(alpha2: string): Feat | undefined {
  if (!alpha2) return undefined;
  const num = countries.alpha2ToNumeric(alpha2.toUpperCase());
  return num ? COUNTRY_BY_ID.get(String(num)) : undefined;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Paths are projected ONCE (memoized) and the fly-in is a cheap SVG transform,
 * which keeps rendering fast on free GitHub runners.
 */
const ZoomMap: React.FC<{
  width: number;
  height: number;
  features: Feat[];
  target?: Feat;
  projection: GeoProjection;
  graticule?: boolean;
  maxZoom: number;
  progress: number;
  pulse: number;
}> = ({ width, height, features, target, projection, graticule, maxZoom, progress, pulse }) => {
  const geo = useMemo(() => {
    const path = geoPath(projection);
    const d = features.map((f) => path(f as any) ?? "");
    const targetIdx = target && path(target as any) ? features.indexOf(target) : -1; // e.g. Puerto Rico isn't drawn on AlbersUsa
    let zoom = 1;
    let center: [number, number] = [width / 2, height / 2];
    let marker: [number, number] | null = null;
    if (targetIdx >= 0 && target) {
      const [[x0, y0], [x1, y1]] = path.bounds(target as any);
      const bw = Math.max(1, x1 - x0);
      const bh = Math.max(1, y1 - y0);
      zoom = Math.min(maxZoom, (width * 0.5) / bw, (height * 0.55) / bh);
      zoom = Math.max(1.15, zoom);
      if (bw > width * 0.9) zoom = 1.15; // huge / antimeridian-spanning countries
      center = zoom === 1.15 && bw > width * 0.9 ? [width / 2, height / 2] : [(x0 + x1) / 2, (y0 + y1) / 2];
      const c = path.centroid(target as any);
      marker = Number.isFinite(c[0]) ? (c as [number, number]) : center;
    }
    return { d, targetIdx, zoom, center, marker, grat: graticule ? path(geoGraticule10()) ?? "" : "" };
  }, [features, target, projection, width, height, maxZoom, graticule]);

  const t = ease(Math.min(1, Math.max(0, progress)));
  const z = Math.pow(geo.zoom, t);
  const cx = width / 2 + (geo.center[0] - width / 2) * t;
  const cy = height / 2 + (geo.center[1] - height / 2) * t;
  const transform = `translate(${width / 2} ${height / 2}) scale(${z}) translate(${-cx} ${-cy})`;
  const toScreen = (p: [number, number]) => [(p[0] - cx) * z + width / 2, (p[1] - cy) * z + height / 2];
  const ring = (pulse % 45) / 45;
  const m = geo.marker ? toScreen(geo.marker) : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <rect width={width} height={height} fill="#081A33" />
      <g transform={transform}>
        {geo.grat && <path d={geo.grat} stroke="#2A4C7A" strokeWidth={0.6} fill="none" opacity={0.5} vectorEffect="non-scaling-stroke" />}
        {geo.d.map((d, i) =>
          i === geo.targetIdx ? null : <path key={i} d={d} fill="#1F4475" stroke="#3C6CA8" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />,
        )}
        {geo.targetIdx >= 0 && (
          <path d={geo.d[geo.targetIdx]} fill="#F2B33D" stroke="#FFE3A1" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        )}
      </g>
      {m && t > 0.6 && (
        <g transform={`translate(${m[0]} ${m[1]})`} opacity={Math.min(1, (t - 0.6) / 0.3)}>
          <circle r={10 + ring * 34} fill="none" stroke="#FF5A4E" strokeWidth={3} opacity={1 - ring} />
          <circle r={8} fill="#FF5A4E" stroke="#FFFFFF" strokeWidth={3} />
        </g>
      )}
    </svg>
  );
};

/** World map that flies in to the story's country. */
export const WorldMap: React.FC<{ width: number; height: number; countryCode: string; progress: number; pulse: number }> = ({
  width,
  height,
  countryCode,
  progress,
  pulse,
}) => {
  const target = useMemo(() => findCountry(countryCode), [countryCode]);
  const projection = useMemo(() => geoNaturalEarth1().fitSize([width, height], { type: "Sphere" } as any), [width, height]);
  return (
    <ZoomMap width={width} height={height} features={COUNTRIES} target={target} projection={projection} graticule maxZoom={9} progress={progress} pulse={pulse} />
  );
};

/** U.S. map (with Alaska/Hawaii insets) that highlights and zooms to a state; whole country if no state. */
export const UsMap: React.FC<{ width: number; height: number; state: string; progress: number; pulse: number }> = ({
  width,
  height,
  state,
  progress,
  pulse,
}) => {
  const target = useMemo(() => (state ? STATE_BY_NAME.get(US_STATES[state.toUpperCase()] ?? "") : undefined), [state]);
  const projection = useMemo(
    () =>
      geoAlbersUsa().fitExtent(
        [
          [width * 0.05, height * 0.08],
          [width * 0.95, height * 0.92],
        ],
        { type: "FeatureCollection", features: STATES } as any,
      ),
    [width, height],
  );
  return <ZoomMap width={width} height={height} features={STATES} target={target} projection={projection} maxZoom={4} progress={progress} pulse={pulse} />;
};
