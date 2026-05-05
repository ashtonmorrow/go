// === Google Places API enrichment — shared core =============================
//
// Used by:
//   - scripts/enrich-pins-from-places.ts   (CLI / one-shot batches)
//   - app/api/admin/enrich-places/route.ts (in-app admin button)
//
// Both call enrichPins() and either await the final summary or stream
// the per-pin events. The route adapter wraps the async generator in
// an NDJSON ReadableStream so the admin UI can render progress
// incrementally without holding a long-lived connection open. The
// script adapter just consumes the events to drive its console output.
//
// One-key architecture: we no longer call Google Places directly. Both
// the Find Place hop and the Place Details fetch route through Stray's
// `place-details` Supabase Edge Function (mirror of the existing
// `location-lookup` pattern). Stray owns the Google key; the go
// project just invokes the function. When location-lookup works,
// place-details works — same key, same auth, same blast radius if
// either ever expires.
//
// Pricing model (Places API New, current SKUs — billed against
// Stray's GCP project):
//   Find Place from Text:        $0.017 / call
//   Place Details "Essentials":  $0      (id, displayName)
//   Place Details "Pro":         $0.005  (+ primaryType)
//   Place Details "Enterprise":  $0.020  (+ priceLevel, website, phone, regularOpeningHours)
//
// We pick the cheapest tier that still covers the requested fields and
// surface a running cost estimate after every call so the admin button
// can offer a hard ceiling.
//
// All Supabase reads/writes go through the service-role client passed
// in by the caller — this module never imports lib/supabase directly
// so it can run in both the public (anon) and admin (service-role)
// contexts. The same client is used to invoke the edge function.

import type { SupabaseClient } from '@supabase/supabase-js';

export type EnrichField = 'price' | 'hours' | 'website' | 'phone' | 'kind';

export type EnrichOptions = {
  /** Supabase client used for both pin reads/writes AND for invoking
   *  Stray's place-details edge function. The service-role client
   *  passed in from supabaseAdmin() is the typical caller. */
  supabase: SupabaseClient;
  /** Pin IDs to enrich. Caller does the filtering. */
  pinIds: string[];
  /** Which fields to ask Places API for.
   *  Default: ['price', 'hours', 'phone', 'kind']. */
  fields?: EnrichField[];
  /** Hard ceiling on total Places API spend. Aborts cleanly when hit. */
  maxCostUsd?: number;
  /** When true, also re-fetch pins that already have price_level set.
   *  Default false — re-runs are cheap because we skip already-enriched. */
  refresh?: boolean;
  /** Dry run — collect updates but don't write to Supabase. */
  dryRun?: boolean;
};

export type EnrichEvent =
  | { type: 'start'; total: number; fields: EnrichField[]; tier: number }
  | { type: 'progress'; index: number; pinId: string; pinName: string;
      action: 'cached-id' | 'resolving' | 'resolved' | 'no-match' | 'enriched' | 'no-data' | 'skipped' | 'cost-cap';
      placeId?: string | null;
      patch?: Record<string, unknown>;
      runningCost: number; }
  | { type: 'done'; processed: number; written: number; totalCost: number; abortedAtCap: boolean };

const PRICE_FIND_PLACE = 0.017;

function detailsTier(fields: EnrichField[]): number {
  if (
    fields.includes('hours') ||
    fields.includes('price') ||
    fields.includes('website') ||
    fields.includes('phone')
  ) return 0.020;
  if (fields.includes('kind')) return 0.005;
  return 0;
}

/** Try to lift a Google place_id out of an embedded URL. Most Maps share
 *  URLs use cid: / data: blobs that need a Find-Place hop; only modern
 *  share links carry place_id directly. */
function placeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const direct = url.match(/place_id=(ChI[A-Za-z0-9_-]{20,})/);
  if (direct) return direct[1] ?? null;
  const prefixed = url.match(/!1s(ChI[A-Za-z0-9_-]{20,})/);
  if (prefixed) return prefixed[1] ?? null;
  return null;
}

/** Custom error type so the generator can distinguish "Google said no
 *  match for this place" (caller continues) from "Google rejected our
 *  request entirely" (caller should abort the whole run). The Stray
 *  edge function relays Google's HTTP status as `upstreamStatus`. */
export class PlacesApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Places API ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Invoke a Stray edge function action. Wraps the supabase-js
 * functions.invoke contract so the call sites read like local
 * functions. Throws PlacesApiError on transport / upstream errors so
 * the generator can decide whether to abort the whole run.
 */
type EdgeErrorPayload = {
  error?: string;
  upstreamStatus?: number | null;
};

async function invokePlaceDetailsFn<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('place-details', { body });
  if (error) {
    // FunctionsHttpError, FunctionsRelayError, FunctionsFetchError all
    // surface as `error` here. Try to extract the upstream Google
    // status from the response body for a more useful PlacesApiError.
    let payload: EdgeErrorPayload | null = null;
    try {
      const ctx = (error as unknown as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx?.json) payload = (await ctx.json()) as EdgeErrorPayload;
    } catch {
      /* ignore — payload extraction is best-effort */
    }
    const upstream = payload?.upstreamStatus ?? null;
    const message = payload?.error ?? error.message ?? 'edge function failed';
    throw new PlacesApiError(
      typeof upstream === 'number' ? upstream : 500,
      message,
    );
  }
  return data as T;
}

async function findPlaceId(
  supabase: SupabaseClient,
  query: string,
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  const out = await invokePlaceDetailsFn<{ placeId: string | null }>(
    supabase,
    {
      action: 'find',
      name: query,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
    },
  );
  return out?.placeId ?? null;
}

type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  priceLevel?:
    | 'PRICE_LEVEL_FREE'
    | 'PRICE_LEVEL_INEXPENSIVE'
    | 'PRICE_LEVEL_MODERATE'
    | 'PRICE_LEVEL_EXPENSIVE'
    | 'PRICE_LEVEL_VERY_EXPENSIVE';
  regularOpeningHours?: {
    openNow?: boolean;
    periods?: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
    weekdayDescriptions?: string[];
  };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  /** Google's most specific category for the place ("park",
   *  "italian_restaurant"). Used to auto-classify pin.kind when none
   *  is curated. */
  primaryType?: string;
  /** Full set of Google types ("restaurant", "food", "establishment").
   *  Fallback if primaryType doesn't match anything in our map. */
  types?: string[];
  /** Average user rating, 0.0–5.0. Free in the tier we already pay
   *  for. No curated equivalent — we always overwrite. */
  rating?: number;
  /** Count of user ratings backing `rating`. "4.5 (12)" reads
   *  differently than "4.5 (8,431)", so we surface both. */
  userRatingCount?: number;
  /** Full street address from Google. Used to fill pin.address only
   *  when blank — never clobbers a curated address. */
  formattedAddress?: string;
  /** "OPERATIONAL" / "CLOSED_TEMPORARILY" / "CLOSED_PERMANENTLY".
   *  Currently captured for visibility but not auto-written to
   *  pin.status, since closures need a curator's eye. */
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
};

type PinKind = 'attraction' | 'shopping' | 'hotel' | 'park' | 'restaurant' | 'transit';

/** Mapping from Google Places type strings to our internal pin kind enum.
 *  primaryType wins when it matches; otherwise we walk the types[] list
 *  in order and take the first match. Anything that doesn't match falls
 *  back to 'attraction' as the catch-all (museums, landmarks, churches,
 *  monuments, viewpoints, etc.). */
const TYPE_TO_KIND: Record<string, PinKind> = {
  // Restaurants / food / drink
  restaurant: 'restaurant', food: 'restaurant', cafe: 'restaurant',
  bar: 'restaurant', pub: 'restaurant', bakery: 'restaurant',
  meal_takeaway: 'restaurant', meal_delivery: 'restaurant',
  ice_cream_shop: 'restaurant', coffee_shop: 'restaurant',
  italian_restaurant: 'restaurant', chinese_restaurant: 'restaurant',
  japanese_restaurant: 'restaurant', mexican_restaurant: 'restaurant',
  french_restaurant: 'restaurant', indian_restaurant: 'restaurant',
  thai_restaurant: 'restaurant', vietnamese_restaurant: 'restaurant',
  steakhouse: 'restaurant', seafood_restaurant: 'restaurant',
  pizzeria: 'restaurant', pizza_restaurant: 'restaurant',
  sandwich_shop: 'restaurant', diner: 'restaurant',
  brewery: 'restaurant', winery: 'restaurant', distillery: 'restaurant',
  // Lodging
  lodging: 'hotel', hotel: 'hotel', motel: 'hotel',
  resort_hotel: 'hotel', extended_stay_hotel: 'hotel',
  bed_and_breakfast: 'hotel', hostel: 'hotel',
  // Parks & green space
  park: 'park', national_park: 'park', state_park: 'park',
  campground: 'park', botanical_garden: 'park', dog_park: 'park',
  // Shopping
  shopping_mall: 'shopping', store: 'shopping', supermarket: 'shopping',
  market: 'shopping', clothing_store: 'shopping', shoe_store: 'shopping',
  jewelry_store: 'shopping', book_store: 'shopping',
  electronics_store: 'shopping', furniture_store: 'shopping',
  department_store: 'shopping', convenience_store: 'shopping',
  grocery_store: 'shopping', florist: 'shopping',
  // Transit
  transit_station: 'transit', subway_station: 'transit',
  train_station: 'transit', bus_station: 'transit',
  light_rail_station: 'transit', taxi_stand: 'transit',
  airport: 'transit', heliport: 'transit', ferry_terminal: 'transit',
  parking: 'transit',
};

/** Walk Google's primaryType + types[] looking for a match in our map.
 *  primaryType wins if it matches; otherwise the first matching entry in
 *  types[] is used. Returns null when nothing matches — caller decides
 *  whether to fall back to a default kind. */
function inferKindFromTypes(
  primaryType: string | undefined,
  types: string[] | undefined,
): PinKind | null {
  const primary = primaryType?.toLowerCase();
  if (primary && TYPE_TO_KIND[primary]) return TYPE_TO_KIND[primary];
  if (Array.isArray(types)) {
    for (const t of types) {
      const k = TYPE_TO_KIND[t.toLowerCase()];
      if (k) return k;
    }
    // Fallbacks based on broad categories Google attaches when the
    // specific type wasn't in our map. tourist_attraction is *very*
    // common for landmarks / monuments / museums / viewpoints — it's
    // the right catch-all when nothing else matched.
    const lowered = types.map(t => t.toLowerCase());
    if (lowered.includes('tourist_attraction')) return 'attraction';
    if (lowered.includes('museum') || lowered.includes('art_gallery')) return 'attraction';
    if (lowered.includes('place_of_worship')) return 'attraction';
    if (lowered.includes('point_of_interest') || lowered.includes('landmark')) return 'attraction';
  }
  return null;
}

function foldedText(values: Array<string | null | undefined>): string {
  return values
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferKindFromText(values: Array<string | null | undefined>): PinKind | null {
  const text = foldedText(values);
  if (!text) return null;
  if (/\b(hotel|hostel|guesthouse|guest house|resort|motel|riad|suites|aparthotel)\b/.test(text)) {
    return 'hotel';
  }
  if (/\b(restaurant|restaurante|ristorante|cafe|coffee|bakery|pastry|pastries|pizzeria|pizza|sushi|ramen|noodle|kebab|cevabdzinica|cevapi|taqueria|tacos|brasserie|bistro|pub|tavern|brewery|beer|grill|diner|trattoria|osteria|parrilla|bbq|barbecue|burger|ceviche|arepa|falafel|shawarma|gelato|ice cream|cocktail|wine bar|steakhouse|seafood|street food|food truck|juice|sandwich)\b|doner/.test(text)) {
    return 'restaurant';
  }
  if (/\b(muji|mall|shopping|store|shop|boutique|bazaar)\b|market/.test(text)) {
    return 'shopping';
  }
  if (/\b(airport|station|terminal|metro|subway|rail|railway|train|ferry|tram|funicular|parking)\b/.test(text)) {
    return 'transit';
  }
  if (/\b(park|garden|gardens|botanical|beach|bay|trail|reserve|forest|waterfall|lake)\b/.test(text)) {
    return 'park';
  }
  if (/\b(museum|gallery|palace|castle|cathedral|church|mosque|temple|synagogue|monument|memorial|old town|fort|fortress|tower|bridge|square|plaza|archaeological|archeological|aquarium|zoo|photopoint)\b/.test(text)) {
    return 'attraction';
  }
  return null;
}

function placeSearchQuery(pin: {
  name: string;
  lat: number | null;
  lng: number | null;
  city_names?: string[] | null;
  states_names?: string[] | null;
}): string {
  // When we have coordinates, keep the query narrow and let the edge
  // function's location bias do the disambiguation. Saved-list rows
  // often lack coordinates but do have city/country; append that context
  // so "The Club", "Otium", or "Kyubey" do not resolve globally.
  if (pin.lat != null && pin.lng != null) return pin.name;
  const city = Array.isArray(pin.city_names) ? pin.city_names[0] : null;
  const country = Array.isArray(pin.states_names) ? pin.states_names[0] : null;
  return [pin.name, city, country].filter(Boolean).join(', ');
}

async function fetchPlaceDetails(
  supabase: SupabaseClient,
  placeId: string,
  fields: EnrichField[],
): Promise<PlaceDetails | null> {
  const out = await invokePlaceDetailsFn<{ details: PlaceDetails }>(
    supabase,
    { action: 'details', placeId, fields },
  );
  return out?.details ?? null;
}

function priceLevelToInt(p: PlaceDetails['priceLevel']): number | null {
  switch (p) {
    case 'PRICE_LEVEL_FREE': return 0;
    case 'PRICE_LEVEL_INEXPENSIVE': return 1;
    case 'PRICE_LEVEL_MODERATE': return 2;
    case 'PRICE_LEVEL_EXPENSIVE': return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4;
    default: return null;
  }
}

// Day-name to internal key map. The detail page expects weekly to be an
// object keyed by mon/tue/wed/thu/fri/sat/sun. Earlier this function
// joined Google's weekdayDescriptions with newlines into a single string,
// which the page couldn't read — every day looked unpopulated and
// rendered the "Hours haven't been added yet" placeholder.
const DAY_NAME_TO_KEY: Record<string, 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sunday: 'sun',
};
const WEEKDAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

function parseWeekdayDescriptions(lines: string[]): Partial<Record<WeekdayKey, string>> {
  const out: Partial<Record<WeekdayKey, string>> = {};
  for (const line of lines) {
    // Format Google returns (en-US default): "Monday: 9:00 AM – 5:00 PM" or
    // "Sunday: Closed". Split on the first colon so times that contain ":"
    // (most of them) stay intact.
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const dayName = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    const key = DAY_NAME_TO_KEY[dayName];
    if (key && value) out[key] = value;
  }
  return out;
}

function mapOpeningHours(
  h: PlaceDetails['regularOpeningHours'],
  existing: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!h) return null;
  const out: Record<string, unknown> = {};
  if (Array.isArray(h.weekdayDescriptions) && h.weekdayDescriptions.length > 0) {
    const fromGoogle = parseWeekdayDescriptions(h.weekdayDescriptions);

    // Curator wins. If the pin already had per-day curation in
    // hours_details.weekly (or a "daily" string for places open the same
    // hours every day), preserve that and only fill the blanks from
    // Google. If the existing weekly is the broken joined-string from a
    // prior run, treat it as no curation and replace cleanly.
    const prior = existing?.weekly;
    const priorObj =
      prior && typeof prior === 'object' && !Array.isArray(prior)
        ? (prior as { daily?: string } & Partial<Record<WeekdayKey, string>>)
        : null;

    const merged: { daily?: string } & Partial<Record<WeekdayKey, string>> = {};
    if (priorObj?.daily && priorObj.daily.trim().length > 0) {
      merged.daily = priorObj.daily;
    }
    for (const day of WEEKDAY_KEYS) {
      const curated = priorObj?.[day];
      const google = fromGoogle[day];
      if (typeof curated === 'string' && curated.trim().length > 0) {
        merged[day] = curated;
      } else if (google) {
        merged[day] = google;
      }
    }
    if (Object.keys(merged).length > 0) {
      out.weekly = merged;
      out.source = 'google_places';
    }
  }
  if (typeof h.openNow === 'boolean') out.open_now_at_fetch = h.openNow;
  return Object.keys(out).length > 0 ? out : null;
}

/** Async generator: yields per-pin events while the enrichment runs.
 *  Caller can stream these straight to a client (NDJSON), pipe into a
 *  console, or collect and summarise. */
export async function* enrichPins(
  options: EnrichOptions,
): AsyncGenerator<EnrichEvent> {
  // Default field bundle: price + hours + phone + kind. price, website,
  // phone, and regularOpeningHours are all in Google's Enterprise
  // Place Details tier. The type fields used for kind do not increase
  // the default run's tier once hours/phone are already requested. The
  // admin UI can still override fields[] explicitly.
  const fields = options.fields ?? ['price', 'hours', 'phone', 'kind'];
  const maxCost = options.maxCostUsd ?? Infinity;
  const tier = detailsTier(fields);
  const apply = !options.dryRun;

  // Pull the candidate rows. If --refresh is off, skip pins that
  // already have price_level (the most common "is this enriched?"
  // signal). Caller-supplied IDs are already a filter; we just narrow.
  let q = options.supabase
    .from('pins')
    .select('id, name, slug, kind, category, lat, lng, city_names, states_names, google_place_url, google_place_id, price_level, hours_details, website, phone, address')
    .in('id', options.pinIds);
  if (!options.refresh) q = q.is('price_level', null);
  const { data, error } = await q;
  if (error) throw error;
  const pins = (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string | null;
    kind: string | null;
    category: string | null;
    lat: number | null;
    lng: number | null;
    city_names: string[] | null;
    states_names: string[] | null;
    google_place_url: string | null;
    /** Cached resolved place_id from a previous run. When set, we
     *  skip both the URL parse AND the Find Place hop. Persisted in
     *  the migration that added google_rating + google_rating_count. */
    google_place_id: string | null;
    price_level: number | null;
    hours_details: Record<string, unknown> | null;
    website: string | null;
    phone: string | null;
    address: string | null;
  }>;

  yield { type: 'start', total: pins.length, fields, tier };

  let runningCost = 0;
  let written = 0;
  let abortedAtCap = false;

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!;

    // 1. Resolve place_id. Three paths in increasing cost order:
    //    (a) cached resolved place_id from a previous enrichment run
    //        (free — place IDs are exempt from Google caching limits)
    //    (b) parsed out of a saved google_place_url (free)
    //    (c) Find Place from Text hop ($0.017)
    // We save the result back to pin.google_place_id whenever we had to
    // resolve via (b) or (c) so the next run hits (a) for free.
    let placeId = pin.google_place_id || placeIdFromUrl(pin.google_place_url);
    type Action =
      | 'cached-id' | 'resolving' | 'resolved' | 'no-match'
      | 'enriched' | 'no-data' | 'skipped' | 'cost-cap';
    let action: Action = placeId ? 'cached-id' : 'resolving';

    if (!placeId) {
      // Cost-gate before we fire off the Find Place call.
      if (runningCost + PRICE_FIND_PLACE > maxCost) {
        abortedAtCap = true;
        yield {
          type: 'progress',
          index: i,
          pinId: pin.id,
          pinName: pin.name,
          action: 'cost-cap',
          runningCost,
        };
        break;
      }
      placeId = await findPlaceId(options.supabase, placeSearchQuery(pin), pin.lat, pin.lng);
      runningCost += PRICE_FIND_PLACE;
      action = placeId ? 'resolved' : 'no-match';
    }

    if (!placeId) {
      yield {
        type: 'progress',
        index: i,
        pinId: pin.id,
        pinName: pin.name,
        action,
        placeId: null,
        runningCost,
      };
      continue;
    }

    // 2. Place Details — cost-gated.
    if (runningCost + tier > maxCost) {
      abortedAtCap = true;
      yield {
        type: 'progress',
        index: i,
        pinId: pin.id,
        pinName: pin.name,
        action: 'cost-cap',
        runningCost,
      };
      break;
    }

    const details = await fetchPlaceDetails(options.supabase, placeId, fields);
    runningCost += tier;
    if (!details) {
      yield {
        type: 'progress',
        index: i,
        pinId: pin.id,
        pinName: pin.name,
        action: 'no-data',
        placeId,
        runningCost,
      };
      continue;
    }

    // 3. Build the patch from the requested fields.
    const patch: Record<string, unknown> = {};
    if (fields.includes('price')) {
      const p = priceLevelToInt(details.priceLevel);
      if (p != null) patch.price_level = p;
    }
    if (fields.includes('hours')) {
      // Pass the existing hours_details so mapOpeningHours can preserve
      // any curator-set per-day values when merging in Google's data.
      const mapped = mapOpeningHours(
        details.regularOpeningHours,
        pin.hours_details ?? null,
      );
      if (mapped) {
        // Merge into existing hours_details so we don't blow away
        // manually-entered ramadan / parent_site / notes fields.
        patch.hours_details = { ...(pin.hours_details ?? {}), ...mapped };
      }
    }
    if (fields.includes('website') && !pin.website && details.websiteUri) {
      patch.website = details.websiteUri;
    }
    if (fields.includes('phone') && !pin.phone && details.internationalPhoneNumber) {
      // Same "only-if-empty" guard as website: if a curated phone number
      // is already on file, don't clobber it with Google's number. Refresh
      // runs (refresh=true) re-fetch the row but still respect this guard
      // so the user's hand-corrected values stick.
      patch.phone = details.internationalPhoneNumber;
    }
    if (fields.includes('kind') && !pin.kind) {
      // Only auto-classify when the pin has no curated kind. Refresh
      // runs preserve any existing kind even if Google would suggest
      // something different (curator wins, same as the rest of the
      // merge logic). Skip pins where neither primaryType nor types[]
      // gave us a usable mapping.
      const inferred =
        inferKindFromTypes(details.primaryType, details.types) ??
        inferKindFromText([pin.category, pin.name, details.displayName?.text]);
      if (inferred) patch.kind = inferred;
    }

    // Free additions in the tier we already pay for. These ride along
    // with whatever fields the user requested and cost nothing extra.

    // Google rating + count: pure Google data, no curated equivalent,
    // overwrite freely. Capped to the Postgres numeric(2,1) range we
    // migrated.
    if (typeof details.rating === 'number' && Number.isFinite(details.rating)) {
      patch.google_rating = Math.max(0, Math.min(5, details.rating));
    }
    if (typeof details.userRatingCount === 'number' && Number.isFinite(details.userRatingCount)) {
      patch.google_rating_count = Math.max(0, Math.floor(details.userRatingCount));
    }

    // Address: only fill when blank — never clobber a curated value.
    // Some pins have hand-edited addresses that read better than
    // Google's "12 Some St, City, Country" boilerplate.
    if (!pin.address && typeof details.formattedAddress === 'string' && details.formattedAddress.trim()) {
      patch.address = details.formattedAddress.trim();
    }

    // Cache the resolved place_id for free re-runs. Only writes when
    // we don't already have one stored — the Find Place hop only
    // happens when this column is null AND google_place_url couldn't
    // be parsed, so writing here saves the $0.017 next time.
    if (!pin.google_place_id && placeId) {
      patch.google_place_id = placeId;
    }

    if (Object.keys(patch).length === 0) {
      yield {
        type: 'progress',
        index: i,
        pinId: pin.id,
        pinName: pin.name,
        action: 'no-data',
        placeId,
        runningCost,
      };
      continue;
    }

    if (apply) {
      const { error: writeErr } = await options.supabase
        .from('pins')
        .update(patch)
        .eq('id', pin.id);
      if (writeErr) {
        yield {
          type: 'progress',
          index: i,
          pinId: pin.id,
          pinName: pin.name,
          action: 'no-data',
          placeId,
          patch,
          runningCost,
        };
        continue;
      }
      written++;
    }

    yield {
      type: 'progress',
      index: i,
      pinId: pin.id,
      pinName: pin.name,
      action: 'enriched',
      placeId,
      patch,
      runningCost,
    };
  }

  yield {
    type: 'done',
    processed: pins.length,
    written,
    totalCost: runningCost,
    abortedAtCap,
  };
}

/** Cost preview for a confirmation dialog. Estimates the worst-case
 *  spend BEFORE running enrichPins (every pin needs a Find Place +
 *  Place Details). Real spend is usually lower because most pins
 *  resolve from the URL alone. */
export function estimateCost(pinCount: number, fields: EnrichField[]): {
  worstCase: number;
  bestCase: number;
  tier: number;
} {
  const tier = detailsTier(fields);
  return {
    // Worst case: every pin needs a Find Place hop.
    worstCase: pinCount * (PRICE_FIND_PLACE + tier),
    // Best case: every pin's URL already has a place_id.
    bestCase: pinCount * tier,
    tier,
  };
}
