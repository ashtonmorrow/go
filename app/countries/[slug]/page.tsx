import { fetchCountryBySlug, fetchAllCities, fetchPageBlocks } from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, countryJsonLd, breadcrumbJsonLd } from '@/lib/seo';
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
    ? `${country.name} — ${practicalParts.join(' · ')}.`
    : `${country.name} — travel notes and cities from a personal travel atlas.`;
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

  const allCities = await fetchAllCities();
  const cities = allCities.filter(c => c.countryPageId === country.id);

  const blocks = await fetchPageBlocks(country.id);
  const hasBody = blocks.length > 0;

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
      <div className="text-small text-muted mb-2">
        <Link href="/cities" className="hover:text-teal">Cities</Link>
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

        <aside className="card p-5 text-small self-start md:sticky md:top-20">
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
        </aside>
      </div>
    </article>
  );
}
