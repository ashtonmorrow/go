// === /admin/lists/[slug] ===================================================
// Member editor for a single saved list. Shows the list's metadata header,
// then a searchable, toggleable roster of every pin: members are pre-checked,
// non-members can be added with a click. The same control flips a member
// off the list. The pin itself is never modified beyond its saved_lists
// array — same contract as the existing rename/delete admin actions.
//
// Render strategy:
//   * Server pulls the full pin set + the list metadata once. The client
//     gets a slim {id, name, city, country, isMember} array — about 100
//     bytes per row. With 5k pins that's <500 KB shipped, fine for an
//     admin-only page.
//   * Client filters by name/city in memory and shows a virtualized-feel
//     "first N + load more" list so the initial render isn't 5,000 DOM
//     nodes.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchAllPins } from '@/lib/pins';
import {
  fetchAllSavedListsMeta,
  listNameToSlug,
  slugToListName,
} from '@/lib/savedLists';
import ListDetailClient, { type ListDetailPin } from './ListDetailClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function findList(slug: string) {
  const [pins, listsMeta] = await Promise.all([
    fetchAllPins(),
    fetchAllSavedListsMeta(),
  ]);
  // Build the union of names from pins + metadata so newly-created empty
  // lists are reachable via /admin/lists/<slug>.
  const allNames = new Set<string>(listsMeta.keys());
  for (const p of pins) for (const l of p.savedLists ?? []) allNames.add(l);

  const candidate = slugToListName(slug);
  if (allNames.has(candidate)) return { name: candidate, pins, listsMeta };
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, pins, listsMeta };
  }
  return null;
}

export default async function ListDetailAdminPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;

  // Slim each pin to what the editor actually needs. The full Pin would
  // ship 30 KB-ish per row; the editor only renders a name + city/country
  // line and a checkbox.
  // `isDraft` is a heuristic for the saved-list-import pins that arrived
  // without coords or geo — they're useful to surface in the editor (the
  // admin can add/remove them from any list) but worth visually flagging
  // so they aren't confused with curated pins.
  const rows: ListDetailPin[] = found.pins.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    city: p.cityNames?.[0] ?? null,
    country: p.statesNames?.[0] ?? null,
    visited: p.visited,
    isDraft:
      p.lat == null && p.lng == null &&
      (p.cityNames?.length ?? 0) === 0 &&
      (p.statesNames?.length ?? 0) === 0,
    isMember: (p.savedLists ?? []).includes(found.name),
  }));

  // Members at top, then by name ascending. Pin sort is stable across
  // page renders so the checkbox positions don't shuffle when the user
  // toggles state.
  rows.sort((a, b) => {
    if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const memberCount = rows.filter(r => r.isMember).length;

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/admin/lists" className="hover:text-teal">Saved lists admin</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{found.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight capitalize">{found.name}</h1>
        <p className="mt-2 text-small text-muted tabular-nums">
          {memberCount} {memberCount === 1 ? 'pin' : 'pins'} on this list
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-label">
          <Link
            href={`/lists/${listNameToSlug(found.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            View public page ↗
          </Link>
          {meta?.googleShareUrl && (
            <a
              href={meta.googleShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View live on Google Maps ↗
            </a>
          )}
          <Link href="/admin/lists" className="text-slate hover:text-ink-deep">
            ← Back to all lists
          </Link>
        </div>
      </header>

      <ListDetailClient listName={found.name} initialRows={rows} />
    </div>
  );
}
