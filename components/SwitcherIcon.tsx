// === SwitcherIcon ==========================================================
// Single source for the small line icons used in MapScopeSwitcher,
// ViewSwitcher, and the in-map ProjectionPill. Inline stroke SVG so we
// don't ship an icon-library dependency for ten glyphs; paths are
// adapted from Lucide (MIT) for visual consistency with KoppenIcon.tsx.
//
// All icons render at the SVG's intrinsic 24x24 viewBox; size is set by
// the consumer via Tailwind classes (default: w-4 h-4). Stroke is
// currentColor, so the icon inherits the surrounding text color and
// flips correctly in active-pill states.

type IconName =
  // Scope
  | 'cities'
  | 'pins'
  | 'countries'
  // Views
  | 'cards'
  | 'postcards'
  | 'map'
  | 'table'
  | 'stats'
  | 'flags'
  | 'globe'
  | 'flat-map';

const PATHS: Record<IconName, React.ReactNode> = {
  // Cluster of buildings (scope: cities). Lucide "building-2".
  cities: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </>
  ),
  // Map pin (scope: pins). Lucide "map-pin".
  pins: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  // Globe with meridians (scope: countries). Lucide "globe".
  countries: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  // 2x2 grid (view: cards). Lucide "layout-grid".
  cards: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  // Postcard rectangle with bottom stripe (view: postcards on cities).
  postcards: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15h18" />
      <path d="M7 9h4" />
    </>
  ),
  // Map pin + folded sheet (view: map). Lucide "map".
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  // Table rows (view: table). Lucide "table".
  table: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
      <path d="M9 4v17" />
    </>
  ),
  // Bar chart (view: stats). Lucide "bar-chart-3".
  stats: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16V11" />
      <path d="M12 16V7" />
      <path d="M17 16v-3" />
    </>
  ),
  // Flag on pole (view: flags on countries). Lucide "flag".
  flags: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  // Same as countries — globe icon (view: globe on countries).
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  // Flat folded map (projection: mercator). Lucide "map" w/o creases.
  'flat-map': (
    <>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <path d="M2 10h20" />
      <path d="M2 14h20" />
    </>
  ),
};

export type SwitcherIconName = IconName;

export default function SwitcherIcon({
  name,
  className = 'w-4 h-4',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
