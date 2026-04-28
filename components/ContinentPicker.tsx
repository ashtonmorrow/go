'use client';

import type { Continent } from './CityFiltersContext';

// === ContinentPicker =======================================================
// Pictorial multi-select for the Continent facet. Renders a stylized world
// map with each continent as a clickable region. Click toggles inclusion in
// the active set.
//
// Why pictorial:
//   - Spatial recognition is faster than reading labels — users find Asia
//     by looking right, not by reading.
//   - The selected/unselected visual encoding (filled vs outlined) gives
//     glanceable feedback on the map shape itself, not just on a chip.
//
// The continent paths are simplified silhouettes — recognizable but not
// cartographically accurate. The viewBox is 0 0 360 180 (2:1 like
// Mercator), so positions roughly correspond to where each continent
// sits on a world map. Antarctica is intentionally omitted from the
// picker because the FilterPanel only exposes the six populated
// continents (matches the existing CONTINENTS array).

type Props = {
  selected: Set<Continent>;
  onToggle: (continent: Continent) => void;
};

// Each entry: continent name, simplified outline path (or null for the
// ellipse/circle case), label position {x,y}, font size for the label.
// Hand-drawn approximations — clear enough to read as continents at a
// glance. Coordinate system 0..360 wide, 0..180 tall.
const CONTINENTS: {
  name: Continent;
  d: string;
  labelX: number;
  labelY: number;
  fontSize: number;
}[] = [
  {
    name: 'North America',
    // Alaska / Canada / US down to Mexico, with a Florida-ish tail.
    d:
      'M 25,42 L 45,30 L 80,28 L 110,35 L 120,52 L 105,68 L 95,75 L 85,80 ' +
      'L 80,90 L 75,95 L 68,92 L 62,85 L 50,75 L 40,62 L 30,50 Z',
    labelX: 70,
    labelY: 60,
    fontSize: 9,
  },
  {
    name: 'South America',
    // Pointing down, narrower at the bottom (Patagonia tail).
    d:
      'M 90,92 L 110,95 L 120,108 L 122,128 L 115,148 L 105,158 ' +
      'L 96,150 L 90,135 L 88,118 L 86,105 Z',
    labelX: 105,
    labelY: 125,
    fontSize: 9,
  },
  {
    name: 'Europe',
    // Compact blob north of Africa, with British-Isles-ish nub.
    d:
      'M 165,30 L 180,25 L 200,28 L 210,38 L 205,52 L 195,55 L 180,53 ' +
      'L 170,48 L 162,38 Z',
    labelX: 188,
    labelY: 42,
    fontSize: 8,
  },
  {
    name: 'Africa',
    // Wider top, narrowing to the cape.
    d:
      'M 165,60 L 220,58 L 230,75 L 225,95 L 218,120 L 208,140 L 195,148 ' +
      'L 182,140 L 175,120 L 170,100 L 165,80 Z',
    labelX: 198,
    labelY: 100,
    fontSize: 9,
  },
  {
    name: 'Asia',
    // Largest — sweeps across the top-right.
    d:
      'M 210,30 L 245,22 L 285,22 L 320,30 L 340,42 L 345,58 L 335,75 ' +
      'L 320,85 L 295,90 L 270,88 L 250,82 L 230,72 L 218,58 L 212,42 Z',
    labelX: 280,
    labelY: 55,
    fontSize: 10,
  },
  {
    name: 'Australia',
    // Compact oval bottom-right.
    d:
      'M 290,128 L 315,125 L 332,132 L 335,145 L 325,155 L 305,158 ' +
      'L 290,152 L 285,140 Z',
    labelX: 310,
    labelY: 142,
    fontSize: 8,
  },
];

export default function ContinentPicker({ selected, onToggle }: Props) {
  return (
    <div className="rounded-md border border-sand bg-white p-1.5">
      <svg
        viewBox="0 0 360 180"
        className="w-full h-auto"
        role="group"
        aria-label="Continent picker"
      >
        {/* Soft ocean background — keeps continent shapes legible without
            needing a hard outline of the whole map. */}
        <rect
          x={0}
          y={0}
          width={360}
          height={180}
          rx={4}
          className="fill-cream-soft"
        />
        {CONTINENTS.map(c => {
          const active = selected.has(c.name);
          return (
            <g
              key={c.name}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${c.name}${active ? ' — selected' : ''}`}
              onClick={() => onToggle(c.name)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(c.name);
                }
              }}
              className="cursor-pointer"
            >
              <path
                d={c.d}
                className={
                  active
                    ? 'fill-ink-deep stroke-ink-deep transition-colors'
                    : 'fill-sand stroke-slate hover:fill-cream stroke-1 transition-colors'
                }
                strokeWidth={1}
              />
              <text
                x={c.labelX}
                y={c.labelY}
                textAnchor="middle"
                fontSize={c.fontSize}
                className={
                  'select-none pointer-events-none font-medium ' +
                  (active ? 'fill-cream-soft' : 'fill-slate')
                }
                style={{
                  letterSpacing: '0.04em',
                }}
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
