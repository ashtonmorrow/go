'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import FilterPanel from './FilterPanel';
import PinFilterPanel from './PinFilterPanel';
import CountryFilterPanel from './CountryFilterPanel';
import { useCityFilters } from './CityFiltersContext';
import { usePinFilters } from './PinFiltersContext';
import { useCountryFilters } from './CountryFiltersContext';

type Counts = {
  cities: number;
  countries: number;
  been: number;
  go: number;
  saved: number;
  pins: number;
};

// Layer-inspired left rail. Top to bottom:
//   • Views        — this section's own routes (Postcards, Map, About)
//   • Collections  — informational counts (Cities / Countries / Been / Go /
//                    Saved). On /cities this slot is replaced with the full
//                    FilterPanel cockpit.
//   • Elsewhere    — external Mike Lee subdomains
//   • Home + Whisker Leaks credit, anchored to the bottom
//
// On screens < md the rail collapses into a top app bar with a hamburger
// that slides the same nav in from the left as a drawer.

// Object axis. The View axis (Cards / Map / Table) lives in the
// per-page <ViewSwitcher>, not here. Sidebar links land on the Cards
// view of each object — the canonical default.
const PAGES: { href: string; emoji: string; label: string }[] = [
  { href: '/cities/cards',    emoji: '📮', label: 'Cities' },
  { href: '/countries/cards', emoji: '🌍', label: 'Countries' },
  { href: '/pins/cards',      emoji: '📍', label: 'Pins' },
  { href: '/about',           emoji: '📖', label: 'About' },
];

// External links to other Mike Lee subdomains. mike-lee.me itself isn't
// listed because the bottom-anchored '🏠 Home' button already points there.
// The "About" link that used to live here pointed to app.mike-lee.me;
// that's now the internal /about route in the Views section.
const ELSEWHERE: { href: string; emoji: string; label: string }[] = [
  { href: 'https://ski.mike-lee.me/', emoji: '⛷️', label: 'Cat-Ski' },
  { href: 'https://app.stray.tips/share/animal/f475e984-b982-4b7f-a913-79fb28ae8bb8', emoji: '🐈', label: 'Stray' },
];

export default function SidebarShell({
  counts,
  countryOptions,
  pinCountryOptions = [],
  pinCategoryOptions = [],
  pinListOptions = [],
  pinTagOptions = [],
}: {
  counts: Counts;
  countryOptions: string[];
  pinCountryOptions?: string[];
  pinCategoryOptions?: string[];
  pinListOptions?: string[];
  pinTagOptions?: string[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* === Mobile top bar === only visible below md. Just the hamburger —
          no brand label, since it would duplicate what the URL bar already
          says and clutter the narrow viewport. === */}
      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-sand">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="p-2 -m-2 rounded hover:bg-cream-soft"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* === Mobile drawer scrim === */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/30"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* === Mobile drawer === */}
      <aside
        className={
          'md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-white border-r border-sand transition-transform duration-200 ' +
          (drawerOpen ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <NavBody
          counts={counts}
          countryOptions={countryOptions}
          pinCountryOptions={pinCountryOptions}
          pinCategoryOptions={pinCategoryOptions}
          pinListOptions={pinListOptions}
          pinTagOptions={pinTagOptions}
          onLinkClick={() => setDrawerOpen(false)}
        />
      </aside>

      {/* === Desktop sticky rail === always visible md+, fills the viewport
          height. Sits on the left of the page with main content to its right. */}
      <aside className="hidden md:block sticky top-0 h-screen w-64 flex-shrink-0 bg-white border-r border-sand overflow-y-auto">
        <NavBody
          counts={counts}
          countryOptions={countryOptions}
          pinCountryOptions={pinCountryOptions}
          pinCategoryOptions={pinCategoryOptions}
          pinListOptions={pinListOptions}
          pinTagOptions={pinTagOptions}
        />
      </aside>
    </>
  );
}

// === NavBody ===
// The actual sidebar contents — shared between desktop rail and mobile drawer.
//
// On /cities the panel becomes a full filter cockpit: pages → filter panel
// (search, status, geography, practicality, sort) → elsewhere. On every
// other page the filter panel is hidden and the collections section takes
// its place.
function NavBody({
  counts,
  countryOptions,
  pinCountryOptions,
  pinCategoryOptions,
  pinListOptions,
  pinTagOptions,
  onLinkClick,
}: {
  counts: Counts;
  countryOptions: string[];
  pinCountryOptions: string[];
  pinCategoryOptions: string[];
  pinListOptions: string[];
  pinTagOptions: string[];
  onLinkClick?: () => void;
}) {
  const pathname = usePathname() || '';
  const cityFiltersAvailable    = useCityFilters() !== null;
  const pinFiltersAvailable     = usePinFilters() !== null;
  const countryFiltersAvailable = useCountryFilters() !== null;
  // Filter-cockpit visibility under the Object × View routes:
  //   * City filters apply to /cities/cards, /cities/table, and the
  //     country globe (whose shading derives from filtered cities)
  //   * Country filters apply to /countries/cards + /countries/table
  //   * Pin filters apply to all three pin views
  // Detail pages and views that aren't wired to a filter context get the
  // read-only Collections list instead.
  const onCitiesCards     = pathname === '/cities/cards';
  const onCitiesMap       = pathname === '/cities/map';
  const onCitiesTable     = pathname === '/cities/table';
  const onCountriesGlobe  = pathname === '/countries/map';
  const onCountriesCards  = pathname === '/countries/cards';
  const onCountriesTable  = pathname === '/countries/table';
  const onPinsAny = pathname === '/pins/cards' || pathname === '/pins/map' || pathname === '/pins/table';
  const showCityFilters =
    cityFiltersAvailable && (onCitiesCards || onCitiesMap || onCitiesTable || onCountriesGlobe);
  const showCountryFilters =
    countryFiltersAvailable && (onCountriesCards || onCountriesTable);
  const showPinFilters = pinFiltersAvailable && onPinsAny;

  return (
    <div className="flex flex-col h-full p-4 gap-6">
      {/* Views — this section's own routes (Postcards, Map, About) */}
      <Section label="Views">
        {PAGES.map(p => {
          // Sidebar items always link to the Cards view of an object, but
          // the active state should light up for any view of that object,
          // including the dynamic detail pages — /cities/[slug] etc.
          // Shared prefix is "/<object>/", which we derive from the link.
          const objectPrefix = p.href.replace(/\/cards$/, '/');
          const active =
            pathname === p.href ||
            (objectPrefix.endsWith('/') && pathname.startsWith(objectPrefix));
          return (
            <Item
              key={p.href}
              href={p.href}
              emoji={p.emoji}
              label={p.label}
              active={active}
              onClick={onLinkClick}
            />
          );
        })}
      </Section>

      {/* Filter cockpits — at most one mounted at a time, picked by
          which Object × View page we're on. Falls through to a
          read-only Collections list with counts on detail pages. */}
      {showCityFilters ? (
        <FilterPanel countryOptions={countryOptions} />
      ) : showPinFilters ? (
        <PinFilterPanel
          countryOptions={pinCountryOptions}
          categoryOptions={pinCategoryOptions}
          listOptions={pinListOptions}
          tagOptions={pinTagOptions}
        />
      ) : showCountryFilters ? (
        <CountryFilterPanel />
      ) : (
        <Section label="Collections">
          <Item href="/cities/cards"    emoji="📮" label="Cities"    count={counts.cities}    onClick={onLinkClick} />
          <Item href="/countries/cards" emoji="🌍" label="Countries" count={counts.countries} onClick={onLinkClick} />
          <Item href="/pins/cards"      emoji="📍" label="Pins"      count={counts.pins}      onClick={onLinkClick} />
          <Item href="/cities/cards"    emoji="✈️" label="Been"      count={counts.been}      onClick={onLinkClick} />
          <Item href="/cities/cards"    emoji="⭐" label="Go"        count={counts.go}        onClick={onLinkClick} />
          <Item href="/cities/cards"    emoji="💾" label="Saved"     count={counts.saved}     onClick={onLinkClick} />
        </Section>
      )}

      {/* Elsewhere — external Mike Lee subdomains. Now sits below the
          Collections / Filters block so the in-section content controls
          come before the off-site links. */}
      <Section label="Elsewhere">
        {ELSEWHERE.map(p => (
          <ExternalItem key={p.href} href={p.href} emoji={p.emoji} label={p.label} />
        ))}
      </Section>

      {/* Bottom block: Home (= the parent site, mike-lee.me — this is just
          a sub-section) + footer credit. mt-auto pushes to the bottom. */}
      <div className="mt-auto flex flex-col gap-3 pt-4">
        <ExternalItem href="https://mike-lee.me/" emoji="🏠" label="Home" />
        <a
          href="https://www.linkedin.com/in/mikelee89/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 text-[11px] text-muted hover:text-ink-deep transition-colors"
        >
          Whisker Leaks — {new Date().getFullYear()}
        </a>
      </div>
    </div>
  );
}

// === Section header ===
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium px-2 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

// === Item ===
// Single sidebar row: emoji + label + optional count, internal link.
function Item({
  href,
  emoji,
  label,
  count,
  active,
  onClick,
}: {
  href: string;
  emoji: string;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={
        'group flex items-center gap-2 px-2 py-1.5 rounded text-small transition-colors ' +
        // Active state used to be bg-cream which reads as a soft gold pill.
        // Replaced with a quieter bg-cream-soft + ink-deep bold treatment so
        // the rail doesn't compete with brand-accent uses elsewhere.
        (active
          ? 'bg-cream-soft text-ink-deep font-semibold'
          : 'text-slate hover:bg-cream-soft hover:text-ink-deep')
      }
    >
      <span className="text-base leading-none flex-shrink-0" aria-hidden>{emoji}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-muted bg-sand/70 px-1.5 py-0.5 rounded">
          {count}
        </span>
      )}
    </Link>
  );
}

// === ExternalItem ===
// External link with the small "↗" indicator, opens in a new tab.
function ExternalItem({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 px-2 py-1.5 rounded text-small text-slate hover:bg-cream-soft hover:text-ink-deep transition-colors"
    >
      <span className="text-base leading-none flex-shrink-0" aria-hidden>{emoji}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-muted text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>↗</span>
    </a>
  );
}
