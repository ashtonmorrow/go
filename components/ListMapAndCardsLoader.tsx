'use client';

import dynamic from 'next/dynamic';
import { inlineSkeleton } from './lazyMap';

// /lists/[slug] doesn't ship MapLibre in its initial route bundle.
// The cards (SavedListSection) live inside the same wrapper because
// the map and the grid share selection state.
export default dynamic(() => import('./ListMapAndCards'), {
  ssr: false,
  loading: inlineSkeleton('h-[420px]', 'Loading list map'),
});
