import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { fetchCityBySlug, fetchCountryById } from '@/lib/notion';
import { getAllDayTripSets, type DayTrip } from '@/lib/content';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  AUTHOR_ID,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
  clip,
} from '@/lib/seo';

// === /cities/[slug]/day-trips ==============================================
// Place x intent SEO surface. "day trips from <city>" is one of the
// highest-volume, lowest-competition long-tail patterns in travel search —
// the query is always origin-anchored, so it needs its own URL per city
// rather than a flat global topic hub.
//
// The data is an authored `day_trips:` block in the city's guide
// frontmatter (/content/lists/<slug>.md), not a computed list — the page
// has to carry real editorial substance, not a thin templated table, or
// it is just index bloat.
//
// Content rule: the page is indexable only when the city has at least
// MIN_INDEXABLE_DAY_TRIPS authored trips. Below that it renders for
// navigation but stays noindex,follow.

type Props = { params: Promise<{ slug: string }> };

const MIN_INDEXABLE_DAY_TRIPS = 3;
export const revalidate = 604800;

// On-demand ISR, same as the sibling /things-to-do and /hotels sub-hubs.
export async function generateStaticParams() {
  return [];
}

async function fetchData(slug: string) {
  const city = await fetchCityBySlug(slug);
  if (!city) return null;

  const [sets, country] = await Promise.all([
    getAllDayTripSets(),
    city.countryPageId ? fetchCountryById(city.countryPageId) : Promise.resolve(null),
  ]);

  const set = sets.find(s => s.citySlug === slug) ?? null;
  return { city, country, dayTrips: set?.dayTrips ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const data = await fetchData(slug);
    if (!data) return { title: 'Not found' };
    const { city, dayTrips } = data;

    const count = dayTrips?.trips.length ?? 0;
    const title = `Day trips from ${city.name}`;
    const description =
      count === 0
        ? `Day trips from ${city.name}. The atlas does not have curated day trips for this city yet.`
        : `${count} day trips from ${city.name}: where to go, how to get there, and why each one is worth the trip.`;

    const url = `${SITE_URL}/cities/${slug}/day-trips`;
    const indexable = count >= MIN_INDEXABLE_DAY_TRIPS;

    return {
      title,
      description: clip(description, 155) ?? description,
      alternates: { canonical: url },
      robots: indexable ? undefined : { index: false, follow: true },
      openGraph: {
        type: 'article',
        title: `${title} · Mike Lee`,
        description,
        url,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} · Mike Lee`,
        description,
      },
    };
  } catch (err) {
    console.error('[/cities/[slug]/day-trips] generateMetadata failed:', err);
    return { title: 'Day trips', robots: { index: false, follow: true } };
  }
}

/** Resolve a day trip's optional internal link. A `list` link wins over a
 *  `pin` link when both are set. */
function dayTripHref(trip: DayTrip): string | null {
  if (trip.list) return `/lists/${trip.list}`;
  if (trip.pin) return `/pins/${trip.pin}`;
  return null;
}

export default async function DayTripsPage({ params }: Props) {
  const { slug } = await params;
  const data = await fetchData(slug);
  if (!data) notFound();
  const { city, country, dayTrips } = data;

  const trips = dayTrips?.trips ?? [];
  const url = `${SITE_URL}/cities/${slug}/day-trips`;

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Cities', item: `${SITE_URL}/cities/cards` },
    { name: city.name, item: `${SITE_URL}/cities/${slug}` },
    { name: 'Day trips' },
  ]);

  const collection = collectionJsonLd({
    url,
    name: `Day trips from ${city.name}`,
    description: `Day trips from ${city.name}, curated from Mike Lee's travel atlas.`,
    totalItems: trips.length,
    items: trips.map(t => {
      const href = dayTripHref(t);
      return { url: href ? `${SITE_URL}${href}` : url, name: t.name };
    }),
  });

  // Article schema only above the substance gate — it signals a real
  // piece of writing rather than a thin landing page.
  const article =
    trips.length >= MIN_INDEXABLE_DAY_TRIPS
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          '@id': url,
          url,
          headline: `Day trips from ${city.name}`,
          description: `${trips.length} curated day trips from ${city.name}.`,
          author: { '@id': AUTHOR_ID },
          publisher: { '@id': AUTHOR_ID },
          isPartOf: { '@id': WEBSITE_ID },
          inLanguage: 'en-US',
        }
      : null;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={breadcrumb} />
      <JsonLd data={collection} />
      {article && <JsonLd data={article} />}

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/cities/cards" className="hover:text-teal">Cities</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <Link href={`/cities/${slug}`} className="hover:text-teal">{city.name}</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep">Day trips</span>
      </nav>

      <header className="mb-8 max-w-prose">
        <h1 className="text-h1 text-ink-deep leading-tight">
          Day trips from {city.name}
        </h1>
        {country && (
          <p className="mt-2 text-prose text-slate leading-snug">
            {country.name}
            {country.continent ? `, ${country.continent}` : ''}
          </p>
        )}

        {trips.length === 0 ? (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            The atlas does not have curated day trips for {city.name} yet. The{' '}
            <Link href={`/cities/${slug}`} className="text-teal hover:underline">
              {city.name} city page
            </Link>{' '}
            still has facts, climate, and notes if any are filled in.
          </p>
        ) : dayTrips?.intro ? (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            {dayTrips.intro}
          </p>
        ) : (
          <p className="mt-5 text-prose text-ink leading-relaxed">
            {trips.length} day trips from {city.name}, each with how to get
            there and why it earns a day away from the city.
          </p>
        )}
      </header>

      {trips.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-prose">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="py-2 pr-4 text-label uppercase tracking-wider text-muted font-semibold">
                  Where
                </th>
                <th className="py-2 pr-4 text-label uppercase tracking-wider text-muted font-semibold">
                  Getting there
                </th>
                <th className="py-2 text-label uppercase tracking-wider text-muted font-semibold">
                  Why go
                </th>
              </tr>
            </thead>
            <tbody>
              {trips.map(trip => {
                const href = dayTripHref(trip);
                return (
                  <tr key={trip.name} className="border-b border-sand/60 align-top">
                    <td className="py-3 pr-4 font-medium text-ink-deep whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="text-teal hover:underline">
                          {trip.name}
                        </Link>
                      ) : (
                        trip.name
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate">
                      {trip.travel ?? '—'}
                    </td>
                    <td className="py-3 text-ink leading-relaxed">
                      {trip.summary}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
