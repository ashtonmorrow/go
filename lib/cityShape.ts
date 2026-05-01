// Shared client-side City shape — the minimal payload that page.tsx hands to
// every city-consuming view (CitiesGrid, CitiesTable, future widgets).
//
// One source of truth here means /cities and /table stay structurally
// identical: same fields, same filter logic, same sort behaviour.
import type {
  Continent,
  VisaUs,
  TapWater,
  DriveSide,
} from '@/components/CityFiltersContext';

export type City = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  // Notion page id of the linked Country record. Used by /world to bridge
  // cities (referenced by page id in Notion) to GeoJSON country fills
  // (keyed by ISO3). Optional because not every consumer needs it.
  countryPageId?: string | null;
  been: boolean;
  go: boolean;
  cityFlag: string | null;
  /** Wikimedia Commons attribution for cityFlag (author/license/source).
   *  Optional + nullable: only present for Commons-hosted flags after
   *  scripts/backfill-image-attribution.ts has run, null otherwise. */
  cityFlagAttribution?: {
    author: string | null;
    license: string | null;
    licenseUrl: string | null;
    sourceUrl: string;
    fetchedAt: string;
  } | null;
  countryFlag: string | null;
  personalPhoto: string | null;
  lat: number | null;
  lng: number | null;
  population: number | null;
  elevation: number | null;
  avgHigh: number | null;
  avgLow: number | null;
  rainfall: number | null;
  koppen: string | null;
  founded: string | null;
  savedPlaces: string | null;
  currency: string | null;
  /** Glyph for the city's currency (€, $, £, ¥, ₹). Derived from the
   *  3-letter code via lib/currencySymbol; null when unknown. */
  currencySymbol?: string | null;
  language: string | null;
  driveSide: DriveSide | null;
  continent: Continent | null;
  visa: VisaUs | null;
  tapWater: TapWater | null;
  /** Country-level electrical voltage, e.g. "230V" or "120/240V". */
  voltage?: string | null;
  /** Country-level plug type codes, e.g. ["A", "B", "C"]. */
  plugTypes?: string[];
};
