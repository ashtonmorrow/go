'use client';

import { useMemo } from 'react';
import { WORLD_GEO } from '@/lib/worldGeoData';
import type { Continent } from './CityFiltersContext';

// === WorldMapPicker ========================================================
// Real Natural Earth country outlines, projected equirectangularly,
// rendered as inline SVG paths colored by continent. Click any country
// to toggle that continent's selection.
//
// Data is inlined as a TypeScript module (lib/worldGeoData.ts) instead
// of imported as JSON because earlier JSON-import attempts repeatedly
// failed to render in the deployed app — likely a Next.js bundle/JIT
// quirk with .json files in client components. As a TS module the data
// is part of the JS bundle for sure.
//
// Rendering is intentionally bare:
//   - No <g> wrappers, just <path>s
//   - Inline fill / stroke / strokeWidth (not Tailwind classes that
//     might get JIT-purged)
//   - No SVG <filter>s (some bundlers / production builds have weird
//     interactions with filter URL references)

type Props = {
  selected: Set<Continent>;
  onToggle: (continent: Continent) => void;
};

const VIEWBOX_W = 360;
const VIEWBOX_H = 170;

function project(lng: number, lat: number): [number, number] {
  return [
    ((lng + 180) / 360) * VIEWBOX_W,
    ((85 - lat) / 170) * VIEWBOX_H,
  ];
}

function ringToPath(ring: number[][]): string {
  if (ring.length === 0) return '';
  const pts = ring.map(([lng, lat]) => project(lng, lat));
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    d += 'L' + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
  }
  return d + 'Z';
}

// Pre-compute paths once at module load. WORLD_GEO has 120+ features
// each with a Polygon or MultiPolygon — flatten everything into a list
// of (continent, path) pairs so the renderer just walks a flat array.
type CountryPath = { name: string; iso3: string; continent: Continent; d: string };

const COUNTRY_PATHS: CountryPath[] = WORLD_GEO.features.map(f => {
  let d = '';
  if (f.geometry.type === 'Polygon') {
    d = (f.geometry.coordinates as number[][][]).map(ringToPath).join(' ');
  } else {
    d = (f.geometry.coordinates as number[][][][])
      .map(poly => poly.map(ringToPath).join(' '))
      .join(' ');
  }
  return {
    name: f.properties.name,
    iso3: f.properties.iso3,
    continent: f.properties.continent,
    d,
  };
});

// Continent name → label position on the map (anchored over a point
// inside that continent's bounding box). Lng/Lat values projected
// through the same function as the country paths.
const CONTINENT_LABELS: Array<{ continent: Continent; lng: number; lat: number }> = [
  { continent: 'North America',  lng: -100, lat: 45 },
  { continent: 'South America',  lng:  -60, lat: -15 },
  { continent: 'Europe',         lng:   18, lat: 55 },
  { continent: 'Africa',         lng:   20, lat:   5 },
  { continent: 'Asia',           lng:   95, lat: 50 },
  { continent: 'Australia',      lng:  135, lat: -25 },
];

export default function WorldMapPicker({ selected, onToggle }: Props) {
  const renderedCountries = useMemo(
    () => COUNTRY_PATHS.map(c => ({ ...c, isSelected: selected.has(c.continent) })),
    [selected]
  );

  return (
    <div
      className="rounded-md border border-sand overflow-hidden"
      style={{ background: '#dde9ef' }}
    >
      <svg
        viewBox={'0 0 ' + VIEWBOX_W + ' ' + VIEWBOX_H}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="group"
        aria-label="World continent picker"
      >
        {/* Latitude graticule — equator + tropics + polar circles. */}
        {[0, 23.5, -23.5, 60, -60].map(lat => {
          const y = ((85 - lat) / 170) * VIEWBOX_H;
          return (
            <line
              key={lat}
              x1={0}
              y1={y}
              x2={VIEWBOX_W}
              y2={y}
              stroke="#ffffff"
              strokeOpacity={lat === 0 ? 0.45 : 0.25}
              strokeWidth={0.5}
              strokeDasharray={lat === 0 ? undefined : '2,3'}
            />
          );
        })}

        {/* Country outlines — colored by selection state. Inline fill /
            stroke (not Tailwind classes) so production purge can't drop
            the colors. fillRule evenodd handles polygons-with-holes. */}
        {renderedCountries.map(c => (
          <path
            key={c.iso3 || c.name}
            d={c.d}
            fillRule="evenodd"
            onClick={() => onToggle(c.continent)}
            fill={c.isSelected ? '#1c1b19' : '#d4be8e'}
            stroke={c.isSelected ? '#faf9f7' : '#7a6440'}
            strokeWidth={0.4}
            strokeLinejoin="round"
            style={{ cursor: 'pointer' }}
          >
            <title>{c.name + ' (' + c.continent + ')'}</title>
          </path>
        ))}

        {/* Continent labels — drawn last so they sit on top of paths. */}
        {CONTINENT_LABELS.map(({ continent, lng, lat }) => {
          const [x, y] = project(lng, lat);
          const active = selected.has(continent);
          return (
            <text
              key={continent}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={active ? '#faf9f7' : '#3a2f1c'}
              style={{ pointerEvents: 'none', letterSpacing: '0.04em' }}
            >
              {continent}
            </text>
          );
        })}
      </svg>

      {/* Chip row beneath the map — alternate input path for users who'd
          rather pick by name. Tracks the same selection set. */}
      <div className="flex flex-wrap gap-1 p-1.5 bg-white border-t border-sand">
        {(['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Australia'] as Continent[]).map(c => {
          const active = selected.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => onToggle(c)}
              className={
                'px-1.5 py-0.5 rounded text-micro font-medium transition-colors ' +
                (active
                  ? 'bg-ink-deep text-cream-soft'
                  : 'bg-cream-soft text-slate hover:bg-cream hover:text-ink-deep')
              }
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}
