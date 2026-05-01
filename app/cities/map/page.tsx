import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { driveSide } from '@/lib/driveSide';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import WorldGlobe from '@/components/WorldGlobeLoader';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';
import type { Continent, VisaUs, TapWater } from '@/components/CityFiltersContext';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const MAP_DESCRIPTION =
  'An interactive globe of 1,341 places. Visited in teal, planned in slate. Click any pin to see its sister-city network drawn across the world.';

export const metadata: Metadata = {
  title: 'Map',
  description: MAP_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cities/map` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/map`,
    title: 'Map · Mike Lee',
    description: MAP_DESCRIPTION,
  },
};

// Type guards: narrow Notion's free-text fields down to the closed
// unions the city filter context expects. Same pattern used by
// /cities/cards and /cities/table.
const CONTINENT_VALUES: Continent[] = [
  'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Australia', 'Antartica',
];
const VISA_VALUES: VisaUs[] = ['Visa-free', 'eVisa', 'On arrival', 'Required', 'Varies'];
const TAP_WATER_VALUES: TapWater[] = ['Safe', 'Treat first', 'Not safe', 'Varies'];
const asContinent = (v: string | null | undefined): Continent | null =>
  v && (CONTINENT_VALUES as string[]).includes(v) ? (v as Continent) : null;
const asVisa = (v: string | null | undefined): VisaUs | null =>
  v && (VISA_VALUES as string[]).includes(v) ? (v as VisaUs) : null;
const asTapWater = (v: string | null | undefined): TapWater | null =>
  v && (TAP_WATER_VALUES as string[]).includes(v) ? (v as TapWater) : null;

// Full-bleed map page. Shows every city with coords; cockpit filters
// reduce the visible set in place (sister-city graph still resolves
// against the full set so a selected city's connections always draw).
export default async function MapPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const countryById = new Map(countries.map(c => [c.id, c]));

  const pins = cities
    .filter(c => c.lat != null && c.lng != null)
    .map(c => {
      const country = c.countryPageId ? countryById.get(c.countryPageId) : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        country: country?.name || c.country || '',
        countryFlag: country?.flag || null,
        been: c.been,
        go: c.go,
        lat: c.lat as number,
        lng: c.lng as number,
        sisterCities: c.sisterCities,
        // Filter axes — same shape /cities/cards + /cities/table use.
        continent: asContinent(country?.continent),
        koppen: c.koppen,
        currency: country?.currency ?? null,
        language: country?.language ?? null,
        founded: c.founded,
        visa:
          asVisa(country?.visaUs) ??
          visaUs(country?.iso2 ?? null, country?.name ?? c.country ?? null),
        tapWater:
          asTapWater(country?.tapWater) ??
          tapWater(country?.iso2 ?? null, country?.name ?? c.country ?? null),
        driveSide: driveSide(country?.iso2 ?? null, country?.name ?? c.country ?? null),
        savedPlaces: c.myGooglePlaces,
        population: c.population,
        elevation: c.elevation,
        avgHigh: c.avgHigh,
        avgLow: c.avgLow,
        rainfall: c.rainfall,
      };
    });

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/cities/map`,
    name: 'Map · Mike Lee',
    description: MAP_DESCRIPTION,
  });

  return (
    <>
      <JsonLd data={pageData} />
      <WorldGlobe pins={pins} />
    </>
  );
}
