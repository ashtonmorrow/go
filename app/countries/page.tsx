import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CountriesGrid from '@/components/CountriesGrid';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const DESCRIPTION =
  '213 countries in the atlas, drawn as flag tiles. Hover for the practicalities — capital, language, currency, plug types, visa, tap-water safety.';

export const metadata: Metadata = {
  title: 'Countries',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/countries` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/countries`,
    title: 'Countries · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CountriesPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);

  // Index cities by country relation so we can attach per-country counts
  // without iterating cities once per country.
  const cityCountByCountry = new Map<string, number>();
  const beenCountByCountry = new Map<string, number>();
  for (const city of cities) {
    if (!city.countryPageId) continue;
    cityCountByCountry.set(city.countryPageId, (cityCountByCountry.get(city.countryPageId) || 0) + 1);
    if (city.been) {
      beenCountByCountry.set(city.countryPageId, (beenCountByCountry.get(city.countryPageId) || 0) + 1);
    }
  }

  const minimal = countries.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    flag: c.flag,
    iso2: c.iso2,
    capital: c.capital,
    language: c.language,
    currency: c.currency,
    callingCode: c.callingCode,
    schengen: c.schengen,
    voltage: c.voltage,
    plugTypes: c.plugTypes,
    emergencyNumber: c.emergencyNumber,
    cityCount: cityCountByCountry.get(c.id) || 0,
    beenCount: beenCountByCountry.get(c.id) || 0,
    // Visa + tap-water mostly come from the static lookups since Notion's
    // Country DB is sparse on those columns. Notion wins when populated.
    visa: c.visaUs ?? visaUs(c.iso2 ?? null, c.name) ?? null,
    tapWater: c.tapWater ?? tapWater(c.iso2 ?? null, c.name) ?? null,
  }));

  // Sort the JSON-LD ItemList so "Been" countries appear first — gives
  // search engines a meaningful sample of the curated set.
  const featuredItems = [...minimal]
    .sort((a, b) => b.beenCount - a.beenCount || a.name.localeCompare(b.name))
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/countries/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/countries`,
    name: 'Countries',
    description: DESCRIPTION,
    items: featuredItems,
    totalItems: countries.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <CountriesGrid countries={minimal} />
    </>
  );
}
