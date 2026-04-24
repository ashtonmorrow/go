import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import Link from 'next/link';

export const revalidate = 3600;

export default async function HomePage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);

  const been = cities.filter(c => c.been);
  const go = cities.filter(c => c.go);

  // Count unique countries among Been cities
  const beenCountries = new Set(been.map(c => c.countryPageId || c.country).filter(Boolean));
  // Count unique continents
  const countryById = new Map(countries.map(c => [c.id, c]));
  const beenContinents = new Set(
    been
      .map(c => (c.countryPageId ? countryById.get(c.countryPageId)?.continent : null))
      .filter(Boolean)
  );

  // Sort Been cities: most recently modified first (fallback to alphabetical)
  const sortedBeen = [...been].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-page mx-auto px-5">
      {/* Hero */}
      <section className="pt-16 pb-8">
        <h1 className="text-display text-ink-deep leading-none">
          Places I&apos;ve been
        </h1>
        <p className="mt-4 text-slate max-w-prose">
          A travel atlas of {been.length} cities across {beenCountries.size} countries,{' '}
          {beenContinents.size} continents. Living record, synced from my Notion.
        </p>

        <div className="mt-6 flex flex-wrap gap-2 text-small">
          <Link href="/cities" className="px-3 py-1.5 rounded-full bg-teal text-white hover:bg-ink-deep transition-colors">
            Browse all {cities.length} cities →
          </Link>
          <span className="px-3 py-1.5 rounded-full bg-cream-soft text-slate border border-sand">
            {go.length} on the list
          </span>
        </div>
      </section>

      {/* Grid */}
      <section className="pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedBeen.map(c => (
            <Link key={c.id} href={`/cities/${c.slug}`} className="card group">
              <div className="aspect-[4/3] bg-sand overflow-hidden">
                {(c.personalPhoto || c.heroImage) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.personalPhoto || c.heroImage!}
                    alt={c.name}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-small">
                    No image
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-ink-deep font-medium truncate">{c.name}</h3>
                    <p className="text-small text-slate truncate">{c.country}</p>
                  </div>
                </div>
                <div className="mt-3 text-small text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                  {c.population != null && (
                    <span>{Intl.NumberFormat('en').format(c.population)} pop</span>
                  )}
                  {c.avgHigh != null && (
                    <span>
                      {c.avgHigh.toFixed(0)}°/{c.avgLow?.toFixed(0) ?? '?'}°C
                    </span>
                  )}
                  {c.koppen && <span>{c.koppen}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {sortedBeen.length === 0 && (
          <div className="text-center py-20 text-muted">
            <p>No cities flagged Been=true in Notion yet.</p>
            <p className="mt-2 text-small">
              Flip the Been? checkbox on any city and it&apos;ll appear here within an hour
              (or immediately with on-demand revalidation).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
