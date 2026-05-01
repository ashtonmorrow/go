import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { listNameToSlug } from '@/lib/savedLists';
import { SITE_URL } from '@/lib/seo';

// === /lists ================================================================
// Index of every saved-list Mike has imported from his Google Maps Takeout.
// Each list links to /lists/<slug> showing the pins on that list. Sorted by
// member count desc so the most-used lists surface first; ties break
// alphabetical for stable order across reloads.

export const metadata: Metadata = {
  title: 'My saved lists',
  description:
    'Mike’s personal Google Maps saved lists — places grouped by city, theme, and intent. Originally curated in Google Maps, now first-party here.',
  alternates: { canonical: `${SITE_URL}/lists` },
};

export const revalidate = 3600;

export default async function ListsIndex() {
  const pins = await fetchAllPins();

  // Aggregate distinct saved-list names + member counts. Drop entirely-empty
  // lists (defensive — shouldn't happen since we only insert when a pin
  // claims membership).
  const counts = new Map<string, number>();
  for (const p of pins) {
    for (const name of p.savedLists ?? []) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const lists = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, slug: listNameToSlug(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">My lists</h1>
        <p className="mt-3 text-slate max-w-prose">
          Personal Google Maps collections, exported and re-rendered here.
          Each list groups places I&rsquo;ve saved for a city, a theme, or a
          trip. Click through to see what made the cut.
        </p>
        <p className="mt-2 text-small text-muted">
          {lists.length} {lists.length === 1 ? 'list' : 'lists'} ·{' '}
          {lists.reduce((n, l) => n + l.count, 0)} total memberships
        </p>
      </header>

      {lists.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No saved lists yet — the import hasn&rsquo;t been run.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {lists.map(l => (
            <li key={l.slug}>
              <Link
                href={`/lists/${l.slug}`}
                className="block card p-3.5 hover:shadow-paper transition-shadow"
              >
                <h2 className="text-ink-deep font-medium leading-tight capitalize truncate">
                  {l.name}
                </h2>
                <p className="mt-1 text-label text-muted tabular-nums">
                  {l.count} {l.count === 1 ? 'pin' : 'pins'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
