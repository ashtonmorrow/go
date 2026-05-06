'use client';

import dynamic from 'next/dynamic';

// MapLibre touches `window` at module-load; lazy-load the list map +
// cards client wrapper so /lists/[slug] doesn't ship MapLibre in its
// initial route bundle. The cards (SavedListSection) live inside the
// same wrapper because the map and the grid share selection state.
const ListMapAndCards = dynamic(() => import('./ListMapAndCards'), {
  ssr: false,
  loading: () => (
    <div
      className="mt-6 w-full h-[420px] bg-cream-soft animate-pulse rounded-lg border border-sand"
      aria-label="Loading list map"
    />
  ),
});

export default ListMapAndCards;
