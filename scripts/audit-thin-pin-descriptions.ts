/**
 * Audit pins with thin descriptions and emit a JSON queue the Codex
 * enrichment flow can consume.
 *
 * "Thin" = description is null, empty, or ≤100 characters. The output
 * file lists every thin pin with enough context (slug, name, city,
 * country, kind, list memberships, current description) for a Codex
 * pass to write 2-4 sentences of place-grounded prose.
 *
 * Pins are ranked so the highest-traffic ones get top of the queue:
 *   1. Visited + on a curated list (UNESCO, Atlas Obscura, Wonders, ...)
 *   2. Visited + on a saved list
 *   3. Visited only
 *   4. UNESCO unvisited
 *   5. On a curated list, unvisited
 *   6. On a saved list, unvisited
 *   7. Everything else
 *
 * Run from the repo root:
 *   npx tsx --env-file=.env.local scripts/audit-thin-pin-descriptions.ts
 *
 * Output:
 *   scripts/output/thin-pin-descriptions.json
 *
 * To process only the first N pins, pass --limit N. Default: no limit.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

type ThinPin = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  kind: string | null;
  visited: boolean;
  unesco_id: number | null;
  unesco_url: string | null;
  wikipedia_url: string | null;
  atlas_obscura_slug: string | null;
  curated_lists: string[];
  saved_lists: string[];
  description: string | null;
  description_length: number;
  google_place_url: string | null;
  rank_bucket: number;
};

const RANK_DESCRIPTIONS: Record<number, string> = {
  1: 'Visited and on a curated list',
  2: 'Visited and on a saved list',
  3: 'Visited',
  4: 'UNESCO World Heritage, unvisited',
  5: 'On a curated list, unvisited',
  6: 'On a saved list, unvisited',
  7: 'Other',
};

function rankBucket(p: {
  visited: boolean;
  unesco_id: number | null;
  curated_lists_len: number;
  saved_lists_len: number;
}): number {
  if (p.visited && p.curated_lists_len > 0) return 1;
  if (p.visited && p.saved_lists_len > 0) return 2;
  if (p.visited) return 3;
  if (p.unesco_id != null) return 4;
  if (p.curated_lists_len > 0) return 5;
  if (p.saved_lists_len > 0) return 6;
  return 7;
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL or key in env (.env.local).');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const PAGE_SIZE = 1000;
  const all: ThinPin[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('pins')
      .select(
        'id, slug, name, city_names, states_names, kind, visited, unesco_id, unesco_url, wikipedia_url, atlas_obscura_slug, lists, saved_lists, description, google_place_url',
      )
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('Supabase fetch failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const r of data) {
      const desc = (r.description as string | null) ?? '';
      const len = desc.length;
      if (len > 100) continue;

      const visited = !!r.visited;
      const curated_lists: string[] = Array.isArray(r.lists) ? r.lists : [];
      const saved_lists: string[] = Array.isArray(r.saved_lists) ? r.saved_lists : [];
      const unesco_id = (r.unesco_id as number | null) ?? null;

      all.push({
        id: r.id as string,
        slug: (r.slug as string | null) ?? null,
        name: r.name as string,
        city: Array.isArray(r.city_names) ? r.city_names[0] ?? null : null,
        country: Array.isArray(r.states_names) ? r.states_names[0] ?? null : null,
        kind: (r.kind as string | null) ?? null,
        visited,
        unesco_id,
        unesco_url: (r.unesco_url as string | null) ?? null,
        wikipedia_url: (r.wikipedia_url as string | null) ?? null,
        atlas_obscura_slug: (r.atlas_obscura_slug as string | null) ?? null,
        curated_lists,
        saved_lists,
        description: desc.length > 0 ? desc : null,
        description_length: len,
        google_place_url: (r.google_place_url as string | null) ?? null,
        rank_bucket: rankBucket({
          visited,
          unesco_id,
          curated_lists_len: curated_lists.length,
          saved_lists_len: saved_lists.length,
        }),
      });
    }
    if (data.length < PAGE_SIZE) break;
  }

  all.sort((a, b) => {
    if (a.rank_bucket !== b.rank_bucket) return a.rank_bucket - b.rank_bucket;
    if (a.description_length !== b.description_length) {
      return a.description_length - b.description_length;
    }
    return a.name.localeCompare(b.name);
  });

  const limited = limit != null ? all.slice(0, limit) : all;

  const outDir = path.resolve(process.cwd(), 'scripts/output');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'thin-pin-descriptions.json');
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_thin_pins: all.length,
        emitted: limited.length,
        rank_buckets: RANK_DESCRIPTIONS,
        bucket_counts: Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7].map(r => [
            r,
            all.filter(p => p.rank_bucket === r).length,
          ]),
        ),
        pins: limited,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Wrote ${limited.length} thin pins to ${outPath}`);
  console.log('Bucket counts:');
  for (const bucket of [1, 2, 3, 4, 5, 6, 7]) {
    const count = all.filter(p => p.rank_bucket === bucket).length;
    console.log(`  ${bucket} (${RANK_DESCRIPTIONS[bucket]}): ${count}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
