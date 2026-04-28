// === /countries/stats ======================================================
// Aggregate breakdowns across the 213-country set: continents, visa,
// tap-water, drive-side, and a top-N of countries by visited / city
// count.
//
import type { Metadata } from 'next';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { visaUs } from '@/lib/visaUs';
import { tapWater } from '@/lib/tapWater';
import { driveSide } from '@/lib/driveSide';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import { BigStat, Breakdown, FactList } from '@/components/StatBlocks';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

const DESCRIPTION =
  'Counts and breakdowns over the 213-country atlas — by continent, visa, tap water, drive-side; top countries I have cities in.';

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

  // City counts per country.
  const cityCount = new Map<string, number>();
  const beenCount = new Map<string, number>();
  for (const c of cities) {
    if (!c.countryPageId) continue;
    cityCount.set(c.countryPageId, (cityCount.get(c.countryPageId) ?? 0) + 1);
    if (c.been) beenCount.set(c.countryPageId, (beenCount.get(c.countryPageId) ?? 0) + 1);
  }

  const total = countries.length;
  const withCities = countries.filter(c => (cityCount.get(c.id) ?? 0) > 0).length;
  const visited = countries.filter(c => (beenCount.get(c.id) ?? 0) > 0).length;
  const schengenCount = countries.filter(c => c.schengen).length;

  const bucketize = <T,>(items: T[], key: (x: T) => string | null) => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = key(it);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const byContinent = bucketize(countries, c => c.continent);
  const byVisa = bucketize(countries, c =>
    c.visaUs ?? visaUs(c.iso2, c.name) ?? null
  );
  const byTapWater = bucketize(countries, c =>
    c.tapWater ?? tapWater(c.iso2, c.name) ?? null
  );
  const byDriveSide = bucketize(countries, c => {
    const d = driveSide(c.iso2, c.name);
    return d === 'L' ? 'Left' : d === 'R' ? 'Right' : null;
  });

  // Top countries by visited city count, then by total city count.
  const topVisited = countries
    .map(c => ({ country: c, visited: beenCount.get(c.id) ?? 0 }))
    .filter(x => x.visited > 0)
    .sort((a, b) => b.visited - a.visited)
    .slice(0, 12)
    .map(({ country, visited }) => ({
      label: country.name,
      count: visited,
      href: `/countries/${country.slug}`,
    }));

  const topByCities = countries
    .map(c => ({ country: c, count: cityCount.get(c.id) ?? 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map(({ country, count }) => ({
      label: country.name,
      count,
      href: `/countries/${country.slug}`,
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

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <BigStat value={total} label="Countries" />
        <BigStat value={visited} label="Visited" hint={`${Math.round((visited / total) * 100)}% of the world`} />
        <BigStat value={withCities} label="With cities in atlas" />
        <BigStat value={schengenCount} label="Schengen" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By continent"  rows={byContinent} />
        <Breakdown title="By US visa"    rows={byVisa} />
        <Breakdown title="By tap water"  rows={byTapWater} />
        <Breakdown title="By drive side" rows={byDriveSide} />
        <Breakdown title="Most visited"  rows={topVisited} />
        <Breakdown title="Most cities in atlas" rows={topByCities} />
      </div>
    </div>
  );
}
