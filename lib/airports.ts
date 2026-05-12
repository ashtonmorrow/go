// === Nearby airports lookup ================================================
// Static lookup over data/airports.json (synced from OurAirports' public
// catalog; see scripts/sync-airports.ts). 3,300 large + medium commercial
// airports worldwide. Pure in-memory haversine, no network at runtime.
//
// To re-sync (quarterly is fine): npm run airports:sync
//
import airportsData from '@/data/airports.json';

export type Airport = {
  ident: string;
  iata: string | null;
  name: string;
  type: 'large_airport' | 'medium_airport';
  lat: number;
  lng: number;
  elevation_ft: number | null;
  iso_country: string;
  municipality: string | null;
  wikipedia_link: string | null;
};

export type AirportWithDistance = Airport & {
  distanceKm: number;
};

const ALL_AIRPORTS = airportsData as Airport[];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // mean Earth radius, km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  // Clamp under 1 to dodge floating-point drift > 1 that would NaN out acos.
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Return all commercial airports within `radiusKm` of the given point,
 * sorted by distance ascending. Returns [] for null coords.
 *
 * Default radius of 100 km is wide enough to catch the meaningful airport
 * options for most cities (LHR + LGW + STN + LCY for London, JFK + LGA + EWR
 * for New York) without surfacing every small regional strip.
 */
export function nearbyAirports(
  lat: number | null,
  lng: number | null,
  radiusKm = 100,
): AirportWithDistance[] {
  if (lat == null || lng == null) return [];
  const within: AirportWithDistance[] = [];
  for (const a of ALL_AIRPORTS) {
    const d = haversineKm(lat, lng, a.lat, a.lng);
    if (d <= radiusKm) within.push({ ...a, distanceKm: d });
  }
  return within.sort((x, y) => x.distanceKm - y.distanceKm);
}
