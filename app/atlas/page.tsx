import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';
import { getGuideAnchors } from '@/lib/guideAnchors';
import { fetchAtlasData } from '@/lib/atlasData';
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
// entry.
//
// Data pipeline (May 2026 perf pass): replaced the previous
// fetchAllPins + fetchAllCities + fetchAllCountries trio (each over
// the 2 MB data-cache ceiling, so every render hit Supabase fresh)
// with a slim fetchAtlasData aggregator that returns only the columns
// the globe + stat tiles need. The full cached payload now fits in
// ~200 KB, so warm renders are an in-memory map lookup.

export const metadata: Metadata = {
  title: { absolute: 'Atlas — explore every city on the map' },
  description:
    'Every city in the atlas as a dot on a 3D globe. Teal for places I have been, slate for the rest. Click any dot to open the city page; click a guide anchor to open the writeup.',
  alternates: { canonical: `${SITE_URL}/atlas` },
};

export const revalidate = 3600;

export default async function AtlasPage() {
  const data = await fetchAtlasData();
  const guideAnchors = await getGuideAnchors(
    // getGuideAnchors only reads lat/lng/name/slug, so the slim
    // AtlasCity shape satisfies it without changing the helper.
    data.cities,
  );

  return (
    <div className="relative w-full">
      <div className="relative w-full h-[calc(100svh-3.5rem)] md:h-screen bg-cream-soft">
        <HomeCitiesGlobe cities={data.cities} guides={guideAnchors} />

        {/* Floating stats strip — five tiles in the brand's glass
            treatment over the globe. Each tile drills into the
            matching browse view. */}
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
              value={data.visitedCountryNames.length}
              sublabel={`of ${data.sovereignCountryTotal}`}
              href="/countries/cards"
            />
            <StatTile
              label="Cities visited"
              value={data.visitedCities}
              sublabel={`of ${data.totalCities.toLocaleString()}`}
              href="/cities/map"
            />
            <StatTile
              label="Pins curated"
              value={data.totalPins}
              sublabel={`${data.visitedPins.toLocaleString()} visited`}
              href="/pins/cards"
            />
            <StatTile
              label="Guides published"
              value={data.guidesCount}
              sublabel="and growing"
              href="/lists"
            />
            <StatTile
              label="Articles published"
              value={data.articlesCount}
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
