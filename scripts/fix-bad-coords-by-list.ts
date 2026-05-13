// === Fix bad coordinates on saved-list pins ===============================
//
// Audits pins in our recently-imported saved_lists for coordinates that
// fall outside the bounding box of the list's city/region (the
// Notre-Dame-Cathedral-of-Saigon-rendering-in-central-Europe class of
// bug — typically a lat/lng swap, a zero-defaulted to placeholder, or
// a legacy import that landed a Vietnamese pin at 47°N, 12°E).
//
// For each offender we attempt to repair the coordinates by routing
// through the Stray `place-details` edge function (one-key
// architecture — same pattern lib/placesEnrichment.ts uses):
//   1. If pin.google_place_id is set, ask for action='details' with
//      fields=['location'].
//   2. Otherwise, ask for action='find' with a name+city+country query
//      to resolve a place_id, then 'details' for the coords.
//   3. If both fail, zero the coords (lat=null, lng=null) so the pin
//      doesn't render in the wrong place at all.
//
// Writes touch only lat, lng, updated_at. When we resolve a place_id
// via Find Place we also persist google_place_id so the next run hits
// the cached path for free.
//
// Run: `npx tsx --env-file=.env.local scripts/fix-bad-coords-by-list.ts`
// Add --apply to write. Defaults to dry-run.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.on('unhandledRejection', (reason) => {
  console.error('[fix-coords] unhandledRejection:', reason);
  process.exit(2);
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[fix-coords] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
// When set, we save per-pin progress to disk so a re-run after a kill
// resumes where it left off rather than re-querying Google Places for
// pins we already resolved. Defaults to /tmp/fix-coords-state.json.
const STATE_PATH = process.env.FIX_COORDS_STATE ?? '/tmp/fix-coords-state.json';
// Per-pin time budget (ms). Edge function plus our retry must finish
// inside this — otherwise we move on and treat the pin as a failure.
const PER_PIN_TIMEOUT_MS = Number(process.env.FIX_COORDS_PIN_TIMEOUT ?? 8000);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// === List bounding boxes ====================================================
// Generous boxes — bigger errors (47°N/12°E for a Vietnamese pin) get
// caught easily and rough but plausible coords are not flagged.
type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number };
type ListSpec = {
  /** saved_lists[] slug to match */
  slug: string;
  /** Alternate slugs / display names that might also be present */
  aliases: string[];
  /** Bounding box for any valid pin in this list */
  bbox: Bbox;
  /** Place-search context appended when finding by text */
  cityHint: string;
  countryHint: string;
};

const LISTS: ListSpec[] = [
  {
    slug: 'ho-chi-minh-city',
    aliases: ['ho chi minh city', 'saigon', 'hồ chí minh city'],
    bbox: { minLat: 8.0, maxLat: 24.0, minLng: 102.0, maxLng: 110.0 },
    cityHint: 'Ho Chi Minh City', countryHint: 'Vietnam',
  },
  {
    slug: 'montevideo',
    aliases: ['montevideo'],
    bbox: { minLat: -38, maxLat: -30, minLng: -60, maxLng: -53 },
    cityHint: 'Montevideo', countryHint: 'Uruguay',
  },
  {
    slug: 'gunung-mulu',
    aliases: ['gunung mulu'],
    bbox: { minLat: 0, maxLat: 8, minLng: 110, maxLng: 120 },
    cityHint: 'Gunung Mulu National Park', countryHint: 'Malaysia',
  },
  {
    slug: 'kota-kinabalu',
    aliases: ['kota kinabalu'],
    bbox: { minLat: 0, maxLat: 8, minLng: 110, maxLng: 120 },
    cityHint: 'Kota Kinabalu', countryHint: 'Malaysia',
  },
  {
    slug: 'koh-samui',
    aliases: ['koh samui'],
    bbox: { minLat: 5, maxLat: 21, minLng: 95, maxLng: 106 },
    cityHint: 'Koh Samui', countryHint: 'Thailand',
  },
  {
    slug: 'kuala-lumpur',
    aliases: ['kuala lumpur'],
    bbox: { minLat: -5, maxLat: 7, minLng: 99, maxLng: 120 },
    cityHint: 'Kuala Lumpur', countryHint: 'Malaysia',
  },
  {
    slug: 'singapore',
    aliases: ['singapore'],
    bbox: { minLat: 1.0, maxLat: 1.6, minLng: 103.5, maxLng: 104.1 },
    cityHint: 'Singapore', countryHint: 'Singapore',
  },
  {
    slug: 'rotterdam',
    aliases: ['rotterdam'],
    bbox: { minLat: 50.5, maxLat: 53.7, minLng: 3.0, maxLng: 7.5 },
    cityHint: 'Rotterdam', countryHint: 'Netherlands',
  },
  {
    slug: 'athens',
    aliases: ['athens'],
    bbox: { minLat: 34, maxLat: 42, minLng: 19, maxLng: 30 },
    cityHint: 'Athens', countryHint: 'Greece',
  },
  {
    slug: 'bruges',
    aliases: ['bruges', 'brugge'],
    bbox: { minLat: 49, maxLat: 52, minLng: 2.5, maxLng: 6.5 },
    cityHint: 'Bruges', countryHint: 'Belgium',
  },
  {
    slug: 'split',
    aliases: ['split'],
    bbox: { minLat: 42, maxLat: 46, minLng: 13, maxLng: 19 },
    cityHint: 'Split', countryHint: 'Croatia',
  },
  {
    slug: 'phuket',
    aliases: ['phuket'],
    bbox: { minLat: 7, maxLat: 9, minLng: 98, maxLng: 99 },
    cityHint: 'Phuket', countryHint: 'Thailand',
  },
  {
    slug: 'the-hague',
    aliases: ['the hague', 'den haag'],
    bbox: { minLat: 51, maxLat: 53, minLng: 3, maxLng: 5.5 },
    cityHint: 'The Hague', countryHint: 'Netherlands',
  },
];

// === Types =================================================================
type PinRow = {
  id: string;
  slug: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  address: string | null;
  saved_lists: string[] | null;
  city_names: string[] | null;
  states_names: string[] | null;
};

type FixOutcome = 'fixed-via-details' | 'fixed-via-find' | 'zeroed' | 'skipped-apply-off';

type FixRecord = {
  list: string;
  slug: string | null;
  name: string;
  oldLat: number | null;
  oldLng: number | null;
  newLat: number | null;
  newLng: number | null;
  outcome: FixOutcome;
  swappedLatLng?: boolean;
  note?: string;
};

// === Helpers ===============================================================
function inBbox(lat: number, lng: number, b: Bbox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

function isOffender(row: PinRow, bbox: Bbox): boolean {
  if (row.lat == null || row.lng == null) return true;
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return true;
  return !inBbox(row.lat, row.lng, bbox);
}

/** Detect the lat/lng-swap pattern: the current pair is invalid, but
 *  swapping them falls inside the list's bbox. Useful colour for the
 *  final report. */
function looksLatLngSwapped(row: PinRow, bbox: Bbox): boolean {
  if (row.lat == null || row.lng == null) return false;
  return inBbox(row.lng, row.lat, bbox);
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/** Pulls coords out of whichever shape the edge function returned. The
 *  Stray place-details function answers v1 (geometry.location.lat/lng)
 *  for legacy callers and Places API New (details.location.latitude/
 *  longitude) for newer ones — handle both. */
function extractCoords(data: unknown): { lat: number; lng: number } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const details = (d.details ?? d.result) as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') return null;

  // Places API New shape
  const loc = details.location as Record<string, unknown> | undefined;
  if (loc) {
    const lat = (loc.latitude ?? loc.lat) as unknown;
    const lng = (loc.longitude ?? loc.lng) as unknown;
    if (isValidCoord(lat, lng)) return { lat: lat as number, lng: lng as number };
  }
  // Legacy v1 shape: geometry.location.lat/lng
  const geom = details.geometry as Record<string, unknown> | undefined;
  if (geom && typeof geom === 'object') {
    const inner = geom.location as Record<string, unknown> | undefined;
    if (inner) {
      const lat = (inner.lat ?? inner.latitude) as unknown;
      const lng = (inner.lng ?? inner.longitude) as unknown;
      if (isValidCoord(lat, lng)) return { lat: lat as number, lng: lng as number };
    }
  }
  return null;
}

async function callEdge(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await sb.functions.invoke('place-details', { body });
  if (error) {
    let payload: unknown = null;
    try {
      payload = await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.();
    } catch {
      /* best-effort */
    }
    throw new Error(
      `place-details ${JSON.stringify(body)} failed: ${error.message}${payload ? ` ${JSON.stringify(payload)}` : ''}`,
    );
  }
  return data;
}

async function detailsForPlaceId(placeId: string): Promise<{ lat: number; lng: number } | null> {
  const data = await callEdge({ action: 'details', placeId, fields: ['location'] });
  return extractCoords(data);
}

async function findPlaceId(
  query: string,
  bias: { lat?: number; lng?: number } = {},
): Promise<string | null> {
  const data = await callEdge({ action: 'find', name: query, lat: bias.lat, lng: bias.lng });
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const id = (d.placeId ?? d.place_id) as unknown;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

function searchQuery(pin: PinRow, list: ListSpec): string {
  return [pin.name, list.cityHint, list.countryHint].filter(Boolean).join(', ');
}

async function fetchOffendersForList(list: ListSpec): Promise<PinRow[]> {
  // Pull every pin in this list (any matching slug/alias), then filter
  // in JS for the offender predicate. We avoid trying to express the
  // bbox-out check in PostgREST — it's a tiny dataset.
  const cols =
    'id, slug, name, lat, lng, google_place_id, address, saved_lists, city_names, states_names';
  const listKeys = [list.slug, ...list.aliases];

  const all: PinRow[] = [];
  // overlaps operator handles array intersection.
  const { data, error } = await sb
    .from('pins')
    .select(cols)
    .overlaps('saved_lists', listKeys);
  if (error) throw error;
  for (const row of (data ?? []) as PinRow[]) all.push(row);

  // For Ho Chi Minh City the user also asked to fold in city_names
  // matches even when saved_lists doesn't carry the list.
  if (list.slug === 'ho-chi-minh-city') {
    const cityKeys = ['Ho Chi Minh City', 'Saigon', 'Hồ Chí Minh City'];
    const { data: cityData, error: cityErr } = await sb
      .from('pins')
      .select(cols)
      .overlaps('city_names', cityKeys);
    if (cityErr) throw cityErr;
    const seen = new Set(all.map(r => r.id));
    for (const row of (cityData ?? []) as PinRow[]) {
      if (!seen.has(row.id)) all.push(row);
    }
  }

  return all.filter(row => isOffender(row, list.bbox));
}

async function repairPin(
  pin: PinRow,
  list: ListSpec,
): Promise<{ outcome: FixOutcome; coords: { lat: number | null; lng: number | null }; resolvedPlaceId?: string }> {
  // Path 1: cached place_id.
  if (pin.google_place_id) {
    try {
      const coords = await detailsForPlaceId(pin.google_place_id);
      if (coords && inBbox(coords.lat, coords.lng, list.bbox)) {
        return { outcome: 'fixed-via-details', coords };
      }
      // Coords resolved but they still aren't in the bbox — fall
      // through to find-by-text; the place_id may itself be wrong
      // (e.g. pointed at a similarly-named place elsewhere).
    } catch (err) {
      console.warn(`[fix-coords]   details(${pin.google_place_id}) failed: ${(err as Error).message}`);
    }
  }

  // Path 2: find by text, then details.
  try {
    const placeId = await findPlaceId(searchQuery(pin, list));
    if (placeId) {
      const coords = await detailsForPlaceId(placeId);
      if (coords && inBbox(coords.lat, coords.lng, list.bbox)) {
        return { outcome: 'fixed-via-find', coords, resolvedPlaceId: placeId };
      }
    }
  } catch (err) {
    console.warn(`[fix-coords]   find(${pin.name}) failed: ${(err as Error).message}`);
  }

  // Path 3: give up — zero coords so the pin doesn't render in the wrong place.
  return { outcome: 'zeroed', coords: { lat: null, lng: null } };
}

// === Checkpoint state ======================================================
type State = {
  apply: boolean;
  fixes: FixRecord[];
  /** Set of `${list}\t${pinId}` keys that have already been processed in
   *  this run mode so we don't re-call Google Places for them on resume. */
  done: Record<string, true>;
  summary: Record<string, { offenders: number; fixed: number; zeroed: number; failed: number }>;
};

function loadState(): State {
  if (existsSync(STATE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State;
      if (raw.apply === APPLY) return raw;
      console.log(`[fix-coords] state file mode mismatch (was apply=${raw.apply}, now ${APPLY}) — starting fresh`);
    } catch (err) {
      console.warn(`[fix-coords] state file unreadable: ${(err as Error).message} — starting fresh`);
    }
  }
  return { apply: APPLY, fixes: [], done: {}, summary: {} };
}

function saveState(state: State) {
  writeFileSync(STATE_PATH, JSON.stringify(state));
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

// === Main ==================================================================
async function main() {
  console.log(`[fix-coords] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[fix-coords] State file: ${STATE_PATH}`);

  const state = loadState();
  const summary = state.summary;
  const allFixes = state.fixes;
  const zeroedForManual: FixRecord[] = allFixes.filter(r => r.outcome === 'zeroed');
  const swappedSamples: FixRecord[] = allFixes.filter(r => r.swappedLatLng).slice(0, 12);

  for (const list of LISTS) {
    const offenders = await fetchOffendersForList(list);
    if (!summary[list.slug]) {
      summary[list.slug] = { offenders: offenders.length, fixed: 0, zeroed: 0, failed: 0 };
    } else {
      summary[list.slug]!.offenders = offenders.length;
    }
    if (offenders.length === 0) {
      console.log(`[fix-coords] ${list.slug}: no offenders`);
      continue;
    }
    console.log(`[fix-coords] ${list.slug}: ${offenders.length} offenders`);

    for (let idx = 0; idx < offenders.length; idx++) {
      const pin = offenders[idx]!;
      const stateKey = `${list.slug}\t${pin.id}`;
      if (state.done[stateKey]) {
        // Already processed in an earlier run that was killed mid-way.
        continue;
      }
      const swap = looksLatLngSwapped(pin, list.bbox);
      let outcome: FixOutcome;
      let newLat: number | null = null;
      let newLng: number | null = null;
      let resolvedPlaceId: string | undefined;

      try {
        console.log(`[fix-coords]   [${idx + 1}/${offenders.length}] ${pin.name} (place_id=${pin.google_place_id ? 'yes' : 'no'}, old=${pin.lat ?? 'null'},${pin.lng ?? 'null'})`);
        const result = await withTimeout(repairPin(pin, list), PER_PIN_TIMEOUT_MS, `repair ${pin.name}`);
        outcome = result.outcome;
        newLat = result.coords.lat;
        newLng = result.coords.lng;
        resolvedPlaceId = result.resolvedPlaceId;
        console.log(`[fix-coords]     -> ${outcome} new=${newLat ?? 'null'},${newLng ?? 'null'}`);
      } catch (err) {
        summary[list.slug]!.failed++;
        console.error(`[fix-coords]   ${pin.slug ?? pin.id}: repair threw — ${(err as Error).message}`);
        state.done[stateKey] = true;
        saveState(state);
        continue;
      }

      if (!APPLY) {
        outcome = outcome === 'zeroed' ? 'zeroed' : outcome; // unchanged in dry-run; just log
      } else {
        const patch: Record<string, unknown> = {
          lat: newLat,
          lng: newLng,
          updated_at: new Date().toISOString(),
        };
        // Persist newly-resolved place_id so the next run is free.
        if (resolvedPlaceId && !pin.google_place_id) {
          patch.google_place_id = resolvedPlaceId;
        }
        const { error } = await sb.from('pins').update(patch).eq('id', pin.id);
        if (error) {
          summary[list.slug]!.failed++;
          console.error(`[fix-coords]   ${pin.slug ?? pin.id}: write failed — ${error.message}`);
          continue;
        }
      }

      if (outcome === 'zeroed') {
        summary[list.slug]!.zeroed++;
      } else {
        summary[list.slug]!.fixed++;
      }

      const rec: FixRecord = {
        list: list.slug,
        slug: pin.slug,
        name: pin.name,
        oldLat: pin.lat,
        oldLng: pin.lng,
        newLat,
        newLng,
        outcome,
        swappedLatLng: swap,
      };
      allFixes.push(rec);
      if (outcome === 'zeroed') zeroedForManual.push(rec);
      if (swap && swappedSamples.length < 12) swappedSamples.push(rec);

      state.done[stateKey] = true;
      saveState(state);
    }
  }

  // === Report ==============================================================
  const lines: string[] = [];
  lines.push(`# Bad-coord audit report (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Per-list counts');
  lines.push('');
  lines.push('| List | Offenders | Fixed via Places | Zeroed (manual) | Errors |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const list of LISTS) {
    const s = summary[list.slug]!;
    lines.push(`| ${list.slug} | ${s.offenders} | ${s.fixed} | ${s.zeroed} | ${s.failed} |`);
  }

  const fixedExamples = allFixes
    .filter(r => r.outcome !== 'zeroed' && r.newLat != null && r.newLng != null)
    .slice(0, 5);
  if (fixedExamples.length > 0) {
    lines.push('');
    lines.push('## Sample of 5 fixed pins');
    lines.push('');
    lines.push('| List | Pin | Old (lat,lng) | New (lat,lng) |');
    lines.push('|---|---|---|---|');
    for (const r of fixedExamples) {
      const old = `${r.oldLat?.toFixed?.(4) ?? 'null'}, ${r.oldLng?.toFixed?.(4) ?? 'null'}`;
      const neu = `${r.newLat!.toFixed(4)}, ${r.newLng!.toFixed(4)}`;
      lines.push(`| ${r.list} | ${r.name} | ${old} | ${neu} |`);
    }
  }

  if (swappedSamples.length > 0) {
    lines.push('');
    lines.push('## Suspected lat/lng-swap pattern');
    lines.push('');
    lines.push('Original (lat, lng) was invalid for the list but the swapped pair (lng as lat, lat as lng) sat inside the bbox — a classic import-side column-swap.');
    lines.push('');
    lines.push('| List | Pin | Stored (lat,lng) | Swapped reads as |');
    lines.push('|---|---|---|---|');
    for (const r of swappedSamples) {
      const stored = `${r.oldLat?.toFixed?.(4) ?? 'null'}, ${r.oldLng?.toFixed?.(4) ?? 'null'}`;
      const swapped = `${r.oldLng?.toFixed?.(4) ?? 'null'}, ${r.oldLat?.toFixed?.(4) ?? 'null'}`;
      lines.push(`| ${r.list} | ${r.name} | ${stored} | ${swapped} |`);
    }
  }

  if (zeroedForManual.length > 0) {
    lines.push('');
    lines.push('## Zeroed (Places lookup failed — handle manually)');
    lines.push('');
    lines.push('| List | Slug | Pin | Was at |');
    lines.push('|---|---|---|---|');
    for (const r of zeroedForManual) {
      const old = r.oldLat == null ? 'null,null' : `${r.oldLat.toFixed(4)}, ${r.oldLng?.toFixed?.(4) ?? 'null'}`;
      lines.push(`| ${r.list} | ${r.slug ?? '—'} | ${r.name} | ${old} |`);
    }
  }

  // Flag systemic patterns: a list where >50% of offenders look swapped.
  const systemic: string[] = [];
  for (const list of LISTS) {
    const total = summary[list.slug]!.offenders;
    if (total < 3) continue;
    const swapsInList = allFixes.filter(r => r.list === list.slug && r.swappedLatLng).length;
    if (swapsInList / total > 0.5) {
      systemic.push(`- ${list.slug}: ${swapsInList}/${total} offenders look lat/lng-swapped — likely a column-swap on import.`);
    }
  }
  if (systemic.length > 0) {
    lines.push('');
    lines.push('## Suspected systemic issues');
    lines.push('');
    lines.push(...systemic);
  }

  console.log('\n' + lines.join('\n'));
}

main().catch(err => {
  console.error('[fix-coords] FATAL:', err);
  process.exit(1);
});
