'use client';

// === MapFilterDock =========================================================
// Floating filter panel for the full-bleed globe views (/cities/map,
// /pins/map, /countries/map). When the visitor is on a map route the
// SidebarShell suppresses the persistent left rail; this dock floats
// top-right so the globe gets the whole viewport. Same FilterPanel
// internals the sidebar uses on browse routes; the difference is
// chrome and positioning, not the controls themselves.
//
// Layout contract:
//   * Fixed top:80px, right:12px so it sits below the AppHeader pill
//     cluster (top:12px, ~50px tall) with a small visual gap.
//   * z-30, one rung below AppHeader (z-40) so the switcher always
//     wins if they ever overlap during a window resize.
//   * w-80 (320px), slightly wider than the 256px rail to feel like
//     a distinct surface rather than a relocated sidebar.
//   * Collapsible: header stays visible, body folds away. Useful once
//     the visitor has narrowed the set and wants the globe to breathe.
//   * Desktop-only. Mobile keeps the existing top-bar + drawer pattern
//     because a persistent panel would occlude the globe at that
//     viewport size.
//

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const FilterPanel = dynamic(() => import('./FilterPanel'), { ssr: false });
const PinFilterPanel = dynamic(() => import('./PinFilterPanel'), { ssr: false });

const MAP_ROUTES = new Set(['/cities/map', '/pins/map', '/countries/map']);

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
  const isPins = pathname === '/pins/map';

  return (
    <div className="hidden md:flex flex-col fixed top-20 right-3 z-30 w-80 max-h-[calc(100vh-6rem)] bg-white border border-sand rounded-lg shadow-lg">
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
        aria-expanded={!collapsed}
        className="flex items-center justify-between px-3 py-2 border-b border-sand bg-white rounded-t-lg hover:bg-cream-soft transition-colors"
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
    </div>
  );
}
