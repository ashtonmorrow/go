import { fetchAllCities } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';

export const revalidate = 3600;
export const metadata = { title: 'Cities · go.mike-lee' };

export default async function CitiesPage() {
  const cities = await fetchAllCities();
  const minimal = cities.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    country: c.country,
    been: c.been,
    go: c.go,
    heroImage: c.heroImage,
    personalPhoto: c.personalPhoto,
    population: c.population,
    elevation: c.elevation,
    avgHigh: c.avgHigh,
    avgLow: c.avgLow,
    rainfall: c.rainfall,
    koppen: c.koppen,
    founded: c.founded,
  }));
  return <CitiesGrid cities={minimal} />;
}
