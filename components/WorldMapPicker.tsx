'use client';

import { useMemo } from 'react';
import type { Continent } from './CityFiltersContext';

// === WorldMapPicker ========================================================
// Pictorial multi-select for continent filtering. Renders 6 stylised
// continent silhouettes positioned roughly correctly on a world map.
// Click a continent to toggle.
//
// Why hand-drawn silhouettes (not full country GeoJSON):
//   - Earlier attempts to fetch / inline the Natural Earth country dataset
//     consistently failed to render the country paths in the deployed app
//     (cause not yet pinned down — possibly a JSON-import + JIT-purge
//     interaction in the production bundle). The picker showed only the
//     ocean.
//   - For a sidebar widget, country-level granularity is overkill anyway.
//     What the user needs is "click on Asia to add Asia" — they don't
//     need to be able to click on Bhutan specifically.
//   - 6 inline paths render reliably with no async dependencies, no
//     bundler quirks, no fetch failures.
//
// Each path is a soft-edged silhouette traced over a Mercator-projected
// outline at low resolution. Recognisable enough that the user reads
// "world map" at a glance, simple enough to render fast and look clean.
// ViewBox 0..360 wide, 0..170 tall (matches the equirectangular layout
// users expect from a world map).

type Props = {
  selected: Set<Continent>;
  onToggle: (continent: Continent) => void;
};

const CONTINENTS: Array<{
  name: Continent;
  /** SVG path. Smooth bezier curves traced over a real continent outline
   *  at picker resolution. Anchored on a 360x170 viewBox. */
  d: string;
  /** Label position inside the silhouette. */
  labelX: number;
  labelY: number;
}> = [
  {
    name: 'North America',
    // Alaska + Canada arch + USA + Mexico + Florida tail.
    d:
      'M 25,38 ' +
      'C 18,32 22,22 35,20 ' +
      'C 60,16 88,18 110,24 ' +
      'C 125,28 135,38 132,52 ' +
      'C 128,62 118,68 110,72 ' +
      'C 105,76 100,82 102,90 ' +
      'C 100,93 95,92 92,88 ' +
      'C 88,82 85,78 80,76 ' +
      'C 70,72 60,66 52,58 ' +
      'C 42,50 32,46 25,38 Z',
    labelX: 70,
    labelY: 50,
  },
  {
    name: 'South America',
    // Pyramid shape with a Patagonia tail. Anchored under Central America.
    d:
      'M 100,90 ' +
      'C 110,88 120,92 122,100 ' +
      'C 125,112 122,128 116,142 ' +
      'C 110,156 102,160 96,154 ' +
      'C 90,144 86,128 88,112 ' +
      'C 90,100 94,92 100,90 Z',
    labelX: 105,
    labelY: 122,
  },
  {
    name: 'Europe',
    // Compact blob with British Isles nub on the west side. Above Africa.
    d:
      'M 168,30 ' +
      'C 175,24 192,24 205,28 ' +
      'C 215,32 218,42 212,50 ' +
      'C 205,56 192,58 180,54 ' +
      'C 170,52 162,42 168,30 Z',
    labelX: 188,
    labelY: 42,
  },
  {
    name: 'Africa',
    // Large rounded triangle, narrowing to the cape.
    d:
      'M 168,60 ' +
      'C 180,56 210,56 222,62 ' +
      'C 232,72 230,90 222,108 ' +
      'C 215,124 205,140 195,148 ' +
      'C 185,150 178,140 172,124 ' +
      'C 165,108 162,82 168,60 Z',
    labelX: 196,
    labelY: 100,
  },
  {
    name: 'Asia',
    // Massive sweep across the top-right with India peninsula and SE arc.
    d:
      'M 215,28 ' +
      'C 235,22 270,20 300,22 ' +
      'C 325,24 345,32 348,46 ' +
      'C 348,60 335,72 320,78 ' +
      'C 310,82 295,82 285,80 ' +
      // India peninsula
      'C 282,84 278,92 274,88 ' +
      'C 270,82 268,74 262,72 ' +
      'C 245,70 230,64 220,54 ' +
      'C 212,46 210,36 215,28 Z',
    labelX: 290,
    labelY: 50,
  },
  {
    name: 'Australia',
    // Compact rounded oval bottom-right.
    d:
      'M 290,128 ' +
      'C 300,124 322,124 332,130 ' +
      'C 340,138 338,150 328,156 ' +
      'C 315,160 298,158 290,150 ' +
      'C 285,142 285,134 290,128 Z',
    labelX: 312,
    labelY: 142,
  },
];

export default function WorldMapPicker({ selected, onToggle }: Props) {
  const renderedContinents = useMemo(
    () => CONTINENTS.map(c => ({ ...c, isSelected: selected.has(c.name) })),
    [selected]
  );

  return (
    <div
      className="rounded-md border border-sand overflow-hidden"
      style={{ background: '#dde9ef' /* soft ocean blue */ }}
    >
      <svg
        viewBox="0 0 360 170"
        className="w-full h-auto block"
        role="group"
        aria-label="World continent picker"
      >
        <defs>
          <filter id="wmp-shadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="0.6" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Latitude graticule — equator + tropics + 60° lines. Faint
            so the picker reads as a map, not an illustration. */}
        {[0, 23.5, -23.5, 60, -60].map(lat => {
          const y = ((85 - lat) / 170) * 170;
          return (
            <line
              key={lat}
              x1={0}
              y1={y}
              x2={360}
              y2={y}
              stroke="white"
              strokeOpacity={lat === 0 ? 0.4 : 0.22}
              strokeWidth={0.5}
              strokeDasharray={lat === 0 ? undefined : '2,3'}
            />
          );
        })}

        {/* Continent silhouettes — high contrast (warm tan land on cool
            ocean blue) so they read clearly in any light mode. Inline
            fill/stroke values dodge any Tailwind-purge surprises. */}
        {renderedContinents.map(c => (
          <g
            key={c.name}
            role="button"
            tabIndex={0}
            aria-pressed={c.isSelected}
            aria-label={c.name}
            onClick={() => onToggle(c.name)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(c.name);
              }
            }}
            className="cursor-pointer"
            filter="url(#wmp-shadow)"
          >
            <path
              d={c.d}
              fill={c.isSelected ? '#1c1b19' : '#d4be8e' /* warm tan parchment */}
              stroke={c.isSelected ? '#faf9f7' : '#7a6440' /* dark tan border */}
              strokeWidth={0.7}
              strokeLinejoin="round"
            />
            <text
              x={c.labelX}
              y={c.labelY}
              textAnchor="middle"
              fontSize={c.name === 'Europe' || c.name === 'Australia' ? 7.5 : 9}
              fontWeight={500}
              fill={c.isSelected ? '#faf9f7' : '#3a2f1c'}
              style={{ pointerEvents: 'none', letterSpacing: '0.04em' }}
            >
              {c.name}
            </text>
          </g>
        ))}
      </svg>

      {/* Chip row beneath — alternate input path. Tap by name if you'd
          rather not poke at the small silhouettes. Tracks the same set. */}
      <div className="flex flex-wrap gap-1 p-1.5 bg-white border-t border-sand">
        {CONTINENTS.map(c => {
          const active = selected.has(c.name);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onToggle(c.name)}
              className={
                'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ' +
                (active
                  ? 'bg-ink-deep text-cream-soft'
                  : 'bg-cream-soft text-slate hover:bg-cream hover:text-ink-deep')
              }
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
