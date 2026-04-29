'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCityFilters, toggleSet, SortKey } from './CityFiltersContext';
import type {
  VisaUs,
  TapWater,
  DriveSide,
  CityLayer,
  HasSaved,
} from './CityFiltersContext';
import WorldMapPicker from './WorldMapPicker';
import ClimatePicker from './ClimatePicker';
import PopulationRangeSlider from './PopulationRangeSlider';

// === FilterPanel ===
// Cockpit layout, top to bottom:
//
//   1. SEARCH         — text first; short-circuits everything else.
//   2. LAYERS         — visibility toggles (encoding, NOT narrowing). Each
//                       layer has a color swatch and a live count of how
//                       many cities currently fall in it within the
//                       narrowed set. This is the cockpit's signal that
//                       Been/Go/Saved are *what you see colored*, not
//                       *what you filter to*.
//   3. FILTERS        — the actual narrowing facets (geography, climate,
//                       practicality, population). These compose with AND
//                       and contribute to activeFilterCount.
//   4. SORT           — last, because once you've scoped you order the rest.
//   5. RESULT FOOTER  — sticky at the bottom: "X / Y cities" + Clear (N).
//
// The split lines up with how the data UI literature recommends decomposing
// "filters" — visibility/encoding live separately from narrowing/inclusion
// (Munzner, "Visualization Analysis & Design", ch. 13; see also Square's
// CrossFilter pattern).

// CONTINENTS + KOPPEN_GROUPS arrays are gone — the pictorial pickers
// (ContinentPicker, ClimatePicker) own their own option lists now since
// each option carries pictorial metadata (continent paths, Köppen icons)
// that doesn't fit a generic ChipGroup option shape.
const VISA_OPTIONS: { value: VisaUs; label: string }[] = [
  { value: 'Visa-free', label: 'Visa-free' },
  { value: 'eVisa', label: 'eVisa' },
  { value: 'On arrival', label: 'On arrival' },
  { value: 'Required', label: 'Required' },
];

const TAP_WATER_OPTIONS: { value: TapWater; label: string }[] = [
  { value: 'Safe', label: 'Safe' },
  { value: 'Treat first', label: 'Treat first' },
  { value: 'Not safe', label: 'Not safe' },
];

const SORT_FIELDS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'population', label: 'Population' },
  { value: 'founded', label: 'Founded' },
  { value: 'avgHigh', label: 'Hottest' },
  { value: 'avgLow', label: 'Coldest' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'rainfall', label: 'Rainfall' },
];

// Status focus options — single-select segmented control. Order is
// the user's journey: Researching → Planning → Visited. Each has a
// dot color matching the map encoding so the cockpit reads as a key
// for the map.
const STATUS_OPTIONS: { value: CityLayer; label: string; swatch: string }[] = [
  { value: 'researching', label: 'Researching', swatch: 'bg-sand' },
  { value: 'planning',    label: 'Planning',    swatch: 'bg-slate' },
  { value: 'visited',     label: 'Visited',     swatch: 'bg-teal' },
];

export default function FilterPanel({
  countryOptions = [],
}: {
  countryOptions?: string[];
}) {
  const ctx = useCityFilters();
  if (!ctx) return null; // Provider not mounted — safe no-op
  const { state, setState, reset, activeFilterCount, resultCount, totalCount, layerCounts } = ctx;

  const dirty = activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* === COCKPIT HEADER ===
          Live result count on the left, prominent "Clear all" on the right.
          The button is the canonical escape hatch — visible from every
          scroll position because the cockpit header pins to the top of
          the panel. When nothing's filtered the button stays visible but
          dims to muted so the affordance is still discoverable, just not
          shouting. */}
      <div className="flex items-center justify-between gap-2 -mx-1 px-1 py-1.5 border-b border-sand">
        <div className="text-[11px] text-muted">
          {resultCount != null && totalCount != null ? (
            <>
              <span className="text-ink-deep font-medium tabular-nums">{resultCount}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{totalCount}</span>
              <span className="ml-1">cities</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!dirty}
          className={
            'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ' +
            (dirty
              ? 'text-ink-deep border-sand hover:border-slate hover:bg-cream-soft'
              : 'text-muted/60 border-transparent cursor-not-allowed')
          }
          aria-label="Clear all filters"
          title="Clear all filters and reset layers"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Clear all{dirty ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {/* === SEARCH === */}
      <div>
        <SectionLabel>Search</SectionLabel>
        <SearchInput
          value={state.q}
          onChange={q => setState(s => ({ ...s, q }))}
          placeholder="City or country"
        />
      </div>

      {/* === STATUS FOCUS ===
          Single-select segmented control: Researching → Planning →
          Visited. Click a segment to narrow the atlas to that status;
          click the active segment to clear (back to all-visible).
          Replaces the previous 3-toggle Layers section — easier to
          reason about and matches how users actually browse. */}
      <div>
        <SectionLabel>Status focus</SectionLabel>
        <div className="grid grid-cols-3 gap-1">
          {STATUS_OPTIONS.map(s => {
            const active = state.statusFocus === s.value;
            const count = layerCounts?.[s.value];
            return (
              <button
                key={s.value}
                type="button"
                onClick={() =>
                  setState(prev => ({
                    ...prev,
                    statusFocus: prev.statusFocus === s.value ? null : s.value,
                  }))
                }
                aria-pressed={active}
                className={
                  'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md ' +
                  'border transition-colors ' +
                  (active
                    ? 'bg-ink-deep border-ink-deep text-cream-soft'
                    : 'bg-white border-sand text-slate hover:border-slate hover:text-ink-deep')
                }
              >
                <span aria-hidden className={'inline-block w-2 h-2 rounded-full ' + s.swatch} />
                <span className="text-[10px] font-medium leading-none">{s.label}</span>
                {count != null && (
                  <span className={'text-[9px] tabular-nums ' + (active ? 'text-cream-soft/80' : 'text-muted')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {state.statusFocus && (
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, statusFocus: null }))}
            className="mt-1 text-[10px] text-slate hover:text-ink-deep"
          >
            Show all statuses
          </button>
        )}
      </div>

      {/* === FILTERS — narrowing facets === */}
      {countryOptions.length > 0 && (
        <div>
          <SectionLabel>Country</SectionLabel>
          <SearchableMultiSelect
            placeholder="Search countries"
            options={countryOptions}
            selected={state.countries}
            onToggle={v =>
              setState(s => ({ ...s, countries: toggleSet(s.countries, v) }))
            }
            onClear={() => setState(s => ({ ...s, countries: new Set() }))}
          />
        </div>
      )}

      <div>
        <SectionLabel>Continent</SectionLabel>
        <WorldMapPicker
          selected={state.continents}
          onToggle={v =>
            setState(s => ({ ...s, continents: toggleSet(s.continents, v) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Climate</SectionLabel>
        <ClimatePicker
          selected={state.koppenGroups}
          onToggle={v =>
            setState(s => ({ ...s, koppenGroups: toggleSet(s.koppenGroups, v) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Visa (US passport)</SectionLabel>
        <ChipGroup
          options={VISA_OPTIONS}
          selected={state.visa}
          onToggle={v => setState(s => ({ ...s, visa: toggleSet(s.visa, v as VisaUs) }))}
        />
      </div>

      <div>
        <SectionLabel>Tap water</SectionLabel>
        <ChipGroup
          options={TAP_WATER_OPTIONS}
          selected={state.tapWater}
          onToggle={v =>
            setState(s => ({ ...s, tapWater: toggleSet(s.tapWater, v as TapWater) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Drive side</SectionLabel>
        <ChipGroup
          options={[
            { value: 'L', label: 'Left' },
            { value: 'R', label: 'Right' },
          ]}
          selected={state.drive}
          onToggle={v =>
            setState(s => ({ ...s, drive: toggleSet(s.drive, v as DriveSide) }))
          }
        />
      </div>

      {/* Saved places — tri-state. 'Any' is the neutral default; toggling
          'With' or 'Without' narrows the dataset. The accent gold ring
          on the map shows saved-places cities even when the filter is
          'Any', so users can spot them visually without narrowing. */}
      <div>
        <SectionLabel>Saved places</SectionLabel>
        <SingleSelectChips<HasSaved>
          options={[
            { value: 'any',     label: 'Any' },
            { value: 'with',    label: 'With' },
            { value: 'without', label: 'Without' },
          ]}
          value={state.hasSavedPlaces}
          onChange={v => setState(s => ({ ...s, hasSavedPlaces: v }))}
        />
      </div>

      {/* Population — dual-thumb log-scale slider. Replaces the old
          number-input pair (typing "5000000" was awkward) and the linear
          chip jumps that spanned 4 orders of magnitude. Quick-pick chips
          live under the slider for snap-to-band shortcuts. */}
      <div>
        <SectionLabel>Population</SectionLabel>
        <PopulationRangeSlider
          min={state.populationMin}
          max={state.populationMax}
          onChange={({ min, max }) =>
            setState(s => ({ ...s, populationMin: min, populationMax: max }))
          }
        />
      </div>

      {/* === SORT === */}
      <div>
        <SectionLabel>Sort by</SectionLabel>
        <Select
          value={state.sort}
          onChange={v => setState(s => ({ ...s, sort: v as SortKey }))}
          options={SORT_FIELDS}
        />
        <div className="mt-2 inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
          <DirectionButton
            active={!state.desc}
            onClick={() => setState(s => ({ ...s, desc: false }))}
            label={ascendingLabel(state.sort)}
          />
          <DirectionButton
            active={state.desc}
            onClick={() => setState(s => ({ ...s, desc: true }))}
            label={descendingLabel(state.sort)}
          />
        </div>
      </div>

    </div>
  );
}

// === Helpers: human-friendly direction labels per sort field ===
function ascendingLabel(sort: SortKey): string {
  switch (sort) {
    case 'name':       return 'A → Z';
    case 'founded':    return 'Oldest';
    case 'population': return 'Smallest';
    case 'avgHigh':
    case 'avgLow':     return 'Coolest';
    case 'elevation':  return 'Lowest';
    case 'rainfall':   return 'Driest';
    default:           return 'Asc';
  }
}
function descendingLabel(sort: SortKey): string {
  switch (sort) {
    case 'name':       return 'Z → A';
    case 'founded':    return 'Newest';
    case 'population': return 'Largest';
    case 'avgHigh':
    case 'avgLow':     return 'Hottest';
    case 'elevation':  return 'Highest';
    case 'rainfall':   return 'Wettest';
    default:           return 'Desc';
  }
}

// =================== Shared shadcn-style primitives ===================

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] font-medium mb-2 px-0.5 flex items-baseline justify-between gap-2">
      <span className="text-muted">{children}</span>
      {hint && (
        <span className="text-[9px] text-accent normal-case tracking-normal font-normal">
          {hint}
        </span>
      )}
    </div>
  );
}

// === LayerRow ===
// One layer toggle. Color swatch + label + count pill + iOS-style switch.
// Inert click on the color swatch is intentional — only the toggle changes
// state, the swatch is just a visual sample of the on-map color.
function LayerRow({
  label,
  swatchClass,
  count,
  on,
  onChange,
}: {
  label: string;
  swatchClass: string;
  count: number | undefined;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={
        'flex items-center justify-between gap-2 cursor-pointer select-none px-1 py-1 rounded hover:bg-cream-soft ' +
        (on ? '' : 'opacity-60')
      }
    >
      <span className="flex items-center gap-2 min-w-0">
        <span aria-hidden className={'inline-block w-3 h-3 rounded-full flex-shrink-0 ' + swatchClass} />
        <span className="text-small text-ink truncate">{label}</span>
        {count != null && (
          <span className="text-[10px] tabular-nums text-muted">{count}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? 'Hide' : 'Show'} ${label}`}
        onClick={() => onChange(!on)}
        className={
          'relative inline-block w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ' +
          (on ? 'bg-ink-deep' : 'bg-sand')
        }
      >
        <span
          aria-hidden
          className={
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ' +
            (on ? 'translate-x-4' : 'translate-x-0')
          }
        />
      </button>
    </label>
  );
}

// shadcn-style search input.
function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-2.5 py-2 text-small rounded-md border border-sand bg-white text-ink placeholder:text-muted/70 focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10"
      />
    </div>
  );
}

// Single-select segmented chips — for tri-state facets like Saved places
// where the options are mutually exclusive (Any / With / Without). Same
// visual style as ChipGroup but only one chip can be active at a time.
function SingleSelectChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              'px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ' +
              (active
                ? 'bg-ink-deep text-cream-soft border-ink-deep'
                : 'bg-white text-slate border-sand hover:border-slate hover:text-ink-deep')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const active = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={
              'px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ' +
              (active
                ? 'bg-ink-deep text-cream-soft border-ink-deep'
                : 'bg-white text-slate border-sand hover:border-slate hover:text-ink-deep')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full pl-2.5 pr-8 py-1.5 text-small rounded-md border border-sand bg-white text-ink-deep focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 appearance-none cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

// (NumberInput removed — PopulationRangeSlider replaced the only call site.)

function DirectionButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ' +
        (active ? 'bg-cream-soft text-ink-deep' : 'text-slate hover:text-ink-deep')
      }
    >
      {label}
    </button>
  );
}

// === SearchableMultiSelect ===
function SearchableMultiSelect({
  placeholder,
  options,
  selected,
  onToggle,
  onClear,
}: {
  placeholder: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.trim().toLowerCase();
    return options.filter(o => o.toLowerCase().includes(needle));
  }, [options, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-small ' +
          'rounded-md border border-sand bg-white text-ink-deep ' +
          'focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 ' +
          'hover:border-slate transition-colors'
        }
        aria-expanded={open}
      >
        <span className="truncate">
          {selected.size === 0 ? (
            <span className="text-muted">{placeholder}</span>
          ) : (
            <span>{selected.size} selected</span>
          )}
        </span>
        <span aria-hidden className="text-muted text-[10px]">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-sand rounded-md shadow-card overflow-hidden">
          <div className="p-2 border-b border-sand">
            <input
              type="search"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-small rounded border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-[11px] text-muted">No matches.</li>
            )}
            {filtered.map(o => {
              const checked = selected.has(o);
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => onToggle(o)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left hover:bg-cream-soft transition-colors"
                  >
                    <span
                      aria-hidden
                      className={
                        'inline-flex items-center justify-center w-3.5 h-3.5 rounded border ' +
                        (checked ? 'bg-ink-deep border-ink-deep text-white' : 'border-sand bg-white')
                      }
                    >
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-ink-deep">{o}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.size > 0 && (
            <div className="border-t border-sand p-1.5 flex justify-between items-center text-[11px]">
              <span className="text-muted px-1">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setQ('');
                }}
                className="px-2 py-1 rounded hover:bg-cream-soft text-ink-deep"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
