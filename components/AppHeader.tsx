'use client';

import { usePathname } from 'next/navigation';
import ViewSwitcher, { type ObjectKey, type ViewKey } from './ViewSwitcher';

/**
 * Single global ViewSwitcher mounted by the root layout.
 *
 * Reads the current pathname, decides which Object the user is on
 * (cities / countries / pins) and which View (cards / map / table /
 * stats), and renders a fixed-position pill switcher in the top-right
 * corner of every applicable page.
 *
 * Why it lives here instead of inside each route:
 *   - Detail and map pages used to render their own ViewSwitcher with
 *     custom wrapper JSX, which scattered 14 near-identical bits of
 *     header markup across the route tree. Map pages additionally moved
 *     the switcher to bottom-right because they're full-bleed and have
 *     no header — so the control jumped around the screen depending on
 *     which view you were on, which the user (correctly) hated.
 *   - Hoisting to the layout fixes both: one render site, one position,
 *     all routes consistent. Pages drop the ViewSwitcher import + the
 *     `<div className="flex items-center justify-between">…</div>`
 *     wrapper that paired it with the H1.
 */

// Routes where the header should NOT render. Mostly chrome-less surfaces
// (admin, articles, the about/credits/privacy static pages) plus the
// landing page if/when one exists. Add new exceptions as needed.
const HIDDEN_ON: RegExp[] = [
  /^\/admin(\/|$)/,
  /^\/articles(\/|$)/,
  /^\/airline-stopover-programs(\/|$)/,
  /^\/about(\/|$)/,
  /^\/credits(\/|$)/,
  /^\/privacy(\/|$)/,
];

const KNOWN_OBJECTS = new Set<ObjectKey>(['cities', 'countries', 'pins']);
const KNOWN_VIEWS = new Set<ViewKey>(['cards', 'map', 'table', 'stats']);

export default function AppHeader() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_ON.some(re => re.test(pathname))) return null;

  // Match /cities, /cities/cards, /cities/aegina, /pins/some-slug, etc.
  const match = pathname.match(/^\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;
  const obj = match[1];
  if (!KNOWN_OBJECTS.has(obj as ObjectKey)) return null;
  const object = obj as ObjectKey;

  // Second segment is either a known view or a slug (detail page). On
  // detail pages we render the switcher with no current view highlighted
  // so each pill reads as a navigation option to the equivalent index.
  const second = match[2];
  const current = second && KNOWN_VIEWS.has(second as ViewKey)
    ? (second as ViewKey)
    : undefined;

  return (
    <div className="fixed top-3 right-3 z-40 hidden md:block">
      <ViewSwitcher object={object} current={current} className="shadow-paper" />
    </div>
  );
}
