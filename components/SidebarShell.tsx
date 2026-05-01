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
import { withUtm } from '@/lib/utm';
import type { ArticleEntry } from '@/lib/articles';

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

// Object axis. The View axis (Cards / Map / Table / Stats) lives in
// the per-page <ViewSwitcher>, not here. Sidebar links land on the
// Cards view of each object — the canonical default.
const PAGES: { href: string; emoji: string; label: string }[] = [
  { href: '/cities/cards',    emoji: '📮', label: 'Cities' },
  { href: '/countries/cards', emoji: '🌍', label: 'Countries' },
  { href: '/pins/cards',      emoji: '📍', label: 'Pins' },
];

// External links to other Mike Lee subdomains. mike-lee.me itself isn't
// listed because the bottom-anchored '🏠 Home' button already points there.
// The "About" link that used to live here pointed to app.mike-lee.me;
// that's now the internal /about route in the Views section.
const ELSEWHERE: { href: string; emoji: string; label: string; campaign?: string }[] = [
  { href: 'https://ski.mike-lee.me/',     emoji: '⛷️', label: 'Cat-Ski', campaign: 'cat-ski' },
  { href: 'https://pounce.mike-lee.me/',  emoji: '🐾', label: 'Pounce',  campaign: 'pounce' },
  { href: 'https://app.stray.tips/',      emoji: '🐈', label: 'Stray',   campaign: 'stray' },
];

export default function SidebarShell({
  counts,
  countryOptions,
  pinCountryOptions = [],
  pinCategoryOptions = [],
  pinListOptions = [],
  pinTagOptions = [],
  pinSavedListOptions = [],
  articleEntries = [],
}: {
  counts: Counts;
  countryOptions: string[];
  pinCountryOptions?: string[];
  pinCategoryOptions?: string[];
  pinListOptions?: string[];
  pinTagOptions?: string[];
  pinSavedListOptions?: string[];
  /** Server-fetched article + post union — see lib/articles.getAllArticleEntries.
   *  Defaults to [] so existing call sites keep typechecking before the prop
   *  is threaded through; we should always pass it in production. */
  articleEntries?: ArticleEntry[];
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
          pinSavedListOptions={pinSavedListOptions}
          articleEntries={articleEntries}
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
          pinSavedListOptions={pinSavedListOptions}
          articleEntries={articleEntries}
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
  pinSavedListOptions,
  articleEntries,
  onLinkClick,
}: {
  counts: Counts;
  countryOptions: string[];
  pinCountryOptions: string[];
  pinCategoryOptions: string[];
  pinListOptions: string[];
  pinTagOptions: string[];
  pinSavedListOptions: string[];
  articleEntries: ArticleEntry[];
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
  const onCitiesStats     = pathname === '/cities/stats';
  const onCountriesGlobe  = pathname === '/countries/map';
  const onCountriesCards  = pathname === '/countries/cards';
  const onCountriesTable  = pathname === '/countries/table';
  const onCountriesStats  = pathname === '/countries/stats';
  const onPinsAny =
    pathname === '/pins/cards' ||
    pathname === '/pins/map' ||
    pathname === '/pins/table' ||
    pathname === '/pins/stats';
  const showCityFilters =
    cityFiltersAvailable &&
    (onCitiesCards || onCitiesMap || onCitiesTable || onCitiesStats || onCountriesGlobe);
  const showCountryFilters =
    countryFiltersAvailable && (onCountriesCards || onCountriesTable || onCountriesStats);
  const showPinFilters = pinFiltersAvailable && onPinsAny;

  return (
    <div className="flex flex-col h-full p-4 gap-6">
      {/* Top object axis — Cities / Countries / Pins. Articles nest inline
          under Pins as a hover sub-list (driven by lib/articles.ts). The
          old "Views" section label is gone — the structure is self-evident
          and the label was just noise. */}
      <div className="flex flex-col gap-0.5">
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
        {/* Articles sit immediately under Pins — hovering the row drops the
            article list inline beneath it, same nested treatment used for
            sub-items elsewhere. */}
        <ArticlesItem
          onClick={onLinkClick}
          pathname={pathname}
          entries={articleEntries}
        />
      </div>

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
          savedListOptions={pinSavedListOptions}
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
          <ExternalItem key={p.href} href={p.href} emoji={p.emoji} label={p.label} campaign={p.campaign} />
        ))}
      </Section>

      {/* Admin sub-nav — only renders when the user is already inside the
          /admin section (which means they got past the basic-auth gate at
          least once this session). Keeps the sidebar non-leaky for public
          visitors while making the admin sub-pages discoverable to Mike
          once he's typed /admin/lists or similar.
          Always-visible on /admin/* avoids the chicken-and-egg of needing
          a link to find a link. */}
      {pathname.startsWith('/admin') && (
        <Section label="Admin">
          <Item href="/admin/pins"          emoji="📌" label="Pins editor"   onClick={onLinkClick} />
          <Item href="/admin/lists"         emoji="🗂️" label="Saved lists"   onClick={onLinkClick} />
          <Item href="/admin/upload"        emoji="📷" label="Upload photos" onClick={onLinkClick} />
          <Item href="/admin/reservations/new" emoji="🛎️" label="Add reservation" onClick={onLinkClick} />
        </Section>
      )}

      {/* Bottom block: Home (= the parent site, mike-lee.me — this is
          just a sub-section), then a quiet About link below it. About
          got demoted from the Views section (which is reserved for the
          three first-class object axes) so it's less prominent but
          still findable. */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        <ExternalItem href="https://mike-lee.me/" emoji="🏠" label="Home" campaign="mike-lee-home" />
        <Item href="/about" emoji="📖" label="About this atlas" onClick={onLinkClick} />
        <Link
          href="/privacy"
          onClick={onLinkClick}
          className="px-2 py-0.5 text-label text-muted hover:text-ink-deep transition-colors"
        >
          Privacy &amp; data
        </Link>
        <Link
          href="/credits"
          onClick={onLinkClick}
          className="px-2 py-0.5 text-label text-muted hover:text-ink-deep transition-colors"
        >
          Image &amp; data credits
        </Link>
        <a
          href={withUtm('https://www.linkedin.com/in/mikelee89/', { medium: 'sidebar', campaign: 'linkedin-footer' })}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 mt-1 text-label text-muted hover:text-ink-deep transition-colors"
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
      <div className="text-micro uppercase tracking-[0.14em] text-muted font-medium px-2 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

// === Item ===
// Single sidebar row: emoji + label + optional count, internal link.
//
// Typography contract for the whole rail:
//   - All interactive items render at text-small (13px). One size for
//     primary nav, sub-list items, and footer links.
//   - Section labels + counts + decorative chevrons render at 10px.
//   - The bottom block (privacy / credits / Whisker Leaks credit) is the
//     one exception — 11px so it reads as quieter than the nav above.
//   - Emojis inherit the row's font-size via "leading-none" rather than
//     getting their own size override; previously each row used text-base
//     for the glyph which made the icons larger than the labels.
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
      <span className="leading-none flex-shrink-0" aria-hidden>{emoji}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-micro tabular-nums text-muted bg-sand/70 px-1.5 py-0.5 rounded">
          {count}
        </span>
      )}
    </Link>
  );
}

// === ArticlesItem ===
// Sidebar row with a sub-menu that drops down inline below the row when
// hovered. Clicking the "Articles" label itself navigates to the /articles
// landing page; the sub-items in the menu navigate to individual articles.
// The whole assembly (header + sub-list) is one hover region so the cursor
// can move smoothly from the title down into the menu without losing hover.
//
// Entries are passed in from the server (Sidebar.tsx → SidebarShell), so the
// menu lists hand-coded articles and file-based posts together, newest-first.
function ArticlesItem({
  onClick,
  pathname,
  entries,
}: {
  onClick?: () => void;
  pathname: string;
  entries: ArticleEntry[];
}) {
  // Track whether to show the sub-menu. Open on hover, also stays open
  // while the cursor is inside the wrapper so users can move down to the
  // sub-items.
  const [open, setOpen] = useState(false);
  // Active when the user is on /articles itself or on any registered
  // entry's route — keeps the section visually pinned during reading.
  const active =
    pathname === '/articles' ||
    entries.some(a => a.href === pathname);

  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href="/articles"
        onClick={onClick}
        className={
          'group flex items-center gap-2 px-2 py-1.5 rounded text-small transition-colors ' +
          (active
            ? 'bg-cream-soft text-ink-deep font-semibold'
            : 'text-slate hover:bg-cream-soft hover:text-ink-deep')
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="leading-none flex-shrink-0" aria-hidden>📰</span>
        <span className="flex-1 truncate">Articles</span>
        <span
          className={
            'text-micro flex-shrink-0 transition-transform ' +
            (open ? 'rotate-90' : '')
          }
          aria-hidden
        >
          ▸
        </span>
      </Link>
      {open && entries.length > 0 && (
        // Sub-list — inline under the parent row, indented with a left
        // border so it reads as a nested menu. Only renders when hovered;
        // closes naturally when the cursor leaves the wrapper above.
        <div
          className="ml-4 pl-2 mt-1 mb-1 border-l border-sand flex flex-col gap-0.5"
          role="menu"
        >
          {entries.map(a => {
            const isCurrent = a.href === pathname;
            return (
              <Link
                key={a.key}
                href={a.href}
                onClick={onClick}
                className={
                  'flex items-center gap-2 px-2 py-1 rounded text-small transition-colors ' +
                  (isCurrent
                    ? 'bg-cream-soft text-ink-deep font-medium'
                    : 'text-slate hover:bg-cream-soft hover:text-ink-deep')
                }
                role="menuitem"
                title={a.description}
              >
                {a.emoji && (
                  <span aria-hidden className="leading-none flex-shrink-0">
                    {a.emoji}
                  </span>
                )}
                <span className="flex-1 truncate">{a.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === ExternalItem ===
// External link with the small "↗" indicator, opens in a new tab. Adds UTM
// params so we can attribute clicks in the destination's analytics — most
// useful for our own properties (mike-lee.me, ski.mike-lee.me, pounce.mike-lee.me).
function ExternalItem({
  href,
  emoji,
  label,
  campaign,
}: {
  href: string;
  emoji: string;
  label: string;
  campaign?: string;
}) {
  const tracked = withUtm(href, { medium: 'sidebar', campaign });
  return (
    <a
      href={tracked}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 px-2 py-1.5 rounded text-small text-slate hover:bg-cream-soft hover:text-ink-deep transition-colors"
    >
      <span className="leading-none flex-shrink-0" aria-hidden>{emoji}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-muted text-micro opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>↗</span>
    </a>
  );
}
