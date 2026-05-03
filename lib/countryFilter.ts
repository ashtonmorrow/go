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
  /** Optional — only the cards/table/stats consumers carry this through.
   *  Treated as false when missing so callers that haven't been updated
   *  to thread the field through still typecheck and just don't expose
   *  the Disputed toggle's narrowing power. */
  disputed?: boolean;
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
    if (state.disputedOnly && !r.disputed) continue;
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

/** Personal-investment tier for countries. Mirrors the pin/city sort
 *  philosophy — countries Mike's actually been to lead, then countries
 *  with cities in the atlas but no visit yet, then everything else. We
 *  don't have per-country personal photos, so the ladder is shallower
 *  than the pin/city versions. Lower number wins. */
function countryPersonalTier<T extends CountryFilterable>(c: T): number {
  if (c.beenCount > 0) return 0;
  if (c.cityCount > 0) return 1;
  return 2;
}

export function sortCountries<T extends CountryFilterable>(
  rows: T[],
  state: CountryFilterState,
): T[] {
  const out = [...rows];
  out.sort((a, b) => {
    // Tier-first. The user-picked sort acts as a within-tier tiebreaker
    // so countries Mike's been to always cluster at the top regardless
    // of whether they sort by name, city count, or visited count.
    const tierA = countryPersonalTier(a);
    const tierB = countryPersonalTier(b);
    if (tierA !== tierB) return tierA - tierB;

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
