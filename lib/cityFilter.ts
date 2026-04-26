// === Shared city filter + sort logic =======================================
// Same pattern as lib/pinFilter.ts and lib/countryFilter.ts. Extracted
// from useFilteredCities so non-hook consumers (notably WorldGlobe,
// which lives inside MapLibre callbacks) can apply the same filter
// without dragging the side-effecting hook semantics in.
//
// Generic over T so callers can shape data however they want as long
// as the structural fields the filter axes need are present.
// CityFiltersContext exports the state type as `FilterState` for legacy
// reasons (it predates Pin/Country contexts which use the namespaced names).
// Aliasing here so the helper signature reads cleanly alongside the others.
import type { FilterState as CityFilterState, KoppenGroup } from '@/components/CityFiltersContext';

export type CityFilterable = {
  name: string;
  country?: string | null;
  continent?: string | null;
  koppen?: string | null;
  currency?: string | null;
  language?: string | null;
  founded?: string | null;
  visa?: string | null;
  tapWater?: string | null;
  driveSide?: 'L' | 'R' | null;
  been: boolean;
  go: boolean;
  savedPlaces?: string | null;
  population?: number | null;
  elevation?: number | null;
  avgHigh?: number | null;
  avgLow?: number | null;
  rainfall?: number | null;
};

export function filterCities<T extends CityFilterable>(cities: T[], state: CityFilterState): T[] {
  const {
    q, showBeen, showGo, showSaved,
    countries, continents, koppenGroups,
    visa, tapWater, drive,
  } = state;

  let list = cities;

  // Personal status — Been > Go priority, Saved additive (preserves the
  // semantics fixed in tasks #75 + #77).
  if (showBeen || showGo || showSaved) {
    list = list.filter(c => {
      let statusMatch = false;
      if (c.been) statusMatch = showBeen;
      else if (c.go) statusMatch = showGo;
      const savedMatch = showSaved && !!c.savedPlaces;
      return statusMatch || savedMatch;
    });
  }

  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter(c => {
      const driveText = c.driveSide === 'L' ? 'left' : c.driveSide === 'R' ? 'right' : '';
      const haystack = [
        c.name, c.country, c.continent, c.koppen,
        c.currency, c.language, c.founded,
        c.visa, c.tapWater, driveText,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (countries.size > 0) {
    list = list.filter(c => c.country && countries.has(c.country));
  }
  if (continents.size > 0) {
    list = list.filter(c => c.continent && continents.has(c.continent as never));
  }
  if (koppenGroups.size > 0) {
    list = list.filter(c => {
      const g = c.koppen?.[0]?.toUpperCase();
      return g && koppenGroups.has(g as KoppenGroup);
    });
  }
  if (visa.size > 0) {
    list = list.filter(c => c.visa && visa.has(c.visa as never));
  }
  if (tapWater.size > 0) {
    list = list.filter(c => c.tapWater && tapWater.has(c.tapWater as never));
  }
  if (drive.size > 0) {
    list = list.filter(c => c.driveSide && drive.has(c.driveSide as never));
  }
  return list;
}

export function sortCities<T extends CityFilterable>(cities: T[], state: CityFilterState): T[] {
  const { sort, desc } = state;
  const get = (c: T): unknown => {
    if (sort === 'name') return c.name?.toLowerCase() ?? '';
    if (sort === 'founded') {
      const m = (c.founded || '').match(/\d+/);
      const n = m ? parseInt(m[0], 10) : null;
      return c.founded?.includes('BC') && n ? -n : n;
    }
    return (c as unknown as Record<string, unknown>)[sort];
  };
  return [...cities].sort((a, b) => {
    const av = get(a) as number | string | null | undefined;
    const bv = get(b) as number | string | null | undefined;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}
