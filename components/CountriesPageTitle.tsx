'use client';

import { useCountryFilters } from '@/components/CountryFiltersContext';

// === CountriesPageTitle =====================================================
// Reflexive H1 for /countries/cards. Mirrors CitiesPageTitle / PinsPageTitle.
// Country state has a 4-position statusFocus (visited / short-list /
// researched / null). statusFocus is derived from member-city been/go
// flags at fetch time, so the title narrates the user's actual
// relationship to each country bucket.
//
//   visited     → "Countries I’ve visited"          (default landing)
//   short-list  → "Countries on my short list"
//   researched  → "Countries I’ve been researching"
//   null        → "Countries in the atlas"          (show every status)
//
// Hook returns null outside its provider; we fall back to the page's
// static-metadata default of 'visited' so a stray render still reads
// cleanly.
export default function CountriesPageTitle() {
  const ctx = useCountryFilters();
  const focus = ctx?.state.statusFocus ?? 'visited';

  const title =
    focus === 'short-list'
      ? "Countries on my short list"
      : focus === 'researched'
        ? "Countries I’ve been researching"
        : focus === 'visited'
          ? "Countries I’ve visited"
          : 'Countries in the atlas';

  return <h1 className="text-h2 text-ink-deep">{title}</h1>;
}
