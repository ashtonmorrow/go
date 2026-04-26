'use client';

import dynamic from 'next/dynamic';

// MapLibre touches `window` at module load; lazy-load on the client only.
const PinsMap = dynamic(() => import('./PinsMap'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full bg-cream-soft animate-pulse h-[calc(100svh-56px)] md:h-screen"
      aria-label="Loading pin map"
    />
  ),
});

export default PinsMap;
