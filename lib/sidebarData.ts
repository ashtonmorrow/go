import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { fetchAllPins } from './pins';
import { fetchAllCities, fetchAllCountries } from './notion';
import { fetchAllSavedListsMeta } from './savedLists';
import { CANONICAL_LISTS } from './pinLists';

// === Sidebar aggregator ===================================================
// The Sidebar runs on every page render. It needs derived chip arrays
// (country options, category options, tag options, saved-list options)
// + a small counts object — total payload to the client is a few KB.
//
// Why this exists: fetchAllPins() returns ~7.5 MB of pin data, which
// Next's data cache rejects (`items over 2MB can not be cached`). That
// turned the underlying unstable_cache wrapper into a pass-through —
// every render hit Supabase for the full corpus to derive a few KB of
// chip data. We aggregate here, cache the small derived payload, and
// the heavy fetches happen once per cache window instead of per
// render.
//
// Cache TTL matches the longest-lived source (24h). Bust by hitting
// /api/revalidate with the source-table tags after Notion / Supabase
// edits land.

export type SidebarCounts = {
  cities: number;
  countries: number;
  been: number;
  go: number;
  saved: number;
  pins: number;
  lists: number;
};

export type SidebarChipData = {
  counts: SidebarCounts;
  countryOptions: string[];
  pinCountryOptions: string[];
  pinCategoryOptions: string[];
  pinListOptions: string[];
  pinTagOptions: string[];
  pinSavedListOptions: string[];
};

const ZERO: SidebarChipData = {
  counts: { cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0, lists: 0 },
  countryOptions: [],
  pinCountryOptions: [],
  pinCategoryOptions: [],
  pinListOptions: [],
  pinTagOptions: [],
  pinSavedListOptions: [],
};

const _fetchSidebarChipData = unstable_cache(
  async (): Promise<SidebarChipData> => {
    let cities, countries, pins, listsMeta;
    try {
      [cities, countries, pins, listsMeta] = await Promise.all([
        fetchAllCities(),
        fetchAllCountries(),
        fetchAllPins(),
        fetchAllSavedListsMeta(),
      ]);
    } catch (err) {
      console.error('[sidebarData] corpus fetch failed:', err);
      return ZERO;
    }

    const counts: SidebarCounts = {
      cities: cities.length,
      countries: countries.length,
      been: cities.filter(c => c.been).length,
      go: cities.filter(c => c.go).length,
      saved: cities.filter(c => !!c.myGooglePlaces).length,
      pins: pins.length,
      lists: listsMeta.size,
    };

    const countryOptions = Array.from(
      new Set(cities.map(c => c.country).filter((s): s is string => !!s)),
    ).sort((a, b) => a.localeCompare(b));

    const pinCountryOptions = Array.from(
      new Set(pins.map(p => p.statesNames[0]).filter((s): s is string => !!s)),
    ).sort((a, b) => a.localeCompare(b));

    const pinCategoryOptions = Array.from(
      new Set(pins.map(p => p.category).filter((s): s is string => !!s)),
    ).sort((a, b) => a.localeCompare(b));

    const seenLists = new Set<string>();
    for (const p of pins) for (const l of p.lists) seenLists.add(l);
    const pinListOptions = (CANONICAL_LISTS as readonly string[]).filter(l =>
      seenLists.has(l),
    );

    const tagCounts = new Map<string, number>();
    for (const p of pins) for (const t of p.tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const pinTagOptions = Array.from(tagCounts.entries())
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);

    const savedListCounts = new Map<string, number>();
    for (const p of pins) for (const l of p.savedLists) {
      savedListCounts.set(l, (savedListCounts.get(l) ?? 0) + 1);
    }
    const pinSavedListOptions = Array.from(savedListCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([name]) => name);

    return {
      counts,
      countryOptions,
      pinCountryOptions,
      pinCategoryOptions,
      pinListOptions,
      pinTagOptions,
      pinSavedListOptions,
    };
  },
  ['sidebar-chip-data-v1'],
  {
    revalidate: 86400,
    tags: [
      'supabase-pins',
      'supabase-cities',
      'supabase-countries',
      'saved-lists-meta',
    ],
  },
);

export const fetchSidebarChipData = cache(_fetchSidebarChipData);
