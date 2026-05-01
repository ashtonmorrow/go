import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import {
  listNameToSlug,
  slugToListName,
  fetchAllSavedListsMeta,
} from '@/lib/savedLists';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  AUTHOR_ID,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
} from '@/lib/seo';
import { readPlaceContent, paragraphs } from '@/lib/content';

// === /lists/[slug] =========================================================
// Public list detail page. The dedicated home for one of Mike's saved lists.
// Pulls every pin whose savedLists[] array includes this list name and renders
// them as a rich card grid with a sort dropdown.
//
// What lives here that doesn't on the embedded city/country sections:
//   * Editorial intro from content/lists/<slug>.md (when present).
//   * Anchor link to a city / country whose name matches this list.
//   * Stats line (visited %, avg rating, # reviewed, free/UNESCO counts).
//   * Sort dropdown — defaults to "Reviewed first" so the most useful cards
//     surface immediately.
//
// SEO: Article schema (the editorial intro is the headline) plus
// CollectionPage / ItemList carrying every pin on the list. Each pin
// contributes a ListItem so search engines can read the membership directly.

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
  // Also accept names that exist as metadata-only (empty list created in
  // /admin/lists). Users may navigate to those before adding members.
  for (const name of listsMeta.keys()) allNames.add(name);

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
  const meta = found.listsMeta.get(found.name) ?? null;
  // Prefer the metadata description for the meta tag — it's the curator's
  // own framing. Fall back to a generic line so we never ship an empty.
  const description =
    meta?.description ??
    `Pins on Mike's ${title} list — curated travel saves, mirrored from Google Maps with personal reviews.`;
  return {
    title,
    description,
    alternates: { canonical: `/lists/${slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
    },
  };
}

export const revalidate = 3600;

/** Truncate a personal-review snippet to roughly the first sentence-or-two so
 *  it fits two lines in a card without running long. The card itself
 *  line-clamps; this just trims the payload so we don't ship 800-character
 *  reviews to every card on a 184-pin Barcelona list. */
function reviewSnippet(text: string | null, max = 140): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  // Try to break at the first sentence boundary, otherwise word boundary.
  const sentence = t.slice(0, max).match(/^.+?[.!?](?=\s|$)/);
  if (sentence) return sentence[0];
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

export default async function ListPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;
  const titleCase = found.name.replace(/\b\w/g, c => c.toUpperCase());

  // City / country anchor detection — when the list name exactly matches a
  // known city or country name, surface a clear link in the header so the
  // reader can pivot to the place page. Both fetchers are cached at the
  // module level so this doesn't add a network round-trip.
  // Editorial intro is read at the same time so the page is one Promise.all.
  const [cities, countries, content] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    readPlaceContent('lists', slug),
  ]);
  const lcName = found.name.toLowerCase();
  const cityMatch = cities.find(c => c.name.toLowerCase() === lcName) ?? null;
  // Country slugs are usually already lowercase, names are not.
  const countryMatch = countryByName(countries, lcName);

  // Pins on this exact list. The component handles sorting client-side via
  // the sort dropdown; we still pass an alphabetical default so SSR HTML is
  // stable and accessible without JS. The 'rated' default lives in the
  // SavedListSection's initialSort prop.
  const onListPins = found.pins
    .filter(p => p.savedLists?.includes(found.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const onList: SavedListPin[] = onListPins.map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    visited: p.visited,
    cover: p.images?.[0]?.url ?? null,
    city: p.cityNames?.[0] ?? null,
    country: p.statesNames?.[0] ?? null,
    rating: p.personalRating,
    review: reviewSnippet(p.personalReview),
    visitYear: p.visitYear,
    free: !!p.free,
    unesco: p.unescoId != null,
  }));

  // Stats — only the non-zero ones render. Avg rating is over rated pins
  // only so an empty list with no ratings doesn't show "0.0 stars".
  const visitedCount = onList.filter(p => p.visited).length;
  const reviewedCount = onList.filter(p => p.review).length;
  const ratedPins = onList.filter(p => p.rating != null && p.rating > 0);
  const avgRating = ratedPins.length
    ? ratedPins.reduce((acc, p) => acc + (p.rating ?? 0), 0) / ratedPins.length
    : null;
  const freeCount = onList.filter(p => p.free).length;
  const unescoCount = onList.filter(p => p.unesco).length;

  const url = `${SITE_URL}/lists/${slug}`;
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Lists', item: `${SITE_URL}/lists` },
    { name: titleCase },
  ]);
  const collection = collectionJsonLd({
    url,
    name: titleCase,
    description:
      meta?.description ??
      `${onList.length} ${onList.length === 1 ? 'pin' : 'pins'} on Mike's ${titleCase} list.`,
    totalItems: onList.length,
    items: onList.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
  });
  // Article schema only when there's editorial intro — generic CollectionPage
  // is enough for membership-only lists.
  const article = content
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: titleCase,
        description: meta?.description ?? `Mike's ${titleCase} list.`,
        author: { '@id': AUTHOR_ID },
        publisher: { '@id': AUTHOR_ID },
        isPartOf: { '@id': WEBSITE_ID },
        inLanguage: 'en-US',
      }
    : null;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={breadcrumb} />
      <JsonLd data={collection} />
      {article && <JsonLd data={article} />}

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/lists" className="hover:text-teal">Lists</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{titleCase}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none capitalize">
          {titleCase}
        </h1>

        {/* Anchor link — only renders for lists named after a city or country
            that exists in the atlas. Lets a traveler hop from a Barcelona
            list straight to the Barcelona detail page. */}
        {(cityMatch || countryMatch) && (
          <p className="mt-3 text-small text-slate">
            {cityMatch && (
              <Link
                href={`/cities/${cityMatch.slug}`}
                className="inline-flex items-center gap-1 text-teal hover:underline"
              >
                <span aria-hidden>📮</span>
                <span>See {cityMatch.name} city page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
            {countryMatch && (
              <Link
                href={`/countries/${countryMatch.slug}`}
                className="inline-flex items-center gap-1 text-teal hover:underline ml-3"
              >
                <span aria-hidden>🌍</span>
                <span>See {countryMatch.name} country page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </p>
        )}

        {meta?.description && (
          <p className="mt-3 text-prose text-slate max-w-prose">{meta.description}</p>
        )}

        {/* Editorial intro — markdown-friendly prose lives at
            content/lists/<slug>.md. Shows above the cards when present. */}
        {content && (
          <div className="mt-4 post-prose max-w-prose">
            {paragraphs(content.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {/* Stats row — only emits items that are non-zero so a list with
            no reviews doesn't show "0 reviewed". Tabular nums keep the
            counts aligned across the row when the user re-sorts. */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small text-slate tabular-nums">
          <span>
            <strong className="text-ink-deep">{onList.length}</strong>
            {' '}{onList.length === 1 ? 'pin' : 'pins'}
          </span>
          {visitedCount > 0 && (
            <span>
              <strong className="text-ink-deep">{visitedCount}</strong> visited
            </span>
          )}
          {reviewedCount > 0 && (
            <span>
              <strong className="text-ink-deep">{reviewedCount}</strong> reviewed
            </span>
          )}
          {avgRating != null && (
            <span>
              <strong className="text-ink-deep">{avgRating.toFixed(1)}</strong>
              <span className="text-muted">&nbsp;avg ⭐</span>
            </span>
          )}
          {freeCount > 0 && (
            <span>
              <strong className="text-ink-deep">{freeCount}</strong> free
            </span>
          )}
          {unescoCount > 0 && (
            <span>
              <strong className="text-ink-deep">{unescoCount}</strong> UNESCO
            </span>
          )}
        </div>

        {/* Promoted CTA — Open the live Google Maps list in a new tab.
            Larger and more visible than the small text link the embedded
            city/country sections render, because here it's the primary
            action a traveler will take after skimming the cards. */}
        {meta?.googleShareUrl && (
          <a
            href={meta.googleShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded border border-sand bg-white text-small text-accent hover:border-accent hover:bg-cream-soft transition-colors"
          >
            <span aria-hidden>📍</span>
            Open in Google Maps
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
        // Reusing SavedListSection here means the card grid, sort, and
        // pagination semantics stay identical to the city/country embeds.
        // showSort is on for the dedicated page (we have the room); the
        // city/country embeds keep it off to stay compact. initialSort is
        // 'rated' so the cards with reviews + ratings surface first.
        <SavedListSection
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
          showSort
          initialSort="rated"
        />
      )}
    </article>
  );
}

/** Lookup helper kept inline because countries' names are stored mixed-case
 *  (United States, Côte d'Ivoire) but list names normalize to lowercase, so
 *  a straight Map<name, slug> miss is common. Doing the case-fold per call
 *  is fine — there are 226 countries and this runs once per request. */
function countryByName(
  countries: { name: string; slug: string }[],
  lcName: string,
) {
  const exact = countries.find(c => c.name.toLowerCase() === lcName);
  if (exact) return exact;
  // Common alias: "usa" / "uk" / "uae" should still link through.
  const aliases: Record<string, string> = {
    usa: 'united states',
    'u.s.a.': 'united states',
    us: 'united states',
    uk: 'united kingdom',
    'u.k.': 'united kingdom',
    uae: 'united arab emirates',
  };
  const alias = aliases[lcName];
  if (alias) {
    return countries.find(c => c.name.toLowerCase() === alias) ?? null;
  }
  return null;
}
