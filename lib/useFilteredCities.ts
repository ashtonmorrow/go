'use client';

import { useEffect, useMemo } from 'react';
import { useCityFilters } from '@/components/CityFiltersContext';
import { applyLayerVisibility, filterCities, layerCounts as countLayers, sortCities } from './cityFilter';
import type { City } from './cityShape';

// === useFilteredCities ======================================================
// Single source of truth for the FULL pipeline: facets → layer visibility →
// sort. Both CitiesGrid and CitiesTable use this hook so flipping between
// views renders the same set in the same order. WorldGlobe assembles the
// pipeline manually because it ALSO needs the unfiltered set for the
// sister-city graph (a sister filtered out should still render its line).
//
// Side effects pushed back to CityFiltersContext for the sidebar's footer:
//   • setCounts(result, total)        — "42 / 281 cities"
//   • setLayerCounts({been, go, ...}) — "Been (47) Go (12) Saved (3) Other"
//
// Layer counts are computed over the NARROWED-but-not-yet-visibility-filtered
// set, so they answer "how many cities each layer would reveal if I toggled
// it on, given my current facet filters" rather than the global tally.
//
// The filter logic itself lives in lib/cityFilter.ts so non-hook consumers
// can run the same predicates without the side-effects.
export function useFilteredCities(cities: City[]) {
  const filters = useCityFilters();
  const state = filters?.state;
  const setCounts = filters?.setCounts;
  const setLayerCounts = filters?.setLayerCounts;

  // Compute the post-facet, pre-visibility set in a separate memo so we can
  // both (a) feed it to layerCounts and (b) carry it through to visibility.
  const narrowed = useMemo(() => {
    if (!state) return cities;
    return filterCities(cities, state);
  }, [cities, state]);

  const filtered = useMemo(() => {
    if (!state) return narrowed;
    return sortCities(applyLayerVisibility(narrowed, state), state);
  }, [narrowed, state]);

  // Push counts to the sidebar's FilterPanel.
  useEffect(() => {
    setCounts?.(filtered.length, cities.length);
  }, [filtered.length, cities.length, setCounts]);

  useEffect(() => {
    if (!setLayerCounts) return;
    setLayerCounts(countLayers(narrowed));
  }, [narrowed, setLayerCounts]);

  return filtered;
}
