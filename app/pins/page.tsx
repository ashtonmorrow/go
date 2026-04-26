// === /pins index ===========================================================
// Curated places-of-interest (UNESCO sites, museums, viewpoints) sourced
// from my Airtable Framer/Attractions table and stored in Stray's
// Supabase. The index renders a responsive card grid; each card is a link
// to the detail page, with a quick out-link to Google Maps from the
// coords.
//
// First-pass simple: no filters, no infinite scroll. The pin set is small
// and curated by hand — the view earns those affordances later as the
// table grows.
//
import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins } from '@/lib/pins';
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
  const pins = await fetchAllPins();

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

      <header className="mb-8">
        <h1 className="text-h1 text-ink-deep">Pins</h1>
        <p className="mt-2 text-slate max-w-prose">
          Places I think are worth a detour. {pins.length} so far,
          {' '}{visitedCount} visited. Each links out to Google Maps.
        </p>
      </header>

      {pins.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No pins yet. Add records to the Airtable Attractions table and
          run <code className="font-mono text-small">scripts/import-pins.mjs</code> to sync.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {pins.map(pin => (
            <PinCard key={pin.id} pin={pin} />
          ))}
        </div>
      )}
    </div>
  );
}

// === PinCard ===
// Tile for the index grid. Optional thumbnail at top, then name +
// category badge + location summary + first sentence of the description.
// The whole card is clickable; a separate small "Maps" out-link sits
// inside so you can skip the detail page when you just want directions.
function PinCard({ pin }: { pin: Awaited<ReturnType<typeof fetchAllPins>>[number] }) {
  const cover = pin.images[0];
  const placeText = [...pin.cityNames, ...pin.statesNames].filter(Boolean).join(', ');
  const firstSentence = pin.description?.split(/(?<=[.!?])\s/)[0] ?? null;

  return (
    <article className="card overflow-hidden flex flex-col h-full hover:shadow-paper transition-shadow">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.url}
          alt={pin.name}
          className="w-full aspect-[3/2] object-cover bg-cream-soft"
        />
      ) : (
        <div className="w-full aspect-[3/2] bg-cream-soft flex items-center justify-center text-muted text-small">
          {pin.category ?? 'No image'}
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <h2 className="text-h3 text-ink-deep flex-1">
            {/* Slug is non-null in practice since import enforces it; guard
                with a fallback to the id so the page still routes. */}
            <Link
              href={`/pins/${pin.slug ?? pin.id}`}
              className="hover:text-teal transition-colors"
            >
              {pin.name}
            </Link>
          </h2>
          {pin.visited && (
            <span className="pill bg-teal/10 text-teal text-[11px] flex-shrink-0">
              Been
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {pin.category && (
            <span className="pill bg-cream-soft text-slate">{pin.category}</span>
          )}
          {pin.unescoId != null && (
            <span className="pill bg-accent/10 text-accent">UNESCO</span>
          )}
          {placeText && <span className="text-muted">{placeText}</span>}
        </div>

        {firstSentence && (
          <p className="text-small text-slate leading-snug line-clamp-3">
            {firstSentence}
          </p>
        )}

        {pin.googleMapsUrl && (
          <a
            href={pin.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto pt-2 text-small text-teal hover:underline"
          >
            Open in Google Maps →
          </a>
        )}
      </div>
    </article>
  );
}
