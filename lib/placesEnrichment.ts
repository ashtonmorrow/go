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
//   Place Details "Pro":         $0.005  (+ priceLevel, types, website, phone)
//   Place Details "Enterprise":  $0.020  (+ regularOpeningHours, photos)
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

export type EnrichField = 'price' | 'hours' | 'website' | 'phone';

export type EnrichOptions = {
  /** Supabase client used for both pin reads/writes AND for invoking
   *  Stray's place-details edge function. The service-role client
   *  passed in from supabaseAdmin() is the typical caller. */
  supabase: SupabaseClient;
  /** Pin IDs to enrich. Caller does the filtering. */
  pinIds: string[];
  /** Which fields to ask Places API for. Default: ['price', 'hours']. */
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
  if (fields.includes('hours')) return 0.020;
  if (fields.includes('price') || fields.includes('website') || fields.includes('phone')) return 0.005;
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
  name: string,
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  const out = await invokePlaceDetailsFn<{ placeId: string | null }>(
    supabase,
    {
      action: 'find',
      name,
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
};

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

function mapOpeningHours(
  h: PlaceDetails['regularOpeningHours'],
): Record<string, unknown> | null {
  if (!h) return null;
  const out: Record<string, unknown> = {};
  if (Array.isArray(h.weekdayDescriptions) && h.weekdayDescriptions.length > 0) {
    out.weekly = h.weekdayDescriptions.join('\n');
    out.source = 'google_places';
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
  const fields = options.fields ?? ['price', 'hours'];
  const maxCost = options.maxCostUsd ?? Infinity;
  const tier = detailsTier(fields);
  const apply = !options.dryRun;

  // Pull the candidate rows. If --refresh is off, skip pins that
  // already have price_level (the most common "is this enriched?"
  // signal). Caller-supplied IDs are already a filter; we just narrow.
  let q = options.supabase
    .from('pins')
    .select('id, name, slug, lat, lng, google_place_url, price_level, hours_details, website')
    .in('id', options.pinIds);
  if (!options.refresh) q = q.is('price_level', null);
  const { data, error } = await q;
  if (error) throw error;
  const pins = (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string | null;
    lat: number | null;
    lng: number | null;
    google_place_url: string | null;
    price_level: number | null;
    hours_details: Record<string, unknown> | null;
    website: string | null;
  }>;

  yield { type: 'start', total: pins.length, fields, tier };

  let runningCost = 0;
  let written = 0;
  let abortedAtCap = false;

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!;

    // 1. Resolve place_id (cheap path: pull from URL; fallback: Find Place)
    let placeId = placeIdFromUrl(pin.google_place_url);
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
      placeId = await findPlaceId(options.supabase, pin.name, pin.lat, pin.lng);
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
      const mapped = mapOpeningHours(details.regularOpeningHours);
      if (mapped) {
        // Merge into existing hours_details so we don't blow away
        // manually-entered ramadan / parent_site / notes fields.
        patch.hours_details = { ...(pin.hours_details ?? {}), ...mapped };
      }
    }
    if (fields.includes('website') && !pin.website && details.websiteUri) {
      patch.website = details.websiteUri;
    }
    // phone: no column to write to yet; the SKU it's billed under is
    // already in the response, so we surface it in the event but skip.

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
