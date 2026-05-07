import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { fetchAllSavedListsMeta } from './savedLists';
import { CANONICAL_LISTS } from './pinLists';
import { GO_CITIES_TABLE, GO_COUNTRIES_TABLE } from './goTables';

// === Sidebar aggregator ===================================================
// The Sidebar runs on every page render. It needs derived chip arrays
// (country options, category options, tag options, saved-list options)
// + a small counts object — total payload to the client is a few KB.
//
// Why this exists: the full pin corpus is too large for Next's data
// cache, but the sidebar only needs a few chip fields. We fetch that
// narrow shape directly, aggregate it here, and cache the small derived
// payload instead of pulling every pin detail into every page render.
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

type SidebarPinChipRow = {
  id: string;
  statesNames: string[];
  category: string | null;
  lists: string[];
  tags: string[];
  savedLists: string[];
};

type SidebarCityChipRow = {
  name: string;
  country: string | null;
  been: boolean;
  go: boolean;
  myGooglePlaces: string | null;
};

type SidebarCountryChipRow = {
  name: string;
};

async function selectAllSidebarRows(
  table: string,
  columns: string,
  options: { excludeDeleted?: boolean; order?: string } = {},
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000;
  let countQuery = supabase
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (options.excludeDeleted) {
    countQuery = countQuery.not('slug', 'like', 'delete-%');
  }

  const { count, error: countError } = await countQuery;
  if (countError || count == null) {
    console.error(`[sidebarData] ${table} count failed:`, countError);
    return [];
  }

  const ranges = Array.from(
    { length: Math.max(1, Math.ceil(count / PAGE_SIZE)) },
    (_, i) => [i * PAGE_SIZE, Math.min((i + 1) * PAGE_SIZE - 1, count - 1)],
  );

  const pages = await Promise.all(
    ranges.map(([from, to]) => {
      let query = supabase
        .from(table)
        .select(columns)
        .range(from, to);
      if (options.excludeDeleted) {
        query = query.not('slug', 'like', 'delete-%');
      }
      if (options.order) {
        query = query.order(options.order);
      }
      return query.then(res => {
        if (res.error) {
          console.error(`[sidebarData] ${table} page ${from}-${to} failed:`, res.error);
          return [] as Record<string, unknown>[];
        }
        return ((res.data ?? []) as unknown) as Record<string, unknown>[];
      });
    }),
  );

  return pages.flat();
}

const _fetchSidebarCityChipRows = unstable_cache(
  async (): Promise<SidebarCityChipRow[]> => {
    const rows = await selectAllSidebarRows(
      GO_CITIES_TABLE,
      'name, country, been, go, my_google_places',
      { excludeDeleted: true, order: 'name' },
    );
    return rows.map(row => ({
      name: (row.name as string | null) ?? '',
      country: (row.country as string | null) ?? null,
      been: !!row.been,
      go: !!row.go,
      myGooglePlaces: (row.my_google_places as string | null) ?? null,
    }));
  },
  ['sidebar-city-chip-rows-v2'],
  { revalidate: 300, tags: ['supabase-cities', 'notion-cities'] },
);

const _fetchSidebarCountryChipRows = unstable_cache(
  async (): Promise<SidebarCountryChipRow[]> => {
    const rows = await selectAllSidebarRows(
      GO_COUNTRIES_TABLE,
      'name',
      { excludeDeleted: true, order: 'name' },
    );
    return rows.map(row => ({
      name: (row.name as string | null) ?? '',
    }));
  },
  ['sidebar-country-chip-rows-v2'],
  { revalidate: 300, tags: ['supabase-countries', 'notion-countries'] },
);

const _fetchSidebarPinChipRows = unstable_cache(
  async (): Promise<SidebarPinChipRow[]> => {
    const rows = await selectAllSidebarRows(
      'pins',
      'id, states_names, category, lists, tags, saved_lists',
      { order: 'name' },
    );
    return rows.map(row => ({
      id: row.id as string,
      statesNames: (row.states_names as string[] | null) ?? [],
      category: (row.category as string | null) ?? null,
      lists: (row.lists as string[] | null) ?? [],
      tags: (row.tags as string[] | null) ?? [],
      savedLists: (row.saved_lists as string[] | null) ?? [],
    }));
  },
  ['sidebar-pin-chip-rows-v2'],
  { revalidate: 86400, tags: ['supabase-pins'] },
);

const _fetchSidebarChipData = unstable_cache(
  async (): Promise<SidebarChipData> => {
    let cities, countries, pins, listsMeta;
    try {
      [cities, countries, pins, listsMeta] = await Promise.all([
        _fetchSidebarCityChipRows(),
        _fetchSidebarCountryChipRows(),
        _fetchSidebarPinChipRows(),
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
  ['sidebar-chip-data-v2'],
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
