// === Air quality fetcher ===================================================
// Pulls current PM2.5 + the last 12 monthly averages from OpenAQ for any
// city by lat/lng. OpenAQ aggregates government and research-grade air
// monitoring stations worldwide; coverage is strong in the US, EU,
// Canada, India, and most major capitals, and patchier elsewhere.
//
// Two-step lookup:
//   1. Find the nearest station within 25 km that publishes PM2.5.
//   2. Pull its latest reading + 12-month monthly aggregates.
//
// Both calls are wrapped in Next ISR (30 days for the station + monthly
// series; 1 hour for the latest reading). The 30-day TTL is fine because
// the station list changes rarely and last-year monthly averages are
// stable once a month has passed.
//
// Requires OPENAQ_API_KEY in env (free tier from openaq.org). If missing,
// returns null so the page gracefully falls back to weather + daylight.
//
// API: https://docs.openaq.org/
//
import { cache } from 'react';

const OPENAQ_API = 'https://api.openaq.org/v3';
const SEARCH_RADIUS_M = 25_000;
// OpenAQ parameter IDs (stable across the v3 API).
const PM25_PARAMETER_ID = 2;
const PM10_PARAMETER_ID = 1;

export type AirQualityStation = {
  name: string;
  distanceKm: number;
};

export type AirQuality = {
  /** Latest PM2.5 reading, µg/m³. */
  currentPm25: number | null;
  /** Latest PM10 reading, µg/m³. */
  currentPm10: number | null;
  /** ISO timestamp of the latest reading, in UTC. */
  asOf: string | null;
  /** The nearest station serving this city. */
  station: AirQualityStation | null;
  /**
   * Last-12-months monthly average PM2.5, ordered by calendar month
   * (Jan = index 0). Entries may be null where a month had no data.
   */
  monthlyPm25: (number | null)[];
};

type OpenAqLocation = {
  id: number;
  name?: string | null;
  distance?: number | null; // meters
  sensors?: Array<{
    id: number;
    parameter?: { id?: number; name?: string };
  }>;
};

type OpenAqLatestEntry = {
  value?: number | null;
  parameter?: { id?: number; name?: string };
  datetime?: { utc?: string };
};

type OpenAqMonthlyEntry = {
  value?: number | null;
  period?: {
    datetimeFrom?: { utc?: string };
  };
};

const OPENAQ_KEY = process.env.OPENAQ_API_KEY;

const HEADERS = OPENAQ_KEY
  ? {
      'X-API-Key': OPENAQ_KEY,
      'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
    }
  : null;

export const fetchAirQuality = cache(
  async (lat: number | null, lng: number | null): Promise<AirQuality | null> => {
    if (lat == null || lng == null || !HEADERS) return null;
    const latS = lat.toFixed(3);
    const lngS = lng.toFixed(3);

    // Step 1 — find the nearest station with PM2.5 data inside the radius.
    const stationUrl =
      `${OPENAQ_API}/locations?` +
      `coordinates=${latS},${lngS}` +
      `&radius=${SEARCH_RADIUS_M}` +
      `&parameters_id=${PM25_PARAMETER_ID}` +
      `&limit=1` +
      `&order_by=distance` +
      `&sort_order=asc`;

    let station: OpenAqLocation | null = null;
    try {
      const res = await fetch(stationUrl, {
        headers: HEADERS,
        next: { revalidate: 60 * 60 * 24 * 30 },
      });
      if (!res.ok) return null;
      const data = await res.json();
      station = data?.results?.[0] ?? null;
    } catch {
      return null;
    }
    if (!station) return null;

    const distanceKm = typeof station.distance === 'number' ? station.distance / 1000 : 0;
    const stationOut: AirQualityStation = {
      name: station.name ?? 'Nearest monitoring station',
      distanceKm,
    };

    // Step 2 — latest measurements at this station (PM2.5 + PM10 if present).
    let currentPm25: number | null = null;
    let currentPm10: number | null = null;
    let asOf: string | null = null;
    try {
      const latestUrl = `${OPENAQ_API}/locations/${station.id}/latest`;
      const res = await fetch(latestUrl, {
        headers: HEADERS,
        next: { revalidate: 60 * 60 }, // 1 hour
      });
      if (res.ok) {
        const data = await res.json();
        for (const entry of (data?.results ?? []) as OpenAqLatestEntry[]) {
          const pid = entry.parameter?.id;
          const pname = entry.parameter?.name;
          if (pid === PM25_PARAMETER_ID || pname === 'pm25') {
            if (typeof entry.value === 'number') currentPm25 = entry.value;
            if (entry.datetime?.utc) asOf = entry.datetime.utc;
          } else if (pid === PM10_PARAMETER_ID || pname === 'pm10') {
            if (typeof entry.value === 'number') currentPm10 = entry.value;
            if (!asOf && entry.datetime?.utc) asOf = entry.datetime.utc;
          }
        }
      }
    } catch {
      // Latest is optional. Keep going.
    }

    // Step 3 — monthly aggregates for the PM2.5 sensor over the last 12 months.
    const monthlyPm25: (number | null)[] = new Array(12).fill(null);
    const pm25Sensor = station.sensors?.find(
      s => s.parameter?.id === PM25_PARAMETER_ID || s.parameter?.name === 'pm25',
    );
    if (pm25Sensor?.id) {
      try {
        const now = new Date();
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const dateFrom = yearAgo.toISOString().slice(0, 10);
        const dateTo = now.toISOString().slice(0, 10);
        const monthlyUrl =
          `${OPENAQ_API}/sensors/${pm25Sensor.id}/measurements/monthly?` +
          `datetime_from=${dateFrom}T00:00:00Z` +
          `&datetime_to=${dateTo}T00:00:00Z` +
          `&limit=24`;
        const res = await fetch(monthlyUrl, {
          headers: HEADERS,
          next: { revalidate: 60 * 60 * 24 * 30 },
        });
        if (res.ok) {
          const data = await res.json();
          for (const entry of (data?.results ?? []) as OpenAqMonthlyEntry[]) {
            const periodUtc = entry.period?.datetimeFrom?.utc;
            if (!periodUtc || typeof entry.value !== 'number') continue;
            const monthIndex = new Date(periodUtc).getUTCMonth();
            // Most recent year wins if both Jan-this-year and Jan-last-year
            // are present in the window.
            monthlyPm25[monthIndex] = entry.value;
          }
        }
      } catch {
        // Monthly is optional. Keep the nulls.
      }
    }

    return {
      currentPm25,
      currentPm10,
      asOf,
      station: stationOut,
      monthlyPm25,
    };
  },
);
