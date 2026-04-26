'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePinFilters } from './PinFiltersContext';
import { flagCircle } from '@/lib/flags';
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

  // Filter + sort. Memoised so the work runs once per state change rather
  // than on every render (e.g. when the parent re-renders from count
  // updates).
  const filtered = useMemo(() => {
    const state = ctx?.state;
    if (!state) return pins;

    const needle = state.q.trim().toLowerCase();
    const out: Pin[] = [];
    for (const p of pins) {
      // q match
      if (needle) {
        const hay = (
          p.name + '\n' +
          (p.description ?? '') + '\n' +
          p.cityNames.join(' ') + '\n' +
          p.statesNames.join(' ')
        ).toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      // visited
      if (state.visitedFilter === 'visited' && !p.visited) continue;
      if (state.visitedFilter === 'not-visited' && p.visited) continue;
      // UNESCO-only
      if (state.unescoOnly && p.unescoId == null) continue;
      // categories
      if (state.categories.size > 0 && (!p.category || !state.categories.has(p.category))) continue;
      // country (matches first state_name)
      if (state.countries.size > 0) {
        const country = p.statesNames[0];
        if (!country || !state.countries.has(country)) continue;
      }
      out.push(p);
    }
    // sort
    out.sort((a, b) => {
      let cmp = 0;
      if (state.sort === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        // 'recent' — compare timestamps; missing values sort last regardless of dir
        const A = a.airtableModifiedAt ?? a.updatedAt ?? '';
        const B = b.airtableModifiedAt ?? b.updatedAt ?? '';
        if (!A && !B) cmp = 0;
        else if (!A) cmp = 1;
        else if (!B) cmp = -1;
        else cmp = A < B ? -1 : A > B ? 1 : 0;
      }
      return state.desc ? -cmp : cmp;
    });
    return out;
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
  const cover = pin.images[0];
  const country = pin.statesNames[0] ?? null;
  const city = pin.cityNames[0] ?? null;
  const placeText = [city, country].filter(Boolean).join(', ');
  const subParts = [
    pin.category ?? (pin.unescoId != null ? 'UNESCO' : null),
    placeText || null,
  ].filter(Boolean);
  const subLabel = subParts.join(' · ');
  const flagUrl = flagCircle(countryIso2);

  return (
    <Link
      href={`/pins/${pin.slug ?? pin.id}`}
      className="group card p-2.5 flex items-center gap-3 hover:shadow-paper transition-shadow"
    >
      <div className="flex-shrink-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
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
              className="w-5 h-5 rounded-full border border-sand bg-white flex-shrink-0"
            />
          )}
        </div>
        {subLabel && (
          <p className="text-[12px] text-muted truncate font-mono mt-0.5">
            {subLabel}
          </p>
        )}
      </div>
    </Link>
  );
}
