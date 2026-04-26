// === Shared country filter + sort logic ====================================
// Same pattern as lib/pinFilter.ts — extracted so CountriesGrid (cards)
// and CountriesTable both run the exact same predicates.
import type { CountryFilterState } from '@/components/CountryFiltersContext';
import type { Continent, VisaUs, TapWater, DriveSide } from '@/components/CityFiltersContext';

export type CountryFilterable = {
  name: string;
  capital?: string | null;
  continent?: string | null;
  schengen: boolean;
  visa?: string | null;
  tapWater?: string | null;
  driveSide?: 'L' | 'R' | null;
  cityCount: number;
  beenCount: number;
};

export function filterCountries<T extends CountryFilterable>(
  rows: T[],
  state: CountryFilterState,
): T[] {
  const needle = state.q.trim().toLowerCase();
  const out: T[] = [];
  for (const r of rows) {
    if (needle) {
      const hay = (r.name + '\n' + (r.capital ?? '')).toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (state.visitedFilter === 'been' && r.beenCount === 0) continue;
    if (state.visitedFilter === 'not-been' && r.beenCount > 0) continue;
    if (state.schengenOnly && !r.schengen) continue;
    if (state.continents.size > 0) {
      if (!r.continent || !state.continents.has(r.continent as Continent)) continue;
    }
    if (state.visa.size > 0) {
      if (!r.visa || !state.visa.has(r.visa as VisaUs)) continue;
    }
    if (state.tapWater.size > 0) {
      if (!r.tapWater || !state.tapWater.has(r.tapWater as TapWater)) continue;
    }
    if (state.drive.size > 0) {
      if (!r.driveSide || !state.drive.has(r.driveSide as DriveSide)) continue;
    }
    out.push(r);
  }
  return out;
}

export function sortCountries<T extends CountryFilterable>(
  rows: T[],
  state: CountryFilterState,
): T[] {
  const out = [...rows];
  out.sort((a, b) => {
    let cmp = 0;
    if (state.sort === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (state.sort === 'cityCount') {
      cmp = a.cityCount - b.cityCount;
    } else {
      cmp = a.beenCount - b.beenCount;
    }
    return state.desc ? -cmp : cmp;
  });
  return out;
}
