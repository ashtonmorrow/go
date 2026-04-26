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

  airtableModifiedAt: string | null;
  updatedAt: string | null;

  /** Derived: a Google Maps deep-link if we have coords. null otherwise. */
  googleMapsUrl: string | null;
  /** Derived: link to the UNESCO World Heritage page when applicable. */
  unescoUrl: string | null;
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
    airtableModifiedAt: row.airtable_modified_at ?? null,
    updatedAt: row.updated_at ?? null,
    googleMapsUrl,
    unescoUrl,
  };
}

// ---- Queries ---------------------------------------------------------------

/**
 * Every pin, name-sorted. Currently ~5–15 records, so we hand the whole set
 * back. When the table grows past a few hundred rows we'll want to paginate
 * and / or filter at the query layer.
 */
export const fetchAllPins = cache(async (): Promise<Pin[]> => {
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.error('[pins] fetchAllPins failed:', error);
    return [];
  }
  return (data ?? []).map(rowToPin);
});

/**
 * Single pin by slug. Returns null when not found rather than throwing —
 * the page component decides whether to 404.
 */
export const fetchPinBySlug = cache(async (slug: string): Promise<Pin | null> => {
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
