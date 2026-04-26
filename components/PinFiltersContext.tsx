'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

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
  /** Three-state visited toggle: 'all' | 'visited' | 'not-visited' */
  visitedFilter: 'all' | 'visited' | 'not-visited';
  /** UNESCO World Heritage sites only when true. Stays compatible with category. */
  unescoOnly: boolean;
  categories: Set<string>;
  countries: Set<string>;
  sort: PinSortKey;
  desc: boolean;
};

const DEFAULT_STATE: PinFilterState = {
  q: '',
  visitedFilter: 'all',
  unescoOnly: false,
  categories: new Set(),
  countries: new Set(),
  sort: 'name',
  desc: false,
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
    n += state.categories.size > 0 ? 1 : 0;
    n += state.countries.size > 0 ? 1 : 0;
    return n;
  }, [state]);

  const setCounts = useCallback((result: number, total: number) => {
    setCountsState(prev =>
      prev.result === result && prev.total === total ? prev : { result, total }
    );
  }, []);

  const stableReset = useCallback(() => setState(DEFAULT_STATE), []);

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
