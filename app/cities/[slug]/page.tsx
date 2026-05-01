import {
  fetchCityBySlug,
  fetchPageBlocks,
  fetchCountryById,
  fetchCitiesByIds,
} from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, cityJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import MonthlyClimateChart from '@/components/MonthlyClimateChart';
import ViewSwitcher from '@/components/ViewSwitcher';
import { fetchCityClimate } from '@/lib/cityClimate';
import { readPlaceContent, paragraphs } from '@/lib/content';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';
import { fetchCoverForCity } from '@/lib/placeCovers';
import ImageCredit from '@/components/ImageCredit';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes
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

  // Pages with a /content/cities/<slug>.md become indexable; everything else
  // stays noindex by default to avoid bloating the search index with stub
  // pages that are essentially Wikipedia regurgitated.
  const fileContent = await readPlaceContent('cities', slug);

  return {
    title: city.name,
    description,
    alternates: { canonical: url },
    robots: fileContent?.indexable ? undefined : { index: false, follow: true },
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

  // Read the file-based content first — it's a fast disk read and lets us
  // decide whether to skip the slow Notion blocks fetch entirely. When a
  // content file exists, it IS the prose; the legacy Notion-blocks rendering
  // would just sit underneath it and we'd be paying 500ms-2s for nothing.
  const content = await readPlaceContent('cities', slug);

  // Fan everything else out in parallel. Each call is now a surgical query
  // (indexed lookup or filtered subset) — we used to call fetchAllCountries
  // + fetchAllCities here just to find one country and a handful of sister
  // cities, which shipped 1.5 MB of JSON for every cold render. Now we hit
  // exactly the rows we need.
  const needsCoverFallback = !city.personalPhoto && !city.heroImage;
  const [blocks, country, sisters, climate, fallbackCover] = await Promise.all([
    content ? Promise.resolve([]) : fetchPageBlocks(city.id),
    city.countryPageId ? fetchCountryById(city.countryPageId) : Promise.resolve(null),
    city.sisterCities.length > 0 ? fetchCitiesByIds(city.sisterCities) : Promise.resolve([]),
    fetchCityClimate(city.lat, city.lng),
    needsCoverFallback ? fetchCoverForCity(city.name) : Promise.resolve(null),
  ]);
  const hasBody = blocks.length > 0;

  // Final cover URL: city's own photo wins, otherwise we fall back to the
  // most recent pin photo from anywhere in the city. Empty when neither
  // exists; the figure block below renders nothing in that case.
  // The provenance flags below decide which attribution caption to render:
  //   - personal photo: no caption (it's mine)
  //   - heroImage from Commons: real ImageCredit with author + license
  //   - heroImage from elsewhere: no caption (and we should audit those)
  //   - pin-photo fallback: borrowed-from-pin caption
  const coverUrl =
    city.personalPhoto ||
    city.heroImage ||
    fallbackCover?.url ||
    null;
  const coverIsHeroImage = !city.personalPhoto && !!city.heroImage;
  const coverIsFallback = !city.personalPhoto && !city.heroImage && !!fallbackCover;
  const coverDims = coverIsFallback
    ? { width: fallbackCover!.width ?? 1200, height: fallbackCover!.height ?? 800 }
    : { width: 1200, height: 800 };

  // Curated cities = ones I've been to or want to go to. The remaining
  // ~1,000 placeholder cities have AI-generated prose that isn't worth
  // showing — Wikipedia + raw facts are more honest signal there.
  const isCurated = city.been || city.go;

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
      {/* Breadcrumbs + persistent View switcher (no pill highlighted —
          this is a detail page, not any of the four index views). */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/cities" className="hover:text-teal">Cities</Link>
          {country && <> <span> / </span>
            <Link href={`/countries/${country.slug}`} className="hover:text-teal">{country.name}</Link>
          </>}
        </div>
        <ViewSwitcher object="cities" />
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

      {coverUrl && (
        <figure className="mt-6 rounded overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl(coverUrl, 1200) ?? coverUrl}
            alt={city.name}
            // LCP element on this route: tell the browser not to defer it.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ fetchpriority: 'high' } as any)}
            decoding="async"
            // EXIF dimensions (when the cover came from the personal-photos
            // fallback) reserve exact layout space; otherwise a 3:2
            // placeholder. Either way the figure below has zero CLS.
            width={coverDims.width}
            height={coverDims.height}
            className="w-full max-h-[60vh] object-cover"
          />
          {/* Attribution priority:
              - heroImage from Commons → author/license/source caption
              - pin-photo fallback → "From a pin in <city>" orientation note
              - personal photo → nothing (it's mine and the page header
                already names me)  */}
          {coverIsHeroImage && city.heroImageAttribution && (
            <ImageCredit attribution={city.heroImageAttribution} className="px-1 mt-1" />
          )}
          {coverIsFallback && (
            <figcaption className="text-[11px] text-muted px-1 mt-1">
              From a pin in {city.name}
            </figcaption>
          )}
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        {/* Main column */}
        <div className="md:col-span-2 min-w-0">
          {city.quote && (
            <blockquote className="border-l-4 border-teal pl-4 text-slate italic">{city.quote}</blockquote>
          )}

          {/* Personal-voice prose from /content/cities/<slug>.md, if present.
              Sits above Wikipedia so the page reads "what I think" first
              and "what the encyclopedia says" second. */}
          {content && (
            <section className={city.quote ? 'mt-6' : ''}>
              {paragraphs(content.body).map((p, i) => (
                <p key={i} className={'text-ink leading-relaxed text-[17px]' + (i > 0 ? ' mt-4' : '')}>
                  {p}
                </p>
              ))}
            </section>
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

          {/* AI-curated travel prose only renders for cities I've actually
              been to or want to go to. Placeholder cities get Wikipedia +
              facts only — better to say less than to fake confidence. */}
          {isCurated && city.whyVisit && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">Why visit</h2>
              <p className="text-ink leading-relaxed">{city.whyVisit}</p>
            </section>
          )}
          {isCurated && city.avoid && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">When to avoid</h2>
              <p className="text-ink leading-relaxed">{city.avoid}</p>
            </section>
          )}

          {isCurated && (city.hotSeasonName || city.coldSeasonName) && (
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

          {/* NASA POWER monthly climatology — works for every city with
              coords, regardless of curation status. Pure data; safe. */}
          {climate && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">Year-round climate</h2>
              <p className="text-small text-slate mb-3">
                Monthly highs, lows, and rainfall (long-term averages, NASA POWER).
              </p>
              <MonthlyClimateChart data={climate} lat={city.lat} />
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
              {country.flag && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl(country.flag, { size: 40 }) ?? country.flag}
                  alt={country.name}
                  width={40}
                  height={28}
                  loading="lazy"
                  decoding="async"
                  className="w-10 h-auto rounded"
                />
              )}
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
