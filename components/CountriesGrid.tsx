'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type CityRef = { id: string; name: string; slug: string; been: boolean };

// Minimal country shape the grid needs. Mirrors the "minimal" pattern used
// by CitiesGrid — keeps server payload small and the client component
// loosely coupled to the Notion schema.
type Country = {
  id: string;
  name: string;
  slug: string;
  flag: string | null;
  iso2: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  voltage: string | null;
  plugTypes: string[];
  emergencyNumber: string | null;
  cityCount: number;
  beenCount: number;
  cities: CityRef[];
  visa: string | null;
  tapWater: string | null;
};

type Props = { countries: Country[] };

type Sort = 'name' | 'visited' | 'cities' | 'continent';

export default function CountriesGrid({ countries }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [filter, setFilter] = useState<'all' | 'visited' | 'planned'>('all');

  const filtered = useMemo(() => {
    let list = countries;

    if (filter === 'visited') list = list.filter(c => c.beenCount > 0);
    if (filter === 'planned') list = list.filter(c => c.cityCount > 0 && c.beenCount === 0);

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(needle) || (c.iso2 || '').toLowerCase().includes(needle)
      );
    }

    return [...list].sort((a, b) => {
      if (sort === 'visited') return b.beenCount - a.beenCount || a.name.localeCompare(b.name);
      if (sort === 'cities') return b.cityCount - a.cityCount || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [countries, q, sort, filter]);

  const visitedCount = countries.filter(c => c.beenCount > 0).length;

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      <div className="max-w-prose">
        <h1 className="text-h1 text-ink-deep">My plan to see the entire world.</h1>
      </div>

      {/* Compact controls bar — search left, filter chips + sort right. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-small">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search country or ISO"
          className="px-3 py-2 rounded-md border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 w-56"
        />

        <div className="flex flex-wrap gap-1">
          {[
            { k: 'all' as const, label: 'All', count: countries.length },
            { k: 'visited' as const, label: 'Visited', count: visitedCount },
            { k: 'planned' as const, label: 'Planned only', count: countries.filter(c => c.cityCount > 0 && c.beenCount === 0).length },
          ].map(c => {
            const active = filter === c.k;
            return (
              <button
                key={c.k}
                onClick={() => setFilter(c.k)}
                className={
                  'px-3 py-1.5 rounded-full border transition-colors ' +
                  (active
                    ? 'bg-ink-deep text-cream-soft border-ink-deep'
                    : 'bg-white text-slate border-sand hover:border-slate')
                }
              >
                {c.label} <span className="opacity-70 ml-1 tabular-nums">{c.count}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 text-muted">
          <span>Sort:</span>
          {[
            { k: 'name' as const, label: 'A–Z' },
            { k: 'visited' as const, label: 'Most visited' },
            { k: 'cities' as const, label: 'Most cities' },
          ].map(s => (
            <button
              key={s.k}
              onClick={() => setSort(s.k)}
              className={
                'px-3 py-1 rounded-md transition-colors text-small font-medium ' +
                (sort === s.k ? 'bg-ink-deep text-cream-soft' : 'text-slate hover:text-ink-deep')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-small text-muted">
        {filtered.length} of {countries.length}
      </p>

      {/* Flag tile grid — 2 / 3 / 4 / 5 columns at increasing widths. Each
          card uses the shared flip-perspective CSS so the back of the card
          shows facts; identical mechanic to the cities postcards. */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(c => (
          <FlagCard key={c.id} country={c} onClick={() => router.push(`/countries/${c.slug}`)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p>No countries match.</p>
        </div>
      )}
    </section>
  );
}

// === FlagCard ===
// Two-faced tile: front is the flag image with country name + ISO badge
// overlaid; back is a list of practicalities. Hover flips on Y-axis, click
// navigates to the country detail page.
//
// The footer of the back face — "X cities / Y visited" — is interactive:
// click either count to pin the card flipped and open a dropdown listing
// the actual cities (filtered to visited when the visited count is
// clicked). Click outside or press Escape to close.
function FlagCard({ country, onClick }: { country: Country; onClick: () => void }) {
  // Tiny deterministic tilt per card so the grid feels hand-placed (same
  // trick as CityCard).
  const seed = (country.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((seed % 21) - 10) / 12; // -0.83..0.83 deg

  const beenBadge = country.beenCount > 0;

  // Dropdown state — null when closed. Pinning forces the card flipped
  // (overrides the hover-only CSS rule) so the user can interact with
  // the dropdown without it disappearing when the cursor moves.
  const [pinned, setPinned] = useState<'all' | 'visited' | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape to close. We listen at the document level
  // because the dropdown can extend outside the card bounds.
  useEffect(() => {
    if (!pinned) return;
    const onDocPointer = (e: MouseEvent | TouchEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setPinned(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  const dropdownCities = useMemo(
    () => (pinned === 'visited' ? country.cities.filter(c => c.been) : country.cities),
    [pinned, country.cities]
  );

  // Outer wrapper handles card-level click → navigate to the country
  // detail. Inner buttons that open dropdowns stop propagation.
  const handleCardClick = (e: React.MouseEvent) => {
    if (pinned) return; // Don't navigate while interacting with the dropdown
    onClick();
  };

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      className={
        'flip-perspective cursor-pointer group ' +
        // When pinned, force the back face visible by adding the same
        // hover-state class the CSS targets. See globals.css below.
        (pinned ? 'is-pinned' : '')
      }
      style={{ aspectRatio: '3 / 2', transform: `rotate(${tilt}deg)`, zIndex: pinned ? 30 : undefined }}
    >
      <div className="flip-card">
        {/* === BACK FACE — facts === */}
        <div
          className="flip-face flip-face-back overflow-hidden bg-white border border-sand rounded-md shadow-card"
        >
          <div className="h-full p-3 flex flex-col">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <h3 className="text-ink-deep font-semibold text-small leading-tight truncate">
                {country.name}
              </h3>
              {country.iso2 && (
                <span className="text-[9px] font-mono text-muted tracking-[0.1em]">{country.iso2}</span>
              )}
            </div>
            <dl className="text-[10px] leading-tight space-y-0.5 flex-1 min-h-0 overflow-hidden">
              {country.capital && <Fact label="Capital" value={country.capital} />}
              {country.language && <Fact label="Lang" value={country.language} />}
              {country.currency && <Fact label="Currency" value={country.currency} />}
              {country.callingCode && <Fact label="Tel" value={country.callingCode} />}
              {country.voltage && <Fact label="Volt" value={country.voltage} />}
              {country.plugTypes.length > 0 && (
                <Fact label="Plugs" value={country.plugTypes.join(', ')} />
              )}
              {country.visa && <Fact label="Visa" value={country.visa} />}
              {country.tapWater && <Fact label="Water" value={country.tapWater} />}
              {country.emergencyNumber && <Fact label="999" value={country.emergencyNumber} />}
            </dl>
            {country.cityCount > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-sand text-[10px] text-slate flex justify-between tabular-nums">
                <CountButton
                  active={pinned === 'all'}
                  onClick={() => setPinned(pinned === 'all' ? null : 'all')}
                >
                  {country.cityCount} {country.cityCount === 1 ? 'city' : 'cities'}
                </CountButton>
                {country.beenCount > 0 && (
                  <CountButton
                    active={pinned === 'visited'}
                    onClick={() => setPinned(pinned === 'visited' ? null : 'visited')}
                    accent
                  >
                    {country.beenCount} visited
                  </CountButton>
                )}
              </div>
            )}
          </div>

          {/* === Dropdown ===
              Floats above the bottom strip when pinned. Constrained to the
              card width and capped at ~50% of card height with internal
              scroll, so it never spills out unpredictably. */}
          {pinned && dropdownCities.length > 0 && (
            <div
              role="menu"
              onClick={e => e.stopPropagation()}
              className="absolute z-30 left-1.5 right-1.5 bottom-9 bg-white border border-sand rounded-md shadow-card overflow-hidden"
              style={{ maxHeight: '60%' }}
            >
              <ul className="overflow-y-auto" style={{ maxHeight: '100%' }}>
                {dropdownCities.map(c => (
                  <li key={c.id}>
                    <Link
                      href={`/cities/${c.slug}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-ink hover:bg-cream-soft hover:text-ink-deep transition-colors"
                    >
                      <span className="truncate">{c.name}</span>
                      {c.been && (
                        <span
                          aria-hidden
                          className="inline-block w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0"
                          title="Been"
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* === FRONT FACE — flag photo === */}
        <div
          className="flip-face overflow-hidden bg-cream-soft border border-sand rounded-md shadow-card relative"
        >
          {country.flag ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={country.flag}
              alt={`${country.name} flag`}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-sand flex items-center justify-center text-muted text-small">
              {country.iso2 || '—'}
            </div>
          )}

          {/* Bottom strip: country name (always readable, even on flag) */}
          <div
            className="absolute bottom-0 inset-x-0 px-3 py-2 z-10 flex items-baseline justify-between gap-2"
            style={{ background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.7))' }}
          >
            <span className="text-white text-small font-medium uppercase tracking-[0.08em] truncate">
              {country.name}
            </span>
            {beenBadge && (
              <span className="text-[9px] uppercase tracking-[0.14em] text-teal bg-white/95 rounded-full px-1.5 py-0.5 flex-shrink-0">
                Been
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Small button styled to match the bottom-strip count text. Stops
// propagation so the card's onClick (navigate to country detail) doesn't
// fire when the user is opening a dropdown.
function CountButton({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={
        'inline-flex items-center gap-1 px-1.5 -mx-1.5 -my-0.5 py-0.5 rounded transition-colors ' +
        (active
          ? 'bg-cream-soft text-ink-deep'
          : accent
            ? 'text-teal font-medium hover:bg-cream-soft'
            : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
      }
      aria-expanded={active}
    >
      {children}
      <span aria-hidden className="text-[8px] opacity-60">{active ? '▴' : '▾'}</span>
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-muted flex-shrink-0">{label}</dt>
      <dd className="text-ink-deep font-mono truncate text-right text-[10px]" title={value}>
        {value}
      </dd>
    </div>
  );
}
