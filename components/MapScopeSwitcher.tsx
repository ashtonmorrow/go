'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// === MapScopeSwitcher =======================================================
// Three-way tab strip on the map pages: Cities · Pins · Countries.
// Mounted on the corresponding /<scope>/map routes so a reader who
// landed on the cities map can flip the lens to pins or countries
// without losing the "I'm browsing the atlas on a map" mode.
//
// This complements the per-scope ViewSwitcher (Cards / Map / Table /
// Stats) that lives in AppHeader. ViewSwitcher answers "what shape do
// I want this corpus in?" Scope switcher answers "which corpus am I
// looking at?" — the data-axis Mike asked for when he routed Atlas
// directly into the map view.

type Scope = 'cities' | 'pins' | 'countries';

const SCOPES: { scope: Scope; href: string; label: string; emoji: string }[] = [
  { scope: 'cities',    href: '/cities/map',    label: 'Cities',    emoji: '📮' },
  { scope: 'pins',      href: '/pins/map',      label: 'Pins',      emoji: '📍' },
  { scope: 'countries', href: '/countries/map', label: 'Countries', emoji: '🌍' },
];

export default function MapScopeSwitcher() {
  const pathname = usePathname() ?? '';
  // Active scope is whichever map URL we're on. Pages other than the
  // three map routes hide the switcher entirely (the parent component
  // is mounted only on those pages).
  const active = SCOPES.find(s => pathname.startsWith(s.href))?.scope ?? null;
  if (!active) return null;

  return (
    <nav
      aria-label="Switch map scope"
      className="
        inline-flex rounded-lg border border-sand bg-white p-0.5
        text-small font-medium
      "
    >
      {SCOPES.map(s => {
        const isActive = s.scope === active;
        return (
          <Link
            key={s.scope}
            href={s.href}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ' +
              (isActive
                ? 'bg-ink-deep text-white'
                : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
            }
            aria-current={isActive ? 'page' : undefined}
          >
            <span aria-hidden className="leading-none">
              {s.emoji}
            </span>
            <span>{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
