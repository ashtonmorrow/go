'use client';

// Shared loading skeletons for the dynamic-imported MapLibre wrappers.
// Every map component in the atlas (WorldGlobe, CountriesGlobe, PinsMap,
// ListMapAndCards, AirportsView, KusttramRouteMap) imports MapLibre, which
// touches `window` at module load and so has to be dynamic-imported with
// ssr:false. The wrapper files are otherwise identical except for the
// path being imported, the skeleton height, and the aria-label. This
// file holds the shared skeleton variants so the wrapper files can be
// one-liners.

export function fullBleedSkeleton(ariaLabel: string) {
  return () => (
    <div
      className="w-full bg-cream-soft animate-pulse h-[calc(100svh-56px)] md:h-screen"
      aria-label={ariaLabel}
    />
  );
}

export function inlineSkeleton(heightClass: string, ariaLabel: string) {
  return () => (
    <div
      className={`mt-5 w-full bg-cream-soft animate-pulse rounded-lg border border-sand ${heightClass}`}
      aria-label={ariaLabel}
    />
  );
}
