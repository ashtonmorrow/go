// === 7-day weather forecast =================================================
// Pulls a 7-day daily forecast from Open-Meteo for any lat/lng. Open-Meteo
// aggregates ECMWF, GFS, DWD, and several national weather services and
// is free for non-commercial use with no API key. Cached 6 hours via Next
// ISR; the forecast horizon shifts each day, so a longer TTL would stale
// out the first card.
//
// API: https://api.open-meteo.com/v1/forecast
//
import { cache } from 'react';

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';

export type ForecastDay = {
  /** ISO date (YYYY-MM-DD) in the city's local timezone. */
  date: string;
  /** Daily high in °C, rounded for display. */
  highC: number;
  /** Daily low in °C. */
  lowC: number;
  /** Total precipitation in millimeters. */
  precipMm: number;
  /** WMO weather code (0..99). See weatherCodeToCondition() for grouping. */
  weatherCode: number;
  /** Peak UV index for the day (0..15 typical range). */
  uvMax: number;
  /** ISO-ish sunrise (e.g., "2026-05-12T05:51"). Local timezone. */
  sunrise: string | null;
  /** ISO-ish sunset. */
  sunset: string | null;
};

/**
 * WMO weather codes grouped into the small set we render. Returns a
 * human label and a coarse category for icon/color selection.
 *
 * Reference: https://open-meteo.com/en/docs (Weather variable documentation).
 */
export function weatherCodeToCondition(code: number): {
  label: string;
  category: 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunder';
} {
  if (code === 0) return { label: 'Clear', category: 'clear' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', category: 'partly_cloudy' };
  if (code === 3) return { label: 'Overcast', category: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Fog', category: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', category: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Rain', category: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Snow', category: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Showers', category: 'rain' };
  if (code >= 85 && code <= 86) return { label: 'Snow showers', category: 'snow' };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', category: 'thunder' };
  return { label: 'Unsettled', category: 'cloudy' };
}

/** UV index band — public-health label + risk color level. */
export function uvBand(uv: number): { label: string; level: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' } {
  if (uv < 3) return { label: 'Low', level: 'low' };
  if (uv < 6) return { label: 'Moderate', level: 'moderate' };
  if (uv < 8) return { label: 'High', level: 'high' };
  if (uv < 11) return { label: 'Very high', level: 'very_high' };
  return { label: 'Extreme', level: 'extreme' };
}

export const fetchForecast = cache(
  async (lat: number | null, lng: number | null): Promise<ForecastDay[] | null> => {
    if (lat == null || lng == null) return null;
    const url =
      `${OPEN_METEO_API}?` +
      `latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,uv_index_max,sunrise,sunset` +
      `&timezone=auto&forecast_days=7`;

    try {
      const res = await fetch(url, {
        next: { revalidate: 60 * 60 * 6 }, // 6 hours
        headers: {
          'User-Agent':
            'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        daily?: {
          time?: string[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_sum?: number[];
          weather_code?: number[];
          uv_index_max?: number[];
          sunrise?: string[];
          sunset?: string[];
        };
      };
      const d = data?.daily;
      if (!d || !d.time) return null;

      const result: ForecastDay[] = [];
      for (let i = 0; i < d.time.length; i++) {
        const date = d.time[i];
        if (!date) continue;
        result.push({
          date,
          highC: typeof d.temperature_2m_max?.[i] === 'number' ? d.temperature_2m_max[i] : NaN,
          lowC: typeof d.temperature_2m_min?.[i] === 'number' ? d.temperature_2m_min[i] : NaN,
          precipMm: typeof d.precipitation_sum?.[i] === 'number' ? d.precipitation_sum[i] : 0,
          weatherCode: typeof d.weather_code?.[i] === 'number' ? d.weather_code[i] : -1,
          uvMax: typeof d.uv_index_max?.[i] === 'number' ? d.uv_index_max[i] : 0,
          sunrise: d.sunrise?.[i] ?? null,
          sunset: d.sunset?.[i] ?? null,
        });
      }
      return result;
    } catch {
      return null;
    }
  },
);
