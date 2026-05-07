import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPinsCardData, type PinForCard } from '@/lib/pinsCardData';
import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/notion';
import { fetchAllSavedListsMeta, listNameToSlug } from '@/lib/savedLists';
import { thumbUrl } from '@/lib/imageUrl';
import { SITE_URL } from '@/lib/seo';

// === /lists ================================================================
// Index of every saved-list Mike has imported from his Google Maps Takeout.
// Each list links to /lists/<slug> showing the pins on that list. Sorted by
// member count desc so the most-used lists surface first; ties break
// alphabetical for stable order across reloads.
//
// Each card carries a cover image picked from a fallback chain:
//   1. **Curated cover photo** — saved_lists.cover_photo_id. Set via the
//      Flavor-2 picker on /admin/lists/[slug]; wins over every fallback.
//   2. **Curated cover pin** — saved_lists.cover_pin_id's first photo.
//      Wins over the geo / pin-pile fallbacks below.
//   3. The matching city's hero/personal photo (when the list name matches
//      a known atlas city).
//   4. The matching country's hero photo (same idea, broader).
//   5. The first photo on any visited pin in the list.
//   6. The first photo on any pin in the list, period.
//   7. Nothing — card falls back to a "no photo" placeholder.
//
// We also surface the linked place as a small "📮 Madrid" / "🌍 Spain"
// chip on the card so visitors can see at a glance that the list pivots
// to a real geo entity, not just a theme.

export const metadata: Metadata = {
  title: "Mike's Saved Lists",
  description:
    "Mike's saved travel lists: places grouped by city, theme, and intent, originally built in Google Maps and organized here for easier planning.",
  alternates: { canonical: `${SITE_URL}/lists` },
};

export const revalidate = 3600;

type ListEntry = {
  name: string;
  slug: string;
  count: number;
  visitedCount: number;
  /** Image URL chosen via the cover-fallback chain. */
  cover: string | null;
  /** Optional anchor place — present when the list name matches a city
   *  or country in the atlas. Drives the chip on the card. */
  anchor: { kind: 'city' | 'country'; name: string; slug: string } | null;
};

export default async function ListsIndex() {
  // Slim aggregators carry every field this page touches. Both sit
  // under Next's 2 MB data cache ceiling so the underlying corpus is
  // re-fetched at most once per 24 h. Before this, fetchAllPins (7.5
  // MB) and fetchAllCities (2.2 MB) hit Supabase fresh on every render
  // because they were silently rejected by the cache.
  const [{ pins }, cities, countries, listsMeta] = await Promise.all([
    fetchPinsCardData(),
    fetchCitiesCardData(),
    fetchAllCountries(),
    fetchAllSavedListsMeta(),
  ]);

  // Build lookup maps once. Cities/countries are keyed by lowercased name so
  // we can match against the saved-list name (which is already lowercase).
  const cityByName = new Map<string, { name: string; slug: string; cover: string | null }>();
  for (const c of cities) {
    cityByName.set(c.name.toLowerCase(), {
      name: c.name,
      slug: c.slug,
      // List cover comes from the personal photo only — heroImage is a
      // Wikimedia/Commons photograph and we no longer surface those on
      // tile/cover surfaces (only on the city detail page hero, which
      // renders ImageCredit alongside it). When the city has no personal
      // photo, the list card falls through to a pin-photo fallback below.
      cover: c.personalPhoto ?? null,
    });
  }
  const countryByName = new Map<string, { name: string; slug: string }>();
  for (const c of countries) {
    countryByName.set(c.name.toLowerCase(), { name: c.name, slug: c.slug });
  }

  // Group pins by list name once, then derive every per-list aggregate from
  // the bucket. Avoids three passes over 5k pins.
  const buckets = new Map<string, PinForCard[]>();
  for (const p of pins) {
    for (const name of p.savedLists ?? []) {
      let arr = buckets.get(name);
      if (!arr) {
        arr = [];
        buckets.set(name, arr);
      }
      arr.push(p);
    }
  }

  function pickPinCover(arr: PinForCard[]): string | null {
    // Prefer a visited pin's first photo over a draft's, since drafts often
    // have no images at all. Either way, take the first usable image.
    const visitedFirst = arr.slice().sort((a, b) => {
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      return 0;
    });
    for (const p of visitedFirst) {
      const img = p.images?.[0]?.url;
      if (img) return img;
    }
    return null;
  }

  // Pin id → first image url, used to resolve curated coverPinId without a
  // second pass over `pins`.
  const pinPrimaryPhoto = new Map<string, string>();
  for (const p of pins) {
    const url = p.images?.[0]?.url;
    if (url) pinPrimaryPhoto.set(p.id, url);
  }

  const lists: ListEntry[] = Array.from(buckets.entries())
    .map(([name, arr]) => {
      const lcName = name.toLowerCase();
      const city = cityByName.get(lcName);
      const country = !city ? countryByName.get(lcName) : null;
      const anchor = city
        ? { kind: 'city' as const, name: city.name, slug: city.slug }
        : country
        ? { kind: 'country' as const, name: country.name, slug: country.slug }
        : null;
      // Curated covers always win. The picker stores either a specific
      // photo (cover_photo_id, joined to its URL at fetch time) or a pin
      // (cover_pin_id, whose first image we look up here). After the
      // curated chain, fall back to the matching city's hero photo and
      // finally to whatever the pin pile turns up.
      const meta = listsMeta.get(name);
      const cover =
        meta?.coverPhotoUrl
        ?? (meta?.coverPinId ? pinPrimaryPhoto.get(meta.coverPinId) ?? null : null)
        ?? city?.cover
        ?? pickPinCover(arr);
      return {
        name,
        slug: listNameToSlug(name),
        count: arr.length,
        visitedCount: arr.filter(p => p.visited).length,
        cover,
        anchor,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">
          Mike&rsquo;s Saved Lists
        </h1>
        <p className="mt-3 text-small text-muted">
          {lists.length} {lists.length === 1 ? 'list' : 'lists'} ·{' '}
          {lists.reduce((n, l) => n + l.count, 0)} saved places
        </p>
        <p className="mt-3 max-w-prose text-slate leading-relaxed">
          These are the working lists behind the atlas: restaurants, museums,
          gardens, viewpoints, stations, day-trip ideas, and places I saved
          while planning. Some are polished enough to use as a short guide.
          Others are still a research pile, which is useful in its own way.
        </p>
      </header>

      {lists.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No saved lists yet. The import has not been run.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {lists.map(l => (
            <li key={l.slug}>
              <Link
                href={`/lists/${l.slug}`}
                className="block card overflow-hidden hover:shadow-paper transition-shadow"
              >
                {l.cover ? (
                  <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(l.cover, { size: 400 }) ?? l.cover}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {/* Anchor chip — shows the city or country this list
                        pivots to so the card communicates geo context
                        before you click. Renders nothing for theme lists. */}
                    {l.anchor && (
                      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 pill bg-black/55 text-white text-micro backdrop-blur-sm">
                        <span aria-hidden>
                          {l.anchor.kind === 'city' ? '📮' : '🌍'}
                        </span>
                        {l.anchor.name}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
                    No photo yet
                  </div>
                )}
                <div className="p-3">
                  <h2 className="text-ink-deep font-medium leading-tight capitalize truncate">
                    {l.name}
                  </h2>
                  <p className="mt-0.5 text-label text-muted tabular-nums">
                    {l.count} {l.count === 1 ? 'pin' : 'pins'}
                    {l.visitedCount > 0 && (
                      <> · {l.visitedCount} visited</>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
