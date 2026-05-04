'use client';

import Link from 'next/link';

// === ViewSwitcher ==========================================================
// Horizontal pill switcher for the View axis of the unified Object × View
// nav. Sits inline with each page's H1. The Object axis (Cities /
// Countries / Pins) lives in the left sidebar; this is the orthogonal
// "how am I looking at it?" control.
//
// Usage: <ViewSwitcher object="cities" current="cards" />
//
// The same three views — Cards, Map, Table — exist for every object.
// Each pill links to /<object>/<view>; the active pill is the one
// matching `current`.
//
// Some object-view combinations have view-specific names that read better
// in context (e.g. "Globe" rather than "Map" for /countries) — we keep the
// canonical view keys ('cards' | 'map' | 'table') for routing, and label
// them per-object via the `LABELS` table below.

export type ObjectKey = 'cities' | 'countries' | 'pins';
export type ViewKey = 'cards' | 'map' | 'table' | 'stats';

const VIEW_ORDER: ViewKey[] = ['cards', 'map', 'table', 'stats'];

// Per-object labels — keep the verb concrete to the data on screen.
//   • Cities:    Postcards / Map / Table / Stats
//   • Countries: Cards / Globe / Table / Stats
//   • Pins:      Cards / Map / Table / Stats
const LABELS: Record<ObjectKey, Record<ViewKey, { icon: string; label: string }>> = {
  cities: {
    cards: { icon: '📮', label: 'Postcards' },
    map:   { icon: '🗺️', label: 'Map' },
    table: { icon: '🗂️', label: 'Table' },
    stats: { icon: '📊', label: 'Stats' },
  },
  countries: {
    cards: { icon: '🏳️', label: 'Flags' },
    map:   { icon: '🌍', label: 'Globe' },
    table: { icon: '🗂️', label: 'Table' },
    stats: { icon: '📊', label: 'Stats' },
  },
  pins: {
    cards: { icon: '📍', label: 'Cards' },
    map:   { icon: '🗺️', label: 'Map' },
    table: { icon: '🗂️', label: 'Table' },
    stats: { icon: '📊', label: 'Stats' },
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
  /** Wrapper class for layout — defaults to inline. Pass 'fixed bottom-…'
   *  to use as a floating control (e.g. on full-bleed map pages). */
  className?: string;
}) {
  return (
    <div
      className={
        'inline-flex rounded-full bg-white/90 backdrop-blur border border-sand p-1 ' +
        (className ?? '')
      }
      role="tablist"
      aria-label="Switch view"
    >
      {VIEW_ORDER.map(view => {
        const active = view === current;
        const { icon, label } = LABELS[object][view];
        return (
          <Link
            key={view}
            href={`/${object}/${view}`}
            role="tab"
            aria-selected={active}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-small font-medium transition-colors ' +
              (active
                ? 'bg-ink-deep text-cream-soft'
                : 'text-slate hover:text-ink-deep')
            }
          >
            <span aria-hidden>{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
