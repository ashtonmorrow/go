'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import type { Continent } from './CityFiltersContext';

// === Pin filter state ======================================================
// Mirrors the shape of CityFiltersContext but with pin-relevant dimensions.
// Reasons for a second context (rather than one shared filter store):
//   * Different sort keys (no population / founded / avgHigh on a pin)
//   * Different boolean toggles (Visited rather than Been/Go/Saved trio)
//   * Different multi-selects (category + UNESCO; no Köppen, voltage, etc.)
//
// Trade-off: a tiny bit of duplication for clean, decoupled cockpit state
// when the user flips between /cities and /pins.

export type PinSortKey = 'name' | 'recent';

export type PinFilterState = {
  q: string;
  visitedFilter: 'all' | 'visited' | 'not-visited';
  unescoOnly: boolean;
  freeOnly: boolean;
  /** Pin must have food on site (any non-'none' food_on_site value). */
  foodOnSiteOnly: boolean;
  /** Pin must be wheelchair-accessible ('fully' or 'partially'). */
  wheelchairOnly: boolean;
  /** Pin must be flagged kid_friendly = true. */
  kidFriendlyOnly: boolean;
  /** Pin must carry a personal_review (Mike actually wrote about it).
   *  Distinct from `visitedFilter='visited'`: visited = "I've been", reviewed
   *  = "I've been AND wrote a review you can read". The pins matrix has both
   *  because Mike has 1,400+ visited places but only ~600 reviews. */
  reviewedOnly: boolean;
  categories: Set<string>;
  countries: Set<string>;
  continents: Set<Continent>;
  lists: Set<string>;
  tags: Set<string>;
  /** Pin's bring[] must include every selected token (AND). */
  bring: Set<string>;
  /** Pin's saved_lists[] must include at least one selected list (OR).
   *  Saved lists are Mike's personal Google Maps collections (Madrid,
   *  Bangkok, Coffee Shops, etc) — distinct from the canonical UNESCO /
   *  Atlas Obscura lists already covered by `lists`. */
  savedLists: Set<string>;
  inceptionMin: number | null;
  inceptionMax: number | null;
  sort: PinSortKey;
  desc: boolean;
};

// Curated landing — pins is mostly a personal "places I've been" list, so the
// default narrows to visited. Reset() returns to NEUTRAL_STATE for a real
// escape hatch.
const DEFAULT_STATE: PinFilterState = {
  q: '',
  visitedFilter: 'visited',
  unescoOnly: false,
  freeOnly: false,
  foodOnSiteOnly: false,
  wheelchairOnly: false,
  kidFriendlyOnly: false,
  reviewedOnly: false,
  categories: new Set(),
  countries: new Set(),
  continents: new Set(),
  lists: new Set(),
  tags: new Set(),
  bring: new Set(),
  savedLists: new Set(),
  inceptionMin: null,
  inceptionMax: null,
  sort: 'recent',
  desc: true,
};

type Ctx = {
  state: PinFilterState;
  setState: React.Dispatch<React.SetStateAction<PinFilterState>>;
  reset: () => void;
  activeFilterCount: number;
  resultCount: number | null;
  totalCount: number | null;
  setCounts: (result: number, total: number) => void;
};

const PinFiltersContext = createContext<Ctx | null>(null);

export function PinFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PinFilterState>(DEFAULT_STATE);
  const [counts, setCountsState] = useState<{ result: number | null; total: number | null }>({
    result: null,
    total: null,
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.visitedFilter !== DEFAULT_STATE.visitedFilter) n++;
    if (state.unescoOnly !== DEFAULT_STATE.unescoOnly) n++;
    if (state.freeOnly !== DEFAULT_STATE.freeOnly) n++;
    if (state.foodOnSiteOnly !== DEFAULT_STATE.foodOnSiteOnly) n++;
    if (state.wheelchairOnly !== DEFAULT_STATE.wheelchairOnly) n++;
    if (state.kidFriendlyOnly !== DEFAULT_STATE.kidFriendlyOnly) n++;
    if (state.reviewedOnly !== DEFAULT_STATE.reviewedOnly) n++;
    n += state.categories.size > 0 ? 1 : 0;
    n += state.countries.size > 0 ? 1 : 0;
    n += state.continents.size > 0 ? 1 : 0;
    n += state.lists.size > 0 ? 1 : 0;
    n += state.tags.size > 0 ? 1 : 0;
    n += state.bring.size > 0 ? 1 : 0;
    n += state.savedLists.size > 0 ? 1 : 0;
    if (state.inceptionMin != null || state.inceptionMax != null) n++;
    return n;
  }, [state]);

  const setCounts = useCallback((result: number, total: number) => {
    setCountsState(prev =>
      prev.result === result && prev.total === total ? prev : { result, total }
    );
  }, []);

  // Reset clears EVERYTHING including the curated visited='visited' default
  // so the user has a true "show me all 1300+ pins" escape hatch.
  const stableReset = useCallback(
    () => setState({ ...DEFAULT_STATE, visitedFilter: 'all' }),
    [],
  );

  const value = useMemo(
    () => ({
      state,
      setState,
      reset: stableReset,
      activeFilterCount,
      resultCount: counts.result,
      totalCount: counts.total,
      setCounts,
    }),
    [state, activeFilterCount, counts.result, counts.total, stableReset, setCounts]
  );

  return <PinFiltersContext.Provider value={value}>{children}</PinFiltersContext.Provider>;
}

export function usePinFilters(): Ctx | null {
  return useContext(PinFiltersContext);
}

export function togglePinSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
