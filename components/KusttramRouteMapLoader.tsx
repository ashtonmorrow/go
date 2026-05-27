'use client';

import dynamic from 'next/dynamic';
import { inlineSkeleton } from './lazyMap';

// Only renders on the Kusttram + Alicante tram lists; lazy so the other
// /lists/[slug] routes don't ship MapLibre.
export default dynamic(() => import('./KusttramRouteMap'), {
  ssr: false,
  loading: inlineSkeleton('h-[420px]', 'Loading route map'),
});
