import { fetchCitiesCardData } from '@/lib/citiesCardData';
import CitiesTable from '@/components/CitiesTable';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

// Dynamic per-request, not ISR. The full 1,341-row city table risks
// exceeding Vercel's 19.07 MB ISR fallback ceiling. Underlying
// fetchCitiesCardData is unstable_cache'd at the lib layer so
// re-rendering stays cheap.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'All 1,341 cities as a sortable data table. Filter by continent, climate, visa, water, drive side. Click any row to open its postcard.';

export const metadata: Metadata = {
  title: 'City Data',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cities/table` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/table`,
    title: 'City Data · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function TablePage() {
  // Same slim aggregator as /cities/cards. Already includes the
  // Wikidata flag fallback + every filter + sort axis the table uses.
  // Cached at the lib layer so we don't refetch the 2.2 MB raw city
  // corpus on every render.
  const cities = await fetchCitiesCardData();

  // CollectionPage + ItemList — same shape as /cities, with a
  // population-sorted sample of Been/Go cities so crawlers get a
  // diverse signal of what the table covers.
  const featuredItems = cities
    .filter(c => c.been || c.go)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/cities/table`,
    name: 'City Data',
    description: DESCRIPTION,
    items: featuredItems,
    totalItems: cities.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <section className="max-w-page mx-auto px-5 pt-6"><h1 className="text-h2 text-ink-deep">City Data</h1></section>
      <CitiesTable cities={cities} />
    </>
  );
}
