// === /pins/table ===========================================================
// Tabular view over the curated pins. Mirrors City Data + Country Data —
// sortable columns, click-row-to-detail. The pin filter cockpit in the
// sidebar (PinFilterPanel) doesn't gate this view yet; it's a 1,341-row
// table and most users will want raw access.
//
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import PinsTable from '@/components/PinsTable';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';

// Dynamic per-request, not ISR. The full pin table renders to ~19 MB of
// HTML which exceeds Vercel's 19.07 MB ISR fallback ceiling and trips
// FALLBACK_BODY_TOO_LARGE during build. fetchAllPins is unstable_cache'd
// at the lib layer, so re-rendering is just an in-memory iteration —
// no Supabase round-trip on warm cache.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'All pins as a sortable data table. Name, category, country, UNESCO ID, coordinates, visited status. Click any row to open the detail page.';

export const metadata: Metadata = {
  title: 'Pin Data',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/table` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/table`,
    title: 'Pin Data · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function PinsTablePage() {
  const [pins, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCountries(),
  ]);

  // Country name → ISO2 lookup so the table can render a small flag in
  // the country column.
  const countryNameToIso2: Record<string, string> = {};
  for (const c of countries) {
    if (c.iso2) countryNameToIso2[c.name.toLowerCase()] = c.iso2;
  }

  // Featured items for the JSON-LD ItemList — visited pins first.
  const featured = pins
    .slice()
    .sort((a, b) => Number(b.visited) - Number(a.visited))
    .slice(0, 30)
    .map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name,
      image: p.images[0]?.url ?? null,
    }));

  const collectionData = collectionJsonLd({
    url: `${SITE_URL}/pins/table`,
    name: 'Pin Data',
    description: DESCRIPTION,
    items: featured,
    totalItems: pins.length,
  });

  return (
    <>
      <JsonLd data={collectionData} />
      <section className="max-w-page mx-auto px-5 pt-6"><h1 className="text-h2 text-ink-deep">Pin Data</h1></section>
      <PinsTable pins={pins} countryNameToIso2={countryNameToIso2} />
    </>
  );
}
