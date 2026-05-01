'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCountryFilters } from './CountryFiltersContext';
import { filterCountries } from '@/lib/countryFilter';
import { BigStat, Breakdown, FactList } from './StatBlocks';
import { compactNumber, compactUsd, gdpPerCapita, type CountryFact } from '@/lib/countryFacts';

// === CountryStatsClient ====================================================
// Country-side equivalent of CityStatsClient — same filter-driven
// recomputation pattern. Now also surfaces Wikidata baselines
// (population, area, GDP nominal, HDI, life expectancy) joined by
// ISO2 via the country_facts table.

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
  /** Joined by iso2 from public.country_facts. */
  fact?: CountryFact | null;
};

export default function CountryStatsClient({ rows }: { rows: CountryStatsRow[] }) {
  const ctx = useCountryFilters();

  // Reference country — when set, the comparison panel below the
  // breakdowns shows every metric as percentile + above/at/below.
  // Persisted only for the session (URL-state would be nicer but
  // most users won't share the link with a specific reference).
  const [referenceIso2, setReferenceIso2] = useState<string | null>(null);

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

  // === Numeric baselines (Wikidata-sourced) ==============================
  // Pull facts off the joined rows. Some countries have no fact row
  // (mostly small dependencies); they're excluded from the average
  // calculations rather than skewing the mean to zero.
  const factRows = filtered.filter(r => r.fact);
  const meanOf = (pluck: (f: CountryFact) => number | null): number | null => {
    const values = factRows
      .map(r => pluck(r.fact!))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const medianOf = (pluck: (f: CountryFact) => number | null): number | null => {
    const values = factRows
      .map(r => pluck(r.fact!))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    const mid = values.length >> 1;
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  };
  const sumOf = (pluck: (f: CountryFact) => number | null): number | null => {
    const values = factRows
      .map(r => pluck(r.fact!))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0);
  };

  const totalPop = sumOf(f => f.population);
  const totalGdp = sumOf(f => f.gdpNominalUsd);
  const meanHdi  = meanOf(f => f.hdi);
  const meanLife = meanOf(f => f.lifeExpectancy);
  const medianGdpPerCapita = medianOf(f => gdpPerCapita({ ...f } as CountryFact));

  // Top-N tables. Each maps a country fact onto a Breakdown row (using
  // the count column as the actual numeric so the proportional bar reads
  // correctly), but we display the formatted value with FactList style
  // for richer formatting. Mixing both component styles below.
  const topByPopulation = factRows
    .filter(r => r.fact!.population != null)
    .sort((a, b) => (b.fact!.population! - a.fact!.population!))
    .slice(0, 10)
    .map(r => ({
      label: r.name,
      value: compactNumber(r.fact!.population),
      href: `/countries/${r.slug}`,
    }));

  const topByGdp = factRows
    .filter(r => r.fact!.gdpNominalUsd != null)
    .sort((a, b) => (b.fact!.gdpNominalUsd! - a.fact!.gdpNominalUsd!))
    .slice(0, 10)
    .map(r => ({
      label: r.name,
      value: compactUsd(r.fact!.gdpNominalUsd),
      href: `/countries/${r.slug}`,
    }));

  const topByGdpPerCapita = factRows
    .filter(r => gdpPerCapita(r.fact) != null)
    .sort((a, b) => (gdpPerCapita(b.fact)! - gdpPerCapita(a.fact)!))
    .slice(0, 10)
    .map(r => ({
      label: r.name,
      value: compactUsd(Math.round(gdpPerCapita(r.fact)!)),
      href: `/countries/${r.slug}`,
    }));

  const topByHdi = factRows
    .filter(r => r.fact!.hdi != null)
    .sort((a, b) => (b.fact!.hdi! - a.fact!.hdi!))
    .slice(0, 10)
    .map(r => ({
      label: r.name,
      value: r.fact!.hdi!.toFixed(3),
      href: `/countries/${r.slug}`,
    }));

  const topByArea = factRows
    .filter(r => r.fact!.areaKm2 != null)
    .sort((a, b) => (b.fact!.areaKm2! - a.fact!.areaKm2!))
    .slice(0, 10)
    .map(r => ({
      label: r.name,
      value: compactNumber(r.fact!.areaKm2) + ' km²',
      href: `/countries/${r.slug}`,
    }));

  // === Reference-country comparison ======================================
  // When a reference is selected, compute percentile + above/below counts
  // across the filtered set per metric. Comparison metrics are picked
  // for traveler-relevance:
  //   • Population (size)
  //   • GDP nominal (economy size)
  //   • GDP per capita (wealth)
  //   • HDI (development index)
  //   • Life expectancy (proxy for healthcare/conditions)
  //   • Area km² (geographic scale)
  const referenceRow = referenceIso2
    ? filtered.find(r => (r.iso2 ?? '').toUpperCase() === referenceIso2)
      ?? rows.find(r => (r.iso2 ?? '').toUpperCase() === referenceIso2)
      ?? null
    : null;

  type Metric = {
    label: string;
    pluck: (r: CountryStatsRow) => number | null;
    format: (n: number) => string;
  };
  const metrics: Metric[] = [
    { label: 'Population',     pluck: r => r.fact?.population ?? null,                      format: n => compactNumber(n) },
    { label: 'GDP (nominal)',  pluck: r => r.fact?.gdpNominalUsd ?? null,                   format: n => compactUsd(n) },
    { label: 'GDP per capita', pluck: r => gdpPerCapita(r.fact),                            format: n => compactUsd(Math.round(n)) },
    { label: 'HDI',            pluck: r => r.fact?.hdi ?? null,                             format: n => n.toFixed(3) },
    { label: 'Life expectancy', pluck: r => r.fact?.lifeExpectancy ?? null,                 format: n => `${n.toFixed(1)} yr` },
    { label: 'Area',           pluck: r => r.fact?.areaKm2 ?? null,                         format: n => compactNumber(n) + ' km²' },
  ];

  // Pre-sorted candidate list for the picker — countries with at least
  // one fact populated, in name order, grouped by continent.
  const pickerCandidates = useMemo(() => {
    return filtered
      .filter(r => r.iso2 && r.fact)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

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

      {/* === Numeric baselines (Wikidata) ============================
          Five aggregate "world average" tiles. Mean for HDI / life
          expectancy (the right summary for indices), totals for
          population / GDP (sums are meaningful), median for GDP per
          capita (mean is dominated by the wealthiest 5 countries).
          Sized smaller than the headline KPIs so the visual hierarchy
          stays "personal coverage first, world stats second". */}
      {factRows.length > 0 && (
        <section className="mb-4">
          <div className="text-micro uppercase tracking-[0.14em] text-muted font-medium mb-2 px-0.5">
            World baselines · across {factRows.length} countries
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <BigStat value={compactNumber(totalPop)} label="Total population" />
            <BigStat value={compactUsd(totalGdp)}    label="Combined GDP" />
            <BigStat
              value={medianGdpPerCapita != null ? compactUsd(Math.round(medianGdpPerCapita)) : '—'}
              label="Median GDP per capita"
            />
            <BigStat value={meanHdi != null ? meanHdi.toFixed(3) : '—'}     label="Mean HDI" />
            <BigStat value={meanLife != null ? `${meanLife.toFixed(1)} yr` : '—'} label="Mean life expectancy" />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By continent"  rows={byContinent} />
        <Breakdown title="By US visa"    rows={byVisa} />
        <Breakdown title="By tap water"  rows={byTapWater} />
        <Breakdown title="By drive side" rows={byDriveSide} />
        <Breakdown title="Most visited"  rows={topVisited} />
        <Breakdown title="Most cities in atlas" rows={topByCities} />
      </div>

      {/* === Top-N by Wikidata facts ================================== */}
      {factRows.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FactList title="Largest by population"     rows={topByPopulation} />
          <FactList title="Largest by GDP (nominal)"  rows={topByGdp} />
          <FactList title="Highest GDP per capita"    rows={topByGdpPerCapita} />
          <FactList title="Highest HDI"               rows={topByHdi} />
          <FactList title="Largest by area"           rows={topByArea} />
        </div>
      )}

      {/* === Reference-country comparison =============================
          Pick a reference country and the panel underneath shows how
          every other country in the filtered set compares — percentile,
          how many are above/below, and a top-N "closest match" list. */}
      {factRows.length > 1 && (
        <section className="mt-6 card p-5">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <h2 className="text-h3 text-ink-deep">Compare to</h2>
            <select
              value={referenceIso2 ?? ''}
              onChange={e => setReferenceIso2(e.target.value || null)}
              className="px-2.5 py-1.5 text-small rounded-md border border-sand bg-white text-ink-deep focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10"
            >
              <option value="">Pick a reference country…</option>
              {pickerCandidates.map(r => (
                <option key={r.iso2} value={(r.iso2 ?? '').toUpperCase()}>
                  {r.name}
                </option>
              ))}
            </select>
            {referenceRow && (
              <button
                type="button"
                onClick={() => setReferenceIso2(null)}
                className="text-label text-muted hover:text-ink-deep px-2 py-1 rounded hover:bg-cream-soft"
              >
                Clear
              </button>
            )}
          </div>

          {referenceRow ? (
            <ReferenceComparison
              reference={referenceRow}
              rows={factRows}
              metrics={metrics}
            />
          ) : (
            <p className="text-small text-muted">
              Choose a baseline country and every metric below recomputes as
              percentile, plus a count of how many filtered countries fall
              above and below.
            </p>
          )}
        </section>
      )}
    </>
  );
}

// === ReferenceComparison ===================================================
// Per-metric breakdown vs. the chosen reference: shows the reference's own
// value, its percentile across the filtered set, and the count of filtered
// countries above and below.
function ReferenceComparison({
  reference,
  rows,
  metrics,
}: {
  reference: CountryStatsRow;
  rows: CountryStatsRow[];
  metrics: {
    label: string;
    pluck: (r: CountryStatsRow) => number | null;
    format: (n: number) => string;
  }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {metrics.map(m => {
        const refValue = m.pluck(reference);
        // Build the sorted distribution of the metric across the filtered
        // set (excluding nulls). Percentile = how many are <= refValue.
        const values = rows
          .map(m.pluck)
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (refValue == null || values.length < 2) {
          return (
            <div key={m.label} className="border border-sand rounded p-3">
              <div className="text-micro uppercase tracking-[0.14em] text-muted font-medium">
                {m.label}
              </div>
              <div className="mt-1 text-small text-muted">No data for {reference.name}.</div>
            </div>
          );
        }
        const above = values.filter(v => v > refValue).length;
        const below = values.filter(v => v < refValue).length;
        const eq    = values.filter(v => v === refValue).length;
        // Percentile rank (low-end inclusive). For HDI/GDP/etc bigger
        // is "better"; for Population/Area it's just descriptive — same
        // formula either way.
        const percentile = Math.round((below + eq * 0.5) / values.length * 100);

        return (
          <div key={m.label} className="border border-sand rounded p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-micro uppercase tracking-[0.14em] text-muted font-medium">
                {m.label}
              </div>
              <div className="text-label text-muted tabular-nums">P{percentile}</div>
            </div>
            <div className="mt-1 text-h3 text-ink-deep tabular-nums leading-tight">
              {m.format(refValue)}
            </div>
            <div className="mt-2 text-label text-slate flex flex-wrap gap-x-3 gap-y-0.5">
              <span><span className="tabular-nums text-ink-deep">{above}</span> above</span>
              <span><span className="tabular-nums text-ink-deep">{below}</span> below</span>
              {eq > 1 && (
                <span><span className="tabular-nums text-ink-deep">{eq - 1}</span> tied</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
