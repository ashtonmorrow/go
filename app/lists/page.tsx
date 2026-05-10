import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPinsCardData, type PinForCard } from '@/lib/pinsCardData';
import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/notion';
import { fetchAllSavedListsMeta, listNameToSlug } from '@/lib/savedLists';
import { readListContent } from '@/lib/content';
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
  /** True when /content/lists/<slug>.md exists with `indexable: true`.
   *  These are the polished editorial guides — Cape Town today, Madrid /
   *  Bristol / Bangkok next. They lead the index above the raw saved-
   *  list imports. */
  isGuide: boolean;
  /** Editorial title from the content file frontmatter, used in place of
   *  the lowercased saved-list name when the guide exists. Cape Town's
   *  saved list is "cape town"; the guide title is "Cape Town Travel
   *  Notes and Map." */
  guideTitle: string | null;
  /** Short description from the content file, shown on the guide card
   *  so the index reads as a magazine of pieces rather than a wall of
   *  thumbnails. */
  guideDescription: string | null;
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

  // Build the rough list set first; the guide-content read happens in a
  // second async pass so we can fan out fs reads in parallel.
  const draft = Array.from(buckets.entries()).map(([name, arr]) => {
    const lcName = name.toLowerCase();
    const city = cityByName.get(lcName);
    const country = !city ? countryByName.get(lcName) : null;
    const anchor = city
      ? { kind: 'city' as const, name: city.name, slug: city.slug }
      : country
      ? { kind: 'country' as const, name: country.name, slug: country.slug }
      : null;
    // Curated covers always win. The picker stores either a raw URL
    // (cover_image_url — codex art, Wikidata pin image, city/country
    // hero), a specific personal photo (cover_photo_id, joined to its
    // URL at fetch time), or a pin (cover_pin_id, whose first image
    // we look up here). After the curated chain, fall back to the
    // matching city's hero photo and finally to whatever the pin pile
    // turns up.
    const meta = listsMeta.get(name);
    const cover =
      meta?.coverImageUrl
      ?? meta?.coverPhotoUrl
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
  });

  // Decorate with guide-content fields (read /content/lists/<slug>.md
  // once per slug, in parallel). readListContent is unstable_cache'd
  // for 24h, so this is essentially a Map lookup once warm.
  const lists: ListEntry[] = await Promise.all(
    draft.map(async d => {
      const content = await readListContent(d.slug);
      const isGuide = !!content?.indexable;
      return {
        ...d,
        isGuide,
        guideTitle: isGuide ? content?.title ?? null : null,
        guideDescription: isGuide ? content?.description ?? null : null,
        // Promote the guide's hero_image to the cover when one is set;
        // editorial pages are more likely to have a deliberate hero
        // than the auto-fallback covers.
        cover: (isGuide && content?.heroImage) || d.cover,
      };
    }),
  );
  // Two-tier sort: guides first (by count desc), then everything else
  // (by count desc). The visual split below renders these as two
  // sections with a divider; ordering matters even if the sections are
  // hard-bordered because a single sort makes the rendering loops
  // simpler.
  lists.sort((a, b) => {
    if (a.isGuide !== b.isGuide) return a.isGuide ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
  const guides = lists.filter(l => l.isGuide);
  const savedLists = lists.filter(l => !l.isGuide);

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-8">
        <h1 className="text-display text-ink-deep leading-none">
          Travel guides &amp; saved lists
        </h1>
        <p className="mt-3 max-w-prose text-slate leading-relaxed">
          The polished destination guides lead. Below them sit the working
          saved lists from Google Maps Takeout — restaurants, museums,
          gardens, viewpoints, stations, day-trip piles. Some of those will
          eventually graduate into guides; the rest stay useful as research.
        </p>
        <p className="mt-3 text-small text-muted tabular-nums">
          {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
          {' · '}
          {savedLists.length} {savedLists.length === 1 ? 'saved list' : 'saved lists'}
          {' · '}
          {lists.reduce((n, l) => n + l.count, 0)} saved places
        </p>
      </header>

      {guides.length > 0 && (
        <section className="mb-12">
          <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-h2 text-ink-deep">Travel guides</h2>
            <p className="text-small text-muted">
              Long-form destination writeups with hand-picked pins, hotel
              picks, and an FAQ.
            </p>
          </header>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guides.map(l => (
              <li key={l.slug}>
                <Link
                  href={`/lists/${l.slug}`}
                  className="group block card overflow-hidden hover:shadow-paper transition-shadow"
                >
                  {l.cover ? (
                    <div className="relative aspect-[16/9] bg-cream-soft overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl(l.cover, { size: 800 }) ?? l.cover}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                      {l.anchor && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 pill bg-black/55 text-white text-micro backdrop-blur-sm">
                          <span aria-hidden>
                            {l.anchor.kind === 'city' ? '📮' : '🌍'}
                          </span>
                          {l.anchor.name}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
                      No hero yet
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-h3 text-ink-deep leading-tight group-hover:text-teal transition-colors">
                      {l.guideTitle ?? l.name}
                    </h3>
                    {l.guideDescription && (
                      <p className="mt-2 text-prose text-slate leading-snug line-clamp-3">
                        {l.guideDescription}
                      </p>
                    )}
                    <p className="mt-3 text-label text-muted tabular-nums">
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
        </section>
      )}

      {savedLists.length > 0 && (
        <section>
          <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap border-t border-sand pt-8">
            <h2 className="text-h2 text-ink-deep">More saved lists</h2>
            <p className="text-small text-muted max-w-prose">
              Working lists from Google Maps Takeout. Useful as research; not
              edited into guides yet.
            </p>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {savedLists.map(l => (
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
                    <h3 className="text-ink-deep font-medium leading-tight capitalize truncate">
                      {l.name}
                    </h3>
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
        </section>
      )}

      {lists.length === 0 && (
        <div className="card p-8 text-center text-slate">
          No saved lists yet. The import has not been run.
        </div>
      )}
    </article>
  );
}
