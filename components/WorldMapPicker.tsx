'use client';

import { useMemo } from 'react';
import worldGeo from '@/lib/worldGeo.json';
import type { Continent } from './CityFiltersContext';

// === WorldMapPicker ========================================================
// Pictorial multi-select for continent filtering, rendered as a real world
// map. Uses a baked-in Natural Earth 1:110m country dataset (slimmed to
// 166 KB by stripping unused fields and rounding coords to 2dp), so there's
// zero runtime fetch — the picker renders instantly on every page mount.
//
// The previous version fetched a 3.4 MB GeoJSON from jsdelivr at runtime
// and was hanging on slower connections (the user saw an empty grey
// strip where the map should have been). Baking the data in eliminates
// that whole class of failure.
//
// The continent attribution comes from the GeoJSON's own CONTINENT
// property, normalised at preprocess time ('Oceania' → 'Australia' to
// match our CityFiltersContext Continent type). No external mapping
// needed.

type GeoFeature = {
  type: 'Feature';
  properties: { name: string; iso3: string; continent: Continent };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};

const FEATURES = (worldGeo as { features: GeoFeature[] }).features;

type Props = {
  selected: Set<Continent>;
  onToggle: (continent: Continent) => void;
};

// Equirectangular projection — simplest, most legible at picker scale.
// Crops at ±85° latitude so polar slivers don't waste vertical space.
const VIEWBOX_W = 360;
const VIEWBOX_H = 170;
const project = (lng: number, lat: number): [number, number] => [
  ((lng + 180) / 360) * VIEWBOX_W,
  ((85 - lat) / 170) * VIEWBOX_H,
];

function ringsToPath(rings: number[][][]): string {
  return rings
    .map(ring => {
      if (ring.length === 0) return '';
      const pts = ring.map(([lng, lat]) => project(lng, lat));
      const [first, ...rest] = pts;
      return (
        'M' + first[0].toFixed(1) + ',' + first[1].toFixed(1) +
        rest.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('') +
        'Z'
      );
    })
    .join(' ');
}

function geometryToPath(geom: GeoFeature['geometry']): string {
  if (geom.type === 'Polygon') {
    return ringsToPath(geom.coordinates as number[][][]);
  }
  // MultiPolygon
  return (geom.coordinates as number[][][][])
    .map(poly => ringsToPath(poly))
    .join(' ');
}

// Pre-compute country paths once at module level. The features array is
// static so this runs exactly once per page load.
const COUNTRY_PATHS: Array<{
  name: string;
  iso3: string;
  continent: Continent;
  d: string;
}> = FEATURES.map(f => ({
  name: f.properties.name,
  iso3: f.properties.iso3,
  continent: f.properties.continent,
  d: geometryToPath(f.geometry),
}));

const CONTINENTS_IN_PICKER: Continent[] = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Australia',
];

export default function WorldMapPicker({ selected, onToggle }: Props) {
  // Memoize the rendered country list keyed by the selection set so we
  // don't re-walk paths on unrelated state changes.
  const renderedCountries = useMemo(() => {
    return COUNTRY_PATHS.map(c => ({
      ...c,
      isSelected: selected.has(c.continent),
    }));
  }, [selected]);

  return (
    <div
      className="rounded-md border border-sand overflow-hidden"
      style={{ background: '#dde9ef' /* soft ocean blue */ }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto block"
        role="group"
        aria-label="World continent picker"
      >
        <defs>
          <filter id="wmp-shadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0" dy="0.4" stdDeviation="0.5" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Latitude graticule — equator + tropics + 60° lines, very faint
            so the picker reads as a map without competing with the country
            silhouettes. */}
        {[0, 23.5, -23.5, 60, -60].map(lat => {
          const y = ((85 - lat) / 170) * VIEWBOX_H;
          return (
            <line
              key={lat}
              x1={0}
              y1={y}
              x2={VIEWBOX_W}
              y2={y}
              stroke="white"
              strokeOpacity={lat === 0 ? 0.32 : 0.18}
              strokeWidth={0.4}
              strokeDasharray={lat === 0 ? undefined : '1,2'}
            />
          );
        })}

        {/* All countries — colored by selection state. Inline fills
            instead of Tailwind classes because Tailwind class generation
            from string-built className expressions doesn't always survive
            production purge, and the previous render came out invisible
            (cream-soft on sky-blue had ~zero contrast). Land tone is a
            warm parchment that reads clearly on the ocean blue.
            fillRule evenodd handles polygons-with-holes (e.g. Lesotho
            inside South Africa) cleanly. */}
        {renderedCountries.map(c => (
          <path
            key={c.iso3 || c.name}
            d={c.d}
            fillRule="evenodd"
            onClick={() => onToggle(c.continent)}
            aria-label={`${c.name} (${c.continent})`}
            fill={c.isSelected ? '#1c1b19' /* ink-deep */ : '#f3eddd' /* warm parchment */}
            stroke={c.isSelected ? '#faf9f7' /* cream-soft */ : '#9b8b6a' /* warm sand-brown */}
            strokeWidth={c.isSelected ? 0.4 : 0.35}
            className="cursor-pointer transition-colors"
            style={{
              transition: 'fill 120ms ease',
            }}
            filter="url(#wmp-shadow)"
          />
        ))}
      </svg>

      {/* Chip row beneath the map — alternate input path. Tap the named
          continent if you'd rather not poke at the map. Tracks the same
          selection set so map clicks and chip clicks stay in sync. */}
      <div className="flex flex-wrap gap-1 p-1.5 bg-white border-t border-sand">
        {CONTINENTS_IN_PICKER.map(c => {
          const active = selected.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => onToggle(c)}
              className={
                'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ' +
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
