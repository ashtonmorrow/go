import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPinsForLists } from '@/lib/pins';
import {
  fetchCityByName,
  fetchCountryByName,
  fetchCityBySlug,
  fetchCountryBySlug,
} from '@/lib/notion';
import {
  listNameToSlug,
  slugToListName,
  fetchAllSavedListsMeta,
} from '@/lib/savedLists';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import ListMapAndCards from '@/components/ListMapAndCardsLoader';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  AUTHOR_ID,
  AUTHOR_NAME,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
} from '@/lib/seo';
import { readListContent, type ListFaq } from '@/lib/content';
import { getPost, getPostsForScope } from '@/lib/posts';
import GuideCardsBlock from '@/components/list-blocks/GuideCardsBlock';
import FaqBlock from '@/components/list-blocks/FaqBlock';
import RouteMapBlock from '@/components/list-blocks/RouteMapBlock';
import RelatedStrip, { type RelatedItem } from '@/components/list-blocks/RelatedStrip';

// === /lists/[slug] =========================================================
// Public list detail page. Composes from a small library of opt-in content
// blocks declared in the list's markdown frontmatter:
//
//   route_map: <key>      → renders a styled MapLibre route map (geometry
//                            looked up in lib/listRouteMaps)
//   guide_cards: {...}    → "How I would use this" two-column card grid
//   faqs: [...]           → Q&A block + FAQPage JSON-LD for rich results
//   related: {...}        → cross-link strip at page bottom (city / country
//                            / posts that mention this list)
//
// Lists without a content file fall back to the lean default: meta
// description from the saved-lists table + the pin grid. Adding a
// /content/lists/<slug>.md with any of the blocks above lights them up
// without a code change. See content/lists/kusttram-stations.md for a
// fully-loaded example.

type Props = { params: Promise<{ slug: string }> };

async function findList(slug: string) {
  // Resolve slug → list name. The metadata table holds every list name
  // (seeded after every saved-list import + create), so the common path
  // doesn't walk the pin corpus.
  const listsMeta = await fetchAllSavedListsMeta();
  const allNames = new Set<string>(listsMeta.keys());

  const candidate = slugToListName(slug);
  if (allNames.has(candidate)) return { name: candidate, listsMeta };
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, listsMeta };
  }
  // Fallback: the meta table may have drifted out of sync with what's
  // referenced in pins.saved_lists. Probe pins.saved_lists for the
  // candidate name; if any pin references this list, render the page
  // and synthesize a meta entry on the fly.
  if (await pinsReferenceList(candidate)) {
    listsMeta.set(candidate, {
      name: candidate,
      googleShareUrl: null,
      description: null,
      coverPinId: null,
      coverPhotoId: null,
      coverPhotoUrl: null,
      pinOrder: [],
      updatedAt: null,
    });
    return { name: candidate, listsMeta };
  }
  return null;
}

/** Cheap server-side existence check via .limit(1) — never loads the
 *  full pin corpus. */
async function pinsReferenceList(name: string): Promise<boolean> {
  if (!name) return false;
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('pins')
    .select('id')
    .overlaps('saved_lists', [name])
    .limit(1);
  if (error) {
    console.error('[lists/[slug]] pinsReferenceList probe failed:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function generateStaticParams() {
  // Empty array → opt out of build-time prerender. Lists render on first
  // request and cache for `revalidate` seconds afterward. The metadata
  // table holds 150+ slugs and pre-rendering them all at build time
  // hammers Supabase concurrently. On-demand ISR scales gracefully.
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) return { title: 'List not found' };
  const content = await readListContent(slug);
  const titleCase = found.name.replace(/\b\w/g, c => c.toUpperCase());
  const title = content?.title ?? titleCase;
  const url = `${SITE_URL}/lists/${slug}`;
  const meta = found.listsMeta.get(found.name) ?? null;
  // Description preference: frontmatter > saved-list meta > generic.
  const description =
    content?.description ??
    meta?.description ??
    `Pins on Mike's ${titleCase} list — curated travel saves, mirrored from Google Maps with personal reviews.`;
  return {
    title,
    description,
    alternates: { canonical: `/lists/${slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      ...(content?.heroImage ? { images: [{ url: content.heroImage }] } : {}),
      ...(content?.published ? { publishedTime: content.published } : {}),
      ...(content?.updated ? { modifiedTime: content.updated } : {}),
      ...(content && content.authors.length > 0 ? { authors: content.authors } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(content?.heroImage ? { images: [content.heroImage] } : {}),
    },
  };
}

export const revalidate = 3600;

/** Trim a personal-review snippet to roughly the first sentence-or-two. */
function reviewSnippet(text: string | null, max = 140): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const sentence = t.slice(0, max).match(/^.+?[.!?](?=\s|$)/);
  if (sentence) return sentence[0];
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/** Generic FAQPage JSON-LD builder. Any list that ships a `faqs:` block
 *  in its frontmatter gets a rich-result-eligible Q&A schema. */
function faqJsonLd(url: string, items: ListFaq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#quick-answers`,
    mainEntity: items.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export default async function ListPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;

  // Editorial intro + city/country anchor lookups + the pin slice for this
  // list, all in one Promise.all. Frontmatter `related.city` / `related.country`
  // override the auto-detected anchors; if absent, we match by list name.
  const [content, listPins] = await Promise.all([
    readListContent(slug),
    fetchPinsForLists([found.name]),
  ]);

  const titleCase = content?.title ?? found.name.replace(/\b\w/g, c => c.toUpperCase());
  const description = content?.description ?? meta?.description ?? null;

  // Resolve anchor city/country. Frontmatter slugs win when set; otherwise
  // fall back to name-matching the list against existing places.
  const [cityMatch, countryMatch] = await Promise.all([
    content?.related.city
      ? fetchCityBySlug(content.related.city)
      : fetchCityByName(found.name),
    content?.related.country
      ? fetchCountryBySlug(content.related.country)
      : fetchCountryByName(countryLookupName(found.name)),
  ]);

  // Posts that mention this list — frontmatter explicit list + auto-discovery
  // via post.links.lists reverse lookup. Dedupe by slug.
  const explicitPostSlugs = content?.related.posts ?? [];
  const autoPosts = await getPostsForScope('lists', slug);
  const explicitPosts = await Promise.all(explicitPostSlugs.map(s => getPost(s)));
  const seenPostSlugs = new Set<string>();
  const allPosts = [...explicitPosts, ...autoPosts]
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter(p => {
      if (seenPostSlugs.has(p.slug)) return false;
      seenPostSlugs.add(p.slug);
      return true;
    });

  // Pin sort: honour curated pin_order from saved-list meta, then alpha.
  const orderIndex = new Map<string, number>();
  (meta?.pinOrder ?? []).forEach((id, i) => orderIndex.set(id, i));
  const onListPins = listPins.slice().sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

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
    kind: p.kind ?? null,
    priceTier: p.priceTier ?? null,
    free: !!p.free,
    unesco: p.unescoId != null,
    lat: p.lat,
    lng: p.lng,
  }));

  // === Cover hero precedence ================================================
  // Frontmatter `hero_image` is the strongest signal — when present it wins
  // unconditionally so an editor can pick exactly the cover they want.
  // Otherwise fall through: curated saved-list cover photo > curated
  // cover pin > anchor city's personal photo > first visited pin's photo.
  const coverFromCurated = meta?.coverPhotoUrl ?? null;
  const coverFromPin = meta?.coverPinId
    ? listPins.find(p => p.id === meta.coverPinId)?.images?.[0]?.url ?? null
    : null;
  const coverFromCity = cityMatch ? cityMatch.personalPhoto ?? null : null;
  const coverFromPinPile = (() => {
    const visitedFirst = listPins
      .slice()
      .sort((a, b) => (a.visited === b.visited ? 0 : a.visited ? -1 : 1));
    for (const p of visitedFirst) {
      const url = p.images?.[0]?.url;
      if (url) return url;
    }
    return null;
  })();
  const coverUrl =
    content?.heroImage ?? coverFromCurated ?? coverFromPin ?? coverFromCity ?? coverFromPinPile;
  const coverAlt = content?.heroAlt ?? '';

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

  // CollectionPage / ItemList carrying every pin on the list.
  const collection = collectionJsonLd({
    url,
    name: titleCase,
    description:
      description ?? `${onList.length} ${onList.length === 1 ? 'pin' : 'pins'} on Mike's ${titleCase} list.`,
    totalItems: onList.length,
    items: onList.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
  });

  // Article schema upgrade — emit when the list has editorial content (body
  // or any block). Pulls dates / image / author from frontmatter so search
  // engines see the full authoritativeness signal.
  const article = content
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: titleCase,
        description: description ?? `Mike's ${titleCase} list.`,
        author: { '@id': AUTHOR_ID },
        publisher: { '@id': AUTHOR_ID },
        isPartOf: { '@id': WEBSITE_ID },
        inLanguage: 'en-US',
        ...(content.heroImage ? { image: content.heroImage } : {}),
        ...(content.published ? { datePublished: content.published } : {}),
        ...(content.updated ? { dateModified: content.updated } : {}),
      }
    : null;

  const faqs = content?.faqs ?? [];
  const guideCards = content?.guideCards ?? null;
  const routeMapKey = content?.routeMap ?? null;

  // Related strip — anchor city, anchor country, and any posts that link
  // here. Frontmatter explicit overrides come first via the resolved
  // matches above; auto-detection fills in.
  const relatedItems: RelatedItem[] = [];
  if (cityMatch) {
    relatedItems.push({
      href: `/cities/${cityMatch.slug}`,
      label: `${cityMatch.name} city page`,
      emoji: '📮',
    });
  }
  if (countryMatch) {
    relatedItems.push({
      href: `/countries/${countryMatch.slug}`,
      label: `${countryMatch.name} country page`,
      emoji: '🌍',
    });
  }
  for (const p of allPosts) {
    relatedItems.push({
      href: `/posts/${p.slug}`,
      label: p.navTitle ?? p.title,
      emoji: '📰',
    });
  }

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={breadcrumb} />
      <JsonLd data={collection} />
      {article && <JsonLd data={article} />}
      {faqs.length > 0 && <JsonLd data={faqJsonLd(url, faqs)} />}

      {/* Cover hero — only renders when the precedence chain finds an image. */}
      {coverUrl && (
        <div className="mb-5 relative aspect-[21/9] rounded-lg overflow-hidden bg-cream-soft border border-sand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={coverAlt}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/lists" className="hover:text-teal">Lists</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{titleCase}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight capitalize">
          {titleCase}
        </h1>

        {/* Lede: meta description sits directly under the title. text-prose
            (17px) keeps the visual hierarchy continuous from the 40px h1. */}
        {description && (
          <p className="mt-3 text-prose text-slate max-w-prose leading-snug">
            {description}
          </p>
        )}

        {/* Anchor links — promoted to text-prose so the type doesn't crash
            from h1 to label-size. */}
        {(cityMatch || countryMatch) && (
          <p className="mt-3 text-prose text-slate flex flex-wrap gap-x-5 gap-y-1">
            {cityMatch && (
              <Link
                href={`/cities/${cityMatch.slug}`}
                className="inline-flex items-center gap-1.5 text-teal hover:underline"
              >
                <span aria-hidden>📮</span>
                <span>See {cityMatch.name} city page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
            {countryMatch && (
              <Link
                href={`/countries/${countryMatch.slug}`}
                className="inline-flex items-center gap-1.5 text-teal hover:underline"
              >
                <span aria-hidden>🌍</span>
                <span>See {countryMatch.name} country page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </p>
        )}

        {/* Editorial body — rendered markdown via marked + post-prose so
            authors get headings, lists, links, blockquotes, etc. */}
        {content?.bodyHtml && (
          <div
            className="post-prose mt-5 max-w-prose"
            dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
          />
        )}

        {/* Opt-in blocks. Each one renders only when its frontmatter is
            present — adding a `faqs:` to a list's .md file lights up the
            FAQ block + FAQPage JSON-LD without any code change. */}
        {routeMapKey && (
          <div className="mt-8">
            <RouteMapBlock routeMapKey={routeMapKey} pins={onList} />
          </div>
        )}

        {guideCards && <GuideCardsBlock data={guideCards} />}

        {faqs.length > 0 && <FaqBlock items={faqs} />}

        {/* Stats row */}
        <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small text-slate tabular-nums">
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

        {/* "Open in Google Maps" CTA — primary action after skimming the cards. */}
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
      ) : routeMapKey ? (
        // RouteMap block already rendered above. Skip the duplicate
        // ListMapAndCards globe — that would put two maps on the page.
        <SavedListSection
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
          showSort
          initialSort="rated"
          pinOrder={meta?.pinOrder ?? []}
        />
      ) : (
        <ListMapAndCards
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
          showSort
          initialSort="rated"
          pinOrder={meta?.pinOrder ?? []}
        />
      )}

      <RelatedStrip items={relatedItems} />
    </article>
  );
}

function countryLookupName(name: string): string {
  const lcName = name.toLowerCase();
  const aliases: Record<string, string> = {
    usa: 'united states',
    'u.s.a.': 'united states',
    us: 'united states',
    uk: 'united kingdom',
    'u.k.': 'united kingdom',
    uae: 'united arab emirates',
  };
  return aliases[lcName] ?? name;
}
