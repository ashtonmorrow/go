// === /pins index ===========================================================
// Curated places-of-interest (UNESCO sites, museums, viewpoints) sourced
// from my Airtable Framer/Attractions table and stored in Stray's
// Supabase.
//
// Card design — "icon card": text on the left, the pin's photo as a small
// circular avatar to its right, and the country's circular flag as a
// second avatar on the far right. The cards are tag-led (Cultural /
// Natural / UNESCO / city / country) rather than image-led, which is the
// honest framing — most images are stand-ins until the rehost ships,
// and the metadata is the part that's stable.
//
import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCountries } from '@/lib/notion';
import { flagCircle } from '@/lib/flags';
import JsonLd from '@/components/JsonLd';
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
  // Pins + countries fetched in parallel. Countries gives us the
  // name → ISO2 lookup we need to resolve the flag avatar — pins store
  // the country only as a text label (`states_names: ['Germany']`), so
  // the page does the join at request time.
  const [pins, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCountries(),
  ]);

  // Lower-cased name lookup so capitalisation drift between Airtable and
  // Notion doesn't drop a flag.
  const countryIso2ByName = new Map<string, string>();
  for (const c of countries) {
    if (c.iso2) countryIso2ByName.set(c.name.toLowerCase(), c.iso2);
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
          // Carry the cover image into the ItemList so search engines /
          // LLM crawlers can render rich list previews. Images here are
          // already on our Supabase Storage bucket, so they're stable.
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

      {pins.length === 0 ? (
        <div className="card p-8 text-center text-slate">No pins yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {pins.map(pin => (
            <PinCard
              key={pin.id}
              pin={pin}
              countryIso2={
                pin.statesNames[0]
                  ? countryIso2ByName.get(pin.statesNames[0].toLowerCase()) ?? null
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// === PinCard ===
// Layer-style "place card". Layout:
//
//   ┌────────────────────────────────────────────────┐
//   │  ┌──────┐  Pin name                    ●flag   │
//   │  │ img  │  Category · place                    │
//   │  └──────┘                                      │
//   └────────────────────────────────────────────────┘
//
// The cover image is the left anchor — square (rounded-lg, not a circle),
// taking up the full vertical of the card. The right column is two lines:
// bold title, then a single muted sub-label (category + city, country).
// Country flag floats top-right as a small badge.
function PinCard({
  pin,
  countryIso2,
}: {
  pin: Awaited<ReturnType<typeof fetchAllPins>>[number];
  countryIso2: string | null;
}) {
  const cover = pin.images[0];
  const country = pin.statesNames[0] ?? null;
  const city = pin.cityNames[0] ?? null;
  // Sub-label combines category + place into a single tight line. Examples:
  //   "Cultural · Berlin, Germany"
  //   "UNESCO · Mauritius"
  //   "Cultural"     (when no place text)
  //   "Berlin"       (when no category)
  const placeText = [city, country].filter(Boolean).join(', ');
  const subParts = [
    pin.category ?? (pin.unescoId != null ? 'UNESCO' : null),
    placeText || null,
  ].filter(Boolean);
  const subLabel = subParts.join(' · ');

  const flagUrl = flagCircle(countryIso2);

  return (
    <Link
      href={`/pins/${pin.slug ?? pin.id}`}
      className="group card p-2.5 flex items-center gap-3 hover:shadow-paper transition-shadow"
    >
      {/* === Cover image — left anchor ====================================== */}
      <div className="flex-shrink-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt=""
            aria-hidden
            className="w-14 h-14 rounded-lg object-cover bg-cream-soft border border-sand"
          />
        ) : (
          <div
            aria-hidden
            className="w-14 h-14 rounded-lg bg-cream-soft border border-sand flex items-center justify-center text-base text-muted"
          >
            📍
          </div>
        )}
      </div>

      {/* === Title + sub-label ============================================== */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-ink-deep font-semibold leading-tight truncate flex-1 group-hover:text-teal transition-colors">
            {pin.name}
          </h2>
          {pin.visited && (
            <span className="text-[10px] text-teal font-medium uppercase tracking-wider flex-shrink-0">
              Been
            </span>
          )}
          {flagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flagUrl}
              alt={country ?? ''}
              title={country ?? ''}
              className="w-5 h-5 rounded-full border border-sand bg-white flex-shrink-0"
            />
          )}
        </div>
        {subLabel && (
          <p className="text-[12px] text-muted truncate font-mono mt-0.5">
            {subLabel}
          </p>
        )}
      </div>
    </Link>
  );
}
