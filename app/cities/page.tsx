import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';

export const revalidate = 3600;
export const metadata = { title: 'Cities · go.mike-lee' };

export default async function CitiesPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const flagById = new Map(countries.map(c => [c.id, c.flag]));

  const minimal = cities.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    country: c.country,
    been: c.been,
    go: c.go,
    cityFlag: c.cityFlag,
    countryFlag: c.countryPageId ? flagById.get(c.countryPageId) ?? null : null,
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
  }));
  return <CitiesGrid cities={minimal} />;
}
