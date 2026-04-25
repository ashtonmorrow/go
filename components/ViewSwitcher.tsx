'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Floating, fixed-position view switcher pinned to the bottom-right corner.
// Lets the user flip between the postcard grid (/cities) and the world map
// (/map) without scrolling back to the page header.
//
// Mounted on both /cities and /map so the same control is always available
// in the corner regardless of which view you're currently in. The active
// option is the one matching the current pathname.
export default function ViewSwitcher() {
  const pathname = usePathname() || '';
  const onMap = pathname.startsWith('/map');

  return (
    <div
      className="fixed bottom-5 right-5 z-50"
      // pointer-events-none on the wrapper would block both pills; instead
      // we rely on the inner element to receive clicks. The fixed
      // positioning + high z-index keeps it above all card / map content.
    >
      <div
        className="inline-flex rounded-full bg-white/90 backdrop-blur border border-sand p-1 shadow-lg"
        role="tablist"
        aria-label="Switch view"
      >
        <Pill href="/cities" active={!onMap} icon="📮" label="Postcard" />
        <Pill href="/map" active={onMap} icon="🗺️" label="Map" />
      </div>
    </div>
  );
}

function Pill({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
}) {
  // Active pill: solid dark fill (matches the page's other active controls
  // like sort-field buttons). Inactive pill: just the label, hover darkens.
  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-small font-medium transition-colors';
  const stateClasses = active
    ? 'bg-ink-deep text-cream-soft'
    : 'text-slate hover:text-ink-deep';
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={base + ' ' + stateClasses}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
