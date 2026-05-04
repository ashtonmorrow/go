'use client';

import { useCountryFilters } from '@/components/CountryFiltersContext';

// === CountriesPageTitle =====================================================
// Reflexive H1 for /countries/cards. Mirrors CitiesPageTitle / PinsPageTitle.
// Country state has a tri-state visitedFilter (all / been / not-been), so
// the title swaps to match.
//
//   been     → "Countries I’ve been to"
//   not-been → "Countries I haven’t visited yet"
//   all      → "Countries in the atlas"           (default landing state)
//
// Hook returns null outside its provider; we fall back to the page's
// static-metadata default of "all" so a stray render still reads cleanly.
export default function CountriesPageTitle() {
  const ctx = useCountryFilters();
  const filter = ctx?.state.visitedFilter ?? 'all';

  const title =
    filter === 'been'
      ? "Countries I’ve been to"
      : filter === 'not-been'
        ? "Countries I haven’t visited yet"
        : 'Countries in the atlas';

  return <h1 className="text-h2 text-ink-deep">{title}</h1>;
}
