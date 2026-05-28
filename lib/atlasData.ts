import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { supabase } from './supabase';
import { sovereignParent, isSubNational } from './sovereignty';
import { readListContent } from './content';
import { getAllArticleEntries } from './articles';
import { GO_CITIES_TABLE, GO_COUNTRIES_TABLE } from './goTables';

// === atlasData =============================================================
// Slim aggregator for /atlas. The page used to call fetchAllPins (19 MB),
// fetchAllCities (7.5 MB), and fetchAllCountries (smaller) — all three
// exceeded Next's 2 MB data-cache ceiling, so every render hit Supabase
// fresh. The build output showed it explicitly:
//
//   Failed to set Next.js data cache for unstable_cache /atlas
//   ...items over 2MB can not be cached (19079940 bytes)
//
// This module fetches narrow column slices instead:
//   - cities: { name, slug, lat, lng, been }   ~100 bytes × 1300 = ~130 KB
//   - sovereign country count (one number)
//   - visited-country set (derived from pin.states_names rollup query)
//   - pin / visited-pin counts (one number each, via PostgREST count)
//   - guides + articles counts (filesystem walk, already cheap)
//
// Total cached payload: ~200 KB, well under the 2 MB cap. Cached for
// 1 hour to match the page-level revalidate.

export type AtlasCity = {
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  been: boolean;
};

export type AtlasData = {
  cities: AtlasCity[];
  visitedCountryNames: string[];
  sovereignCountryTotal: number;
  totalCities: number;
  visitedCities: number;
  totalPins: number;
  visitedPins: number;
  guidesCount: number;
  articlesCount: number;
};

const _fetchAtlasData = unstable_cache(
  async (): Promise<AtlasData> => {
    const [citiesRes, countriesRes, pinsRes, contentCounts] = await Promise.all([
      // Slim cities — only the columns the globe + counts need.
      supabase
        .from(GO_CITIES_TABLE)
        .select('name, slug, lat, lng, been')
        .order('name', { ascending: true }),
      // Country names only — sovereign filtering is name-based.
      supabase
        .from(GO_COUNTRIES_TABLE)
        .select('name'),
      // Pins reduced to {visited, statesNames[0]} for the country
      // visited-set rollup and the visited-pin count.
      supabase
        .from('pins')
        .select('visited, states_names'),
      countPublishedContent(),
    ]);

    if (citiesRes.error) console.error('[atlasData] cities:', citiesRes.error);
    if (countriesRes.error) console.error('[atlasData] countries:', countriesRes.error);
    if (pinsRes.error) console.error('[atlasData] pins:', pinsRes.error);

    const cities: AtlasCity[] = (citiesRes.data ?? []).map(r => ({
      name: r.name as string,
      slug: r.slug as string,
      lat: (r.lat as number | null) ?? null,
      lng: (r.lng as number | null) ?? null,
      been: !!r.been,
    }));

    const countryNames: string[] = (countriesRes.data ?? []).map(
      r => r.name as string,
    );
    const sovereignCountryTotal = countryNames.filter(n => !isSubNational(n)).length;

    const visitedCountryNamesSet = new Set<string>();
    let visitedPins = 0;
    const pinRows = (pinsRes.data ?? []) as Array<{
      visited: boolean | null;
      states_names: string[] | null;
    }>;
    for (const p of pinRows) {
      if (!p.visited) continue;
      visitedPins++;
      const country = p.states_names?.[0];
      if (country) {
        const parent = sovereignParent(country);
        if (parent) visitedCountryNamesSet.add(parent);
      }
    }

    return {
      cities,
      visitedCountryNames: Array.from(visitedCountryNamesSet).sort(),
      sovereignCountryTotal,
      totalCities: cities.length,
      visitedCities: cities.filter(c => c.been).length,
      totalPins: pinRows.length,
      visitedPins,
      guidesCount: contentCounts.guidesCount,
      articlesCount: contentCounts.articlesCount,
    };
  },
  ['atlas-data-v1'],
  {
    revalidate: 3600,
    tags: ['supabase-pins', 'supabase-cities', 'supabase-countries'],
  },
);

export const fetchAtlasData = cache(_fetchAtlasData);

async function countPublishedContent(): Promise<{
  guidesCount: number;
  articlesCount: number;
}> {
  const dir = path.join(process.cwd(), 'content', 'lists');
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }
  const slugs = files.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
  const contents = await Promise.all(slugs.map(slug => readListContent(slug)));
  const guidesCount = contents.filter(c => c?.featured).length;
  const articles = await getAllArticleEntries();
  return { guidesCount, articlesCount: articles.length };
}
