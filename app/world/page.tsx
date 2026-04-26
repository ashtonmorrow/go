import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CountriesGlobe from '@/components/CountriesGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const DESCRIPTION =
  '213 countries on a 3D globe. The ones I have been to are shaded teal, the ones I want to go are slate. Click any country to open its page.';

export const metadata: Metadata = {
  title: 'World',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/world` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/world`,
    title: 'World · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function WorldPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);

  // Group cities by country relation. A country counts as "visited" if any of
  // its cities is marked Been; "planned" if it has Go cities but no Been.
  const beenCountByCountry = new Map<string, number>();
  const cityCountByCountry = new Map<string, number>();
  const goCountByCountry = new Map<string, number>();
  for (const city of cities) {
    if (!city.countryPageId) continue;
    cityCountByCountry.set(city.countryPageId, (cityCountByCountry.get(city.countryPageId) || 0) + 1);
    if (city.been) {
      beenCountByCountry.set(city.countryPageId, (beenCountByCountry.get(city.countryPageId) || 0) + 1);
    } else if (city.go) {
      goCountByCountry.set(city.countryPageId, (goCountByCountry.get(city.countryPageId) || 0) + 1);
    }
  }

  const visitedIso3: string[] = [];
  const plannedIso3: string[] = [];
  const iso3Map: Record<string, { name: string; slug: string; beenCount: number; cityCount: number }> = {};

  for (const country of countries) {
    if (!country.iso3) continue;
    const iso = country.iso3.toUpperCase();
    const beenCount = beenCountByCountry.get(country.id) || 0;
    const goCount = goCountByCountry.get(country.id) || 0;
    const cityCount = cityCountByCountry.get(country.id) || 0;

    iso3Map[iso] = {
      name: country.name,
      slug: country.slug,
      beenCount,
      cityCount,
    };

    if (beenCount > 0) visitedIso3.push(iso);
    else if (goCount > 0) plannedIso3.push(iso);
  }

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/world`,
    name: 'World · Mike Lee',
    description: DESCRIPTION,
  });

  return (
    <>
      <JsonLd data={pageData} />
      <CountriesGlobe
        visitedIso3={visitedIso3}
        plannedIso3={plannedIso3}
        iso3Map={iso3Map}
      />
    </>
  );
}
