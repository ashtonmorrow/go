import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import WorldGlobe from '@/components/WorldGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 60 * 60 * 24 * 7; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const MAP_DESCRIPTION =
  'An interactive globe of 1,341 places. Visited in teal, planned in slate. Click any pin to see its sister-city network drawn across the world.';

export const metadata: Metadata = {
  title: 'Map',
  description: MAP_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/map` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/map`,
    title: 'Map · Mike Lee',
    description: MAP_DESCRIPTION,
  },
};

// Full-bleed map page. Now shows ALL cities (not just Been/Go) so the
// sister-city network is visible. Visited / Planned / Other are colour
// differentiated, and clicking a pin reveals that city's sister-city
// connections as drawn lines on the globe.
export default async function MapPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const countryById = new Map(countries.map(c => [c.id, c]));

  const pins = cities
    .filter(c => c.lat != null && c.lng != null)
    .map(c => {
      const country = c.countryPageId ? countryById.get(c.countryPageId) : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        country: country?.name || c.country || '',
        countryFlag: country?.flag || null,
        been: c.been,
        go: c.go,
        lat: c.lat as number,
        lng: c.lng as number,
        sisterCities: c.sisterCities,
      };
    });

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/map`,
    name: 'Map · Mike Lee',
    description: MAP_DESCRIPTION,
  });

  return (
    <>
      <JsonLd data={pageData} />
      <WorldGlobe pins={pins} />
    </>
  );
}
