import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import { fetchCityFlags } from '@/lib/cityFlags';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import type {
  Continent,
  VisaUs,
  TapWater,
} from '@/components/CityFiltersContext';
import type { Metadata } from 'next';

export const revalidate = 3600;

// Per-page metadata — third-person, ≤155 char description, concrete count.
export const metadata: Metadata = {
  title: 'Cities',
  description:
    'Every city in the atlas, as a hand-rotated postcard. Filter by continent, climate, visa, tap-water safety, drive side, and sort.',
  alternates: { canonical: `${SITE_URL}/cities` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities`,
    title: 'Cities · Mike Lee',
    description:
      'Every city in the atlas, as a hand-rotated postcard. Filter by continent, climate, visa, tap-water safety, drive side, and sort.',
  },
};

// Type guards: filter Notion's free-text strings down to the closed unions
// the filter context expects. Anything outside the known set becomes null.
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

  // Pull civic flags from Wikidata for any city that has a Wikidata ID but
  // no Notion-curated cityFlag. Cached for 24 h via ISR; runs once per
  // revalidation window for the whole list.
  const qidsNeedingFlag = cities
    .filter(c => !c.cityFlag && c.wikidataId)
    .map(c => c.wikidataId);
  const wikidataFlags = await fetchCityFlags(qidsNeedingFlag);

  const minimal = cities.map(c => {
    const country = c.countryPageId ? byId.get(c.countryPageId) : null;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      country: c.country,
      been: c.been,
      go: c.go,
      // Three-tier fallback for the postcard stamp:
      //   1. cityFlag    — curated value in Notion (rare)
      //   2. wikidataFlag — civic flag from Wikidata P41 / P94 (most cases)
      //   3. countryFlag — falls through to country flag in CityCard
      cityFlag: c.cityFlag ?? (c.wikidataId ? wikidataFlags.get(c.wikidataId) ?? null : null),
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
      // Country-derived facts shown on the postcard + used as filter axes.
      // Visa and tap-water fields are sparsely populated in the Notion
      // workspace today, so we fall back to the ISO2-keyed lookups in
      // lib/visaUs.ts and lib/tapWater.ts when Notion has nothing. When
      // Notion does have a value, that wins (Notion is the source of truth
      // for any country we've explicitly curated).
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
  // CollectionPage + ItemList structured data. Item list capped at 30
  // entries — featured / well-known cities preferred so search engines
  // see the headline destinations rather than alphabetical filler.
  const featuredItems = cities
    .filter(c => c.been || c.go)
    .slice(0, 30)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/cities`,
    name: 'Cities',
    description:
      'Every city in the atlas, as a hand-rotated postcard. Filter by continent, climate, visa, tap-water safety, drive side, and sort.',
    items: featuredItems,
    totalItems: cities.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <CitiesGrid cities={minimal} />
    </>
  );
}
