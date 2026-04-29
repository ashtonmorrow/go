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

export type PinStatus = 'active' | 'closed' | 'temporarily-closed' | 'seasonal' | 'unknown';
export type PinBooking = 'no' | 'recommended' | 'required' | 'timed-entry-only';
export type PinCrowdLevel = 'always-quiet' | 'morning-quiet' | 'consistently-busy' | 'seasonal-spikes' | 'unknown';
export type PinFoodOnSite = 'none' | 'kiosk' | 'cafe' | 'restaurant' | 'multiple' | 'unknown';
export type PinRestrooms = 'none' | 'basic' | 'modern' | 'paid' | 'unknown';
export type PinShade = 'fully-shaded' | 'partly-shaded' | 'fully-exposed' | 'covered-indoor' | 'unknown';
export type PinIndoorOutdoor = 'indoor' | 'outdoor' | 'mixed' | 'unknown';
export type PinWheelchair = 'fully' | 'partially' | 'no' | 'unknown';
export type PinPhotography = 'allowed' | 'no-flash' | 'paid-permit' | 'restricted' | 'forbidden' | 'unknown';
export type PinDifficulty = 'easy' | 'moderate' | 'hard' | 'expert' | 'unknown';
export type PinParking = 'free' | 'paid' | 'street' | 'limited' | 'none' | 'unknown';
export type PinRequiresGuide = 'no' | 'recommended' | 'required' | 'unknown';
export type PinTimeOfDay = 'sunrise' | 'morning' | 'midday' | 'afternoon' | 'sunset' | 'evening' | 'night';

export type PinAdmission = {
  adult?: number | null;
  child?: number | null;
  senior?: number | null;
  student?: number | null;
  currency?: string | null;
  free_under_age?: number | null;
  notes?: string | null;
};

export type PinTransit = {
  station?: string | null;
  line?: string | null;
  walking_minutes?: number | null;
};

export type PinOpeningHours = {
  mon?: string[];
  tue?: string[];
  wed?: string[];
  thu?: string[];
  fri?: string[];
  sat?: string[];
  sun?: string[];
  notes?: string | null;
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

  wikidataQid: string | null;
  wikipediaUrl: string | null;
  inceptionYear: number | null;
  durationMinutes: number | null;
  tags: string[];
  lists: string[];
  bestMonths: number[];

  airtableModifiedAt: string | null;
  updatedAt: string | null;

  address: string | null;
  openingHours: PinOpeningHours | null;
  closureDays: string[];
  status: PinStatus | null;
  closureReason: string | null;

  admission: PinAdmission | null;
  free: boolean | null;
  booking: PinBooking | null;
  bookingUrl: string | null;
  officialTicketUrl: string | null;

  bestTimeOfDay: PinTimeOfDay[];
  worstMonths: number[];
  crowdLevel: PinCrowdLevel | null;

  foodOnSite: PinFoodOnSite | null;
  waterRefill: boolean | null;
  restrooms: PinRestrooms | null;
  wifi: boolean | null;
  lockers: boolean | null;
  shade: PinShade | null;
  indoorOutdoor: PinIndoorOutdoor | null;

  wheelchairAccessible: PinWheelchair | null;
  strollerFriendly: boolean | null;
  kidFriendly: boolean | null;
  minAgeRecommended: number | null;
  petFriendly: boolean | null;
  photography: PinPhotography | null;
  dressCode: string | null;
  difficulty: PinDifficulty | null;

  nearestTransit: PinTransit | null;
  parking: PinParking | null;
  accessNotes: string | null;

  bring: string[];

  safetyNotes: string | null;
  scamWarning: string | null;
  requiresPermit: boolean | null;
  requiresGuide: PinRequiresGuide | null;
  languagesOffered: string[];

  googleMapsUrl: string | null;
  unescoUrl: string | null;
  wikidataUrl: string | null;
};

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const asNumberArray = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

const STATUSES = ['active', 'closed', 'temporarily-closed', 'seasonal', 'unknown'] as const;
const BOOKINGS = ['no', 'recommended', 'required', 'timed-entry-only'] as const;
const CROWDS = ['always-quiet', 'morning-quiet', 'consistently-busy', 'seasonal-spikes', 'unknown'] as const;
const FOODS = ['none', 'kiosk', 'cafe', 'restaurant', 'multiple', 'unknown'] as const;
const RESTROOMS = ['none', 'basic', 'modern', 'paid', 'unknown'] as const;
const SHADES = ['fully-shaded', 'partly-shaded', 'fully-exposed', 'covered-indoor', 'unknown'] as const;
const INDOOR = ['indoor', 'outdoor', 'mixed', 'unknown'] as const;
const WHEELCHAIR = ['fully', 'partially', 'no', 'unknown'] as const;
const PHOTOGRAPHY = ['allowed', 'no-flash', 'paid-permit', 'restricted', 'forbidden', 'unknown'] as const;
const DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert', 'unknown'] as const;
const PARKINGS = ['free', 'paid', 'street', 'limited', 'none', 'unknown'] as const;
const GUIDES = ['no', 'recommended', 'required', 'unknown'] as const;
const TIMES = ['sunrise', 'morning', 'midday', 'afternoon', 'sunset', 'evening', 'night'] as const;

function rowToPin(row: any): Pin {
  const lat = asNumber(row.lat);
  const lng = asNumber(row.lng);
  const googleMapsUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null;
  const unescoId = asNumber(row.unesco_id);
  const unescoUrl = unescoId != null ? `https://whc.unesco.org/en/list/${unescoId}/` : null;
  const wikidataQid = asString(row.wikidata_qid);
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

  const admission = row.admission && typeof row.admission === 'object' ? (row.admission as PinAdmission) : null;
  const openingHours = row.opening_hours && typeof row.opening_hours === 'object' ? (row.opening_hours as PinOpeningHours) : null;
  const nearestTransit = row.nearest_transit && typeof row.nearest_transit === 'object' ? (row.nearest_transit as PinTransit) : null;

  const bestTimeOfDay = asStringArray(row.best_time_of_day).filter((v): v is PinTimeOfDay =>
    (TIMES as readonly string[]).includes(v),
  );

  return {
    id: row.id,
    airtableId: row.airtable_id ?? null,
    name: row.name,
    slug: row.slug ?? null,
    lat,
    lng,
    cityNames: asStringArray(row.city_names),
    statesNames: asStringArray(row.states_names),
    category: row.category ?? null,
    description: row.description ?? null,
    hours: row.hours ?? null,
    priceText: row.price_text ?? null,
    priceAmount: asNumber(row.price_amount),
    priceCurrency: row.price_currency ?? null,
    unescoId,
    website: row.website ?? null,
    images,
    visited: !!row.visited,

    wikidataQid,
    wikipediaUrl: asString(row.wikipedia_url),
    inceptionYear: asNumber(row.inception_year),
    durationMinutes: asNumber(row.duration_minutes),
    tags: asStringArray(row.tags),
    lists: asStringArray(row.lists),
    bestMonths: asNumberArray(row.best_months),

    airtableModifiedAt: row.airtable_modified_at ?? null,
    updatedAt: row.updated_at ?? null,

    address: asString(row.address),
    openingHours,
    closureDays: asStringArray(row.closure_days),
    status: asEnum(row.status, STATUSES),
    closureReason: asString(row.closure_reason),

    admission,
    free: asBool(row.free),
    booking: asEnum(row.booking, BOOKINGS),
    bookingUrl: asString(row.booking_url),
    officialTicketUrl: asString(row.official_ticket_url),

    bestTimeOfDay,
    worstMonths: asNumberArray(row.worst_months),
    crowdLevel: asEnum(row.crowd_level, CROWDS),

    foodOnSite: asEnum(row.food_on_site, FOODS),
    waterRefill: asBool(row.water_refill),
    restrooms: asEnum(row.restrooms, RESTROOMS),
    wifi: asBool(row.wifi),
    lockers: asBool(row.lockers),
    shade: asEnum(row.shade, SHADES),
    indoorOutdoor: asEnum(row.indoor_outdoor, INDOOR),

    wheelchairAccessible: asEnum(row.wheelchair_accessible, WHEELCHAIR),
    strollerFriendly: asBool(row.stroller_friendly),
    kidFriendly: asBool(row.kid_friendly),
    minAgeRecommended: asNumber(row.min_age_recommended),
    petFriendly: asBool(row.pet_friendly),
    photography: asEnum(row.photography, PHOTOGRAPHY),
    dressCode: asString(row.dress_code),
    difficulty: asEnum(row.difficulty, DIFFICULTIES),

    nearestTransit,
    parking: asEnum(row.parking, PARKINGS),
    accessNotes: asString(row.access_notes),

    bring: asStringArray(row.bring),

    safetyNotes: asString(row.safety_notes),
    scamWarning: asString(row.scam_warning),
    requiresPermit: asBool(row.requires_permit),
    requiresGuide: asEnum(row.requires_guide, GUIDES),
    languagesOffered: asStringArray(row.languages_offered),

    googleMapsUrl,
    unescoUrl,
    wikidataUrl,
  };
}

const PAGE_SIZE = 1000;

const _fetchAllPins = unstable_cache(
  async (): Promise<Pin[]> => {
    const all: any[] = [];
    let start = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('pins')
        .select('*')
        .order('name', { ascending: true })
        .range(start, start + PAGE_SIZE - 1);
      if (error) {
        console.error('[pins] fetchAllPins page failed:', error);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
    return all.map(rowToPin);
  },
  ['supabase-pins'],
  { revalidate: 86400, tags: ['supabase-pins'] }
);
export const fetchAllPins = cache(_fetchAllPins);

export const fetchPinBySlug = cache(async (slug: string): Promise<Pin | null> => {
  const all = await fetchAllPins();
  const found = all.find(p => p.slug === slug);
  if (found) return found;

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
