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

const _fetchAllPersonalPhotos = unstable_cache(
  async (): Promise<Map<string, PersonalPhoto[]>> => {
    const map = new Map<string, PersonalPhoto[]>();
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
        if (!map.has(photo.pinId)) map.set(photo.pinId, []);
        map.get(photo.pinId)!.push(photo);
      }
      if (data.length < PAGE) break;
    }
    return map;
  },
  ['supabase-personal-photos-all'],
  { revalidate: 86400, tags: ['supabase-personal-photos'] },
);

export const fetchAllPersonalPhotos = cache(_fetchAllPersonalPhotos);

/** Cover URL per pin: first personal photo if any, else null. Cheaper to
 *  call than fetchAllPersonalPhotos when callers only need a thumbnail. */
export const fetchPersonalCovers = cache(async (): Promise<Map<string, string>> => {
  const all = await fetchAllPersonalPhotos();
  const out = new Map<string, string>();
  for (const [pinId, photos] of all) {
    if (photos[0]?.url) out.set(pinId, photos[0].url);
  }
  return out;
});
