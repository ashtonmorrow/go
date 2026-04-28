'use client';

import KoppenIcon from './KoppenIcon';
import type { KoppenGroup } from './CityFiltersContext';

// === ClimatePicker =========================================================
// Pictorial multi-select for the Climate facet. Each Köppen group renders
// as an icon button — palm tree (tropical), sun (arid), cloud-sun
// (temperate), cloud-snow (continental), snowflake (polar). Click toggles
// inclusion in the active set.
//
// Reuses KoppenIcon (already used on cards / table) so the visual
// language stays consistent across views — the same icon you see on a
// city's postcard is the icon you click in the filter cockpit.

type Props = {
  selected: Set<KoppenGroup>;
  onToggle: (group: KoppenGroup) => void;
};

const GROUPS: { value: KoppenGroup; label: string }[] = [
  { value: 'A', label: 'Tropical' },
  { value: 'B', label: 'Arid' },
  { value: 'C', label: 'Temperate' },
  { value: 'D', label: 'Continental' },
  { value: 'E', label: 'Polar' },
];

export default function ClimatePicker({ selected, onToggle }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {GROUPS.map(g => {
        const active = selected.has(g.value);
        return (
          <button
            key={g.value}
            type="button"
            onClick={() => onToggle(g.value)}
            aria-pressed={active}
            title={g.label}
            className={
              'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md ' +
              'border transition-colors ' +
              (active
                ? 'bg-ink-deep border-ink-deep text-cream-soft'
                : 'bg-white border-sand text-slate hover:border-slate hover:text-ink-deep')
            }
          >
            <KoppenIcon
              code={g.value}
              size={18}
              className={active ? 'text-cream-soft' : 'text-slate'}
            />
            <span className="text-[9px] font-medium leading-none">{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}
