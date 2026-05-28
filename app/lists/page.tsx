import type { Metadata } from 'next';
import { fetchPinsCardData, type PinForCard } from '@/lib/pinsCardData';
import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/places';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { readListContent } from '@/lib/content';
import { resolveListCover } from '@/lib/listCover';
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
  title: 'Travel guides and city lists',
  description:
    'Polished destination writeups and the working saved-lists behind them. Skip-the-line advice, where to stay, what to skip, what to pair. Madrid, Bangkok, Bristol, Cape Town, and 80 more.',
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

  // Build lookup maps once. Cities/countries are keyed both by lowercased
  // name (the legacy saved-list-name match) and by slug, so a guide's
  // related.city / related.country can resolve directly in the decoration
  // pass below. The name match fails for any list whose name carries a
  // country suffix, a local spelling, or an abbreviation.
  type CityRef = { name: string; slug: string; cover: string | null };
  const cityByName = new Map<string, CityRef>();
  const cityBySlug = new Map<string, CityRef>();
  for (const c of cities) {
    const ref: CityRef = {
      name: c.name,
      slug: c.slug,
      // List cover comes from the personal photo only — heroImage is a
      // Wikimedia/Commons photograph and we no longer surface those on
      // tile/cover surfaces (only on the city detail page hero, which
      // renders ImageCredit alongside it). When the city has no personal
      // photo, the list card falls through to a pin-photo fallback below.
      cover: c.personalPhoto ?? null,
    };
    cityByName.set(c.name.toLowerCase(), ref);
    cityBySlug.set(c.slug, ref);
  }
  type CountryRef = { name: string; slug: string };
  const countryByName = new Map<string, CountryRef>();
  const countryBySlug = new Map<string, CountryRef>();
  for (const c of countries) {
    const ref: CountryRef = { name: c.name, slug: c.slug };
    countryByName.set(c.name.toLowerCase(), ref);
    countryBySlug.set(c.slug, ref);
  }

  // Group pins by list slug once, then derive every per-list aggregate
  // from the bucket. Avoids three passes over 5k pins. pins.saved_lists[]
  // holds slugs after the May 2026 R2 migration; listsMeta is keyed by
  // saved_lists.slug — both align around the same identifier.
  const buckets = new Map<string, PinForCard[]>();
  for (const p of pins) {
    for (const s of p.savedLists ?? []) {
      let arr = buckets.get(s);
      if (!arr) {
        arr = [];
        buckets.set(s, arr);
      }
      arr.push(p);
    }
  }

  // Build the rough list set first; the guide-content read happens in a
  // second async pass so we can fan out fs reads in parallel.
  const draft = Array.from(buckets.entries()).map(([slug, arr]) => {
    const meta = listsMeta.get(slug);
    const name = meta?.name ?? slug;
    // Anchor-by-name: convert the slug back to a name candidate (dashes
    // to spaces) so multi-word lists like "new-york" still hit the
    // cityByName map. content.related.city wins downstream when set.
    const nameCandidate = name.toLowerCase();
    const slugAsName = slug.replace(/-/g, ' ');
    const city = cityByName.get(nameCandidate) ?? cityByName.get(slugAsName);
    const country =
      !city
        ? countryByName.get(nameCandidate) ?? countryByName.get(slugAsName)
        : null;
    const anchor = city
      ? { kind: 'city' as const, name: city.name, slug: city.slug }
      : country
      ? { kind: 'country' as const, name: country.name, slug: country.slug }
      : null;
    return {
      name,
      slug,
      count: arr.length,
      visitedCount: arr.filter(p => p.visited).length,
      anchor,
      // saved_lists.updated_at is the recency signal for non-guide
      // entries; the decoration pass below overrides it with the
      // content file's updated/published date when one exists.
      metaUpdatedAt: meta?.updatedAt ?? null,
      coverInputs: {
        coverImageUrl: meta?.coverImageUrl ?? null,
        coverPhotoUrl: meta?.coverPhotoUrl ?? null,
        coverPinId: meta?.coverPinId ?? null,
        cityCover: city?.cover ?? null,
        pins: arr,
      },
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
      const { coverInputs, anchor: nameAnchor, metaUpdatedAt, ...rest } = d;

      // Geo anchor: prefer the guide's explicit related.city /
      // related.country (a slug) over the saved-list-name match. The
      // name match misses any list whose name is not an exact lowercased
      // city/country name (cordoba ar, venezia, cdmx, bath uk, ...).
      const relCity = content?.related?.city
        ? cityBySlug.get(content.related.city)
        : undefined;
      const relCountry =
        !relCity && content?.related?.country
          ? countryBySlug.get(content.related.country)
          : undefined;
      const anchor = relCity
        ? { kind: 'city' as const, name: relCity.name, slug: relCity.slug }
        : relCountry
        ? { kind: 'country' as const, name: relCountry.name, slug: relCountry.slug }
        : nameAnchor;

      return {
        ...rest,
        anchor,
        isGuide,
        // Show the editorial headline on the card; fall back to the SEO title.
        guideTitle: isGuide ? content?.headline ?? content?.title ?? null : null,
        guideDescription: isGuide ? content?.description ?? null : null,
        // Recency signal: guide-content updated/published date wins (it's
        // the editorial-touch timestamp), saved_lists.updated_at is the
        // fallback for working buckets without a content file.
        updatedAt: content?.updated ?? content?.published ?? metaUpdatedAt,
        // One shared cover chain (lib/listCover.ts), the same precedence
        // /lists/<slug> uses, so the list looks identical in both places.
        // When the guide names a related city, that city's cover photo
        // enters the fallback chain ahead of the name-matched one.
        cover: resolveListCover({
          heroImage: content?.heroImage,
          ...coverInputs,
          cityCover: relCity?.cover ?? coverInputs.cityCover,
        }),
      };
    }),
  );
  // One unified order: guides first (so the polished writeups surface
  // on top of any single grid render), then everything else. Within the
  // guide tier, recency wins so the visitor sees the freshest editorial
  // first; within the working-bucket tier, pin count is still the right
  // signal (which lists Mike has actually invested in). Alphabetical
  // is the final tiebreak, never the primary sort — "Recently updated"
  // beats A-Z on perceived freshness, which matters more than ordering
  // predictability for a writing-led product. Lists with no updated
  // date sink to the bottom of their tier.
  lists.sort((a, b) => {
    if (a.isGuide !== b.isGuide) return a.isGuide ? -1 : 1;
    if (a.isGuide) {
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    }
    return b.count - a.count || a.name.localeCompare(b.name);
  });

  const guideCount = lists.filter(l => l.isGuide).length;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">
          Pick a destination
        </h1>
        <p className="mt-3 max-w-prose text-slate leading-relaxed">
          Polished writeups for {guideCount} cities (tagged Guide), plus
          the working pin buckets behind them. Search by city, country, or
          theme. Click any card to open the guide.
        </p>
        <p className="mt-3 text-small text-muted tabular-nums">
          {guideCount} {guideCount === 1 ? 'guide' : 'guides'}
          {' · '}
          {lists.length - guideCount} more lists
          {' · '}
          {lists.reduce((n, l) => n + l.count, 0)} places
        </p>
      </header>

      {lists.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No guides yet. Check back soon, or open one of the city pages
          from the atlas.
        </div>
      ) : (
        <ListsBrowser lists={lists} />
      )}
    </article>
  );
}
