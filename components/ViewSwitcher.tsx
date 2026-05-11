'use client';

import Link from 'next/link';
import SwitcherIcon, { type SwitcherIconName } from './SwitcherIcon';

// === ViewSwitcher ==========================================================
// Segmented control for the View axis of the Object × View nav model.
// The Object axis (Cities / Countries / Pins) lives in the sidebar and
// in MapScopeSwitcher on map pages; this is the orthogonal "how am I
// looking at it?" control.
//
// Usage: <ViewSwitcher object="cities" current="cards" />
//
// Four views — Cards, Map, Table, Stats — exist for every object. Each
// pill links to /<object>/<view>; the active pill is the one matching
// `current`. Some object-view combinations have view-specific names
// that read better in context (e.g. "Globe" rather than "Map" for
// countries, "Postcards" for cities) — we keep the canonical view keys
// for routing and label them per-object via the LABELS table.
//
// Mobile (< sm) renders icons only so the bar fits a narrow viewport;
// the text labels return at sm and up. Shares container + active-state
// vocabulary with MapScopeSwitcher.

export type ObjectKey = 'cities' | 'countries' | 'pins';
export type ViewKey = 'cards' | 'map' | 'table' | 'stats';

const VIEW_ORDER: ViewKey[] = ['cards', 'map', 'table', 'stats'];

// Per-object labels — keep the verb concrete to the data on screen.
const LABELS: Record<ObjectKey, Record<ViewKey, { icon: SwitcherIconName; label: string }>> = {
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

export default function ViewSwitcher({
  object,
  current,
  className,
}: {
  object: ObjectKey;
  /** When omitted (e.g. on detail pages) no pill is highlighted —
   *  every option just acts as a link to the equivalent index view. */
  current?: ViewKey;
  /** Wrapper class for layout — defaults to inline. */
  className?: string;
}) {
  return (
    <nav
      aria-label="View"
      role="tablist"
      className={
        'inline-flex items-center rounded-lg ' +
        'bg-white/95 backdrop-blur border border-sand ' +
        'p-1 shadow-sm text-small font-medium ' +
        (className ?? '')
      }
    >
      {VIEW_ORDER.map(view => {
        const isActive = view === current;
        const { icon, label } = LABELS[object][view];
        return (
          <Link
            key={view}
            href={`/${object}/${view}`}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={
              'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-colors ' +
              (isActive
                ? 'bg-ink-deep text-cream-soft'
                : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
            }
          >
            <SwitcherIcon name={icon} className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
