'use client';

import { useCityFilters } from '@/components/CityFiltersContext';

// === CitiesPageTitle ========================================================
// Reflexive H1 for /cities/cards. Reads the active statusFocus from the
// CityFiltersContext and morphs the heading to match. The filter cockpit
// is the page's primary interaction, so the title narrating which slice
// of the atlas you're looking at is more useful than a generic label.
//
// Falls back to the visited-leaning default if no provider is mounted —
// the layout always mounts CityFiltersProvider, but the hook is defensive.
//
// Status copy:
//   visited     → "Cities I've traveled to"      (the default landing state)
//   planning    → "Cities I'm planning to visit"
//   researching → "Cities I've been researching"
//   null/all    → "Cities in the atlas"          (showing every status)
export default function CitiesPageTitle() {
  const ctx = useCityFilters();
  const focus = ctx?.state.statusFocus ?? 'visited';

  const title =
    focus === 'planning'
      ? "Cities I’m planning to visit"
      : focus === 'researching'
        ? "Cities I’ve been researching"
        : focus === 'visited'
          ? "Cities I’ve traveled to"
          : 'Cities in the atlas';

  return <h1 className="text-h2 text-ink-deep">{title}</h1>;
}
