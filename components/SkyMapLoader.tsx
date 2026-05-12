// === SkyMapLoader ==========================================================
// Dynamic wrapper around SkyMap. MapLibre references `window` at module
// load, so this panel has to be client-only. The loader keeps MapLibre
// (and the live-air-traffic fetch logic) out of the city-page initial
// bundle until the panel renders.
//
'use client';

import dynamic from 'next/dynamic';

const SkyMap = dynamic(() => import('./SkyMap'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-[340px] bg-cream-soft animate-pulse rounded-lg border border-sand"
      aria-label="Loading live air traffic map"
    />
  ),
});

export default SkyMap;
