// === /pins/stats ===========================================================
// Server shell for the filter-aware pin stats. Loads the full pin set
// once; PinStatsClient does the cockpit-driven re-aggregation.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import JsonLd from '@/components/JsonLd';
import PinStatsClient from '@/components/PinStatsClient';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'Filter-aware breakdowns over the curated pin set — by category, list (UNESCO, Atlas Obscura, wonders), country, type. Numbers update as you change filters in the sidebar.';

export const metadata: Metadata = {
  title: 'Pin Stats',
  description: DESCRIPTION,
  // Canonical to /pins/cards (same corpus, different presentation).
  alternates: { canonical: `${SITE_URL}/pins/cards` },
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/stats`,
    title: 'Pin Stats · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinStatsPage() {
  const pins = await fetchAllPins();

  return (
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/pins/stats`,
          name: 'Pin Stats',
          description: DESCRIPTION,
        })}
      />

      <section className="max-w-page mx-auto px-5 pt-6"><h1 className="text-h2 text-ink-deep">Pin Stats</h1></section>

      <PinStatsClient pins={pins} />
    </div>
  );
}
