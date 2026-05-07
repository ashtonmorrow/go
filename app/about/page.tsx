import type { Metadata } from 'next';
import Link from 'next/link';
import { AUTHOR_ID, WEBSITE_ID } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'About Postcards · Mike Lee',
  description:
    'A personal travel atlas built from more than a decade of notes, maps, photos, and practical city research.',
  keywords: [
    'travel atlas',
    'cultural travel',
    'city guides',
    'travel notes',
    'map travel project',
    'supabase travel database',
  ],
  alternates: { canonical: 'https://go.mike-lee.me/about' },
  openGraph: {
    type: 'article',
    title: 'About Postcards · Mike Lee',
    description:
      'A personal travel atlas built from more than a decade of notes, maps, photos, and practical city research.',
    url: 'https://go.mike-lee.me/about',
    siteName: 'mike-lee.me',
    publishedTime: '2026-04-26',
    modifiedTime: '2026-05-04',
    authors: ['Mike Lee'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Postcards · Mike Lee',
    description:
      'A personal travel atlas built from more than a decade of notes, maps, photos, and practical city research.',
  },
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  headline: 'About Postcards',
  description:
    'A personal travel atlas built from more than a decade of notes, maps, photos, and practical city research.',
  datePublished: '2026-04-26',
  dateModified: '2026-05-04',
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
  // root layout (which carries sameAs, knowsAbout, etc.). Inline
  // duplication of name/url here would create a competing entity.
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
        <h1 className="text-h1 text-ink-deep">About Postcards</h1>
        <p className="text-h3 text-slate font-normal mt-3">
          A public version of my travel notes, built from cities, maps,
          saved places, and the things I want to remember before I book.
        </p>
        <p className="text-small text-muted mt-4">
          Published April 2026. Updated May 2026. Mike Lee.
        </p>
      </header>

      <section id="what-this-is" className="scroll-mt-6 mb-10">
        <div className="card p-5 md:p-6 not-prose space-y-4 text-ink leading-relaxed">
          <p>
            I have kept travel notes for years because the useful details are
            easy to lose. I want to remember which neighborhood made sense,
            which museum needed more time, which airport transfer was
            annoying, which beach was worth the train ride, and which saved
            place looked better on a map than it did in person.
          </p>
          <p>
            This site turns that private system into a public atlas. It is not
            a neutral guidebook and it is not a ranked list of places to see.
            It is closer to a working notebook from a traveler who usually
            explores on foot, uses public transportation when it is safe and
            convenient, and takes a taxi or private transfer when that is the
            sensible choice.
          </p>
          <p>
            Some pages are polished travel writing. Some are still structured
            notes with facts, photos, and saved places waiting for better
            prose. I would rather show the state of the notebook honestly than
            make every page sound finished before it is useful.
          </p>
        </div>
      </section>

      <nav aria-label="Contents" className="card p-5 mb-10 not-prose">
        <p className="text-micro uppercase tracking-[0.18em] text-muted font-medium mb-3">
          Contents
        </p>
        <ul className="space-y-1.5 text-small">
          <li><a href="#what-this-is">What this is</a></li>
          <li><a href="#what-i-track">What I track</a></li>
          <li><a href="#city-pages">How to read the city pages</a></li>
          <li><a href="#maps-lists-pins">Maps, lists, and pins</a></li>
          <li><a href="#sources">Sources and judgment</a></li>
          <li><a href="#stack">Stack and hosting</a></li>
          <li><a href="#resources">Resources</a></li>
        </ul>
      </nav>

      <div className="space-y-10 text-ink leading-relaxed">
        <section id="what-i-track" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">What I Track</h2>
          <p>
            The database starts with cities and countries, then connects them
            to pins, saved lists, climate data, flags, photos, and practical
            travel fields. A city page can hold the obvious reference data,
            such as population, coordinates, time zone, climate, and country.
            It can also hold the parts that matter more when I am planning a
            real trip: why I would go, what might make me avoid it, when the
            weather is difficult, and which nearby places make sense by train,
            ferry, bus, or short drive.
          </p>
          <p className="mt-4">
            The country records keep the slow logistics in one place. Visa
            rules, tap water, plug types, voltage, driving side, currency, and
            language are not glamorous details, but they shape the first hour
            of almost every trip. Keeping them structured means the city pages
            can stay focused on place rather than repeating the same basics.
          </p>
        </section>

        <section id="city-pages" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            How to Read the City Pages
          </h2>
          <p>
            A good city page should help you decide whether a place belongs in
            a trip, not simply decorate it with travel language. The About
            section gives the main orientation: what the city is like today,
            what history still shapes it, and how it changes if you have one
            or two days instead of one or two weeks. The Why Visit section is
            about culture, architecture, landscape, food, music, museums,
            books, neighborhoods, and nearby routes. The Avoid section is
            blunt by design. Crowds, pickpockets, scams, air pollution,
            difficult weather, weak transit, and disappointing tourist zones
            are part of the decision.
          </p>
          <p className="mt-4">
            I try to keep the tone useful. Barcelona, for example, is not just
            a Gothic Quarter and Gaudi checklist. It is also beaches, commuter
            rail, wine country, Montserrat, day trips to Sitges, and the
            practical reality of crowds and pickpockets in the center. The
            page should help someone plan around both truths.
          </p>
        </section>

        <section id="maps-lists-pins" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">
            Maps, Lists, and Pins
          </h2>
          <p>
            The map views are there because travel planning is spatial. A
            place that looks essential in a list can be awkward once you see
            where it sits. The city globe shows the broader atlas. The pin
            map shows museums, gardens, restaurants, historic sites, stations,
            viewpoints, UNESCO places, saved ideas, and places I have actually
            visited.
          </p>
          <p className="mt-4">
            The saved lists come from Google Maps, but the goal is to make
            them more useful than a private pile of stars. A list can become a
            city research page, a food shortlist, a day-trip cluster, or a
            reminder that something was saved years ago and still needs a
            second look.
          </p>
        </section>

        <section id="sources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Sources and Judgment</h2>
          <p>
            Public facts come from sources such as Wikidata, Wikipedia, NASA
            POWER, OpenStreetMap, UNESCO, and other open or cited reference
            sources. Personal photographs, ratings, lists, reviews, and
            practical judgments come from my own travel notes. The two should
            not be confused. A population figure is a reference fact. Whether
            a place is worth building a trip around is a judgment, and it
            should explain itself.
          </p>
          <p className="mt-4">
            I expect the site to keep changing. Hours, prices, airline rules,
            visa policies, and safety conditions move faster than a personal
            site can guarantee. Treat this as a well-kept notebook and check
            live details before you plan around them.
          </p>
        </section>

        <section id="stack" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Stack and Hosting</h2>
          <p>
            The technical side matters because it lets the project stay
            maintainable. The goal is not to build a travel startup. It is to
            keep one careful set of notes online without turning it into a
            second job.
          </p>
          <Table
            head={['Component', 'Implementation']}
            rows={[
              ['Framework', 'Next.js with React and TypeScript'],
              ['Data', 'Supabase Postgres, migrated from an older Notion setup'],
              ['Images', 'Supabase Storage, Wikimedia Commons, and personal photos'],
              ['Maps', 'MapLibre GL and OpenStreetMap tiles'],
              ['Climate', 'NASA POWER and Open-Meteo where available'],
              ['Structured facts', 'Wikidata, Wikipedia, and curated overrides'],
              ['Hosting', 'Vercel'],
              ['Repository', 'GitHub'],
            ]}
          />
        </section>

        <section id="resources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Resources</h2>
          <ul className="list-disc list-outside pl-6 space-y-2">
            <li>
              <a href="https://supabase.com/docs" target="_blank" rel="noopener noreferrer">
                Supabase documentation
              </a>
            </li>
            <li>
              <a href="https://maplibre.org/maplibre-gl-js/docs/" target="_blank" rel="noopener noreferrer">
                MapLibre GL JS documentation
              </a>
            </li>
            <li>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                OpenStreetMap
              </a>
            </li>
            <li>
              <a href="https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service" target="_blank" rel="noopener noreferrer">
                Wikidata SPARQL query service
              </a>
            </li>
            <li>
              <a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">
                NASA POWER
              </a>
            </li>
            <li>
              <a href="https://www.linkedin.com/in/mikelee89/" target="_blank" rel="noopener noreferrer">
                Mike Lee on LinkedIn
              </a>
            </li>
          </ul>
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
