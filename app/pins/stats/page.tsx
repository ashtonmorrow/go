// === /pins/stats ===========================================================
// Aggregate breakdowns across the 1,341 pins. Headline counts plus
// breakdowns by category, list membership, country, and most common
// types. Earliest-established pulls in the inception_year column we
// just enriched.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import { BigStat, Breakdown, FactList } from '@/components/StatBlocks';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

const DESCRIPTION =
  'Counts and breakdowns over the curated pin set — by category, list membership (UNESCO, Atlas Obscura, wonders), country, and most common types.';

export const metadata: Metadata = {
  title: 'Pin Stats',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/stats` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/stats`,
    title: 'Pin Stats · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinStatsPage() {
  const pins = await fetchAllPins();

  const total = pins.length;
  const visited = pins.filter(p => p.visited).length;
  const withCoords = pins.filter(p => p.lat != null && p.lng != null).length;
  const withImages = pins.filter(p => p.images.length > 0).length;
  const unesco = pins.filter(p => p.unescoId != null).length;
  const atlas = pins.filter(p => p.lists.includes('Atlas Obscura')).length;

  // Bucketize the pin set across various axes.
  const bucketize = <K,>(key: (p: typeof pins[number]) => K | null | undefined): { label: string; count: number }[] => {
    const m = new Map<string, number>();
    for (const p of pins) {
      const k = key(p);
      if (!k) continue;
      const s = String(k);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const byCategory = bucketize(p => p.category);

  // Lists need a flat-map since each pin can be on multiple.
  const listCounts = new Map<string, number>();
  for (const p of pins) {
    for (const l of p.lists) listCounts.set(l, (listCounts.get(l) ?? 0) + 1);
  }
  const byList = Array.from(listCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Countries — each pin has a primary state name in statesNames[0].
  const byCountry = bucketize(p => p.statesNames[0])
    .slice(0, 12);

  // Tags — Wikidata "instance of" labels. Cap at top 12 since the
  // long tail isn't actionable in a glance-able view.
  const tagCounts = new Map<string, number>();
  for (const p of pins) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = Array.from(tagCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Earliest-established pins via Wikidata inception year. Negative
  // inception_year = BCE.
  const earliest = pins
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
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/pins/stats`,
          name: 'Pin Stats',
          description: DESCRIPTION,
        })}
      />

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-h2 text-ink-deep">Pin Stats</h1>
        <ViewSwitcher object="pins" current="stats" />
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <BigStat value={total}      label="Pins" />
        <BigStat value={visited}    label="Visited"     hint={`${Math.round((visited / total) * 100)}%`} />
        <BigStat value={unesco}     label="UNESCO"      hint={`${Math.round((unesco / total) * 100)}%`} />
        <BigStat value={atlas}      label="Atlas Obscura" />
        <BigStat value={withCoords} label="With coords" />
        <BigStat value={withImages} label="With images" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By category"     rows={byCategory} />
        <Breakdown title="On lists"        rows={byList} />
        <Breakdown title="Top countries"   rows={byCountry} />
        <Breakdown title="Most common types (Wikidata)" rows={topTags} />
        <FactList  title="Earliest established"         rows={earliest} />
      </div>
    </div>
  );
}
