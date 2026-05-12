// === Live air traffic (OpenSky) =============================================
// Helpers for live-aircraft tracking via the OpenSky Network API. The
// actual fetch happens client-side in components/SkyMap.tsx — OpenSky's
// /states/all endpoint is rate-limited per IP (100 credits/day anonymous;
// bounded queries cost 1 credit each), and pushing those calls to the
// browser distributes the quota across users instead of burning it from
// the server's egress IP.
//
// This module provides:
//   • boundingBoxAround()  — convert (lat, lng, km) to a lat/lng box for
//                             the OpenSky bbox query
//   • parseOpenSkyResponse() — type the OpenSky positional array
//                              response into a typed Aircraft[]
//
// API: https://openskynetwork.github.io/opensky-api/rest.html
//
export type Aircraft = {
  /** 24-bit ICAO transponder code, hex (the only stable identifier). */
  icao24: string;
  /** Callsign as filed in the flight plan. May be null if not assigned. */
  callsign: string | null;
  /** Country of the operator (not the aircraft's current location). */
  originCountry: string;
  lat: number;
  lng: number;
  /** Barometric altitude in meters, or null if not transmitted. */
  altitudeM: number | null;
  /** Ground speed in meters per second, or null. */
  velocityMs: number | null;
  /** True track in degrees, 0 = north, 90 = east. */
  trackDeg: number;
};

export function boundingBoxAround(
  lat: number,
  lng: number,
  radiusKm: number,
): { lamin: number; lamax: number; lomin: number; lomax: number } {
  // One degree of latitude is ~111 km anywhere on Earth. One degree of
  // longitude shrinks with cos(latitude). The math is crude but right to
  // within a few kilometers at this scale.
  const LAT_DEG_PER_KM = 1 / 111;
  const lngDegPerKm = 1 / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    lamin: lat - radiusKm * LAT_DEG_PER_KM,
    lamax: lat + radiusKm * LAT_DEG_PER_KM,
    lomin: lng - radiusKm * lngDegPerKm,
    lomax: lng + radiusKm * lngDegPerKm,
  };
}

type OpenSkyResponse = {
  time?: number;
  states?: unknown[];
};

/**
 * Parse OpenSky's positional-array response into typed aircraft.
 * Filters out aircraft currently on the ground (on_ground = true).
 * Returns null if the payload doesn't have the expected shape.
 */
export function parseOpenSkyResponse(
  data: unknown,
): { time: number; aircraft: Aircraft[] } | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as OpenSkyResponse;
  const time = typeof obj.time === 'number' ? obj.time : Math.floor(Date.now() / 1000);
  const states = Array.isArray(obj.states) ? obj.states : [];

  const aircraft: Aircraft[] = [];
  for (const s of states) {
    if (!Array.isArray(s) || s.length < 11) continue;
    // OpenSky positional indexes (from the docs):
    //   0: icao24, 1: callsign, 2: origin_country,
    //   5: longitude, 6: latitude, 7: baro_altitude,
    //   8: on_ground, 9: velocity, 10: true_track
    const onGround = s[8] === true;
    if (onGround) continue;
    const lat = s[6];
    const lng = s[5];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    aircraft.push({
      icao24: typeof s[0] === 'string' ? s[0] : '',
      callsign: typeof s[1] === 'string' ? s[1].trim() || null : null,
      originCountry: typeof s[2] === 'string' ? s[2] : 'Unknown',
      lat,
      lng,
      altitudeM: typeof s[7] === 'number' ? s[7] : null,
      velocityMs: typeof s[9] === 'number' ? s[9] : null,
      trackDeg: typeof s[10] === 'number' ? s[10] : 0,
    });
  }
  return { time, aircraft };
}
