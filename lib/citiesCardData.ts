import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { fetchAllCities, fetchAllCountries } from './notion';
import { fetchCityFlags } from './cityFlags';
import { driveSide } from './driveSide';
import { visaUs } from './visaUs';
import { tapWater } from './tapWater';
import { currencySymbol } from './currencySymbol';
import { ukSubdivision } from './ukRegion';
import { flagRect } from './flags';
import type {
  Continent,
  VisaUs,
  TapWater,
} from '@/components/CityFiltersContext';
import type { City as CityCardShape } from './cityShape';

// === /cities/cards aggregator =============================================
// Server-side derive-once-and-cache. Replaces the per-request work the
// /cities/cards page used to do inline:
//   1. fetchAllCities() — 2.2 MB raw, REJECTED by Next's 2 MB data cache
//      so every render hit Supabase fresh.
//   2. fetchAllCountries() — Supabase round-trip.
//   3. fetchCityFlags() — Wikidata API batches for cities lacking a
//      cached flag URL (10+ HTTP calls cold).
//   4. Map 1,300 cities → minimal denormalized shape with computed
//      driveSide / visa / tap-water / currency-symbol fields.
// Total cold-render work was ~9 s of TTFB on PSI.
//
// The output (~780 KB serialized for 1,300 cities) fits comfortably
// under the 2 MB cache ceiling, so once warmed the whole pipeline
// becomes a single in-memory map lookup. Cache TTL matches the source
// fetchers (24 h); /api/revalidate busts via the supabase-cities /
// supabase-countries / notion-cities tags.

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

const _fetchCitiesCardData = unstable_cache(
  async (): Promise<CityCardShape[]> => {
    const [cities, countries] = await Promise.all([
      fetchAllCities(),
      fetchAllCountries(),
    ]);
    const byId = new Map(countries.map(c => [c.id, c]));

    // Wikidata fallback flags — only request for cities lacking a curated
    // cityFlag URL. Cached internally via the fetch's next.revalidate.
    const qidsNeedingFlag = cities
      .filter(c => !c.cityFlag && c.wikidataId)
      .map(c => c.wikidataId);
    const wikidataFlags = await fetchCityFlags(qidsNeedingFlag);

    return cities.map(c => {
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
        countryPageId: c.countryPageId ?? null,
        countrySlug: country?.slug ?? null,
        sisterCities: c.sisterCities,
        been: c.been,
        go: c.go,
        cityFlag:
          c.cityFlag
          ?? (c.wikidataId ? wikidataFlags.get(c.wikidataId) ?? null : null)
          ?? ukRegionFlag,
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
  },
  // v2: added countrySlug + sisterCities so /cities/map + /world can
  // share this aggregator instead of fetchAllCities directly.
  ['cities-card-data-v2'],
  {
    revalidate: 86400,
    tags: ['supabase-cities', 'supabase-countries', 'notion-cities'],
  },
);

export const fetchCitiesCardData = cache(_fetchCitiesCardData);
