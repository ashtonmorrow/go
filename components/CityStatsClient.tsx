'use client';

import { useEffect, useMemo } from 'react';
import { useCityFilters } from './CityFiltersContext';
import { applyLayerVisibility, filterCities, layerCounts as countLayers } from '@/lib/cityFilter';
import { BigStat, Breakdown, FactList } from './StatBlocks';
import type { City } from '@/lib/cityShape';

// === CityStatsClient =======================================================
// Client-side equivalent of the server-rendered /cities/stats — same
// shape, but recomputes every aggregate from the cockpit-filtered set on
// each render. The header KPIs frame coverage two ways:
//
//   • Within filter: X / Y cities matching   (% of filter)
//   • Across atlas:  Y / total                (% of all cities)
//
// So a user filtering to Schengen+Temperate sees both "I've been to 50
// of these 230" AND "this is 17% of the whole atlas".
//
// Side-effect: pushes the filtered count into the cockpit footer
// (same setCounts contract used by CitiesGrid / CitiesTable).

type CityStatsRow = City;

export default function CityStatsClient({
  cities,
  countriesByPageId,
}: {
  cities: CityStatsRow[];
  /** Pre-built map from country page id → readable name. Avoids
   *  shipping the full country list to the client. */
  countriesByPageId: Record<string, { name: string; slug: string; continent: string | null }>;
}) {
  const ctx = useCityFilters();
  const state = ctx?.state;

  // Stats treats the cockpit as "active" if the user has narrowed (any
  // facet) or hidden a layer. With the layers/filters split, defaults
  // are genuinely neutral — every layer ON, every facet EMPTY — so
  // "active" cleanly means "user has changed the cockpit." When inactive
  // the headline cohort is the full atlas (no silent narrowing).
  const filterActive =
    (ctx?.activeFilterCount ?? 0) > 0 ||
    (ctx?.activeLayerHidden ?? false);

  const narrowed = useMemo(() => {
    if (!state || !filterActive) return cities;
    return filterCities(cities, state);
  }, [cities, state, filterActive]);

  const filtered = useMemo(() => {
    if (!state || !filterActive) return cities;
    return applyLayerVisibility(narrowed, state);
  }, [narrowed, state, filterActive]);

  // Push counts to the cockpit footer. When filterActive is false this
  // reports total/total — confirms "everything is showing".
  useEffect(() => {
    ctx?.setCounts(filtered.length, cities.length);
  }, [ctx, filtered.length, cities.length]);

  // Push layer counts (over the narrowed-but-not-yet-visibility set) so
  // the sidebar's layer toggles show "Been (47)" etc. that reflects the
  // narrowed cohort, not the global tally.
  useEffect(() => {
    ctx?.setLayerCounts(countLayers(narrowed));
  }, [ctx, narrowed]);

  const total = cities.length;
  const matching = filtered.length;
  const beenInFilter = filtered.filter(c => c.been).length;
  const goInFilter = filtered.filter(c => c.go).length;
  const savedInFilter = filtered.filter(c => !!c.savedPlaces).length;
  const photoInFilter = filtered.filter(c => !!c.personalPhoto).length;

  const beenAcross = cities.filter(c => c.been).length;
  const pct = (n: number, denom: number) => denom > 0 ? Math.round((n / denom) * 100) : 0;

  // Coverage hints — front and centre. When a filter is active the
  // primary BigStat shows the in-filter share; otherwise we anchor on
  // the global "X% of atlas".
  const visitedHint = filterActive
    ? `${pct(beenInFilter, matching)}% of these · ${pct(beenInFilter, total)}% of atlas`
    : `${pct(beenInFilter, total)}% of atlas`;

  const bucketize = <T,>(items: T[], key: (x: T) => string | null): { label: string; count: number }[] => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = key(it);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const byContinent = bucketize(filtered, c => {
    const country = c.countryPageId ? countriesByPageId[c.countryPageId] : null;
    return country?.continent ?? null;
  });

  const KOPPEN_GROUP_LABELS: Record<string, string> = {
    A: 'A — Tropical',
    B: 'B — Arid',
    C: 'C — Temperate',
    D: 'D — Continental',
    E: 'E — Polar',
  };
  const byKoppen = bucketize(filtered, c => {
    const g = c.koppen?.[0]?.toUpperCase();
    return g ? KOPPEN_GROUP_LABELS[g] ?? g : null;
  });

  const countryCounts = new Map<string, number>();
  for (const c of filtered) {
    if (!c.countryPageId) continue;
    countryCounts.set(c.countryPageId, (countryCounts.get(c.countryPageId) ?? 0) + 1);
  }
  const topCountries = Array.from(countryCounts.entries())
    .map(([id, count]) => {
      const country = countriesByPageId[id];
      return country ? { label: country.name, count, href: `/countries/${country.slug}` } : null;
    })
    .filter((x): x is { label: string; count: number; href: string } => !!x)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const founded = filtered
    .filter(c => c.founded)
    .map(c => {
      const m = c.founded!.match(/\d+/);
      const year = m ? parseInt(m[0], 10) : null;
      const signed = c.founded!.includes('BC') && year ? -year : year;
      return { c, signed };
    })
    .filter((x): x is { c: CityStatsRow; signed: number } => x.signed != null)
    .sort((a, b) => a.signed - b.signed)
    .slice(0, 5)
    .map(({ c, signed }) => ({
      label: c.name,
      value: signed < 0 ? `${-signed} BCE` : `${signed}`,
      href: `/cities/${c.slug}`,
    }));

  const hottest = [...filtered]
    .filter(c => c.avgHigh != null)
    .sort((a, b) => (b.avgHigh as number) - (a.avgHigh as number))
    .slice(0, 5)
    .map(c => ({ label: c.name, value: `${c.avgHigh!.toFixed(1)}°C`, href: `/cities/${c.slug}` }));

  const coldest = [...filtered]
    .filter(c => c.avgLow != null)
    .sort((a, b) => (a.avgLow as number) - (b.avgLow as number))
    .slice(0, 5)
    .map(c => ({ label: c.name, value: `${c.avgLow!.toFixed(1)}°C`, href: `/cities/${c.slug}` }));

  return (
    <>
      {/* Headline KPI row. Five tiles when no filter is active; when a
          filter is active we lead with "matching" then keep the rest in
          context. The Visited hint surfaces both within-filter and global
          coverage so the user can read either as "I've documented 22%
          of the atlas" or "I've been to half of what I'm filtered to". */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <BigStat
          value={matching}
          label={filterActive ? 'Matching' : 'Cities'}
          hint={filterActive ? `${pct(matching, total)}% of atlas` : undefined}
        />
        <BigStat value={beenInFilter} label="Visited" hint={visitedHint} />
        <BigStat value={goInFilter} label="Want to go" />
        <BigStat value={savedInFilter} label="With saved places" />
        <BigStat value={photoInFilter} label="With my photos" />
      </section>

      {filterActive && (
        <p className="mb-4 text-small text-muted">
          Showing aggregates over <span className="text-ink-deep font-medium">{matching}</span> cities matching your current filters
          {' '}<span className="text-muted">(of {total} total · {beenAcross} visited overall).</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By continent" rows={byContinent} />
        <Breakdown title="By climate"   rows={byKoppen} />
        <Breakdown
          title="Top countries by city count"
          rows={topCountries}
          href="/countries/cards"
        />
        <FactList title="Hottest (avg high)" rows={hottest} />
        <FactList title="Coldest (avg low)"  rows={coldest} />
        <FactList title="Earliest founded"   rows={founded} />
      </div>
    </>
  );
}
