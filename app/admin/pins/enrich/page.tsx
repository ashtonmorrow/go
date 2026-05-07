import { supabaseAdmin } from '@/lib/supabaseAdmin';
import EnrichDescriptionsClient, { type ThinPinRow } from './EnrichDescriptionsClient';

// === /admin/pins/enrich ====================================================
// Bulk enrichment workspace for pins with thin descriptions. Uses the
// same rank logic as scripts/audit-thin-pin-descriptions.ts:
//   1. Visited + on a curated list (UNESCO, AO, ...)
//   2. Visited + on a saved list
//   3. Visited only
//   4. UNESCO unvisited
//   5. On a curated list, unvisited
//   6. On a saved list, unvisited
//   7. Everything else
//
// "Thin" = description is null, empty, or ≤100 characters.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANK_DESCRIPTIONS: Record<number, string> = {
  1: 'Visited + curated list',
  2: 'Visited + saved list',
  3: 'Visited',
  4: 'UNESCO, unvisited',
  5: 'Curated list, unvisited',
  6: 'Saved list, unvisited',
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

export default async function EnrichDescriptionsPage() {
  const sb = supabaseAdmin();
  const PAGE_SIZE = 1000;
  const all: ThinPinRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('pins')
      .select(
        'id, slug, name, city_names, states_names, kind, visited, ' +
        'unesco_id, unesco_url, wikipedia_url, atlas_obscura_slug, ' +
        'lists, saved_lists, description',
      )
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    // Wide selects narrow per-cell to GenericStringError in supabase-js;
    // double-cast through unknown matches the lib/savedLists pattern.
    const rowsAny = data as unknown as Record<string, unknown>[];
    for (const r of rowsAny) {
      const desc = (r.description as string | null) ?? '';
      const len = desc.length;
      if (len > 100) continue;
      const visited = !!r.visited;
      const curated = Array.isArray(r.lists) ? (r.lists as string[]) : [];
      const saved = Array.isArray(r.saved_lists) ? (r.saved_lists as string[]) : [];
      const unescoId = (r.unesco_id as number | null) ?? null;
      all.push({
        id: r.id as string,
        slug: (r.slug as string | null) ?? null,
        name: r.name as string,
        city: Array.isArray(r.city_names) ? r.city_names[0] ?? null : null,
        country: Array.isArray(r.states_names) ? r.states_names[0] ?? null : null,
        kind: (r.kind as string | null) ?? null,
        visited,
        unescoId,
        unescoUrl: (r.unesco_url as string | null) ?? null,
        wikipediaUrl: (r.wikipedia_url as string | null) ?? null,
        atlasObscuraSlug: (r.atlas_obscura_slug as string | null) ?? null,
        curatedLists: curated,
        savedLists: saved,
        description: desc.length > 0 ? desc : null,
        descriptionLength: len,
        rankBucket: rankBucket({
          visited,
          unesco_id: unescoId,
          curated_lists_len: curated.length,
          saved_lists_len: saved.length,
        }),
      });
    }
    if (data.length < PAGE_SIZE) break;
  }

  all.sort((a, b) => {
    if (a.rankBucket !== b.rankBucket) return a.rankBucket - b.rankBucket;
    if (a.descriptionLength !== b.descriptionLength) {
      return a.descriptionLength - b.descriptionLength;
    }
    return a.name.localeCompare(b.name);
  });

  const bucketCounts: Record<number, number> = {};
  for (const r of all) bucketCounts[r.rankBucket] = (bucketCounts[r.rankBucket] ?? 0) + 1;

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Enrich pin descriptions</h1>
      <p className="text-small text-muted mb-3 max-w-2xl leading-relaxed">
        Pins with descriptions of 100 characters or fewer, ranked by how
        much traffic they likely get. Click <strong>Generate</strong> to
        ask Gemini for a 60-130 word factual description, edit if needed,
        then <strong>Save</strong> to write it back. Working through this
        queue lifts pins out of the noindex floor on /pins/[slug].
      </p>
      <p className="text-label text-muted mb-6">
        Total thin pins: <strong>{all.length}</strong>.{' '}
        {Object.entries(RANK_DESCRIPTIONS).map(([n, label]) => {
          const c = bucketCounts[Number(n)] ?? 0;
          return (
            <span key={n} className="mr-3">
              {label}: <strong className="tabular-nums">{c}</strong>
            </span>
          );
        })}
      </p>
      <EnrichDescriptionsClient initialRows={all} rankLabels={RANK_DESCRIPTIONS} />
    </div>
  );
}
