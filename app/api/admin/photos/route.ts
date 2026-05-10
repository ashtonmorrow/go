import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === GET /api/admin/photos =================================================
// Centralized photo browser for /admin/photos. Three sources, paginated:
//
//   ?source=personal  → every personal_photos row (visible only —
//                       hidden=false). Default if source is omitted.
//
//   ?source=hidden    → personal_photos where hidden=true.
//
//   ?source=codex     → every pin.images entry where source is
//                       'codex-generated'. The atlas's main escape
//                       valve for sweeping codex-art deletes.
//
// Common: ?q=<text> filters by pin name (substring, case-insensitive).
//         ?offset=N&limit=N paginates. Default limit 60, hard cap 200.
//
// Pagination + filtering happens at the SQL layer for personal/hidden:
//   - PostgREST's embedded-resource ilike (`pin.name=ilike.*q*`) does
//     the name match server-side so `count: 'exact'` and `.range()`
//     return accurate totals over the full dataset, not a 1000-row
//     slice (PostgREST default).
// For codex: jsonb arrays don't decompose through PostgREST's embed,
//   so we narrow with a `contains` filter (only pins that have at
//   least one codex-generated image), then unnest in JS and paginate
//   over the flattened tile list. We use .range(0, 9999) to bypass the
//   default page cap; pins-with-codex is currently ~1,100 — well under.
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic.

type PhotoSource = 'personal' | 'codex';

type PhotoTile = {
  /** Stable id. For personal photos, the personal_photos.id. For codex
   *  entries, a synthetic `pin-image:<pinId>:<idx>` so the bulk-delete
   *  flow can route by source. */
  id: string;
  source: PhotoSource;
  url: string;
  pinId: string;
  pinName: string;
  pinSlug: string | null;
  city: string | null;
  country: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
  hidden: boolean;
  imageSource: string | null;
  /** 'image' (default) or 'video'. Source=codex is always 'image'. */
  mediaType: 'image' | 'video';
  /** For videos, the captured poster JPG URL. Null for images and
   *  for any video without a poster (rare; uploadEntityPhoto tries to
   *  capture one but a corrupt/long-decode source can fail). */
  posterUrl: string | null;
};

const HARD_LIMIT = 200;
// Cap for the codex-pin candidate fetch. Bumped well above the
// PostgREST default so we don't silently truncate. Currently ~1,100
// pins have codex art; this leaves room for the corpus to grow ~9x
// before we'd need to revisit.
const CODEX_PIN_FETCH_LIMIT = 9999;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = (url.searchParams.get('source') || 'personal') as
    | 'personal'
    | 'hidden'
    | 'codex';
  const q = url.searchParams.get('q')?.trim() || null;
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
  const limit = Math.min(
    HARD_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? '60') | 0),
  );

  const sb = supabaseAdmin();

  if (source === 'personal' || source === 'hidden') {
    const wantHidden = source === 'hidden';
    let query = sb
      .from('personal_photos')
      .select(
        'id, url, hidden, taken_at, exif_lat, exif_lng, created_at, media_type, poster_url, ' +
          'pin:pins!inner(id, name, slug, city_names, states_names)',
        { count: 'exact' },
      )
      .eq('hidden', wantHidden)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Server-side name filter via PostgREST embedded-resource ilike.
    // The !inner join above lets us filter on the embedded pin without
    // losing rows. With the filter applied at the SQL layer, count and
    // pagination are accurate over the full corpus.
    if (q) {
      const escaped = q.replace(/[%_\\]/g, m => '\\' + m);
      query = query.ilike('pin.name', `%${escaped}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const tiles: PhotoTile[] = rows.map(row => {
      const pin = row.pin;
      const pinObj = (Array.isArray(pin) ? pin[0] : pin) as
        | {
            id?: string;
            name?: string;
            slug?: string | null;
            city_names?: string[];
            states_names?: string[];
          }
        | undefined;
      const cityNames = Array.isArray(pinObj?.city_names) ? pinObj!.city_names : [];
      const stateNames = Array.isArray(pinObj?.states_names) ? pinObj!.states_names : [];
      return {
        id: row.id as string,
        source: 'personal' as const,
        url: row.url as string,
        pinId: (pinObj?.id ?? '') as string,
        pinName: (pinObj?.name ?? '') as string,
        pinSlug: (pinObj?.slug ?? null) as string | null,
        city: cityNames[0] ?? null,
        country: stateNames[0] ?? null,
        takenAt: (row.taken_at as string | null) ?? null,
        lat: (row.exif_lat as number | null) ?? null,
        lng: (row.exif_lng as number | null) ?? null,
        hidden: !!row.hidden,
        imageSource: null,
        mediaType: (row.media_type as string | null) === 'video' ? 'video' : 'image',
        posterUrl: (row.poster_url as string | null) ?? null,
      };
    });
    const total = count ?? tiles.length;
    return NextResponse.json({
      photos: tiles,
      total,
      hasMore: offset + tiles.length < total,
    });
  }

  if (source === 'codex') {
    // Narrow to pins that have at least one codex-generated image
    // before pulling the jsonb arrays. The contains filter lets the DB
    // skip ~80% of the corpus. We then walk the arrays in JS to flatten
    // codex entries, apply the q filter, sort, and paginate over tiles.
    let pinQuery = sb
      .from('pins')
      .select('id, name, slug, images, city_names, states_names')
      .contains('images', [{ source: 'codex-generated' }])
      .order('name')
      .range(0, CODEX_PIN_FETCH_LIMIT - 1);
    if (q) {
      const escaped = q.replace(/[%_\\]/g, m => '\\' + m);
      pinQuery = pinQuery.ilike('name', `%${escaped}%`);
    }
    const { data: pinRows, error: pinErr } = await pinQuery;
    if (pinErr) {
      return NextResponse.json({ error: pinErr.message }, { status: 500 });
    }
    const allTiles: PhotoTile[] = [];
    for (const r of pinRows ?? []) {
      const row = r as Record<string, unknown>;
      const images = Array.isArray(row.images) ? row.images : [];
      const pinId = row.id as string;
      const pinName = (row.name as string | null) ?? '';
      const pinSlug = (row.slug as string | null) ?? null;
      const cityNames = Array.isArray(row.city_names) ? (row.city_names as string[]) : [];
      const stateNames = Array.isArray(row.states_names) ? (row.states_names as string[]) : [];
      images.forEach((img, idx) => {
        const i = img as { url?: unknown; source?: unknown };
        if (typeof i.url !== 'string' || !i.url) return;
        if (i.source !== 'codex-generated') return;
        allTiles.push({
          id: `pin-image:${pinId}:${idx}`,
          source: 'codex',
          url: i.url,
          pinId,
          pinName,
          pinSlug,
          city: cityNames[0] ?? null,
          country: stateNames[0] ?? null,
          takenAt: null,
          lat: null,
          lng: null,
          hidden: false,
          imageSource: 'codex-generated',
          mediaType: 'image',
          posterUrl: null,
        });
      });
    }
    const total = allTiles.length;
    const tiles = allTiles.slice(offset, offset + limit);
    return NextResponse.json({
      photos: tiles,
      total,
      hasMore: offset + tiles.length < total,
    });
  }

  return NextResponse.json({ error: 'invalid source' }, { status: 400 });
}
