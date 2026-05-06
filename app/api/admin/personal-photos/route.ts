import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === GET /api/admin/personal-photos ========================================
// Photo lookup for the list-cover picker on /admin/lists/[slug].
//
// Two scopes:
//
//   ?listName=<list>     → photos attached to pins that are members of that
//                          saved list. Drives the "In this list" tab of the
//                          picker.
//
//   (no scope)           → every personal photo on the site, ordered by
//                          taken_at desc with ties broken by created_at.
//                          Drives the "All my photos" tab. Paginated via
//                          ?offset=N&limit=N (default 200, hard cap 500).
//
// Each row carries enough metadata to render a meaningful tile:
// {id, url, pinId, pinName, pinSlug, takenAt, lat, lng}.
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic so we don't need
// a separate gate here.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PhotoTile = {
  id: string;
  url: string;
  pinId: string;
  pinName: string;
  pinSlug: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
};

const HARD_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listName = url.searchParams.get('listName')?.trim().toLowerCase() || null;
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
  const limit = Math.min(
    HARD_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? '200') | 0),
  );

  const sb = supabaseAdmin();

  // Step 1: figure out which pin IDs to scope to. For "in this list" we
  // pull pins whose saved_lists array contains the list name; for the
  // global tab we don't filter pin IDs at all.
  let pinIdFilter: string[] | null = null;
  if (listName) {
    const { data: memberPins, error: pinErr } = await sb
      .from('pins')
      .select('id')
      .contains('saved_lists', [listName]);
    if (pinErr) {
      return NextResponse.json({ error: pinErr.message }, { status: 500 });
    }
    pinIdFilter = (memberPins ?? []).map(r => r.id as string);
    // If the list has zero members, short-circuit. Doing the second query
    // with an empty `in` clause would return everything in personal_photos,
    // which is the opposite of what we want.
    if (pinIdFilter.length === 0) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
  }

  // Step 2: fetch personal_photos, JOINed to pins for name/slug. PostgREST's
  // !inner ensures the JOIN is required (no orphan photos with a deleted
  // pin reference). Newest-first by taken_at; falls back to created_at when
  // EXIF was missing at upload time.
  let query = sb
    .from('personal_photos')
    .select(
      'id, url, taken_at, exif_lat, exif_lng, created_at, ' +
      'pin:pins!inner(id, name, slug)',
      { count: 'exact' },
    )
    .order('taken_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (pinIdFilter) {
    query = query.in('pin_id', pinIdFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const photos: PhotoTile[] = (data ?? []).map(rawRow => {
    // supabase-js types the per-row result as `GenericStringError | T`
    // when an embedded JOIN is involved (the union is there to flag
    // failed embeds at runtime). Property access trips against the
    // GenericStringError half of the union even though embedded JOINs
    // never actually fail this way in practice. Double-cast through
    // `unknown` once at the top so the rest of this function reads
    // cleanly. Pattern matches what lib/savedLists.ts does.
    const row = rawRow as unknown as Record<string, unknown>;
    // PostgREST's embedded one-to-one comes back as a single object, but
    // older versions occasionally shipped an array — be defensive either way.
    const pin = row.pin;
    const pinObj = Array.isArray(pin)
      ? (pin[0] as { id?: string; name?: string; slug?: string | null } | undefined)
      : (pin as { id?: string; name?: string; slug?: string | null } | undefined);
    return {
      id: row.id as string,
      url: row.url as string,
      pinId: (pinObj?.id ?? '') as string,
      pinName: (pinObj?.name ?? '') as string,
      pinSlug: (pinObj?.slug ?? null) as string | null,
      takenAt: (row.taken_at as string | null) ?? null,
      lat: (row.exif_lat as number | null) ?? null,
      lng: (row.exif_lng as number | null) ?? null,
    };
  });

  const total = count ?? photos.length;
  return NextResponse.json({
    photos,
    total,
    hasMore: offset + photos.length < total,
  });
}

// === PATCH /api/admin/personal-photos ======================================
// Toggle the `hidden` flag on a personal photo. Hidden photos are
// excluded from the auto-pick HeroCollage, but remain pickable in the
// HeroPicker so Mike can deliberately surface a "hidden but actually
// useful" shot if he wants. Body: { id: string, hidden: boolean }.

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  const hidden = typeof body?.hidden === 'boolean' ? body.hidden : null;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (hidden === null) {
    return NextResponse.json({ error: 'hidden must be boolean' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_photos')
    .update({ hidden })
    .eq('id', id)
    .select('id, pin_id, hidden')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'photo not found' }, { status: 404 });
  }

  // Bust the personal-photos tag so detail pages re-derive their auto-pick
  // pool with the new hidden flag.
  try { revalidateTag('supabase-personal-photos'); } catch { /* ignore */ }

  return NextResponse.json({ id: data.id, hidden: data.hidden });
}
