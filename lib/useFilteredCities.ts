'use client';

import { useEffect, useMemo } from 'react';
import { useCityFilters, KoppenGroup } from '@/components/CityFiltersContext';
import type { City } from './cityShape';

// === useFilteredCities ======================================================
// Single source of truth for city filtering + sorting. Both CitiesGrid (the
// postcard wall) and CitiesTable (the Airtable-style view) call this hook so
// the sidebar filters apply identically across views — flip from postcards
// to table and the same set of cities is shown in the same order.
//
// Side-effect: pushes the filtered count into the sidebar via the context's
// setCounts so the FilterPanel can render "X / Y cities".
export function useFilteredCities(cities: City[]) {
  const filters = useCityFilters();
  const state = filters?.state;
  const setCounts = filters?.setCounts;

  const filtered = useMemo(() => {
    if (!state) return cities;
    const {
      q,
      showBeen,
      showGo,
      showSaved,
      countries,
      continents,
      koppenGroups,
      visa,
      tapWater,
      drive,
      sort,
      desc,
    } = state;

    let list = cities;

    // === Personal status filter ============================================
    // Each city has ONE primary status with priority Been > Go > Saved.
    // This matches how the postmark renders (a Been city shows VISITED
    // even if Go is also set). The previous additive logic let been-
    // cities slip through the Go filter when Notion had both flags
    // ticked — so 'Been OFF + Want to go ON' surfaced cities you'd
    // actually visited.
    if (showBeen || showGo || showSaved) {
      list = list.filter(c => {
        // Determine the city's primary status, then check whether the
        // corresponding toggle is on. A city with no status is filtered
        // out whenever any toggle is active.
        if (c.been) return showBeen;
        if (c.go) return showGo;
        if (c.savedPlaces) return showSaved;
        return false;
      });
    }

    // Free-text search across EVERY text field on the city. Pre-builds a
    // single haystack string per row at filter time, lower-cased, so the
    // includes() check is a single operation per row.
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(c => {
        const driveText = c.driveSide === 'L' ? 'left' : c.driveSide === 'R' ? 'right' : '';
        const haystack = [
          c.name,
          c.country,
          c.continent,
          c.koppen,
          c.currency,
          c.language,
          c.founded,
          c.visa,
          c.tapWater,
          driveText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    // Country multi-select — searchable picker in the sidebar. Matches
    // against the city's `country` text field (which mirrors the country
    // page name). Cities with a country name not in the canonical set
    // (e.g. typos) won't match; treat that as a data-cleanup opportunity.
    if (countries.size > 0) {
      list = list.filter(c => c.country && countries.has(c.country));
    }

    if (continents.size > 0) {
      list = list.filter(c => c.continent && continents.has(c.continent));
    }

    if (koppenGroups.size > 0) {
      list = list.filter(c => {
        const g = c.koppen?.[0]?.toUpperCase();
        return g && koppenGroups.has(g as KoppenGroup);
      });
    }

    if (visa.size > 0) {
      list = list.filter(c => c.visa && visa.has(c.visa));
    }

    if (tapWater.size > 0) {
      list = list.filter(c => c.tapWater && tapWater.has(c.tapWater));
    }

    if (drive.size > 0) {
      list = list.filter(c => c.driveSide && drive.has(c.driveSide));
    }

    // Sort — value-getter handles "founded" with BC parsing.
    const get = (c: City): unknown => {
      if (sort === 'name') return c.name?.toLowerCase() ?? '';
      if (sort === 'founded') {
        const m = (c.founded || '').match(/\d+/);
        const n = m ? parseInt(m[0], 10) : null;
        return c.founded?.includes('BC') && n ? -n : n;
      }
      return (c as unknown as Record<string, unknown>)[sort];
    };
    return [...list].sort((a, b) => {
      const av = get(a) as number | string | null | undefined;
      const bv = get(b) as number | string | null | undefined;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [cities, state]);

  // Push counts to the sidebar's FilterPanel so it can render '42 / 281'.
  useEffect(() => {
    setCounts?.(filtered.length, cities.length);
  }, [filtered.length, cities.length, setCounts]);

  return filtered;
}
