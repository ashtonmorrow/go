// === /pins/map =============================================================
// Globe view of every pin with valid coordinates. Smaller / simpler than
// the city map (no sister-city graph), but the same MapLibre + react-map-gl
// stack underneath. Markers are clickable and link to the pin detail page.
//
import type { Metadata } from 'next';
import { fetchPinsCardData } from '@/lib/pinsCardData';
import JsonLd from '@/components/JsonLd';
import PinsMap from '@/components/PinsMapLoader';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'Every curated place on a 3D globe. Click any marker for the detail and a Google Maps deep link.';

export const metadata: Metadata = {
  title: 'Pin Map',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/map` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/map`,
    title: 'Pin Map · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinsMapPage() {
  // Same slim aggregator as /pins/cards. The filter cockpit needs the
  // category / city / list / tag fields, the map only needs lat / lng /
  // visited. Both fit into PinForCard, which is cached at the lib
  // layer (the raw 7.5 MB pin corpus blows past Next's 2 MB cache
  // ceiling and was hitting Supabase per render before this).
  const { pins } = await fetchPinsCardData();

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/pins/map`,
    name: 'Pin Map · Mike Lee',
    description: DESCRIPTION,
  });

  return (
    <>
      <JsonLd data={pageData} />
      <PinsMap pins={pins} />
    </>
  );
}
