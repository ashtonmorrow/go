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
