import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === GET /api/admin/personal-photos ========================================
// Photo lookup for the list-cover picker on /admin/lists/[slug] and the
// inline cover picker on /admin/lists.
//
// Three scopes:
//
//   ?listName=<list>     → photos attached to pins that are members of that
//                          saved list. Drives the "In this list" tab.
//
//   ?relatedToList=<list>→ photos attached to pins whose city or country
//                          name word-matches the list name (same heuristic
//                          as listsMatchingPlace). A list called "bangkok"
//                          surfaces every photo from any pin in Bangkok,
//                          even if those pins aren't yet members of the
//                          list. Drives the "Related places" tab.
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

/** Same word-boundary check as listsMatchingPlace, but inverted: given a
 *  list name, decide whether a place name appears as a whole word inside
 *  it. So a place "Bangkok" matches the list "bangkok 🇹🇭" (normalized to
 *  "bangkok"); place "Rio" matches "rio botanical garden". Returns false
 *  for sub-3-character place names so we don't get spurious matches on
 *  short codes like "us" or "uk". */
function placeWordMatchesList(listNorm: string, placeRaw: string): boolean {
  const place = placeRaw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (place.length < 3) return false;
  const re = new RegExp(
    `(?:^|\\s)${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
  );
  return re.test(listNorm);
}

function normalizeListName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listName = url.searchParams.get('listName')?.trim().toLowerCase() || null;
  const relatedToList = url.searchParams.get('relatedToList')?.trim().toLowerCase() || null;
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
  const limit = Math.min(
    HARD_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? '200') | 0),
  );

  const sb = supabaseAdmin();

  // Step 1: figure out which pin IDs to scope to.
  //   - listName       → pins whose saved_lists array contains the name
  //   - relatedToList  → pins whose city_names or states_names contains a
  //                      word-matching place name
  //   - neither        → no filter (all personal photos)
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
    if (pinIdFilter.length === 0) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
  } else if (relatedToList) {
    const listNorm = normalizeListName(relatedToList);
    if (!listNorm) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
    // Pull every pin that has a city or country set; filter in JS for the
    // word-boundary match. The pin set isn't huge (a few thousand at most)
    // so this is a single round-trip + an O(n) walk. PostgREST can't
    // express a regex-on-array-elements check natively without an RPC.
    const { data: candidatePins, error: pinErr } = await sb
      .from('pins')
      .select('id, city_names, states_names')
      .or('city_names.not.is.null,states_names.not.is.null');
    if (pinErr) {
      return NextResponse.json({ error: pinErr.message }, { status: 500 });
    }
    const matched: string[] = [];
    for (const row of candidatePins ?? []) {
      const cities = (row.city_names as string[] | null) ?? [];
      const states = (row.states_names as string[] | null) ?? [];
      const places = [...cities, ...states];
      if (places.some(p => placeWordMatchesList(listNorm, p))) {
        matched.push(row.id as string);
      }
    }
    if (matched.length === 0) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
    pinIdFilter = matched;
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

// === DELETE /api/admin/personal-photos =====================================
// Permanently removes a personal photo: drops the row from personal_photos
// and deletes the underlying file from the `personal-photos` Storage bucket.
// Also strips the URL from any pin.hero_photo_urls array that referenced
// it so the curated hero gallery doesn't render a broken link.
//
// Body: { id: string }. Irreversible. Frontend should confirm() before
// calling.

export async function DELETE(req: Request) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = supabaseAdmin();

  // Pull the row first so we have the URL + pin_id for the storage
  // delete + hero_photo_urls cleanup.
  const { data: photo, error: fetchErr } = await sb
    .from('personal_photos')
    .select('id, url, pin_id')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!photo) {
    return NextResponse.json({ error: 'photo not found' }, { status: 404 });
  }

  const url = photo.url as string;
  const pinId = photo.pin_id as string;

  // Storage object path is everything after `/personal-photos/` in the
  // public URL. If the URL doesn't match the expected pattern, skip the
  // storage delete (the row gets removed regardless so a bad URL doesn't
  // wedge the operation).
  const storageMatch = url.match(/\/storage\/v1\/object\/public\/personal-photos\/(.+)$/);
  const storagePath = storageMatch ? storageMatch[1] : null;

  // Delete the Storage file before the row so a row-only failure doesn't
  // leave orphan bytes. Order is best-effort either way; both deletes are
  // idempotent on the next attempt.
  if (storagePath) {
    const { error: storageErr } = await sb.storage
      .from('personal-photos')
      .remove([storagePath]);
    if (storageErr) {
      console.warn('[personal-photos DELETE] storage remove failed:', storageErr.message);
      // Continue anyway — DB row deletion is the primary effect.
    }
  }

  // Strip from any hero_photo_urls that still reference this URL so the
  // curated gallery doesn't try to render a now-missing image. Read +
  // write rather than array_remove() because hero_photo_urls is jsonb-as-
  // text in places.
  const { data: pinRow, error: pinErr } = await sb
    .from('pins')
    .select('id, hero_photo_urls')
    .eq('id', pinId)
    .maybeSingle();
  if (!pinErr && pinRow) {
    const heroUrls = Array.isArray(pinRow.hero_photo_urls) ? pinRow.hero_photo_urls : [];
    if (heroUrls.includes(url)) {
      const filtered = heroUrls.filter((u: string) => u !== url);
      await sb.from('pins').update({ hero_photo_urls: filtered }).eq('id', pinId);
    }
  }

  const { error: rowErr } = await sb.from('personal_photos').delete().eq('id', id);
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  try { revalidateTag('supabase-personal-photos'); } catch { /* ignore */ }
  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }

  return NextResponse.json({ ok: true, deletedFromStorage: !!storagePath });
}
