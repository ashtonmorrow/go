// === /pins/stats ===========================================================
// Server shell for the filter-aware pin stats. Loads the full pin set
// once; PinStatsClient does the cockpit-driven re-aggregation.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import PinStatsClient from '@/components/PinStatsClient';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 60 * 60 * 24 * 7; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'Filter-aware breakdowns over the curated pin set — by category, list (UNESCO, Atlas Obscura, wonders), country, type. Numbers update as you change filters in the sidebar.';

export const metadata: Metadata = {
  title: 'Pin Stats',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/stats` },
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

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-h2 text-ink-deep">Pin Stats</h1>
        <ViewSwitcher object="pins" current="stats" />
      </div>

      <PinStatsClient pins={pins} />
    </div>
  );
}
