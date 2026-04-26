import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CountriesGlobe from '@/components/CountriesGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import type { Continent, VisaUs, TapWater } from '@/components/CityFiltersContext';
import type { Metadata } from 'next';

export const revalidate = 3600;

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

// Type guards mirror the /cities + /table pages so the City shape stays
// consistent across views.
const CONTINENT_VALUES: Continent[] = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Australia',
  'Antartica',
];
const VISA_VALUES: VisaUs[] = ['Visa-free', 'eVisa', 'On arrival', 'Required', 'Varies'];
const TAP_WATER_VALUES: TapWater[] = ['Safe', 'Treat first', 'Not safe', 'Varies'];
const asContinent = (v: string | null | undefined): Continent | null =>
  v && (CONTINENT_VALUES as string[]).includes(v) ? (v as Continent) : null;
const asVisa = (v: string | null | undefined): VisaUs | null =>
  v && (VISA_VALUES as string[]).includes(v) ? (v as VisaUs) : null;
const asTapWater = (v: string | null | undefined): TapWater | null =>
  v && (TAP_WATER_VALUES as string[]).includes(v) ? (v as TapWater) : null;

export default async function WorldPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const byId = new Map(countries.map(c => [c.id, c]));

  // Cities payload — same minimal shape as /cities and /table so the
  // useFilteredCities hook works identically. countryPageId comes through
  // so the client can map cities to ISO3 country fills.
  const cityPayload = cities.map(c => {
    const country = c.countryPageId ? byId.get(c.countryPageId) : null;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      country: c.country,
      countryPageId: c.countryPageId ?? null,
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
      currency: country?.currency ?? null,
      language: country?.language ?? null,
      driveSide: driveSide(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      continent: asContinent(country?.continent),
      visa:
        asVisa(country?.visaUs) ??
        visaUs(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      tapWater:
        asTapWater(country?.tapWater) ??
        tapWater(country?.iso2 ?? null, country?.name ?? c.country ?? null),
    };
  });

  // Country lookup maps for the globe:
  //   countriesByIso3 — popup metadata + click-to-navigate by ISO3
  //   countryIdToIso3 — bridge from city.countryPageId to ISO3 (the
  //                     GeoJSON keys on ISO3, but cities reference Notion
  //                     country page ids)
  const countriesByIso3: Record<string, { name: string; slug: string; flag: string | null }> = {};
  const countryIdToIso3: Record<string, string> = {};
  for (const c of countries) {
    if (!c.iso3) continue;
    const iso = c.iso3.toUpperCase();
    countriesByIso3[iso] = { name: c.name, slug: c.slug, flag: c.flag };
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
        cities={cityPayload}
        countriesByIso3={countriesByIso3}
        countryIdToIso3={countryIdToIso3}
      />
    </>
  );
}
