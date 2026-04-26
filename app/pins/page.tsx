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
import { fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import PinsGrid from '@/components/PinsGrid';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';

export const revalidate = 3600;

const DESCRIPTION =
  'Curated places worth a detour. UNESCO sites, museums, viewpoints. Each pin links straight to Google Maps so you can drop it into your trip.';

export const metadata: Metadata = {
  title: 'Pins',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins`,
    title: 'Pins · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinsPage() {
  const [pins, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCountries(),
  ]);

  // Lower-cased name lookup so capitalisation drift between Airtable and
  // Notion doesn't drop a flag.
  const countryNameToIso2: Record<string, string> = {};
  for (const c of countries) {
    if (c.iso2) countryNameToIso2[c.name.toLowerCase()] = c.iso2;
  }

  const visitedCount = pins.filter(p => p.visited).length;

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <JsonLd
        data={collectionJsonLd({
          url: `${SITE_URL}/pins`,
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

      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep">Pins</h1>
        <p className="mt-2 text-slate max-w-prose">
          Places I think are worth a detour. {pins.length} so far,
          {' '}{visitedCount} visited. Each links out to Google Maps.
        </p>
      </header>

      <PinsGrid pins={pins} countryNameToIso2={countryNameToIso2} />
    </div>
  );
}
