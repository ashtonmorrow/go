// === /pins index ===========================================================
// Curated places-of-interest. Server fetches the slim aggregated card
// payload (pin set + country iso2 lookup) from lib/pinsCardData and
// hands it to the client PinsGrid that filters/sorts via
// PinFiltersContext.
//
import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import PinsGrid from '@/components/PinsGrid';
import PinsPageTitle from '@/components/PinsPageTitle';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';
import { fetchPinsCardData } from '@/lib/pinsCardData';

// Dynamic per-request, not ISR. Rendering ~5,000 pin cards into HTML
// risks Vercel's 19.07 MB ISR fallback ceiling. The expensive per-render
// work (corpus fetch + per-pin denormalization + personal-cover lookups)
// is now cached in fetchPinsCardData (24 h TTL, slim shape that fits
// under Next's 2 MB data cache), so re-rendering is a single
// in-memory map lookup once warm.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Curated places worth a detour. UNESCO sites, museums, viewpoints. Each pin links straight to Google Maps so you can drop it into your trip.';

export const metadata: Metadata = {
  title: 'Pins',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/cards` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/cards`,
    title: 'Pins · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinsPage() {
  const { pins, countryNameToIso2 } = await fetchPinsCardData();

  return (
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={collectionJsonLd({
          url: `${SITE_URL}/pins/cards`,
          name: 'Pins',
          description: DESCRIPTION,
          totalItems: pins.length,
          items: pins.map(p => ({
            url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
            name: p.name,
            image: p.images[0]?.url ?? null,
          })),
        })}
      />

      <section className="max-w-page mx-auto px-5 pt-6"><PinsPageTitle /></section>

      <PinsGrid pins={pins} countryNameToIso2={countryNameToIso2} />
    </div>
  );
}
