'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SwitcherIcon, { type SwitcherIconName } from './SwitcherIcon';

// === MapScopeSwitcher =======================================================
// Three-way segmented control on the /<scope>/map pages:
// Cities · Pins · Countries. Lets a reader who landed on the cities
// map flip the lens to pins or countries without leaving the "I'm
// browsing the atlas on a map" mode.
//
// Sibling of ViewSwitcher; both share container, padding, radius,
// active-state, icon size, and hover treatment so the two switchers
// read as one coordinated toolbar instead of two floating debris pills.
//
// Mobile (< sm) renders icons only to keep the toolbar from dominating
// a narrow viewport; labels reappear at sm and up.

type Scope = 'cities' | 'pins' | 'countries';

const SCOPES: { scope: Scope; href: string; label: string; icon: SwitcherIconName }[] = [
  { scope: 'cities',    href: '/cities/map',    label: 'Cities',    icon: 'cities' },
  { scope: 'pins',      href: '/pins/map',      label: 'Pins',      icon: 'pins' },
  { scope: 'countries', href: '/countries/map', label: 'Countries', icon: 'countries' },
];

export default function MapScopeSwitcher() {
  const pathname = usePathname() ?? '';
  const active = SCOPES.find(s => pathname.startsWith(s.href))?.scope ?? null;
  if (!active) return null;

  return (
    <nav
      aria-label="Map scope"
      role="tablist"
      className="
        inline-flex items-center rounded-lg
        bg-white/95 backdrop-blur border border-sand
        p-1 shadow-sm
        text-small font-medium
      "
    >
      {SCOPES.map(s => {
        const isActive = s.scope === active;
        return (
          <Link
            key={s.scope}
            href={s.href}
            role="tab"
            aria-current={isActive ? 'page' : undefined}
            aria-selected={isActive}
            className={
              'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-colors ' +
              (isActive
                ? 'bg-ink-deep text-cream-soft'
                : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
            }
          >
            <SwitcherIcon name={s.icon} className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
