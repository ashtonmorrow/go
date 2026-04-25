import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CitiesGrid from '@/components/CitiesGrid';
import { driveSide } from '@/lib/driveSide';
import type {
  Continent,
  VisaUs,
  TapWater,
} from '@/components/CityFiltersContext';

export const revalidate = 3600;
export const metadata = { title: 'Cities · go.mike-lee' };

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
      // Country-derived facts shown on the postcard + used as filter axes
      currency: country?.currency ?? null,
      language: country?.language ?? null,
      driveSide: driveSide(country?.iso2 ?? null, country?.name ?? c.country ?? null),
      continent: asContinent(country?.continent),
      visa: asVisa(country?.visaUs),
      tapWater: asTapWater(country?.tapWater),
    };
  });
  return <CitiesGrid cities={minimal} />;
}
