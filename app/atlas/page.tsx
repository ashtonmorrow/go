import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { SITE_URL } from '@/lib/seo';

// === /atlas ================================================================
// Wrapper landing for the data layer (cities, countries, pins, the world
// map). The site's editorial content sits at /, /lists, /articles; this
// page is the "browse the full reference" surface for visitors who want
// to flip through the underlying dataset rather than read a guide.
//
// Stays intentionally thin: four cards that pick up live counts and link
// straight to the canonical card view of each corpus, plus a fifth card
// for the world map. No filter cockpit; the cockpit lives on the
// individual /cities/cards / /countries/cards / /pins/cards pages where
// it has something to operate on.
//
// Indexable so the page can rank for "Mike Lee atlas" / brand queries
// and pass authority to the four data views, but with a clear "I am
// reference, the writing is over there" framing in the prose.

export const metadata: Metadata = {
  title: "Atlas",
  description:
    "Browse the full reference dataset behind Mike Lee's travel atlas: every city, country, and curated pin, plus a 3D world map.",
  alternates: { canonical: `${SITE_URL}/atlas` },
};

export const revalidate = 3600;

type Card = {
  href: string;
  emoji: string;
  title: string;
  count: number | null;
  blurb: string;
};

export default async function AtlasLanding() {
  // Live counts pulled from the same lib helpers the sidebar uses, so
  // the numbers here track exactly what the data views show.
  const [cities, countries, pins] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
  ]);

  const cards: Card[] = [
    {
      href: '/cities/cards',
      emoji: '📮',
      title: 'Cities',
      count: cities.length,
      blurb:
        'Every city in the atlas with the practical reference layer: climate, currency, language, plug type, drive side, water safety, visa rules. Filter by continent or status; click through to the full detail page.',
    },
    {
      href: '/countries/cards',
      emoji: '🌍',
      title: 'Countries',
      count: countries.length,
      blurb:
        'Country-level reference. Capital, currency, languages, time zones, visa policy, calling code. Useful as the breadth-check before you start planning at the city level.',
    },
    {
      href: '/pins/cards',
      emoji: '📍',
      title: 'Pins',
      count: pins.length,
      blurb:
        'Curated places of interest: museums, viewpoints, restaurants, hotels, transit, parks. Each pin has its own detail page with hours, prices, personal review, and a Google Maps deep link.',
    },
    {
      href: '/countries/map',
      emoji: '🗺️',
      title: 'World map',
      count: null,
      blurb:
        'Visited countries shaded in teal, planned in slate, the rest in cream. The fastest answer to "where has Mike actually been?"',
    },
  ];

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-8 max-w-prose">
        <h1 className="text-display text-ink-deep leading-none">Atlas</h1>
        <p className="mt-3 text-prose text-slate leading-relaxed">
          The full reference dataset behind the atlas. The travel writing
          lives at <Link href="/lists" className="text-teal hover:underline">Lists</Link>{' '}and{' '}
          <Link href="/articles" className="text-teal hover:underline">Articles</Link>;
          this page is for browsing the underlying data, filtering by
          attribute, and seeing the full breadth at a glance.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(card => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="group block card p-5 hover:shadow-paper transition-shadow h-full"
            >
              <div className="flex items-baseline gap-3 mb-2">
                <span aria-hidden className="text-h2 leading-none">
                  {card.emoji}
                </span>
                <h2 className="text-h2 text-ink-deep group-hover:text-teal transition-colors flex-1 leading-tight">
                  {card.title}
                </h2>
                {card.count !== null && (
                  <span className="text-small text-muted tabular-nums">
                    {card.count.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-prose text-slate leading-relaxed">
                {card.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
