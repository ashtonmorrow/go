// === /cities/stats =========================================================
// At-a-glance breakdown of the 1,341-city atlas. Big-number summary +
// proportional bar charts by continent, by Köppen group, by visa, by
// drive-side, plus a top-N tables of countries by city count and
// extremes (oldest / hottest / coldest).
//
import type { Metadata } from 'next';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import { BigStat, Breakdown, FactList } from '@/components/StatBlocks';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

const DESCRIPTION =
  'Counts and breakdowns over the 1,341-city atlas — by continent, climate, visa, drive-side; top countries; oldest, hottest, coldest.';

export const metadata: Metadata = {
  title: 'City Stats',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cities/stats` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/stats`,
    title: 'City Stats · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CityStatsPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const countryById = new Map(countries.map(c => [c.id, c]));

  // Headline counts.
  const total = cities.length;
  const beenCount = cities.filter(c => c.been).length;
  const goCount = cities.filter(c => c.go).length;
  const savedCount = cities.filter(c => !!c.myGooglePlaces).length;
  const withPhotoCount = cities.filter(c => !!c.personalPhoto).length;

  // Bucket helpers — collapse a Map<key, count> into [key, count][] sorted desc.
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

  // By continent — derived from each city's linked country.
  const byContinent = bucketize(cities, c => {
    const country = c.countryPageId ? countryById.get(c.countryPageId) : null;
    return country?.continent ?? null;
  });

  // Köppen at the group level (first letter of code: A/B/C/D/E).
  const KOPPEN_GROUP_LABELS: Record<string, string> = {
    A: 'A — Tropical',
    B: 'B — Arid',
    C: 'C — Temperate',
    D: 'D — Continental',
    E: 'E — Polar',
  };
  const byKoppen = bucketize(cities, c => {
    const g = c.koppen?.[0]?.toUpperCase();
    return g ? KOPPEN_GROUP_LABELS[g] ?? g : null;
  });

  // Top countries by city count (link out to the country page).
  const countryCounts = new Map<string, number>();
  for (const c of cities) {
    if (!c.countryPageId) continue;
    countryCounts.set(c.countryPageId, (countryCounts.get(c.countryPageId) ?? 0) + 1);
  }
  const topCountries = Array.from(countryCounts.entries())
    .map(([id, count]) => {
      const country = countryById.get(id);
      return country ? { label: country.name, count, href: `/countries/${country.slug}` } : null;
    })
    .filter((x): x is { label: string; count: number; href: string } => !!x)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Extremes — oldest founded year, hottest avg high, coldest avg low.
  const founded = cities
    .filter(c => c.founded)
    .map(c => {
      const m = c.founded!.match(/\d+/);
      const year = m ? parseInt(m[0], 10) : null;
      const signed = c.founded!.includes('BC') && year ? -year : year;
      return { c, signed };
    })
    .filter((x): x is { c: typeof cities[number]; signed: number } => x.signed != null)
    .sort((a, b) => a.signed - b.signed)
    .slice(0, 5)
    .map(({ c, signed }) => ({
      label: c.name,
      value: signed < 0 ? `${-signed} BCE` : `${signed}`,
      href: `/cities/${c.slug}`,
    }));

  const hottest = [...cities]
    .filter(c => c.avgHigh != null)
    .sort((a, b) => (b.avgHigh as number) - (a.avgHigh as number))
    .slice(0, 5)
    .map(c => ({ label: c.name, value: `${c.avgHigh!.toFixed(1)}°C`, href: `/cities/${c.slug}` }));

  const coldest = [...cities]
    .filter(c => c.avgLow != null)
    .sort((a, b) => (a.avgLow as number) - (b.avgLow as number))
    .slice(0, 5)
    .map(c => ({ label: c.name, value: `${c.avgLow!.toFixed(1)}°C`, href: `/cities/${c.slug}` }));

  return (
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/cities/stats`,
          name: 'City Stats',
          description: DESCRIPTION,
        })}
      />

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-h2 text-ink-deep">City Stats</h1>
        <ViewSwitcher object="cities" current="stats" />
      </div>

      {/* Headline counts. Five small KPI cards above the fold. */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <BigStat value={total} label="Cities" />
        <BigStat value={beenCount} label="Visited" hint={`${Math.round((beenCount / total) * 100)}% of the atlas`} />
        <BigStat value={goCount} label="Want to go" />
        <BigStat value={savedCount} label="With saved places" />
        <BigStat value={withPhotoCount} label="With my photos" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By continent"   rows={byContinent} />
        <Breakdown title="By climate"     rows={byKoppen} />
        <Breakdown
          title="Top countries by city count"
          rows={topCountries}
          href="/countries/cards"
        />
        <FactList title="Hottest (avg high)" rows={hottest} />
        <FactList title="Coldest (avg low)" rows={coldest} />
        <FactList title="Earliest founded" rows={founded} />
      </div>
    </div>
  );
}
