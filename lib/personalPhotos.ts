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
