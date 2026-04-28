'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Continent } from './CityFiltersContext';

// === WorldMapPicker ========================================================
// Pictorial multi-select for continent filtering, rendered as a real world
// map. Replaces the hand-drawn ContinentPicker — which read as amateur
// blob-shapes because, well, that's what they were. This one fetches the
// same Natural-Earth-derived country GeoJSON we already use on
// /countries/map, renders each country as an inline SVG path projected
// equirectangularly, and lets the user click any country to toggle
// inclusion of that country's continent.
//
// Why fetch the GeoJSON instead of inlining hand-drawn paths:
//   - Real geography just reads as a real map; users immediately know
//     "click on Asia." Hand-drawn polygons read as a UI gimmick.
//   - The dataset is already cached after the user visits /countries/map
//     so the second-load cost is zero. First-load is ~2.5MB but the file
//     is on a public CDN with long cache headers.
//   - Same visual language as the country globe — the cockpit reads as
//     a small version of the main view, not a separate decorative widget.
//
// Performance — the fetch + SVG render takes a beat on first use. We
// gate on a tiny skeleton until the data lands so the panel doesn't
// jump. Subsequent mounts read from a module-level cache.

const GEOJSON_URL =
  'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson';

// Module-level singleton — shared across all WorldMapPicker instances and
// the lifetime of the page. The browser HTTP cache de-dupes across
// tabs/visits.
let cachedGeoJSON: GeoJSON | null = null;
let pendingGeoJSON: Promise<GeoJSON> | null = null;

type GeoJSON = {
  features: Array<{
    properties: Record<string, unknown>;
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
};

type Props = {
  /** ISO3 → continent name. Built server-side from Notion country data
   *  and threaded through the SidebarShell. Without this mapping we
   *  can't tell which continent a clicked country belongs to. */
  iso3ToContinent: Record<string, Continent>;
  /** Currently-selected continents. */
  selected: Set<Continent>;
  /** Click a country → call this with that country's continent. */
  onToggle: (continent: Continent) => void;
};

// Project [lng, lat] → [x, y] in a 0..VIEWBOX_W × 0..VIEWBOX_H frame
// using equirectangular (the simplest, most legible projection at
// picker scale; preserves the rectangular grid users expect from a
// world map at a glance).
const VIEWBOX_W = 360;
const VIEWBOX_H = 170; // a touch shorter than 180 to crop the empty Antarctic strip
const project = (lng: number, lat: number): [number, number] => [
  ((lng + 180) / 360) * VIEWBOX_W,
  ((85 - lat) / 170) * VIEWBOX_H, // crop ±85° so polar regions don't waste vertical space
];

// Convert one Polygon's rings (each is an array of [lng,lat] pairs) into
// a single SVG path string. Holes (subsequent rings) are ALSO drawn —
// SVG fill-rule="evenodd" carves them out cleanly when applied.
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

function geometryToPath(geom: GeoJSON['features'][number]['geometry']): string {
  if (geom.type === 'Polygon') {
    return ringsToPath(geom.coordinates as number[][][]);
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .map(poly => ringsToPath(poly))
      .join(' ');
  }
  return '';
}

export default function WorldMapPicker({
  iso3ToContinent,
  selected,
  onToggle,
}: Props) {
  const [data, setData] = useState<GeoJSON | null>(cachedGeoJSON);

  useEffect(() => {
    if (cachedGeoJSON) return;
    if (!pendingGeoJSON) {
      pendingGeoJSON = fetch(GEOJSON_URL)
        .then(r => r.json())
        .then((g: GeoJSON) => {
          cachedGeoJSON = g;
          return g;
        });
    }
    pendingGeoJSON.then(g => setData(g)).catch(() => {});
  }, []);

  // Pre-build per-country render data — path + continent attribution.
  // Memoized over data so we only re-walk the GeoJSON when it actually
  // changes (i.e. once, on first load).
  const countries = useMemo(() => {
    if (!data) return [] as Array<{
      iso3: string;
      name: string;
      continent: Continent | null;
      d: string;
    }>;
    return data.features
      .map(f => {
        const iso3 = String(f.properties['ISO3166-1-Alpha-3'] ?? '').toUpperCase();
        const name = String(f.properties['name'] ?? f.properties['ADMIN'] ?? iso3);
        const continent = iso3ToContinent[iso3] ?? null;
        const d = geometryToPath(f.geometry);
        return { iso3, name, continent, d };
      })
      .filter(c => c.d);
  }, [data, iso3ToContinent]);

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
          {/* Subtle drop shadow gives continents a tiny lift off the
              ocean. Kept very soft so it doesn't overwhelm the map. */}
          <filter id="wmp-shadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0" dy="0.4" stdDeviation="0.5" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Latitude graticule — a few faint lines so the picker reads
            as a map, not a flat illustration. Equator + tropics lines. */}
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

        {data == null ? (
          // Skeleton while the GeoJSON is in flight. Centred shimmer of
          // continent-shaped placeholders.
          <g className="animate-pulse">
            <rect x={20} y={28} width={110} height={55} rx={8} fill="#cbd9e0" />
            <rect x={100} y={90} width={45} height={60} rx={10} fill="#cbd9e0" />
            <rect x={170} y={32} width={45} height={28} rx={5} fill="#cbd9e0" />
            <rect x={170} y={62} width={55} height={70} rx={10} fill="#cbd9e0" />
            <rect x={210} y={28} width={130} height={60} rx={10} fill="#cbd9e0" />
            <rect x={290} y={108} width={45} height={32} rx={8} fill="#cbd9e0" />
          </g>
        ) : (
          countries.map(c => {
            const inSelected = c.continent != null && selected.has(c.continent);
            const clickable = c.continent != null;
            return (
              <path
                key={c.iso3 || c.name}
                d={c.d}
                fillRule="evenodd"
                onClick={clickable ? () => onToggle(c.continent!) : undefined}
                aria-label={c.name}
                className={
                  (inSelected
                    ? 'fill-ink-deep stroke-cream-soft'
                    : 'fill-cream-soft stroke-ink-deep/30 hover:fill-cream') +
                  ' transition-colors ' +
                  (clickable ? 'cursor-pointer' : 'cursor-default')
                }
                strokeWidth={0.3}
                filter="url(#wmp-shadow)"
              />
            );
          })
        )}
      </svg>

      {/* Legend strip — a compact chip row showing the six continents,
          mirroring the map. Tapping a chip is the alternate input path
          for users who'd rather pick by name than poke at a small map.
          Selected chips track the same Set as the map paths. */}
      <div className="flex flex-wrap gap-1 p-1.5 bg-white border-t border-sand">
        {(
          [
            'Africa',
            'Asia',
            'Europe',
            'North America',
            'South America',
            'Australia',
          ] as Continent[]
        ).map(c => {
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
