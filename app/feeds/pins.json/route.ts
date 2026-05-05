// === /feeds/pins.json ======================================================
// JSON Feed v1.1 (https://www.jsonfeed.org/version/1.1/) of every pin.
//
// JSON Feed is the modern equivalent of RSS / Atom — a simple, well-spec'd
// JSON format consumed by Zapier, IFTTT, NetNewsWire, Inoreader and most
// modern feed readers. Picking JSON over RSS because (a) the rest of this
// site is JSON-first and (b) JSON Feed has fewer footguns around
// HTML-encoding, namespaces, and date formats.
//
// Each entry is one pin. URLs point at the on-site detail page; image,
// summary, and a crude "tags" array (category + UNESCO + country) ride
// along so feed readers can render preview cards.
//
import { fetchAllPins } from '@/lib/pins';
import { SITE_URL, SITE_NAME, AUTHOR_NAME, AUTHOR_URL, clip } from '@/lib/seo';

// The feed serializes the pin corpus. Let the CDN cache the response via
// headers, but do not prerender it into Next's data cache during build.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const pins = await fetchAllPins();

  // Stable ordering by updated_at desc so the feed actually behaves like
  // a feed — readers expect newest first and use the order to detect new
  // items. fetchAllPins() name-sorts, so we re-sort here.
  const sorted = [...pins].sort((a, b) => {
    const A = a.updatedAt ?? a.airtableModifiedAt ?? '';
    const B = b.updatedAt ?? b.airtableModifiedAt ?? '';
    if (A < B) return 1;
    if (A > B) return -1;
    return 0;
  });

  const items = sorted.map(pin => {
    const url = `${SITE_URL}/pins/${pin.slug ?? pin.id}`;
    const tags = [
      pin.category,
      pin.unescoId != null ? 'UNESCO' : null,
      ...pin.statesNames,
    ].filter(Boolean) as string[];

    return {
      // JSON Feed v1.1 fields
      id: url,
      url,
      title: pin.name,
      content_text: clip(pin.description, 600) ?? pin.name,
      ...(pin.images[0]?.url ? { image: pin.images[0].url } : {}),
      // ISO-8601 timestamps; pins.airtable_modified_at + updated_at are
      // already timestamptz in Postgres, so the strings come back ISO.
      ...(pin.updatedAt ? { date_modified: pin.updatedAt } : {}),
      ...(pin.airtableModifiedAt ? { date_published: pin.airtableModifiedAt } : {}),
      ...(tags.length ? { tags } : {}),
      // Geographic context as a custom extension namespace — feed
      // consumers that don't know about it just ignore the key, while
      // ones that do (mappy stuff) get coordinates for free.
      ...(pin.lat != null && pin.lng != null
        ? {
            _geo: {
              lat: pin.lat,
              lng: pin.lng,
            },
          }
        : {}),
    };
  });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE_NAME} — Pins`,
    home_page_url: `${SITE_URL}/pins`,
    feed_url: `${SITE_URL}/feeds/pins.json`,
    description:
      'Curated places-of-interest, with coords and Google Maps deep links.',
    language: 'en-US',
    authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
    items,
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
