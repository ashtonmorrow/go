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
  // Default. Cities I've curated most heavily come first: those with a
  // Google saved-places list, then those I've personally photographed,
  // then those that have at least an AI/curated hero image, then the rest.
  // Within each tier the order is alphabetical for stability.
  | 'curated'
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

// Status = the user's relationship to a city. Three values, mutually
// exclusive: visited (have been), planning (want to go), researching
// (in the atlas but no commitment yet). Drives map color encoding and
// is the primary status-focus axis in the cockpit.
//
// Saved-places is intentionally NOT a status because it's orthogonal —
// a visited city can also have saved places, and squashing that into a
// priority chain would erase real information. Saved-places lives in
// the FILTERS section as a tri-state facet, with a separate gold-ring
// overlay drawn on top of the status color on the map.
//
// Internal value names are kept as 'visited' | 'planning' | 'researching'
// to match the user-facing vocabulary. The Notion source columns are
// `been` and `go` (booleans); the cityLayer() function maps those to
// the new vocabulary at the boundary so the rest of the code reads
// naturally.
export type CityLayer = 'visited' | 'planning' | 'researching';

/** Tri-state facet: 'any' = unfiltered, 'with' = only cities that have
 *  saved places, 'without' = only cities that don't. */
export type HasSaved = 'any' | 'with' | 'without';

// Filter state shape.
export type FilterState = {
  // === STATUS FOCUS (single-select narrowing) ===
  // Researching → Planning → Visited (the user's journey). Click a
  // segment in the cockpit to narrow to that status; click the active
  // one to clear (statusFocus = null = show all statuses).
  // Replaced the previous showBeen/showGo/showOther multi-toggle layers
  // — easier to reason about and matches how users actually browse
  // their atlas in practice.
  statusFocus: CityLayer | null;

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
  // Default lands the user on the cities I've actually been to. The 1,000+
  // placeholder cities still exist in the data, but you have to click off
  // the Visited segment in the cockpit to see them — that's the right tier
  // of friction for the long tail. Status focus null was the previous
  // default; "Visited" is more honest about what the page is for.
  statusFocus: 'visited',

  // hasSavedPlaces back to 'any' — the new curated sort below puts cities
  // with Google saved-places lists at the top of the visited tier anyway,
  // so filtering them out of the rest is heavy-handed. The user can still
  // narrow to "With" via the cockpit if they want only the lists.
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

  // Curated default. Tier 1: has a Google saved-places URL.
  // Tier 2: has a personal photo. Tier 3: has a hero image (Codex / AI /
  // Wikimedia). Tier 4: nothing yet. Within each tier, alphabetical.
  sort: 'curated',
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

  // Active-filter counter — every active narrowing facet (including
  // statusFocus when set, since it's now a real filter not a layer).
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.q.trim()) n++;
    if (state.statusFocus !== null) n++;
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

  // Kept on the context for backwards compat with any leftover consumer;
  // always false now since there's no separate layer-visibility axis.
  const activeLayerHidden = false;

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
        prev.visited === next.visited &&
        prev.planning === next.planning &&
        prev.researching === next.researching
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // Clear-all explicitly resets to a TRULY-neutral state, not to
  // DEFAULT_STATE. The default carries hasSavedPlaces='with' so the
  // initial page load lands on the curated subset; but clicking
  // "Clear all" should give the user the full atlas, otherwise the
  // button feels broken ("I clicked clear and I still have a filter").
  const stableReset = useCallback(() => setState({
    ...DEFAULT_STATE,
    statusFocus: null,
    hasSavedPlaces: 'any',
    q: '',
    countries: new Set(),
    continents: new Set(),
    koppenGroups: new Set(),
    visa: new Set(),
    tapWater: new Set(),
    drive: new Set(),
    populationMin: null,
    populationMax: null,
  }), []);

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
