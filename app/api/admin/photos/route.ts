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
//   ?source=hidden    → personal_photos where hidden=true. Same shape
//                       as personal but the page can sweep them back to
//                       visible via PATCH if needed.
//
//   ?source=codex     → every pin.images entry where source is
//                       'codex-generated'. The cards' main escape valve
//                       for sweeping "I don't like this codex art" deletes
//                       across the whole atlas.
//
// Common: ?q=<text> filters by pin name (substring, case-insensitive).
//         ?offset=N&limit=N paginates. Default limit 60, hard cap 200.
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
};

const HARD_LIMIT = 200;

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
        'id, url, hidden, taken_at, exif_lat, exif_lng, created_at, ' +
          'pin:pins!inner(id, name, slug, city_names, states_names)',
        { count: 'exact' },
      )
      .eq('hidden', wantHidden)
      .order('created_at', { ascending: false });

    // PostgREST doesn't expose ilike on embedded resources, so name
    // filtering happens after fetch. We pull a wider page when q is set
    // so the post-filter has material — small cost since this is
    // admin-only and pagination caps at 200.
    if (!q) query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const allTiles: PhotoTile[] = rows.map(row => {
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
      };
    });

    let tiles = allTiles;
    if (q) {
      const needle = q.toLowerCase();
      tiles = tiles.filter(t => t.pinName.toLowerCase().includes(needle));
      // Manual pagination after filtering since the DB query couldn't
      // narrow it.
      tiles = tiles.slice(offset, offset + limit);
    }
    const total = q ? allTiles.filter(t => t.pinName.toLowerCase().includes(q.toLowerCase())).length : count ?? tiles.length;
    return NextResponse.json({
      photos: tiles,
      total,
      hasMore: offset + tiles.length < total,
    });
  }

  if (source === 'codex') {
    // Pull every pin that has at least one image and walk the JSONB
    // arrays for source='codex-generated' entries. The atlas has a few
    // thousand pins so this is one indexed scan; the JSONB walk happens
    // in JS. Pagination applies to the flattened tile list.
    const { data: pinRows, error: pinErr } = await sb
      .from('pins')
      .select('id, name, slug, images, city_names, states_names')
      .not('images', 'is', null)
      .order('name');
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
        });
      });
    }

    let filtered = allTiles;
    if (q) {
      const needle = q.toLowerCase();
      filtered = filtered.filter(t => t.pinName.toLowerCase().includes(needle));
    }
    const total = filtered.length;
    const tiles = filtered.slice(offset, offset + limit);
    return NextResponse.json({
      photos: tiles,
      total,
      hasMore: offset + tiles.length < total,
    });
  }

  return NextResponse.json({ error: 'invalid source' }, { status: 400 });
}
