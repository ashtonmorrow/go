// === /countries/table ======================================================
// Tabular view over the 213-country atlas. Mirrors the City Data table in
// shape — sortable columns, click-row-to-open-detail — but with the
// fields that matter for a country (capital, language, currency, plug,
// voltage, visa, tap-water, calling code, schengen).
//
import type { Metadata } from 'next';
import { fetchAllCountries, fetchAllCities } from '@/lib/notion';
import { tapWater } from '@/lib/tapWater';
import { visaUs } from '@/lib/visaUs';
import { driveSide } from '@/lib/driveSide';
import JsonLd from '@/components/JsonLd';
import CountriesTable from '@/components/CountriesTable';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'All 213 countries as a sortable data table. Capital, language, currency, plugs, voltage, visa, tap-water, drive side. Click any row for the detail page.';

export const metadata: Metadata = {
  title: 'Country Data',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/countries/table` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/countries/table`,
    title: 'Country Data · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CountriesTablePage() {
  const [countries, cities] = await Promise.all([
    fetchAllCountries(),
    fetchAllCities(),
  ]);

  // Count cities per country so the table can show "X cities · Y visited"
  // alongside each country row — same affordance as the country cards.
  const cityCounts = new Map<string, { total: number; been: number }>();
  for (const c of cities) {
    if (!c.countryPageId) continue;
    const cur = cityCounts.get(c.countryPageId) ?? { total: 0, been: 0 };
    cur.total += 1;
    if (c.been) cur.been += 1;
    cityCounts.set(c.countryPageId, cur);
  }

  const rows = countries.map(c => {
    const counts = cityCounts.get(c.id) ?? { total: 0, been: 0 };
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      flag: c.flag,
      iso2: c.iso2,
      iso3: c.iso3,
      continent: c.continent,
      capital: c.capital,
      language: c.language,
      currency: c.currency,
      callingCode: c.callingCode,
      schengen: c.schengen,
      disputed: c.disputed,
      voltage: c.voltage,
      plugTypes: c.plugTypes,
      // Same fall-through-to-static-lookup pattern used elsewhere — Notion
      // is sparse for visa / tap-water; fill in with the curated lists.
      tapWater: c.tapWater ?? tapWater(c.iso2, c.name) ?? null,
      visa: c.visaUs ?? visaUs(c.iso2, c.name) ?? null,
      driveSide: driveSide(c.iso2, c.name),
      cityCount: counts.total,
      beenCount: counts.been,
    };
  });

  // Featured items for the CollectionPage schema — countries with the most
  // visited cities, capped at 30 for crawl efficiency.
  const featured = rows
    .slice()
    .sort((a, b) => b.beenCount - a.beenCount)
    .slice(0, 30)
    .map(r => ({
      url: `${SITE_URL}/countries/${r.slug}`,
      name: r.name,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/countries/table`,
    name: 'Country Data',
    description: DESCRIPTION,
    items: featured,
    totalItems: rows.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <section className="max-w-page mx-auto px-5 pt-6"><h1 className="text-h2 text-ink-deep">Country Data</h1></section>
      <CountriesTable rows={rows} />
    </>
  );
}
