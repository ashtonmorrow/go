import type { Metadata } from 'next';
import Link from 'next/link';
import { AUTHOR_ID, WEBSITE_ID } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'About this travel atlas · Mike Lee',
  description:
    'How I research a trip. A working notebook that mixes my Google Maps saved lists, my Atlas Obscura history, the UNESCO list, and Michelin Guide restaurants I have eaten at.',
  alternates: { canonical: 'https://go.mike-lee.me/about' },
  openGraph: {
    type: 'article',
    title: 'About this travel atlas · Mike Lee',
    description:
      'How I research a trip. A working notebook that mixes my Google Maps saved lists, my Atlas Obscura history, the UNESCO list, and Michelin Guide restaurants I have eaten at.',
    url: 'https://go.mike-lee.me/about',
    siteName: 'mike-lee.me',
    publishedTime: '2026-04-26',
    modifiedTime: '2026-05-07',
    authors: ['Mike Lee'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About this travel atlas · Mike Lee',
    description:
      'How I research a trip. A working notebook that mixes my Google Maps saved lists, my Atlas Obscura history, the UNESCO list, and Michelin Guide restaurants I have eaten at.',
  },
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  headline: 'About this travel atlas',
  description:
    'How I research a trip. A working notebook that mixes my Google Maps saved lists, my Atlas Obscura history, the UNESCO list, and Michelin Guide restaurants I have eaten at.',
  datePublished: '2026-04-26',
  dateModified: '2026-05-07',
  inLanguage: 'en',
  isAccessibleForFree: true,
  about: [
    { '@type': 'Thing', name: 'Travel writing' },
    { '@type': 'Thing', name: 'Cultural travel' },
    { '@type': 'Thing', name: 'Cartography' },
    { '@type': 'Thing', name: 'Open data' },
  ],
  // Reference the sitewide Person via @id so search engines reconcile
  // this AboutPage's author with the personJsonLd() emitted from the
  // root layout (which carries sameAs, knowsAbout, etc.).
  author: { '@id': AUTHOR_ID },
  publisher: { '@id': AUTHOR_ID },
  isPartOf: { '@id': WEBSITE_ID },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://go.mike-lee.me/about',
  },
};

export default function AboutPage() {
  return (
    <article className="max-w-prose mx-auto px-5 py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <header className="mb-10">
        <div className="text-small text-muted mb-3">
          <Link href="/cities">Postcards</Link>
          <span className="mx-1.5">/</span>
          <span>About</span>
        </div>
        <h1 className="text-h1 text-ink-deep">About this travel atlas</h1>
        <p className="text-prose text-slate font-normal mt-3 leading-snug">
          How I research a trip. A working notebook that mixes my Google
          Maps saved lists, my Atlas Obscura history, the UNESCO list,
          and Michelin Guide restaurants I have eaten at.
        </p>
        <p className="text-small text-muted mt-4">
          Published April 2026. Updated May 2026. Mike Lee.
        </p>
      </header>

      <section id="why-this-exists" className="scroll-mt-6 mb-10">
        <div className="card p-5 md:p-6 not-prose space-y-4 text-ink leading-relaxed">
          <p>
            I have kept travel notes for years because the useful details
            do not survive in chat threads or scattered Google Maps pins.
            Where the food was actually good. Which neighborhood made
            sense for a one-week stay. Which day-trip was worth two
            trains. Whether a saved place looked better on a map than it
            did in person.
          </p>
          <p>
            This site is the public version of that working system. It is
            not a guidebook. It is closer to a notebook from a traveler
            who plans deliberately, walks when the city allows, takes
            public transit as a practical tool, and books a taxi when
            that is the right call.
          </p>
          <p>
            Some pages are polished travel writing. Some are still
            structured notes with facts, photos, and saved places waiting
            for better prose. I would rather show the state of the
            notebook honestly than make every page sound finished before
            it is useful.
          </p>
        </div>
      </section>

      <nav aria-label="Contents" className="card p-5 mb-10 not-prose">
        <p className="text-micro uppercase tracking-[0.18em] text-muted font-medium mb-3">
          Contents
        </p>
        <ul className="space-y-1.5 text-small">
          <li><a href="#why-this-exists">Why this exists</a></li>
          <li><a href="#four-sources">The four sources I cross-reference</a></li>
          <li><a href="#city-pages">How to read a city page</a></li>
          <li><a href="#maps-lists-pins">Maps, lists, and pins</a></li>
          <li><a href="#sources">Sources and judgment</a></li>
          <li><a href="#stack">Stack and hosting</a></li>
          <li><a href="#contact">If something needs fixing</a></li>
        </ul>
      </nav>

      <div className="space-y-10 text-ink leading-relaxed">
        <section id="four-sources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            The four sources I cross-reference
          </h2>
          <p>
            The atlas grows from four streams. They do not blur on the
            page. A pin can come from any of them, and the cross-product
            is what makes a city like Barcelona or Cape Town more useful
            here than in any one of the sources alone.
          </p>

          <h3 className="text-h3 text-ink-deep mt-6 mb-2">
            Google Maps saved lists
          </h3>
          <p>
            Every{' '}
            <Link href="/cities/bangkok" className="text-teal hover:underline">
              Bangkok
            </Link>{' '}
            food list, every{' '}
            <Link href="/cities/seville" className="text-teal hover:underline">
              Seville
            </Link>{' '}
            café shortlist, every{' '}
            <Link href="/cities/lisbon" className="text-teal hover:underline">
              Lisbon
            </Link>{' '}
            viewpoint pile sits as a private saved list inside my
            Google Maps account. I export them through Google Takeout
            and import each list into the atlas as a curated
            collection. The{' '}
            <Link href="/lists" className="text-teal hover:underline">
              Lists section
            </Link>{' '}
            is the home for these. Most lists mirror a real planning
            thread, not a general-interest collection.
          </p>

          <h3 className="text-h3 text-ink-deep mt-6 mb-2">
            Atlas Obscura history
          </h3>
          <p>
            When I review an entry on Atlas Obscura, their site records
            it. The atlas pulls that history in: every pin tagged
            &ldquo;Atlas Obscura&rdquo; here is one I have actually
            shown up to. The chip is not an aspirational filter. It is
            the intersection of their catalogue with the places I have
            been.
          </p>

          <h3 className="text-h3 text-ink-deep mt-6 mb-2">
            UNESCO World Heritage tracking
          </h3>
          <p>
            I track UNESCO sites I have visited as I go. Each pin with a
            UNESCO ID carries the canonical number in the Facts card,
            and the link goes to the official UNESCO page. The
            &ldquo;visited&rdquo; flag on those pins is meaningful: it
            marks a real visit, not a drive-past.
          </p>

          <h3 className="text-h3 text-ink-deep mt-6 mb-2">
            Michelin Guide restaurants I have eaten at
          </h3>
          <p>
            When the budget allows, I make a point of eating at Michelin
            Guide restaurants in the city. Bib Gourmand entries get
            visited more than starred ones for the obvious reason. The
            atlas only carries Michelin entries I have actually eaten
            at, with the personal review and price tier filled in. The
            rest of the Michelin universe is intentionally absent until
            I get there.
          </p>

          <p className="mt-5">
            A city page like{' '}
            <Link href="/cities/cape-town" className="text-teal hover:underline">
              Cape Town
            </Link>{' '}
            surfaces the Google saved list, any Atlas Obscura sites I
            have logged, the UNESCO sites in or near it, and the
            Michelin restaurants I have eaten at, all at once. That
            cross-section is the planning artifact, not the prose
            around it.
          </p>
        </section>

        <section id="city-pages" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            How to read a city page
          </h2>
          <p>
            A good city page should help you decide whether the place
            belongs in a trip, not decorate it with travel language. The
            About section gives the orientation: what the city is like
            today, what history still shapes it, how it changes if you
            have one or two days instead of one or two weeks.
          </p>
          <p className="mt-4">
            The Why Visit section is about culture, architecture,
            landscape, food, music, museums, books, neighborhoods, and
            nearby routes. The When to Avoid section is blunt by design.
            Crowds, pickpockets, scams, air pollution, difficult
            weather, weak transit, and disappointing tourist zones are
            part of the decision and belong on the page.
          </p>
          <p className="mt-4">
            <Link href="/cities/barcelona" className="text-teal hover:underline">
              Barcelona
            </Link>{' '}
            is not just a Gothic Quarter and Gaudí checklist. It is also
            beaches, commuter rail, wine country, Montserrat, day trips
            to{' '}
            <Link href="/cities/sitges" className="text-teal hover:underline">
              Sitges
            </Link>
            , and the practical reality of pickpockets in the center.
            The page is meant to help someone plan around both truths
            without flattening either.
          </p>
        </section>

        <section id="maps-lists-pins" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            Maps, lists, and pins
          </h2>
          <p>
            Travel planning is spatial. A place that looks essential in
            a list is sometimes awkward once you see where it sits on
            the map. The country globe shows the broader atlas. The pin
            map shows museums, gardens, restaurants, historic sites,
            stations, viewpoints, UNESCO places, saved ideas, and pins
            I have actually visited.
          </p>
          <p className="mt-4">
            The saved-list section on a city or country page surfaces
            anything I keep in a Google Maps list named after that
            place. A list can become a city research page, a food
            shortlist, a day-trip cluster, or a reminder that something
            was saved years ago and still needs a second look.
          </p>
        </section>

        <section id="sources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            Sources and judgment
          </h2>
          <p>
            Public reference data comes from Wikidata, Wikipedia, NASA
            POWER, OpenStreetMap, UNESCO, the Atlas Obscura catalogue,
            the Michelin Guide, Google Places, and other open or cited
            sources. The full list is on the{' '}
            <Link href="/credits" className="text-teal hover:underline">
              credits page
            </Link>{' '}
            with each license noted.
          </p>
          <p className="mt-4">
            Photographs, ratings, lists, reviews, and practical
            judgments are mine. The two sources do not get confused on a
            page. A population figure is a reference fact. Whether a
            place is worth building a trip around is a judgment, and it
            should explain itself.
          </p>
          <p className="mt-4">
            I expect the site to keep changing. Hours, prices, airline
            rules, visa policies, and safety conditions move faster than
            a personal site can guarantee. Treat this as a well-kept
            notebook and check the live source before booking.
          </p>
        </section>

        <section id="stack" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Stack and hosting</h2>
          <p>
            I use this project partly to test ideas for my professional
            career. The architecture choices, the editorial tone, the
            data pipeline, the way structured fields meet personal
            prose: these are problems I think about in my day job and
            the site is where I practice them in public.
          </p>
          <Table
            head={['Component', 'Implementation']}
            rows={[
              ['Framework', 'Next.js 15 with React 19 and TypeScript'],
              ['Data', 'Supabase Postgres'],
              ['Images', 'Supabase Storage, Wikimedia Commons, personal photos'],
              ['Maps', 'MapLibre GL with OpenStreetMap tiles'],
              ['Climate', 'NASA POWER and Open-Meteo'],
              ['Structured facts', 'Wikidata, Wikipedia, curated overrides'],
              ['Hosting', 'Vercel'],
              ['Repository', 'GitHub'],
            ]}
          />
        </section>

        <section id="contact" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            If something needs fixing
          </h2>
          <p>
            If a fact is wrong, an attribution missing, a review unfair,
            or a photo includes you and you would prefer it not,{' '}
            <a
              href="https://www.linkedin.com/in/mikelee89/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal hover:underline"
            >
              message me on LinkedIn
            </a>
            . The reviews are my own and I am happy to clarify how I
            arrived at one. There are no comments here on purpose; a
            direct line is the way to reach me.
          </p>
        </section>
      </div>
    </article>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="not-prose mt-4 overflow-x-auto">
      <table className="w-full text-small border-collapse">
        <thead>
          <tr>
            {head.map(h => (
              <th
                key={h}
                className="text-left text-micro uppercase tracking-[0.14em] text-muted font-medium pb-2 pr-4 border-b border-sand"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-sand last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={
                    'py-3 pr-4 align-top ' +
                    (j === 0 ? 'text-ink-deep font-medium whitespace-nowrap' : 'text-ink')
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
