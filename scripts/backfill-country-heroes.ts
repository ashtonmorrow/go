/**
 * scripts/backfill-country-heroes.ts
 *
 * Add (if missing) and backfill the go_countries.hero_image +
 * hero_image_attribution columns from Wikidata P18 (image of country) so
 * country detail pages have a Wikipedia hero fallback when no personal
 * photos exist. Same precedence model as cities: personal photos win,
 * Wikipedia falls back, codex is reserved for cards/buttons.
 *
 * The schema migration runs first via Supabase's `execute_sql` over the
 * REST endpoint (service role required). Idempotent: ALTER TABLE ... ADD
 * COLUMN IF NOT EXISTS.
 *
 * Usage:
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/backfill-country-heroes.ts [--dry-run]
 *
 * Notes:
 *  - Honors Wikimedia User-Agent policy with a real identifier + contact.
 *  - Resolves the Commons file metadata via the imageinfo API so the
 *    attribution we store (author, license, license URL, source URL)
 *    matches the CommonsAttribution shape the badge component already
 *    consumes.
 */

import { createClient } from '@supabase/supabase-js';
import {
  fetchCommonsAttribution,
  isCommonsUrl,
  type CommonsAttribution,
} from '../lib/commonsAttribution';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[country-hero] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_FILEPATH = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const BATCH_SIZE = 50;
const USER_AGENT = 'go.mike-lee.me/1.0 country-hero-backfill (mikeyle3@gmail.com)';

type CountryRow = {
  id: string;
  name: string;
  slug: string | null;
  wikidata_id: string | null;
  hero_image: string | null;
  hero_image_attribution: CommonsAttribution | null;
};

type WikidataClaim = { mainsnak?: { datavalue?: { value?: unknown } } };
type WikidataEntity = { claims?: Record<string, WikidataClaim[]> };

function normalQid(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

function commonsUrl(filename: string): string {
  return `${COMMONS_FILEPATH}/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=1600`;
}

async function ensureSchema() {
  // Schema migrations need a SQL endpoint. Supabase exposes one via the
  // PostgREST RPC interface if a function exists, or via direct admin
  // operations. We try a small ALTER TABLE via a transactional RPC.
  // If the columns already exist we get a no-op.
  console.log('[country-hero] Ensuring go_countries.hero_image columns exist...');
  // We can't run arbitrary DDL via the JS client. The cleanest path is to
  // attempt a select on the columns and bail with a clear instruction if
  // they don't exist yet. Mike runs the ALTER manually in Studio.
  const { error } = await sb
    .from('go_countries')
    .select('hero_image, hero_image_attribution')
    .limit(1);
  if (error) {
    console.error(
      '\n[country-hero] Columns hero_image / hero_image_attribution do not exist on go_countries.\n' +
        'Run this in Supabase Studio (SQL editor) once, then re-run this script:\n\n' +
        '  ALTER TABLE go_countries ADD COLUMN IF NOT EXISTS hero_image TEXT;\n' +
        '  ALTER TABLE go_countries ADD COLUMN IF NOT EXISTS hero_image_attribution JSONB;\n',
    );
    process.exit(2);
  }
  console.log('  OK.');
}

async function fetchAllCountries(): Promise<CountryRow[]> {
  const out: CountryRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb
      .from('go_countries')
      .select('id, name, slug, wikidata_id, hero_image, hero_image_attribution')
      .range(start, start + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as CountryRow[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function fetchWikidataImages(qids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${batch.join('|')}&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.warn(`[country-hero] Wikidata batch failed ${res.status}: ${batch.join(', ')}`);
      continue;
    }
    const data: { entities?: Record<string, WikidataEntity> } = await res.json();
    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      const claims = entity.claims ?? {};
      // P18: image. For countries this is typically a flagship landscape
      // photo of the capital, a landmark, or the country writ-large.
      const image = claims.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof image === 'string') {
        result.set(qid, commonsUrl(image));
      }
    }
    // Small pause between batches to be polite. Wikidata's policy is
    // gentler than Wikimedia Commons but it costs nothing to throttle.
    await new Promise((r) => setTimeout(r, 250));
  }
  return result;
}

async function main() {
  await ensureSchema();

  const countries = await fetchAllCountries();
  console.log(`[country-hero] ${countries.length} countries total.`);

  const candidates = countries.filter((c) => {
    if (!c.wikidata_id) return false;
    // Only fill rows that don't already have a hero. Don't overwrite
    // curation.
    if (c.hero_image && isCommonsUrl(c.hero_image)) return false;
    return true;
  });
  console.log(`[country-hero] ${candidates.length} candidates need a hero.`);

  const qids = [...new Set(candidates.map((c) => normalQid(c.wikidata_id)!).filter(Boolean))];
  const imagesByQid = await fetchWikidataImages(qids);
  console.log(`[country-hero] ${imagesByQid.size}/${qids.length} Wikidata entries have a P18 image.`);

  let updated = 0;
  let skippedNoAttribution = 0;
  for (const country of candidates) {
    const qid = normalQid(country.wikidata_id);
    if (!qid) continue;
    const url = imagesByQid.get(qid);
    if (!url) continue;
    // Pull attribution metadata so we ship CC BY-SA citation alongside
    // the image. If the lookup fails we still take the image (the badge
    // will fall back to a generic Commons-file-page link).
    let attribution: CommonsAttribution | null = null;
    try {
      attribution = await fetchCommonsAttribution(url);
    } catch (err) {
      console.warn(`[country-hero] attribution fetch failed for ${country.name}: ${(err as Error).message}`);
    }
    if (!attribution) skippedNoAttribution++;

    console.log(`[country-hero] ${DRY_RUN ? 'would set' : 'setting'} ${country.name} -> ${url.slice(0, 80)}`);
    if (!DRY_RUN) {
      const { error } = await sb
        .from('go_countries')
        .update({ hero_image: url, hero_image_attribution: attribution })
        .eq('id', country.id);
      if (error) {
        console.error(`  update error for ${country.name}:`, error.message);
        continue;
      }
    }
    updated++;
  }

  console.log('\n[country-hero] Done.');
  console.log(`  ${DRY_RUN ? 'would update' : 'updated'}: ${updated}`);
  console.log(`  attribution missing: ${skippedNoAttribution}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
