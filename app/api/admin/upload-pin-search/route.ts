import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchLastPhotoAtByPin, sortByPhotoRecency } from '@/lib/admin/pinPhotoRecency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === GET /api/admin/upload-pin-search?q=<query> ============================
// Typeahead for the Pin scope mode on /admin/upload. Returns up to 25
// pins whose name or city_names contains the query, ranked by visited
// first then alphabetical. The Pin scope skips the per-photo review
// phase — every photo in the batch attaches to the chosen pin — so
// having a tight typeahead matters.
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic.

type PinSearchHit = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  visited: boolean;
  kind: string | null;
  lat: number | null;
  lng: number | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || null;
  if (!q || q.length < 2) {
    return NextResponse.json({ pins: [] });
  }

  const sb = supabaseAdmin();
  const escaped = q.replace(/[%_]/g, m => '\\' + m);
  const namePattern = `%${escaped}%`;

  // Pull a wider pool than we'll surface so the recency sort below has
  // material to work with. Visited-first / name keeps the SQL ordering
  // sensible if a pin happens to have zero photos (recency falls back
  // to alphabetical anyway).
  const POOL = 60;
  const SURFACE = 25;
  const { data, error } = await sb
    .from('pins')
    .select('id, slug, name, city_names, states_names, visited, kind, lat, lng')
    .ilike('name', namePattern)
    .order('visited', { ascending: false })
    .order('name')
    .limit(POOL);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pins: PinSearchHit[] = (data ?? []).map(r => {
    const cityNames = Array.isArray(r.city_names) ? (r.city_names as string[]) : [];
    const stateNames = Array.isArray(r.states_names) ? (r.states_names as string[]) : [];
    return {
      id: r.id as string,
      slug: (r.slug as string | null) ?? null,
      name: (r.name as string | null) ?? '',
      city: cityNames[0] ?? null,
      country: stateNames[0] ?? null,
      visited: !!r.visited,
      kind: (r.kind as string | null) ?? null,
      lat: (r.lat as number | null) ?? null,
      lng: (r.lng as number | null) ?? null,
    };
  });

  // Bubble pins with the most recently attached photos to the top.
  // Lets Mike do "I just uploaded 30 photos to Houtong" → search the
  // same name and find that pin first when he comes back for batch 2.
  const lastPhotoAt = await fetchLastPhotoAtByPin(
    sb,
    pins.map(p => p.id),
  );
  sortByPhotoRecency(pins, lastPhotoAt);

  return NextResponse.json({ pins: pins.slice(0, SURFACE) });
}
