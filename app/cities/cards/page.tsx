import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import { fetchCityFlags } from '@/lib/cityFlags';
import { currencySymbol } from '@/lib/currencySymbol';
import { ukSubdivision } from '@/lib/ukRegion';
import { flagRect } from '@/lib/flags';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type {
  Continent,
  VisaUs,
  TapWater,
} from '@/components/CityFiltersContext';
import type { Metadata } from 'next';

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Cities I've traveled to",
  description:
    "Cities I've traveled to, as hand-rotated postcards. Filter by continent, climate, visa, tap-water safety, drive side, and sort.",
  alternates: { canonical: `${SITE_URL}/cities/cards` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/cards`,
    title: "Cities I've traveled to · Mike Lee",
    description:
      "Cities I've traveled to, as hand-rotated postcards. Filter by continent, climate, visa, tap-water safety, drive side, and sort.",
  },
};

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

export default async function CitiesPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const byId = new Map(countries.map(c => [c.id, c]));

  const qidsNeedingFlag = cities
    .filter(c => !c.cityFlag && c.wikidataId)
    .map(c => c.wikidataId);
  const wikidataFlags = await fetchCityFlags(qidsNeedingFlag);

  const minimal = cities.map(c => {
    const country = c.countryPageId ? byId.get(c.countryPageId) : null;
    const ukRegion =
      country?.iso2?.toUpperCase() === 'GB'
        ? ukSubdivision(c.name, c.lat, c.lng)
        : null;
    const ukRegionFlag = ukRegion ? flagRect(`gb-${ukRegion}`) : null;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      country: c.country,
      been: c.been,
      go: c.go,
      cityFlag:
        c.cityFlag
        ?? (c.wikidataId ? wikidataFlags.get(c.wikidataId) ?? null : null)
        ?? ukRegionFlag,
      // Attribution flows through only when the curated cityFlag (the
      // Commons-sourced one) is in use; the wikidataFlags / ukRegionFlag
      // fallbacks are sourced separately and don't carry author/license
      // metadata. (TODO: capture provenance for those too if we keep
      // sourcing from Commons.)
      cityFlagAttribution: c.cityFlag ? c.cityFlagAttribution : null,
      countryFlag: country?.flag ?? null,
      personalPhoto: c.personalPhoto,
      heroImage: c.heroImage,
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
      currencySymbol: currencySymbol(country?.currency ?? null),
      language: country?.language ?? null,
      driveSide: driveSide(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      continent: asContinent(country?.continent),
      visa:
        asVisa(country?.visaUs) ??
        visaUs(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      tapWater:
        asTapWater(country?.tapWater) ??
        tapWater(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      voltage: country?.voltage ?? null,
      plugTypes: country?.plugTypes ?? [],
    };
  });

  const featuredItems = cities
    .filter(c => c.been || c.go)
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/cities/cards`,
    name: 'Cities',
    description:
      'Every city in the atlas, as a hand-rotated postcard. Filter by continent, climate, visa, tap-water safety, drive side, and sort.',
    items: featuredItems,
    totalItems: cities.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <section className="max-w-page mx-auto px-5 pt-6">
        <h1 className="text-h2 text-ink-deep">Cities I&rsquo;ve traveled to</h1>
      </section>
      <CitiesGrid cities={minimal} />
    </>
  );
}
