import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  fetchCityBySlug,
  fetchCountryById,
} from '@/lib/notion';
import { fetchPinsForLists } from '@/lib/pins';
import {
  fetchAllSavedListsMeta,
  listsMatchingPlace,
  snippet,
} from '@/lib/savedLists';
import { readPlaceContent, paragraphs } from '@/lib/content';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  AUTHOR_ID,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
  clip,
} from '@/lib/seo';

// === /cities/[slug]/things-to-do ===========================================
// Long-tail SEO surface: people search "things to do in <city>" more than
// they search the city name alone. The city detail page at /cities/[slug]
// covers climate, currency, language, and the saved-list section all
// together; this page is deliberately narrower — pins only, with brief
// editorial framing — so it competes specifically for the planning
// query without diluting the parent page.
//
// Content rule: the page is indexable only when the city has at least 4
// pins. Below that, the page renders for navigation but stays
// noindex,follow so we don't ship thin content to search.

type Props = { params: Promise<{ slug: string }> };

const MIN_INDEXABLE_PIN_COUNT = 4;
export const revalidate = 604800;

export async function generateStaticParams() {
  // Empty array → opt out of build-time prerender. /things-to-do follows
  // the same on-demand ISR pattern as /lists/[slug] for the same reason
  // (1,300+ city slugs would hammer Supabase concurrently at build).
  return [];
}

async function fetchData(slug: string) {
  const city = await fetchCityBySlug(slug);
  if (!city) return null;

  const [content, listsMeta, country] = await Promise.all([
    readPlaceContent('cities', slug),
    fetchAllSavedListsMeta(),
    city.countryPageId ? fetchCountryById(city.countryPageId) : Promise.resolve(null),
  ]);

  const allSavedListNames = Array.from(listsMeta.keys());
  const matchedLists = listsMatchingPlace(allSavedListNames, [city.name, slug]);
  const matchedSet = new Set(matchedLists);
  const cityPinsRaw = matchedLists.length === 0
    ? []
    : await fetchPinsForLists(matchedLists);

  // Same anchoring rule as /cities/[slug]: pin must be in this exact
  // city, and (when the city's country is known) in that country, so
  // collisions like Manchester UK / Manchester NH don't leak.
  const pins: SavedListPin[] = cityPinsRaw
    .filter(p => p.savedLists?.some(l => matchedSet.has(l)))
    .filter(p => (p.cityNames ?? []).includes(city.name))
    .filter(p => !country?.name || (p.statesNames ?? []).includes(country.name))
    .sort((a, b) => {
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      const ra = a.personalRating ?? 0;
      const rb = b.personalRating ?? 0;
      if (ra !== rb) return rb - ra;
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
      review: snippet(p.personalReview, 140),
      visitYear: p.visitYear,
      kind: p.kind ?? null,
      priceTier: p.priceTier ?? null,
      free: !!p.free,
      unesco: p.unescoId != null,
    }));

  return { city, country, content, pins };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const data = await fetchData(slug);
    if (!data) return { title: 'Not found' };
    const { city, pins } = data;

    const title = `Things to do in ${city.name}`;
    const description =
      pins.length === 0
        ? `Travel notes for ${city.name}. The atlas does not yet have curated pins for this city.`
        : `${pins.length} curated pins for ${city.name}: museums, viewpoints, neighborhoods, restaurants, and walks I have actually visited or planned around.`;

    const url = `${SITE_URL}/cities/${slug}/things-to-do`;
    const indexable = pins.length >= MIN_INDEXABLE_PIN_COUNT;

    return {
      title,
      description: clip(description, 155) ?? description,
      alternates: { canonical: url },
      robots: indexable ? undefined : { index: false, follow: true },
      openGraph: {
        type: 'article',
        title: `${title} · Mike Lee`,
        description,
        url,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} · Mike Lee`,
        description,
      },
    };
  } catch (err) {
    console.error('[/cities/[slug]/things-to-do] generateMetadata failed:', err);
    return { title: 'Things to do', robots: { index: false, follow: true } };
  }
}

export default async function ThingsToDoPage({ params }: Props) {
  const { slug } = await params;
  const data = await fetchData(slug);
  if (!data) notFound();
  const { city, country, content, pins } = data;

  const url = `${SITE_URL}/cities/${slug}/things-to-do`;
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Cities', item: `${SITE_URL}/cities/cards` },
    { name: city.name, item: `${SITE_URL}/cities/${slug}` },
    { name: 'Things to do' },
  ]);

  const collection = collectionJsonLd({
    url,
    name: `Things to do in ${city.name}`,
    description: `Curated pins for ${city.name} from Mike Lee's travel atlas.`,
    totalItems: pins.length,
    items: pins.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
  });

  // Article schema only when the page has both pins AND editorial intro
  // — together they signal a real piece of writing, not a thin landing.
  const article = pins.length >= MIN_INDEXABLE_PIN_COUNT
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: `Things to do in ${city.name}`,
        description: `${pins.length} curated pins for ${city.name}.`,
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
        <Link href="/cities/cards" className="hover:text-teal">Cities</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <Link href={`/cities/${slug}`} className="hover:text-teal">{city.name}</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep">Things to do</span>
      </nav>

      <header className="mb-8 max-w-prose">
        <h1 className="text-h1 text-ink-deep leading-tight">
          Things to do in {city.name}
        </h1>
        {country && (
          <p className="mt-2 text-prose text-slate leading-snug">
            {country.name}
            {country.continent ? `, ${country.continent}` : ''}
          </p>
        )}

        {pins.length === 0 ? (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            The atlas does not yet have curated pins for {city.name}. The{' '}
            <Link
              href={`/cities/${slug}`}
              className="text-teal hover:underline"
            >
              {city.name} city page
            </Link>{' '}
            still has facts, climate, and notes if any are filled in.
          </p>
        ) : (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            What follows is a working list of {pins.length} pins for{' '}
            {city.name}: museums, viewpoints, neighborhoods, gardens,
            restaurants, and walks. Visited entries lead, then rated
            recommendations, then everything else. Click any card for the
            review, hours, and how I would fit it into a day. The{' '}
            <Link
              href={`/cities/${slug}`}
              className="text-teal hover:underline"
            >
              {city.name} city page
            </Link>{' '}
            holds the rest of the orientation: climate, language,
            currency, transit, the local quirks worth knowing before you
            go.
          </p>
        )}

        {/* When a /content/cities/<slug>.md exists, run its first
            paragraph as a brief contextual lede so the page reads as
            editorial rather than a bare list. Subsequent paragraphs
            stay on the city detail page; we don't double-render the
            whole article here. */}
        {content && (() => {
          const firstPara = paragraphs(content.body)[0];
          return firstPara ? (
            <p className="mt-4 text-prose text-ink leading-relaxed">
              {firstPara}
            </p>
          ) : null;
        })()}
      </header>

      {pins.length > 0 && (
        <SavedListSection
          title={`Pins in ${city.name}`}
          listSlug={null}
          googleShareUrl={null}
          pins={pins}
          pageSize={48}
          showSort
          initialSort="rated"
        />
      )}
    </article>
  );
}
