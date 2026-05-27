import { fetchAllPins } from '@/lib/pins';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import ListsAdminClient from './ListsAdminClient';

export const dynamic = 'force-dynamic';

export default async function ListsAdminPage() {
  const [pins, listsMeta] = await Promise.all([
    fetchAllPins(),
    fetchAllSavedListsMeta(),
  ]);
  // Aggregate distinct list slugs + member counts for the admin table.
  // Then union with the metadata table so newly-created empty lists show
  // up too. Without this merge a freshly-created list would only appear
  // after at least one pin was attached to it.
  //
  // pins.saved_lists[] holds slugs (post-R2-migration), and listsMeta is
  // keyed by saved_lists.slug — both halves of the merge are slugs, so
  // the counts map keys cleanly across the union.
  const counts = new Map<string, number>();
  for (const p of pins) {
    for (const s of p.savedLists ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const s of listsMeta.keys()) {
    if (!counts.has(s)) counts.set(s, 0);
  }
  const lists = Array.from(counts.entries())
    .map(([slug, count]) => {
      const meta = listsMeta.get(slug);
      // coverDisplayUrl is what the inline thumbnail shows. Prefer the
      // direct cover_image_url (codex / city / country / Wikidata) when
      // set, then fall back to the personal-photo JOIN. cover_photo_id is
      // still passed through so the picker knows which tile to mark
      // "Current" for personal-photo selections.
      //
      // `name` is the display label from the meta row, falling back to
      // the slug for orphan entries that exist only in pins.saved_lists[].
      return {
        name: meta?.name ?? slug,
        slug,
        count,
        googleShareUrl: meta?.googleShareUrl ?? null,
        description: meta?.description ?? null,
        coverPhotoId: meta?.coverPhotoId ?? null,
        coverPhotoUrl: meta?.coverImageUrl ?? meta?.coverPhotoUrl ?? null,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight">Saved lists admin</h1>
        <p className="mt-2 text-small text-muted">
          Create new lists, rename or remove existing ones, and click into a
          list to edit which pins belong to it. The pin itself is never
          deleted; only its list membership changes.
        </p>
      </header>
      <ListsAdminClient initialLists={lists} />
    </div>
  );
}
