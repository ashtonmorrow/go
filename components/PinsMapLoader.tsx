'use client';

import dynamic from 'next/dynamic';
import { fullBleedSkeleton } from './lazyMap';

export default dynamic(() => import('./PinsMap'), {
  ssr: false,
  loading: fullBleedSkeleton('Loading pin map'),
});
