import { fetchAllPins } from '@/lib/pins';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import ListsAdminClient from './ListsAdminClient';

export const dynamic = 'force-dynamic';

export default async function ListsAdminPage() {
  const [pins, listsMeta] = await Promise.all([
    fetchAllPins(),
    fetchAllSavedListsMeta(),
  ]);
  // Aggregate distinct list names + member counts for the admin table, and
  // join in metadata (Google share URL, description) so the admin can see
  // and edit them inline.
  const counts = new Map<string, number>();
  for (const p of pins) {
    for (const l of p.savedLists ?? []) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const lists = Array.from(counts.entries())
    .map(([name, count]) => {
      const meta = listsMeta.get(name);
      return {
        name,
        count,
        googleShareUrl: meta?.googleShareUrl ?? null,
        description: meta?.description ?? null,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight">Saved lists admin</h1>
        <p className="mt-2 text-small text-muted">
          Rename lists across every pin that carries them, or remove a list
          entirely. The pin itself is never deleted; only the list membership
          changes.
        </p>
      </header>
      <ListsAdminClient initialLists={lists} />
    </div>
  );
}
