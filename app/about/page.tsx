import type { Metadata } from 'next';
import Link from 'next/link';

// === SEO + structured data =================================================
// Page voice for /about is first-person and conversational, matching the
// way Mike actually writes (the postcard prose voice rules — third
// person, no "I" — apply to city flavor cards, not to this page).
// No em dashes anywhere; periods and commas instead.
export const metadata: Metadata = {
  title: 'About Postcards · Mike Lee',
  description:
    'Why a Notion workspace of 1,341 cities and 213 countries became an interactive atlas of postcards, a globe, and travel notes.',
  keywords: [
    'notion as cms',
    'next.js notion',
    'travel atlas',
    'maplibre globe',
    'wikidata',
    'köppen climate',
  ],
  alternates: { canonical: 'https://go.mike-lee.me/about' },
  openGraph: {
    type: 'article',
    title: 'About Postcards. Mike Lee.',
    description:
      'Why a Notion workspace of 1,341 cities became an interactive atlas of postcards.',
    url: 'https://go.mike-lee.me/about',
    siteName: 'mike-lee.me',
    publishedTime: '2026-04-26',
    authors: ['Mike Lee'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Postcards. Mike Lee.',
    description:
      'Why a Notion workspace of 1,341 cities became an interactive atlas of postcards.',
  },
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'About Postcards',
  alternativeHeadline: 'A Notion workspace of 1,341 cities, rendered as a website',
  description:
    'A walkthrough of the travel atlas. Data model, postcard front-end, MapLibre globe.',
  datePublished: '2026-04-26',
  dateModified: '2026-04-26',
  inLanguage: 'en',
  isAccessibleForFree: true,
  proficiencyLevel: 'Intermediate',
  about: [
    { '@type': 'Thing', name: 'Notion API' },
    { '@type': 'Thing', name: 'Next.js' },
    { '@type': 'Thing', name: 'MapLibre GL' },
    { '@type': 'Thing', name: 'Wikidata' },
    { '@type': 'Thing', name: 'Travel atlas' },
  ],
  author: {
    '@type': 'Person',
    name: 'Mike Lee',
    url: 'https://www.linkedin.com/in/mikelee89/',
  },
  publisher: {
    '@type': 'Person',
    name: 'Mike Lee',
    url: 'https://mike-lee.me/',
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://go.mike-lee.me/about',
  },
};

// =============================================================================

export default function AboutPage() {
  return (
    <article className="max-w-prose mx-auto px-5 py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* === Header === */}
      <header className="mb-10">
        <div className="text-small text-muted mb-3">
          <Link href="/cities">Postcards</Link>
          <span className="mx-1.5">/</span>
          <span>About</span>
        </div>
        <h1 className="text-h1 text-ink-deep">About Postcards</h1>
        <p className="text-h3 text-slate font-normal mt-3">
          Built on Notion. Connected to 1,341 cities and 213 countries.
        </p>
        <p className="text-small text-muted mt-4">
          Published April 2026. Mike Lee.
        </p>
      </header>

      {/* === The lede ===
          Mike's actual intro from the Figma mock. First person, casual,
          tells the origin story. Card-styled callout to set it apart from
          the body sections that follow. */}
      <section id="about" className="scroll-mt-6 mb-10">
        <div className="card p-5 md:p-6 not-prose space-y-4 text-ink leading-relaxed">
          <p>
            I keep all my notes about travelling in Notion. Originally this
            collection started as an Airtable that I used to keep
            reservations, and itinerary details. Notion works alot better
            for my purpose today because it is easier to collaborate with
            small groups in whereas Airtable charges per seat.
          </p>
          <p>
            After many cancelled reservations and uncomfortable nights in
            non reclining seats, I figured it might be cool to have a more
            structured front end to bring this data and other data sources
            together in a single place.
          </p>
        </div>
      </section>

      {/* === Table of contents === */}
      <nav aria-label="Contents" className="card p-5 mb-10 not-prose">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-3">
          Contents
        </p>
        <ul className="space-y-1.5 text-small">
          <li><a href="#about">What this is</a></li>
          <li><a href="#data">The data model</a></li>
          <li><a href="#postcards">The postcards</a></li>
          <li><a href="#map">The map</a></li>
          <li><a href="#stack">Stack and hosting</a></li>
          <li><a href="#resources">Resources</a></li>
        </ul>
      </nav>

      {/* === Article body ============================================== */}
      <div className="space-y-10 text-ink leading-relaxed">

        <section id="data" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The data model</h2>
          <p>
            Two databases sit at the centre of all this, both in Notion. One
            for cities, one for countries. They link to each other so I only
            have to fill out the country logistics once, and every city
            inside that country picks them up.
          </p>
          <p className="mt-4">
            The cities database has the structured stuff you would expect:
            population, founding date, climate, time zone, lat and long. The
            countries database has the practical bits that actually matter
            when you are planning a trip. Visa requirements for a US
            passport. Whether the tap water is safe to drink. Plug types
            and voltage for charging your stuff. Which side of the road
            they drive on.
          </p>
          <p className="mt-4">
            Most of this data is not me typing things in. The structured
            facts come from Wikidata and Wikipedia. The climate numbers
            come from Open-Meteo. I curate the things only I can know,
            like which places I have actually been to and which Google
            Maps lists go with which city.
          </p>
        </section>

        <section id="postcards" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The postcards</h2>
          <p>
            Every city is a Notion page that gets rendered on this site as a
            postcard. Country flag as the stamp, postmark cancellation over
            the top that reads VISITED or PLANNING depending on whether I
            have been there or want to go.
          </p>
          <p className="mt-4">
            Hover any postcard and it flips around to show a little map of
            where the city actually is. Click through and you get the full
            page with all the structured data, my saved Google Maps list
            for that city if there is one, and a list of its sister cities
            you can jump to from there.
          </p>
        </section>

        <section id="map" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The map</h2>
          <p>
            The map is a 3D globe of every city in the atlas. Drag to spin
            it around, scroll to zoom in. The pins are colour coded. Teal
            for cities I have been to, slate for cities I want to go, and
            small sand-coloured dots for the wider sister-city network that
            connects everything together.
          </p>
          <p className="mt-4">
            Click any pin and that city gets selected. Its sister cities
            highlight in amber and dashed lines draw between them, so you
            can see the trade and twinning relationships across continents.
            A small card pops up in the corner with a link straight to
            that city&apos;s postcard.
          </p>
        </section>

        <section id="stack" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Stack and hosting</h2>
          <p>
            Everything here runs on free tiers. Nothing on this site costs
            me anything to keep online.
          </p>
          <Table
            head={['Component', 'Implementation']}
            rows={[
              ['Framework', 'Next.js 15 with React 19'],
              ['Language', 'TypeScript 5.7'],
              ['Styling', 'Tailwind CSS 3.4'],
              ['Data', 'Notion REST API via @notionhq/client'],
              ['Map', 'MapLibre GL JS v5 with react-map-gl v8'],
              ['Tiles', 'OpenFreeMap. Free, no API key.'],
              ['Hosting', 'Vercel. Free tier.'],
              ['Repository', 'GitHub. Public.'],
            ]}
          />
        </section>

        <section id="resources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Resources</h2>
          <ul className="list-disc list-outside pl-6 space-y-2">
            <li>
              <a href="https://developers.notion.com/" target="_blank" rel="noopener noreferrer">
                Notion API documentation
              </a>
            </li>
            <li>
              <a href="https://maplibre.org/maplibre-gl-js/docs/" target="_blank" rel="noopener noreferrer">
                MapLibre GL JS docs
              </a>
            </li>
            <li>
              <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
                OpenFreeMap
              </a>
            </li>
            <li>
              <a href="https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service" target="_blank" rel="noopener noreferrer">
                Wikidata SPARQL query service
              </a>
            </li>
            <li>
              <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                Open-Meteo
              </a>
            </li>
            <li>
              <a href="https://ski.mike-lee.me/readme.html" target="_blank" rel="noopener noreferrer">
                ski.mike-lee.me/readme.html
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
                className="text-left text-[10px] uppercase tracking-[0.14em] text-muted font-medium pb-2 pr-4 border-b border-sand"
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
