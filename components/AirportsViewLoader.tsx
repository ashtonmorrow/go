'use client';

import dynamic from 'next/dynamic';
import { inlineSkeleton } from './lazyMap';

export default dynamic(() => import('./AirportsView'), {
  ssr: false,
  loading: inlineSkeleton('h-[480px]', 'Loading airport map'),
});
