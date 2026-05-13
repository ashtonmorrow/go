import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

export type PersonalPhoto = {
  id: string;
  pinId: string;
  url: string;
  takenAt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  /** 'image' (default) or 'video'. Hero/gallery renderers dispatch on
   *  this — videos render a <video> tile with the poster as the still
   *  and play in the lightbox. */
  mediaType: 'image' | 'video';
  /** For videos, the public URL of the captured poster JPG. */
  posterUrl: string | null;
  /** For videos, runtime in whole seconds (rounded). Mostly informational
   *  today; could surface as a "0:42" badge later. */
  durationSeconds: number | null;
};

const _fetchPhotosForPin = unstable_cache(
  async (pinId: string): Promise<PersonalPhoto[]> => {
    // hidden=true photos are deliberately suppressed from auto-pick
    // surfaces (see admin curation flow). They remain pickable from the
    // HeroPicker — that path uses supabaseAdmin and bypasses this
    // helper.
    const { data, error } = await supabase
      .from('personal_photos')
      .select('id, pin_id, url, taken_at, caption, width, height, media_type, poster_url, duration_seconds')
      .eq('pin_id', pinId)
      .eq('hidden', false)
      .order('taken_at', { ascending: false, nullsFirst: false });
    if (error) {
      console.error('[personalPhotos] fetch failed:', error);
      return [];
    }
    return (data ?? []).map(r => ({
      id: r.id as string,
      pinId: r.pin_id as string,
      url: r.url as string,
      takenAt: (r.taken_at as string | null) ?? null,
      caption: (r.caption as string | null) ?? null,
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      mediaType: (r.media_type as string | null) === 'video' ? 'video' : 'image',
      posterUrl: (r.poster_url as string | null) ?? null,
      durationSeconds: (r.duration_seconds as number | null) ?? null,
    }));
  },
  // v2: surfaces media_type/poster_url/duration_seconds for video support.
  ['supabase-personal-photos-v2'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchPhotosForPin = cache(_fetchPhotosForPin);

// unstable_cache serializes its return value, and Map instances don't survive
// that round trip — they come back as plain objects with no Symbol.iterator,
// which crashes any `for ... of` consumer. So the cached function returns a
// plain Record; the non-cached helper rehydrates a Map at the call site.
const _fetchAllPersonalPhotos = unstable_cache(
  async (): Promise<Record<string, PersonalPhoto[]>> => {
    const out: Record<string, PersonalPhoto[]> = {};
    const PAGE = 1000;
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await supabase
        .from('personal_photos')
        .select('id, pin_id, url, taken_at, caption, width, height, media_type, poster_url, duration_seconds')
        .eq('hidden', false)
        .order('taken_at', { ascending: false, nullsFirst: false })
        .range(start, start + PAGE - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) {
        const photo: PersonalPhoto = {
          id: r.id as string,
          pinId: r.pin_id as string,
          url: r.url as string,
          takenAt: (r.taken_at as string | null) ?? null,
          caption: (r.caption as string | null) ?? null,
          width: (r.width as number | null) ?? null,
          height: (r.height as number | null) ?? null,
          mediaType: (r.media_type as string | null) === 'video' ? 'video' : 'image',
          posterUrl: (r.poster_url as string | null) ?? null,
          durationSeconds: (r.duration_seconds as number | null) ?? null,
        };
        if (!out[photo.pinId]) out[photo.pinId] = [];
        out[photo.pinId].push(photo);
      }
      if (data.length < PAGE) break;
    }
    return out;
  },
  // v2: surfaces media_type/poster_url/duration_seconds.
  ['supabase-personal-photos-all-v2'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchAllPersonalPhotos = cache(async (): Promise<Map<string, PersonalPhoto[]>> => {
  const record = await _fetchAllPersonalPhotos();
  return new Map(Object.entries(record ?? {}));
});

/** Cover URL per pin: first personal photo if any, else null. */
export const fetchPersonalCovers = cache(async (): Promise<Map<string, string>> => {
  const record = await _fetchAllPersonalPhotos();
  const out = new Map<string, string>();
  for (const [pinId, photos] of Object.entries(record ?? {})) {
    if (photos?.[0]?.url) out.set(pinId, photos[0].url);
  }
  return out;
});

// === Slug-keyed lookup ======================================================
// List page bodies reference pins by slug in markdown links (`[X](/pins/foo)`).
// To inject photos inline we need to resolve slug → photos in one batch
// rather than running 14 queries from the Cairo guide. This helper does that
// in two passes: pins → ids, then photos → grouped by pin_id, joined back to
// slug.

type SlugPhotoRow = {
  /** Pin row ('s slug, name, id) merged with first-photo extras. */
  slug: string;
  pinId: string;
  pinName: string;
  photos: PersonalPhoto[];
};

const _fetchPersonalPhotosBySlugs = unstable_cache(
  async (slugsKey: string): Promise<Record<string, SlugPhotoRow>> => {
    const slugs = slugsKey ? slugsKey.split(',') : [];
    if (slugs.length === 0) return {};

    // Pass 1: slug → (id, name). Batched in chunks for the .in() limit.
    const CHUNK = 100;
    type PinRow = { id: string; slug: string; name: string };
    const pins: PinRow[] = [];
    for (let i = 0; i < slugs.length; i += CHUNK) {
      const chunk = slugs.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('pins')
        .select('id, slug, name')
        .in('slug', chunk);
      if (error) {
        console.error('[personalPhotos] slug→id lookup failed:', error);
        return {};
      }
      if (data) pins.push(...(data as PinRow[]));
    }

    if (pins.length === 0) return {};

    // Pass 2: pin_id → photos. Same batching.
    const idToPin = new Map<string, PinRow>();
    for (const p of pins) idToPin.set(p.id, p);
    type PhotoDbRow = {
      id: string;
      pin_id: string;
      url: string;
      taken_at: string | null;
      caption: string | null;
      width: number | null;
      height: number | null;
      media_type: string | null;
      poster_url: string | null;
      duration_seconds: number | null;
    };
    const photoRows: PhotoDbRow[] = [];
    const ids = pins.map((p) => p.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('personal_photos')
        .select(
          'id, pin_id, url, taken_at, caption, width, height, media_type, poster_url, duration_seconds',
        )
        .in('pin_id', chunk)
        .eq('hidden', false)
        .order('taken_at', { ascending: false, nullsFirst: false });
      if (error) {
        console.error('[personalPhotos] photo fetch failed:', error);
        continue;
      }
      if (data) photoRows.push(...(data as PhotoDbRow[]));
    }

    // Bucket photos by pin_id, then key the final map by slug so the consumer
    // can look up by what the markdown reference holds.
    const out: Record<string, SlugPhotoRow> = {};
    for (const p of pins) {
      out[p.slug] = { slug: p.slug, pinId: p.id, pinName: p.name, photos: [] };
    }
    for (const r of photoRows) {
      const pin = idToPin.get(r.pin_id);
      if (!pin) continue;
      const photo: PersonalPhoto = {
        id: r.id,
        pinId: r.pin_id,
        url: r.url,
        takenAt: r.taken_at,
        caption: r.caption,
        width: r.width,
        height: r.height,
        mediaType: r.media_type === 'video' ? 'video' : 'image',
        posterUrl: r.poster_url,
        durationSeconds: r.duration_seconds,
      };
      out[pin.slug]?.photos.push(photo);
    }
    return out;
  },
  ['supabase-personal-photos-by-slug-v1'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

/**
 * Resolve a list of pin slugs to their personal photos.
 *
 * Returns a Map keyed by slug. Slugs that resolve to a pin but have no
 * personal photos still appear in the map (with an empty `photos` array)
 * so callers can distinguish "no such pin" (absent) from "pin exists but
 * I haven't uploaded photos yet" (present, empty).
 */
export const fetchPersonalPhotosBySlugs = cache(
  async (slugs: string[]): Promise<Map<string, SlugPhotoRow>> => {
    // unstable_cache keys on argument identity, so a stable string key beats
    // passing the array. Sort + dedupe so [a,b,a] and [b,a] hit the same cache
    // entry.
    const key = Array.from(new Set(slugs)).sort().join(',');
    const record = await _fetchPersonalPhotosBySlugs(key);
    return new Map(Object.entries(record ?? {}));
  },
);

export type { SlugPhotoRow };

// === Place-scoped personal photos ===========================================
// City and country detail pages render a "from my pins" gallery — the
// personal photos Mike's uploaded for any pin in that place. We don't
// add a per-photo place column; we join photos against the pin's
// city_names / states_names arrays so the gallery composes
// automatically as new pins / photos land.

/** A personal photo with the pin metadata each gallery card needs. */
export type PinPhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  takenAt: string | null;
  pinId: string;
  pinSlug: string | null;
  pinName: string;
  pinKind: string | null;
  pinTag: string | null;
  /** 'image' (default) or 'video'. */
  mediaType: 'image' | 'video';
  /** Poster JPG URL when mediaType='video'. */
  posterUrl: string | null;
};

/** Shared mapper: a Supabase row from personal_photos JOIN pins becomes
 *  the PinPhoto shape consumed by <PinPhotoMasonry>. */
function mapPinPhotoRow(r: Record<string, unknown>): PinPhoto {
  const pin = (r.pins ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(pin.tags) ? (pin.tags as string[]) : [];
  return {
    id: r.id as string,
    url: r.url as string,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    takenAt: (r.taken_at as string | null) ?? null,
    pinId: r.pin_id as string,
    pinSlug: (pin.slug as string | null) ?? null,
    pinName: (pin.name as string | null) ?? 'Untitled pin',
    // The card shows kind as the primary tag (Restaurant / Hotel / Park
    // — short and useful), with tags[0] as a fallback when kind is null
    // (Google Takeout pins often arrive without a kind).
    pinKind: (pin.kind as string | null) ?? null,
    pinTag: (pin.kind as string | null) ?? tags[0] ?? null,
    mediaType: (r.media_type as string | null) === 'video' ? 'video' : 'image',
    posterUrl: (r.poster_url as string | null) ?? null,
  };
}

const _fetchPinPhotosForCity = unstable_cache(
  async (cityName: string, limit: number): Promise<PinPhoto[]> => {
    if (!cityName) return [];
    // Supabase PostgREST embedded select. Filtering on the JOINED pins
    // table happens via the `pins.city_names` overlap predicate. We
    // sort taken_at desc and let the page paginate visually if needed.
    const { data, error } = await supabase
      .from('personal_photos')
      .select(
        'id, pin_id, url, taken_at, caption, width, height, media_type, poster_url, ' +
        'pins!inner(slug, name, kind, tags, city_names)'
      )
      .eq('hidden', false)
      .overlaps('pins.city_names', [cityName])
      .order('taken_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error('[personalPhotos] fetchPinPhotosForCity failed:', error);
      return [];
    }
    return (data ?? []).map(r => mapPinPhotoRow(r as unknown as Record<string, unknown>));
  },
  ['supabase-pin-photos-for-city-v2'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchPinPhotosForCity = cache(
  (cityName: string, limit = 24): Promise<PinPhoto[]> =>
    _fetchPinPhotosForCity(cityName, limit),
);

const _fetchPinPhotosForCountry = unstable_cache(
  async (countryName: string, limit: number): Promise<PinPhoto[]> => {
    if (!countryName) return [];
    const { data, error } = await supabase
      .from('personal_photos')
      .select(
        'id, pin_id, url, taken_at, caption, width, height, media_type, poster_url, ' +
        'pins!inner(slug, name, kind, tags, states_names)'
      )
      .eq('hidden', false)
      .overlaps('pins.states_names', [countryName])
      .order('taken_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error('[personalPhotos] fetchPinPhotosForCountry failed:', error);
      return [];
    }
    return (data ?? []).map(r => mapPinPhotoRow(r as unknown as Record<string, unknown>));
  },
  ['supabase-pin-photos-for-country-v2'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchPinPhotosForCountry = cache(
  (countryName: string, limit = 36): Promise<PinPhoto[]> =>
    _fetchPinPhotosForCountry(countryName, limit),
);
