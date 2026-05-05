/**
 * Enrich pins from Google Places API (New).
 *
 * Backfills price_level and (optionally) opening hours, website, and
 * phone for pins that have a google_place_url stored. Designed to run
 * incrementally — by default it skips pins that already have a
 * price_level set, so re-runs after partial completion are cheap.
 *
 * Run from the repo root:
 *   # Dry run (default): no writes, prints what would happen
 *   npx tsx --env-file=.env.local scripts/enrich-pins-from-places.ts --limit 10
 *
 *   # Live writes
 *   npx tsx --env-file=.env.local scripts/enrich-pins-from-places.ts --apply --limit 10
 *
 *   # Full corpus, all default fields, with a $20 cost ceiling
 *   npx tsx --env-file=.env.local scripts/enrich-pins-from-places.ts --apply --max-cost-usd 20
 *
 * Flags:
 *   --apply              Write to Supabase. Default is dry-run.
 *   --limit N            Process only the first N pins. Default: no limit.
 *   --max-cost-usd X     Hard ceiling. Aborts before exceeding the estimate.
 *   --fields LIST        Comma-separated. Available: price, hours, website, phone.
 *                        Default: "price,hours". Each field affects which
 *                        Places API SKU is billed.
 *   --refresh            Re-fetch even pins that already have price_level.
 *                        Off by default — re-runs are cheap because we skip.
 *   --resolve-only       Resolve place_ids for pins that don't have one,
 *                        cache them, and exit without calling Place Details.
 *
 * Cost shape (Places API New, current pricing):
 *   - Find Place from Text:   $17 / 1k requests   (used to resolve place_id
 *                                                  when google_place_url has
 *                                                  no embedded place_id —
 *                                                  i.e. cid: / data: / url:
 *                                                  forms; ~most pins.)
 *   - Place Details Essentials: $0   (id, displayName, formattedAddress)
 *   - Place Details Pro:        $5   (+ primaryType)
 *   - Place Details Enterprise: $20  (+ priceLevel, websiteUri,
 *                                       internationalPhoneNumber,
 *                                       regularOpeningHours)
 *
 *   Default field set (price + hours): $20/1k Enterprise.
 *   Add the Find-Place hop and you're at ~$37/1k worst case.
 *
 * Caching:
 *   - scripts/output/places-cache.json maps pin_id → resolved place_id so
 *     a re-run after a Find-Place pass doesn't pay the resolution cost
 *     twice. Delete the file to force a re-resolve.
 *
 * Required env in .env.local:
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY     server-side use OK (unrestricted)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// === Config =================================================================

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!API_KEY) {
  console.error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const ARGS = parseArgs(process.argv.slice(2));
const APPLY = ARGS.has('--apply');
const REFRESH = ARGS.has('--refresh');
const RESOLVE_ONLY = ARGS.has('--resolve-only');
const LIMIT = numArg('--limit') ?? Infinity;
const MAX_COST_USD = numArg('--max-cost-usd') ?? Infinity;
const FIELDS = (strArg('--fields') ?? 'price,hours')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// FieldMask + SKU pricing per Places API (New). The mask we send drives
// which SKU Google bills. We assemble it from the requested fields.
const PRICE_PER_PLACE_DETAILS_USD = (() => {
  // Tier-up to the most expensive bucket we touch:
  //   Enterprise ($20/k) if we ask for price, hours, website, or phone
  //   Pro ($5/k)        for primaryType-only runs
  //   Essentials ($0)   otherwise (we always ask for id/displayName)
  if (
    FIELDS.includes('hours') ||
    FIELDS.includes('price') ||
    FIELDS.includes('website') ||
    FIELDS.includes('phone')
  ) return 0.020;
  return 0;
})();
const PRICE_PER_FIND_PLACE_USD = 0.017;

const PLACES_CACHE_PATH = path.resolve(
  process.cwd(),
  'scripts/output/places-cache.json',
);

// === Types ==================================================================

type PinRow = {
  id: string;
  name: string;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  google_place_url: string | null;
  price_level: number | null;
  hours_details: Record<string, unknown> | null;
  website: string | null;
  phone: string | null;
};

type PlacesCache = {
  /** pin_id → resolved Google place_id (or null when resolution failed). */
  byPin: Record<string, string | null>;
  updatedAt: string;
};

// === Helpers ================================================================

function parseArgs(argv: string[]): Set<string> {
  const set = new Set<string>();
  for (const a of argv) set.add(a);
  return set;
}
function strArg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1] ?? null;
  return null;
}
function numArg(name: string): number | null {
  const v = strArg(name);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function loadCache(): PlacesCache {
  try {
    const raw = fs.readFileSync(PLACES_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      byPin: parsed.byPin ?? {},
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { byPin: {}, updatedAt: new Date().toISOString() };
  }
}
function saveCache(c: PlacesCache) {
  fs.mkdirSync(path.dirname(PLACES_CACHE_PATH), { recursive: true });
  fs.writeFileSync(PLACES_CACHE_PATH, JSON.stringify(c, null, 2));
}

/** Try to lift a Google place_id out of an embedded URL. Most Maps share
 *  URLs don't carry a place_id directly — they use CID or hex data IDs
 *  that need a Find-Place hop to resolve. Returns null when we can't see
 *  a clean place_id; the caller falls back to Find Place from Text. */
function placeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Modern share URLs that include place_id directly.
  const direct = url.match(/place_id=(ChI[A-Za-z0-9_-]{20,})/);
  if (direct) return direct[1] ?? null;
  // !19s prefix — newer Maps deeplinks sometimes embed place_id as one
  // of the segments in a !..!..!.. block.
  const prefixed = url.match(/!1s(ChI[A-Za-z0-9_-]{20,})/);
  if (prefixed) return prefixed[1] ?? null;
  return null;
}

/** Find Place from Text — used when the google_place_url doesn't expose
 *  a clean place_id. We pass the pin name + biased to its lat/lng so a
 *  generic name like "Starbucks" lands on the right one. */
async function findPlaceId(
  name: string,
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  const body: Record<string, unknown> = { textQuery: name };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 200,
      },
    };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY!,
      // Keep the response narrow so this stays in the cheapest SKU tier.
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`  findPlace ${name}: HTTP ${res.status}`);
    return null;
  }
  const j = await res.json();
  const id = j?.places?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

/** Build the FieldMask we send on Place Details — only the fields the
 *  caller asked for. Every additional field potentially bumps SKU tier. */
function buildFieldMask(): string {
  // Always include id + displayName (free, used for sanity checks).
  const mask = new Set<string>(['id', 'displayName']);
  if (FIELDS.includes('price')) mask.add('priceLevel');
  if (FIELDS.includes('hours')) mask.add('regularOpeningHours');
  if (FIELDS.includes('website')) mask.add('websiteUri');
  if (FIELDS.includes('phone')) mask.add('internationalPhoneNumber');
  return Array.from(mask).join(',');
}

type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  regularOpeningHours?: {
    openNow?: boolean;
    periods?: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
    weekdayDescriptions?: string[];
  };
  websiteUri?: string;
  internationalPhoneNumber?: string;
};

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY!,
      'X-Goog-FieldMask': buildFieldMask(),
    },
  });
  if (!res.ok) {
    console.error(`  placeDetails ${placeId}: HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as PlaceDetails;
}

/** Map Google's PRICE_LEVEL_* enum to our 0-4 smallint. */
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

/** Coerce Places' regularOpeningHours.weekdayDescriptions into a shape
 *  we can store on hours_details.weekly. We stick to a single string
 *  per day (Google's localized weekday phrasing) rather than re-deriving
 *  open/close pairs — the rendered prose is what the detail page shows. */
function mapOpeningHours(
  h: PlaceDetails['regularOpeningHours'],
): Record<string, unknown> | null {
  if (!h) return null;
  const out: Record<string, unknown> = {};
  if (Array.isArray(h.weekdayDescriptions) && h.weekdayDescriptions.length > 0) {
    const byDay: Record<string, string> = {};
    const keyByDay: Record<string, string> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    for (const line of h.weekdayDescriptions) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const day = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      const key = keyByDay[day];
      if (key && value) byDay[key] = value;
    }
    if (Object.keys(byDay).length > 0) out.weekly = byDay;
    out.source = 'google_places';
  }
  if (typeof h.openNow === 'boolean') {
    out.open_now_at_fetch = h.openNow;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// === Main ==================================================================

async function main() {
  console.log(
    `Mode: ${APPLY ? 'APPLY (live writeback)' : 'DRY RUN (preview only)'}` +
    `${RESOLVE_ONLY ? ' [resolve-only]' : ''}`,
  );
  console.log(`Fields: ${FIELDS.join(', ')}`);
  console.log(
    `Cost ceiling: ${MAX_COST_USD === Infinity ? 'unlimited' : `$${MAX_COST_USD.toFixed(2)}`}`,
  );
  console.log(`Limit: ${LIMIT === Infinity ? 'no limit' : LIMIT}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Pull candidate pins. Default predicate: have a google_place_url
  //    AND price_level is null (so re-runs skip already-enriched rows).
  //    --refresh widens to all pins with a URL.
  console.log('Fetching candidate pins...');
  const pins: PinRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (pins.length < LIMIT) {
    let q = supabase
      .from('pins')
      .select('id, name, slug, lat, lng, google_place_url, price_level, hours_details, website, phone')
      .not('google_place_url', 'is', null)
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (!REFRESH) q = q.is('price_level', null);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      pins.push(r as PinRow);
      if (pins.length >= LIMIT) break;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  ${pins.length} candidate pin${pins.length === 1 ? '' : 's'}`);
  console.log('');

  if (pins.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // 2. Resolve place_ids. URL-extracted ones are free; the rest cost
  //    one Find-Place call per pin. Cache results so re-runs are cheap.
  const cache = loadCache();
  const cacheBefore = Object.keys(cache.byPin).length;
  let resolveCalls = 0;
  let resolveCost = 0;

  for (const pin of pins) {
    if (cache.byPin[pin.id] !== undefined) continue; // already cached
    const fromUrl = placeIdFromUrl(pin.google_place_url);
    if (fromUrl) {
      cache.byPin[pin.id] = fromUrl;
      continue;
    }
    // Need a Find-Place hop. Cost-gate.
    if (resolveCost + PRICE_PER_FIND_PLACE_USD > MAX_COST_USD) {
      console.log(`  cost ceiling reached during resolution at $${resolveCost.toFixed(2)} — stopping`);
      break;
    }
    process.stdout.write(`  resolving ${pin.name}... `);
    const placeId = await findPlaceId(pin.name, pin.lat, pin.lng);
    cache.byPin[pin.id] = placeId; // null is sticky; means "we tried"
    resolveCalls++;
    resolveCost += PRICE_PER_FIND_PLACE_USD;
    process.stdout.write(`${placeId ?? '(no match)'}\n`);
    // Save cache incrementally so a crash doesn't lose progress.
    if (resolveCalls % 25 === 0) {
      cache.updatedAt = new Date().toISOString();
      saveCache(cache);
    }
  }
  cache.updatedAt = new Date().toISOString();
  saveCache(cache);
  const cacheAfter = Object.keys(cache.byPin).length;
  console.log('');
  console.log(`Resolution: ${resolveCalls} Find-Place calls (~$${resolveCost.toFixed(2)})`);
  console.log(`Cache: ${cacheBefore} → ${cacheAfter} entries`);
  console.log('');

  if (RESOLVE_ONLY) {
    console.log('--resolve-only set — skipping Place Details. Exiting.');
    return;
  }

  // 3. Place Details fan-out. One call per pin with a place_id.
  let detailsCalls = 0;
  let detailsCost = 0;
  let withPrice = 0;
  let withHours = 0;
  let withWebsite = 0;
  let withPhone = 0;
  let written = 0;
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const pin of pins) {
    const placeId = cache.byPin[pin.id];
    if (!placeId) continue;

    if (detailsCost + PRICE_PER_PLACE_DETAILS_USD > MAX_COST_USD - resolveCost) {
      console.log(`  cost ceiling reached during details at $${(resolveCost + detailsCost).toFixed(2)} — stopping`);
      break;
    }

    const details = await fetchPlaceDetails(placeId);
    detailsCalls++;
    detailsCost += PRICE_PER_PLACE_DETAILS_USD;
    if (!details) continue;

    const patch: Record<string, unknown> = {};
    if (FIELDS.includes('price')) {
      const priceInt = priceLevelToInt(details.priceLevel);
      if (priceInt != null) {
        patch.price_level = priceInt;
        withPrice++;
      }
    }
    if (FIELDS.includes('hours')) {
      const mapped = mapOpeningHours(details.regularOpeningHours);
      if (mapped) {
        // Merge into hours_details rather than replace: we want to
        // preserve any manually-entered ramadan / parent_site / notes.
        const merged = { ...(pin.hours_details ?? {}), ...mapped };
        patch.hours_details = merged;
        withHours++;
      }
    }
    if (FIELDS.includes('website') && !pin.website && details.websiteUri) {
      patch.website = details.websiteUri;
      withWebsite++;
    }
    if (FIELDS.includes('phone') && !pin.phone && details.internationalPhoneNumber) {
      patch.phone = details.internationalPhoneNumber;
      withPhone++;
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: pin.id, patch });
    }

    if (detailsCalls % 25 === 0) {
      console.log(
        `  ...${detailsCalls} details calls, $${detailsCost.toFixed(2)}` +
        ` — ${withPrice} prices, ${withHours} hours, ${withWebsite} websites`,
      );
    }
  }

  console.log('');
  console.log(`Place Details: ${detailsCalls} calls (~$${detailsCost.toFixed(2)})`);
  console.log(`  with price_level: ${withPrice}`);
  console.log(`  with opening hours: ${withHours}`);
  console.log(`  with website: ${withWebsite}`);
  console.log(`  with phone: ${withPhone}`);
  console.log('');

  // 4. Apply phase
  if (!APPLY) {
    console.log(`DRY RUN: ${updates.length} pins would be updated.`);
    console.log(`Estimated total spend: $${(resolveCost + detailsCost).toFixed(2)}`);
    console.log('Re-run with --apply to write to Supabase.');
    return;
  }

  console.log('--- APPLYING ---');
  for (const u of updates) {
    const { error } = await supabase.from('pins').update(u.patch).eq('id', u.id);
    if (error) {
      console.error(`  update ${u.id}: ${error.message}`);
      continue;
    }
    written++;
    if (written % 50 === 0) console.log(`  ...wrote ${written}/${updates.length}`);
  }
  console.log('');
  console.log(`Wrote ${written}/${updates.length} updates.`);
  console.log(`Total spend: $${(resolveCost + detailsCost).toFixed(2)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
