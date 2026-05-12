// === AirportsViewLoader ====================================================
// Dynamic wrapper around AirportsView. MapLibre references `window` at
// module load, so the interactive panel must be client-only. Wrapping
// here keeps MapLibre out of the city-page initial bundle until the
// panel actually renders.
//
'use client';

import dynamic from 'next/dynamic';

const AirportsView = dynamic(() => import('./AirportsView'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-[480px] bg-cream-soft animate-pulse rounded-lg border border-sand"
      aria-label="Loading airport map"
    />
  ),
});

export default AirportsView;
