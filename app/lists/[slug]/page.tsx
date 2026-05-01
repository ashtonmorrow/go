import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchAllPins } from '@/lib/pins';
import {
  listNameToSlug,
  slugToListName,
  fetchAllSavedListsMeta,
} from '@/lib/savedLists';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import { SITE_URL } from '@/lib/seo';
// thumbUrl previously rendered card thumbnails inline; now SavedListSection
// owns that path so the import isn't needed at the page level.

// === /lists/[slug] =========================================================
// Single saved-list detail page. Shows every pin whose savedLists[] array
// includes this list name, sorted by visited-first then name. Links to each
// pin's detail page. Same shape as /pins/cards but scoped to one collection.

type Props = { params: Promise<{ slug: string }> };

async function findList(slug: string) {
  // Resolve slug → list name by reverse-mapping then doing an exact match
  // against any name actually present in the data. We can't trust just
  // slug→name string transformation because a list called "São Paulo 🇧🇷"
  // gets stored as "sao paulo" and slugified to "sao-paulo"; the inverse
  // produces "sao paulo" (correct), but odd edge cases (a list named with
  // multiple consecutive spaces) would fall through. So we always validate
  // against the source set.
  const [pins, listsMeta] = await Promise.all([
    fetchAllPins(),
    fetchAllSavedListsMeta(),
  ]);
  const allNames = new Set<string>();
  for (const p of pins) for (const l of p.savedLists ?? []) allNames.add(l);

  const candidate = slugToListName(slug);
  if (allNames.has(candidate)) return { name: candidate, pins, listsMeta };
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, pins, listsMeta };
  }
  return null;
}

export async function generateStaticParams() {
  const pins = await fetchAllPins();
  const slugs = new Set<string>();
  for (const p of pins) {
    for (const l of p.savedLists ?? []) slugs.add(listNameToSlug(l));
  }
  return Array.from(slugs).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) return { title: 'List not found' };
  const title = found.name.replace(/\b\w/g, c => c.toUpperCase());
  const url = `${SITE_URL}/lists/${slug}`;
  return {
    title,
    description: `Pins on Mike's ${title} list — saved in Google Maps, mirrored here.`,
    alternates: { canonical: `/lists/${slug}` },
    openGraph: {
      title,
      type: 'website',
      url,
    },
  };
}

export const revalidate = 3600;

export default async function ListPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;
  const titleCase = found.name.replace(/\b\w/g, c => c.toUpperCase());

  // Pins on this exact list, mapped into the SavedListSection shape so we
  // can reuse the same paginated card grid + Google link the city/country
  // pages use. Visited float to top.
  const onList: SavedListPin[] = found.pins
    .filter(p => p.savedLists?.includes(found.name))
    .sort((a, b) => {
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      visited: p.visited,
      cover: p.images?.[0]?.url ?? null,
      city: p.cityNames?.[0] ?? null,
      country: p.statesNames?.[0] ?? null,
      rating: p.personalRating,
    }));

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/lists" className="hover:text-teal">Lists</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{titleCase}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none capitalize">
          {titleCase}
        </h1>
        {meta?.description && (
          <p className="mt-2 text-prose text-slate max-w-prose">{meta.description}</p>
        )}
        <p className="mt-2 text-small text-muted">
          {onList.length} {onList.length === 1 ? 'pin' : 'pins'}
          {onList.filter(p => p.visited).length > 0 && (
            <> · {onList.filter(p => p.visited).length} visited</>
          )}
        </p>
        {meta?.googleShareUrl && (
          <a
            href={meta.googleShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-small text-accent hover:underline"
          >
            View live on Google Maps
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        )}
      </header>

      {onList.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No pins on this list yet.
        </div>
      ) : (
        // Reusing SavedListSection here means the list page pagination,
        // empty-state, and footer-link semantics stay identical to the
        // city/country embeds. We pass a higher pageSize since the list
        // page is dedicated to one collection — load the room.
        <SavedListSection
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
        />
      )}
    </article>
  );
}
