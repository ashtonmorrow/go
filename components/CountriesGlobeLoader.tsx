'use client';

import dynamic from 'next/dynamic';
import { fullBleedSkeleton } from './lazyMap';

export default dynamic(() => import('./CountriesGlobe'), {
  ssr: false,
  loading: fullBleedSkeleton('Loading globe'),
});
