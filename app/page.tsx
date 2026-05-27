import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/places';
import { SITE_URL } from '@/lib/seo';
import { sovereignParent, isSubNational } from '@/lib/sovereignty';
import { getGuideAnchors } from '@/lib/guideAnchors';
import HomeCitiesGlobe from '@/components/HomeCitiesGlobe';

// === Home (/) ==============================================================
// Full-bleed 3D globe of every city in the atlas (teal dot if visited,
// slate dot if not yet), with a glass-style stats strip floating at the
// bottom over the map. No text header — the globe is the page. Page
// title and description live in the document metadata only (SEO).
//
// The globe is interactive: drag to spin, click any dot to open that
// city's detail page. No filter cockpit; that lives at /cities/map
// (reachable via Atlas in the sidebar) with the full setup.

export const metadata: Metadata = {
  // title.absolute skips the layout template ("· Mike Lee" suffix); the
  // byline is already in the title itself so the appended one would
  // double up. Description is first-person and names the cities we
  // have written guides for, so the SERP snippet earns the click
  // against generic city-name competitors without sounding like a
  // brochure.
  title: { absolute: "Mike Lee's travel atlas" },
  description:
    "Every city I have been to, the places I went back to, and written guides for Madrid, Bristol, Bangkok, Cape Town, and Amsterdam.",
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
  // matches a country in the atlas, then collapsed into sovereign parents
  // so the UK trip (which has pins tagged across England, Scotland, Wales,
  // Northern Ireland, plus United Kingdom itself) counts as one country
  // rather than five. The sovereignParent helper maps sub-national names
  // back to their sovereign; anything not in the map falls through as-is.
  // Denominator does the same collapse so the "of X" reads honestly: an
  // atlas that lists 227 country-rows (UK constituents inflate it) becomes
  // a smaller sovereign-count that matches what visitors mean by "country".
  const visitedCountryNames = new Set<string>();
  let visitedPinCount = 0;
  for (const p of pins) {
    if (!p.visited) continue;
    visitedPinCount++;
    const c = p.statesNames?.[0];
    if (c) {
      const parent = sovereignParent(c);
      if (parent) visitedCountryNames.add(parent);
    }
  }
  const sovereignTotal = countries.filter(c => !isSubNational(c.name)).length;
  const visitedCities = cities.filter(c => c.been).length;

  // Count featured guides + articles inline by reading the content dir.
  // Avoids importing the bigger getAllArticleEntries / listFeatured
  // helpers just to count; the home no longer renders their content.
  const { guidesCount, articlesCount } = await countPublishedContent();

  // Globe needs lat/lng + been + slug to wire dots and click-to-nav.
  // The shape is intentionally slim so the bundle the client downloads
  // is small.
  const cityRows = cities.map(c => ({
    name: c.name,
    slug: c.slug,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    been: !!c.been,
  }));

  // Guide anchors: one (or more) lat/lng pins per featured list, layered
  // on top of the city dots. Multi-base lists like spa-day or bali emit
  // several anchors — all clicking through to the same /lists/<slug>.
  const guideAnchors = await getGuideAnchors(cityRows);

  return (
    <div className="relative w-full">
      {/* Full-bleed globe. Sized to fill the available viewport: on
          desktop that's the full window (sidebar sits beside, not
          above); on mobile we subtract the 56px sticky top bar from
          the small-viewport height so the stats strip lands inside the
          visible area. The map and its overlays live in one relative
          container so the stats row can absolute-position against the
          map's bottom edge.

          No text header above the map — the globe + floating stats strip
          carry the page on their own; the page title for SEO lives in
          the document metadata only. */}
      <div className="relative w-full h-[calc(100svh-3.5rem)] md:h-screen bg-cream-soft">
        <HomeCitiesGlobe cities={cityRows} guides={guideAnchors} />

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
              sublabel={`of ${sovereignTotal}`}
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
