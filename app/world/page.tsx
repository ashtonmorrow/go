import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/notion';
import CountriesGlobe from '@/components/CountriesGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'Every country on a 3D globe, shaded by status. Visited shines teal, planned in slate, anything matching your filters lights up amber. Click to open.';

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
  // Cities come from the slim aggregator (every filter axis CountriesGlobe
  // touches, plus countryPageId for the ISO3 bridge). fetchAllCountries
  // is small enough (~250 rows) to call directly for the popup metadata.
  const [cities, countries] = await Promise.all([
    fetchCitiesCardData(),
    fetchAllCountries(),
  ]);

  // Country lookup maps for the globe:
  //   countriesByIso3 — full popup metadata for the hover tile + click-to-
  //                     navigate by ISO3.
  //   countryIdToIso3 — bridge from city.countryPageId to ISO3 (the
  //                     GeoJSON keys on ISO3, but cities reference Notion
  //                     country page ids).
  const countriesByIso3: Record<
    string,
    {
      name: string;
      slug: string;
      flag: string | null;
      iso2: string | null;
      capital: string | null;
      language: string | null;
      currency: string | null;
      callingCode: string | null;
      schengen: boolean;
      voltage: string | null;
      plugTypes: string[];
      tapWater: string | null;
      visa: string | null;
      driveSide: 'L' | 'R' | null;
    }
  > = {};
  const countryIdToIso3: Record<string, string> = {};
  for (const c of countries) {
    if (!c.iso3) continue;
    const iso = c.iso3.toUpperCase();
    countriesByIso3[iso] = {
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
      tapWater: c.tapWater ?? tapWater(c.iso2 ?? null, c.name) ?? null,
      visa: c.visaUs ?? visaUs(c.iso2 ?? null, c.name) ?? null,
      driveSide: driveSide(c.iso2 ?? null, c.name),
    };
    countryIdToIso3[c.id] = iso;
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
        cities={cities}
        countriesByIso3={countriesByIso3}
        countryIdToIso3={countryIdToIso3}
      />
    </>
  );
}
