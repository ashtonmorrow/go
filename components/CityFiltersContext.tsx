'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

// === Filter types ===
// All filter dimensions live here so the Sidebar and CitiesGrid stay in sync.
// Sort field keys map to either City or derived fields. Direction is a single
// boolean (`desc`) shared across all sort fields.

export type SortKey =
  | 'name'
  | 'population'
  | 'founded'
  | 'avgHigh'
  | 'avgLow'
  | 'elevation'
  | 'rainfall';

// Köppen climate groups by first letter — far more useful than the full code.
// A=Tropical, B=Arid, C=Temperate, D=Continental, E=Polar.
export type KoppenGroup = 'A' | 'B' | 'C' | 'D' | 'E';

export type Continent =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Australia'
  | 'Antartica';

export type VisaUs = 'Visa-free' | 'eVisa' | 'On arrival' | 'Required' | 'Varies';
export type TapWater = 'Safe' | 'Treat first' | 'Not safe' | 'Varies';
export type DriveSide = 'L' | 'R';

// Filter state shape. Multi-selects are sets so toggling on/off is O(1).
export type FilterState = {
  q: string;
  showBeen: boolean;
  showGo: boolean;
  showSaved: boolean;
  countries: Set<string>;
  continents: Set<Continent>;
  koppenGroups: Set<KoppenGroup>;
  visa: Set<VisaUs>;
  tapWater: Set<TapWater>;
  drive: Set<DriveSide>;
  /** Population range (inclusive). Both null = unbounded. */
  populationMin: number | null;
  populationMax: number | null;
  sort: SortKey;
  desc: boolean;
};

const DEFAULT_STATE: FilterState = {
  q: '',
  showBeen: true,
  showGo: false,
  showSaved: false,
  countries: new Set(),
  continents: new Set(),
  koppenGroups: new Set(),
  visa: new Set(),
  tapWater: new Set(),
  drive: new Set(),
  populationMin: null,
  populationMax: null,
  sort: 'name',
  desc: false,
};

type Ctx = {
  state: FilterState;
  setState: React.Dispatch<React.SetStateAction<FilterState>>;
  reset: () => void;
  // How many filters are non-default — drives the "Clear (N)" badge in the
  // sidebar. Search and sort don't count as filters here; Been/Go/Saved are
  // intentionally treated as filters (since defaults are not 'all').
  activeFilterCount: number;
  // Push-channel from CitiesGrid → FilterPanel so the sidebar can show
  // "X / Y cities" without re-running the filter logic itself.
  resultCount: number | null;
  totalCount: number | null;
  setCounts: (result: number, total: number) => void;
};

const CityFiltersContext = createContext<Ctx | null>(null);

export function CityFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>(DEFAULT_STATE);
  const [counts, setCountsState] = useState<{ result: number | null; total: number | null }>({
    result: null,
    total: null,
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.showBeen !== DEFAULT_STATE.showBeen) n++;
    if (state.showGo !== DEFAULT_STATE.showGo) n++;
    if (state.showSaved !== DEFAULT_STATE.showSaved) n++;
    n += state.countries.size > 0 ? 1 : 0;
    n += state.continents.size > 0 ? 1 : 0;
    n += state.koppenGroups.size > 0 ? 1 : 0;
    n += state.visa.size > 0 ? 1 : 0;
    n += state.tapWater.size > 0 ? 1 : 0;
    n += state.drive.size > 0 ? 1 : 0;
    if (state.populationMin != null || state.populationMax != null) n++;
    return n;
  }, [state]);

  // Stable identity so consumers can include it in useEffect deps without
  // creating a re-fire loop on every render.
  const setCounts = useCallback((result: number, total: number) => {
    setCountsState(prev =>
      prev.result === result && prev.total === total ? prev : { result, total }
    );
  }, []);

  // Same — stable identity for the reset action.
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

  return (
    <CityFiltersContext.Provider value={value}>{children}</CityFiltersContext.Provider>
  );
}

// Hook returns null when no provider is mounted (e.g. outside the cities
// route). Consumers should null-check before rendering filter UI so the
// sidebar can opt-out gracefully on /map and detail pages.
export function useCityFilters(): Ctx | null {
  return useContext(CityFiltersContext);
}

// Helper for toggling a value in/out of a Set (immutable update).
export function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
