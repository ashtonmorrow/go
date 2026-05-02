'use client';

// (useState/useRef/useMemo not needed at this scope anymore — the only
//  consumer was the SearchableMultiSelect we removed.)
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
  { value: 'curated', label: 'Most curated' },
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
        <div className="text-label text-muted">
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
            'inline-flex items-center gap-1 text-label px-2 py-1 rounded-md border transition-colors ' +
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

      {/* Search — text input matches city name, country, continent, climate,
          currency, language, founded, visa, tap-water and drive-side. The
          dedicated Country dropdown that used to sit below got folded in
          since typing a country name narrows the same way. */}
      <SearchInput
        value={state.q}
        onChange={q => setState(s => ({ ...s, q }))}
        placeholder="City or country"
      />

      {/* Sort — direction-only A→Z / Z→A toggle. Default sort is name.
          The richer field dropdown (Population, Founded, Hottest, etc.)
          moved out of the cockpit; those sorts are still reachable via
          the Table view's column headers. */}
      <div className="inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
        <DirectionButton
          active={!state.desc}
          onClick={() => setState(s => ({ ...s, sort: 'name', desc: false }))}
          label="A → Z"
        />
        <DirectionButton
          active={state.desc}
          onClick={() => setState(s => ({ ...s, sort: 'name', desc: true }))}
          label="Z → A"
        />
      </div>

      {/* Status — three buckets (Researching → Planning → Visited) plus
          an explicit "All" reset. Single segmented control, dropped the
          color swatches and live counts per cleanup pass — they read as
          noise next to the cleaner country panel which has been the
          design north star. The map / cards still color-code these
          statuses; the cockpit just narrows the visible set. */}
      <div>
        <SectionLabel>Status</SectionLabel>
        <div className="inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
          <DirectionButton
            active={state.statusFocus === null}
            onClick={() => setState(s => ({ ...s, statusFocus: null }))}
            label="All"
          />
          <DirectionButton
            active={state.statusFocus === 'visited'}
            onClick={() => setState(s => ({ ...s, statusFocus: 'visited' }))}
            label="Visited"
          />
          <DirectionButton
            active={state.statusFocus === 'planning'}
            onClick={() => setState(s => ({ ...s, statusFocus: 'planning' }))}
            label="Planning"
          />
          <DirectionButton
            active={state.statusFocus === 'researching'}
            onClick={() => setState(s => ({ ...s, statusFocus: 'researching' }))}
            label="Researching"
          />
        </div>
      </div>

      {/* Saved-places toggle — promoted out of the old tri-state into a
          single switch. "On" means narrow to cities with ≥1 saved place;
          "off" is the neutral default. The map's gold ring marker still
          surfaces saved cities visually regardless of this toggle. */}
      <div className="flex flex-col gap-0.5 -mx-1">
        <Switch
          on={state.hasSavedPlaces === 'with'}
          label="Has saved places"
          onChange={v => setState(s => ({ ...s, hasSavedPlaces: v ? 'with' : 'any' }))}
        />
      </div>

      {/* Continent picker — pictorial; label dropped because the world-map
          UI is self-documenting. */}
      <div>
        <WorldMapPicker
          selected={state.continents}
          onToggle={v =>
            setState(s => ({ ...s, continents: toggleSet(s.continents, v) }))
          }
        />
      </div>

      {/* Climate picker — Köppen icon group, label dropped for the same
          reason: the icons read as the section. */}
      <div>
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

      {/* Population — dual-thumb log-scale slider. Tucked at the bottom
          since most users don't reach for it, but kept available because
          the city set spans 4 orders of magnitude (Pyrgos at 4k people
          to Tokyo at 37M) and it's the cleanest narrowing tool when the
          user wants "big-city" or "small-town" trips. */}
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

    </div>
  );
}

// === Helpers: human-friendly direction labels per sort field ===
function ascendingLabel(sort: SortKey): string {
  switch (sort) {
    case 'curated':    return 'Most curated';
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
    case 'curated':    return 'Least curated';
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
    <div className="text-micro uppercase tracking-[0.14em] font-medium mb-2 px-0.5 flex items-baseline justify-between gap-2">
      <span className="text-muted">{children}</span>
      {hint && (
        <span className="text-micro text-accent normal-case tracking-normal font-normal">
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
          <span className="text-micro tabular-nums text-muted">{count}</span>
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
        'flex-1 px-2 py-1 rounded text-label font-medium transition-colors ' +
        (active ? 'bg-cream-soft text-ink-deep' : 'text-slate hover:text-ink-deep')
      }
    >
      {label}
    </button>
  );
}

// (SearchableMultiSelect removed — the country dropdown it powered was
//  consolidated into the top text Filter input. Both surfaces searched the
//  same field set; one is enough.)
