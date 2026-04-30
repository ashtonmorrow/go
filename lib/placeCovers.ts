import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

/**
 * Photo cover fallback chain.
 *
 * Detail pages prefer their own personal photo (city.personalPhoto on the
 * Notion city, pin.personalCoverUrl on a pin). When that's missing, we want
 * the page to feel personal anyway, so we look at any photos I've taken on
 * pins inside that city (or, for country pages, any pin in that country)
 * and pick the most recent one as the hero.
 *
 * Two queries instead of one nested join: Supabase's PostgREST nested-filter
 * syntax for JSON-aggregated relations is finicky, and two indexed lookups
 * (one on pins.city_names GIN, one on personal_photos.pin_id btree) are
 * fast enough that an extra round trip beats the parser-shaped headache.
 *
 * Both wrapped in unstable_cache (24h, tagged on the same name as the
 * personal-photos table) so the same image fallback is reused across
 * subsequent renders without hitting Supabase.
 */

export type PlaceCover = {
  url: string;
  width: number | null;
  height: number | null;
};

async function pickLatestPhotoForPinIds(pinIds: string[]): Promise<PlaceCover | null> {
  if (pinIds.length === 0) return null;
  const { data, error } = await supabase
    .from('personal_photos')
    .select('url, width, height')
    .in('pin_id', pinIds)
    .order('taken_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    url: data.url as string,
    width: (data.width as number | null) ?? null,
    height: (data.height as number | null) ?? null,
  };
}

const _coverForCity = unstable_cache(
  async (cityName: string): Promise<PlaceCover | null> => {
    if (!cityName) return null;
    const { data: pins, error } = await supabase
      .from('pins')
      .select('id')
      .contains('city_names', [cityName]);
    if (error || !pins) return null;
    return pickLatestPhotoForPinIds((pins as { id: string }[]).map(p => p.id));
  },
  ['place-cover-city'],
  { revalidate: 86400, tags: ['place-cover', 'supabase-personal-photos'] },
);

/**
 * Most recent personal photo on any pin whose `city_names` array includes
 * `cityName` (matched as the city's display name, e.g. "Aegina"). Returns
 * null if no such photo exists or the lookup fails.
 */
export const fetchCoverForCity = cache(_coverForCity);

const _coverForCountry = unstable_cache(
  async (countryName: string): Promise<PlaceCover | null> => {
    if (!countryName) return null;
    // pins.states_names holds country names despite the column name —
    // legacy Airtable schema kept "states_names" and we never renamed.
    const { data: pins, error } = await supabase
      .from('pins')
      .select('id')
      .contains('states_names', [countryName]);
    if (error || !pins) return null;
    return pickLatestPhotoForPinIds((pins as { id: string }[]).map(p => p.id));
  },
  ['place-cover-country'],
  { revalidate: 86400, tags: ['place-cover', 'supabase-personal-photos'] },
);

/**
 * Most recent personal photo on any pin whose `states_names` array includes
 * the country (matched by country display name, e.g. "Greece"). Returns
 * null if no such photo exists or the lookup fails.
 */
export const fetchCoverForCountry = cache(_coverForCountry);
