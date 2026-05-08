import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === GET /api/admin/upload-city-pins =======================================
// Two modes for the /admin/upload UploadClient:
//
//   ?q=<text>       → typeahead. Returns up to 20 cities whose name or
//                     country contains the query, ranked by visited
//                     first then alphabetical. Drives the city picker
//                     before a batch upload starts.
//
//   ?slug=<slug>    → after pick. Returns the city row + every pin
//                     whose city_names contains that city's display
//                     name. The pins become a synthetic Candidate[]
//                     pool the UI shows alongside any Google Places
//                     suggestions, so a folder of city photos can
//                     attach to existing pins without spending Places
//                     quota for places we've already pinned.
//
// Match policy mirrors the public side: a pin "belongs to" a city if
// its city_names contains the city's display name. The ?slug= we get
// is the city's URL slug; the lookup resolves it to the display name
// before doing the contains() query.
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic.

type AnchorPin = {
  id: string;
  name: string;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category: string | null;
  kind: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.trim() || null;
  const q = url.searchParams.get('q')?.trim() || null;
  const sb = supabaseAdmin();

  // === Typeahead mode ====================================================
  // Returns matching cities for the picker before a batch upload starts.
  // Visited first, then alphabetical. Cap at 20 results since this drives
  // a dropdown.
  if (q) {
    const escaped = q.replace(/[%_]/g, m => '\\' + m);
    const pattern = `%${escaped}%`;
    const { data, error } = await sb
      .from('go_cities')
      .select('id, slug, name, country, been, lat, lng')
      .or(`name.ilike.${pattern},country.ilike.${pattern}`)
      .order('been', { ascending: false })
      .order('name')
      .limit(20);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const cities = (data ?? []).map(r => ({
      id: r.id as string,
      slug: r.slug as string,
      name: (r.name as string | null) ?? '',
      country: (r.country as string | null) ?? null,
      been: !!r.been,
      lat: (r.lat as number | null) ?? null,
      lng: (r.lng as number | null) ?? null,
    }));
    return NextResponse.json({ cities });
  }

  if (!slug) {
    return NextResponse.json({ error: 'slug or q required' }, { status: 400 });
  }

  const { data: cityRow, error: cityErr } = await sb
    .from('go_cities')
    .select('id, slug, name, country, country_id, lat, lng')
    .eq('slug', slug)
    .maybeSingle();
  if (cityErr) {
    return NextResponse.json({ error: cityErr.message }, { status: 500 });
  }
  if (!cityRow) {
    return NextResponse.json({ error: 'city not found' }, { status: 404 });
  }

  const cityName = (cityRow as { name?: string | null }).name ?? null;
  if (!cityName) {
    return NextResponse.json({ error: 'city missing name' }, { status: 500 });
  }

  // Pull every pin whose city_names contains this city's display name.
  // The atlas convention stores the city's English label (e.g. "Bangkok",
  // "Mexico City") so contains is the right operator — slug matching
  // would miss pins whose city_names has the localized form.
  // Sort: pins with a recent personal photo first (so the picker
  // surfaces "you were just here" at the top of the pool), then
  // alphabetical for the long tail.
  const { data: pinRows, error: pinErr } = await sb
    .from('pins')
    .select('id, name, slug, lat, lng, address, category, kind')
    .contains('city_names', [cityName])
    .order('last_photo_at', { ascending: false, nullsFirst: false })
    .order('name');
  if (pinErr) {
    return NextResponse.json({ error: pinErr.message }, { status: 500 });
  }

  const pins: AnchorPin[] = (pinRows ?? []).map(r => ({
    id: r.id as string,
    name: (r.name as string | null) ?? '',
    slug: (r.slug as string | null) ?? null,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    address: (r.address as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    kind: (r.kind as string | null) ?? null,
  }));

  return NextResponse.json({
    city: {
      id: (cityRow as { id?: string }).id ?? null,
      slug: (cityRow as { slug?: string }).slug ?? null,
      name: cityName,
      country: (cityRow as { country?: string | null }).country ?? null,
      lat: (cityRow as { lat?: number | null }).lat ?? null,
      lng: (cityRow as { lng?: number | null }).lng ?? null,
    },
    pins,
  });
}
