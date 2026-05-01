'use client';

import { useCountryFilters, toggleCountrySet, CountrySortKey } from './CountryFiltersContext';
import type {
  Continent,
  VisaUs,
  TapWater,
  DriveSide,
} from './CityFiltersContext';
import WorldMapPicker from './WorldMapPicker';

// === CountryFilterPanel ====================================================
// Cockpit UI for /countries/cards and /countries/table. Mirrors the
// FilterPanel + PinFilterPanel patterns (same shadcn primitives, same
// sticky-style result count / clear footer).
//
// Sections:
//   1. Search (name + capital)
//   2. Status — Been tri-state + Schengen toggle
//   3. Geography — Continent chips
//   4. Practicality — Visa, Tap water, Drive side chips
//   5. Sort — name / # cities / # visited

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

const SORT_FIELDS: { value: CountrySortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'cityCount', label: 'Cities in atlas' },
  { value: 'beenCount', label: 'Cities visited' },
];

export default function CountryFilterPanel() {
  const ctx = useCountryFilters();
  if (!ctx) return null;
  const { state, setState, reset, activeFilterCount, resultCount, totalCount } = ctx;

  const dirty = activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Cockpit header — Clear-all pinned at the top of the panel. */}
      <div className="flex items-center justify-between gap-2 -mx-1 px-1 py-1.5 border-b border-sand">
        <div className="text-label text-muted">
          {resultCount != null && totalCount != null ? (
            <>
              <span className="text-ink-deep font-medium tabular-nums">{resultCount}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{totalCount}</span>
              <span className="ml-1">countries</span>
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
            'inline-flex items-center gap-1 text-label px-2 py-1 rounded-md border transition-colors ' +
            (dirty
              ? 'text-ink-deep border-sand hover:border-slate hover:bg-cream-soft'
              : 'text-muted/60 border-transparent cursor-not-allowed')
          }
          aria-label="Clear all filters"
          title="Clear all filters"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Clear all{dirty ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div>
        <SectionLabel>Search</SectionLabel>
        <SearchInput
          value={state.q}
          onChange={q => setState(s => ({ ...s, q }))}
          placeholder="Country or capital"
        />
      </div>

      <div>
        <SectionLabel>Status</SectionLabel>
        <div className="flex flex-col gap-1.5">
          <TriState
            value={state.visitedFilter}
            onChange={v => setState(s => ({ ...s, visitedFilter: v }))}
            options={[
              { value: 'all',      label: 'All' },
              { value: 'been',     label: 'Been' },
              { value: 'not-been', label: 'Not yet' },
            ]}
          />
          <Switch
            on={state.schengenOnly}
            label="Schengen only"
            onChange={v => setState(s => ({ ...s, schengenOnly: v }))}
          />
          {/* Disputed = partially-recognized or unrecognized territories
              (Abkhazia, Northern Cyprus, Transnistria, Western Sahara,
              South Ossetia, Nagorno-Karabakh, Somaliland). Drives the
              go_countries.disputed flag; Kosovo / Taiwan / Palestine stay
              off until the user manually decides — those are politically
              loaded enough that an opinionated default would be wrong. */}
          <Switch
            on={state.disputedOnly}
            label="Disputed only"
            onChange={v => setState(s => ({ ...s, disputedOnly: v }))}
          />
        </div>
      </div>

      <div>
        <SectionLabel>Continent</SectionLabel>
        <WorldMapPicker
          selected={state.continents}
          onToggle={v =>
            setState(s => ({ ...s, continents: toggleCountrySet(s.continents, v) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Visa (US passport)</SectionLabel>
        <ChipGroup
          options={VISA_OPTIONS}
          selected={state.visa}
          onToggle={v =>
            setState(s => ({ ...s, visa: toggleCountrySet(s.visa, v as VisaUs) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Tap water</SectionLabel>
        <ChipGroup
          options={TAP_WATER_OPTIONS}
          selected={state.tapWater}
          onToggle={v =>
            setState(s => ({ ...s, tapWater: toggleCountrySet(s.tapWater, v as TapWater) }))
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
            setState(s => ({ ...s, drive: toggleCountrySet(s.drive, v as DriveSide) }))
          }
        />
      </div>

      <div>
        <SectionLabel>Sort by</SectionLabel>
        <Select
          value={state.sort}
          onChange={v => setState(s => ({ ...s, sort: v as CountrySortKey }))}
          options={SORT_FIELDS}
        />
        <div className="mt-2 inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
          <DirectionButton
            active={!state.desc}
            onClick={() => setState(s => ({ ...s, desc: false }))}
            label={state.sort === 'name' ? 'A → Z' : 'Fewest'}
          />
          <DirectionButton
            active={state.desc}
            onClick={() => setState(s => ({ ...s, desc: true }))}
            label={state.sort === 'name' ? 'Z → A' : 'Most'}
          />
        </div>
      </div>

    </div>
  );
}

// =================== shadcn-style primitives ===================
// Local copies of the primitives in FilterPanel / PinFilterPanel. Could
// be hoisted into a shared file later; for now, inlining keeps each
// cockpit self-contained.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-micro uppercase tracking-[0.14em] text-muted font-medium mb-2 px-0.5">
      {children}
    </div>
  );
}

function SearchInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden
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

function Switch({
  on, label, onChange,
}: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none px-1 py-0.5 rounded hover:bg-cream-soft">
      <span className="text-small text-ink">{label}</span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label}
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

function TriState<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'flex-1 px-2 py-1 rounded text-label font-medium transition-colors ' +
            (value === o.value
              ? 'bg-cream-soft text-ink-deep'
              : 'text-slate hover:text-ink-deep')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChipGroup<T extends string>({
  options, selected, onToggle,
}: {
  options: { value: T; label: string }[];
  selected: Set<T>; onToggle: (value: T) => void;
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
              'px-2 py-1 rounded-md text-label font-medium transition-colors border ' +
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
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void;
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

function DirectionButton({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 px-2 py-1 rounded text-label font-medium transition-colors ' +
        (active ? 'bg-cream-soft text-ink-deep' : 'text-slate hover:text-ink-deep')
      }
    >
      {label}
    </button>
  );
}
