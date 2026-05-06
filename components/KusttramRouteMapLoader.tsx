'use client';

import dynamic from 'next/dynamic';

// MapLibre touches `window` at module-load; lazy-load the route-map only
// on routes that actually render it (Kusttram + Alicante tram lists).
// Without this, every /lists/[slug] route would ship MapLibre in its
// initial bundle even though the map only renders for two slugs.
const KusttramRouteMap = dynamic(() => import('./KusttramRouteMap'), {
  ssr: false,
  loading: () => (
    <div
      className="mt-5 w-full h-[420px] bg-cream-soft animate-pulse rounded-lg border border-sand"
      aria-label="Loading route map"
    />
  ),
});

export default KusttramRouteMap;
