import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[pins:audit] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

type PinAuditRow = {
  id: string;
  name: string | null;
  slug: string | null;
  kind: string | null;
  category: string | null;
  cuisine: string[] | null;
  lat: number | null;
  lng: number | null;
  visited: boolean | null;
  saved_lists: string[] | null;
  google_place_url: string | null;
  google_place_id: string | null;
  hours_details: Record<string, unknown> | null;
  price_details: Record<string, unknown> | null;
  price_amount: number | null;
  free_to_visit: boolean | null;
  enrichment_status: string | null;
  enrichment_confidence: string | null;
  enrichment_source_type: string | null;
  enrichment_checked_at: string | null;
};

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isEmptyObject(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function isEmpty(value: unknown): boolean {
  return (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    isEmptyObject(value)
  );
}

function isListed(row: PinAuditRow): boolean {
  return Array.isArray(row.saved_lists) && row.saved_lists.length > 0;
}

function missingCoords(row: PinAuditRow): boolean {
  return row.lat == null || row.lng == null;
}

function countBy(rows: PinAuditRow[], key: keyof PinAuditRow): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key];
    const label = typeof value === 'string' && value ? value : 'null';
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
}

function topCounts(counts: Record<string, number>, limit = 20): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );
}

function examples(rows: PinAuditRow[], limit = 15) {
  return rows.slice(0, limit).map(row => ({
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    saved_lists: row.saved_lists,
  }));
}

async function fetchAllPins(): Promise<PinAuditRow[]> {
  const rows: PinAuditRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('pins')
      .select(
        [
          'id',
          'name',
          'slug',
          'kind',
          'category',
          'cuisine',
          'lat',
          'lng',
          'visited',
          'saved_lists',
          'google_place_url',
          'google_place_id',
          'hours_details',
          'price_details',
          'price_amount',
          'free_to_visit',
          'enrichment_status',
          'enrichment_confidence',
          'enrichment_source_type',
          'enrichment_checked_at',
        ].join(','),
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as unknown as PinAuditRow[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const rows = await fetchAllPins();
  const visitedOrListed = rows.filter(row => row.visited === true || isListed(row));
  const noCoordsVisitedOrListed = visitedOrListed.filter(missingCoords);
  const noCoordsVisitedOrListedWithPlaceId = noCoordsVisitedOrListed.filter(row => !!row.google_place_id);
  const googleUrlNoPlaceId = rows.filter(row => !!row.google_place_url && !row.google_place_id);
  const transitFreeWithFare = rows.filter(row =>
    row.kind === 'transit' &&
    row.free_to_visit === true &&
    typeof row.price_amount === 'number' &&
    row.price_amount > 0,
  );
  const restaurantNoCuisine = rows.filter(row => row.kind === 'restaurant' && isEmpty(row.cuisine));
  const actionableStatusNoCheckedAt = rows.filter(row =>
    !row.enrichment_checked_at &&
    !!row.enrichment_status &&
    !['pending', 'unverified'].includes(row.enrichment_status),
  );

  const report = {
    total: rows.length,
    visitedOrListed: visitedOrListed.length,
    kindCounts: topCounts(countBy(rows, 'kind')),
    enrichmentStatusCounts: topCounts(countBy(rows, 'enrichment_status')),
    enrichmentSourceCounts: topCounts(countBy(rows, 'enrichment_source_type')),
    emptyJsonPlaceholders: {
      hoursDetails: rows.filter(row => isEmptyObject(row.hours_details)).length,
      priceDetails: rows.filter(row => isEmptyObject(row.price_details)).length,
    },
    coordinateGaps: {
      visitedOrListed: noCoordsVisitedOrListed.length,
      visitedOrListedWithPlaceId: noCoordsVisitedOrListedWithPlaceId.length,
      examples: examples(noCoordsVisitedOrListedWithPlaceId),
    },
    googleIdGaps: {
      googleUrlNoPlaceId: googleUrlNoPlaceId.length,
      examples: examples(googleUrlNoPlaceId),
    },
    semanticCleanup: {
      transitFreeToVisitWithPositiveFare: transitFreeWithFare.length,
      restaurantWithoutCuisine: restaurantNoCuisine.length,
      actionableStatusWithoutCheckedAt: actionableStatusNoCheckedAt.length,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error('[pins:audit] FATAL:', error);
  process.exit(1);
});
