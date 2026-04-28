// === Pins ==================================================================
// Read-only data layer for the /pins route. Wraps Supabase queries against
// public.pins. Cached via React.cache() so a page that needs both the index
// list and a single pin (e.g. detail page that wants neighbors) only hits
// Postgres once.
//
// Pin shape mirrors the Postgres columns (see migration
// `create_pins_table_for_go_travel_atlas`). One ergonomic addition: a
// derived `googleMapsUrl` that's cheaper to use at render time than asking
// every component to assemble it.
//
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

export type PinImage = {
  url: string;
  width?: number | null;
  height?: number | null;
  filename?: string | null;
  type?: string | null;
};

export type Pin = {
  id: string;
  airtableId: string | null;
  name: string;
  slug: string | null;

  lat: number | null;
  lng: number | null;
  cityNames: string[];
  statesNames: string[];

  category: string | null;
  description: string | null;
  hours: string | null;
  priceText: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;

  unescoId: number | null;
  website: string | null;
  images: PinImage[];

  visited: boolean;

  // Wikidata enrichment (populated by scripts/wikidata_enrich pass —
  // see migration `pins_enrichment_columns`). Most pins have a QID;
  // ~70% have a Wikipedia article; ~30% have an inception year.
  wikidataQid: string | null;
  wikipediaUrl: string | null;
  inceptionYear: number | null;
  durationMinutes: number | null;
  /** "Instance of" labels from Wikidata, e.g. ["archaeological site", "national park"]. */
  tags: string[];
  /** Notable lists this pin appears on, e.g. ["UNESCO World Heritage", "Atlas Obscura"]. */
  lists: string[];
  /** Optional 1-12 month numbers for "best time to visit" — currently always empty; reserved. */
  bestMonths: number[];

  airtableModifiedAt: string | null;
  updatedAt: string | null;

  /** Derived: a Google Maps deep-link if we have coords. null otherwise. */
  googleMapsUrl: string | null;
  /** Derived: link to the UNESCO World Heritage page when applicable. */
  unescoUrl: string | null;
  /** Derived: link to the Wikidata entity when applicable. */
  wikidataUrl: string | null;
};

// ---- Row → Pin -------------------------------------------------------------
// Postgres returns snake_case; everywhere else in the app uses camelCase.
// The mapper also derives the convenience URLs so views don't repeat the
// "have lat/lng?" guard.
//
// `images` is jsonb in Postgres — it comes back already parsed, but TS sees
// it as `unknown`, so we coerce + filter to keep the public type honest.
function rowToPin(row: any): Pin {
  const lat = typeof row.lat === 'number' ? row.lat : null;
  const lng = typeof row.lng === 'number' ? row.lng : null;
  const googleMapsUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null;
  const unescoId = typeof row.unesco_id === 'number' ? row.unesco_id : null;
  const unescoUrl = unescoId != null
    ? `https://whc.unesco.org/en/list/${unescoId}/`
    : null;
  const wikidataQid = typeof row.wikidata_qid === 'string' ? row.wikidata_qid : null;
  const wikidataUrl = wikidataQid ? `https://www.wikidata.org/wiki/${wikidataQid}` : null;

  const rawImages = Array.isArray(row.images) ? row.images : [];
  const images: PinImage[] = rawImages
    .filter((i: any) => i && typeof i.url === 'string')
    .map((i: any) => ({
      url: i.url,
      width: typeof i.width === 'number' ? i.width : null,
      height: typeof i.height === 'number' ? i.height : null,
      filename: i.filename ?? null,
      type: i.type ?? null,
    }));

  return {
    id: row.id,
    airtableId: row.airtable_id ?? null,
    name: row.name,
    slug: row.slug ?? null,
    lat,
    lng,
    cityNames: Array.isArray(row.city_names) ? row.city_names : [],
    statesNames: Array.isArray(row.states_names) ? row.states_names : [],
    category: row.category ?? null,
    description: row.description ?? null,
    hours: row.hours ?? null,
    priceText: row.price_text ?? null,
    priceAmount: typeof row.price_amount === 'number' ? row.price_amount : null,
    priceCurrency: row.price_currency ?? null,
    unescoId,
    website: row.website ?? null,
    images,
    visited: !!row.visited,

    // Wikidata-enriched fields
    wikidataQid,
    wikipediaUrl: typeof row.wikipedia_url === 'string' ? row.wikipedia_url : null,
    inceptionYear: typeof row.inception_year === 'number' ? row.inception_year : null,
    durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
    tags:        Array.isArray(row.tags)        ? row.tags        : [],
    lists:       Array.isArray(row.lists)       ? row.lists       : [],
    bestMonths:  Array.isArray(row.best_months) ? row.best_months : [],

    airtableModifiedAt: row.airtable_modified_at ?? null,
    updatedAt: row.updated_at ?? null,
    googleMapsUrl,
    unescoUrl,
    wikidataUrl,
  };
}

// ---- Queries ---------------------------------------------------------------

/**
 * Every pin, name-sorted. 1,342 rows today; small enough to fetch as a
 * batch. Cached two ways:
 *
 *   • unstable_cache (Next data cache) — persists across requests AND
 *     across routes. The Sidebar in the layout calls this on every page
 *     view; without the data cache, a Supabase round-trip would happen
 *     on every navigation that landed on a cold ISR entry.
 *   • React.cache() — within a single render, dedupes (e.g. Sidebar +
 *     /pins/cards both call fetchAllPins() and resolve to one promise).
 *
 * Revalidates every 24h or via revalidateTag('supabase-pins').
 */
const _fetchAllPins = unstable_cache(
  async (): Promise<Pin[]> => {
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      console.error('[pins] fetchAllPins failed:', error);
      return [];
    }
    return (data ?? []).map(rowToPin);
  },
  ['supabase-pins'],
  { revalidate: 86400, tags: ['supabase-pins'] }
);
export const fetchAllPins = cache(_fetchAllPins);

/**
 * Single pin by slug. Resolved against the cached full set rather than
 * a separate Supabase call, so detail-page navigation reuses whatever
 * the layout/index already warmed up. Falls back to a direct query as
 * a last resort (e.g. brand-new pin with stale cache).
 */
export const fetchPinBySlug = cache(async (slug: string): Promise<Pin | null> => {
  const all = await fetchAllPins();
  const found = all.find(p => p.slug === slug);
  if (found) return found;

  // Cold-cache fallback: hit Supabase directly.
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error(`[pins] fetchPinBySlug(${slug}) failed:`, error);
    return null;
  }
  return data ? rowToPin(data) : null;
});
