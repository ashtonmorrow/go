'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import type { Continent, VisaUs, TapWater, DriveSide } from './CityFiltersContext';

// === Country filter state ==================================================
// Third filter context (after CityFilters and PinFilters). Country axes
// are a subset of the city axes — same continent / visa / tap-water /
// drive options, since those are country-level facts to begin with —
// plus a status focus that mirrors the city status axis.
//
// statusFocus is derived from member-city been/go flags: a country is
// 'visited' if any of its cities is been-ticked; 'short-list' if zero
// been but at least one go-ticked city; 'researched' otherwise. null
// = show all statuses. Default lands on 'visited' so the page leads
// with the user's actual experience, mirroring CityFiltersContext.
//
// Sort options are country-shaped: name, # of cities in the atlas, # of
// those cities I've been to.

export type CountrySortKey = 'name' | 'cityCount' | 'beenCount';
/** A country's relationship to the user. Mirrors CityLayer. */
export type CountryLayer = 'visited' | 'short-list' | 'researched';

export type CountryFilterState = {
  q: string;
  /** Single-select status narrowing; null = show every status. */
  statusFocus: CountryLayer | null;
  schengenOnly: boolean;
  /** Narrow to partially-recognized or unrecognized territories. Off by
   *  default; toggling on shows only countries where go_countries.disputed
   *  is true (Abkhazia, Northern Cyprus, Transnistria, etc). */
  disputedOnly: boolean;
  continents: Set<Continent>;
  visa: Set<VisaUs>;
  tapWater: Set<TapWater>;
  drive: Set<DriveSide>;
  sort: CountrySortKey;
  desc: boolean;
};

const DEFAULT_STATE: CountryFilterState = {
  q: '',
  // Default to 'visited' so the cards lead with the user's actual travel
  // experience. The previous default of 'all' showed every country in
  // the atlas including ~200 enriched-but-not-engaged rows that drowned
  // the visited set; this matches the cities page default ladder.
  statusFocus: 'visited',
  schengenOnly: false,
  disputedOnly: false,
  continents: new Set(),
  visa: new Set(),
  tapWater: new Set(),
  drive: new Set(),
  sort: 'name',
  desc: false,
};

type Ctx = {
  state: CountryFilterState;
  setState: React.Dispatch<React.SetStateAction<CountryFilterState>>;
  reset: () => void;
  activeFilterCount: number;
  resultCount: number | null;
  totalCount: number | null;
  setCounts: (result: number, total: number) => void;
};

const CountryFiltersContext = createContext<Ctx | null>(null);

export function CountryFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CountryFilterState>(DEFAULT_STATE);
  const [counts, setCountsState] = useState<{ result: number | null; total: number | null }>({
    result: null,
    total: null,
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.statusFocus !== DEFAULT_STATE.statusFocus) n++;
    if (state.schengenOnly !== DEFAULT_STATE.schengenOnly) n++;
    if (state.disputedOnly !== DEFAULT_STATE.disputedOnly) n++;
    n += state.continents.size > 0 ? 1 : 0;
    n += state.visa.size > 0 ? 1 : 0;
    n += state.tapWater.size > 0 ? 1 : 0;
    n += state.drive.size > 0 ? 1 : 0;
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
      state, setState,
      reset: stableReset,
      activeFilterCount,
      resultCount: counts.result, totalCount: counts.total, setCounts,
    }),
    [state, activeFilterCount, counts.result, counts.total, stableReset, setCounts]
  );

  return <CountryFiltersContext.Provider value={value}>{children}</CountryFiltersContext.Provider>;
}

export function useCountryFilters(): Ctx | null {
  return useContext(CountryFiltersContext);
}

export function toggleCountrySet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
