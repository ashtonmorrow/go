import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { SITE_URL } from '@/lib/seo';
import HomeGlobe from '@/components/HomeGlobe';

// === Home (/) ==============================================================
// Full-bleed 3D globe of every country visited, with a glass-style stats
// strip floating at the bottom over the map. No "recent writing" feed,
// no Atlas card — the sidebar handles Lists / Atlas / Articles
// navigation; the home is purely the lookback hero.
//
// Layout, top to bottom:
//   1. Quiet text header (title + intro), narrow column, above the map
//   2. Globe — full available width, vh-sized so it dominates the page
//   3. Floating stats strip overlaid on the bottom edge of the map
//
// The globe is interactive: drag to spin, click any visited country
// (shaded teal) to open its detail page. Hover lightens the country
// boundary. No filter cockpit; that lives at /countries/map (reachable
// via Atlas in the sidebar) with the full interactive setup.

export const metadata: Metadata = {
  title: "Mike Lee — Oh the places you'll go",
  description:
    "Travel notes, lists of places worth returning to, and long-form destination guides. Written from spending the majority of my adult life on the go.",
  alternates: { canonical: SITE_URL },
};

export const revalidate = 3600;

export default async function HomePage() {
  const [pins, cities, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCities(),
    fetchAllCountries(),
  ]);

  // ---- Stats ------------------------------------------------------------
  // Countries visited: derived from pins.visited where statesNames[0]
  // matches a country in the atlas. Names are lowercased so the globe
  // can do case-insensitive lookup against the GeoJSON.
  const visitedCountryNames = new Set<string>();
  let visitedPinCount = 0;
  for (const p of pins) {
    if (!p.visited) continue;
    visitedPinCount++;
    const c = p.statesNames?.[0];
    if (c) visitedCountryNames.add(c.toLowerCase());
  }
  const visitedCities = cities.filter(c => c.been).length;

  // Count featured guides + articles inline by reading the content dir.
  // Avoids importing the bigger getAllArticleEntries / listFeatured
  // helpers just to count; the home no longer renders their content.
  const { guidesCount, articlesCount } = await countPublishedContent();

  // Globe needs the full country list to wire click-to-navigate. The
  // shape is intentionally slim so the bundle the client downloads is
  // small.
  const countryRows = countries.map(c => ({
    name: c.name,
    slug: c.slug,
    iso3: c.iso3 ?? null,
  }));

  return (
    <div className="relative w-full">
      <header className="max-w-page mx-auto px-5 pt-8 pb-4 max-w-prose">
        <h1 className="text-display text-ink-deep leading-none">
          Oh the places you&rsquo;ll go
        </h1>
        <p className="mt-3 text-prose text-slate leading-relaxed">
          My travel notes, lists of places I felt were worth returning to,
          and long-form destination guides. All written up from spending
          the majority of my adult life on the go.
        </p>
      </header>

      {/* Full-bleed globe. vh-sized so the map dominates the screen on
          desktop; on mobile it shrinks to a comfortable square so the
          stats strip below it doesn't get pushed off-screen. The map
          and its overlays live in one relative container so the stats
          row can absolute-position against the map's bottom edge. */}
      <div className="relative w-full h-[60vh] sm:h-[70vh] md:h-[78vh] bg-cream-soft">
        <HomeGlobe
          visitedCountryNames={visitedCountryNames}
          countries={countryRows}
        />

        {/* Floating stats strip — absolute-positioned across the bottom
            of the map. Glass treatment (semi-transparent white +
            backdrop blur) so the globe stays visible behind it. Each
            tile is a Link into the relevant data view; click a tile,
            land on the page that breaks the number down. */}
        <div className="absolute inset-x-0 bottom-3 sm:bottom-5 px-3 sm:px-5 pointer-events-none">
          <ul
            className="
              pointer-events-auto
              mx-auto max-w-5xl
              grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3
            "
          >
            <StatTile
              label="Countries visited"
              value={visitedCountryNames.size}
              sublabel={`of ${countries.length}`}
              href="/countries/cards"
            />
            <StatTile
              label="Cities visited"
              value={visitedCities}
              sublabel={`of ${cities.length.toLocaleString()}`}
              href="/cities/map"
            />
            <StatTile
              label="Pins curated"
              value={pins.length}
              sublabel={`${visitedPinCount.toLocaleString()} visited`}
              href="/pins/cards"
            />
            <StatTile
              label="Guides published"
              value={guidesCount}
              sublabel="and growing"
              href="/lists"
            />
            <StatTile
              label="Articles published"
              value={articlesCount}
              sublabel="and growing"
              href="/articles"
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

// === Stat tile =============================================================
// Glass-style card overlaying the globe. Slightly muted text and a
// translucent background so the map reads through. Links into the
// matching data or index page.
function StatTile({
  label,
  value,
  sublabel,
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="
          group block rounded-md
          bg-white/85 hover:bg-white backdrop-blur-sm
          border border-white/40
          shadow-sm hover:shadow-paper
          px-3 py-2.5 transition-all h-full
        "
      >
        <p className="text-h3 text-ink-deep tabular-nums leading-none group-hover:text-teal transition-colors">
          {value.toLocaleString()}
        </p>
        <p className="mt-1 text-label text-ink-deep font-medium leading-tight">
          {label}
        </p>
        {sublabel && (
          <p className="mt-0.5 text-micro text-muted tabular-nums">
            {sublabel}
          </p>
        )}
      </Link>
    </li>
  );
}

// === Count helpers =========================================================
// Cheap published-content counters. Avoids re-importing the full
// listFeaturedGuides / getAllArticleEntries pipelines now that the
// home no longer renders that content; we only need the numbers.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readListContent } from '@/lib/content';
import { getAllArticleEntries } from '@/lib/articles';

async function countPublishedContent(): Promise<{
  guidesCount: number;
  articlesCount: number;
}> {
  const dir = path.join(process.cwd(), 'content', 'lists');
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }
  const slugs = files.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
  const contents = await Promise.all(slugs.map(slug => readListContent(slug)));
  const guidesCount = contents.filter(c => c?.featured).length;
  const articles = await getAllArticleEntries();
  return { guidesCount, articlesCount: articles.length };
}
