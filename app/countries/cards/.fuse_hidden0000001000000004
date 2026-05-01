import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CountriesGrid from '@/components/CountriesGrid';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import { driveSide } from '@/lib/driveSide';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  '213 countries in the atlas, drawn as flag tiles. Hover for the practicalities. Capital, language, currency, plug types, visa, tap-water safety.';

export const metadata: Metadata = {
  title: 'Countries',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/countries/cards` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/countries/cards`,
    title: 'Countries · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CountriesPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);

  // Group cities by country relation so each country card carries the
  // actual list (name + slug + been). The card uses these for the
  // click-to-open dropdown behind the "X cities / Y visited" footer.
  const citiesByCountry = new Map<string, { id: string; name: string; slug: string; been: boolean }[]>();
  for (const city of cities) {
    if (!city.countryPageId) continue;
    const list = citiesByCountry.get(city.countryPageId) ?? [];
    list.push({ id: city.id, name: city.name, slug: city.slug, been: city.been });
    citiesByCountry.set(city.countryPageId, list);
  }

  const minimal = countries.map(c => {
    const countryCities = (citiesByCountry.get(c.id) ?? []).slice().sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const beenCount = countryCities.filter(x => x.been).length;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      flag: c.flag,
      iso2: c.iso2,
      capital: c.capital,
      continent: c.continent,
      language: c.language,
      currency: c.currency,
      callingCode: c.callingCode,
      schengen: c.schengen,
      voltage: c.voltage,
      plugTypes: c.plugTypes,
      emergencyNumber: c.emergencyNumber,
      cityCount: countryCities.length,
      beenCount,
      cities: countryCities,
      // Visa + tap-water mostly come from the static lookups since Notion's
      // Country DB is sparse on those columns. Notion wins when populated.
      visa: c.visaUs ?? visaUs(c.iso2 ?? null, c.name) ?? null,
      tapWater: c.tapWater ?? tapWater(c.iso2 ?? null, c.name) ?? null,
      driveSide: driveSide(c.iso2 ?? null, c.name),
    };
  });

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
    url: `${SITE_URL}/countries/cards`,
    name: 'Countries',
    description: DESCRIPTION,
    items: featuredItems,
    totalItems: countries.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <h1 className="text-h2 text-ink-deep">Countries</h1>
      <CountriesGrid countries={minimal} />
    </>
  );
}
