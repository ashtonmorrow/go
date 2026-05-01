/**
 * Google Maps Takeout import.
 *
 * Reads ~/Library/.../uploads/Reviews.json + Saved Places.json (both
 * GeoJSON FeatureCollections from Google Takeout) and merges the data
 * into our pins table. By default does a DRY RUN: prints a stats
 * summary and writes scripts/output/takeout-dry-run.json. Pass --apply
 * to actually mutate Supabase.
 *
 * The match logic per Takeout feature:
 *   1. Extract name + lat/lng + google_maps_url + (for reviews) text +
 *      five_star_rating + structured questions + date.
 *   2. Find the best pin match by:
 *        - exact normalized name (case-insensitive, punctuation-stripped)
 *          AND within 200m → confident
 *        - normalized-name substring AND within 200m → confident
 *        - otherwise: no match (becomes a candidate new pin)
 *   3. Reviews: for each unique pin, aggregate all matched Takeout
 *      reviews — keep the most recent text, the highest rating, merge
 *      aspect_ratings (last-wins on conflicts), count = N. Mark visited.
 *   4. New pins: classify kind from the place name (Hotel/Restaurant/
 *      Service/etc) and stash the review data on the new row.
 *
 * Run from the project root:
 *   npx tsx --env-file=.env.local scripts/import-google-takeout.ts
 *
 * To apply for real (after reviewing the dry-run report):
 *   npx tsx --env-file=.env.local scripts/import-google-takeout.ts --apply
 *
 * Required env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// === Config =================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Pulling from the local uploads dir. If you re-export Takeout, drop the
// JSON files at one of these locations (or pass the paths via env vars).
const REVIEWS_PATH =
  process.env.TAKEOUT_REVIEWS ||
  path.resolve(process.env.HOME || '~', 'Library/Application Support/Claude/local-agent-mode-sessions/1218d900-1d82-40e9-937d-9d39be965a2e/c58c61a4-e765-4466-9160-daa7c211c5fc/local_03159eeb-bf46-476e-b84d-984276954639/uploads/Reviews.json');
const SAVED_PATH =
  process.env.TAKEOUT_SAVED ||
  path.resolve(process.env.HOME || '~', 'Library/Application Support/Claude/local-agent-mode-sessions/1218d900-1d82-40e9-937d-9d39be965a2e/c58c61a4-e765-4466-9160-daa7c211c5fc/local_03159eeb-bf46-476e-b84d-984276954639/uploads/Saved Places.json');

const APPLY = process.argv.includes('--apply');
const MATCH_RADIUS_M = 200; // 200m proximity threshold for name+coord match

// === Types ==================================================================

type TakeoutFeature = {
  geometry?: { type: 'Point'; coordinates: [number, number] };
  properties: {
    date?: string;
    google_maps_url?: string;
    location?: {
      name?: string;
      address?: string;
      country_code?: string;
    };
    five_star_rating_published?: number;
    review_text_published?: string;
    questions?: { question: string; rating?: number; selected_option?: string }[];
  };
};

type TakeoutCollection = { type: 'FeatureCollection'; features: TakeoutFeature[] };

type PinRow = {
  id: string;
  name: string;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  google_place_url: string | null;
  kind: string | null;
  visited: boolean;
  lists: string[] | null;
  city_names: string[] | null;
  states_names: string[] | null;
  address: string | null;
};

type AggregatedReview = {
  /** Most recent text we saw across this place's reviews. */
  text: string | null;
  /** Highest star rating seen. */
  rating: number | null;
  /** Most recent posted_at. */
  publishedAt: string | null;
  /** Merged structured Q&A (last-wins on conflicts). */
  aspectRatings: Record<string, number | string>;
  /** Place's google_maps_url. */
  googlePlaceUrl: string | null;
  /** Distinct number of review features seen, excluding saved-only rows. */
  count: number;
  /** Whether this place came from a review, not only a saved-place list. */
  hasReview: boolean;
  /** True when the place appears in Google Saved Places. */
  saved: boolean;
};

type MatchResult =
  | { kind: 'matched'; pin: PinRow; review: AggregatedReview }
  | { kind: 'new'; review: AggregatedReview; place: { name: string; address: string | null; country: string | null; lat: number; lng: number; classifiedKind: string; serviceType: string | null } };

// === Helpers ===============================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable key for matching equivalent Google Maps place URLs. */
function googlePlaceKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) return `cid:${cidMatch[1]}`;
  const dataMatch = url.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (dataMatch) return `data:${dataMatch[1].toLowerCase()}`;
  try {
    const u = new URL(url);
    u.hash = '';
    return `url:${u.toString().replace(/\/$/, '')}`;
  } catch {
    return `url:${url.trim()}`;
  }
}

/** Haversine distance in meters. */
function distMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const A = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
}

/** Map a Google review aspect question to a snake_case key. */
function aspectKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?,.!()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+$/g, '');
}

/** Classify a Takeout place into one of our pin kinds, plus an optional
 *  service_type. Lossy heuristics on name; the user can fix later. */
function classifyKind(name: string): { kind: string; serviceType: string | null } {
  const n = name.toLowerCase();
  // Major hotel brand names — caught first because the brand often
  // replaces the literal word "Hotel" in the listing (e.g. "Le Méridien
  // Cairo Airport", "Four Points by Sheraton", "Ritz-Carlton Bali").
  if (/\b(meridien|méridien|sheraton|hilton|conrad|waldorf|marriott|courtyard|residence inn|fairfield|moxy|four points|ritz[- ]?carlton|hyatt|park hyatt|grand hyatt|andaz|westin|w hotel|st\.? regis|kimpton|intercontinental|holiday inn|crowne plaza|indigo|even hotels|radisson|park inn|country inn|wyndham|ramada|days inn|super 8|best western|four seasons|mandarin oriental|peninsula|aman|six senses|banyan tree|shangri[- ]?la|kempinski|sofitel|novotel|mercure|ibis|pullman|accor|nh hotel|melia|sol|barceló|riu|iberostar|fairmont|raffles|swissotel|movenpick|mövenpick|jumeirah|rosewood|edition|standard|hoxton|ace hotel|citizenm|premier inn|travelodge)\b/.test(n)) {
    return { kind: 'hotel', serviceType: null };
  }
  // Generic hotel-shaped names
  if (/\b(hotel|resort|hostel|inn|motel|suites|boutique|guest ?house|guesthouse|lodge|apartments?|aparthotel|villa|riad|ryokan|ryotel|pension|b&b|bed and breakfast)\b/.test(n)) {
    return { kind: 'hotel', serviceType: null };
  }
  // Restaurant / food
  if (/\b(restaurant|restaurante|ristorante|café|cafe|caffè|bistro|brasserie|trattoria|osteria|izakaya|pizzeria|pub|bar|grill|steakhouse|diner|deli|bakery|patisserie|coffee|tea house|noodle|ramen|sushi|taqueria|cantina|tapas)\b/.test(n)) {
    return { kind: 'restaurant', serviceType: null };
  }
  // Service-flavor — luggage lockers, tailors, laundry, pharmacy, barber/spa, medical
  if (/\b(locker|left luggage|luggage storage|consigna|gepäck|bagaglio)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'locker' };
  }
  if (/\b(tailor|sastr|sartoria|alterations)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'tailor' };
  }
  if (/\b(laundry|launderette|laundromat|lavanderia|wäscherei)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'laundry' };
  }
  if (/\b(pharmacy|pharmacie|farmacia|apotheke|chemist|drugstore)\b/.test(n)) {
    return { kind: 'shopping', serviceType: 'pharmacy' };
  }
  if (/\b(barber|barbershop|hair salon|salon|peluquería|peluqueria|coiffeur|friseur)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'barber' };
  }
  if (/\b(massage|spa|hammam|onsen|sauna|wellness)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'spa' };
  }
  if (/\b(clinic|hospital|dentist|doctor|medical centre|medical center|consultorio|clínica|klinik)\b/.test(n)) {
    return { kind: 'attraction', serviceType: 'medical' };
  }
  if (/\b(airport|station|terminal|metro|subway|train station|bus station|ferry terminal)\b/.test(n)) {
    return { kind: 'transit', serviceType: null };
  }
  // Park-shaped names — keep existing kind in line with the schema
  if (/\b(park|parque|garden|gardens|jardin|jardim|botanical|reserve|reserva|nature reserve)\b/.test(n)) {
    return { kind: 'park', serviceType: null };
  }
  // Shopping
  if (/\b(market|mercado|bazaar|mall|shopping centre|shopping center|department store|souk)\b/.test(n)) {
    return { kind: 'shopping', serviceType: null };
  }
  // Default: attraction
  return { kind: 'attraction', serviceType: null };
}

/** Aggregate one or more reviews of the same place into a single row. */
function aggregateReviews(features: TakeoutFeature[]): AggregatedReview {
  let text: string | null = null;
  let rating: number | null = null;
  let publishedAt: string | null = null;
  const aspectRatings: Record<string, number | string> = {};
  let googlePlaceUrl: string | null = null;
  let count = 0;
  let hasReview = false;
  let saved = false;

  // Process newest-first so "most recent text" wins, and aspect_ratings
  // last-wins becomes "most-recently-set wins" if you flip the order.
  const sorted = [...features].sort((a, b) => {
    const da = a.properties?.date ?? '';
    const db = b.properties?.date ?? '';
    return db.localeCompare(da);
  });

  for (const f of sorted) {
    const p = f.properties;
    const isReview = Boolean(
      p.review_text_published?.trim() ||
        (p.five_star_rating_published && p.five_star_rating_published > 0) ||
        (p.questions && p.questions.length > 0),
    );
    if (isReview) {
      count++;
      hasReview = true;
    } else {
      saved = true;
    }
    if (!text && p.review_text_published && p.review_text_published.trim()) {
      text = p.review_text_published.trim();
    }
    if (p.five_star_rating_published && p.five_star_rating_published > 0) {
      rating = Math.max(rating ?? 0, p.five_star_rating_published);
    }
    if (!publishedAt && p.date) publishedAt = p.date;
    if (!googlePlaceUrl && p.google_maps_url) googlePlaceUrl = p.google_maps_url;
    for (const q of p.questions ?? []) {
      const k = aspectKey(q.question);
      if (q.rating != null) aspectRatings[k] = q.rating;
      else if (q.selected_option != null && !(k in aspectRatings)) {
        aspectRatings[k] = q.selected_option;
      }
    }
  }

  return { text, rating, publishedAt, aspectRatings, googlePlaceUrl, count, hasReview, saved };
}

// === Main ==================================================================

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (live writeback)' : 'DRY RUN (preview only)'}`);
  console.log(`Match radius: ${MATCH_RADIUS_M}m`);
  console.log('');

  // 1. Load Takeout JSON
  const reviews: TakeoutCollection = JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8'));
  const saved: TakeoutCollection = JSON.parse(fs.readFileSync(SAVED_PATH, 'utf8'));
  console.log(`Loaded ${reviews.features.length} reviews, ${saved.features.length} saved places.`);

  // 2. Group reviews by place — same google_maps_url means same place,
  //    fall back to (name + rounded lat/lng) for places that don't carry
  //    a CID URL. This collapses Mike's repeat reviews into one record.
  const byPlace = new Map<string, TakeoutFeature[]>();
  function placeKey(f: TakeoutFeature): string | null {
    const url = f.properties?.google_maps_url;
    const name = f.properties?.location?.name;
    const coords = f.geometry?.coordinates;
    if (!name || !coords) return null;
    const fromUrl = googlePlaceKey(url);
    if (fromUrl) return fromUrl;
    return `nm:${normalize(name)}@${coords[1].toFixed(4)},${coords[0].toFixed(4)}`;
  }
  for (const f of reviews.features) {
    const k = placeKey(f);
    if (!k) continue;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k)!.push(f);
  }
  // Treat saved places like a single-feature group (no review text).
  for (const f of saved.features) {
    const k = placeKey(f);
    if (!k) continue;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k)!.push(f);
  }
  console.log(`Collapsed to ${byPlace.size} distinct places.`);
  console.log('');

  // 3. Pull all pins with coords
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log('Fetching all pins with coords from Supabase...');
  const allPins: PinRow[] = [];
  let from = 0;
  const PAGE = 500; // smaller page to keep response payload predictable
  while (true) {
    // Slim SELECT — we only need name + coords for matching. address /
    // city_names / states_names / kind / visited / slug are dropped to
    // keep the response small. The 2k+ row table at full width pushed
    // past PostgREST's response cap and silently dropped the connection.
    const { data, error } = await supabase
      .from('pins')
      .select('id, name, lat, lng, google_place_url, visited, lists')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    // Pad the rest of the PinRow shape with defaults — only id/name/lat/lng
    // are read by the match logic; the others were over-fetched belt-and-
    // suspenders columns left over from when this script also wrote
    // descriptive output for non-matched rows.
    for (const row of data) {
      allPins.push({
        id: row.id as string,
        name: row.name as string,
        google_place_url: (row.google_place_url as string | null) ?? null,
        slug: null,
        lat: row.lat as number,
        lng: row.lng as number,
        kind: null,
        visited: Boolean(row.visited),
        lists: Array.isArray(row.lists) ? row.lists as string[] : [],
        city_names: null,
        states_names: null,
        address: null,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Fetched ${allPins.length} pins with coords.`);
  console.log('');

  // Pre-compute normalized names for matching
  const pinIndex = allPins.map((p) => ({
    pin: p,
    nname: normalize(p.name),
  }));
  const pinByGoogleKey = new Map<string, PinRow>();
  for (const pin of allPins) {
    const key = googlePlaceKey(pin.google_place_url);
    if (key && !pinByGoogleKey.has(key)) pinByGoogleKey.set(key, pin);
  }

  // 4. Match each Takeout place to a pin
  const matches: MatchResult[] = [];
  let googleUrlCount = 0;
  let exactCount = 0;
  let substringCount = 0;
  let newCount = 0;
  for (const [, features] of byPlace) {
    // Use the first feature for canonical place metadata
    const head = features[0];
    const name = head.properties?.location?.name ?? '';
    const coords = head.geometry?.coordinates;
    if (!name || !coords) continue;
    const review = aggregateReviews(features);
    const nname = normalize(name);

    const googleKey = googlePlaceKey(review.googlePlaceUrl);
    const googleUrlMatch = googleKey ? pinByGoogleKey.get(googleKey) : null;
    if (googleUrlMatch) {
      matches.push({ kind: 'matched', pin: googleUrlMatch, review });
      googleUrlCount++;
      continue;
    }

    // Try exact normalized name match within radius
    let best: { pin: PinRow; dist: number; mode: 'exact' | 'substring' } | null = null;
    for (const { pin, nname: pn } of pinIndex) {
      if (pin.lat == null || pin.lng == null) continue;
      const d = distMeters([pin.lng, pin.lat], coords as [number, number]);
      if (d > MATCH_RADIUS_M * 5) continue; // hard cap to skip obviously distant
      if (pn === nname && d <= MATCH_RADIUS_M) {
        if (!best || d < best.dist || (best.mode !== 'exact')) {
          best = { pin, dist: d, mode: 'exact' };
        }
      }
    }
    // Fallback: substring match within radius
    if (!best && nname.length >= 4) {
      for (const { pin, nname: pn } of pinIndex) {
        if (pin.lat == null || pin.lng == null) continue;
        const d = distMeters([pin.lng, pin.lat], coords as [number, number]);
        if (d > MATCH_RADIUS_M) continue;
        if (pn.includes(nname) || nname.includes(pn)) {
          if (!best || d < best.dist) best = { pin, dist: d, mode: 'substring' };
        }
      }
    }

    if (best) {
      matches.push({ kind: 'matched', pin: best.pin, review });
      if (best.mode === 'exact') exactCount++;
      else substringCount++;
    } else {
      const cls = classifyKind(name);
      matches.push({
        kind: 'new',
        review,
        place: {
          name,
          address: head.properties?.location?.address ?? null,
          country: head.properties?.location?.country_code ?? null,
          lat: coords[1] as number,
          lng: coords[0] as number,
          classifiedKind: cls.kind,
          serviceType: cls.serviceType,
        },
      });
      newCount++;
    }
  }

  // 5. Stats summary
  console.log('--- Match results ---');
  console.log(`  Google URL match:       ${googleUrlCount}`);
  console.log(`  Exact name+coord match: ${exactCount}`);
  console.log(`  Substring name match:   ${substringCount}`);
  console.log(`  New place candidates:   ${newCount}`);
  console.log(`  Total places processed: ${matches.length}`);
  console.log('');

  // Breakdown of new places by classified kind
  const newByKind: Record<string, number> = {};
  const newServiceByType: Record<string, number> = {};
  for (const m of matches) {
    if (m.kind !== 'new') continue;
    newByKind[m.place.classifiedKind] = (newByKind[m.place.classifiedKind] ?? 0) + 1;
    if (m.place.serviceType) {
      newServiceByType[m.place.serviceType] = (newServiceByType[m.place.serviceType] ?? 0) + 1;
    }
  }
  console.log('New places by classified kind:');
  for (const [k, n] of Object.entries(newByKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`);
  }
  if (Object.keys(newServiceByType).length > 0) {
    console.log('Service sub-types:');
    for (const [k, n] of Object.entries(newServiceByType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n}`);
    }
  }
  console.log('');

  // 6. Write the dry-run report
  const outDir = path.resolve(process.cwd(), 'scripts/output');
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.resolve(outDir, 'takeout-dry-run.json');
  const report = {
    summary: {
      reviews: reviews.features.length,
      saved: saved.features.length,
      distinctPlaces: byPlace.size,
      exactMatches: exactCount,
      googleUrlMatches: googleUrlCount,
      substringMatches: substringCount,
      newPlaces: newCount,
      newByKind,
      newServiceByType,
    },
    matches,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written: ${reportPath}`);
  console.log(`(${(fs.statSync(reportPath).size / 1024).toFixed(1)} KB)`);

  // 7. Apply phase — only when --apply is passed
  if (!APPLY) {
    console.log('');
    console.log('DRY RUN complete. Re-run with --apply to write to Supabase.');
    return;
  }

  console.log('');
  console.log('--- APPLYING ---');

  // === Idempotency =========================================================
  // Re-runs are cheap. Pull every google_place_url already in the pins table
  // and skip the corresponding insert. Crash-mid-run is now safe — the next
  // run picks up where this one left off. Sequential inserts are 941 round-
  // trips at ~3/sec which exceeds bash timeouts, so we also batch.
  const { data: existingUrls, error: urlErr } = await supabase
    .from('pins')
    .select('google_place_url')
    .not('google_place_url', 'is', null);
  if (urlErr) throw urlErr;
  const seenUrls = new Set(
    (existingUrls ?? [])
      .map((r) => r.google_place_url as string | null)
      .map(googlePlaceKey)
      .filter((u): u is string => !!u),
  );
  console.log(`  ${seenUrls.size} pins already carry google_place_url (will be skipped on insert).`);

  // === Build the update + insert payloads ==================================
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const inserts: Record<string, unknown>[] = [];

  for (const m of matches) {
    if (m.kind === 'matched') {
      const patch: Record<string, unknown> = {};
      if (m.review.hasReview) {
        patch.visited = true;
        patch.review_count = m.review.count;
      }
      if (m.review.text) patch.personal_review = m.review.text;
      if (m.review.rating) patch.personal_rating = m.review.rating;
      if (m.review.publishedAt) patch.review_published_at = m.review.publishedAt;
      if (m.review.publishedAt) patch.visit_year = Number(m.review.publishedAt.slice(0, 4));
      if (m.review.googlePlaceUrl) patch.google_place_url = m.review.googlePlaceUrl;
      if (m.review.saved) patch.lists = [...new Set([...(m.pin.lists ?? []), 'Google Saved Places'])];
      if (Object.keys(m.review.aspectRatings).length > 0) {
        patch.aspect_ratings = m.review.aspectRatings;
      }
      updates.push({ id: m.pin.id, patch });
    } else {
      // Skip already-inserted rows by google_place_url. Drops mid-run resume
      // cost to a single SELECT.
      const googleKey = googlePlaceKey(m.review.googlePlaceUrl);
      if (googleKey && seenUrls.has(googleKey)) {
        continue;
      }
      const row: Record<string, unknown> = {
        name: m.place.name,
        lat: m.place.lat,
        lng: m.place.lng,
        kind: m.place.classifiedKind,
        visited: m.review.hasReview,
        source: m.review.hasReview ? 'google-takeout-reviews' : 'google-takeout-saved',
        address: m.place.address,
        google_place_url: m.review.googlePlaceUrl,
        review_count: m.review.count,
        // Defaults required by NOT NULL columns
        city_names: [],
        states_names: [],
        tags: [],
        lists: m.review.saved ? ['Google Saved Places'] : [],
        best_months: [],
        images: [],
        hours_details: {},
        price_details: {},
        enrichment_status: 'unverified',
      };
      if (m.place.serviceType) row.service_type = m.place.serviceType;
      if (m.review.text) row.personal_review = m.review.text;
      if (m.review.rating) row.personal_rating = m.review.rating;
      if (m.review.publishedAt) row.review_published_at = m.review.publishedAt;
      if (m.review.publishedAt) row.visit_year = Number(m.review.publishedAt.slice(0, 4));
      if (Object.keys(m.review.aspectRatings).length > 0) {
        row.aspect_ratings = m.review.aspectRatings;
      }
      inserts.push(row);
    }
  }
  console.log(`  Queued: ${updates.length} updates, ${inserts.length} inserts.`);

  // === Bulk insert in chunks ===============================================
  // PostgREST handles arrays natively — one POST per chunk = ~50ms instead
  // of one POST per row = ~250ms. 100 rows/chunk keeps the request body
  // well under any limit.
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK);
    const { error } = await supabase.from('pins').insert(slice);
    if (error) {
      console.error(`  bulk insert chunk ${i}: ${error.message}`);
      continue;
    }
    inserted += slice.length;
    console.log(`  ...inserted ${inserted}/${inserts.length}`);
  }

  // Updates have to be one-per-row (no bulk update by id in PostgREST), but
  // they're a small set (~13) so this stays fast.
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase.from('pins').update(u.patch).eq('id', u.id);
    if (error) {
      console.error(`  update ${u.id}: ${error.message}`);
      continue;
    }
    updated++;
  }

  console.log('');
  console.log(`Updated: ${updated} pins`);
  console.log(`Inserted: ${inserted} new pins (idempotent — re-running is safe)`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
