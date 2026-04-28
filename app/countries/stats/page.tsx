// === /countries/stats ======================================================
// Server shell for the filter-aware country stats. Loads countries +
// derives city-counts/been-counts per country once; CountryStatsClient
// consumes the cockpit and recomputes from the filtered set.
//
import type { Metadata } from 'next';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import { driveSide } from '@/lib/driveSide';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import CountryStatsClient, { type CountryStatsRow } from '@/components/CountryStatsClient';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

const DESCRIPTION =
  'Filter-aware breakdowns over the 213-country atlas — by continent, visa, tap water, drive-side; top countries by visit count and atlas presence. Numbers update as you change filters in the sidebar.';

export const metadata: Metadata = {
  title: 'Country Stats',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/countries/stats` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/countries/stats`,
    title: 'Country Stats · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CountryStatsPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);

  // Pre-compute per-country city + been counts so the client doesn't
  // need to ship the full city list.
  const cityCount = new Map<string, number>();
  const beenCount = new Map<string, number>();
  for (const c of cities) {
    if (!c.countryPageId) continue;
    cityCount.set(c.countryPageId, (cityCount.get(c.countryPageId) ?? 0) + 1);
    if (c.been) beenCount.set(c.countryPageId, (beenCount.get(c.countryPageId) ?? 0) + 1);
  }

  const rows: CountryStatsRow[] = countries.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    iso2: c.iso2,
    capital: c.capital,
    continent: c.continent,
    schengen: c.schengen,
    // Same fall-through to static lookups when Notion is empty.
    visa: c.visaUs ?? visaUs(c.iso2, c.name) ?? null,
    tapWater: c.tapWater ?? tapWater(c.iso2, c.name) ?? null,
    driveSide: driveSide(c.iso2, c.name),
    cityCount: cityCount.get(c.id) ?? 0,
    beenCount: beenCount.get(c.id) ?? 0,
  }));

  return (
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/countries/stats`,
          name: 'Country Stats',
          description: DESCRIPTION,
        })}
      />

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-h2 text-ink-deep">Country Stats</h1>
        <ViewSwitcher object="countries" current="stats" />
      </div>

      <CountryStatsClient rows={rows} />
    </div>
  );
}
