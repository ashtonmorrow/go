import type { Metadata } from 'next';
import { fetchPinsCardData, type PinForCard } from '@/lib/pinsCardData';
import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/notion';
import { fetchAllSavedListsMeta, listNameToSlug } from '@/lib/savedLists';
import { readListContent } from '@/lib/content';
import { SITE_URL } from '@/lib/seo';
import ListsBrowser, { type ListEntry } from '@/components/ListsBrowser';

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

// ListEntry is imported from ListsBrowser so the server build and the
// client browser share one shape.

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
    // Prefer the saved_lists.slug column (the URL identifier, editable
    // independently of name since May 2026). Fall back to the derived form
    // for bucket names that don't have a meta row yet — that path keeps
    // pre-meta lists discoverable from /lists.
    return {
      name,
      slug: meta?.slug ?? listNameToSlug(name),
      count: arr.length,
      visitedCount: arr.filter(p => p.visited).length,
      cover,
      anchor,
    };
  });

  // Decorate with guide-content fields (read /content/lists/<slug>.md
  // once per slug, in parallel). readListContent is unstable_cache'd
  // for 24h, so this is essentially a Map lookup once warm.
  // `featured` (not `indexable`) drives the "this is a polished
  // destination guide" treatment. Featured lists carry an editorial
  // title + description from the content file and lead the sort;
  // route-map indexes (Alicante / Kusttram) are indexable for search
  // but not featured, so they sort with everything else.
  const lists: ListEntry[] = await Promise.all(
    draft.map(async d => {
      const content = await readListContent(d.slug);
      const isGuide = !!content?.featured;
      return {
        ...d,
        isGuide,
        // Show the editorial headline on the card; fall back to the SEO title.
        guideTitle: isGuide ? content?.headline ?? content?.title ?? null : null,
        guideDescription: isGuide ? content?.description ?? null : null,
        // Promote the guide's hero_image to the cover when one is set;
        // editorial pages are more likely to have a deliberate hero
        // than the auto-fallback covers.
        cover: (isGuide && content?.heroImage) || d.cover,
      };
    }),
  );
  // One unified order: guides first (so the polished writeups
  // surface on top of any single grid render), then everything else
  // by pin count desc. Within tier, alpha tiebreak. The page renders
  // a single grid downstream; this sort is what visitors see when
  // they arrive without a search query.
  lists.sort((a, b) => {
    if (a.isGuide !== b.isGuide) return a.isGuide ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });

  const guideCount = lists.filter(l => l.isGuide).length;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">
          Travel guides &amp; saved lists
        </h1>
        <p className="mt-3 max-w-prose text-slate leading-relaxed">
          Polished destination writeups (tagged Guide) and the working
          saved lists from Google Maps Takeout, in one searchable place.
          Type a city or country to filter the grid.
        </p>
        <p className="mt-3 text-small text-muted tabular-nums">
          {lists.length} {lists.length === 1 ? 'list' : 'lists'}
          {' · '}
          {guideCount} {guideCount === 1 ? 'guide' : 'guides'}
          {' · '}
          {lists.reduce((n, l) => n + l.count, 0)} saved places
        </p>
      </header>

      {lists.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No saved lists yet. The import has not been run.
        </div>
      ) : (
        <ListsBrowser lists={lists} />
      )}
    </article>
  );
}
