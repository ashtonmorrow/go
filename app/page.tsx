import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchFeaturedGuides } from '@/lib/featuredGuides';
import { SITE_URL } from '@/lib/seo';

// === Home (/) ===============================================================
// The destination picker. Replaces the previous globe-as-front-door
// (the May 2026 UX review showed visitors landing on the globe couldn't
// tell what the site was for or what to click next). The globe moved
// to /atlas as the wandering / explorer surface; / now leads with the
// editorial-first planning path:
//
//   1. One-line value prop in Mike's voice.
//   2. Search input that lands the visitor on /search?q=...
//   3. 12 most-recently-touched featured guides as photo cards.
//   4. A small "Explore every city" teaser linking to /atlas.
//
// Server component end-to-end. No client JS for the picker itself;
// the search form posts to /search via GET, which is fast, durable
// (works without JS), and matches the existing /search route.

export const metadata: Metadata = {
  title: { absolute: 'Travel guides written by someone who has been' },
  description:
    'Trip-planning guides written from inside the trip. Skip-the-line advice, where to stay, what to skip, what to pair. Madrid, Bangkok, Bristol, Cape Town, and 80 other cities.',
  alternates: { canonical: SITE_URL },
};

export const revalidate = 3600;

export default async function HomePage() {
  const guides = await fetchFeaturedGuides(12);

  return (
    <article className="max-w-page mx-auto px-5 py-8 sm:py-12">
      {/* === Hero =========================================================
          One-line H1 + lede + search input. The H1 sells the editorial
          point of view in seven words. The lede names what the site
          actually does. The search input is the primary CTA; the
          destination grid below it is the fallback for visitors who
          want to browse. */}
      <header className="max-w-3xl">
        <h1 className="text-display text-ink-deep leading-none tracking-tight">
          Travel guides written by someone who has been.
        </h1>
        <p className="mt-4 text-prose text-slate leading-relaxed max-w-prose">
          No affiliate sponsorship. American voice. {guides.length}+ guides
          covering where to stay, what to skip, and what to pair, written
          from inside the trip.
        </p>

        <form
          action="/search"
          className="mt-6 flex flex-col sm:flex-row gap-2"
          role="search"
        >
          <label className="sr-only" htmlFor="home-search">
            Search a city
          </label>
          <div className="relative flex-1">
            <span
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              id="home-search"
              name="q"
              type="search"
              inputMode="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Where are you going? Try Madrid, Bangkok, or Bristol"
              className="
                w-full pl-10 pr-3 py-3
                rounded-md border border-sand bg-white
                text-prose text-ink-deep placeholder:text-muted
                focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10
                transition-colors
              "
            />
          </div>
          <button
            type="submit"
            className="
              px-5 py-3 rounded-md bg-teal text-white font-medium
              hover:bg-teal/90 transition-colors
              focus:outline-none focus:ring-2 focus:ring-teal/30
            "
          >
            Search
          </button>
        </form>
      </header>

      {/* === Featured destinations ========================================
          Photo cards for the most-recently-touched featured guides. The
          recency sort matches /lists so the visitor sees the same
          freshness signal in both surfaces. */}
      <section className="mt-12 sm:mt-16">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-h2 text-ink-deep leading-tight">
            Pick a destination
          </h2>
          <Link
            href="/lists"
            className="text-small text-teal hover:underline"
          >
            See all guides →
          </Link>
        </header>

        {guides.length === 0 ? (
          <p className="mt-4 text-slate">
            No published guides yet. Check back soon.
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guides.map(g => (
              <DestinationCard key={g.slug} guide={g} />
            ))}
          </ul>
        )}
      </section>

      {/* === Trust strip ================================================ */}
      <section className="mt-12 sm:mt-16 border-t border-sand pt-8">
        <h2 className="text-h3 text-ink-deep">Why I write these guides</h2>
        <p className="mt-3 text-prose text-slate leading-relaxed max-w-prose">
          I write these for the kind of traveler who wants to see the famous
          stuff without queuing for it, and who would rather read a
          Wikipedia tab than follow a guide. The destinations I have
          actually been to get the full writeup. The ones I am still
          planning get a working pin list. The line between the two is
          a checkbox in the editor, not an act of marketing.
        </p>
        <p className="mt-3 text-small text-muted">
          No affiliate sponsorship. American spelling. Updated as I go.
        </p>
      </section>

      {/* === Atlas teaser ================================================
          Small text-only teaser linking to the globe surface. The
          previous home was the globe; this preserves the spinner-view
          for visitors who want to wander rather than plan. */}
      <section className="mt-12 sm:mt-16 border-t border-sand pt-8">
        <Link
          href="/atlas"
          className="
            group flex items-baseline justify-between gap-4 flex-wrap
            hover:text-teal transition-colors
          "
        >
          <div>
            <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors">
              Or wander the whole atlas →
            </h2>
            <p className="mt-2 text-prose text-slate leading-relaxed max-w-prose">
              Every city in the atlas on a 3D globe. Teal dots are places
              I have been. Click any dot to open the city page.
            </p>
          </div>
          <span
            aria-hidden
            className="text-h2 text-teal opacity-60 group-hover:opacity-100 transition-opacity"
          >
            🌍
          </span>
        </Link>
      </section>
    </article>
  );
}

// === DestinationCard ========================================================
// Featured-guide photo card. Image-led, title-second, one-line lede
// third. Whole card is the link; hover lifts the shadow and tints the
// title teal to telegraph clickability. Falls back to a flat tile when
// the guide has no heroImage so the visual rhythm holds.
function DestinationCard({
  guide,
}: {
  guide: import('@/lib/featuredGuides').FeaturedGuide;
}) {
  return (
    <li>
      <Link
        href={`/lists/${guide.slug}`}
        className="
          group block overflow-hidden rounded-lg border border-sand bg-white
          shadow-sm hover:shadow-paper transition-shadow
          h-full
        "
      >
        {guide.heroImage ? (
          <div className="relative aspect-[16/10] bg-cream-soft overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={guide.heroImage}
              alt=""
              loading="lazy"
              decoding="async"
              width={640}
              height={400}
              className="
                w-full h-full object-cover
                group-hover:scale-[1.02] transition-transform duration-300
              "
            />
          </div>
        ) : (
          <div
            aria-hidden
            className="aspect-[16/10] bg-cream-soft flex items-center justify-center text-h2 text-muted/60"
          >
            🗺️
          </div>
        )}
        <div className="p-4">
          <h3 className="text-h3 text-ink-deep leading-tight group-hover:text-teal transition-colors capitalize">
            {guide.title}
          </h3>
          {guide.description && (
            <p className="mt-2 text-small text-slate leading-snug line-clamp-2">
              {guide.description}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
