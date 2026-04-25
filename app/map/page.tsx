import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import WorldGlobe from '@/components/WorldGlobeLoader';

export const revalidate = 3600;
export const metadata = { title: 'Map · go.mike-lee' };

// Full-bleed map page. The map itself takes the entire content area below
// the sticky nav so the focus stays on the pins. No headline, no description,
// no counts — just the map. Renders as a 3D globe by default with a Flat
// (Mercator) projection toggle.
export default async function MapPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const countryById = new Map(countries.map(c => [c.id, c]));

  const pins = cities
    .filter(c => (c.been || c.go) && c.lat != null && c.lng != null)
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
      };
    });

  return <WorldGlobe pins={pins} />;
}
