'use client';

import { useCityFilters, toggleSet } from './CityFiltersContext';
import type { Continent, KoppenGroup, VisaUs, TapWater, DriveSide } from './CityFiltersContext';

// === ActiveFilters =========================================================
// Persistent breadcrumb of currently-active narrowing facets, rendered as
// removable chips. Same pattern as Notion / Airtable / Linear / GitHub
// search results pages — the user always sees what filters are in play
// and can pop any one off with a single click.
//
// Layer visibility (showBeen / showGo etc.) is intentionally NOT shown
// here. Layers have their own UI in the sidebar with color swatches —
// duplicating them as chips would clutter the ribbon and conflate two
// different mental models. The "Some statuses are hidden" hint in the
// LAYERS section header carries that signal instead.
//
// Renders nothing when no filters are active so the page chrome stays
// quiet on the default "everything visible" state.

const KOPPEN_LABELS: Record<KoppenGroup, string> = {
  A: 'Tropical',
  B: 'Arid',
  C: 'Temperate',
  D: 'Continental',
  E: 'Polar',
};

function formatPopulation(min: number | null, max: number | null): string {
  const fmt = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
      : n >= 1_000 ? (n / 1_000).toFixed(0) + 'k'
      : String(n);
  if (min != null && max != null) return `Pop: ${fmt(min)}–${fmt(max)}`;
  if (min != null) return `Pop: ≥ ${fmt(min)}`;
  if (max != null) return `Pop: ≤ ${fmt(max)}`;
  return 'Pop';
}

export default function ActiveFilters({
  className = '',
  showCount = true,
}: {
  className?: string;
  /** When false, suppress the "N / total" prefix. The countries map
   *  already shows a "63 countries" badge top-left, so the city count
   *  prefix would be a meaningless duplicate there. */
  showCount?: boolean;
}) {
  const ctx = useCityFilters();
  if (!ctx) return null;
  const { state, setState, reset, activeFilterCount, resultCount, totalCount } = ctx;

  if (activeFilterCount === 0) return null;

  // Build the chip list. Order mirrors the cockpit reading order so the
  // breadcrumb scans top-down for the user: search → countries →
  // continents → climate → visa → water → drive → population.
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (state.q.trim()) {
    chips.push({
      key: 'q',
      label: `"${state.q.trim()}"`,
      clear: () => setState(s => ({ ...s, q: '' })),
    });
  }
  if (state.statusFocus !== null) {
    const labels = { visited: 'Visited', planning: 'Planning', researching: 'Researching' } as const;
    chips.push({
      key: 'status',
      label: labels[state.statusFocus],
      clear: () => setState(s => ({ ...s, statusFocus: null })),
    });
  }
  for (const country of state.countries) {
    chips.push({
      key: `country:${country}`,
      label: country,
      clear: () => setState(s => ({ ...s, countries: toggleSet(s.countries, country) })),
    });
  }
  for (const continent of state.continents) {
    chips.push({
      key: `continent:${continent}`,
      label: continent,
      clear: () => setState(s => ({ ...s, continents: toggleSet(s.continents, continent as Continent) })),
    });
  }
  for (const k of state.koppenGroups) {
    chips.push({
      key: `koppen:${k}`,
      label: KOPPEN_LABELS[k] ?? k,
      clear: () => setState(s => ({ ...s, koppenGroups: toggleSet(s.koppenGroups, k as KoppenGroup) })),
    });
  }
  for (const v of state.visa) {
    chips.push({
      key: `visa:${v}`,
      label: `Visa: ${v}`,
      clear: () => setState(s => ({ ...s, visa: toggleSet(s.visa, v as VisaUs) })),
    });
  }
  for (const w of state.tapWater) {
    chips.push({
      key: `water:${w}`,
      label: `Water: ${w}`,
      clear: () => setState(s => ({ ...s, tapWater: toggleSet(s.tapWater, w as TapWater) })),
    });
  }
  for (const d of state.drive) {
    chips.push({
      key: `drive:${d}`,
      label: `Drive: ${d === 'L' ? 'left' : 'right'}`,
      clear: () => setState(s => ({ ...s, drive: toggleSet(s.drive, d as DriveSide) })),
    });
  }
  if (state.populationMin != null || state.populationMax != null) {
    chips.push({
      key: 'population',
      label: formatPopulation(state.populationMin, state.populationMax),
      clear: () => setState(s => ({ ...s, populationMin: null, populationMax: null })),
    });
  }
  if (state.hasSavedPlaces !== 'any') {
    chips.push({
      key: 'saved',
      label: state.hasSavedPlaces === 'with' ? 'With saved places' : 'No saved places',
      clear: () => setState(s => ({ ...s, hasSavedPlaces: 'any' })),
    });
  }

  return (
    <div className={'flex items-center gap-1.5 flex-wrap ' + className}>
      {/* Result count anchors the ribbon at the start so users see
          immediately how much their filters narrowed the set. */}
      {showCount && resultCount != null && totalCount != null && (
        <span className="text-label text-muted tabular-nums mr-1">
          <span className="text-ink-deep font-medium">{resultCount}</span>
          <span className="mx-1">/</span>
          <span>{totalCount}</span>
        </span>
      )}
      {chips.map(chip => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className={
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label ' +
            'bg-cream-soft border border-sand text-ink-deep ' +
            'hover:bg-cream hover:border-slate transition-colors'
          }
          title={`Remove ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span aria-hidden className="text-muted text-micro leading-none">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={reset}
        className="text-label text-slate hover:text-ink-deep underline-offset-2 hover:underline ml-1"
      >
        Clear all
      </button>
    </div>
  );
}
