'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

// === filtersContext: shared factory =========================================
// CityFilters / CountryFilters / PinFilters all share the same boilerplate:
// state + setState + reset + activeFilterCount + a (result, total) pair
// pushed back from the view for the "X / Y" badge. The only domain-specific
// pieces are the state shape, what counts as "non-default", and (in some
// contexts) a custom reset transform.
//
// makeFiltersContext takes those three knobs and returns a {Provider,
// useFilters, Context} triple. Domain contexts shrink to about 40 lines
// (a type + a default + the call) instead of repeating the same provider
// glue three times.
//
// CityFiltersContext keeps its own provider because it also tracks
// per-layer counts pushed from the map view; the factory covers the
// common 90% but doesn't try to absorb that one extension.

/** Base shape that every filter context exposes. Domain-specific extras
 *  (e.g. CityFilters' layerCounts) live on a separately-typed context. */
export type BaseFiltersCtx<S> = {
  state: S;
  setState: Dispatch<SetStateAction<S>>;
  reset: () => void;
  activeFilterCount: number;
  resultCount: number | null;
  totalCount: number | null;
  setCounts: (result: number, total: number) => void;
};

export function makeFiltersContext<S>(opts: {
  /** Initial state on first mount. */
  defaultState: S;
  /** Count of "non-default" axes — drives the sidebar's "N active" badge.
   *  Should NOT count layer-visibility toggles (encoding, not filtering). */
  countActive: (state: S) => number;
  /** Optional reset target. Defaults to `defaultState`. PinFilters uses
   *  this to ensure Reset escapes the curated 'visited' default;
   *  CityFilters uses it to drop every facet back to neutral. */
  resetState?: () => S;
}) {
  const Context = createContext<BaseFiltersCtx<S> | null>(null);
  const resolveReset = opts.resetState ?? (() => opts.defaultState);

  function Provider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<S>(opts.defaultState);
    const [counts, setCountsState] = useState<{
      result: number | null;
      total: number | null;
    }>({ result: null, total: null });

    const activeFilterCount = useMemo(() => opts.countActive(state), [state]);

    // Stable identity so consumers can include setCounts in useEffect
    // deps without re-firing on every render.
    const setCounts = useCallback((result: number, total: number) => {
      setCountsState(prev =>
        prev.result === result && prev.total === total
          ? prev
          : { result, total },
      );
    }, []);

    const stableReset = useCallback(() => setState(resolveReset()), []);

    const value = useMemo<BaseFiltersCtx<S>>(
      () => ({
        state,
        setState,
        reset: stableReset,
        activeFilterCount,
        resultCount: counts.result,
        totalCount: counts.total,
        setCounts,
      }),
      [state, activeFilterCount, counts.result, counts.total, stableReset, setCounts],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useFilters(): BaseFiltersCtx<S> | null {
    return useContext(Context);
  }

  return { Context, Provider, useFilters };
}

/** Toggle a value in/out of a Set (immutable update). Shared by every
 *  filter context that exposes multi-select facets. */
export function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
