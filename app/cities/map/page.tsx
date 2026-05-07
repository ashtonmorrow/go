import { fetchCitiesCardData } from '@/lib/citiesCardData';
import WorldGlobe from '@/components/WorldGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const MAP_DESCRIPTION =
  'An interactive globe of 1,341 places. Visited in teal, planned in slate. Click any pin to see its sister-city network drawn across the world.';

export const metadata: Metadata = {
  title: 'Map',
  description: MAP_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cities/map` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/map`,
    title: 'Map · Mike Lee',
    description: MAP_DESCRIPTION,
  },
};

// Full-bleed map page. Shows every city with coords; cockpit filters
// reduce the visible set in place (sister-city graph still resolves
// against the full set so a selected city's connections always draw).
export default async function MapPage() {
  // Same slim aggregator as /cities/cards — already includes the filter
  // axes, lat/lng, sisterCities, and countrySlug that WorldGlobe wants.
  // Cached at the lib layer (24 h TTL) so we don't refetch the 2.2 MB
  // raw city corpus on every render.
  const cities = await fetchCitiesCardData();

  const pins = cities
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      country: c.country ?? '',
      countrySlug: c.countrySlug ?? null,
      countryFlag: c.countryFlag,
      been: c.been,
      go: c.go,
      lat: c.lat as number,
      lng: c.lng as number,
      sisterCities: c.sisterCities ?? [],
      continent: c.continent,
      koppen: c.koppen,
      currency: c.currency,
      language: c.language,
      founded: c.founded,
      visa: c.visa,
      tapWater: c.tapWater,
      driveSide: c.driveSide,
      savedPlaces: c.savedPlaces,
      population: c.population,
      elevation: c.elevation,
      avgHigh: c.avgHigh,
      avgLow: c.avgLow,
      rainfall: c.rainfall,
    }));

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/cities/map`,
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
