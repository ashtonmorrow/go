/**
 * Walk every city, fetch Commons attribution for hero_image + city_flag
 * when the URL points at Commons, write the metadata back to Supabase.
 *
 *   npm run attribution:backfill
 *
 * Required env (loaded via tsx --env-file=.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: rows whose attribution column is already filled are skipped
 * unless --force is passed. Logs everything so you can audit which images
 * resolved + which didn't.
 *
 * Rate limit: Commons API allows ~100 req/s but we cap at 5 req/s to be
 * polite — total ~5 minutes for 1,300 cities * 2 images = 2,600 lookups.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchCommonsAttribution, isCommonsUrl, type CommonsAttribution } from '../lib/commonsAttribution';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[attr] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const REQ_INTERVAL_MS = 200; // 5 req/s, polite to Commons.

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type CityRow = {
  id: string;
  name: string;
  hero_image: string | null;
  city_flag: string | null;
  hero_image_attribution: CommonsAttribution | null;
  city_flag_attribution: CommonsAttribution | null;
};

async function fetchAllCities(): Promise<CityRow[]> {
  const out: CityRow[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('go_cities')
      .select('id, name, hero_image, city_flag, hero_image_attribution, city_flag_attribution')
      .order('name')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[attr] cities fetch failed at offset', from, error);
      throw error;
    }
    if (!data || data.length === 0) break;
    out.push(...(data as CityRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`[attr] Loading cities…${FORCE ? ' (force=ON)' : ''}`);
  const cities = await fetchAllCities();
  console.log(`[attr] Got ${cities.length} cities. Scanning images…`);

  let scanned = 0;
  let skippedNonCommons = 0;
  let skippedAlreadyFilled = 0;
  let resolved = 0;
  let unresolved = 0;
  let errors = 0;

  for (const city of cities) {
    for (const which of ['hero_image', 'city_flag'] as const) {
      const url = city[which];
      const existing = which === 'hero_image' ? city.hero_image_attribution : city.city_flag_attribution;
      const attrColumn = which === 'hero_image' ? 'hero_image_attribution' : 'city_flag_attribution';

      if (!url) continue;
      scanned++;

      if (!isCommonsUrl(url)) {
        skippedNonCommons++;
        continue;
      }
      if (existing && !FORCE) {
        skippedAlreadyFilled++;
        continue;
      }

      // Polite throttle.
      await sleep(REQ_INTERVAL_MS);

      let attribution: CommonsAttribution | null = null;
      try {
        attribution = await fetchCommonsAttribution(url);
      } catch (e) {
        console.error(`[attr] error on ${city.name} ${which}:`, e);
        errors++;
        continue;
      }

      if (!attribution) {
        unresolved++;
        console.warn(`[attr] no metadata: ${city.name} ${which} (${url})`);
        continue;
      }

      const { error: writeErr } = await sb
        .from('go_cities')
        .update({ [attrColumn]: attribution })
        .eq('id', city.id);
      if (writeErr) {
        console.error(`[attr] write failed for ${city.name} ${which}:`, writeErr);
        errors++;
        continue;
      }
      resolved++;
      console.log(`[attr] ✓ ${city.name} ${which}: ${attribution.author ?? '—'} · ${attribution.license ?? '—'}`);
    }
  }

  console.log('[attr] Done.');
  console.log(`[attr]   scanned:               ${scanned}`);
  console.log(`[attr]   non-Commons skipped:   ${skippedNonCommons}`);
  console.log(`[attr]   already filled (skip): ${skippedAlreadyFilled}`);
  console.log(`[attr]   resolved + written:    ${resolved}`);
  console.log(`[attr]   unresolved (no meta):  ${unresolved}`);
  console.log(`[attr]   errors:                ${errors}`);
}

main().catch(err => {
  console.error('[attr] FATAL:', err);
  process.exit(1);
});
