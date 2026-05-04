'use client';

import { usePinFilters } from '@/components/PinFiltersContext';

// === PinsPageTitle ==========================================================
// Reflexive H1 for /pins/cards. Mirrors CitiesPageTitle: the filter cockpit
// is the page's primary interaction, so the heading narrating which slice
// is on screen is more useful than a generic "Pins."
//
//   visited     → "Pins I’ve been to"           (default landing state)
//   not-visited → "Pins I haven’t been to yet"
//   all         → "Every pin in the atlas"
//
// Hook returns null outside its provider (defensive); we fall back to the
// visited-leaning default to match the page's static metadata.
export default function PinsPageTitle() {
  const ctx = usePinFilters();
  const filter = ctx?.state.visitedFilter ?? 'visited';

  const title =
    filter === 'not-visited'
      ? "Pins I haven’t been to yet"
      : filter === 'all'
        ? 'Every pin in the atlas'
        : "Pins I’ve been to";

  return <h1 className="text-h2 text-ink-deep">{title}</h1>;
}
