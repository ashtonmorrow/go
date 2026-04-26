// === Monthly climatology lookup ============================================
// Fetches the long-term monthly climate normals for any lat/lng from
// NASA POWER's climatology endpoint. POWER returns one number per month
// per parameter, averaged over the climatology window — exactly the
// shape we want for a 12-bar chart with no client-side aggregation.
//
// Public, no API key, free for any use. Cached 30 days via Next ISR
// (climate normals don't move).
//
// API:  https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
//
import { cache } from 'react';

export type MonthlyClimate = {
  high: number[]; // 12 entries, °C
  low: number[]; // 12 entries, °C
  precip: number[]; // 12 entries, mm/month
};

const POWER_API = 'https://power.larc.nasa.gov/api/temporal/climatology/point';

// POWER uses three-letter month keys (JAN..DEC) plus an ANN annual aggregate.
// We pull the 12 month keys in calendar order.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export const fetchCityClimate = cache(
  async (lat: number | null, lng: number | null): Promise<MonthlyClimate | null> => {
    if (lat == null || lng == null) return null;
    // POWER expects 3-decimal precision lat/lng. Trim noise to keep the
    // ISR cache key from churning on insignificant float drift.
    const latS = lat.toFixed(3);
    const lngS = lng.toFixed(3);
    const url =
      `${POWER_API}?` +
      `parameters=T2M_MAX,T2M_MIN,PRECTOTCORR` +
      `&community=RE&format=JSON` +
      `&latitude=${latS}&longitude=${lngS}`;

    try {
      const res = await fetch(url, {
        next: { revalidate: 60 * 60 * 24 * 30 }, // 30 days
        headers: {
          'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const params = data?.properties?.parameter ?? {};
      const high = params.T2M_MAX;
      const low = params.T2M_MIN;
      const precip = params.PRECTOTCORR;
      if (!high || !low || !precip) return null;

      // POWER reports missing data as -999. Clean those up here so the
      // chart doesn't render absurd negative bars for points without data.
      const clean = (v: unknown): number =>
        typeof v === 'number' && v > -900 ? v : NaN;

      return {
        high: MONTHS.map(m => clean(high[m])),
        low: MONTHS.map(m => clean(low[m])),
        precip: MONTHS.map(m => clean(precip[m])),
      };
    } catch {
      return null;
    }
  }
);
