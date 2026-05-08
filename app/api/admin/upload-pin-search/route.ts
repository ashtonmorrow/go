import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

  // Pins with a recently-attached personal photo lead, then visited
  // pins, then alphabetical. last_photo_at is denormalized on pins
  // and kept fresh by a trigger on personal_photos, so this sort is
  // a single indexed query — no aggregate.
  const { data, error } = await sb
    .from('pins')
    .select('id, slug, name, city_names, states_names, visited, kind, lat, lng, last_photo_at')
    .ilike('name', namePattern)
    .order('last_photo_at', { ascending: false, nullsFirst: false })
    .order('visited', { ascending: false })
    .order('name')
    .limit(25);
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

  return NextResponse.json({ pins });
}
