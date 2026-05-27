import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchCityBySlug, fetchCountryById } from '@/lib/places';
import { fetchPinsForLists } from '@/lib/pins';
import {
  fetchAllSavedListsMeta,
  listsMatchingPlace,
  snippet,
} from '@/lib/savedLists';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import { SITE_URL } from '@/lib/seo';
import { cityHubMetadata, cityHubSchema, MIN_INDEXABLE_HOTEL_COUNT } from '@/lib/cityHub';
import CityHubShell from '@/components/CityHubShell';

// === /cities/[slug]/hotels =================================================
// Hotel-cluster SEO surface, the second long-tail landing alongside
// /cities/[slug]/things-to-do: "best hotels in <city>", "where to stay in
// <city>". Each hotel pin already ships Hotel + AggregateRating + Offer
// markup at /pins/<slug>; this packages them as a curated cluster.
//
// Indexable only when the city has at least MIN_INDEXABLE_HOTEL_COUNT
// hotels (defined in lib/cityHub.ts alongside the other gate constants).
// Shared metadata / JSON-LD / shell live in lib/cityHub.ts + CityHubShell.

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

async function fetchData(slug: string) {
  const city = await fetchCityBySlug(slug);
  if (!city) return null;

  const [listsMeta, country] = await Promise.all([
    fetchAllSavedListsMeta(),
    city.countryPageId ? fetchCountryById(city.countryPageId) : Promise.resolve(null),
  ]);

  const allSavedListNames = Array.from(listsMeta.keys());
  const matchedLists = listsMatchingPlace(allSavedListNames, [city.name, slug]);
  const matchedSet = new Set(matchedLists);
  const cityPinsRaw = matchedLists.length === 0
    ? []
    : await fetchPinsForLists(matchedLists);

  // Anchor to city AND country, then narrow to kind=hotel.
  const hotels: SavedListPin[] = cityPinsRaw
    .filter(p => p.savedLists?.some(l => matchedSet.has(l)))
    .filter(p => (p.cityNames ?? []).includes(city.name))
    .filter(p => !country?.name || (p.statesNames ?? []).includes(country.name))
    .filter(p => p.kind === 'hotel')
    .sort((a, b) => {
      // Visited stays lead, then personal rating, then review presence.
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      const ra = a.personalRating ?? 0;
      const rb = b.personalRating ?? 0;
      if (ra !== rb) return rb - ra;
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

  return { city, country, hotels };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const data = await fetchData(slug);
    if (!data) return { title: 'Not found' };
    const { city, hotels } = data;

    return cityHubMetadata({
      citySlug: slug,
      hub: 'hotels',
      title: `Hotels in ${city.name}`,
      description:
        hotels.length === 0
          ? `Hotel notes for ${city.name}. The atlas does not yet have hotel pins for this city.`
          : `${hotels.length} hotels in ${city.name} I have stayed at, with personal notes on rooms, breakfast, location, and the trade-offs that show up after the first night.`,
      indexable: hotels.length >= MIN_INDEXABLE_HOTEL_COUNT,
    });
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

  const schema = cityHubSchema({
    citySlug: slug,
    cityName: city.name,
    hub: 'hotels',
    leafLabel: 'Hotels',
    collectionName: `Hotels in ${city.name}`,
    collectionDescription: `Hotels in ${city.name} from Mike Lee's travel atlas, with personal stay notes.`,
    items: hotels.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
    indexable: hotels.length >= MIN_INDEXABLE_HOTEL_COUNT,
    articleHeadline: `Hotels in ${city.name}`,
    articleDescription: `${hotels.length} hotels in ${city.name} I have stayed at.`,
  });

  const intro =
    hotels.length === 0 ? (
      <p className="mt-5 text-prose text-ink leading-relaxed">
        I have not yet stayed at and reviewed any hotels in {city.name}. The{' '}
        <Link href={`/cities/${slug}`} className="text-teal hover:underline">
          {city.name} city page
        </Link>{' '}
        still has facts, climate, and any notes filled in.
      </p>
    ) : (
      <p className="mt-5 text-prose text-ink leading-relaxed">
        What follows is{' '}
        {hotels.length === 1 ? 'one hotel' : `${hotels.length} hotels`} in{' '}
        {city.name} I have actually stayed at, with personal notes on rooms,
        breakfast, location, and the trade-offs that show up after the first
        night. Visited stays lead, then star ratings, then everything else.
        Click any card for the full review, booking link, and area context.
        The{' '}
        <Link href={`/cities/${slug}`} className="text-teal hover:underline">
          {city.name} city page
        </Link>{' '}
        holds the rest of the orientation if you have not picked an area yet.
      </p>
    );

  return (
    <CityHubShell
      citySlug={slug}
      cityName={city.name}
      country={country}
      leafLabel="Hotels"
      h1={`Hotels in ${city.name}`}
      schema={schema}
      intro={intro}
    >
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
    </CityHubShell>
  );
}
