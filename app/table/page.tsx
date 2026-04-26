import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesTable from '@/components/CitiesTable';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type {
  Continent,
  VisaUs,
  TapWater,
} from '@/components/CityFiltersContext';
import type { Metadata } from 'next';

export const revalidate = 3600;

const DESCRIPTION =
  'All 1,341 cities as a sortable data table. Filter by continent, climate, visa, water, drive side. Click any row to open its postcard.';

export const metadata: Metadata = {
  title: 'City Data',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/table` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/table`,
    title: 'City Data · Mike Lee',
    description: DESCRIPTION,
  },
};

// === Type narrowing helpers ================================================
// Same pattern used by /cities/page.tsx — narrow Notion's free-text fields
// to the closed unions used by the filter context.
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

function asContinent(v: string | null | undefined): Continent | null {
  return v && (CONTINENT_VALUES as string[]).includes(v) ? (v as Continent) : null;
}
function asVisa(v: string | null | undefined): VisaUs | null {
  return v && (VISA_VALUES as string[]).includes(v) ? (v as VisaUs) : null;
}
function asTapWater(v: string | null | undefined): TapWater | null {
  return v && (TAP_WATER_VALUES as string[]).includes(v) ? (v as TapWater) : null;
}

export default async function TablePage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const byId = new Map(countries.map(c => [c.id, c]));

  // Identical minimal-shape mapping used by /cities — keeps the table and
  // the postcard wall structurally in sync. Both views use the same
  // useFilteredCities hook so sort + filter behaviour is identical.
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

  // CollectionPage + ItemList — same shape as /cities, but pulls a
  // different sample (most-populous Been/Go cities) to give crawlers a
  // diverse signal of what the table contains.
  const featuredItems = minimal
    .filter(c => c.been || c.go)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/table`,
    name: 'City Data',
    description: DESCRIPTION,
    items: featuredItems,
    totalItems: cities.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <CitiesTable cities={minimal} />
    </>
  );
}
