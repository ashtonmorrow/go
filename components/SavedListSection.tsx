'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';
import CommonsAttributionBadge from './CommonsAttributionBadge';

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
  /** Pin kind, used to pick the right pricing pill. Restaurants render
   *  their priceTier ($–$$$$); everything else renders Free if applicable. */
  kind?: string | null;
  /** Restaurant tier ('$' / '$$' / '$$$' / '$$$$'). Only displayed when
   *  kind === 'restaurant'; ignored otherwise. */
  priceTier?: string | null;
  /** Pill flags. Both default false to keep the pill row off when unset. */
  free?: boolean;
  unesco?: boolean;
  /** Coordinates for the map view on /lists/[slug]. Both nullable since
   *  Google Takeout pins frequently arrive without lat/lng — those just
   *  drop off the map but still show in the card grid. */
  lat?: number | null;
  lng?: number | null;
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
  /** Curated pin ordering (saved_lists.pin_order). Pins listed here
   *  render first, in the order given, regardless of which sort key the
   *  user picks. Pins not in the array fall through to `initialSort` /
   *  the dropdown selection. */
  pinOrder?: string[];
  /** Group pins into per-kind subsections (Attractions, Restaurants,
   *  Shopping, Parks, Hotels, Transit) instead of rendering one flat
   *  grid. Each non-empty kind gets its own H3 heading, anchor id, and
   *  per-section "Load more" button. The section heading is what gives
   *  the page the "[Restaurants / Attractions / ...] in <city>" search
   *  surfaces a flat grid cannot. Default false. */
  groupByKind?: boolean;
  /** Pin kinds to drop entirely when `groupByKind` is on. The city
   *  detail page passes ['hotel'] because hotels have their own
   *  dedicated /cities/<slug>/hotels hub; duplicating them here would
   *  steal authority from that cluster. Ignored when groupByKind is
   *  false. */
  excludeKinds?: string[];
  /** Per-section initial show count when groupByKind=true. Defaults
   *  to 8: keeps the page scannable while still showing real options
   *  per category. Each section has its own "Load more" affordance. */
  groupedSectionLimit?: number;
};

const SORT_OPTIONS: { key: SavedListSortKey; label: string }[] = [
  { key: 'rated',   label: 'Reviewed first' },
  { key: 'rating',  label: 'Highest rated' },
  { key: 'recent',  label: 'Recent visits' },
  { key: 'visited', label: 'Visited first' },
  { key: 'alpha',   label: 'A → Z' },
  { key: 'city',    label: 'By city' },
];

const KIND_ICON: Record<string, string> = {
  attraction: '◎',
  hotel: '⌂',
  park: '△',
  restaurant: '◐',
  shopping: '□',
  transit: '↔',
};

/** Section ordering for groupByKind=true. Order is planning-relevance:
 *  attractions first because that is the question most readers come
 *  with, then restaurants, then shopping (markets and the like), then
 *  parks, then hotels, then transit. The page can drop kinds via
 *  `excludeKinds`. Anything not in this list (an unrecognized kind
 *  string) lands in the "Other" bucket at the end. */
const KIND_ORDER: readonly string[] = [
  'attraction',
  'restaurant',
  'shopping',
  'park',
  'hotel',
  'transit',
];

/** Plural section heading per kind. Tuned for SEO surface match:
 *  "Restaurants in Madrid" reads as a query, "Attractions in Madrid"
 *  reads as a query. */
const KIND_SECTION_HEADING: Record<string, string> = {
  attraction: 'Attractions',
  restaurant: 'Restaurants',
  shopping: 'Markets and shopping',
  park: 'Parks and gardens',
  hotel: 'Hotels',
  transit: 'Getting around',
};

/** URL-safe anchor id for each section. Used for the table-of-contents
 *  links and for browser-level deep-linking from external pages. */
function kindAnchorId(kind: string): string {
  return kind.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function kindIcon(kind: string | null | undefined): string {
  return kind ? KIND_ICON[kind] ?? '•' : '•';
}

function kindLabel(kind: string | null | undefined): string | null {
  return kind ? kind.replace(/\b\w/g, c => c.toUpperCase()) : null;
}

/**
 * Two-tier sort.
 *
 * Tier 0 (always wins): pins explicitly placed in `pinOrder` — these
 * render first, in the order the admin curated. Position N renders Nth.
 *
 * Tier 1 (fallback): pins NOT in `pinOrder` follow the user's chosen
 * sort key (rated / rating / recent / visited / alpha / city). The
 * default 'rated' surfaces reviewed-and-rated pins ahead of everything
 * else, which matches the experience visitors had before pin_order
 * existed.
 *
 * Result: hand-picked pins always lead, the long tail still self-orders
 * by signal. The admin only has to renumber the few they care about.
 */
function sortPins(
  pins: SavedListPin[],
  key: SavedListSortKey,
  pinOrder: string[] = [],
): SavedListPin[] {
  const orderIdx = new Map<string, number>();
  pinOrder.forEach((id, i) => orderIdx.set(id, i));
  const fallback = sortByKey(pins, key);
  // Stable separation: emit pinned pins in their explicit order, then
  // append the unpinned tail in fallback-sorted order. Single pass each.
  const pinned: SavedListPin[] = [];
  const seen = new Set<string>();
  for (const id of pinOrder) {
    const found = fallback.find(p => p.id === id);
    if (found && !seen.has(found.id)) {
      pinned.push(found);
      seen.add(found.id);
    }
  }
  const unpinned = fallback.filter(p => !seen.has(p.id));
  return [...pinned, ...unpinned];
}

function sortByKey(pins: SavedListPin[], key: SavedListSortKey): SavedListPin[] {
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
  pinOrder = [],
  groupByKind = false,
  excludeKinds = [],
  groupedSectionLimit = 8,
}: Props) {
  const [sort, setSort] = useState<SavedListSortKey>(initialSort);
  const [shown, setShown] = useState(pageSize);
  // Per-section expanded state. Tracks kinds the user has clicked
  // "Show all" on so each section's overflow expands independently
  // without affecting siblings. Only used when groupByKind=true.
  const [expandedKinds, setExpandedKinds] = useState<Set<string>>(new Set());

  // Re-sort when the user picks a new sort key. useMemo keeps SSR HTML stable
  // until hydration; reset paging on sort change so the user sees the new top.
  // pinOrder is treated as a stable manual tier — pinned pins render first
  // in the curated order regardless of the dropdown selection.
  const sorted = useMemo(
    () => sortPins(pins, sort, pinOrder),
    [pins, sort, pinOrder],
  );

  // Group sorted pins by kind, in the canonical KIND_ORDER. Pins
  // without a kind, or with a kind not in KIND_ORDER, fall into an
  // "other" bucket appended at the end. Kinds in `excludeKinds`
  // drop out entirely. Memoized so re-sort + filter only runs when
  // sort or input changes.
  const grouped = useMemo(() => {
    if (!groupByKind) return null;
    const excludeSet = new Set(excludeKinds);
    const buckets = new Map<string, SavedListPin[]>();
    for (const p of sorted) {
      const k = (p.kind ?? '').toLowerCase();
      if (excludeSet.has(k)) continue;
      const bucket = KIND_ORDER.includes(k) ? k : 'other';
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(p);
    }
    // Emit in canonical order, filtering empty buckets. "Other" lands
    // at the end if anything fell through.
    const ordered: { kind: string; pins: SavedListPin[] }[] = [];
    for (const k of KIND_ORDER) {
      const arr = buckets.get(k);
      if (arr && arr.length > 0) ordered.push({ kind: k, pins: arr });
    }
    const other = buckets.get('other');
    if (other && other.length > 0) ordered.push({ kind: 'other', pins: other });
    return ordered;
  }, [sorted, groupByKind, excludeKinds]);

  if (pins.length === 0) return null;
  // Flat-mode visible window. Grouped mode ignores these and uses
  // its own per-section logic below.
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

      {grouped ? (
        <div className="space-y-10">
          {grouped.map(({ kind, pins: kPins }) => {
            const isExpanded = expandedKinds.has(kind);
            const limit = isExpanded ? kPins.length : groupedSectionLimit;
            const sectionVisible = kPins.slice(0, limit);
            const sectionRemaining = kPins.length - limit;
            const heading = KIND_SECTION_HEADING[kind] ?? kindLabel(kind) ?? 'Other';
            return (
              <div key={kind} id={kindAnchorId(kind)}>
                <h3 className="text-h3 text-ink-deep mb-1">{heading}</h3>
                <p className="mb-4 text-label text-muted tabular-nums">
                  {kPins.length} {kPins.length === 1 ? 'pin' : 'pins'}
                  {kPins.filter(p => p.visited).length > 0 && (
                    <> · {kPins.filter(p => p.visited).length} visited</>
                  )}
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {sectionVisible.map(p => (
                    <li key={p.id}>{renderPinCard(p)}</li>
                  ))}
                </ul>
                {sectionRemaining > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKinds(prev => {
                          const next = new Set(prev);
                          next.add(kind);
                          return next;
                        })
                      }
                      className="text-label text-teal hover:underline"
                    >
                      Show all {kPins.length} {heading.toLowerCase()}
                      <span className="text-muted ml-1.5 tabular-nums">
                        ({sectionRemaining} more)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map(p => (
              <li key={p.id}>{renderPinCard(p)}</li>
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
        </>
      )}
    </section>
  );
}

/** Single pin card. Extracted so the flat and grouped render paths share
 *  the same markup; styling and pill rules stay in one place. */
function renderPinCard(p: SavedListPin) {
  // Kind-aware price pill: restaurants get their tier ($-$$$$);
  // attractions / parks / etc keep the Free pill when free is true;
  // hotels skip the pill row (their pricing lives in the kind-specific
  // section on the detail page).
  const showTier = p.kind === 'restaurant' && !!p.priceTier;
  const showFree =
    p.kind !== 'restaurant' && p.kind !== 'hotel' && p.free === true;
  return (
    <Link
      href={p.slug ? `/pins/${p.slug}` : `/pins/${p.id}`}
      className="group card p-2.5 flex items-center gap-3 hover:shadow-paper transition-shadow"
    >
      {p.cover ? (
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(p.cover, { size: 80 }) ?? p.cover}
            alt=""
            loading="lazy"
            decoding="async"
            width={40}
            height={40}
            className="w-10 h-10 rounded-md object-cover bg-cream-soft border border-sand"
          />
          <CommonsAttributionBadge url={p.cover} />
          {p.visited && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-teal text-white text-[10px] leading-4 text-center border border-white">
              ✓
            </span>
          )}
        </div>
      ) : (
        <div
          aria-hidden
          className="w-10 h-10 flex-shrink-0 rounded-md bg-cream-soft border border-sand flex items-center justify-center text-base text-muted"
        >
          {kindIcon(p.kind)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-ink-deep font-semibold leading-tight truncate text-small group-hover:text-teal transition-colors">
            {p.name}
          </h3>
          {p.visited && (
            <span className="text-micro text-teal font-medium uppercase tracking-wider flex-shrink-0">
              Been
            </span>
          )}
        </div>
        {(p.kind || p.city || p.country) && (
          <p className="mt-0.5 text-label text-muted truncate">
            {[kindLabel(p.kind), p.city, p.country].filter(Boolean).join(' · ')}
          </p>
        )}
        {p.rating != null && p.rating > 0 && (
          <p className="mt-0.5 text-label" aria-label={`${p.rating} stars`}>
            {'⭐'.repeat(p.rating)}
            {p.visitYear ? (
              <span className="ml-1.5 text-muted text-micro tabular-nums">
                · {p.visitYear}
              </span>
            ) : null}
          </p>
        )}
        {p.review && (
          <p className="mt-0.5 text-label text-slate leading-snug line-clamp-2">
            {p.review}
          </p>
        )}
        {(showTier || showFree || p.unesco) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {p.unesco && (
              <span className="pill bg-teal/10 text-teal text-micro">UNESCO</span>
            )}
            {showTier && (
              <span className="pill bg-teal/10 text-teal text-micro font-mono">
                {p.priceTier}
              </span>
            )}
            {showFree && (
              <span className="pill bg-cream-soft border border-sand text-micro text-slate">
                Free
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
