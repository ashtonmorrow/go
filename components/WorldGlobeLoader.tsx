'use client';

import dynamic from 'next/dynamic';

// MapLibre GL touches `window` at module-load time, so we lazy-load the
// real component on the client only. The page imports this loader and
// hands pins through transparently.
const WorldGlobe = dynamic(() => import('./WorldGlobe'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full bg-cream-soft animate-pulse h-[calc(100svh-56px)] md:h-screen"
      aria-label="Loading map"
    />
  ),
});

export default WorldGlobe;
