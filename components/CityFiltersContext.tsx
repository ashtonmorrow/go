'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

// === City filters: layers / filters split ==================================
// Two distinct jobs were previously mashed together into one "filter" cockpit:
//
//   1. ENCODING (visual layers) — Been, Want to go, Saved, Other.
//      These are status attributes a user wants to SEE, often all at once,
//      colored differently. Toggling Been off means "stop drawing the Been
//      layer," not "exclude Been cities from analysis." This is the same
//      mental model as Google Maps' map layers, Strava's heatmap layers,
//      Kepler.gl layers — visibility, not filtering.
//
//   2. NARROWING (faceted filters) — search, country, continent, climate,
//      visa, tap water, drive side, population. These actually reduce the
//      dataset. They compose with AND. Standard faceted-search semantics
//      (Airbnb / Kayak / Linear / GitHub).
//
// Splitting them clarifies every cockpit interaction and unblocks the
// long-standing UX bugs:
//   • Default state is now genuinely neutral — every layer ON, every facet
//     EMPTY. Page lands on the full atlas with nothing silently filtered.
//   • activeFilterCount counts ONLY narrowing facets, so the "Clear filters"
//     pill correctly reflects what would actually broaden the result.
//   • activeLayerHidden surfaces "you've turned off Been so you're not seeing
//     visited cities" as separate UX from "you've narrowed to Asia."
//
// State is kept FLAT (not nested under .layers / .filters) for simpler
// consumer migration; semantic grouping is by naming convention (showX for
// layers, everything else for facets).

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

// Layer = encoding axis. A city falls into exactly one layer determined
// by status: Been > Go > Other (mutually exclusive). Saved-places is NOT
// a layer because it's orthogonal — a Been city can also have saved
// places, and squashing that into a priority chain would erase real
// information. Saved-places lives in the FILTERS section as a tri-state
// facet, with a separate gold-ring overlay drawn on top of the layer
// color on the map. This is the categorical-color + boolean-overlay
// pattern (Munzner, Visualization Analysis & Design, ch. 12).
export type CityLayer = 'been' | 'go' | 'other';

/** Tri-state facet: 'any' = unfiltered, 'with' = only cities that have
 *  saved places, 'without' = only cities that don't. */
export type HasSaved = 'any' | 'with' | 'without';

// Filter state shape. Layers come first (visibility), then facets (narrowing),
// then sort. Multi-selects are sets so toggling on/off is O(1).
export type FilterState = {
  // === LAYERS (encoding — visibility toggles, NOT narrowing filters) ===
  showBeen: boolean;
  showGo: boolean;
  showOther: boolean;

  // === FILTERS (narrowing — composed with AND) ===
  q: string;
  countries: Set<string>;
  continents: Set<Continent>;
  koppenGroups: Set<KoppenGroup>;
  visa: Set<VisaUs>;
  tapWater: Set<TapWater>;
  drive: Set<DriveSide>;
  /** Population range (inclusive). Both null = unbounded. */
  populationMin: number | null;
  populationMax: number | null;
  /** Saved-places tri-state. 'any' = no narrowing; 'with' / 'without' apply. */
  hasSavedPlaces: HasSaved;

  // === SORT ===
  sort: SortKey;
  desc: boolean;
};

const DEFAULT_STATE: FilterState = {
  // Neutral default: every status layer is visible. The user lands on the
  // full atlas with all three status colors rendered, nothing silently hidden.
  showBeen: true,
  showGo: true,
  showOther: true,

  // Neutral default: no narrowing applied.
  q: '',
  countries: new Set(),
  continents: new Set(),
  koppenGroups: new Set(),
  visa: new Set(),
  tapWater: new Set(),
  drive: new Set(),
  populationMin: null,
  populationMax: null,
  hasSavedPlaces: 'any',

  sort: 'name',
  desc: false,
};

type Ctx = {
  state: FilterState;
  setState: React.Dispatch<React.SetStateAction<FilterState>>;
  reset: () => void;
  /** Number of NARROWING facets currently active. Layers are explicitly
   *  excluded — they're encoding controls, not filter conditions, so a
   *  user with "Been only visible" should not see a "1 active filter"
   *  counter. */
  activeFilterCount: number;
  /** True when at least one layer is hidden. Drives the contextual hint
   *  "Some statuses are hidden" so the user is never silently puzzled
   *  about a missing color on the map. */
  activeLayerHidden: boolean;
  // Push-channel from view → FilterPanel for the "X / Y cities" badge.
  resultCount: number | null;
  totalCount: number | null;
  setCounts: (result: number, total: number) => void;
  /** Per-layer counts within the narrowed (post-facet, pre-visibility) set.
   *  Pushed by view components so the FilterPanel can render
   *  "Been (47) · Go (12) · Saved (3) · Other (188)" next to each toggle.
   *  Null until a view mounts and calls setLayerCounts. */
  layerCounts: Record<CityLayer, number> | null;
  setLayerCounts: (counts: Record<CityLayer, number>) => void;
};

const CityFiltersContext = createContext<Ctx | null>(null);

export function CityFiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>(DEFAULT_STATE);
  const [counts, setCountsState] = useState<{ result: number | null; total: number | null }>({
    result: null,
    total: null,
  });
  const [layerCounts, setLayerCountsState] = useState<Record<CityLayer, number> | null>(null);

  // Active-filter counter — narrowing only, layer toggles excluded.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.q.trim()) n++;
    n += state.countries.size > 0 ? 1 : 0;
    n += state.continents.size > 0 ? 1 : 0;
    n += state.koppenGroups.size > 0 ? 1 : 0;
    n += state.visa.size > 0 ? 1 : 0;
    n += state.tapWater.size > 0 ? 1 : 0;
    n += state.drive.size > 0 ? 1 : 0;
    if (state.populationMin != null || state.populationMax != null) n++;
    if (state.hasSavedPlaces !== 'any') n++;
    return n;
  }, [state]);

  const activeLayerHidden = useMemo(
    () => !state.showBeen || !state.showGo || !state.showOther,
    [state.showBeen, state.showGo, state.showOther]
  );

  // Stable identity so consumers can include it in useEffect deps without
  // creating a re-fire loop on every render.
  const setCounts = useCallback((result: number, total: number) => {
    setCountsState(prev =>
      prev.result === result && prev.total === total ? prev : { result, total }
    );
  }, []);

  const setLayerCounts = useCallback((next: Record<CityLayer, number>) => {
    setLayerCountsState(prev => {
      // Cheap shallow equality so the view's effect doesn't trigger a
      // re-render of the sidebar on every filter tick when nothing's changed.
      if (
        prev &&
        prev.been === next.been &&
        prev.go === next.go &&
        prev.other === next.other
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const stableReset = useCallback(() => setState(DEFAULT_STATE), []);

  const value = useMemo(
    () => ({
      state,
      setState,
      reset: stableReset,
      activeFilterCount,
      activeLayerHidden,
      resultCount: counts.result,
      totalCount: counts.total,
      setCounts,
      layerCounts,
      setLayerCounts,
    }),
    [state, activeFilterCount, activeLayerHidden, counts.result, counts.total, stableReset, setCounts, layerCounts, setLayerCounts]
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
