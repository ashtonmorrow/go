import { fetchCityBySlug, fetchPageBlocks, fetchAllCountries, fetchAllCities } from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, cityJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;
export const dynamicParams = true;

// Pre-render nothing at build time; pages are generated on-demand on first visit
// and then cached for `revalidate` seconds. This keeps the build fast and stays
// well clear of Notion's rate limits during prerender. First visit to any given
// city takes ~1-2s; subsequent visits are instant until the cache expires.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const city = await fetchCityBySlug(slug);
  if (!city) return { title: 'Not found' };

  // Description priority: curated `about` > Wikipedia summary > template.
  // The `about` field is the hand- or AI-curated travel-atlas blurb, which
  // is more on-voice than the Wikipedia lede. Both get clipped to 155.
  const description =
    clip(city.about, 155) ??
    clip(city.wikipediaSummary, 155) ??
    `${city.name}${city.country ? `, ${city.country}` : ''}. Population, climate, currency, language, travel notes.`;

  const url = `${SITE_URL}/cities/${city.slug}`;
  const image = city.personalPhoto ?? city.heroImage ?? undefined;

  return {
    title: city.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${city.name} · Mike Lee`,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${city.name} · Mike Lee`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = await fetchCityBySlug(slug);
  if (!city) notFound();

  const blocks = await fetchPageBlocks(city.id);
  const hasBody = blocks.length > 0;

  // Fetch country for sidebar info
  const countries = await fetchAllCountries();
  const country = countries.find(c => c.id === city.countryPageId) || null;

  // Resolve sister-city names
  const allCities = await fetchAllCities();
  const sisters = city.sisterCities
    .map(id => allCities.find(c => c.id === id))
    .filter(Boolean) as typeof allCities;

  const fmt = (n: number | null, unit = '', digits = 0) =>
    n == null ? '—' : (digits > 0 ? n.toFixed(digits) : Intl.NumberFormat('en').format(n)) + unit;

  // Structured data — City + BreadcrumbList. The breadcrumb gives Google
  // a clean trail to render in SERPs (Cities → Country → City).
  const cityData = cityJsonLd(
    {
      slug: city.slug,
      name: city.name,
      localName: city.localName,
      description: city.about ?? city.wikipediaSummary,
      image: city.personalPhoto ?? city.heroImage,
      lat: city.lat,
      lng: city.lng,
      population: city.population,
    },
    country ? { slug: country.slug, name: country.name } : null
  );
  const breadcrumbItems = [
    { name: 'Cities', item: `${SITE_URL}/cities` },
    ...(country
      ? [{ name: country.name, item: `${SITE_URL}/countries/${country.slug}` }]
      : []),
    { name: city.name },
  ];

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={cityData} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      {/* Breadcrumbs */}
      <div className="text-small text-muted mb-2">
        <Link href="/cities" className="hover:text-teal">Cities</Link>
        {country && <> <span> / </span>
          <Link href={`/countries/${country.slug}`} className="hover:text-teal">{country.name}</Link>
        </>}
      </div>

      <header className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-display text-ink-deep leading-none">{city.name}</h1>
          {city.localName && <p className="mt-2 text-h3 text-slate font-normal">{city.localName}</p>}
          <div className="mt-3 flex gap-2">
            {city.been && <span className="pill bg-teal/10 text-teal">Been</span>}
            {city.go && !city.been && <span className="pill bg-sky/20 text-slate">Go</span>}
            {country && <span className="pill">{country.name}</span>}
            {city.koppen && <span className="pill">{city.koppen}</span>}
          </div>
        </div>
      </header>

      {(city.personalPhoto || city.heroImage) && (
        <figure className="mt-6 rounded overflow-hidden">
          <img
            src={city.personalPhoto || city.heroImage!}
            alt={city.name}
            className="w-full max-h-[60vh] object-cover"
          />
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        {/* Main column */}
        <div className="md:col-span-2 min-w-0">
          {city.quote && (
            <blockquote className="border-l-4 border-teal pl-4 text-slate italic">{city.quote}</blockquote>
          )}

          {city.wikipediaSummary && (
            <section className="mt-6">
              <h2 className="text-h3 text-ink-deep mb-2">About</h2>
              <p className="text-ink leading-relaxed">{city.wikipediaSummary}</p>
              {city.wikipediaUrl && (
                <a href={city.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="text-small">
                  Wikipedia →
                </a>
              )}
            </section>
          )}

          {city.whyVisit && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">Why visit</h2>
              <p className="text-ink leading-relaxed">{city.whyVisit}</p>
            </section>
          )}
          {city.avoid && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">When to avoid</h2>
              <p className="text-ink leading-relaxed">{city.avoid}</p>
            </section>
          )}

          {(city.hotSeasonName || city.coldSeasonName) && (
            <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {city.hotSeasonName && (
                <div>
                  <h3 className="text-ink-deep font-medium">{city.hotSeasonName}</h3>
                  {city.hotSeasonDescription && <p className="text-small text-slate mt-1">{city.hotSeasonDescription}</p>}
                </div>
              )}
              {city.coldSeasonName && (
                <div>
                  <h3 className="text-ink-deep font-medium">{city.coldSeasonName}</h3>
                  {city.coolerWetterSeason && <p className="text-small text-slate mt-1">{city.coolerWetterSeason}</p>}
                </div>
              )}
            </section>
          )}

          {hasBody && (
            <section className="mt-10 border-t border-sand pt-8">
              <h2 className="text-h2 text-ink-deep mb-4">Notes</h2>
              <div className="max-w-prose">{renderBlocks(blocks)}</div>
            </section>
          )}
        </div>

        {/* Sidebar facts */}
        <aside className="card p-5 text-small self-start md:sticky md:top-20">
          <h3 className="text-muted uppercase tracking-wider text-[11px]">Facts</h3>
          <dl className="mt-3 space-y-2">
            {[
              ['Population', fmt(city.population)],
              ['Area', fmt(city.area, ' km²', 0)],
              ['Elevation', fmt(city.elevation, ' m', 0)],
              ['Founded', city.founded || '—'],
              ['Demonym', city.demonym || '—'],
              ['Avg high', fmt(city.avgHigh, '°C', 1)],
              ['Avg low', fmt(city.avgLow, '°C', 1)],
              ['Rainfall', fmt(city.rainfall, ' mm/yr', 0)],
              ['Time zone', city.timeZone || city.utcOffset || '—'],
              ['Mayor', city.mayor || '—'],
              ['IATA', city.iataAirports || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-slate">{k}</dt>
                <dd className="text-ink-deep text-right">{v}</dd>
              </div>
            ))}
          </dl>

          {city.motto && (
            <p className="mt-4 text-slate italic text-small">"{city.motto}"</p>
          )}
          {city.nicknames && (
            <p className="mt-2 text-small text-slate">Also known as: {city.nicknames}</p>
          )}
          {country && (
            <div className="mt-4 pt-4 border-t border-sand flex items-center gap-3">
              {country.flag && <img src={country.flag} alt={country.name} className="w-10 h-auto rounded" />}
              <div>
                <div className="text-ink-deep font-medium">{country.name}</div>
                <div className="text-small text-slate">{country.capital}</div>
              </div>
            </div>
          )}
          {city.myGooglePlaces && (
            <a
              href={city.myGooglePlaces}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-small text-teal"
            >
              Open my saved places in Google Maps →
            </a>
          )}
        </aside>
      </div>

      {sisters.length > 0 && (
        <section className="mt-12 border-t border-sand pt-8">
          <h2 className="text-h3 text-ink-deep mb-3">Sister cities</h2>
          <div className="flex flex-wrap gap-2">
            {sisters.map(s => (
              <Link key={s.id} href={`/cities/${s.slug}`} className="pill bg-cream-soft hover:bg-sand">
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
