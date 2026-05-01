'use client';

// === PinViewPrimer =========================================================
// Tiny client-only helper that primes PinFiltersContext with a view's
// filter patch when the user lands on a /pins/views/<slug> route.
//
// Why a primer instead of an `initialState` prop on the provider:
//   * The provider is mounted at the layout level (app/layout.tsx) and
//     wraps every page on the site. Threading initial state from a
//     specific route up to the root layout would mean lifting state into
//     the URL and re-mounting the provider on every navigation — too
//     heavy for the gain.
//   * A page-scoped useEffect that runs once, applies the patch, and
//     re-runs only if the view slug changes is the smallest change.
//
// The component renders nothing — it exists for the side effect.

import { useEffect } from 'react';
import { usePinFilters, type PinFilterState } from './PinFiltersContext';
import type { PinView } from '@/lib/pinViews';

export default function PinViewPrimer({ view }: { view: PinView }) {
  const ctx = usePinFilters();
  useEffect(() => {
    if (!ctx) return;
    // Merge the patch onto whatever the user might have toggled on a
    // previous page so the view's curated state wins, but the existing
    // `q` (search box) survives — typing a search and following a view
    // link shouldn't blow your typing away.
    ctx.setState(prev => ({
      ...prev,
      ...(view.filterPatch as Partial<PinFilterState>),
    }));
    // Intentionally do NOT depend on `ctx.setState` (it's stable from
    // the provider) — re-running on view.slug is enough.
  }, [view.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
