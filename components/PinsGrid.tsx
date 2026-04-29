'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePinFilters } from './PinFiltersContext';
import { filterPins, sortPins } from '@/lib/pinFilter';
import { flagRect } from '@/lib/flags';
import { LIST_ICONS, LIST_SHORT_LABELS, type CanonicalList } from '@/lib/pinLists';
import { parseHours, todayHoursLabel } from '@/lib/parseHours';
import type { Pin } from '@/lib/pins';

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
  pins: Pin[];
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

  if (filtered.length === 0) {
    return (
      <div className="card p-8 text-center text-slate">
        No pins match the current filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {filtered.map(pin => (
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
  );
}

// === PinCard (client) =====================================================
// Same shape as the previous server-rendered card, just lifted into the
// client tree so the grid can re-render without a full route round-trip.
function PinCard({
  pin,
  countryIso2,
}: {
  pin: Pin;
  countryIso2: string | null;
}) {
  const coverUrl = pin.personalCoverUrl ?? pin.images[0]?.url ?? null;
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
      <div className="flex-shrink-0">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            aria-hidden
            className="w-14 h-14 rounded-lg object-cover bg-cream-soft border border-sand"
          />
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
            <span className="text-[10px] text-teal font-medium uppercase tracking-wider flex-shrink-0">
              Been
            </span>
          )}
          {flagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flagUrl}
              alt={country ?? ''}
              title={country ?? ''}
              className="w-6 h-4 rounded-sm border border-sand bg-white object-cover flex-shrink-0"
            />
          )}
        </div>
        {subLabel && (
          <p className="text-[12px] text-muted truncate font-mono mt-0.5">
            {subLabel}
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
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate font-mono">
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
      className="inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20"
      title={`Featured on ${list}`}
    >
      <span aria-hidden className="text-[11px]">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
