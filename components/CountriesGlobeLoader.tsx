'use client';

import dynamic from 'next/dynamic';

// MapLibre touches `window` at module-load, so the country globe loads
// client-only via dynamic import. Same pattern as WorldGlobeLoader.
const CountriesGlobe = dynamic(() => import('./CountriesGlobe'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full bg-cream-soft animate-pulse h-[calc(100svh-56px)] md:h-screen"
      aria-label="Loading globe"
    />
  ),
});

export default CountriesGlobe;
