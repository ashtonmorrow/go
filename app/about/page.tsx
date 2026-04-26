import type { Metadata } from 'next';
import Link from 'next/link';

// === SEO + structured data =================================================
// Metadata + JSON-LD scaffolding stays in place so the page indexes
// properly. The body is a SKELETON — section headings + one-line
// placeholders Mike will replace with co-written copy via voice-to-text.
// No em dashes anywhere; simple punctuation only.
export const metadata: Metadata = {
  title: 'About this travel atlas · Mike Lee',
  description:
    'How a Notion workspace of 1,341 cities became an interactive travel atlas. Data model, postcard design, MapLibre globe.',
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
    title: 'About this travel atlas. Mike Lee.',
    description:
      'How a Notion workspace of 1,341 cities became an interactive travel atlas.',
    url: 'https://go.mike-lee.me/about',
    siteName: 'mike-lee.me',
    publishedTime: '2026-04-25',
    authors: ['Mike Lee'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About this travel atlas. Mike Lee.',
    description:
      'How a Notion workspace of 1,341 cities became an interactive travel atlas.',
  },
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'About this travel atlas',
  alternativeHeadline: 'A Notion workspace of 1,341 cities, rendered as a website',
  description:
    'A walkthrough of the travel atlas. Data model, postcard front-end, MapLibre globe.',
  datePublished: '2026-04-25',
  dateModified: '2026-04-25',
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
        <h1 className="text-h1 text-ink-deep">About this travel atlas.</h1>
        <p className="text-h3 text-slate font-normal mt-3">
          Built on Notion. Connected to 1,341 cities.
        </p>
        <p className="text-small text-muted mt-4">
          Published April 2026. Mike Lee.
        </p>
      </header>

      {/* Placeholder banner. Removed once the article is co-written. */}
      <div className="card p-4 mb-10 not-prose text-small text-slate">
        This page is a work in progress. The structure below is a placeholder.
        Real copy will be co-written and published soon.
      </div>

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

      {/* === Article body — placeholder sections, no em dashes ============= */}
      <div className="space-y-8 text-ink leading-relaxed">

        <section id="about" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">What this is</h2>
          <p>
            This is a personal travel atlas. Cities, countries, postcards, and a
            globe. Sourced from a Notion workspace.
          </p>
          <p className="mt-4 text-muted text-small italic">
            Section to be co-written.
          </p>
        </section>

        <section id="data" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The data model</h2>
          <p>
            Two Notion databases sit at the centre of the project. Cities, with
            1,341 records. Countries, with 213 records.
          </p>
          <p className="mt-4 text-muted text-small italic">
            Section to be co-written.
          </p>
        </section>

        <section id="postcards" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The postcards</h2>
          <p>
            Each city renders as a postcard. Stamp in the corner, postmark, typed
            facts laid out as address lines. Hover to flip and see a small map.
          </p>
          <p className="mt-4 text-muted text-small italic">
            Section to be co-written.
          </p>
        </section>

        <section id="map" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The map</h2>
          <p>
            A 3D globe of every city. Drag to rotate, scroll to zoom. Click a pin
            to highlight that city&apos;s sister cities and draw the connections
            between them.
          </p>
          <p className="mt-4 text-muted text-small italic">
            Section to be co-written.
          </p>
        </section>

        <section id="stack" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Stack and hosting</h2>
          <p>The full stack. Free tier across the board.</p>
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
