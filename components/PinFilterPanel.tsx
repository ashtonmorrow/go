'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePinFilters, togglePinSet, PinSortKey } from './PinFiltersContext';
import { LIST_ICONS, LIST_SHORT_LABELS, type CanonicalList } from '@/lib/pinLists';
import YearRangeSlider from './YearRangeSlider';
import WorldMapPicker from './WorldMapPicker';
import type { Continent } from './CityFiltersContext';
import { BRING_FACET, bringFacet } from '@/lib/pinFacets';

// Curated-views pill row used to live here. It duplicated the boolean
// chips below (Reviewed, Free, Kid-friendly) and confused users — clicking
// "Reviewed" as a pill navigated away to /pins/views/reviewed while
// clicking "Reviewed" as a chip toggled the filter. Now the discoverable
// curated landings are surfaced via /pins/views (linkable from the page
// header) and the cockpit only shows filter controls.

// === PinFilterPanel ========================================================
// Cockpit UI for /pins. Mirrors the FilterPanel pattern from /cities so the
// sidebar feels consistent — same section labels, same shadcn primitives,
// same sticky reset / count footer.
//
// Sections (top → bottom):
//   1. SEARCH      — global text match against name + description
//   2. STATUS      — Visited tri-state + UNESCO-only switch
//   3. CATEGORY    — Cultural / Natural / Mixed chips
//   4. COUNTRY     — searchable multi-select (long list)
//   5. SORT        — name / recently updated, asc/desc
//   6. RESET + COUNT — clear-filters button next to "X / Y pins"

const SORT_FIELDS: { value: PinSortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Recently updated' },
];

export default function PinFilterPanel({
  countryOptions = [],
  categoryOptions = [],
  listOptions = [],
  tagOptions = [],
  savedListOptions = [],
}: {
  countryOptions?: string[];
  categoryOptions?: string[];
  listOptions?: string[];
  tagOptions?: string[];
  /** Mike's personal Google Maps saved-list names (Madrid, Bangkok, Coffee
   *  Shops, …). Sorted by member count desc upstream in Sidebar.tsx so the
   *  most-populated lists surface first. */
  savedListOptions?: string[];
}) {
  const ctx = usePinFilters();
  if (!ctx) return null;
  const { state, setState, reset, activeFilterCount, resultCount, totalCount } = ctx;

  const dirty = activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Cockpit header — pinned at the top of the panel. Live result
          count on the left, prominent "Clear all" on the right. */}
      <div className="flex items-center justify-between gap-2 -mx-1 px-1 py-1.5 border-b border-sand">
        <div className="text-label text-muted">
          {resultCount != null && totalCount != null ? (
            <>
              <span className="text-ink-deep font-medium tabular-nums">{resultCount}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{totalCount}</span>
              <span className="ml-1">pins</span>
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
          placeholder="Search…"
        />
      </div>

      <div>
        <SectionLabel>Status</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {/* Status labels match the city panel's "Visited / Planning / etc"
              vocabulary so the same word means the same thing on /pins
              and /cities. Pins don't have a Planning state today (that's a
              city concept), so we map "All" / "Visited" / "Unvisited". */}
          <TriState
            value={state.visitedFilter}
            onChange={v => setState(s => ({ ...s, visitedFilter: v }))}
            options={[
              { value: 'all',          label: 'All' },
              { value: 'visited',      label: 'Visited' },
              { value: 'not-visited',  label: 'Unvisited' },
            ]}
          />
          {/* Binary "show only places that…" filters as a single chip group.
              Click to add the filter, click again to clear. The UNESCO /
              Atlas Obscura / Michelin chips toggle membership in
              state.lists so they compose with the ON LISTS section below
              (clicking one of these is equivalent to picking it from
              that section, just surfaced up here for quick access). */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            <QuickFilterChip
              on={state.freeOnly}
              icon="◯"
              label="Free"
              onChange={v => setState(s => ({ ...s, freeOnly: v }))}
            />
            <QuickFilterChip
              on={state.foodOnSiteOnly}
              icon="🍽"
              label="Food"
              onChange={v => setState(s => ({ ...s, foodOnSiteOnly: v }))}
            />
            <QuickFilterChip
              on={state.wheelchairOnly}
              icon="♿"
              label="Accessible"
              onChange={v => setState(s => ({ ...s, wheelchairOnly: v }))}
            />
            <QuickFilterChip
              on={state.kidFriendlyOnly}
              icon="🧒"
              label="Kid-friendly"
              onChange={v => setState(s => ({ ...s, kidFriendlyOnly: v }))}
            />
            {/* Reviewed = Mike has actually written about this place. Distinct
                from the Visited tri-state above — Visited (1,400+) is the
                superset, Reviewed (~600) is the curated narrative subset. */}
            <QuickFilterChip
              on={state.reviewedOnly}
              icon="✍️"
              label="Reviewed"
              onChange={v => setState(s => ({ ...s, reviewedOnly: v }))}
            />
            {/* Canonical curation lists — UNESCO World Heritage, Atlas
                Obscura, Michelin Guide. These mirror the chips in the
                Lists section below; both routes write to the same
                state.lists Set so toggling either has the same effect.
                We keep the duplicates here because they're high-traffic
                "find something cool" filters that travelers expect at
                the top of a cockpit. */}
            <QuickFilterChip
              on={state.lists.has('UNESCO World Heritage')}
              icon="🌐"
              label="UNESCO"
              onChange={() =>
                setState(s => ({
                  ...s,
                  lists: togglePinSet(s.lists, 'UNESCO World Heritage'),
                }))
              }
            />
            <QuickFilterChip
              on={state.lists.has('Atlas Obscura')}
              icon="🧭"
              label="Atlas Obscura"
              onChange={() =>
                setState(s => ({
                  ...s,
                  lists: togglePinSet(s.lists, 'Atlas Obscura'),
                }))
              }
            />
            <QuickFilterChip
              on={state.lists.has('Michelin Guide')}
              icon="🍽️"
              label="Michelin"
              onChange={() =>
                setState(s => ({
                  ...s,
                  lists: togglePinSet(s.lists, 'Michelin Guide'),
                }))
              }
            />
            {/* "Mike's List" — pin is on at least one of Mike's saved
                collections. Different from My Lists multi-select below
                (which picks specific lists) — this is the catch-all
                "anything Mike has personally curated into a list."
                Future: also include pins linked from blog posts when
                posts grow a pin-link frontmatter field. */}
            <QuickFilterChip
              on={state.mikesListOnly}
              icon="🗂️"
              label="Mike's List"
              onChange={v => setState(s => ({ ...s, mikesListOnly: v }))}
            />
          </div>
        </div>
      </div>

      {/* Lists — UNESCO World Heritage, Atlas Obscura, the wonders sets,
          etc. Each chip carries the same canonical glyph (globe, compass,
          droplet…) the cards use, so the cockpit and the cards share a
          visual language. Short labels keep the chip row from wrapping
          past two rows. */}
      {listOptions.length > 0 && (
        <div>
          <SectionLabel>Lists</SectionLabel>
          <ListChipGroup
            options={listOptions}
            selected={state.lists}
            onToggle={v =>
              setState(s => ({ ...s, lists: togglePinSet(s.lists, v) }))
            }
          />
        </div>
      )}

      {/* Tags — Wikidata "instance of" labels. Long, granular — fits the
          searchable multi-select pattern better than chips. */}
      {tagOptions.length > 0 && (
        <div>
          <SectionLabel>Type</SectionLabel>
          <SearchableMultiSelect
            placeholder="Search types"
            options={tagOptions}
            selected={state.tags}
            onToggle={v => setState(s => ({ ...s, tags: togglePinSet(s.tags, v) }))}
            onClear={() => setState(s => ({ ...s, tags: new Set() }))}
          />
        </div>
      )}

      {/* Saved on my lists — Mike's personal Google Maps collections
          (Madrid, Bangkok, Coffee Shops, …) imported from Takeout. Long
          tail of ~230 list names, so a searchable multi-select is the
          right shape rather than a fixed chip group. OR semantics: pick
          "madrid" + "barcelona" → see everything across both lists. */}
      {savedListOptions.length > 0 && (
        <div>
          <SectionLabel>My lists</SectionLabel>
          <SearchableMultiSelect
            placeholder="Search my lists"
            options={savedListOptions}
            selected={state.savedLists}
            onToggle={v =>
              setState(s => ({ ...s, savedLists: togglePinSet(s.savedLists, v) }))
            }
            onClear={() => setState(s => ({ ...s, savedLists: new Set() }))}
          />
        </div>
      )}

      {/* Bring requirements as a popover multi-select — visually matches
          the My lists / Country / Saved-list controls above. Collapsed
          to one row by default; click to expand into a searchable
          checklist. Underlying chip group still rendered when expanded
          so existing behaviour is unchanged. */}
      <div>
        <SectionLabel>Bring</SectionLabel>
        <LabelledMultiSelect
          placeholder="Bring requirements"
          options={Object.keys(BRING_FACET).map(k => ({
            value: k,
            label: bringFacet(k).label,
          }))}
          selected={state.bring}
          onToggle={v =>
            setState(s => ({ ...s, bring: togglePinSet(s.bring, v) }))
          }
          onClear={() => setState(s => ({ ...s, bring: new Set() }))}
        />
      </div>

      <div>
        <SectionLabel>Established</SectionLabel>
        <YearRangeSlider
          min={state.inceptionMin}
          max={state.inceptionMax}
          onChange={({ min, max }) =>
            setState(s => ({ ...s, inceptionMin: min, inceptionMax: max }))
          }
        />
      </div>

      {categoryOptions.length > 0 && (
        <div>
          <SectionLabel>Category</SectionLabel>
          <ChipGroup
            options={categoryOptions.map(c => ({ value: c, label: c }))}
            selected={state.categories}
            onToggle={v =>
              setState(s => ({ ...s, categories: togglePinSet(s.categories, v) }))
            }
          />
        </div>
      )}

      {/* Continent — pictorial world map. Same component the cities and
          countries cockpits use; here the click resolves the pin's
          country to its continent via the baked Natural Earth lookup. */}
      <div>
        <SectionLabel>Continent</SectionLabel>
        <WorldMapPicker
          selected={state.continents}
          onToggle={(c: Continent) =>
            setState(s => ({ ...s, continents: togglePinSet(s.continents, c) }))
          }
        />
      </div>

      {countryOptions.length > 0 && (
        <div>
          <SectionLabel>Country</SectionLabel>
          <SearchableMultiSelect
            placeholder="Search countries"
            options={countryOptions}
            selected={state.countries}
            onToggle={v =>
              setState(s => ({ ...s, countries: togglePinSet(s.countries, v) }))
            }
            onClear={() => setState(s => ({ ...s, countries: new Set() }))}
          />
        </div>
      )}

      <div>
        <SectionLabel>Sort by</SectionLabel>
        <Select
          value={state.sort}
          onChange={v => setState(s => ({ ...s, sort: v as PinSortKey }))}
          options={SORT_FIELDS}
        />
        <div className="mt-2 inline-flex rounded-md border border-sand bg-white p-0.5 w-full">
          <DirectionButton
            active={!state.desc}
            onClick={() => setState(s => ({ ...s, desc: false }))}
            label={state.sort === 'name' ? 'A → Z' : 'Oldest'}
          />
          <DirectionButton
            active={state.desc}
            onClick={() => setState(s => ({ ...s, desc: true }))}
            label={state.sort === 'name' ? 'Z → A' : 'Newest'}
          />
        </div>
      </div>

    </div>
  );
}

// =================== shadcn-style primitives ===================

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

// === QuickFilterChip ===
// Single boolean filter rendered as a chip. Click to enable, click again to
// clear. Used for the quick "show only..." filters under Status (UNESCO,
// Free, Food, Accessible, Kid-friendly) — collapsing what used to be five
// stacked Switch toggles into one compact chip row.
function QuickFilterChip({
  on,
  icon,
  label,
  onChange,
}: {
  on: boolean;
  icon: string;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      title={label}
      aria-pressed={on}
      className={
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-label font-medium transition-colors border ' +
        (on
          ? 'bg-ink-deep text-cream-soft border-ink-deep'
          : 'bg-white text-slate border-sand hover:border-slate hover:text-ink-deep')
      }
    >
      <span aria-hidden className="text-small leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// === ListChipGroup ===
// Same shape as ChipGroup but each chip carries the canonical list's
// glyph + short label. The icons match what the cards/detail page show,
// so users decode "globe = UNESCO" once and apply it everywhere.
function ListChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const active = selected.has(o);
        const canonical = o as CanonicalList;
        const icon = LIST_ICONS[canonical];
        const label = LIST_SHORT_LABELS[canonical] ?? o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            title={o}
            className={
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-label font-medium transition-colors border ' +
              (active
                ? 'bg-ink-deep text-cream-soft border-ink-deep'
                : 'bg-white text-slate border-sand hover:border-slate hover:text-ink-deep')
            }
          >
            {icon && <span aria-hidden>{icon}</span>}
            <span>{label}</span>
          </button>
        );
      })}
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

function SearchableMultiSelect({
  placeholder, options, selected, onToggle, onClear,
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
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
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-small rounded-md border border-sand bg-white text-ink-deep focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 hover:border-slate transition-colors"
        aria-expanded={open}
      >
        <span className="truncate">
          {selected.size === 0
            ? <span className="text-muted">{placeholder}</span>
            : <span>{selected.size} selected</span>}
        </span>
        <span aria-hidden className="text-muted text-micro">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-sand rounded-md shadow-card overflow-hidden">
          <div className="p-2 border-b border-sand">
            <input
              type="search" autoFocus
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-small rounded border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-label text-muted">No matches.</li>
            )}
            {filtered.map(o => {
              const checked = selected.has(o);
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => onToggle(o)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-label text-left hover:bg-cream-soft transition-colors"
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
            <div className="border-t border-sand p-1.5 flex justify-between items-center text-label">
              <span className="text-muted px-1">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => { onClear(); setQ(''); }}
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

// === LabelledMultiSelect ====================================================
// Sibling of SearchableMultiSelect for cases where the canonical option
// value (e.g. 'small-bills') and the human label (e.g. 'Small bills')
// differ. Same popover shell, search-by-label, checkbox rows, clear
// footer. Used by the Bring filter; can be picked up by future facets
// with the same shape (companions, best-for, etc.).
function LabelledMultiSelect({
  placeholder,
  options,
  selected,
  onToggle,
  onClear,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
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
    return options.filter(o => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-small rounded-md border border-sand bg-white text-ink-deep focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 hover:border-slate transition-colors"
        aria-expanded={open}
      >
        <span className="truncate">
          {selected.size === 0
            ? <span className="text-muted">{placeholder}</span>
            : <span>{selected.size} selected</span>}
        </span>
        <span aria-hidden className="text-muted text-micro">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-sand rounded-md shadow-card overflow-hidden">
          <div className="p-2 border-b border-sand">
            <input
              type="search" autoFocus
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-small rounded border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-label text-muted">No matches.</li>
            )}
            {filtered.map(o => {
              const checked = selected.has(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(o.value)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-label text-left hover:bg-cream-soft transition-colors"
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
                    <span className="flex-1 truncate text-ink-deep">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.size > 0 && (
            <div className="border-t border-sand p-1.5 flex justify-between items-center text-label">
              <span className="text-muted px-1">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => { onClear(); setQ(''); }}
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

function BringChipGroup({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  const keys = Object.keys(BRING_FACET);
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map(k => {
        const facet = bringFacet(k);
        const checked = selected.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            className={
              'pill text-label transition-colors ' +
              (checked
                ? 'bg-ink-deep text-white border border-ink-deep'
                : 'bg-cream-soft text-slate border border-sand hover:bg-sand/40')
            }
            aria-pressed={checked}
          >
            {facet.label}
          </button>
        );
      })}
    </div>
  );
}
