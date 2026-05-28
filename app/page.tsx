import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';
import { getGuideAnchors } from '@/lib/guideAnchors';
import { fetchAtlasData } from '@/lib/atlasData';
import HomeCitiesGlobe from '@/components/HomeCitiesGlobe';

// === Home (/) ==============================================================
// Full-bleed 3D globe of every city in the atlas (teal dot if visited,
// slate dot if not yet), with a glass-style stats strip floating at the
// bottom over the map. No text header — the globe is the page. Page
// title and description live in the document metadata only (SEO).
//
// The globe is interactive: drag to spin, click any dot to open that
// city's detail page. Click a guide anchor to open the writeup. That
// click-through interaction IS the product entry — it's distinctive
// and reads as Mike's, not as a templated travel site.
//
// (Briefly redesigned to a search + 12-tile destination picker in May
// 2026 on a UX-review recommendation; reverted same week. The picker
// shape was the AI-default travel template; the globe is the product.)
//
// Data: fetchAtlasData returns a slim column-narrow projection (~200 KB
// cached) that fits under Next's 2 MB data-cache ceiling. The previous
// fetchAllPins + fetchAllCities + fetchAllCountries trio hit Supabase
// fresh on every render because each exceeded the cap.

export const metadata: Metadata = {
  title: { absolute: "Mike Lee's travel atlas" },
  description:
    "Every city I have been to, the places I went back to, and written guides for Madrid, Bristol, Bangkok, Cape Town, and Amsterdam.",
  alternates: { canonical: SITE_URL },
};

export const revalidate = 3600;

export default async function HomePage() {
  const data = await fetchAtlasData();
  const guideAnchors = await getGuideAnchors(data.cities);

  return (
    <div className="relative w-full">
      {/* Full-bleed globe. Sized to fill the available viewport: on
          desktop that's the full window (sidebar sits beside, not
          above); on mobile we subtract the 56px sticky top bar from
          the small-viewport height so the stats strip lands inside the
          visible area. */}
      <div className="relative w-full h-[calc(100svh-3.5rem)] md:h-screen bg-cream-soft">
        <HomeCitiesGlobe cities={data.cities} guides={guideAnchors} />

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
