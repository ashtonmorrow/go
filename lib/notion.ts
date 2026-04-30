import { Client, APIResponseError } from '@notionhq/client';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

// PHASE 2 NOTE — Apr 2026
// =========================================================================
// This file is named notion.ts for git-history continuity, but the runtime
// reads for cities + countries are now backed by Supabase tables (mirrored
// from the original Notion databases via scripts/migrate-notion-to-supabase.ts).
// The Notion API call path is kept *only* for fetchPageBlocks, which still
// renders legacy Notion blocks for any city/country page that doesn't yet
// have a /content/<scope>/<slug>.md file overriding the prose.
//
// Why the file isn't renamed: 21 import sites depend on `@/lib/notion` and
// the public surface here (City, Country, fetchAllCities, fetchCityBySlug,
// fetchAllCountries, fetchCountryBySlug, fetchPageBlocks) hasn't changed.
// We can rename later in a mechanical pass; for now keep the surface and
// swap the internals.
//
// Cache layer: Supabase is fast (~30-80ms) so we drop the 24h unstable_cache
// in favor of a 5-minute one. Edits in Supabase Studio appear within minutes
// rather than waiting for a manual revalidate. Tag names kept as
// `notion-cities` / `notion-countries` so the existing /api/revalidate
// endpoint still works.

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Retry wrapper with exponential backoff for Notion's rate_limited (429) errors.
// Notion returns a Retry-After header; we honor it when present.
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e instanceof APIResponseError && e.code === 'rate_limited') {
        // Retry-After may be exposed on the error headers; default to exp backoff
        const hdr = (e as any).headers?.get?.('retry-after');
        const retryAfterMs = hdr ? parseFloat(hdr) * 1000 : Math.min(1000 * 2 ** i, 10000);
        await new Promise(r => setTimeout(r, retryAfterMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Notion database IDs. The Notion SDK's `databases.query` uses these directly for single-source databases.
export const CITIES_DB = '2d3fdea3fd4b8080b8e4fc674cdf8cd4';
export const COUNTRIES_DB = 'a925032ca4da48fa952e9dde3713955f';

export type City = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  countryPageId: string | null;
  localName: string | null;
  been: boolean;
  go: boolean;
  lat: number | null;
  lng: number | null;
  population: number | null;
  area: number | null;
  elevation: number | null;
  mayor: string | null;
  founded: string | null;
  demonym: string | null;
  timeZone: string | null;
  utcOffset: string | null;
  avgHigh: number | null;
  avgLow: number | null;
  rainfall: number | null;
  koppen: string | null;
  nicknames: string | null;
  motto: string | null;
  iataAirports: string | null;
  sisterCities: string[]; // page IDs
  heroImage: string | null;
  personalPhoto: string | null;
  cityFlag: string | null;
  wikidataId: string | null;
  wikipediaUrl: string | null;
  wikipediaSummary: string | null;
  quote: string | null;
  about: string | null;
  whyVisit: string | null;
  avoid: string | null;
  plac: string | null;
  hotSeasonName: string | null;
  hotSeasonDescription: string | null;
  coldSeasonName: string | null;
  coolerWetterSeason: string | null;
  myGooglePlaces: string | null;
  savedPlaces: string | null;
};

export type Country = {
  id: string;
  name: string;
  slug: string;
  iso2: string | null;
  iso3: string | null;
  continent: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  plugTypes: string[];
  voltage: string | null;
  tapWater: string | null;
  tipping: string | null;
  emergencyNumber: string | null;
  visaUs: string | null;
  wikidataId: string | null;
  wikipediaSummary: string | null;
  flag: string | null;
};

// Detects curated Flag URLs whose path component is empty — happens when
// a flagcdn template like `https://flagcdn.com/w640/${iso2}.png` was
// resolved with an empty iso2 (the bug that broke the Antarctica record
// before we set ISO2='AQ' on it). When the URL is shaped like this, we
// disregard the curated value and fall through to the iso2-derived URL.
const BROKEN_FLAGCDN = /\/flagcdn\.com\/[^/]+\/(?:\.|_+\.)/;

function looksBroken(url: string | null): boolean {
  if (!url) return true;
  return BROKEN_FLAGCDN.test(url);
}

// ---- Supabase row → camelCase shape mappers ----

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function supaCityRow(r: any): City {
  return {
    id:                   r.id,
    name:                 r.name ?? '',
    slug:                 r.slug ?? '',
    country:              r.country ?? null,
    countryPageId:        r.country_id ?? null,
    localName:            r.local_name ?? null,
    been:                 !!r.been,
    go:                   !!r.go,
    lat:                  asNum(r.lat),
    lng:                  asNum(r.lng),
    population:           asNum(r.population),
    area:                 asNum(r.area),
    elevation:            asNum(r.elevation),
    mayor:                r.mayor ?? null,
    founded:              r.founded ?? null,
    demonym:              r.demonym ?? null,
    timeZone:             r.time_zone ?? null,
    utcOffset:            r.utc_offset ?? null,
    avgHigh:              asNum(r.avg_high),
    avgLow:               asNum(r.avg_low),
    rainfall:             asNum(r.rainfall),
    koppen:               r.koppen ?? null,
    nicknames:            r.nicknames ?? null,
    motto:                r.motto ?? null,
    iataAirports:         r.iata_airports ?? null,
    sisterCities:         Array.isArray(r.sister_cities) ? r.sister_cities : [],
    heroImage:            r.hero_image ?? null,
    personalPhoto:        r.personal_photo ?? null,
    cityFlag:             r.city_flag ?? null,
    wikidataId:           r.wikidata_id ?? null,
    wikipediaUrl:         r.wikipedia_url ?? null,
    wikipediaSummary:     r.wikipedia_summary ?? null,
    quote:                r.quote ?? null,
    about:                r.about ?? null,
    whyVisit:             r.why_visit ?? null,
    avoid:                r.avoid ?? null,
    plac:                 r.plac ?? null,
    hotSeasonName:        r.hot_season_name ?? null,
    hotSeasonDescription: r.hot_season_description ?? null,
    coldSeasonName:       r.cold_season_name ?? null,
    coolerWetterSeason:   r.cooler_wetter_season ?? null,
    myGooglePlaces:       r.my_google_places ?? null,
    savedPlaces:          r.my_google_places ?? null, // legacy duplicate
  };
}

function supaCountryRow(r: any): Country {
  // Same flagcdn fallback the Notion mapper used. The migrator already
  // wrote a non-broken value into r.flag, but keeping the fallback here
  // means an iso2-only country (no curated flag yet) still renders.
  const iso2 = r.iso2 ?? null;
  const curated = r.flag ?? null;
  const flag = !looksBroken(curated)
    ? curated
    : iso2
    ? `https://flagcdn.com/${(iso2 as string).toLowerCase()}.svg`
    : null;
  return {
    id:                r.id,
    name:              r.name ?? '',
    slug:              r.slug ?? '',
    iso2,
    iso3:              r.iso3 ?? null,
    continent:         r.continent ?? null,
    capital:           r.capital ?? null,
    language:          r.language ?? null,
    currency:          r.currency ?? null,
    callingCode:       r.calling_code ?? null,
    schengen:          !!r.schengen,
    plugTypes:         Array.isArray(r.plug_types) ? r.plug_types : [],
    voltage:           r.voltage ?? null,
    tapWater:          r.tap_water ?? null,
    tipping:           r.tipping ?? null,
    emergencyNumber:   r.emergency_number ?? null,
    visaUs:            r.visa_us ?? null,
    wikidataId:        r.wikidata_id ?? null,
    wikipediaSummary:  r.wikipedia_summary ?? null,
    flag,
  };
}

// ---- Fetchers ----
// Cache layer: Supabase queries run ~30-80ms warm, ~150ms cold. The 5-min
// unstable_cache + React.cache() combo gives us cross-render persistence
// (the Sidebar + page body don't double-fetch) and short enough TTL that
// edits in Supabase Studio show up without a manual revalidate trip. The
// existing /api/revalidate route's `notion-cities` and `notion-countries`
// tags still work — same key strings, just a different data source behind
// them.

const CACHE_REVALIDATE_SECONDS = 300; // 5min

// Supabase select bumped to 5000 to comfortably hold the ~1,400 cities.
// PostgREST's default limit is 1000 which would silently truncate. The
// pagination loop is also a safety net if the table grows past 5k.
async function selectAll<T>(table: 'cities' | 'countries'): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('name')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[supabase ${table}] fetch failed:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

const _fetchAllCities = unstable_cache(
  async (): Promise<City[]> => {
    const rows = await selectAll<any>('cities');
    return rows.map(supaCityRow);
  },
  ['notion-cities'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['notion-cities'] }
);
export const fetchAllCities = cache(_fetchAllCities);

const _fetchAllCountries = unstable_cache(
  async (): Promise<Country[]> => {
    const rows = await selectAll<any>('countries');
    return rows.map(supaCountryRow);
  },
  ['notion-countries'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['notion-countries'] }
);
export const fetchAllCountries = cache(_fetchAllCountries);

// Direct slug lookups — single-row indexed queries, way faster than
// loading the full table just to .find() a match. Wrapped in unstable_cache
// per slug so a popular detail page only hits Supabase once per 5min window.
const _fetchCityBySlug = unstable_cache(
  async (slug: string): Promise<City | null> => {
    if (!slug) return null;
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return supaCityRow(data);
  },
  ['notion-city-by-slug'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['notion-cities'] }
);
export const fetchCityBySlug = cache(_fetchCityBySlug);

const _fetchCountryBySlug = unstable_cache(
  async (slug: string): Promise<Country | null> => {
    if (!slug) return null;
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return supaCountryRow(data);
  },
  ['notion-country-by-slug'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['notion-countries'] }
);
export const fetchCountryBySlug = cache(_fetchCountryBySlug);

// Blocks vary per page so caching is per-pageId. Wrapping with `cache()` still
// dedupes multiple calls for the same pageId within a render.
//
// PERF: this used to be the slowest fetch on the city + country detail
// pages — Notion's blocks.children.list runs 500ms-2s per call, and we
// were doing it uncached on every request. Wrapping with `unstable_cache`
// keyed on the pageId means the second request to a given detail page
// hits the Next.js data cache instead of Notion. Combined with the
// content-file short-circuit at the call sites, most detail-page renders
// no longer touch Notion at all for blocks.
const _fetchPageBlocks = unstable_cache(
  async (pageId: string): Promise<any[]> => {
    if (!process.env.NOTION_TOKEN) return [];
    const blocks: any[] = [];
    let cursor: string | undefined;
    do {
      const res: any = await withRetry(() =>
        notion.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        })
      );
      blocks.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return blocks;
  },
  ['notion-page-blocks'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['notion-page-blocks'] }
);
export const fetchPageBlocks = cache(_fetchPageBlocks);
