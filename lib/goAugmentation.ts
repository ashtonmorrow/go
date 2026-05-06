import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from './supabaseAdmin';
import { GO_CITIES_TABLE, GO_COUNTRIES_TABLE } from './goTables';

const CITY_FIELDS = new Set([
  'name',
  'slug',
  'country',
  'country_id',
  'local_name',
  'been',
  'go',
  'lat',
  'lng',
  'population',
  'area',
  'elevation',
  'mayor',
  'founded',
  'demonym',
  'time_zone',
  'utc_offset',
  'avg_high',
  'avg_low',
  'rainfall',
  'koppen',
  'nicknames',
  'motto',
  'iata_airports',
  'sister_cities',
  'hero_image',
  'personal_photo',
  'city_flag',
  'wikidata_id',
  'wikipedia_url',
  'wikipedia_summary',
  'quote',
  'about',
  'why_visit',
  'avoid',
  'plac',
  'hot_season_name',
  'hot_season_description',
  'cold_season_name',
  'cooler_wetter_season',
  'my_google_places',
  'hero_photo_urls',
]);

const COUNTRY_FIELDS = new Set([
  'name',
  'slug',
  'iso2',
  'iso3',
  'continent',
  'capital',
  'language',
  'currency',
  'calling_code',
  'schengen',
  'plug_types',
  'voltage',
  'tap_water',
  'tipping',
  'emergency_number',
  'visa_us',
  'wikidata_id',
  'wikipedia_summary',
  'flag',
  'hero_photo_urls',
]);

type JsonRecord = Record<string, unknown>;

export type GoCityAugmentation = Partial<Record<(typeof CITY_FIELDS extends Set<infer K> ? K : never) & string, unknown>>;
export type GoCountryAugmentation = Partial<Record<(typeof COUNTRY_FIELDS extends Set<infer K> ? K : never) & string, unknown>>;

function pickAllowed(fields: unknown, allowed: Set<string>): JsonRecord {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('fields object required');
  }

  const update: JsonRecord = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) continue;
    update[key] = value;
  }

  if (!Object.keys(update).length) {
    throw new Error('no recognised fields');
  }

  update.updated_at = new Date().toISOString();
  return update;
}

export function cityAugmentationFields(fields: unknown): JsonRecord {
  return pickAllowed(fields, CITY_FIELDS);
}

export function countryAugmentationFields(fields: unknown): JsonRecord {
  return pickAllowed(fields, COUNTRY_FIELDS);
}

export function revalidateGoGeo(paths: string[] = []) {
  revalidateTag('supabase-cities');
  revalidateTag('supabase-countries');
  revalidateTag('notion-cities');
  revalidateTag('notion-countries');
  revalidatePath('/');
  revalidatePath('/cities');
  revalidatePath('/cities/cards');
  revalidatePath('/cities/map');
  revalidatePath('/cities/table');
  revalidatePath('/countries');
  revalidatePath('/countries/cards');
  revalidatePath('/countries/map');
  revalidatePath('/countries/table');
  for (const path of paths) revalidatePath(path);
}

export async function updateGoCity(idOrSlug: string, fields: unknown) {
  const update = cityAugmentationFields(fields);
  const sb = supabaseAdmin();
  const bySlug = !looksUuid(idOrSlug);
  const query = sb
    .from(GO_CITIES_TABLE)
    .update(update)
    .eq(bySlug ? 'slug' : 'id', idOrSlug)
    .select('id, name, slug')
    .maybeSingle();

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return null;
  revalidateGoGeo(data.slug ? [`/cities/${data.slug}`] : []);
  return data;
}

export async function updateGoCountry(idOrSlug: string, fields: unknown) {
  const update = countryAugmentationFields(fields);
  const sb = supabaseAdmin();
  const bySlug = !looksUuid(idOrSlug);
  const query = sb
    .from(GO_COUNTRIES_TABLE)
    .update(update)
    .eq(bySlug ? 'slug' : 'id', idOrSlug)
    .select('id, name, slug')
    .maybeSingle();

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return null;
  revalidateGoGeo(data.slug ? [`/countries/${data.slug}`] : []);
  return data;
}

function looksUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

