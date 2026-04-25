import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';
import { driveSide } from '@/lib/driveSide';

export const revalidate = 3600;
export const metadata = { title: 'Cities · go.mike-lee' };

export default async function CitiesPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  // Index countries by Notion page id so we can pull side-info onto each city
  const byId = new Map(countries.map(c => [c.id, c]));

  const minimal = cities.map(c => {
    const country = c.countryPageId ? byId.get(c.countryPageId) : null;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      country: c.country,
      been: c.been,
      go: c.go,
      cityFlag: c.cityFlag,
      countryFlag: country?.flag ?? null,
      personalPhoto: c.personalPhoto,
      lat: c.lat,
      lng: c.lng,
      population: c.population,
      elevation: c.elevation,
      avgHigh: c.avgHigh,
      avgLow: c.avgLow,
      rainfall: c.rainfall,
      koppen: c.koppen,
      founded: c.founded,
      savedPlaces: c.myGooglePlaces,
      // Country-derived facts shown on the postcard
      currency: country?.currency ?? null,
      language: country?.language ?? null,
      driveSide: driveSide(country?.iso2 ?? null, country?.name ?? c.country ?? null),
    };
  });
  return <CitiesGrid cities={minimal} />;
}
