'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === SavedListSection ======================================================
// Cards-on-a-list block that renders at the bottom of city, country, and
// list-detail pages. Paginates via "Load more" so a 184-pin Barcelona list
// doesn't push 184 images into the initial paint.
//
// Server pages should pass a pre-filtered slice of pins (already matched
// against the list name); this component just handles the paged render +
// link-to-list footer. That keeps detail pages free to compose multiple
// lists if a city has, say, both "madrid" and "madrid food" lists.
//
// Card content is opportunistic: rating, review snippet, visit year, and
// the Free / UNESCO pills only render when the underlying pin has the
// data. Empty pins collapse to just name + city without dead space.

export type SavedListPin = {
  id: string;
  slug: string | null;
  name: string;
  visited: boolean;
  cover: string | null;
  city: string | null;
  country: string | null;
  rating: number | null;
  /** First line or two of Mike's personal review. Server can pass the
   *  full review or a pre-truncated slice; the card will line-clamp it
   *  either way. Optional so existing call sites keep compiling. */
  review?: string | null;
  /** Year the pin was visited — small muted byline under the city. */
  visitYear?: number | null;
  /** Pill flags. Both default false to keep the pill row off when unset. */
  free?: boolean;
  unesco?: boolean;
};

export type SavedListSortKey =
  | 'rated'    // pins with rating + review first; fallbacks to plain rated; then unrated
  | 'recent'   // visit_year desc, nulls last
  | 'rating'   // rating desc, nulls last
  | 'visited'  // visited first, then alpha
  | 'alpha'    // by name
  | 'city';    // by city, then alpha

type Props = {
  /** Display title — usually the list name in title case, or "Saved on my <city> list". */
  title: string;
  /** Slug for the /lists/[slug] link if the user wants the full list. */
  listSlug: string | null;
  /** Optional Google Maps share URL — opens the live list in a new tab. */
  googleShareUrl: string | null;
  /** Pins to render. Caller does the saved_lists matching server-side. */
  pins: SavedListPin[];
  /** Initial page size — defaults to 24 so the section doesn't dominate the page. */
  pageSize?: number;
  /** Show the sort dropdown. Default false on city/country embeds where space
   *  is tight; the dedicated /lists/[slug] page turns it on. */
  showSort?: boolean;
  /** Initial sort key. Defaults to 'rated' which surfaces the most useful
   *  cards (Mike's reviews + ratings) at the top. */
  initialSort?: SavedListSortKey;
};

const SORT_OPTIONS: { key: SavedListSortKey; label: string }[] = [
  { key: 'rated',   label: 'Reviewed first' },
  { key: 'rating',  label: 'Highest rated' },
  { key: 'recent',  label: 'Recent visits' },
  { key: 'visited', label: 'Visited first' },
  { key: 'alpha',   label: 'A → Z' },
  { key: 'city',    label: 'By city' },
];

function sortPins(pins: SavedListPin[], key: SavedListSortKey): SavedListPin[] {
  // Always make a copy — the caller's array is treated as immutable.
  const arr = pins.slice();
  switch (key) {
    case 'rated':
      // Three tiers: rated AND reviewed → rated only → everything else.
      // Within each tier, sort by rating desc then name.
      return arr.sort((a, b) => {
        const aTier = (a.rating != null ? 2 : 0) + (a.review ? 1 : 0);
        const bTier = (b.rating != null ? 2 : 0) + (b.review ? 1 : 0);
        if (aTier !== bTier) return bTier - aTier;
        const ar = a.rating ?? 0;
        const br = b.rating ?? 0;
        if (ar !== br) return br - ar;
        return a.name.localeCompare(b.name);
      });
    case 'rating':
      return arr.sort((a, b) => {
        const ar = a.rating ?? -1;
        const br = b.rating ?? -1;
        if (ar !== br) return br - ar;
        return a.name.localeCompare(b.name);
      });
    case 'recent':
      return arr.sort((a, b) => {
        const ay = a.visitYear ?? -Infinity;
        const by = b.visitYear ?? -Infinity;
        if (ay !== by) return by - ay;
        return a.name.localeCompare(b.name);
      });
    case 'visited':
      return arr.sort((a, b) => {
        if (a.visited !== b.visited) return a.visited ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    case 'alpha':
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'city':
      return arr.sort((a, b) => {
        const ac = a.city ?? '';
        const bc = b.city ?? '';
        if (ac !== bc) return ac.localeCompare(bc);
        return a.name.localeCompare(b.name);
      });
  }
}

export default function SavedListSection({
  title,
  listSlug,
  googleShareUrl,
  pins,
  pageSize = 24,
  showSort = false,
  initialSort = 'rated',
}: Props) {
  const [sort, setSort] = useState<SavedListSortKey>(initialSort);
  const [shown, setShown] = useState(pageSize);

  // Re-sort when the user picks a new sort key. useMemo keeps SSR HTML stable
  // until hydration; reset paging on sort change so the user sees the new top.
  const sorted = useMemo(() => sortPins(pins, sort), [pins, sort]);

  if (pins.length === 0) return null;
  const visible = sorted.slice(0, shown);
  const remaining = sorted.length - shown;

  return (
    <section className="mt-10 pt-8 border-t border-sand">
      <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-h3 text-ink-deep leading-tight">{title}</h2>
          <p className="mt-0.5 text-label text-muted tabular-nums">
            {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
            {pins.filter(p => p.visited).length > 0 && (
              <> · {pins.filter(p => p.visited).length} visited</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-label">
          {showSort && pins.length > 1 && (
            <label className="inline-flex items-center gap-1.5 text-muted">
              <span>Sort</span>
              <select
                value={sort}
                onChange={e => {
                  setSort(e.target.value as SavedListSortKey);
                  setShown(pageSize);
                }}
                className="text-small border border-sand rounded px-2 py-1 bg-white focus:outline-none focus:border-ink-deep"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          {googleShareUrl && (
            <a
              href={googleShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              View live on Google Maps
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          )}
          {listSlug && (
            <Link href={`/lists/${listSlug}`} className="text-teal hover:underline">
              Open list →
            </Link>
          )}
        </div>
      </header>

      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map(p => (
          <li key={p.id}>
            <Link
              href={p.slug ? `/pins/${p.slug}` : `/pins/${p.id}`}
              className="block card overflow-hidden hover:shadow-paper transition-shadow"
            >
              {p.cover ? (
                <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(p.cover, { size: 320 }) ?? p.cover}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {p.visited && (
                    <span className="absolute top-1.5 right-1.5 pill bg-teal text-white text-micro">
                      ✓
                    </span>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-[0.14em]">
                  No photo
                </div>
              )}
              <div className="p-2.5">
                <h3 className="text-ink-deep font-medium leading-tight truncate text-small">
                  {p.name}
                </h3>
                {(p.city || p.country) && (
                  <p className="mt-0.5 text-label text-muted truncate">
                    {[p.city, p.country].filter(Boolean).join(' · ')}
                  </p>
                )}
                {p.rating != null && p.rating > 0 && (
                  <p
                    className="mt-0.5 text-label"
                    aria-label={`${p.rating} stars`}
                  >
                    {'⭐'.repeat(p.rating)}
                    {p.visitYear ? (
                      <span className="ml-1.5 text-muted text-micro tabular-nums">
                        · {p.visitYear}
                      </span>
                    ) : null}
                  </p>
                )}
                {p.review && (
                  // The review snippet is the "click bait" — first line of
                  // Mike's actual prose. line-clamp-2 caps the height so cards
                  // stay roughly uniform; the truncation is the affordance to
                  // open the full pin page.
                  <p className="mt-1 text-label text-slate leading-snug line-clamp-2">
                    {p.review}
                  </p>
                )}
                {(p.free || p.unesco) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.unesco && (
                      <span className="pill bg-teal/10 text-teal text-micro">UNESCO</span>
                    )}
                    {p.free && (
                      <span className="pill bg-cream-soft border border-sand text-micro text-slate">
                        Free
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShown(s => s + pageSize)}
            className="px-4 py-2 rounded-md border border-sand text-small text-ink-deep hover:border-slate hover:bg-cream-soft transition-colors"
          >
            Load {Math.min(pageSize, remaining)} more
            <span className="text-muted ml-2 tabular-nums">({remaining} left)</span>
          </button>
        </div>
      )}
    </section>
  );
}
