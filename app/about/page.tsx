import type { Metadata } from 'next';
import Link from 'next/link';

// === SEO + structured data =================================================
// Modeled on https://ski.mike-lee.me/readme.html — TechArticle JSON-LD,
// Open Graph + Twitter cards, canonical URL, dates. Next.js's metadata
// API picks up most of these and renders them in <head> automatically.
export const metadata: Metadata = {
  title: 'About go.mike-lee.me · A travel atlas built on Notion',
  description:
    'How a Notion workspace of 1,341 cities and 213 countries became an interactive travel atlas — tech stack, data enrichment pipeline, postcard design, and globe rendering.',
  keywords: [
    'notion as cms',
    'next.js notion',
    'travel atlas',
    'maplibre globe',
    'wikidata enrichment',
    'köppen climate',
    'claude code',
    'vibe coding',
  ],
  alternates: { canonical: 'https://go.mike-lee.me/about' },
  openGraph: {
    type: 'article',
    title: 'About go.mike-lee.me — a travel atlas built on Notion',
    description:
      'How a Notion workspace of 1,341 cities and 213 countries became an interactive travel atlas. Stack, enrichment, postcard design, globe rendering.',
    url: 'https://go.mike-lee.me/about',
    siteName: 'go.mike-lee.me',
    publishedTime: '2026-04-25',
    authors: ['Mike Lee'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About go.mike-lee.me',
    description:
      'How a Notion workspace of 1,341 cities became an interactive travel atlas.',
  },
};

// === TechArticle JSON-LD ===
// Same shape as ski.mike-lee.me/readme.html so search engines and link
// previewers parse this as a technical article rather than a generic page.
const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'About go.mike-lee.me — a travel atlas built on Notion',
  alternativeHeadline: 'How 1,341 cities and 213 countries became an interactive atlas',
  description:
    'A walkthrough of go.mike-lee.me — the data model in Notion, the enrichment pipeline that fills in structured facts and prose, the postcard front-end, and the MapLibre globe view.',
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
      {/* Embed the JSON-LD inline; Next.js will render it inside <head> via
          the metadata API for the standard OG/Twitter tags, but the
          TechArticle structured data has to live in the body as a script. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* === Article header === */}
      <header className="mb-10">
        <div className="text-small text-muted mb-3">
          <Link href="/cities">Postcards</Link>
          <span className="mx-1.5">/</span>
          <span>About</span>
        </div>
        <h1 className="text-h1 text-ink-deep">About go.mike-lee.me</h1>
        <p className="text-h3 text-slate font-normal mt-3">
          A travel atlas built on Notion.
        </p>
        <p className="text-small text-muted mt-4">
          Published April 2026 · Mike Lee · Updated regularly
        </p>
      </header>

      {/* === Table of contents === */}
      <nav
        aria-label="Contents"
        className="card p-5 mb-10 not-prose"
      >
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-3">
          Contents
        </p>
        <ul className="space-y-1.5 text-small">
          <li><a href="#about">What this site is</a></li>
          <li><a href="#data-model">The data model</a></li>
          <li><a href="#enrichment">Filling in the data</a></li>
          <li><a href="#postcards">The postcard front-end</a></li>
          <li><a href="#map">The map view</a></li>
          <li><a href="#stack">Stack and hosting</a></li>
          <li><a href="#claude">Working with Claude as a build collaborator</a></li>
          <li><a href="#diy">How you can build this yourself</a></li>
          <li><a href="#resources">Further resources</a></li>
        </ul>
      </nav>

      {/* === Article body =====================================================
          Tone: third-person, declarative, concrete. Concrete numbers and
          named technologies wherever possible. No "I"; "you" only for
          DIY-section advice. */}
      <div className="space-y-8 text-ink leading-relaxed">

        <section id="about" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">What this site is</h2>
          <p>
            go.mike-lee.me is a personal travel atlas — a connected database of
            1,341 cities and 213 countries, presented as a wall of postcards
            and an interactive globe. Most travel sites are essays organised by
            destination. This one is the inverse: a structured workspace that
            happens to render as a website. Every postcard is a Notion page,
            every filter is a Notion property, and every change to the
            workspace appears on the live site within an hour.
          </p>
          <p className="mt-4">
            The site started as a hand-curated list of about 280 places: cities
            visited, cities planned, and cities saved with Google Maps lists.
            That list was then expanded automatically: every visited city
            pulled in its sister cities (the formal town-twinning relationships
            many cities maintain), which pulled in another 1,060 places, each
            of which received a structured facts pass and an AI-written prose
            pass to bring them to the same depth as the originals.
          </p>
        </section>

        <section id="data-model" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The data model</h2>
          <p>
            Two Notion databases sit at the centre of the project. Both are
            queried through the official Notion API; the front-end never holds
            a copy of the data — it queries Notion at request time, with
            Next.js incremental static regeneration caching responses for an
            hour at a time.
          </p>
          <Table
            head={['Database', 'Records', 'Purpose']}
            rows={[
              ['Cities', '1,341', 'One row per place, with structured facts (population, climate, language) and AI-written prose (about, why visit, when to avoid).'],
              ['Countries', '213', 'Travel logistics — currency, language, plug types, voltage, tap water safety, visa requirement for a US passport, emergency number, calling code.'],
            ]}
          />
          <p className="mt-4">
            City rows link to country rows through a Notion relation property,
            so currency and language flow onto every postcard automatically
            without duplication. Cities also reference one another through the
            <Code>Sister Cities</Code> relation, which is what powers the
            highlight-on-click behaviour on the map.
          </p>
          <p className="mt-4">
            A small static lookup outside Notion handles the one trait that
            Notion does not store: which side of the road each country drives
            on. The lookup is keyed by ISO 3166-1 alpha-2 code and includes
            the seventy-odd left-hand-drive countries (the British Isles,
            Japan, India, Indonesia, Australia, most of southern and eastern
            Africa, the former British Caribbean). Every other country
            defaults to right.
          </p>
        </section>

        <section id="enrichment" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Filling in the data</h2>
          <p>
            Originally the workspace was hand-curated. Today most of it is
            sourced and enriched from open data on the web. The enrichment
            pipeline runs in two passes against every city.
          </p>
          <h3 className="text-h3 text-ink-deep mt-6 mb-2">Pass 1 — structured facts</h3>
          <p>
            Each city is matched to a Wikidata entity by Wikipedia article
            title (with disambiguation handling for cases like Bath, Somerset
            versus Bath bus station). Wikidata then provides the canonical
            structured properties that don&apos;t change much: population (P1082),
            area (P2046), elevation (P2044), founding date (P571), demonym
            (P1549), mayor (P6), motto (P1451), nicknames (P1449), and the
            Köppen climate classification.
          </p>
          <Table
            head={['Source', 'Used for']}
            rows={[
              ['Wikidata SPARQL', 'Structured properties on every city — population, area, founding, etc.'],
              ['Wikipedia REST API', 'Article lede summary, canonical URL, hero image, disambiguation lookup.'],
              ['Open-Meteo Climate API', 'Average high, average low, annual rainfall — historical climatology aggregated to monthly means.'],
              ['flagcdn.com', 'Country flag images at 640px — used in postcard stamps and map popups.'],
              ['OpenFreeMap', 'Vector map tiles for the globe view (positron style).'],
              ['Wikimedia Commons', 'Free-to-use city flag images where they exist on Wikidata.'],
            ]}
          />
          <h3 className="text-h3 text-ink-deep mt-6 mb-2">Pass 2 — prose fields</h3>
          <p>
            Nine prose fields on every postcard are written by Claude with the
            structured facts and the Wikipedia summary as grounding context.
            The fields are: <Code>about</Code>, <Code>Why Visit?</Code>,
            <Code>avoid</Code>, hot-season name and description, cold-season
            name and description, <Code>LanguageLong</Code>, and a memorable
            quote. Generation is hemisphere-aware (Cape Town&apos;s summer is
            December–February, not June–August) and avoids first-person voice
            so the writing reads as a guidebook entry rather than a diary.
          </p>
        </section>

        <section id="postcards" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The postcard front-end</h2>
          <p>
            Each city renders as a postcard back: city name as a typed
            address, country in small caps below, country flag as a postage
            stamp in the upper-right corner, a round &quot;VISITED&quot; or
            &quot;PLANNING&quot; postmark cancellation overlapping the stamp,
            and the city&apos;s structured facts laid out as typed address
            lines (population, average temperature, currency, language, drive
            side, climate code).
          </p>
          <p className="mt-4">
            The aesthetic is achieved with native CSS — no images. The stamp
            edges are scalloped using a CSS mask of stacked radial gradients
            that punch out semicircular bites along all four edges. The
            postmark cancellation is an inline SVG with curved text on top and
            bottom arcs and a horizontal cancellation bar through the middle.
            Each postcard is rotated by a deterministic angle in the range
            ±1.2° based on a hash of the city&apos;s id, so the grid feels
            like a wall of hand-placed cards rather than a spreadsheet.
          </p>
          <p className="mt-4">
            On hover, the card flips on its Y axis to reveal a small zoomed
            map of the city&apos;s location. The map uses a 3×3 grid of
            OpenStreetMap raster tiles, anchored so the city&apos;s exact
            pixel sits dead-centre under the pin. (Earlier versions used a
            single tile with <Code>background-size: cover</Code>, which on a
            non-square card couldn&apos;t pan to the city&apos;s coordinates;
            the 3×3 grid solves it by always having enough map around the
            point of interest.)
          </p>
        </section>

        <section id="map" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">The map view</h2>
          <p>
            The map at <Link href="/map">/map</Link> is built on MapLibre GL
            JS v5 with vector tiles served from OpenFreeMap. It defaults to a
            true 3D globe projection — drag to rotate the planet, scroll to
            zoom, pinch on touch — with a one-click toggle to flat
            (Mercator). MapLibre animates between the two projections, so
            switching feels like watching a paper map curl into a sphere.
          </p>
          <p className="mt-4">
            All 1,341 cities render as a single GeoJSON Source with a circle
            Layer. Pin colour and size are driven by feature properties
            through MapLibre paint expressions: visited cities are teal,
            planned cities are slate, and sister-city placeholders are small
            sand-grey dots, dimmed so the curated places visually pop.
            Clicking a pin selects it: the selected city turns dark, its
            sister cities flash to amber with thicker rings, and dashed
            amber lines draw between the selected city and each sister.
          </p>
          <p className="mt-4">
            Selection state lives on the GeoJSON features themselves rather
            than as separate React markers. Toggling a selection just rebuilds
            the source, which MapLibre re-renders in a single GPU draw call
            — comfortable with all 1,341 points even on entry-level mobile
            hardware.
          </p>
        </section>

        <section id="stack" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Stack and hosting</h2>
          <Table
            head={['Component', 'Implementation']}
            rows={[
              ['Framework', 'Next.js 15 (App Router) on React 19'],
              ['Language', 'TypeScript 5.7'],
              ['Styling', 'Tailwind CSS 3.4 with a small set of design tokens (palette, type scale, shadows)'],
              ['Data', 'Notion REST API via @notionhq/client; React cache() and a withRetry wrapper for rate-limited calls'],
              ['Map', 'MapLibre GL JS v5 + react-map-gl v8 (loaded via dynamic import to avoid SSR)'],
              ['Tiles', 'OpenFreeMap — free, no API key, OSM-derived vector tiles'],
              ['Hosting', 'Vercel — free tier, on-demand ISR with revalidate of one hour'],
              ['Domain', 'go.mike-lee.me, custom CNAME via Squarespace DNS pointing at Vercel'],
              ['Repository', 'GitHub, public, single Next.js project'],
            ]}
          />
          <p className="mt-4">
            Pages are not pre-rendered at build time. The Cities and Map
            routes ship as on-demand ISR: the first visitor to any page
            triggers a Notion fetch and bakes a static copy that&apos;s
            served to subsequent visitors for an hour, after which the next
            request kicks off a background revalidation. This keeps the
            build fast (no Notion calls during deploy), keeps Vercel&apos;s
            CDN doing the bulk of the work, and stays well clear of
            Notion&apos;s three-request-per-second rate limit.
          </p>
        </section>

        <section id="claude" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Working with Claude as a build collaborator</h2>
          <p>
            Most of this project — the enrichment pipeline, the postcard
            front-end, the map, the prose for 1,060 placeholder cities — was
            written in dialogue with Claude. The pattern that worked across
            the build was three questions before any new feature.
          </p>
          <ol className="list-decimal list-outside pl-6 space-y-2 mt-4">
            <li>
              <strong className="text-ink-deep">What is the criteria for this feature?</strong>{' '}
              What does it need to do, look like, and feel like? For data
              tasks: what does &quot;done&quot; look like at the row level?
            </li>
            <li>
              <strong className="text-ink-deep">What is the simplest implementation that satisfies the criteria?</strong>{' '}
              This question often surfaced parts of the spec that didn&apos;t
              need to be built. The map view, for example, started with a
              full Google Maps integration in the plan. Asked plainly, the
              simplest implementation was a vector-tile basemap with no
              search, no place autocomplete, no street view — and that
              version is what shipped.
            </li>
            <li>
              <strong className="text-ink-deep">What are the trade-offs in the chosen approach?</strong>{' '}
              Notion as the CMS is slow under load and has a hard rate
              limit; on-demand ISR fixes the rate limit but means first
              visitors to a page wait longer than later ones. Knowing the
              trade-off makes the decision deliberate.
            </li>
          </ol>
          <p className="mt-4">
            For the prose-writing pass, the input that mattered most was
            grounding context. Asking Claude for a generic &quot;why visit
            Hue&quot; produced flat, syllabus-style copy. Pasting Hue&apos;s
            structured facts (population, founding date, climate, mayor) plus
            the Wikipedia article lede produced prose that named the
            Imperial City, the Perfume River, and the bún bò Huế noodle
            soup — concrete enough that a reader could plan around it.
          </p>
          <p className="mt-4">
            Hemisphere-awareness was the single most common correction. The
            first prose pass cheerfully described Cape Town&apos;s summer as
            June–August. A short rule in the prompt — &quot;cities below the
            equator have flipped seasons&quot; — fixed it for the whole
            batch.
          </p>
        </section>

        <section id="diy" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">How you can build this yourself</h2>
          <p>
            The toolchain is free and small enough to learn in an afternoon.
            You need a code editor, a Git client, a GitHub account, a Vercel
            account, a Notion workspace, and a Claude subscription (web or
            CLI). No paid map APIs, no managed databases, no asset
            pipelines.
          </p>
          <p className="mt-4">
            Start in Notion. Create one database for the entity you want to
            track (places, books, recipes, whatever) and a smaller second
            database for any logistics that repeat across rows (in this
            project, the Countries database). Pick a small handful of
            properties — name, status, dates, tags — and resist filling out
            every cell by hand. The point of using Notion as a CMS is that
            you can enrich the rest later, in dialogue with Claude, against
            free public data.
          </p>
          <p className="mt-4">
            Then build the website. Spin up a fresh Next.js project, add
            the Notion SDK, and wrap each fetch in <Code>cache()</Code> so
            multiple components on a page deduplicate to one API call. Use
            on-demand ISR (<Code>generateStaticParams</Code> returning an
            empty array, <Code>revalidate</Code> set to whatever cache
            window suits the data) to keep the build fast. Push to a
            GitHub repository connected to a Vercel project, and the new
            version is live within a minute. To use a custom subdomain,
            create a CNAME record at your DNS provider that points the
            subdomain to <Code>cname.vercel-dns.com</Code>, then assign
            the domain in the Vercel project settings.
          </p>
          <p className="mt-4">
            For map work, MapLibre GL JS plus OpenFreeMap is the free path:
            no API key, no billing, no surprise quotas, and a globe view
            that compares well to commercial alternatives. For map data
            beyond what Notion stores, Wikidata and Wikipedia&apos;s REST
            APIs are open and unlimited within reason; Open-Meteo handles
            historical climatology without authentication.
          </p>
        </section>

        <section id="resources" className="scroll-mt-6">
          <h2 className="text-h2 text-ink-deep mb-4">Further resources</h2>
          <ul className="list-disc list-outside pl-6 space-y-2">
            <li>
              <a href="https://developers.notion.com/" target="_blank" rel="noopener noreferrer">
                Notion API documentation
              </a>
              {' '}— official reference for the database query and page update endpoints.
            </li>
            <li>
              <a href="https://maplibre.org/maplibre-gl-js/docs/" target="_blank" rel="noopener noreferrer">
                MapLibre GL JS docs
              </a>
              {' '}— globe projection, paint expressions, GeoJSON sources.
            </li>
            <li>
              <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
                OpenFreeMap
              </a>
              {' '}— the free vector tile service used here. No API key required.
            </li>
            <li>
              <a href="https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service" target="_blank" rel="noopener noreferrer">
                Wikidata SPARQL query service
              </a>
              {' '}— for structured facts about places.
            </li>
            <li>
              <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                Open-Meteo
              </a>
              {' '}— historical climatology, no key needed.
            </li>
            <li>
              <a href="https://ski.mike-lee.me/readme.html" target="_blank" rel="noopener noreferrer">
                ski.mike-lee.me/readme.html
              </a>
              {' '}— a sibling project (a browser-based skiing game) and the format this article is modelled on.
            </li>
            <li>
              <a href="https://www.linkedin.com/in/mikelee89/" target="_blank" rel="noopener noreferrer">
                Mike Lee on LinkedIn
              </a>
              {' '}— author contact.
            </li>
          </ul>
        </section>

      </div>
    </article>
  );
}

// === Inline helpers ===

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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.92em] bg-cream-soft border border-sand rounded px-1 py-0.5 text-ink-deep">
      {children}
    </code>
  );
}
