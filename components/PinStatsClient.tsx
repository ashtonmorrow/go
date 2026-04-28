'use client';

import { useEffect, useMemo } from 'react';
import { usePinFilters } from './PinFiltersContext';
import { filterPins } from '@/lib/pinFilter';
import { BigStat, Breakdown, FactList } from './StatBlocks';
import type { Pin } from '@/lib/pins';

// === PinStatsClient =========================================================
// Filter-aware aggregate view. Same shape as the old server-rendered
// /pins/stats but reactive to PinFiltersContext — every breakdown
// recomputes from the filtered set on each render.
//
// Coverage framing — when a filter is active the headline shows
// "X / Y matching" plus an "out of total" hint, so a user filtering
// to "Atlas Obscura in Italy" sees both how many of those they've
// been to AND how that compares to the whole atlas.

export default function PinStatsClient({ pins }: { pins: Pin[] }) {
  const ctx = usePinFilters();

  const filtered = useMemo(() => {
    const state = ctx?.state;
    return state ? filterPins(pins, state) : pins;
  }, [pins, ctx?.state]);

  useEffect(() => {
    ctx?.setCounts(filtered.length, pins.length);
  }, [ctx, filtered.length, pins.length]);

  const total = pins.length;
  const matching = filtered.length;
  const filterActive = matching !== total;

  const visited = filtered.filter(p => p.visited).length;
  const withCoords = filtered.filter(p => p.lat != null && p.lng != null).length;
  const withImages = filtered.filter(p => p.images.length > 0).length;
  const unesco = filtered.filter(p => p.unescoId != null).length;
  const atlas = filtered.filter(p => p.lists.includes('Atlas Obscura')).length;

  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
  const visitedHint = filterActive
    ? `${pct(visited, matching)}% of these · ${pct(visited, total)}% of atlas`
    : `${pct(visited, total)}% of atlas`;

  const bucketize = <K,>(key: (p: Pin) => K | null | undefined) => {
    const m = new Map<string, number>();
    for (const p of filtered) {
      const k = key(p);
      if (!k) continue;
      m.set(String(k), (m.get(String(k)) ?? 0) + 1);
    }
    return Array.from(m, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const byCategory = bucketize(p => p.category);

  const listCounts = new Map<string, number>();
  for (const p of filtered) {
    for (const l of p.lists) listCounts.set(l, (listCounts.get(l) ?? 0) + 1);
  }
  const byList = Array.from(listCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byCountry = bucketize(p => p.statesNames[0]).slice(0, 12);

  const tagCounts = new Map<string, number>();
  for (const p of filtered) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = Array.from(tagCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const earliest = filtered
    .filter(p => p.inceptionYear != null)
    .sort((a, b) => (a.inceptionYear as number) - (b.inceptionYear as number))
    .slice(0, 8)
    .map(p => ({
      label: p.name,
      value: (p.inceptionYear as number) < 0
        ? `${-(p.inceptionYear as number)} BCE`
        : `${p.inceptionYear}`,
      href: `/pins/${p.slug ?? p.id}`,
    }));

  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <BigStat
          value={matching}
          label={filterActive ? 'Matching' : 'Pins'}
          hint={filterActive ? `${pct(matching, total)}% of atlas` : undefined}
        />
        <BigStat value={visited}    label="Visited"     hint={visitedHint} />
        <BigStat value={unesco}     label="UNESCO"      hint={`${pct(unesco, matching)}%`} />
        <BigStat value={atlas}      label="Atlas Obscura" />
        <BigStat value={withCoords} label="With coords" />
        <BigStat value={withImages} label="With images" />
      </section>

      {filterActive && (
        <p className="mb-4 text-small text-muted">
          Showing aggregates over <span className="text-ink-deep font-medium">{matching}</span> pins matching your current filters
          {' '}<span className="text-muted">(of {total} total).</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By category"   rows={byCategory} />
        <Breakdown title="On lists"      rows={byList} />
        <Breakdown title="Top countries" rows={byCountry} />
        <Breakdown title="Most common types (Wikidata)" rows={topTags} />
        <FactList  title="Earliest established"         rows={earliest} />
      </div>
    </>
  );
}
