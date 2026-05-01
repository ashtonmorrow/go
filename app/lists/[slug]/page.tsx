import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchAllPins } from '@/lib/pins';
import { listNameToSlug, slugToListName } from '@/lib/savedLists';
import { thumbUrl } from '@/lib/imageUrl';
import { SITE_URL } from '@/lib/seo';

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
  const pins = await fetchAllPins();
  const allNames = new Set<string>();
  for (const p of pins) for (const l of p.savedLists ?? []) allNames.add(l);

  const candidate = slugToListName(slug);
  // Exact match first
  if (allNames.has(candidate)) return { name: candidate, pins };
  // Slug round-trip match (covers cases where list name has weird spacing)
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, pins };
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

  const onList = found.pins
    .filter(p => p.savedLists?.includes(found.name))
    .sort((a, b) => {
      // Visited first, then name. Visited gets a slight boost so the user
      // sees what they've actually been to up top.
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const visitedCount = onList.filter(p => p.visited).length;
  const titleCase = found.name.replace(/\b\w/g, c => c.toUpperCase());

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
        <p className="mt-2 text-small text-muted">
          {onList.length} {onList.length === 1 ? 'pin' : 'pins'}
          {visitedCount > 0 && (
            <> · {visitedCount} visited</>
          )}
        </p>
      </header>

      {onList.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No pins on this list yet.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {onList.map(p => {
            const cover = p.images?.[0]?.url ?? null;
            const country = p.statesNames?.[0] ?? null;
            const city = p.cityNames?.[0] ?? null;
            return (
              <li key={p.id}>
                <Link
                  href={p.slug ? `/pins/${p.slug}` : `/pins/${p.id}`}
                  className="block card overflow-hidden hover:shadow-paper transition-shadow"
                >
                  {cover ? (
                    <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl(cover, { size: 400 }) ?? cover}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      {p.visited && (
                        <span className="absolute top-2 right-2 pill bg-teal text-white text-micro">
                          ✓ Visited
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-[0.14em]">
                      No photo yet
                    </div>
                  )}
                  <div className="p-3">
                    <h2 className="text-ink-deep font-medium leading-tight truncate">
                      {p.name}
                    </h2>
                    {(city || country) && (
                      <p className="mt-0.5 text-label text-muted truncate">
                        {[city, country].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {p.personalRating != null && (
                      <p className="mt-1 text-label tabular-nums">
                        <span aria-hidden>{'⭐'.repeat(p.personalRating)}</span>
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
