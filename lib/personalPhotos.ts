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
};

const _fetchPhotosForPin = unstable_cache(
  async (pinId: string): Promise<PersonalPhoto[]> => {
    const { data, error } = await supabase
      .from('personal_photos')
      .select('id, pin_id, url, taken_at, caption, width, height')
      .eq('pin_id', pinId)
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
    }));
  },
  ['supabase-personal-photos'],
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
        .select('id, pin_id, url, taken_at, caption, width, height')
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
        };
        if (!out[photo.pinId]) out[photo.pinId] = [];
        out[photo.pinId].push(photo);
      }
      if (data.length < PAGE) break;
    }
    return out;
  },
  ['supabase-personal-photos-all'],
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
        'id, pin_id, url, taken_at, caption, width, height, ' +
        'pins!inner(slug, name, kind, tags, city_names)'
      )
      .overlaps('pins.city_names', [cityName])
      .order('taken_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error('[personalPhotos] fetchPinPhotosForCity failed:', error);
      return [];
    }
    return (data ?? []).map(r => mapPinPhotoRow(r as unknown as Record<string, unknown>));
  },
  ['supabase-pin-photos-for-city-v1'],
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
        'id, pin_id, url, taken_at, caption, width, height, ' +
        'pins!inner(slug, name, kind, tags, states_names)'
      )
      .overlaps('pins.states_names', [countryName])
      .order('taken_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error('[personalPhotos] fetchPinPhotosForCountry failed:', error);
      return [];
    }
    return (data ?? []).map(r => mapPinPhotoRow(r as unknown as Record<string, unknown>));
  },
  ['supabase-pin-photos-for-country-v1'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchPinPhotosForCountry = cache(
  (countryName: string, limit = 36): Promise<PinPhoto[]> =>
    _fetchPinPhotosForCountry(countryName, limit),
);
