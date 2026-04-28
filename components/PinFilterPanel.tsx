'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePinFilters, togglePinSet, PinSortKey } from './PinFiltersContext';

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
}: {
  countryOptions?: string[];
  categoryOptions?: string[];
  listOptions?: string[];
  tagOptions?: string[];
}) {
  const ctx = usePinFilters();
  if (!ctx) return null;
  const { state, setState, reset, activeFilterCount, resultCount, totalCount } = ctx;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Search</SectionLabel>
        <SearchInput
          value={state.q}
          onChange={q => setState(s => ({ ...s, q }))}
          placeholder="Place, city, or country"
        />
      </div>

      <div>
        <SectionLabel>Status</SectionLabel>
        <div className="flex flex-col gap-1.5">
          <TriState
            value={state.visitedFilter}
            onChange={v => setState(s => ({ ...s, visitedFilter: v }))}
            options={[
              { value: 'all',          label: 'All' },
              { value: 'visited',      label: 'Been' },
              { value: 'not-visited',  label: 'Not yet' },
            ]}
          />
          <Switch
            on={state.unescoOnly}
            label="UNESCO only"
            onChange={v => setState(s => ({ ...s, unescoOnly: v }))}
          />
          <Switch
            on={state.freeOnly}
            label="No admission fee"
            onChange={v => setState(s => ({ ...s, freeOnly: v }))}
          />
        </div>
      </div>

      {/* Lists — UNESCO World Heritage, Atlas Obscura, the wonders sets,
          etc. Short, stable list — chips read better than a multiselect. */}
      {listOptions.length > 0 && (
        <div>
          <SectionLabel>On lists</SectionLabel>
          <ChipGroup
            options={listOptions.map(l => ({ value: l, label: l }))}
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

      {/* Inception year range — Wikidata-derived. Negative = BCE.
          Both inputs optional; an empty value means "unbounded". */}
      <div>
        <SectionLabel>Established between</SectionLabel>
        <div className="flex items-center gap-2 text-small">
          <YearInput
            value={state.inceptionMin}
            onChange={v => setState(s => ({ ...s, inceptionMin: v }))}
            placeholder="any"
          />
          <span className="text-muted text-[11px]">→</span>
          <YearInput
            value={state.inceptionMax}
            onChange={v => setState(s => ({ ...s, inceptionMax: v }))}
            placeholder="any"
          />
        </div>
        <p className="mt-1 text-[10px] text-muted px-0.5">
          Negative for BCE (e.g. -2500 for the Pyramids).
        </p>
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

      <div className="pt-3 border-t border-sand flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted">
          {resultCount != null && totalCount != null ? (
            <>
              <span className="text-ink-deep font-medium">{resultCount}</span>
              <span className="mx-1">/</span>
              <span>{totalCount}</span>
              <span className="ml-1">pins</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={activeFilterCount === 0}
          className={
            'text-[11px] px-2 py-1 rounded-md transition-colors ' +
            (activeFilterCount > 0
              ? 'text-ink-deep hover:bg-cream-soft'
              : 'text-muted/50 cursor-not-allowed')
          }
        >
          Clear{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
    </div>
  );
}

// =================== shadcn-style primitives ===================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-2 px-0.5">
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
            'flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ' +
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

function YearInput({
  value, onChange, placeholder,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value == null ? '' : String(value)}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value.trim();
        if (raw === '') return onChange(null);
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : null);
      }}
      className="w-full px-2 py-1 text-small rounded-md border border-sand bg-white text-ink-deep focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 tabular-nums"
    />
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
        'flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ' +
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
        <span aria-hidden className="text-muted text-[10px]">{open ? '▴' : '▾'}</span>
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
