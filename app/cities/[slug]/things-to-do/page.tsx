import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchCityBySlug, fetchCountryById } from '@/lib/notion';
import { fetchPinsForLists } from '@/lib/pins';
import {
  fetchAllSavedListsMeta,
  listsMatchingPlace,
  snippet,
} from '@/lib/savedLists';
import { readPlaceContent, paragraphs } from '@/lib/content';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import { SITE_URL } from '@/lib/seo';
import { cityHubMetadata, cityHubSchema } from '@/lib/cityHub';
import CityHubShell from '@/components/CityHubShell';

// === /cities/[slug]/things-to-do ===========================================
// Long-tail SEO surface: people search "things to do in <city>" more than
// they search the city name alone. Narrower than the /cities/[slug] detail
// page — pins only, with brief editorial framing — so it competes for the
// planning query without diluting the parent page.
//
// Indexable only when the city has at least MIN_INDEXABLE_PIN_COUNT pins;
// below that it renders for navigation but stays noindex,follow. Shared
// metadata / JSON-LD / shell live in lib/cityHub.ts + CityHubShell.

type Props = { params: Promise<{ slug: string }> };

const MIN_INDEXABLE_PIN_COUNT = 4;
export const revalidate = 604800;

export async function generateStaticParams() {
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

  // Anchor to city AND country so collisions (Manchester UK / NH) don't leak.
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

    return cityHubMetadata({
      citySlug: slug,
      hub: 'things-to-do',
      title: `Things to do in ${city.name}`,
      description:
        pins.length === 0
          ? `Travel notes for ${city.name}. The atlas does not yet have curated pins for this city.`
          : `${pins.length} curated pins for ${city.name}: museums, viewpoints, neighborhoods, restaurants, and walks I have actually visited or planned around.`,
      indexable: pins.length >= MIN_INDEXABLE_PIN_COUNT,
    });
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

  const schema = cityHubSchema({
    citySlug: slug,
    cityName: city.name,
    hub: 'things-to-do',
    leafLabel: 'Things to do',
    collectionName: `Things to do in ${city.name}`,
    collectionDescription: `Curated pins for ${city.name} from Mike Lee's travel atlas.`,
    items: pins.slice(0, 30).map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.cover,
    })),
    indexable: pins.length >= MIN_INDEXABLE_PIN_COUNT,
    articleHeadline: `Things to do in ${city.name}`,
    articleDescription: `${pins.length} curated pins for ${city.name}.`,
  });

  // First paragraph of /content/cities/<slug>.md, when one exists, runs as
  // a brief contextual lede. The rest of that article stays on the city page.
  const firstPara = content ? paragraphs(content.body)[0] : null;

  const intro = (
    <>
      {pins.length === 0 ? (
        <p className="mt-5 text-prose text-ink leading-relaxed">
          The atlas does not yet have curated pins for {city.name}. The{' '}
          <Link href={`/cities/${slug}`} className="text-teal hover:underline">
            {city.name} city page
          </Link>{' '}
          still has facts, climate, and notes if any are filled in.
        </p>
      ) : (
        <p className="mt-5 text-prose text-ink leading-relaxed">
          What follows is a working list of {pins.length} pins for {city.name}:
          museums, viewpoints, neighborhoods, gardens, restaurants, and walks.
          Visited entries lead, then rated recommendations, then everything
          else. Click any card for the review, hours, and how I would fit it
          into a day. The{' '}
          <Link href={`/cities/${slug}`} className="text-teal hover:underline">
            {city.name} city page
          </Link>{' '}
          holds the rest of the orientation: climate, language, currency,
          transit, the local quirks worth knowing before you go.
        </p>
      )}
      {firstPara && (
        <p className="mt-4 text-prose text-ink leading-relaxed">{firstPara}</p>
      )}
    </>
  );

  return (
    <CityHubShell
      citySlug={slug}
      cityName={city.name}
      country={country}
      leafLabel="Things to do"
      h1={`Things to do in ${city.name}`}
      schema={schema}
      intro={intro}
    >
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
    </CityHubShell>
  );
}
