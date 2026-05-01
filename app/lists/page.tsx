import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchAllPins, type Pin } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { listNameToSlug } from '@/lib/savedLists';
import { thumbUrl } from '@/lib/imageUrl';
import { SITE_URL } from '@/lib/seo';

// === /lists ================================================================
// Index of every saved-list Mike has imported from his Google Maps Takeout.
// Each list links to /lists/<slug> showing the pins on that list. Sorted by
// member count desc so the most-used lists surface first; ties break
// alphabetical for stable order across reloads.
//
// Each card carries a cover image picked from a fallback chain:
//   1. The matching city's hero/personal photo (when the list name matches
//      a known atlas city).
//   2. The matching country's hero photo (same idea, broader).
//   3. The first photo on any visited pin in the list.
//   4. The first photo on any pin in the list, period.
//   5. Nothing — card falls back to a "no photo" placeholder.
//
// We also surface the linked place as a small "📮 Madrid" / "🌍 Spain"
// chip on the card so visitors can see at a glance that the list pivots
// to a real geo entity, not just a theme.

export const metadata: Metadata = {
  title: 'My saved lists',
  description:
    'Mike’s personal Google Maps saved lists — places grouped by city, theme, and intent. Originally curated in Google Maps, now first-party here.',
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
  // Three parallel cached fetches — fetchAllPins is shared with /pins routes,
  // fetchAllCities/Countries are shared with /cities and /countries. None of
  // these add meaningful load on their own.
  const [pins, cities, countries] = await Promise.all([
    fetchAllPins(),
    fetchAllCities(),
    fetchAllCountries(),
  ]);

  // Build lookup maps once. Cities/countries are keyed by lowercased name so
  // we can match against the saved-list name (which is already lowercase).
  const cityByName = new Map<string, { name: string; slug: string; cover: string | null }>();
  for (const c of cities) {
    cityByName.set(c.name.toLowerCase(), {
      name: c.name,
      slug: c.slug,
      // City covers come from two columns the migration populated. Hero is
      // the editorial pick; personal_photo is a Mike-shot fallback that
      // wins on most cities he's visited. Either one beats nothing.
      cover: c.personalPhoto ?? c.heroImage ?? null,
    });
  }
  const countryByName = new Map<string, { name: string; slug: string }>();
  for (const c of countries) {
    countryByName.set(c.name.toLowerCase(), { name: c.name, slug: c.slug });
  }

  // Group pins by list name once, then derive every per-list aggregate from
  // the bucket. Avoids three passes over 5k pins.
  const buckets = new Map<string, Pin[]>();
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

  function pickPinCover(arr: Pin[]): string | null {
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
      // City cover wins; otherwise fall back to any pin photo. Country
      // covers don't exist on the Country type yet (only flags), so for
      // country-anchored lists we let the pin photo carry the visual.
      const cover = city?.cover ?? pickPinCover(arr);
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
        <h1 className="text-display text-ink-deep leading-none">My lists</h1>
        <p className="mt-3 text-slate max-w-prose">
          Personal Google Maps collections, exported and re-rendered here.
          Each list groups places I&rsquo;ve saved for a city, a theme, or a
          trip. Click through to see what made the cut.
        </p>
        <p className="mt-2 text-small text-muted">
          {lists.length} {lists.length === 1 ? 'list' : 'lists'} ·{' '}
          {lists.reduce((n, l) => n + l.count, 0)} total memberships
        </p>
      </header>

      {lists.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No saved lists yet — the import hasn&rsquo;t been run.
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
                  <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-[0.14em]">
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
