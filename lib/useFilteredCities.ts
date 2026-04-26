'use client';

import { useEffect, useMemo } from 'react';
import { useCityFilters } from '@/components/CityFiltersContext';
import { filterCities, sortCities } from './cityFilter';
import type { City } from './cityShape';

// === useFilteredCities ======================================================
// Single source of truth for city filtering + sorting. Both CitiesGrid (the
// postcard wall) and CitiesTable (the Airtable-style view) call this hook
// so the sidebar filters apply identically across views — flip from
// postcards to table and the same set of cities is shown in the same order.
//
// The filter logic itself lives in lib/cityFilter.ts so that components
// outside the hook contract (notably WorldGlobe, which integrates with
// MapLibre's render loop) can run the same predicates without the
// hook's setCounts side-effect.
export function useFilteredCities(cities: City[]) {
  const filters = useCityFilters();
  const state = filters?.state;
  const setCounts = filters?.setCounts;

  const filtered = useMemo(() => {
    if (!state) return cities;
    return sortCities(filterCities(cities, state), state);
  }, [cities, state]);

  // Push counts to the sidebar's FilterPanel so it can render '42 / 281'.
  useEffect(() => {
    setCounts?.(filtered.length, cities.length);
  }, [filtered.length, cities.length, setCounts]);

  return filtered;
}
