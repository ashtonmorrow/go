'use client';

import { useMemo } from 'react';
import type { Continent } from './CityFiltersContext';

// === WorldMapPicker ========================================================
// Pictorial multi-select for continent filtering. Renders each continent
// as a labeled tile in a 3x2 grid roughly mapped to the continent's
// position on a world map.
//
// Why a tile grid (not silhouettes / not real geography):
//   - Multiple silhouette and full-GeoJSON attempts repeatedly rendered
//     blank in the production build (cause was never pinned). Tiles
//     are HTML buttons — guaranteed to render in any browser. No SVG,
//     no path parsing, no bundler quirks.
//   - The job at picker scale is "click on Asia." Spatial recognition
//     comes from the grid layout (Asia top-right, Australia bottom-right,
//     Europe top-middle, etc.) — the user grasps the world-map metaphor
//     without needing pixel-accurate continent shapes.
//   - Tiles double as a clean visual hierarchy with the climate icon
//     buttons below (same shape language across the cockpit).

type Props = {
  selected: Set<Continent>;
  onToggle: (continent: Continent) => void;
};

// 3-column × 2-row grid. Each cell is positioned to roughly mirror the
// continent's place on a Mercator-projected world: NA/Europe/Asia top
// row; SA/Africa-Australia bottom row. Africa spans bottom-middle,
// pushed slightly right to acknowledge it sits east of South America.
const TILES: Array<{
  name: Continent;
  /** Single-character glyph used as a visual anchor inside the tile.
   *  Earth-rotation emojis are the most universal "this continent" shorthand
   *  available without shipping custom icons. */
  glyph: string;
  /** CSS grid column / row, 1-indexed, top-left origin. */
  col: number;
  row: number;
}> = [
  { name: 'North America',  glyph: '🌎', col: 1, row: 1 },
  { name: 'Europe',         glyph: '🏰', col: 2, row: 1 },
  { name: 'Asia',           glyph: '🐉', col: 3, row: 1 },
  { name: 'South America',  glyph: '🦙', col: 1, row: 2 },
  { name: 'Africa',         glyph: '🦒', col: 2, row: 2 },
  { name: 'Australia',      glyph: '🦘', col: 3, row: 2 },
];

export default function WorldMapPicker({ selected, onToggle }: Props) {
  const tiles = useMemo(
    () => TILES.map(t => ({ ...t, isSelected: selected.has(t.name) })),
    [selected]
  );

  return (
    <div className="rounded-md border border-sand bg-cream-soft p-1.5">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
        }}
      >
        {tiles.map(t => (
          <button
            key={t.name}
            type="button"
            onClick={() => onToggle(t.name)}
            aria-pressed={t.isSelected}
            title={t.name}
            style={{ gridColumn: t.col, gridRow: t.row }}
            className={
              'flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-md ' +
              'border transition-colors ' +
              (t.isSelected
                ? 'bg-ink-deep border-ink-deep text-cream-soft'
                : 'bg-white border-sand text-slate hover:border-slate hover:text-ink-deep')
            }
          >
            <span aria-hidden className="text-lg leading-none">{t.glyph}</span>
            <span className="text-[10px] font-medium leading-tight text-center">
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
