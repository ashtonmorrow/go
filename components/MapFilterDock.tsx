'use client';

// === MapFilterDock =========================================================
// Single control surface for the full-bleed globe views (/cities/map,
// /pins/map, /countries/map). When the visitor is on a map route the
// SidebarShell suppresses the persistent left rail and AppHeader hides
// the ViewSwitcher pill; this dock owns everything those used to do
// in three places, consolidated into one floating panel.
//
// Vertical sections (top → bottom):
//   1. Scope switcher — Cities / Pins / Countries (preserves view
//      across pivots, so /cities/map + click Pins → /pins/map).
//   2. View switcher — Postcards / Map / Table / Stats (jumps you
//      out of the map view if you want a different lens).
//   3. Filter cockpit — collapsible. FilterPanel for cities + countries
//      (the country globe shades by filtered cities); PinFilterPanel
//      for pins. Same internals the sidebar uses on non-map routes.
//   4. Site nav strip — Lists / About / Home for the way out.
//
// Layout contract:
//   * Fixed top:12px, right:12px (no AppHeader to share the corner with).
//   * z-30. AppHeader is hidden on these routes so there is no
//     competing z-40 element to worry about.
//   * w-80 (320px). The scope + view rows render four/three pills
//     each at small size; FilterPanel internals are sized for this
//     width via the sidebar's existing 256-320px target.
//   * max-h-[calc(100vh-1.5rem)] with internal scroll so the panel
//     never extends past the viewport.
//   * Desktop-only. Mobile uses the existing top-bar + drawer.
//

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import SwitcherIcon, { type SwitcherIconName } from './SwitcherIcon';

const FilterPanel = dynamic(() => import('./FilterPanel'), { ssr: false });
const PinFilterPanel = dynamic(() => import('./PinFilterPanel'), { ssr: false });

const MAP_ROUTES = new Set(['/cities/map', '/pins/map', '/countries/map']);

type Scope = 'cities' | 'pins' | 'countries';
type View = 'cards' | 'map' | 'table' | 'stats';

const SCOPES: { scope: Scope; label: string; icon: SwitcherIconName }[] = [
  { scope: 'cities',    label: 'Cities',    icon: 'cities' },
  { scope: 'pins',      label: 'Pins',      icon: 'pins' },
  { scope: 'countries', label: 'Countries', icon: 'countries' },
];

// Per-scope view labels — the same per-object verb table the standalone
// ViewSwitcher uses ("Postcards" for cities, "Flags" / "Globe" for
// countries, etc.) so the in-dock pill cluster reads the same as the
// non-map-route pills.
const VIEW_LABELS: Record<Scope, Record<View, { icon: SwitcherIconName; label: string }>> = {
  cities: {
    cards: { icon: 'postcards', label: 'Postcards' },
    map:   { icon: 'map',       label: 'Map' },
    table: { icon: 'table',     label: 'Table' },
    stats: { icon: 'stats',     label: 'Stats' },
  },
  countries: {
    cards: { icon: 'flags',     label: 'Flags' },
    map:   { icon: 'globe',     label: 'Globe' },
    table: { icon: 'table',     label: 'Table' },
    stats: { icon: 'stats',     label: 'Stats' },
  },
  pins: {
    cards: { icon: 'cards',     label: 'Cards' },
    map:   { icon: 'map',       label: 'Map' },
    table: { icon: 'table',     label: 'Table' },
    stats: { icon: 'stats',     label: 'Stats' },
  },
};

const VIEW_ORDER: View[] = ['cards', 'map', 'table', 'stats'];

type Props = {
  countryOptions: string[];
  pinCountryOptions: string[];
  pinCategoryOptions: string[];
  pinListOptions: string[];
  pinTagOptions: string[];
  pinSavedListOptions: string[];
};

export default function MapFilterDock(props: Props) {
  const pathname = usePathname() ?? '';
  const [collapsed, setCollapsed] = useState(false);
  if (!MAP_ROUTES.has(pathname)) return null;

  // Pins map gets its own cockpit. Cities + Countries maps share the
  // city filter cockpit because the country globe shades by filtered
  // cities, so a city filter still narrows the right things on the
  // country view.
  const activeScope: Scope = pathname === '/pins/map'
    ? 'pins'
    : pathname === '/countries/map'
    ? 'countries'
    : 'cities';
  const isPins = activeScope === 'pins';

  return (
    <div className="hidden md:flex flex-col fixed top-3 right-3 z-30 w-80 max-h-[calc(100vh-1.5rem)] bg-white border border-sand rounded-lg shadow-lg">
      {/* === Scope row =========================================== */}
      <nav
        aria-label="Atlas scope"
        role="tablist"
        className="flex items-center gap-1 p-1 border-b border-sand"
      >
        {SCOPES.map(s => {
          const isActive = s.scope === activeScope;
          return (
            <Link
              key={s.scope}
              href={`/${s.scope}/map`}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={
                'flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-small font-medium transition-colors ' +
                (isActive
                  ? 'bg-ink-deep text-cream-soft'
                  : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
              }
            >
              <SwitcherIcon name={s.icon} className="w-4 h-4 shrink-0" />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* === View row ============================================ */}
      <nav
        aria-label="View"
        role="tablist"
        className="flex items-center gap-1 p-1 border-b border-sand"
      >
        {VIEW_ORDER.map(view => {
          const isActive = view === 'map';
          const { icon, label } = VIEW_LABELS[activeScope][view];
          return (
            <Link
              key={view}
              href={`/${activeScope}/${view}`}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={
                'flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-label font-medium transition-colors ' +
                (isActive
                  ? 'bg-ink-deep text-cream-soft'
                  : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
              }
              title={label}
            >
              <SwitcherIcon name={icon} className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* === Filters (collapsible) =============================== */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
        aria-expanded={!collapsed}
        className="flex items-center justify-between px-3 py-2 border-b border-sand bg-white hover:bg-cream-soft transition-colors"
      >
        <span className="text-small font-semibold text-ink-deep">Filters</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-muted">
          <path
            d={collapsed ? 'M3 5l4 4 4-4' : 'M3 9l4-4 4 4'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
      {!collapsed && (
        <div className="overflow-y-auto p-3 flex-1 min-h-0">
          {isPins ? (
            <PinFilterPanel
              countryOptions={props.pinCountryOptions}
              categoryOptions={props.pinCategoryOptions}
              listOptions={props.pinListOptions}
              tagOptions={props.pinTagOptions}
              savedListOptions={props.pinSavedListOptions}
            />
          ) : (
            <FilterPanel countryOptions={props.countryOptions} />
          )}
        </div>
      )}

      {/* === Site nav strip ======================================
          The way out of the map without losing your mental model:
          Lists, About, or the parent mike-lee.me. Keeps the rail's
          editorial routes one click away when the rail itself is
          hidden. */}
      <div className="flex items-center justify-around gap-1 px-2 py-2 border-t border-sand bg-cream-soft/50 rounded-b-lg text-label text-slate">
        <Link href="/lists" className="hover:text-ink-deep transition-colors">
          🗂️ Lists
        </Link>
        <Link href="/about" className="hover:text-ink-deep transition-colors">
          📖 About
        </Link>
        <a
          href="https://mike-lee.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-deep transition-colors"
        >
          🏠 Home
        </a>
      </div>
    </div>
  );
}
