'use client';

import dynamic from 'next/dynamic';
import { fullBleedSkeleton } from './lazyMap';

// MapLibre touches `window` at module load; dynamic-imported with ssr:false.
export default dynamic(() => import('./WorldGlobe'), {
  ssr: false,
  loading: fullBleedSkeleton('Loading map'),
});
