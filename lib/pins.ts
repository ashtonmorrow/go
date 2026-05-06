import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { getReferencedSlugs } from './posts';

export type PinImage = {
  url: string;
  width?: number | null;
  height?: number | null;
  filename?: string | null;
  type?: string | null;
  /** Provenance tag from `pins.images[].source`. The string we care about
   *  is `'codex-generated'` — those AI-illustrated cards are meant for
   *  small-thumbnail contexts only and are filtered out of full-size
   *  hero rendering on the pin detail page. */
  source?: string | null;
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

export type PinKind = 'attraction' | 'shopping' | 'hotel' | 'park' | 'restaurant' | 'transit';

export const PIN_KIND_LABELS: Record<PinKind, string> = {
  attraction: 'Attraction',
  shopping: 'Shopping',
  hotel: 'Hotel',
  park: 'Park',
  restaurant: 'Restaurant',
  transit: 'Transit',
};

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

/** Richer hours shape codex writes — handles ramadan, parent-site refs,
 *  free-form weekly notes that the simpler PinOpeningHours can't capture. */
export type PinHoursDetails = {
  type?: string | null;
  weekly?: { daily?: string; mon?: string; tue?: string; wed?: string; thu?: string; fri?: string; sat?: string; sun?: string } | null;
  ramadan?: { daily?: string } | null;
  parent_site?: string | null;
  notes?: string[] | null;
};

export type PinPriceTier = {
  label: string;
  amount: number;
  currency: string;
};

/** Richer pricing shape codex writes — supports a baseline price plus
 *  variants (foreigner vs national, student vs adult, vehicle tickets). */
export type PinPriceDetails = {
  type?: string | null;
  baseline?: PinPriceTier | null;
  variants?: PinPriceTier[] | null;
  notes?: string[] | null;
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
  kind: PinKind | null;
  description: string | null;

  // Universal personal experience (any visited pin)
  personalRating: number | null;
  personalReview: string | null;
  visitYear: number | null;
  personalNotes: string | null;
  companions: string[];
  bestFor: string[];

  // Hotel-only structured + qualitative
  nightsStayed: number | null;
  roomType: string | null;
  roomPricePerNight: number | null;
  roomPriceCurrency: string | null;
  wouldStayAgain: boolean | null;
  hotelVibe: string[];
  breakfastQuality: string | null;
  wifiQuality: string | null;
  noiseLevel: string | null;
  locationPitch: string | null;

  // Restaurant-only
  cuisine: string[];
  mealTypes: string[];
  dishesTried: string[];
  dietaryOptions: string[];
  reservationRecommended: boolean | null;
  priceTier: '$' | '$$' | '$$$' | '$$$$' | null;
  pricePerPersonUsd: number | null;

  // SEO
  indexable: boolean;

  hours: string | null;
  priceText: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;

  unescoId: number | null;
  website: string | null;
  images: PinImage[];

  visited: boolean;

  /** Curated, ordered URLs of the photos to render in the hero gallery.
   *  When non-empty, the detail page uses these instead of the auto-pick
   *  HeroCollage. URLs match `personal_photos.url` or `pin.images[].url`. */
  heroPhotoUrls: string[];

  wikidataQid: string | null;
  wikipediaUrl: string | null;
  /** Atlas Obscura slug used to deep-link the Atlas Obscura chip
   *  (e.g. https://www.atlasobscura.com/places/<slug>). Falls back to
   *  the AO browse-all page when null. */
  atlasObscuraSlug: string | null;
  inceptionYear: number | null;
  durationMinutes: number | null;
  tags: string[];
  lists: string[];
  /** Mike's personal Google Maps saved-list memberships (Madrid, Bangkok 🇹🇭,
   *  Coffee Shops, etc). Distinct from `lists` which holds canonical lists
   *  like UNESCO World Heritage. Used by the "saved on my <city> list" filter. */
  savedLists: string[];
  bestMonths: number[];

  airtableModifiedAt: string | null;
  updatedAt: string | null;
  /** When Mike saved this pin in Google Maps. Distinct from updatedAt
   *  (last DB write) and visitYear (when he was there). Populated by
   *  import-google-takeout.ts from each saved-place feature's
   *  properties.date. Null for pins that never came from Takeout. */
  savedAt: string | null;
  /** Google Places API price level — 0 (free) through 4 ($$$$). Distinct
   *  from priceTier (a restaurant-specific personal pick). Populated
   *  later by a Places API enrichment pass. */
  priceLevel: number | null;
  /** E.164 international phone number from Google Places
   *  (internationalPhoneNumber). Surfaced on the pin detail page Getting
   *  There card as a `tel:` link. Populated by the same enrichment pass
   *  as priceLevel — same Pro-tier SKU on Google's side, so requesting
   *  it comes back with the same Places Details run that fills price and
   *  hours. */
  phone: string | null;

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

  /** Codex enrichment — richer than opening_hours / admission, with
   *  variant pricing, ramadan hours, parent-site cross-refs. Renderers
   *  prefer these over the simpler opening_hours / admission when set. */
  hoursDetails: PinHoursDetails | null;
  priceDetails: PinPriceDetails | null;
  freeToVisit: boolean | null;
  bookingRequired: boolean | null;
  hoursSourceUrl: string | null;
  priceSourceUrl: string | null;
  enrichmentStatus: string | null;
  enrichmentConfidence: string | null;
  enrichedAt: string | null;
  enrichmentCheckedAt: string | null;
  enrichmentSourceType: string | null;
  enrichmentNotes: string | null;

  googlePlaceUrl: string | null;
  googleMapsUrl: string | null;
  /** Resolved Google Places place_id, persisted so future enrichment
   *  runs skip the $0.017 Find Place hop. Distinct from
   *  googlePlaceUrl which is the user-saved sharing URL. */
  googlePlaceId: string | null;
  /** Google's average user rating (0.0–5.0). Refreshed on every
   *  enrichment call — pure Google data, no curated equivalent. */
  googleRating: number | null;
  /** Number of user ratings backing googleRating. "4.5 (3)" reads
   *  differently than "4.5 (8,431)", so we surface the count too. */
  googleRatingCount: number | null;
  unescoUrl: string | null;
  wikidataUrl: string | null;

  /** Set by the page after a separate personal_photos lookup. Cards prefer
   *  this over the first curated image. Null when there's no personal photo. */
  personalCoverUrl: string | null;
  /** True when at least one post in /content/posts/<slug>.md lists this
   *  pin's slug under its `links.pins[]` frontmatter array. Powers the
   *  "Mike's List" filter chip's "or blogs" half — a pin counts as
   *  curated if it's on a saved list OR Mike has written about it.
   *  Decorated in fetchers, never stored in Postgres. */
  inBlog: boolean;
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
const KINDS = ['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit'] as const;

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
      source: typeof i.source === 'string' ? i.source : null,
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
    kind: asEnum(row.kind, KINDS),
    description: row.description ?? null,

    personalRating: asNumber(row.personal_rating),
    personalReview: asString(row.personal_review),
    visitYear: asNumber(row.visit_year),
    personalNotes: asString(row.personal_notes),
    companions: asStringArray(row.companions),
    bestFor: asStringArray(row.best_for),

    nightsStayed: asNumber(row.nights_stayed),
    roomType: asString(row.room_type),
    roomPricePerNight: asNumber(row.room_price_per_night),
    roomPriceCurrency: asString(row.room_price_currency),
    wouldStayAgain: asBool(row.would_stay_again),
    hotelVibe: asStringArray(row.hotel_vibe),
    breakfastQuality: asString(row.breakfast_quality),
    wifiQuality: asString(row.wifi_quality),
    noiseLevel: asString(row.noise_level),
    locationPitch: asString(row.location_pitch),

    cuisine: asStringArray(row.cuisine),
    mealTypes: asStringArray(row.meal_types),
    dishesTried: asStringArray(row.dishes_tried),
    dietaryOptions: asStringArray(row.dietary_options),
    reservationRecommended: asBool(row.reservation_recommended),
    priceTier: asEnum(row.price_tier, ['$', '$$', '$$$', '$$$$'] as const),
    pricePerPersonUsd: asNumber(row.price_per_person_usd),

    indexable: !!row.indexable,
    hours: row.hours ?? null,
    priceText: row.price_text ?? null,
    priceAmount: asNumber(row.price_amount),
    priceCurrency: row.price_currency ?? null,
    unescoId,
    website: row.website ?? null,
    images,
    visited: !!row.visited,
    heroPhotoUrls: asStringArray(row.hero_photo_urls),

    wikidataQid,
    wikipediaUrl: asString(row.wikipedia_url),
    atlasObscuraSlug: asString(row.atlas_obscura_slug),
    inceptionYear: asNumber(row.inception_year),
    durationMinutes: asNumber(row.duration_minutes),
    tags: asStringArray(row.tags),
    lists: asStringArray(row.lists),
    savedLists: asStringArray(row.saved_lists),
    bestMonths: asNumberArray(row.best_months),

    airtableModifiedAt: row.airtable_modified_at ?? null,
    updatedAt: row.updated_at ?? null,
    savedAt: asString(row.saved_at),
    priceLevel: asNumber(row.price_level),
    phone: asString(row.phone),

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

    hoursDetails: row.hours_details && typeof row.hours_details === 'object' ? (row.hours_details as PinHoursDetails) : null,
    priceDetails: row.price_details && typeof row.price_details === 'object' ? (row.price_details as PinPriceDetails) : null,
    freeToVisit: asBool(row.free_to_visit),
    bookingRequired: asBool(row.booking_required),
    hoursSourceUrl: asString(row.hours_source_url),
    priceSourceUrl: asString(row.price_source_url),
    enrichmentStatus: asString(row.enrichment_status),
    enrichmentConfidence: asString(row.enrichment_confidence),
    enrichedAt: asString(row.enriched_at),
    enrichmentCheckedAt: asString(row.enrichment_checked_at),
    enrichmentSourceType: asString(row.enrichment_source_type),
    enrichmentNotes: asString(row.enrichment_notes),

    googlePlaceUrl: asString(row.google_place_url),
    googleMapsUrl,
    googlePlaceId: asString(row.google_place_id),
    googleRating: asNumber(row.google_rating),
    googleRatingCount: asNumber(row.google_rating_count),
    // Decorated by fetchers via getReferencedSlugs('pins'); rowToPin
    // returns a safe default so callers that build Pins without the
    // post lookup (scripts, isolated tests) don't blow up on it.
    inBlog: false,
    unescoUrl,
    wikidataUrl,
    personalCoverUrl: null,
  };
}

const PAGE_SIZE = 1000;

// Columns shipped to index views (cards / table / map / stats / filter panels).
// Excludes heavy jsonb (hours_details, price_details, opening_hours, admission,
// nearest_transit) and long-text detail-only fields (access_notes, safety_notes,
// scam_warning, dress_code, closure_reason, enrichment_notes). The full row is
// fetched directly by the detail page via fetchPinBySlug.
const INDEX_COLUMNS = [
  'id', 'airtable_id', 'name', 'slug',
  'lat', 'lng', 'city_names', 'states_names',
  'category', 'kind', 'description', 'hours',
  'price_text', 'price_amount', 'price_currency',
  'unesco_id', 'website', 'images', 'visited', 'hero_photo_urls',
  'wikidata_qid', 'wikipedia_url', 'atlas_obscura_slug', 'inception_year',
  'duration_minutes', 'tags', 'lists', 'saved_lists', 'best_months',
  'airtable_modified_at', 'updated_at',
  'free', 'free_to_visit', 'food_on_site',
  'wheelchair_accessible', 'kid_friendly', 'bring',
  // Personal-experience fields used on cards / sort / filters. personal_review
  // is included so the "Reviewed" filter can detect text-only reviews (no
  // star rating) — the field is short on average so the payload stays light.
  'personal_rating', 'personal_review', 'visit_year',
  // SEO + restaurant pricing on cards
  'indexable', 'price_tier',
  // Google Places enrichment — surfaced on /pins/cards via the price chip
  // (kind-aware: $-$$$$ for restaurants, falls back to priceLevel when the
  // personal priceTier hasn't been set) and on the detail page as a chip +
  // tel: link in Getting There. google_rating + google_rating_count power
  // a future "sort by rating" / minimum-rating filter on the cards/map
  // index views; google_place_id rides along so cached enrichment paths
  // see it without a per-pin extra query.
  'price_level', 'phone',
  'google_rating', 'google_rating_count', 'google_place_id',
].join(',');

const _fetchAllPins = unstable_cache(
  async (): Promise<Pin[]> => {
    // Get the row count up front via a HEAD-style request so we can fan
    // out the page reads in parallel. Sequential pagination crossed
    // Vercel's serverless function timeout once the table grew past
    // ~3,000 rows; the saved-list import pushed us to 5,000+. Parallel
    // pagination keeps total wall time at ~one page (5–10s) instead of
    // O(pages × per-page).
    const { count, error: countErr } = await supabase
      .from('pins')
      .select('id', { count: 'exact', head: true });
    if (countErr || count == null) {
      console.error('[pins] fetchAllPins count failed:', countErr);
      return [];
    }

    const numPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const ranges = Array.from({ length: numPages }, (_, i) => [
      i * PAGE_SIZE,
      Math.min((i + 1) * PAGE_SIZE - 1, count - 1),
    ]);

    const results = await Promise.all(
      ranges.map(([from, to]) =>
        supabase
          .from('pins')
          .select(INDEX_COLUMNS)
          .order('name', { ascending: true })
          .range(from, to)
          .then(res => {
            if (res.error) {
              console.error(`[pins] fetchAllPins page ${from}-${to} failed:`, res.error);
              return [] as any[];
            }
            return (res.data ?? []) as any[];
          }),
      ),
    );

    // Flatten preserving order. Pages came back ordered by `name`, so the
    // concatenated stream is already globally ordered (each range slice
    // covers a contiguous chunk of the same sort).
    const all: any[] = [];
    for (const page of results) all.push(...page);
    return all.map(rowToPin);
  },
  // Cache key bumped to force a fresh refetch after the parallel-pagination
  // fix landed and again after the visited=true backfill on Google-imported
  // pins. v6: INDEX_COLUMNS now ships google_rating + google_rating_count
  // + google_place_id, so v5 entries are missing those fields.
  // v7: Pin shape gained heroPhotoUrls + atlasObscuraSlug. v6 cache
  // entries lack those fields, so post-deploy reads were crashing on
  // `pin.heroPhotoUrls.length` until the 24h TTL expired. Bump evicts.
  ['supabase-pins-v7'],
  { revalidate: 86400, tags: ['supabase-pins'] }
);
// Apply post→pin link decoration AFTER the cached DB read. Keeping the
// decoration outside unstable_cache means the cached payload is just
// the raw Supabase data (stable across post edits), and we re-apply
// the blog-tag overlay each request from getReferencedSlugs (which has
// its own 24h cache, keyed off the posts directory).
async function decoratePinsWithBlogTags(pins: Pin[]): Promise<Pin[]> {
  const blogSlugs = await getReferencedSlugs('pins');
  if (blogSlugs.size === 0) return pins;
  return pins.map(p =>
    p.slug && blogSlugs.has(p.slug) ? { ...p, inBlog: true } : p,
  );
}

export const fetchAllPins = cache(async (): Promise<Pin[]> => {
  const pins = await _fetchAllPins();
  return decoratePinsWithBlogTags(pins);
});

// === Surgical fetchers ======================================================
// Index views need all 5k pins; detail / sidebar / list embeds need a small
// slice. These helpers hit Supabase with a server-side filter so we don't
// ship the entire corpus through unstable_cache deserialization to extract
// 20 rows.

/** Pins on at least one of the given saved lists. Uses a single GIN-indexed
 *  array overlap (`saved_lists && ARRAY[...]`). Empty-list input returns
 *  []; identical input returns identical output (the result is cached
 *  per-name set, sorted to dedupe permutations). */
const _fetchPinsForLists = unstable_cache(
  async (names: string[]): Promise<Pin[]> => {
    if (names.length === 0) return [];
    const { data, error } = await supabase
      .from('pins')
      .select(INDEX_COLUMNS)
      .overlaps('saved_lists', names)
      .order('name', { ascending: true });
    if (error) {
      console.error('[pins] fetchPinsForLists failed:', error);
      return [];
    }
    return (data ?? []).map(rowToPin);
  },
  // v2: refresh saved-list snapshots after Kusttram station enrichment added
  // missing stops, coordinates, and route order.
  ['supabase-pins-for-lists-v3'],
  { revalidate: 86400, tags: ['supabase-pins'] },
);
export const fetchPinsForLists = cache(async (names: string[]): Promise<Pin[]> => {
  // Sort + dedupe inputs so the cache key is stable across permutations.
  const sorted = Array.from(new Set(names)).sort();
  const pins = await _fetchPinsForLists(sorted);
  return decoratePinsWithBlogTags(pins);
});

/** Pins inside a lat/lng bounding box, excluding one id. Used by the
 *  pin-detail "More near here" block to find ~4 nearby pins without
 *  loading the whole corpus. The box is widened a bit relative to the
 *  intended radius so haversine ranking has slack at the corners. */
const _fetchPinsInBbox = unstable_cache(
  async (
    minLat: number, maxLat: number, minLng: number, maxLng: number,
    excludeId: string,
  ): Promise<Pin[]> => {
    const { data, error } = await supabase
      .from('pins')
      .select(INDEX_COLUMNS)
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .gte('lng', minLng)
      .lte('lng', maxLng)
      .neq('id', excludeId)
      .limit(40);
    if (error) {
      console.error('[pins] fetchPinsInBbox failed:', error);
      return [];
    }
    return (data ?? []).map(rowToPin);
  },
  // v5: in lockstep with fetchAllPins-v6 — bbox queries flow through
  // INDEX_COLUMNS so they need the same eviction as the all-pins cache
  // when columns are added.
  ['supabase-pins-bbox-v6'],
  { revalidate: 86400, tags: ['supabase-pins'] },
);
export const fetchPinsInBbox = cache(
  async (
    minLat: number, maxLat: number, minLng: number, maxLng: number,
    excludeId: string,
  ): Promise<Pin[]> => {
    const pins = await _fetchPinsInBbox(minLat, maxLat, minLng, maxLng, excludeId);
    return decoratePinsWithBlogTags(pins);
  },
);

// Detail page: full row (heavy jsonbs included). unstable_cache is keyed by
// slug so each pin's detail data is cached independently across requests;
// React.cache() within a single render dedupes if multiple paths need it.
const _fetchPinBySlug = unstable_cache(
  async (slug: string): Promise<Pin | null> => {
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
  },
  // v7: Pin shape gained heroPhotoUrls + atlasObscuraSlug fields. v6
  // entries crash post-deploy on `pin.heroPhotoUrls.length`. Bump to
  // force a fresh rowToPin pass on first read.
  ['supabase-pin-by-slug-v7'],
  { revalidate: 86400, tags: ['supabase-pins'] },
);
export const fetchPinBySlug = cache(async (slug: string): Promise<Pin | null> => {
  const pin = await _fetchPinBySlug(slug);
  if (!pin) return null;
  // Single-pin variant of decoratePinsWithBlogTags. Same cached
  // post-slug Set; we just check membership directly.
  const blogSlugs = await getReferencedSlugs('pins');
  return pin.slug && blogSlugs.has(pin.slug) ? { ...pin, inBlog: true } : pin;
});
