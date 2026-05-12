// === Public holidays fetcher ================================================
// Pulls the next 12 months of public holidays from date.nager.at by ISO-2
// country code. Free, no API key, public-domain. 100+ countries covered.
//
// We fetch the current year and (if the 12-month window crosses the year
// boundary) the following year, then filter to the rolling 365-day window
// from today.
//
// API: https://date.nager.at/swagger/index.html
//      GET /api/v3/PublicHolidays/{year}/{countryCode}
//
import { cache } from 'react';

const HOLIDAYS_API = 'https://date.nager.at/api/v3/PublicHolidays';

export type Holiday = {
  /** YYYY-MM-DD in the country's local calendar. */
  date: string;
  /** Localized name (e.g., "Weihnachten"). */
  localName: string;
  /** English name (e.g., "Christmas Day"). */
  name: string;
  /** True when observed nationally; false when only some regions observe. */
  global: boolean;
};

type NagerEntry = {
  date?: string;
  localName?: string;
  name?: string;
  global?: boolean;
};

async function fetchYear(iso2: string, year: number): Promise<Holiday[]> {
  try {
    const res = await fetch(`${HOLIDAYS_API}/${year}/${iso2}`, {
      next: { revalidate: 60 * 60 * 24 * 30 }, // 30 days
      headers: {
        'User-Agent':
          'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
      },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as NagerEntry[])
      .filter(h => h.date && h.name)
      .map(h => ({
        date: h.date as string,
        localName: h.localName || (h.name as string),
        name: h.name as string,
        global: h.global ?? true,
      }));
  } catch {
    return [];
  }
}

/**
 * Public holidays in the next 12 months, sorted by date ascending.
 * Returns [] if the country is unknown to date.nager.at or the API fails.
 */
export const fetchUpcomingHolidays = cache(
  async (iso2: string | null | undefined): Promise<Holiday[]> => {
    if (!iso2 || iso2.length !== 2) return [];
    const code = iso2.toUpperCase();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const horizon = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    const horizonKey = horizon.toISOString().slice(0, 10);

    const years =
      today.getFullYear() === horizon.getFullYear()
        ? [today.getFullYear()]
        : [today.getFullYear(), horizon.getFullYear()];

    const all: Holiday[] = [];
    for (const year of years) {
      const yearly = await fetchYear(code, year);
      all.push(...yearly);
    }

    // Filter to the rolling window and dedupe regional duplicates that share
    // a date + English name (date.nager.at often emits one row per region).
    const seen = new Set<string>();
    return all
      .filter(h => h.date >= todayKey && h.date <= horizonKey)
      .filter(h => {
        const key = `${h.date}|${h.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  },
);
