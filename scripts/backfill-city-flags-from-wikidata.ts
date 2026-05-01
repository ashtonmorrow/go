/**
 * Fill or replace go_cities.city_flag with stable Wikimedia Commons files
 * from Wikidata P41 (flag image), falling back to P94 (coat of arms).
 *
 * This cleans up old Notion/S3 signed URLs and adds attribution metadata so
 * city detail pages can show a proper source link.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchCommonsAttribution, isCommonsUrl, type CommonsAttribution } from '../lib/commonsAttribution';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[flags] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const CURATED_ONLY = process.argv.includes('--curated');
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_FILEPATH = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const BATCH_SIZE = 50;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type CityRow = {
  id: string;
  name: string;
  slug: string | null;
  been: boolean | null;
  go: boolean | null;
  wikidata_id: string | null;
  city_flag: string | null;
  city_flag_attribution: CommonsAttribution | null;
};

type WikidataClaim = {
  mainsnak?: { datavalue?: { value?: unknown } };
};

type WikidataEntity = {
  claims?: Record<string, WikidataClaim[]>;
};

function normalQid(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

function commonsUrl(filename: string): string {
  return `${COMMONS_FILEPATH}/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=640`;
}

async function fetchAllCities(): Promise<CityRow[]> {
  const out: CityRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('go_cities')
      .select('id, name, slug, been, go, wikidata_id, city_flag, city_flag_attribution')
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as CityRow[]));
    if (data.length < page) break;
  }
  return out;
}

async function fetchWikidataFlags(qids: string[]): Promise<Map<string, { url: string; kind: 'flag' | 'coat' }>> {
  const result = new Map<string, { url: string; kind: 'flag' | 'coat' }>();
  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const url =
      `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${batch.join('|')}&origin=*`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'go.mike-lee.me/1.0 (mikeyle3@gmail.com) city flag backfill',
      },
    });
    if (!res.ok) {
      console.warn(`[flags] Wikidata batch failed ${res.status}: ${batch.join(', ')}`);
      continue;
    }
    const data: { entities?: Record<string, WikidataEntity> } = await res.json();
    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      const claims = entity.claims ?? {};
      const flag = claims.P41?.[0]?.mainsnak?.datavalue?.value;
      const coat = claims.P94?.[0]?.mainsnak?.datavalue?.value;
      if (typeof flag === 'string') {
        result.set(qid, { url: commonsUrl(flag), kind: 'flag' });
      } else if (typeof coat === 'string') {
        result.set(qid, { url: commonsUrl(coat), kind: 'coat' });
      }
    }
  }
  return result;
}

function shouldReplace(city: CityRow): boolean {
  if (!city.city_flag) return true;
  if (!isCommonsUrl(city.city_flag)) return true;
  return !city.city_flag_attribution;
}

async function main() {
  console.log(`[flags] Loading cities${DRY_RUN ? ' (dry run)' : ''}${CURATED_ONLY ? ' (curated only)' : ''}...`);
  const cities = (await fetchAllCities()).filter(city => {
    if (String(city.slug ?? '').startsWith('delete-')) return false;
    if (CURATED_ONLY && !(city.been || city.go)) return false;
    return Boolean(normalQid(city.wikidata_id)) && shouldReplace(city);
  });

  const qids = [...new Set(cities.map(city => normalQid(city.wikidata_id)!).filter(Boolean))];
  console.log(`[flags] ${cities.length} candidate cities, ${qids.length} Wikidata IDs.`);
  const flags = await fetchWikidataFlags(qids);

  let updated = 0;
  let skippedNoFlag = 0;
  let skippedNoAttribution = 0;
  for (const city of cities) {
    const qid = normalQid(city.wikidata_id);
    if (!qid) continue;
    const found = flags.get(qid);
    if (!found) {
      skippedNoFlag++;
      continue;
    }

    const attribution = await fetchCommonsAttribution(found.url);
    if (!attribution) {
      skippedNoAttribution++;
      continue;
    }

    updated++;
    if (DRY_RUN) {
      console.log(`[flags] would update ${city.name}: ${found.kind}`);
      continue;
    }

    const { error } = await sb
      .from('go_cities')
      .update({
        city_flag: found.url,
        city_flag_attribution: attribution,
        updated_at: new Date().toISOString(),
      })
      .eq('id', city.id);
    if (error) {
      console.error(`[flags] update failed for ${city.name}:`, error);
      continue;
    }
    console.log(`[flags] updated ${city.name}: ${found.kind}`);
  }

  console.log('[flags] Done.');
  console.log(`[flags]   updated:                ${updated}`);
  console.log(`[flags]   no Wikidata flag/coat: ${skippedNoFlag}`);
  console.log(`[flags]   no Commons metadata:   ${skippedNoAttribution}`);
}

main().catch(error => {
  console.error('[flags] FATAL:', error);
  process.exit(1);
});
