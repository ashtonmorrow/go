import { fetchCountryBySlug, fetchAllCities, fetchPageBlocks } from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, countryJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import CurrencyWidget from '@/components/CurrencyWidget';
import AdvisoryBadge from '@/components/AdvisoryBadge';
import ViewSwitcher from '@/components/ViewSwitcher';
import { visaPortal } from '@/lib/visaPortals';
import { fetchAllCountryFacts, compactNumber, compactUsd, gdpPerCapita } from '@/lib/countryFacts';
import type { Metadata } from 'next';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const country = await fetchCountryBySlug(slug);
  if (!country) return { title: 'Not found' };

  // Description: lead with capital + practicalities, then Wikipedia lede if room.
  const practicalParts = [
    country.capital ? `Capital: ${country.capital}` : null,
    country.language ? country.language : null,
    country.currency ? country.currency : null,
  ].filter(Boolean) as string[];
  const lede = practicalParts.length
    ? `${country.name}. ${practicalParts.join('. ')}.`
    : `${country.name}. Travel notes and cities from a personal atlas.`;
  const description = clip(lede, 155);

  const url = `${SITE_URL}/countries/${country.slug}`;

  return {
    title: country.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${country.name} · Mike Lee`,
      description,
      ...(country.flag ? { images: [{ url: country.flag }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${country.name} · Mike Lee`,
      description,
      ...(country.flag ? { images: [country.flag] } : {}),
    },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await fetchCountryBySlug(slug);
  if (!country) notFound();

  const [allCities, factsByIso2] = await Promise.all([
    fetchAllCities(),
    fetchAllCountryFacts(),
  ]);
  const cities = allCities.filter(c => c.countryPageId === country.id);
  const fact = country.iso2 ? factsByIso2.get(country.iso2.toUpperCase()) ?? null : null;
  const perCapita = fact ? gdpPerCapita(fact) : null;

  const blocks = await fetchPageBlocks(country.id);
  const hasBody = blocks.length > 0;

  // eVisa portal lookup. The portal map (lib/visaPortals.ts) is
  // the source of truth — many countries that take U.S. travellers via
  // eVisa don't say so explicitly in the Notion visaUs field, and we
  // don't want to gate the link on a fragile string match.
  const evisaUrl = visaPortal(country.iso2, country.name);

  // Structured data — Country + BreadcrumbList.
  const countryData = countryJsonLd({
    slug: country.slug,
    name: country.name,
    iso2: country.iso2,
    iso3: country.iso3,
    capital: country.capital,
    description: country.wikipediaSummary,
    image: country.flag,
  });
  const breadcrumbItems = [
    { name: 'Cities', item: `${SITE_URL}/cities` },
    { name: country.name },
  ];

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={countryData} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      {/* Breadcrumb + persistent View switcher (no pill highlighted —
          this is a country detail page, not any of the four index views). */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/countries/cards" className="hover:text-teal">Countries</Link>
        </div>
        <ViewSwitcher object="countries" />
      </div>

      <header className="flex items-center gap-5 flex-wrap">
        {country.flag && (
          <img src={country.flag} alt={country.name} className="w-20 h-auto rounded border border-sand" />
        )}
        <div>
          <h1 className="text-h1 text-ink-deep">{country.name}</h1>
          {country.capital && <p className="text-slate mt-1">Capital: {country.capital}</p>}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        <div className="md:col-span-2 min-w-0">
          {country.wikipediaSummary && (
            <section>
              <h2 className="text-h3 text-ink-deep mb-2">About</h2>
              <p className="text-ink leading-relaxed">{country.wikipediaSummary}</p>
            </section>
          )}

          {hasBody && (
            <section className="mt-8 border-t border-sand pt-8 max-w-prose">
              <h2 className="text-h2 text-ink-deep mb-4">Notes</h2>
              {renderBlocks(blocks)}
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-h3 text-ink-deep mb-3">Cities ({cities.length})</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map(c => (
                <Link
                  key={c.id}
                  href={`/cities/${c.slug}`}
                  className={
                    'pill ' +
                    (c.been ? 'bg-teal/10 text-teal' : c.go ? 'bg-sky/20 text-slate' : 'bg-cream-soft')
                  }
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar — stacked cards: currency, advisory, eVisa, facts */}
        <aside className="self-start md:sticky md:top-20 space-y-4">
          {/* Live FX rate from fawazahmed0/currency-api (24 h ISR). */}
          <CurrencyWidget currency={country.currency} />

          {/* U.S. State Department travel advisory level. */}
          <AdvisoryBadge iso2={country.iso2} countryName={country.name} />

          {/* eVisa shortcut — direct link to the official portal. */}
          {evisaUrl && (
            <a
              href={evisaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card p-4 block text-small hover:bg-cream-soft transition"
            >
              <div className="text-muted uppercase tracking-wider text-[11px]">eVisa portal</div>
              <div className="mt-2 text-teal font-medium">Apply online →</div>
              <div className="mt-1 text-muted text-[11px] truncate" title={evisaUrl}>
                {evisaUrl.replace(/^https?:\/\//, '').split('/')[0]}
              </div>
            </a>
          )}

          {/* Wikidata baselines — population, area, GDP, HDI, life
              expectancy. Only renders when at least one is non-null
              so the card doesn't appear empty for places without
              fact rows (e.g. small dependencies). data_year hint
              tells the reader how fresh the value is. */}
          {fact && (fact.population != null || fact.gdpNominalUsd != null || fact.hdi != null) && (
            <div className="card p-5 text-small">
              <h3 className="text-muted uppercase tracking-wider text-[11px]">By the numbers</h3>
              <dl className="mt-3 space-y-2">
                {fact.population != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Population</dt>
                    <dd className="text-ink-deep tabular-nums">{compactNumber(fact.population)}</dd>
                  </div>
                )}
                {fact.areaKm2 != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Area</dt>
                    <dd className="text-ink-deep tabular-nums">
                      {compactNumber(fact.areaKm2)} km²
                    </dd>
                  </div>
                )}
                {fact.gdpNominalUsd != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">GDP (nominal)</dt>
                    <dd className="text-ink-deep tabular-nums">{compactUsd(fact.gdpNominalUsd)}</dd>
                  </div>
                )}
                {perCapita != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">GDP per capita</dt>
                    <dd className="text-ink-deep tabular-nums">
                      {compactUsd(Math.round(perCapita))}
                    </dd>
                  </div>
                )}
                {fact.hdi != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">HDI</dt>
                    <dd className="text-ink-deep tabular-nums">{fact.hdi.toFixed(3)}</dd>
                  </div>
                )}
                {fact.lifeExpectancy != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Life expectancy</dt>
                    <dd className="text-ink-deep tabular-nums">{fact.lifeExpectancy.toFixed(1)} yr</dd>
                  </div>
                )}
              </dl>
              {fact.dataYear != null && (
                <p className="mt-2 text-muted text-[10px]">
                  Wikidata · most recent values circa {fact.dataYear}.
                </p>
              )}
            </div>
          )}

          <div className="card p-5 text-small">
            <h3 className="text-muted uppercase tracking-wider text-[11px]">Travel</h3>
            <dl className="mt-3 space-y-2">
              {[
                ['Language', country.language],
                ['Currency', country.currency],
                ['Calling code', country.callingCode],
                ['Schengen', country.schengen ? 'Yes' : 'No'],
                ['Voltage', country.voltage],
                ['Plugs', country.plugTypes.length ? country.plugTypes.join(', ') : null],
                ['Tap water', country.tapWater],
                ['Emergency', country.emergencyNumber],
                ['Tipping', country.tipping],
                ['US visa', country.visaUs],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3">
                    <dt className="text-slate">{k}</dt>
                    <dd className="text-ink-deep text-right">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </aside>
      </div>
    </article>
  );
}
