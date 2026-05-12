import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[pin-coords] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const LIMIT = numArg('--limit') ?? Infinity;
const MAX_COST_USD = numArg('--max-cost-usd') ?? 30;
// Conservative: current edge mask includes location plus other Place Details
// fields, so budget at Enterprise even when Google bills lower.
const PRICE_PER_DETAILS_USD = 0.020;

type PinRow = {
  id: string;
  name: string | null;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  visited: boolean | null;
  saved_lists: string[] | null;
  google_place_id: string | null;
};

type PlaceDetailsResponse = {
  details?: {
    location?: {
      latitude?: number;
      longitude?: number;
    };
  };
};

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function numArg(name: string): number | null {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : null;
}

function isListed(row: PinRow): boolean {
  return Array.isArray(row.saved_lists) && row.saved_lists.length > 0;
}

function missingCoords(row: PinRow): boolean {
  return row.lat == null || row.lng == null;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function fetchAllPins(): Promise<PinRow[]> {
  const rows: PinRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('pins')
      .select('id,name,slug,lat,lng,visited,saved_lists,google_place_id')
      .range(from, from + pageSize - 1)
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as unknown as PinRow[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

async function fetchLocation(placeId: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await sb.functions.invoke('place-details', {
    body: { action: 'details', placeId, fields: ['location'] },
  });
  if (error) {
    let payload: unknown = null;
    try {
      payload = await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.();
    } catch {
      /* best effort */
    }
    throw new Error(`place-details failed: ${error.message}${payload ? ` ${JSON.stringify(payload)}` : ''}`);
  }
  const details = (data as PlaceDetailsResponse | null)?.details;
  const lat = details?.location?.latitude;
  const lng = details?.location?.longitude;
  return isValidCoord(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

async function main() {
  console.log(`[pin-coords] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[pin-coords] Cost cap: $${MAX_COST_USD.toFixed(2)}`);

  const all = await fetchAllPins();
  const candidates = all
    .filter(row => missingCoords(row))
    .filter(row => row.visited === true || isListed(row))
    .filter(row => !!row.google_place_id)
    .slice(0, LIMIT);

  console.log(`[pin-coords] Candidates: ${candidates.length}`);
  const plannedCost = candidates.length * PRICE_PER_DETAILS_USD;
  console.log(`[pin-coords] Conservative planned cost: $${plannedCost.toFixed(2)}`);

  let cost = 0;
  let checked = 0;
  let updated = 0;
  let noLocation = 0;
  let failed = 0;
  const examples: Array<{ slug: string | null; name: string | null; lat: number; lng: number }> = [];

  for (const pin of candidates) {
    if (cost + PRICE_PER_DETAILS_USD > MAX_COST_USD) {
      console.log(`[pin-coords] Cost cap reached at $${cost.toFixed(2)}.`);
      break;
    }
    checked++;
    cost += PRICE_PER_DETAILS_USD;

    try {
      const coords = await fetchLocation(pin.google_place_id!);
      if (!coords) {
        noLocation++;
        continue;
      }

      if (APPLY) {
        const { error } = await sb
          .from('pins')
          .update({ lat: coords.lat, lng: coords.lng })
          .eq('id', pin.id);
        if (error) throw error;
      }
      updated++;
      if (examples.length < 15) {
        examples.push({ slug: pin.slug, name: pin.name, lat: coords.lat, lng: coords.lng });
      }
    } catch (error) {
      failed++;
      console.error(`[pin-coords] ${pin.slug ?? pin.id}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (checked % 50 === 0) {
      console.log(
        `[pin-coords] checked=${checked}/${candidates.length} updated=${updated} noLocation=${noLocation} failed=${failed} cost=$${cost.toFixed(2)}`,
      );
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    checked,
    updated,
    noLocation,
    failed,
    estimatedCostUsd: Number(cost.toFixed(2)),
    examples,
  }, null, 2));
}

main().catch(error => {
  console.error('[pin-coords] FATAL:', error);
  process.exit(1);
});
