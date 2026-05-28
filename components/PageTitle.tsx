'use client';

import { useCityFilters } from '@/components/CityFiltersContext';
import { useCountryFilters } from '@/components/CountryFiltersContext';
import { usePinFilters } from '@/components/PinFiltersContext';

// === PageTitle ============================================================
// Reflexive H1 for /cities/cards, /countries/cards, /pins/cards. Reads the
// active status focus from the matching filter context and morphs the
// heading to narrate which slice of the atlas is on screen.
//
// The filter cockpit is each page's primary interaction, so a status-
// aware title is more useful than a generic label. Hooks return null
// outside their provider (defensive); each scope falls back to the
// curated landing default to match the page's static metadata.
//
// Replaces three near-identical components (CitiesPageTitle,
// CountriesPageTitle, PinsPageTitle) that each did the same shape: read
// status, branch on values, render an <h1>.

const COPY = {
  cities: {
    visited: 'Cities I can help you plan',
    planning: "Cities I'm planning to visit",
    researching: "Cities I've been researching",
    null: 'Every city in the atlas',
  },
  countries: {
    visited: "Countries I've visited",
    'short-list': 'Countries on my short list',
    researched: "Countries I've been researching",
    null: 'Every country in the atlas',
  },
  pins: {
    visited: 'Places I would actually send you to',
    'not-visited': "Places I haven't been to yet",
    all: 'Every place in the atlas',
  },
} as const;

type Props = { scope: 'cities' | 'countries' | 'pins' };

export default function PageTitle({ scope }: Props) {
  const text = useTitleText(scope);
  return <h1 className="text-h2 text-ink-deep">{text}</h1>;
}

function useTitleText(scope: Props['scope']): string {
  // We have to call all three hooks unconditionally to keep the hook
  // order stable across renders; the scope just selects which one's
  // result we read. The other two return null (no provider) on
  // non-matching routes — that's fine, we never read them.
  const city = useCityFilters();
  const country = useCountryFilters();
  const pin = usePinFilters();

  if (scope === 'cities') {
    const focus = city?.state.statusFocus ?? 'visited';
    return COPY.cities[focus ?? 'null'];
  }
  if (scope === 'countries') {
    const focus = country?.state.statusFocus ?? 'visited';
    return COPY.countries[focus ?? 'null'];
  }
  const filter = pin?.state.visitedFilter ?? 'visited';
  return COPY.pins[filter];
}
