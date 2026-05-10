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
import { readPlaceContent } from '@/lib/content';
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

// === /cities/[slug]/hotels =================================================
// Hotel-cluster SEO surface. Pairs with /cities/[slug]/things-to-do as the
// city's second long-tail landing: people search "best hotels in <city>",
// "where to stay in <city>", and "<city> hotels" much more than they
// search the city name alone. Each hotel pin already ships its own
// Schema.org Hotel + AggregateRating + Offer markup at /pins/<slug>; this
// page packages them as a curated cluster with editorial framing and an
// ItemList of Hotel items, which is what the Helpful Content Update
// rewards.
//
// Indexability gate: the page is indexable only when the city has at
// least MIN_INDEXABLE_HOTEL_COUNT hotels in the atlas. Below that, the
// page renders for navigation but stays noindex,follow so we do not ship
// thin clusters to search.

type Props = { params: Promise<{ slug: string }> };

const MIN_INDEXABLE_HOTEL_COUNT = 3;
export const revalidate = 604800;

export async function generateStaticParams() {
  // Empty array → opt out of build-time prerender. /hotels follows the
  // same on-demand ISR pattern as /things-to-do and /lists/[slug] for
  // the same reason: 1,300+ city slugs would hammer Supabase
  // concurrently at build.
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
  // collisions like Manchester UK / Manchester NH don't leak. Then
  // narrow to kind=hotel — that is what makes this the hotel cluster.
  const hotels: SavedListPin[] = cityPinsRaw
    .filter(p => p.savedLists?.some(l => matchedSet.has(l)))
    .filter(p => (p.cityNames ?? []).includes(city.name))
    .filter(p => !country?.name || (p.statesNames ?? []).includes(country.name))
    .filter(p => p.kind === 'hotel')
    .sort((a, b) => {
      // Visited stays lead (Mike has actually slept there).
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      // Then by personal rating, descending.
      const ra = a.personalRating ?? 0;
      const rb = b.personalRating ?? 0;
      if (ra !== rb) return rb - ra;
      // Then by hotel review presence (a written review is a stronger
      // signal of "Mike has thoughts on this" than a row with just a
      // star count).
      const reviewA = a.generatedReview ? 1 : 0;
      const reviewB = b.generatedReview ? 1 : 0;
      if (reviewA !== reviewB) return reviewB - reviewA;
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
      review: snippet(p.personalReview ?? p.generatedReview, 140),
      visitYear: p.visitYear,
      kind: p.kind ?? null,
      priceTier: p.priceTier ?? null,
      free: !!p.free,
      unesco: p.unescoId != null,
    }));

  return { city, country, content, hotels };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const data = await fetchData(slug);
    if (!data) return { title: 'Not found' };
    const { city, hotels } = data;

    const title = `Hotels in ${city.name}`;
    const description =
      hotels.length === 0
        ? `Hotel notes for ${city.name}. The atlas does not yet have hotel pins for this city.`
        : `${hotels.length} hotels in ${city.name} I have stayed at, with personal notes on rooms, breakfast, location, and the trade-offs that show up after the first night.`;

    const url = `${SITE_URL}/cities/${slug}/hotels`;
    const indexable = hotels.length >= MIN_INDEXABLE_HOTEL_COUNT;

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
    console.error('[/cities/[slug]/hotels] generateMetadata failed:', err);
    return { title: 'Hotels', robots: { index: false, follow: true } };
  }
}

export default async function HotelsPage({ params }: Props) {
  const { slug } = await params;
  const data = await fetchData(slug);
  if (!data) notFound();
  const { city, country, hotels } = data;

  const url = `${SITE_URL}/cities/${slug}/hotels`;
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Cities', item: `${SITE_URL}/cities/cards` },
    { name: city.name, item: `${SITE_URL}/cities/${slug}` },
    { name: 'Hotels' },
  ]);

  // ItemList of Hotel items — what gets a city like "best hotels in
  // Madrid" eligible for rich-result presentation. Each Hotel item
  // links to its detail page where the full Hotel + AggregateRating +
  // Offer markup lives.
  const collection = collectionJsonLd({
    url,
    name: `Hotels in ${city.name}`,
    description: `Hotels in ${city.name} from Mike Lee's travel atlas, with personal stay notes.`,
    totalItems: hotels.length,
    items: hotels.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
  });

  // Article schema only when the page has enough hotels AND a real
  // editorial frame around them. Without this guard, every hotel hub
  // would emit Article schema even for cities with one or two pins.
  const article = hotels.length >= MIN_INDEXABLE_HOTEL_COUNT
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: `Hotels in ${city.name}`,
        description: `${hotels.length} hotels in ${city.name} I have stayed at.`,
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
        <span className="text-ink-deep">Hotels</span>
      </nav>

      <header className="mb-8 max-w-prose">
        <h1 className="text-h1 text-ink-deep leading-tight">
          Hotels in {city.name}
        </h1>
        {country && (
          <p className="mt-2 text-prose text-slate leading-snug">
            {country.name}
            {country.continent ? `, ${country.continent}` : ''}
          </p>
        )}

        {hotels.length === 0 ? (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            I have not yet stayed at and reviewed any hotels in {city.name}.
            The{' '}
            <Link
              href={`/cities/${slug}`}
              className="text-teal hover:underline"
            >
              {city.name} city page
            </Link>{' '}
            still has facts, climate, and any notes filled in.
          </p>
        ) : (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            What follows is {hotels.length === 1 ? 'one hotel' : `${hotels.length} hotels`} in {city.name} I have actually stayed at, with personal notes
            on rooms, breakfast, location, and the trade-offs that show up
            after the first night. Visited stays lead, then star ratings,
            then everything else. Click any card for the full review,
            booking link, and area context. The{' '}
            <Link
              href={`/cities/${slug}`}
              className="text-teal hover:underline"
            >
              {city.name} city page
            </Link>{' '}
            holds the rest of the orientation if you have not picked an
            area yet.
          </p>
        )}
      </header>

      {hotels.length > 0 && (
        <SavedListSection
          title={`Hotels I have reviewed in ${city.name}`}
          listSlug={null}
          googleShareUrl={null}
          pins={hotels}
          pageSize={48}
          showSort={false}
          initialSort="rated"
        />
      )}
    </article>
  );
}
