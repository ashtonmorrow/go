'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { flagCircle } from '@/lib/flags';
import { useCountryFilters, type CountryLayer } from './CountryFiltersContext';
import { filterCountries, sortCountries } from '@/lib/countryFilter';

type CityRef = { id: string; name: string; slug: string; been: boolean };

// Minimal country shape the grid needs. Carries the practicality fields the
// CountryFilterPanel cockpit filters on (continent, schengen, visa,
// tapWater, driveSide) so the client work has everything inline.
type Country = {
  id: string;
  name: string;
  slug: string;
  flag: string | null;
  iso2: string | null;
  capital: string | null;
  continent: string | null;
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
  driveSide: 'L' | 'R' | null;
  /** Derived server-side from member-city been/go flags. Drives the
   *  statusFocus filter — see lib/countryFilter.ts. */
  status: CountryLayer;
};

type Props = { countries: Country[] };

export default function CountriesGrid({ countries }: Props) {
  const router = useRouter();
  const ctx = useCountryFilters();

  // Filter + sort via the shared cockpit. When the context isn't mounted
  // (defensive — provider is always wrapped in layout.tsx) fall through
  // to a name-sorted render.
  const filtered = useMemo(() => {
    const state = ctx?.state;
    if (!state) return [...countries].sort((a, b) => a.name.localeCompare(b.name));
    return sortCountries(filterCountries(countries, state), state);
  }, [countries, ctx?.state]);

  // Push counts up to the cockpit footer.
  useEffect(() => {
    ctx?.setCounts(filtered.length, countries.length);
  }, [ctx, filtered.length, countries.length]);

  return (
    <section className="max-w-page mx-auto px-5 pb-10">
      {/* Flag tile grid — 2 / 3 / 4 / 5 columns at increasing widths. Each
          card uses the shared flip-perspective CSS so the back of the card
          shows facts; identical mechanic to the cities postcards. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(c => (
          <FlagCard key={c.id} country={c} onClick={() => router.push(`/countries/${c.slug}`)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p>No countries match the current filters.</p>
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
                <span className="text-micro font-mono text-muted tracking-[0.1em]">{country.iso2}</span>
              )}
            </div>
            <dl className="text-micro leading-tight space-y-0.5 flex-1 min-h-0 overflow-hidden">
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
              <div className="mt-1.5 pt-1.5 border-t border-sand text-micro text-slate flex justify-between tabular-nums">
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
              <span className="text-micro uppercase tracking-[0.14em] text-teal bg-white/95 rounded-full px-1.5 py-0.5 flex-shrink-0">
                Been
              </span>
            )}
          </div>
        </div>
      </div>

      {/* === Dropdown ===
          Rendered as a SIBLING of .flip-card (inside .flip-perspective)
          so it doesn't rotate with the flip and can extend BELOW the
          card without being clipped. Positioned with top-full so it
          drops down from the card's bottom edge, classic menu UX. */}
      {pinned && dropdownCities.length > 0 && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-sand rounded-md shadow-card overflow-hidden"
          style={{ maxHeight: 'min(320px, 60vh)' }}
        >
          <ul className="overflow-y-auto" style={{ maxHeight: 'min(320px, 60vh)' }}>
            {dropdownCities.map(c => (
              <li key={c.id}>
                <Link
                  href={`/cities/${c.slug}`}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-small text-ink hover:bg-cream-soft hover:text-ink-deep transition-colors"
                >
                  <span className="truncate">{c.name}</span>
                  {c.been && country.iso2 && (
                    // Purpose-designed circular flag SVG from circle-flags
                    // (HatScripts, MIT). National symbols are framed
                    // correctly inside the circle, unlike a cover-cropped
                    // rectangle. Size at 14×14 to match dropdown row height.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={flagCircle(country.iso2) || ''}
                      alt=""
                      title={`Been to a city in ${country.name}`}
                      width={14}
                      height={14}
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
      <span aria-hidden className="text-micro opacity-60">{active ? '▴' : '▾'}</span>
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <dt className="text-micro uppercase tracking-[0.12em] text-muted flex-shrink-0">{label}</dt>
      <dd className="text-ink-deep font-mono truncate text-right text-micro" title={value}>
        {value}
      </dd>
    </div>
  );
}
