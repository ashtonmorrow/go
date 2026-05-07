import { fetchCitiesCardData } from '@/lib/citiesCardData';
import CitiesGrid from '@/components/CitiesGrid';
import CitiesPageTitle from '@/components/CitiesPageTitle';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

// Dynamic per-request, not ISR. The full city postcard grid risks
// exceeding Vercel's 19.07 MB ISR fallback ceiling. The expensive
// per-render work (corpus fetch + Wikidata flag lookups + denormalized
// minimal shape) is now cached in fetchCitiesCardData (24 h TTL,
// ~780 KB cached value), so re-rendering is a single in-memory map
// lookup once warm.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Cities I've traveled to",
  description:
    "Cities I've traveled to, as hand-rotated postcards. Filter by continent, climate, visa, tap-water safety, drive side, and sort.",
  alternates: { canonical: `${SITE_URL}/cities/cards` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/cards`,
    title: "Cities I've traveled to · Mike Lee",
    description:
      "Cities I've traveled to, as hand-rotated postcards. Filter by continent, climate, visa, tap-water safety, drive side, and sort.",
  },
};

export default async function CitiesPage() {
  const cities = await fetchCitiesCardData();

  const featuredItems = cities
    .filter(c => c.been || c.go)
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/cities/cards`,
    name: 'Cities',
    description:
      'Every city in the atlas, as a hand-rotated postcard. Filter by continent, climate, visa, tap-water safety, drive side, and sort.',
    items: featuredItems,
    totalItems: cities.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <section className="max-w-page mx-auto px-5 pt-6">
        <CitiesPageTitle />
      </section>
      <CitiesGrid cities={cities} />
    </>
  );
}
