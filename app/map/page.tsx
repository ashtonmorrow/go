import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import WorldGlobe from '@/components/WorldGlobeLoader';

export const revalidate = 3600;
export const metadata = { title: 'Map · Mike Lee' };

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

  return <WorldGlobe pins={pins} />;
}
