'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useCityFilters } from './CityFiltersContext';
import { usePinFilters } from './PinFiltersContext';
import { useCountryFilters } from './CountryFiltersContext';
import { withUtm } from '@/lib/utm';
import type { ArticleEntry } from '@/lib/articles';
import SearchModal, { type SearchItem } from './SearchModal';

// Map routes still use the sidebar — it just overlays the globe at z-30
// instead of taking width from the flex flow. This is the unified-nav
// shape (May 2026): one nav surface across all routes, no per-route
// chrome rearrangement. The MapFilterDock that used to live here is
// gone; its filter panels were the same FilterPanel / PinFilterPanel /
// CountryFilterPanel that the sidebar already lazy-loads.
const MAP_ROUTES = new Set(['/cities/map', '/pins/map', '/countries/map']);

// Filter panels lazy-loaded so chrome-less routes (about, privacy,
// articles, posts, admin/*) don't pay for the filter-cockpit JavaScript
// they never render. Each panel pulls in its own pile of subcomponents
// (WorldMapPicker bakes a country GeoJSON, PinFilterPanel pulls every
// list-icon constant from lib/pinLists, etc.) — significant client-bundle
// savings on cold loads. ssr:false because these are interactive chips
// with no SEO value; the static HTML on cockpit pages already includes
// the canonical content.
const FilterPanel = dynamic(() => import('./FilterPanel'), { ssr: false });
const PinFilterPanel = dynamic(() => import('./PinFilterPanel'), { ssr: false });
const CountryFilterPanel = dynamic(() => import('./CountryFilterPanel'), { ssr: false });

type Counts = {
  cities: number;
  countries: number;
  been: number;
  go: number;
  saved: number;
  pins: number;
  lists: number;
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

// Top nav. Re-tiered May 2026 from the old five-object axis (Cities,
// Countries, Pins, Lists, Articles) to a four-item content-first frame:
// Lists (the destination guides + raw saved lists), Articles (essays
// and reference pieces), Atlas (the wrapper landing at /atlas that
// points at Cities / Countries / Pins / Map), About. The data views
// are still reachable; they just sit one level deeper, behind /atlas,
// so the front-of-house leads with the writing rather than 1,341 thin
// city rows. Items are inlined in the JSX rather than driven from a
// constant since each row has its own active-state logic.

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
  searchItems = [],
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
  /** Pre-built suggestion list for the ⌘K SearchModal mounted at the
   *  top of the rail. See lib/searchItems.buildSearchItems. */
  searchItems?: SearchItem[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const isMapRoute = MAP_ROUTES.has(pathname);

  return (
    <>
      {/* === Mobile top bar === only visible below md. Just the hamburger —
          no brand label, since it would duplicate what the URL bar already
          says and clutter the narrow viewport. Stays on map routes too;
          the drawer slides in over the globe when summoned. === */}
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
          searchItems={searchItems}
          onLinkClick={() => setDrawerOpen(false)}
        />
      </aside>

      {/* === Desktop rail === Always visible md+. On most routes it's
          a sticky in-flow column (the layout uses md:flex with main as
          the flex sibling). On the three /<scope>/map routes it switches
          to fixed overlay positioning so the globe underneath gets full
          width and the rail floats over the left edge at z-30. Same
          contents either way — one nav surface across the site. */}
      <aside
        className={
          'hidden md:block w-64 flex-shrink-0 bg-white border-r border-sand overflow-y-auto h-screen ' +
          (isMapRoute
            ? 'fixed top-0 left-0 z-30 shadow-lg'
            : 'sticky top-0')
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
          searchItems={searchItems}
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
// Scope-preserving href helper. When the visitor is already on a
// /<scope>/<view> URL, pivoting to a different scope keeps the same
// view (so /cities/map + click Pins → /pins/map). Otherwise it returns
// the bare /<scope> path and the redirect table in next.config picks
// the canonical default view (cities → cards, pins → cards, countries
// → map).
function scopeHref(scope: 'cities' | 'pins' | 'countries', pathname: string): string {
  const m = pathname.match(/^\/(cities|pins|countries)\/(cards|map|table|stats)/);
  if (m && m[2]) return `/${scope}/${m[2]}`;
  return `/${scope}`;
}

function NavBody({
  counts,
  countryOptions,
  pinCountryOptions,
  pinCategoryOptions,
  pinListOptions,
  pinTagOptions,
  pinSavedListOptions,
  articleEntries,
  searchItems,
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
  searchItems: SearchItem[];
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
      {/* Search trigger + ⌘K modal. Listens globally for the keyboard
          shortcut (⌘K / Ctrl-K) so the click-the-button affordance is
          a backup; power users hit the keys. The modal renders nothing
          when closed. */}
      <SearchModal items={searchItems} />

      {/* Top nav. Lists leads (destination guides + raw saved lists);
          the Atlas block under it surfaces the three scopes (Cities,
          Pins, Countries) as their own rail items so the visitor can
          pivot scope without leaving the canonical primary navigation.
          The href for each scope preserves the visitor's current view
          (cards / map / table / stats) when they're already on a
          /<scope>/<view> URL, so flipping from /cities/map to Pins
          lands on /pins/map rather than dumping them back to the
          default. About closes the block. Articles moved to the
          footer (May 2026); the home page mixes articles into the
          unified feed, so a primary-nav slot for the same content
          was duplicative. */}
      <div className="flex flex-col gap-0.5">
        <Item
          href="/lists"
          emoji="🗂️"
          label="Lists"
          active={pathname === '/lists' || pathname.startsWith('/lists/')}
          onClick={onLinkClick}
        />
      </div>

      <Section label="Atlas">
        <Item
          href={scopeHref('cities', pathname)}
          emoji="🏙️"
          label="Cities"
          active={pathname.startsWith('/cities')}
          onClick={onLinkClick}
        />
        <Item
          href={scopeHref('pins', pathname)}
          emoji="📮"
          label="Pins"
          active={pathname.startsWith('/pins')}
          onClick={onLinkClick}
        />
        <Item
          href={scopeHref('countries', pathname)}
          emoji="🌍"
          label="Countries"
          active={pathname.startsWith('/countries')}
          onClick={onLinkClick}
        />
      </Section>

      <div className="flex flex-col gap-0.5">
        <Item
          href="/about"
          emoji="📖"
          label="About"
          active={pathname === '/about'}
          onClick={onLinkClick}
        />
      </div>

      {/* Filter cockpits — only on the Object × View browse routes
          (cities/countries/pins cards/map/table/stats). Editorial
          routes (/, /lists, /lists/[slug], /articles, /atlas, /about)
          render the top nav alone, which keeps the writing-led pages
          uncluttered and matches the industry pattern: editorial gets
          full-width content, browse gets the cockpit.

          The old read-only Collections fallback (the count list of
          Cities / Countries / Pins / Lists / Been / Go / Saved) was
          removed: it duplicated the top nav and pulled focus on
          editorial pages where it had nothing to operate on. The
          counts still live on /atlas where they belong. */}
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
      ) : null}

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
          <Item href="/admin/pins/enrich"   emoji="✨" label="Enrich descriptions" onClick={onLinkClick} />
          <Item href="/admin/hotels"        emoji="⌂" label="Hotel prices"   onClick={onLinkClick} />
          <Item href="/admin/lists"         emoji="🗂️" label="Saved lists"   onClick={onLinkClick} />
          <Item href="/admin/upload"        emoji="📷" label="Upload"         onClick={onLinkClick} />
          <Item href="/admin/photos"        emoji="🖼️" label="Photos"         onClick={onLinkClick} />
          <Item href="/admin/reservations/new" emoji="🛎️" label="Add reservation" onClick={onLinkClick} />
        </Section>
      )}

      {/* Bottom block: link out to the parent site, the Articles index
          (demoted from primary nav since the home unified feed already
          surfaces articles alongside guides), plus the quiet legal-and-
          attribution links. About moved up into the top nav (May 2026
          IA refactor); it no longer doubles here. */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        <ExternalItem href="https://mike-lee.me/" emoji="🏠" label="Home" campaign="mike-lee-home" />
        <Item
          href="/articles"
          emoji="📰"
          label="Articles"
          active={pathname === '/articles' || pathname.startsWith('/articles/') || pathname.startsWith('/posts/')}
          onClick={onLinkClick}
        />
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
