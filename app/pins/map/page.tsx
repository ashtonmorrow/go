// === /pins/map =============================================================
// Globe view of every pin with valid coordinates. Smaller / simpler than
// the city map (no sister-city graph), but the same MapLibre + react-map-gl
// stack underneath. Markers are clickable and link to the pin detail page.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
import PinsMap from '@/components/PinsMapLoader';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

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
  const pins = await fetchAllPins();

  // Map payload is just the bits the marker layer needs — name, slug,
  // coords, visited status, an optional thumb. Strips the rest so the
  // client bundle stays small.
  const markers = pins
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug ?? p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      visited: p.visited,
      category: p.category,
      country: p.statesNames[0] ?? null,
      thumb: p.images[0]?.url ?? null,
    }));

  const pageData = webPageJsonLd({
    url: `${SITE_URL}/pins/map`,
    name: 'Pin Map · Mike Lee',
    description: DESCRIPTION,
  });

  return (
    <>
      <JsonLd data={pageData} />
      <PinsMap markers={markers} />
      <ViewSwitcher
        object="pins"
        current="map"
        className="fixed bottom-5 right-5 z-50 shadow-lg"
      />
    </>
  );
}
