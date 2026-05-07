'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePinFilters } from './PinFiltersContext';
import { filterPins, sortPins } from '@/lib/pinFilter';
import { flagRect } from '@/lib/flags';
import { LIST_ICONS, LIST_SHORT_LABELS, type CanonicalList } from '@/lib/pinLists';
import { parseHours, todayHoursLabel } from '@/lib/parseHours';
import { thumbUrl } from '@/lib/imageUrl';
import { snippet } from '@/lib/savedLists';
import type { PinForCard } from '@/lib/pinsCardData';
import CommonsAttributionBadge from './CommonsAttributionBadge';

/** Cards rendered on first paint — 60 covers ~3 viewports of grid on
 *  desktop and a long scroll on mobile. The rest stream in via an
 *  IntersectionObserver-driven pager so we don't ship 1,300 DOM nodes
 *  + 1,300 image requests on initial load. */
const PAGE_SIZE = 60;

// === PinsGrid ==============================================================
// Client component that takes the server-fetched pin list (already mapped
// to camelCase), reads filter state from PinFiltersContext, and renders
// the filtered/sorted result.
//
// Filter logic:
//   * q: case-insensitive substring on name, description, city, country
//   * visitedFilter: 'all' | 'visited' | 'not-visited'
//   * unescoOnly: pin.unescoId is not null
//   * categories: pin.category ∈ selected set (when set is non-empty)
//   * countries: pin.statesNames[0] ∈ selected set (when set is non-empty)
//
// Sort:
//   * 'name' — locale-compare on pin.name
//   * 'recent' — by airtableModifiedAt desc, falls back to updatedAt
//
// Reports the result/total count back to the panel via context so the
// "X / Y pins" badge stays in sync.
type Props = {
  pins: PinForCard[];
  countryNameToIso2: Record<string, string>;
};

export default function PinsGrid({ pins, countryNameToIso2 }: Props) {
  const ctx = usePinFilters();

  // Filter + sort via the shared helper so cards, table, and map run
  // the exact same predicates.
  const filtered = useMemo(() => {
    const state = ctx?.state;
    if (!state) return pins;
    return sortPins(filterPins(pins, state), state);
  }, [pins, ctx?.state]);

  // Push counts up to the panel.
  useEffect(() => {
    ctx?.setCounts(filtered.length, pins.length);
  }, [ctx, filtered.length, pins.length]);

  // Pagination — only render PAGE_SIZE cards initially, then bump as the
  // user scrolls past the sentinel. Resets to PAGE_SIZE whenever the
  // filter state changes so a freshly-applied filter starts at the top.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [ctx?.state]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length));
          }
        }
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  if (filtered.length === 0) {
    return (
      <div className="card p-8 text-center text-slate">
        No pins match the current filters.
      </div>
    );
  }

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map(pin => (
          <PinCard
            key={pin.id}
            pin={pin}
            countryIso2={
              pin.statesNames[0]
                ? countryNameToIso2[pin.statesNames[0].toLowerCase()] ?? null
                : null
            }
          />
        ))}
      </div>
      {remaining > 0 && (
        <div ref={sentinel} className="mt-6 text-center text-small text-muted py-6">
          Loading more… ({remaining} left)
        </div>
      )}
    </>
  );
}

// === PinCard (client) =====================================================
// Same shape as the previous server-rendered card, just lifted into the
// client tree so the grid can re-render without a full route round-trip.
function PinCard({
  pin,
  countryIso2,
}: {
  pin: PinForCard;
  countryIso2: string | null;
}) {
  // Thumbnail transform: tell Supabase Storage to serve a 112x112 (2x of
  // the 56px CSS size) JPEG instead of the original 4-8 MB photo. This
  // is the single biggest perf win on /pins/cards — without it each card
  // pulls down a full-resolution image just to render a postage stamp.
  const coverUrl = thumbUrl(
    pin.personalCoverUrl ?? pin.images[0]?.url ?? null,
    { size: 56 },
  );
  const country = pin.statesNames[0] ?? null;
  const city = pin.cityNames[0] ?? null;
  const placeText = [city, country].filter(Boolean).join(', ');
  const subParts = [
    pin.category ?? (pin.unescoId != null ? 'UNESCO' : null),
    placeText || null,
  ].filter(Boolean);
  const subLabel = subParts.join(' · ');
  const flagUrl = flagRect(countryIso2);

  // Up to two list badges on the card. The wonder/Atlas Obscura sets
  // come first because they're the rarest and most distinctive; UNESCO
  // is included now that the chit carries a recognisable globe icon
  // (previously it was text-only and would have been noise — most pins
  // are UNESCO sites). Source order is preserved as priority order so a
  // pin that's both Atlas Obscura AND UNESCO surfaces Atlas Obscura first.
  const PRIORITY_LISTS: CanonicalList[] = [
    'Atlas Obscura',
    'New 7 Wonders',
    '7 Natural Wonders',
    '7 Ancient Wonders',
    'International Dark Sky Park',
    'IUGS Geological Heritage Site',
    'Ramsar Wetland',
    'UNESCO World Heritage',
    'UNESCO Tentative List',
  ];
  const visibleLists = PRIORITY_LISTS.filter(l => pin.lists.includes(l)).slice(0, 2);

  // Today's open-hours snippet — only when the pin has a parseable
  // weekly schedule. Free-form prose hours are kept for the detail
  // page; trying to summarise them on a 14-line card cell is fragile.
  const hoursToday = todayHoursLabel(parseHours(pin.hours));

  // Personal review snippet — first sentence-or-two of Mike's prose,
  // line-clamped on the card. The truncation itself is the affordance
  // to click through; the visit_year sits next to the rating.
  const reviewSnippet = snippet(pin.personalReview, 110);
  const hasRating = pin.personalRating != null && pin.personalRating > 0;
  // Compact admission hint — only render when we have a confirmed
  // numeric price. The atlas's price coverage is sparse so a "Cost"
  // row is mostly noise; reserve it for the (currently ~5) pins
  // that carry curated price info.
  const priceHint =
    pin.priceAmount === 0
      ? 'Free'
      : pin.priceAmount != null && pin.priceCurrency
        ? `${pin.priceCurrency} ${pin.priceAmount}`
        : null;

  return (
    <Link
      href={`/pins/${pin.slug ?? pin.id}`}
      className="group card p-2.5 flex items-center gap-3 hover:shadow-paper transition-shadow"
    >
      <div className="relative flex-shrink-0">
        {coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              width={56}
              height={56}
              className="w-14 h-14 rounded-lg object-cover bg-cream-soft border border-sand"
            />
            <CommonsAttributionBadge url={coverUrl} />
          </>
        ) : (
          <div
            aria-hidden
            className="w-14 h-14 rounded-lg bg-cream-soft border border-sand flex items-center justify-center text-base text-muted"
          >
            📍
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-ink-deep font-semibold leading-tight truncate flex-1 group-hover:text-teal transition-colors">
            {pin.name}
          </h2>
          {pin.visited && (
            <span className="text-micro text-teal font-medium uppercase tracking-wider flex-shrink-0">
              Been
            </span>
          )}
          {flagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flagUrl}
              alt={country ?? ''}
              title={country ?? ''}
              loading="lazy"
              decoding="async"
              width={24}
              height={16}
              className="w-6 h-4 rounded-sm border border-sand bg-white object-cover flex-shrink-0"
            />
          )}
        </div>
        {subLabel && (
          <p className="text-small text-muted truncate font-mono mt-0.5">
            {subLabel}
          </p>
        )}
        {/* Personal experience row — rating + visit year. The emoji stars
            do most of the recognition work; the year is muted so it reads
            as a secondary detail. Only renders when there's a rating;
            unrated visited pins keep the card compact. */}
        {hasRating && (
          <p
            className="mt-0.5 text-label leading-tight"
            aria-label={`${pin.personalRating} stars`}
          >
            {'⭐'.repeat(pin.personalRating ?? 0)}
            {pin.visitYear ? (
              <span className="ml-1.5 text-muted text-micro tabular-nums">
                · {pin.visitYear}
              </span>
            ) : null}
          </p>
        )}
        {/* Review snippet — Mike's prose, truncated to ~110 chars and
            clamped to two lines. The truncation itself is the click bait
            into the detail page. Skipped entirely when there's no review,
            so unreviewed cards don't get pushed taller for empty space. */}
        {reviewSnippet && (
          <p className="mt-0.5 text-label text-slate leading-snug line-clamp-2">
            {reviewSnippet}
          </p>
        )}
        {visibleLists.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {visibleLists.map(l => (
              <ListBadge key={l} list={l} />
            ))}
          </div>
        )}
        {/* Practical info row — compact today-hours snippet plus an
            admission hint when known. Shown together since both are
            "should I bother going right now?" signals. Only renders
            when we actually have data (no "Hours: —" placeholders). */}
        {(hoursToday || priceHint) && (
          <div className="mt-1 flex items-center gap-2 text-micro text-slate font-mono">
            {hoursToday && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>🕐</span>
                <span className="truncate">{hoursToday}</span>
              </span>
            )}
            {hoursToday && priceHint && <span aria-hidden className="text-muted">·</span>}
            {priceHint && (
              <span className={priceHint === 'Free' ? 'text-teal' : ''}>{priceHint}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// === ListBadge ============================================================
// Compact icon-bearing chit for a canonical list membership. The emoji
// glyph (globe for UNESCO, compass for Atlas Obscura, etc.) does most of
// the recognition work — for a glanceable card it's faster to scan than
// reading "UNESCO World Heritage" repeatedly across 1,300 pins. The full
// canonical name is preserved on the title attribute for hover/screen
// readers, and the short label is the visible text.
function ListBadge({ list }: { list: CanonicalList }) {
  const icon = LIST_ICONS[list];
  const label = LIST_SHORT_LABELS[list];
  return (
    <span
      className="inline-flex items-center gap-1 text-micro leading-none px-1.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20"
      title={`Featured on ${list}`}
    >
      <span aria-hidden className="text-label">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
