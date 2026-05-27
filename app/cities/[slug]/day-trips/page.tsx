import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { fetchCityBySlug, fetchCountryById } from '@/lib/places';
import { getAllDayTripSets, type DayTrip } from '@/lib/content';
import { SITE_URL } from '@/lib/seo';
import { cityHubMetadata, cityHubSchema } from '@/lib/cityHub';
import CityHubShell from '@/components/CityHubShell';

// === /cities/[slug]/day-trips ==============================================
// Place x intent SEO surface. "day trips from <city>" is one of the
// highest-volume, lowest-competition long-tail patterns in travel search —
// the query is always origin-anchored, so it needs its own URL per city
// rather than a flat global topic hub.
//
// The data is an authored `day_trips:` block in the city's guide
// frontmatter (/content/lists/<slug>.md), not a computed list — the page
// has to carry real editorial substance, not a thin templated table.
//
// Shared metadata / JSON-LD / page shell live in lib/cityHub.ts +
// components/CityHubShell.tsx, alongside the things-to-do and hotels hubs.

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

    return cityHubMetadata({
      citySlug: slug,
      hub: 'day-trips',
      title: `Day trips from ${city.name}`,
      description:
        count === 0
          ? `Day trips from ${city.name}. The atlas does not have curated day trips for this city yet.`
          : `${count} day trips from ${city.name}: where to go, how to get there, and why each one is worth the trip.`,
      indexable: count >= MIN_INDEXABLE_DAY_TRIPS,
    });
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
  const indexable = trips.length >= MIN_INDEXABLE_DAY_TRIPS;

  const schema = cityHubSchema({
    citySlug: slug,
    cityName: city.name,
    hub: 'day-trips',
    leafLabel: 'Day trips',
    collectionName: `Day trips from ${city.name}`,
    collectionDescription: `Day trips from ${city.name}, curated from Mike Lee's travel atlas.`,
    items: trips.map(t => {
      const href = dayTripHref(t);
      return {
        url: href ? `${SITE_URL}${href}` : `${SITE_URL}/cities/${slug}/day-trips`,
        name: t.name,
      };
    }),
    indexable,
    articleHeadline: `Day trips from ${city.name}`,
    articleDescription: `${trips.length} curated day trips from ${city.name}.`,
  });

  const intro =
    trips.length === 0 ? (
      <p className="mt-5 text-prose text-ink leading-relaxed">
        The atlas does not have curated day trips for {city.name} yet. The{' '}
        <Link href={`/cities/${slug}`} className="text-teal hover:underline">
          {city.name} city page
        </Link>{' '}
        still has facts, climate, and notes if any are filled in.
      </p>
    ) : dayTrips?.intro ? (
      <p className="mt-5 text-prose text-ink leading-relaxed">{dayTrips.intro}</p>
    ) : (
      <p className="mt-5 text-prose text-ink leading-relaxed">
        {trips.length} day trips from {city.name}, each with how to get there
        and why it earns a day away from the city.
      </p>
    );

  return (
    <CityHubShell
      citySlug={slug}
      cityName={city.name}
      country={country}
      leafLabel="Day trips"
      h1={`Day trips from ${city.name}`}
      schema={schema}
      intro={intro}
    >
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
                    <td className="py-3 pr-4 text-slate">{trip.travel ?? '—'}</td>
                    <td className="py-3 text-ink leading-relaxed">{trip.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CityHubShell>
  );
}
