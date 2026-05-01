// === /pins index ===========================================================
// Curated places-of-interest (UNESCO sites, museums, viewpoints) sourced
// from my Airtable Framer/Attractions table and stored in Stray's
// Supabase.
//
// Server fetches the full pin set + the country list (for flag-avatar
// lookups) and hands them to a client PinsGrid that filters/sorts via
// PinFiltersContext. The actual filter UI lives in the sidebar
// (PinFilterPanel) — same cockpit pattern the city views use.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchPersonalCovers } from '@/lib/personalPhotos';
import { fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import PinsGrid from '@/components/PinsGrid';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

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
  const [pinsRaw, countries, personalCovers] = await Promise.all([
    fetchAllPins(),
    fetchAllCountries(),
    fetchPersonalCovers(),
  ]);

  const pins = pinsRaw.map(p => ({ ...p, personalCoverUrl: personalCovers.get(p.id) ?? null }));

  // Lower-cased name lookup so capitalisation drift between Airtable and
  // Notion doesn't drop a flag.
  const countryNameToIso2: Record<string, string> = {};
  for (const c of countries) {
    if (c.iso2) countryNameToIso2[c.name.toLowerCase()] = c.iso2;
  }

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

      {/* Compact header — matches /cities/cards, /countries/cards, etc.
          Total + visited counts live in the cockpit's "X / Y pins" badge,
          so the page itself doesn't need to repeat them. */}
      <h1 className="text-h2 text-ink-deep">Pins</h1>

      <PinsGrid pins={pins} countryNameToIso2={countryNameToIso2} />
    </div>
  );
}
