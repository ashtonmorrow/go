'use client';

import { useEffect, useMemo } from 'react';
import { useCountryFilters } from './CountryFiltersContext';
import { filterCountries } from '@/lib/countryFilter';
import { BigStat, Breakdown } from './StatBlocks';

// === CountryStatsClient ====================================================
// Country-side equivalent of CityStatsClient — same filter-driven
// recomputation pattern.

export type CountryStatsRow = {
  id: string;
  name: string;
  slug: string;
  iso2: string | null;
  continent: string | null;
  schengen: boolean;
  visa: string | null;
  tapWater: string | null;
  driveSide: 'L' | 'R' | null;
  cityCount: number;
  beenCount: number;
  capital?: string | null;
};

export default function CountryStatsClient({ rows }: { rows: CountryStatsRow[] }) {
  const ctx = useCountryFilters();

  const filtered = useMemo(() => {
    const state = ctx?.state;
    return state ? filterCountries(rows, state) : rows;
  }, [rows, ctx?.state]);

  useEffect(() => {
    ctx?.setCounts(filtered.length, rows.length);
  }, [ctx, filtered.length, rows.length]);

  const total = rows.length;
  const matching = filtered.length;
  const filterActive = matching !== total;
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

  const visited = filtered.filter(c => c.beenCount > 0).length;
  const withCities = filtered.filter(c => c.cityCount > 0).length;
  const schengenCount = filtered.filter(c => c.schengen).length;

  const visitedHint = filterActive
    ? `${pct(visited, matching)}% of these · ${pct(visited, total)}% of world`
    : `${pct(visited, total)}% of the world`;

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

  const byContinent = bucketize(filtered, c => c.continent);
  const byVisa      = bucketize(filtered, c => c.visa);
  const byTapWater  = bucketize(filtered, c => c.tapWater);
  const byDriveSide = bucketize(filtered, c => c.driveSide === 'L' ? 'Left' : c.driveSide === 'R' ? 'Right' : null);

  const topVisited = filtered
    .filter(c => c.beenCount > 0)
    .sort((a, b) => b.beenCount - a.beenCount)
    .slice(0, 12)
    .map(c => ({ label: c.name, count: c.beenCount, href: `/countries/${c.slug}` }));

  const topByCities = filtered
    .filter(c => c.cityCount > 0)
    .sort((a, b) => b.cityCount - a.cityCount)
    .slice(0, 12)
    .map(c => ({ label: c.name, count: c.cityCount, href: `/countries/${c.slug}` }));

  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <BigStat
          value={matching}
          label={filterActive ? 'Matching' : 'Countries'}
          hint={filterActive ? `${pct(matching, total)}% of world` : undefined}
        />
        <BigStat value={visited}      label="Visited"             hint={visitedHint} />
        <BigStat value={withCities}   label="With cities in atlas" />
        <BigStat value={schengenCount} label="Schengen" />
      </section>

      {filterActive && (
        <p className="mb-4 text-small text-muted">
          Showing aggregates over <span className="text-ink-deep font-medium">{matching}</span> countries matching your current filters
          {' '}<span className="text-muted">(of {total} total).</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By continent"  rows={byContinent} />
        <Breakdown title="By US visa"    rows={byVisa} />
        <Breakdown title="By tap water"  rows={byTapWater} />
        <Breakdown title="By drive side" rows={byDriveSide} />
        <Breakdown title="Most visited"  rows={topVisited} />
        <Breakdown title="Most cities in atlas" rows={topByCities} />
      </div>
    </>
  );
}
