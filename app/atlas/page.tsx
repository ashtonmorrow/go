import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/places';
import { SITE_URL } from '@/lib/seo';
import { sovereignParent, isSubNational } from '@/lib/sovereignty';
import { getGuideAnchors } from '@/lib/guideAnchors';
import HomeCitiesGlobe from '@/components/HomeCitiesGlobe';

// === /atlas =================================================================
// The full-bleed 3D explorer surface. Every city in the atlas as a dot
// (teal if visited, slate if not), every published guide as an anchor
// pin layered on top. Drag to spin. Click any dot to open that city's
// detail page. Stats strip floats at the bottom over the map.
//
// This was the home page until the May 2026 IA refactor moved the
// city-picker hero to / and demoted the globe to its own explorer
// route. The picker is the planning entry; the atlas is the wandering
// entry. Different intents, different surfaces.

export const metadata: Metadata = {
  title: { absolute: 'Atlas — explore every city on the map' },
  description:
    'Every city in the atlas as a dot on a 3D globe. Teal for places I have been, slate for the rest. Click any dot to open the city page; click a guide anchor to open the writeup.',
  alternates: { canonical: `${SITE_URL}/atlas` },
};

export const revalidate = 3600;

export default async function AtlasPage() {
  const [pins, cities, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCities(),
    fetchAllCountries(),
  ]);

  // Countries visited: collapse sub-national tags (England, Wales, etc.)
  // into their sovereign parent (United Kingdom) so the UK trip counts
  // as one country. The denominator does the same collapse so the "of X"
  // matches what visitors actually mean.
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
  const { guidesCount, articlesCount } = await countPublishedContent();

  const cityRows = cities.map(c => ({
    name: c.name,
    slug: c.slug,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    been: !!c.been,
  }));
  const guideAnchors = await getGuideAnchors(cityRows);

  return (
    <div className="relative w-full">
      <div className="relative w-full h-[calc(100svh-3.5rem)] md:h-screen bg-cream-soft">
        <HomeCitiesGlobe cities={cityRows} guides={guideAnchors} />

        {/* Floating stats strip — same five tiles, same glass treatment
            as the legacy home, repurposed as drill-downs into the
            matching browse views. */}
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

// Cheap published-content counters; same shape the legacy home used.
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
