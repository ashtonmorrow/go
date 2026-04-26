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
          items: pins.map(p => ({
            url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
            name: p.name,
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
// Compact horizontal card. Layout:
//
//   ┌──────────────────────────────────────────────────────┐
//   │  Pin name                              ●img   ●flag │
//   │  Cultural · UNESCO · City, Country                   │
//   │  short description ─ one line, truncated             │
//   └──────────────────────────────────────────────────────┘
//
// The whole row is a link to the detail page; an extra "Maps" out-link
// sits below for one-click directions without the round-trip.
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
  const placeText = [city, country].filter(Boolean).join(', ');
  const firstSentence = pin.description?.split(/(?<=[.!?])\s/)[0] ?? null;
  const flagUrl = flagCircle(countryIso2);

  return (
    <article className="card p-3 flex items-start gap-3 hover:shadow-paper transition-shadow">
      {/* === Left: text content ============================================ */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <h2 className="text-ink-deep font-semibold leading-snug flex-1 truncate">
            <Link
              href={`/pins/${pin.slug ?? pin.id}`}
              className="hover:text-teal transition-colors"
            >
              {pin.name}
            </Link>
          </h2>
          {pin.visited && (
            <span className="pill bg-teal/10 text-teal text-[10px] flex-shrink-0">
              Been
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {pin.category && (
            <span className="pill bg-cream-soft text-slate">{pin.category}</span>
          )}
          {pin.unescoId != null && (
            <span className="pill bg-accent/10 text-accent">UNESCO</span>
          )}
          {placeText && (
            <span className="text-muted truncate">{placeText}</span>
          )}
        </div>

        {firstSentence && (
          <p className="text-[12px] text-slate leading-snug line-clamp-2">
            {firstSentence}
          </p>
        )}

        {pin.googleMapsUrl && (
          <a
            href={pin.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-teal hover:underline mt-0.5"
          >
            Open in Google Maps →
          </a>
        )}
      </div>

      {/* === Right: avatars stack ============================================
          Pin photo as a circular icon, then the country flag as a second
          circular icon on the far right. Either or both may be missing —
          when they are, we render a sand placeholder so the layout stays
          rectangular and predictable. */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt=""
            aria-hidden
            className="w-12 h-12 rounded-full object-cover bg-cream-soft border border-sand"
          />
        ) : (
          <div
            aria-hidden
            className="w-12 h-12 rounded-full bg-cream-soft border border-sand flex items-center justify-center text-[10px] text-muted"
          >
            {/* Tiny pin glyph as fallback so the spot reads as 'place' */}
            📍
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        {flagUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagUrl}
            alt={country ?? ''}
            title={country ?? ''}
            className="w-8 h-8 rounded-full border border-sand bg-white"
          />
        ) : (
          <div
            aria-hidden
            className="w-8 h-8 rounded-full border border-sand bg-cream-soft"
          />
        )}
      </div>
    </article>
  );
}
