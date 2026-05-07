import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === GET /api/admin/personal-photos ========================================
// Photo lookup for the list-cover picker on /admin/lists/[slug] and the
// inline cover picker on /admin/lists, plus the inline quick-cover
// pickers on /admin/pins, /admin/cities, /admin/countries.
//
// Scopes:
//
//   ?listName=<list>      → personal photos AND pin.images for pins that
//                           are members of the saved list.
//
//   ?relatedToList=<list> → photos from pins whose city or country name
//                           word-matches the list, plus the hero photos
//                           attached to those cities and countries.
//
//   ?pinId=<uuid>         → personal photos AND pin.images for that one
//                           pin. Drives the inline cover picker on
//                           /admin/pins.
//
//   ?citySlug=<slug>      → personal photos and pin.images for every pin
//                           whose city_names contains the city's name,
//                           plus that city's existing hero_photo_urls
//                           and hero_image / personal_photo cover URLs.
//                           Drives the inline cover picker on
//                           /admin/cities.
//
//   ?countrySlug=<slug>   → personal photos and pin.images for every pin
//                           whose states_names contains the country's
//                           name, plus that country's existing
//                           hero_photo_urls. Drives the inline cover
//                           picker on /admin/countries.
//
//   (no scope)            → every personal photo on the site, ordered by
//                           taken_at desc with ties broken by created_at.
//                           Drives the "All my photos" tab. Paginated via
//                           ?offset=N&limit=N (default 200, hard cap 500).
//
// Each tile carries enough metadata to render and to commit:
//   { id, url, source, pinId?, pinName, pinSlug?, takenAt?, lat?, lng?,
//     imageSource? }
//
// `source` is one of 'personal' | 'pin-image' | 'city-hero' |
// 'country-hero'. The CoverPickerModal dispatches on source to decide
// whether to commit cover_photo_id (uuid) or cover_image_url (raw URL).
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic so we don't need
// a separate gate here.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PhotoSource = 'personal' | 'pin-image' | 'city-hero' | 'country-hero';

type PhotoTile = {
  id: string;
  url: string;
  source: PhotoSource;
  /** For source=pin-image, the value of pin.images[i].source — typically
   *  'codex-generated', 'wikidata', or null. Lets the UI label codex
   *  tiles distinctly so you don't pick AI art by accident. */
  imageSource?: string | null;
  pinId: string | null;
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

/** Pull personal_photos as PhotoTile[] for a (possibly null) pin set. */
async function fetchPersonalPhotoTiles(
  sb: ReturnType<typeof supabaseAdmin>,
  pinIdFilter: string[] | null,
  offset: number,
  limit: number,
): Promise<{ tiles: PhotoTile[]; total: number; hasMore: boolean }> {
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
  if (pinIdFilter) query = query.in('pin_id', pinIdFilter);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const tiles: PhotoTile[] = (data ?? []).map(rawRow => {
    const row = rawRow as unknown as Record<string, unknown>;
    const pin = row.pin;
    const pinObj = Array.isArray(pin)
      ? (pin[0] as { id?: string; name?: string; slug?: string | null } | undefined)
      : (pin as { id?: string; name?: string; slug?: string | null } | undefined);
    return {
      id: row.id as string,
      url: row.url as string,
      source: 'personal',
      pinId: (pinObj?.id ?? null) as string | null,
      pinName: (pinObj?.name ?? '') as string,
      pinSlug: (pinObj?.slug ?? null) as string | null,
      takenAt: (row.taken_at as string | null) ?? null,
      lat: (row.exif_lat as number | null) ?? null,
      lng: (row.exif_lng as number | null) ?? null,
    };
  });
  const total = count ?? tiles.length;
  return { tiles, total, hasMore: offset + tiles.length < total };
}

/** Pull pin.images entries for a pin set as PhotoTile[]. Returns one tile
 *  per non-empty image url, tagged with the pin.images[i].source string so
 *  the UI can label codex-generated tiles distinctly. */
async function fetchPinImageTiles(
  sb: ReturnType<typeof supabaseAdmin>,
  pinIds: string[],
): Promise<PhotoTile[]> {
  if (pinIds.length === 0) return [];
  const { data, error } = await sb
    .from('pins')
    .select('id, name, slug, images')
    .in('id', pinIds);
  if (error) throw new Error(error.message);
  const tiles: PhotoTile[] = [];
  for (const rawRow of data ?? []) {
    const row = rawRow as Record<string, unknown>;
    const pinId = row.id as string;
    const pinName = (row.name as string | null) ?? '';
    const pinSlug = (row.slug as string | null) ?? null;
    const images = Array.isArray(row.images) ? row.images : [];
    images.forEach((img, idx) => {
      const r = img as { url?: unknown; source?: unknown };
      const u = typeof r.url === 'string' ? r.url : '';
      if (!u) return;
      tiles.push({
        id: `pin-image:${pinId}:${idx}`,
        url: u,
        source: 'pin-image',
        imageSource: typeof r.source === 'string' ? r.source : null,
        pinId,
        pinName,
        pinSlug,
        takenAt: null,
        lat: null,
        lng: null,
      });
    });
  }
  return tiles;
}

/** Pull go_cities hero/personal photos for cities whose name word-matches
 *  the given normalized list name. */
async function fetchCityHeroTiles(
  sb: ReturnType<typeof supabaseAdmin>,
  listNorm: string,
): Promise<PhotoTile[]> {
  const { data, error } = await sb
    .from('go_cities')
    .select('name, slug, hero_image, personal_photo, hero_photo_urls');
  if (error) throw new Error(error.message);
  const tiles: PhotoTile[] = [];
  for (const rawRow of data ?? []) {
    const row = rawRow as Record<string, unknown>;
    const name = (row.name as string | null) ?? '';
    if (!name || !placeWordMatchesList(listNorm, name)) continue;
    const slug = (row.slug as string | null) ?? null;
    const urls: string[] = [];
    const personalPhoto = row.personal_photo;
    if (typeof personalPhoto === 'string' && personalPhoto) urls.push(personalPhoto);
    const heroImage = row.hero_image;
    if (typeof heroImage === 'string' && heroImage && !urls.includes(heroImage)) {
      urls.push(heroImage);
    }
    const heroArr = Array.isArray(row.hero_photo_urls) ? row.hero_photo_urls : [];
    for (const u of heroArr) {
      if (typeof u === 'string' && u && !urls.includes(u)) urls.push(u);
    }
    urls.forEach((u, idx) => {
      tiles.push({
        id: `city-hero:${slug ?? name}:${idx}`,
        url: u,
        source: 'city-hero',
        pinId: null,
        pinName: `${name} (city)`,
        pinSlug: slug,
        takenAt: null,
        lat: null,
        lng: null,
      });
    });
  }
  return tiles;
}

/** Pull go_countries hero photos for countries whose name word-matches
 *  the given normalized list name. */
async function fetchCountryHeroTiles(
  sb: ReturnType<typeof supabaseAdmin>,
  listNorm: string,
): Promise<PhotoTile[]> {
  const { data, error } = await sb
    .from('go_countries')
    .select('name, slug, hero_photo_urls');
  if (error) throw new Error(error.message);
  const tiles: PhotoTile[] = [];
  for (const rawRow of data ?? []) {
    const row = rawRow as Record<string, unknown>;
    const name = (row.name as string | null) ?? '';
    if (!name || !placeWordMatchesList(listNorm, name)) continue;
    const slug = (row.slug as string | null) ?? null;
    const heroArr = Array.isArray(row.hero_photo_urls) ? row.hero_photo_urls : [];
    heroArr.forEach((u, idx) => {
      if (typeof u !== 'string' || !u) return;
      tiles.push({
        id: `country-hero:${slug ?? name}:${idx}`,
        url: u,
        source: 'country-hero',
        pinId: null,
        pinName: `${name} (country)`,
        pinSlug: slug,
        takenAt: null,
        lat: null,
        lng: null,
      });
    });
  }
  return tiles;
}

/** Drop tiles whose URL has already been seen earlier in the list. Keeps
 *  the first occurrence — typically a personal photo over a pin image,
 *  since we concat in that order. */
function dedupeByUrl(tiles: PhotoTile[]): PhotoTile[] {
  const seen = new Set<string>();
  const out: PhotoTile[] = [];
  for (const t of tiles) {
    if (seen.has(t.url)) continue;
    seen.add(t.url);
    out.push(t);
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listName = url.searchParams.get('listName')?.trim().toLowerCase() || null;
  const relatedToList = url.searchParams.get('relatedToList')?.trim().toLowerCase() || null;
  const pinId = url.searchParams.get('pinId')?.trim() || null;
  const citySlug = url.searchParams.get('citySlug')?.trim() || null;
  const countrySlug = url.searchParams.get('countrySlug')?.trim() || null;
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
  const limit = Math.min(
    HARD_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? '200') | 0),
  );

  const sb = supabaseAdmin();

  // === Scope: a single pin ================================================
  // Personal photos AND pin.images for that pin only. The picker uses
  // this for inline cover swap on /admin/pins.
  if (pinId) {
    try {
      const [{ tiles: personal }, pinImages] = await Promise.all([
        fetchPersonalPhotoTiles(sb, [pinId], 0, HARD_LIMIT),
        fetchPinImageTiles(sb, [pinId]),
      ]);
      const photos = dedupeByUrl([...personal, ...pinImages]);
      return NextResponse.json({ photos, total: photos.length, hasMore: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'fetch failed' },
        { status: 500 },
      );
    }
  }

  // === Scope: a city ======================================================
  // Photos for any pin whose city_names contains the city's name, plus
  // the city's existing hero_photo_urls and the personal_photo /
  // hero_image cover columns so the picker can re-pick anything already
  // attached to the city.
  if (citySlug) {
    try {
      const { data: cityRow } = await sb
        .from('go_cities')
        .select('name, slug, hero_image, personal_photo, hero_photo_urls')
        .eq('slug', citySlug)
        .maybeSingle();
      if (!cityRow) {
        return NextResponse.json({ photos: [], total: 0, hasMore: false });
      }
      const city = cityRow as Record<string, unknown>;
      const cityName = (city.name as string | null) ?? '';
      // Pull pins whose city_names contains this city by exact name. The
      // public Pin shape stores the city display name (e.g. "Bangkok"),
      // not the slug, so we match on name.
      const { data: cityPins, error: pinErr } = await sb
        .from('pins')
        .select('id')
        .contains('city_names', [cityName]);
      if (pinErr) {
        return NextResponse.json({ error: pinErr.message }, { status: 500 });
      }
      const pinIds = (cityPins ?? []).map(r => r.id as string);
      const cityHeroes: PhotoTile[] = [];
      const seenUrls = new Set<string>();
      const personalPhoto = city.personal_photo;
      if (typeof personalPhoto === 'string' && personalPhoto && !seenUrls.has(personalPhoto)) {
        cityHeroes.push({
          id: `city-hero:${citySlug}:personal`,
          url: personalPhoto,
          source: 'city-hero',
          pinId: null,
          pinName: `${cityName} (city)`,
          pinSlug: citySlug,
          takenAt: null,
          lat: null,
          lng: null,
        });
        seenUrls.add(personalPhoto);
      }
      const heroImage = city.hero_image;
      if (typeof heroImage === 'string' && heroImage && !seenUrls.has(heroImage)) {
        cityHeroes.push({
          id: `city-hero:${citySlug}:hero`,
          url: heroImage,
          source: 'city-hero',
          pinId: null,
          pinName: `${cityName} (city)`,
          pinSlug: citySlug,
          takenAt: null,
          lat: null,
          lng: null,
        });
        seenUrls.add(heroImage);
      }
      const heroArr = Array.isArray(city.hero_photo_urls) ? city.hero_photo_urls : [];
      heroArr.forEach((u, idx) => {
        if (typeof u !== 'string' || !u || seenUrls.has(u)) return;
        cityHeroes.push({
          id: `city-hero:${citySlug}:${idx}`,
          url: u,
          source: 'city-hero',
          pinId: null,
          pinName: `${cityName} (city)`,
          pinSlug: citySlug,
          takenAt: null,
          lat: null,
          lng: null,
        });
        seenUrls.add(u);
      });
      const [personalRes, pinImages] = await Promise.all([
        pinIds.length > 0
          ? fetchPersonalPhotoTiles(sb, pinIds, 0, HARD_LIMIT)
          : Promise.resolve({ tiles: [] as PhotoTile[], total: 0, hasMore: false }),
        pinIds.length > 0
          ? fetchPinImageTiles(sb, pinIds)
          : Promise.resolve([] as PhotoTile[]),
      ]);
      const photos = dedupeByUrl([
        ...cityHeroes,
        ...personalRes.tiles,
        ...pinImages,
      ]);
      return NextResponse.json({ photos, total: photos.length, hasMore: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'fetch failed' },
        { status: 500 },
      );
    }
  }

  // === Scope: a country ===================================================
  if (countrySlug) {
    try {
      const { data: countryRow } = await sb
        .from('go_countries')
        .select('name, slug, hero_photo_urls')
        .eq('slug', countrySlug)
        .maybeSingle();
      if (!countryRow) {
        return NextResponse.json({ photos: [], total: 0, hasMore: false });
      }
      const country = countryRow as Record<string, unknown>;
      const countryName = (country.name as string | null) ?? '';
      const { data: countryPins, error: pinErr } = await sb
        .from('pins')
        .select('id')
        .contains('states_names', [countryName]);
      if (pinErr) {
        return NextResponse.json({ error: pinErr.message }, { status: 500 });
      }
      const pinIds = (countryPins ?? []).map(r => r.id as string);
      const heroes: PhotoTile[] = [];
      const seenUrls = new Set<string>();
      const heroArr = Array.isArray(country.hero_photo_urls) ? country.hero_photo_urls : [];
      heroArr.forEach((u, idx) => {
        if (typeof u !== 'string' || !u || seenUrls.has(u)) return;
        heroes.push({
          id: `country-hero:${countrySlug}:${idx}`,
          url: u,
          source: 'country-hero',
          pinId: null,
          pinName: `${countryName} (country)`,
          pinSlug: countrySlug,
          takenAt: null,
          lat: null,
          lng: null,
        });
        seenUrls.add(u);
      });
      const [personalRes, pinImages] = await Promise.all([
        pinIds.length > 0
          ? fetchPersonalPhotoTiles(sb, pinIds, 0, HARD_LIMIT)
          : Promise.resolve({ tiles: [] as PhotoTile[], total: 0, hasMore: false }),
        pinIds.length > 0
          ? fetchPinImageTiles(sb, pinIds)
          : Promise.resolve([] as PhotoTile[]),
      ]);
      const photos = dedupeByUrl([
        ...heroes,
        ...personalRes.tiles,
        ...pinImages,
      ]);
      return NextResponse.json({ photos, total: photos.length, hasMore: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'fetch failed' },
        { status: 500 },
      );
    }
  }

  // === Scope: members of a saved list ======================================
  // Personal photos AND pin.images for every pin in the list — codex art
  // and Wikidata pictures get equal billing alongside Mike's own uploads.
  if (listName) {
    const { data: memberPins, error: pinErr } = await sb
      .from('pins')
      .select('id')
      .contains('saved_lists', [listName]);
    if (pinErr) {
      return NextResponse.json({ error: pinErr.message }, { status: 500 });
    }
    const pinIds = (memberPins ?? []).map(r => r.id as string);
    if (pinIds.length === 0) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
    try {
      const [{ tiles: personal }, pinImages] = await Promise.all([
        fetchPersonalPhotoTiles(sb, pinIds, 0, HARD_LIMIT),
        fetchPinImageTiles(sb, pinIds),
      ]);
      const photos = dedupeByUrl([...personal, ...pinImages]);
      return NextResponse.json({ photos, total: photos.length, hasMore: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'fetch failed' },
        { status: 500 },
      );
    }
  }

  // === Scope: places related to a list name ================================
  // Pin photos for pins in matching cities/countries, plus the hero photos
  // attached to the cities and countries themselves.
  if (relatedToList) {
    const listNorm = normalizeListName(relatedToList);
    if (!listNorm) {
      return NextResponse.json({ photos: [], total: 0, hasMore: false });
    }
    const { data: candidatePins, error: pinErr } = await sb
      .from('pins')
      .select('id, city_names, states_names')
      .or('city_names.not.is.null,states_names.not.is.null');
    if (pinErr) {
      return NextResponse.json({ error: pinErr.message }, { status: 500 });
    }
    const matchedPinIds: string[] = [];
    for (const row of candidatePins ?? []) {
      const cities = (row.city_names as string[] | null) ?? [];
      const states = (row.states_names as string[] | null) ?? [];
      if ([...cities, ...states].some(p => placeWordMatchesList(listNorm, p))) {
        matchedPinIds.push(row.id as string);
      }
    }
    try {
      const [personalRes, pinImages, cityTiles, countryTiles] = await Promise.all([
        matchedPinIds.length > 0
          ? fetchPersonalPhotoTiles(sb, matchedPinIds, 0, HARD_LIMIT)
          : Promise.resolve({ tiles: [] as PhotoTile[], total: 0, hasMore: false }),
        matchedPinIds.length > 0
          ? fetchPinImageTiles(sb, matchedPinIds)
          : Promise.resolve([] as PhotoTile[]),
        fetchCityHeroTiles(sb, listNorm),
        fetchCountryHeroTiles(sb, listNorm),
      ]);
      // City + country heroes lead so they're easy to spot at the top of
      // the grid; pin-attached photos follow.
      const photos = dedupeByUrl([
        ...cityTiles,
        ...countryTiles,
        ...personalRes.tiles,
        ...pinImages,
      ]);
      return NextResponse.json({ photos, total: photos.length, hasMore: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'fetch failed' },
        { status: 500 },
      );
    }
  }

  // === Scope: all personal photos (paginated) ==============================
  try {
    const { tiles, total, hasMore } = await fetchPersonalPhotoTiles(sb, null, offset, limit);
    return NextResponse.json({ photos: tiles, total, hasMore });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 500 },
    );
  }
}

// === POST /api/admin/personal-photos =======================================
// Create a personal_photos row for a pin we already know about. Used by
// the inline cover picker when the admin uploads a fresh photo from
// inside a pin/city/country flow — the file goes to Storage via the
// signed-URL endpoint first, then this handler attaches it to the pin
// (and bumps it to hero_photo_urls[0] when promoteToCover is true).
//
// City and country uploads don't need a personal_photos row (the
// hero_photo_urls array stores raw URLs), so the picker writes those
// directly via update-city / update-country and skips this endpoint.
//
// Body: {
//   pinId: string,
//   url: string,            // public URL returned by upload-photo
//   hash?: string,
//   takenAt?: string,
//   exifLat?: number,
//   exifLng?: number,
//   width?: number,
//   height?: number,
//   bytes?: number,
//   caption?: string,
//   promoteToCover?: boolean   // default false: just attach the photo;
//                              //  when true, also unshift the URL onto
//                              //  pin.hero_photo_urls so it becomes
//                              //  the cover.
// }

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const pinId = typeof body.pinId === 'string' ? body.pinId.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!pinId) return NextResponse.json({ error: 'pinId required' }, { status: 400 });
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'url must be http(s)' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const insert: Record<string, unknown> = {
    pin_id: pinId,
    url,
    hash: typeof body.hash === 'string' ? body.hash : null,
    taken_at: typeof body.takenAt === 'string' ? body.takenAt : null,
    exif_lat: typeof body.exifLat === 'number' ? body.exifLat : null,
    exif_lng: typeof body.exifLng === 'number' ? body.exifLng : null,
    width: typeof body.width === 'number' ? body.width : null,
    height: typeof body.height === 'number' ? body.height : null,
    bytes: typeof body.bytes === 'number' ? body.bytes : null,
    caption: typeof body.caption === 'string' ? body.caption : null,
  };

  const { data: created, error: insErr } = await sb
    .from('personal_photos')
    .insert(insert)
    .select('id, url')
    .single();
  if (insErr || !created) {
    console.error('[personal-photos POST] insert failed:', insErr);
    return NextResponse.json(
      { error: insErr?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  // Optional: promote the new URL to be the pin's primary cover.
  let updatedHeroUrls: string[] | null = null;
  if (body.promoteToCover === true) {
    const { data: pinRow } = await sb
      .from('pins')
      .select('hero_photo_urls')
      .eq('id', pinId)
      .maybeSingle();
    const existing = Array.isArray(
      (pinRow as { hero_photo_urls?: unknown } | null)?.hero_photo_urls,
    )
      ? ((pinRow as { hero_photo_urls?: string[] }).hero_photo_urls as string[])
      : [];
    const next = [url, ...existing.filter(u => u && u !== url)];
    const { error: heroErr } = await sb
      .from('pins')
      .update({ hero_photo_urls: next })
      .eq('id', pinId);
    if (heroErr) {
      console.error('[personal-photos POST] hero promote failed:', heroErr);
      // Photo is still saved; just report the partial failure so the
      // caller can decide whether to retry the cover bump.
      return NextResponse.json({
        id: created.id,
        url: created.url,
        promoted: false,
        promoteError: heroErr.message,
      });
    }
    updatedHeroUrls = next;
  }

  try { revalidateTag('supabase-personal-photos'); } catch { /* ignore */ }
  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }

  return NextResponse.json({
    id: created.id,
    url: created.url,
    promoted: !!updatedHeroUrls,
    heroPhotoUrls: updatedHeroUrls,
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
