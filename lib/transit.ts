// === Transit operators lookup ===============================================
// Pulls the public-transit operators within ~8 km of a city center from
// TransitLand v2. TransitLand aggregates GTFS feeds from agencies
// worldwide, which is the cleanest single source for "what bus, subway,
// or tram networks does this city have."
//
// Coverage is strong in North America, Western Europe, Japan, Korea, and
// Australia, and patchy elsewhere. Returns [] gracefully when the city
// has no operators in the index or the API key is missing.
//
// API: https://www.transit.land/documentation
//      GET /api/v2/rest/operators?lat={}&lon={}&radius={}&apikey={}
//
import { cache } from 'react';

const TRANSITLAND_API = 'https://transit.land/api/v2/rest';
const SEARCH_RADIUS_M = 8_000;

export type TransitOperator = {
  /** TransitLand onestop_id, stable across syncs (e.g., "o-ezjm-empresamadrid"). */
  onestopId: string;
  /** Full operator name (e.g., "Empresa Municipal de Transportes de Madrid"). */
  name: string;
  /** Short trading name when distinct from full name (e.g., "EMT"). */
  shortName: string | null;
  /** Operator's public website, where TransitLand has one on file. */
  website: string | null;
  /**
   * Aggregated transit modes from the operator's agencies. Values follow
   * the GTFS route_type families: 'bus', 'rail', 'subway', 'tram',
   * 'ferry', 'cable_tram', 'aerial_lift', 'funicular', 'trolleybus',
   * 'monorail'. Deduped and sorted.
   */
  modes: string[];
};

type TransitLandOperator = {
  onestop_id?: string;
  name?: string;
  short_name?: string | null;
  website?: string | null;
  tags?: Record<string, string> | null;
  agencies?: Array<{
    agency_name?: string;
    routes?: Array<{
      route_type?: number;
    }>;
  }>;
};

// GTFS route_type integer → human mode label. Covers the standard and
// extended GTFS code spaces (the extended codes are used by some European
// agencies for trolleybuses and cable cars).
function routeTypeToMode(rt: number): string | null {
  if (rt === 0 || (rt >= 900 && rt <= 906)) return 'tram';
  if (rt === 1 || (rt >= 400 && rt <= 405)) return 'subway';
  if (rt === 2 || (rt >= 100 && rt <= 117)) return 'rail';
  if (rt === 3 || (rt >= 700 && rt <= 716)) return 'bus';
  if (rt === 4 || (rt >= 1000 && rt <= 1099)) return 'ferry';
  if (rt === 5 || rt === 901) return 'cable_tram';
  if (rt === 6 || (rt >= 1300 && rt <= 1399)) return 'aerial_lift';
  if (rt === 7 || (rt >= 1400 && rt <= 1499)) return 'funicular';
  if (rt === 11 || rt === 800) return 'trolleybus';
  if (rt === 12 || (rt >= 405 && rt <= 405)) return 'monorail';
  return null;
}

const TRANSITLAND_KEY = process.env.TRANSITLAND_API_KEY;

export const fetchTransitOperators = cache(
  async (lat: number | null, lng: number | null): Promise<TransitOperator[]> => {
    if (lat == null || lng == null || !TRANSITLAND_KEY) return [];

    const url =
      `${TRANSITLAND_API}/operators?` +
      `lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}` +
      `&radius=${SEARCH_RADIUS_M}` +
      `&limit=20` +
      `&include_routes=true` +
      `&apikey=${encodeURIComponent(TRANSITLAND_KEY)}`;

    try {
      const res = await fetch(url, {
        next: { revalidate: 60 * 60 * 24 * 7 }, // 7 days
        headers: {
          'User-Agent':
            'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
        },
      });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      const operators =
        (data as { operators?: TransitLandOperator[] })?.operators ?? [];

      return operators
        .filter(op => op.onestop_id && op.name)
        .map(op => {
          const modeSet = new Set<string>();
          for (const agency of op.agencies ?? []) {
            for (const route of agency.routes ?? []) {
              if (typeof route.route_type !== 'number') continue;
              const mode = routeTypeToMode(route.route_type);
              if (mode) modeSet.add(mode);
            }
          }
          return {
            onestopId: op.onestop_id as string,
            name: op.name as string,
            shortName:
              op.short_name && op.short_name !== op.name ? op.short_name : null,
            website: op.website || null,
            modes: Array.from(modeSet).sort(),
          };
        });
    } catch {
      return [];
    }
  },
);
