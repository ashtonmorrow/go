// === KoppenIcon ============================================================
// Renders a small icon for a Köppen climate code. Group-level icons (5
// total) cover all 30+ sub-codes; the precise code stays in the title +
// aria-label so power users / screen readers don't lose specificity.
//
// Group → icon mapping:
//   A Tropical    — Palm tree
//   B Arid        — Sun
//   C Temperate   — Cloud + sun
//   D Continental — Cloud + snow
//   E Polar       — Snowflake
//
// Icon paths are lifted from Lucide (MIT licensed). Inline SVG, no new
// dependency for five icons.

import type { ReactNode } from 'react';

type Group = 'A' | 'B' | 'C' | 'D' | 'E';

const GROUP_LABEL: Record<Group, string> = {
  A: 'Tropical',
  B: 'Arid',
  C: 'Temperate',
  D: 'Continental',
  E: 'Polar',
};

// Sub-code descriptions for the most common Köppen codes — surfaced in the
// tooltip so the precise meaning is one hover away. Anything not listed
// falls back to the group label (e.g. 'Tropical (Af)').
const SUB_LABEL: Record<string, string> = {
  Af: 'Tropical rainforest',
  Am: 'Tropical monsoon',
  Aw: 'Tropical savanna, dry winter',
  As: 'Tropical savanna, dry summer',
  BWh: 'Hot desert',
  BWk: 'Cold desert',
  BSh: 'Hot semi-arid',
  BSk: 'Cold semi-arid',
  Cfa: 'Humid subtropical',
  Cfb: 'Oceanic',
  Cfc: 'Subpolar oceanic',
  Csa: 'Hot-summer Mediterranean',
  Csb: 'Warm-summer Mediterranean',
  Csc: 'Cool-summer Mediterranean',
  Cwa: 'Monsoon-influenced humid subtropical',
  Cwb: 'Subtropical highland',
  Cwc: 'Cold subtropical highland',
  Dfa: 'Hot-summer humid continental',
  Dfb: 'Warm-summer humid continental',
  Dfc: 'Subarctic',
  Dfd: 'Extremely cold subarctic',
  Dsa: 'Hot, dry-summer continental',
  Dsb: 'Warm, dry-summer continental',
  Dsc: 'Dry-summer subarctic',
  Dwa: 'Monsoon-influenced hot-summer continental',
  Dwb: 'Monsoon-influenced warm-summer continental',
  Dwc: 'Monsoon-influenced subarctic',
  ET: 'Tundra',
  EF: 'Ice cap',
};

function groupOf(code: string): Group | null {
  const g = code[0]?.toUpperCase();
  return g === 'A' || g === 'B' || g === 'C' || g === 'D' || g === 'E' ? g : null;
}

const ICONS: Record<Group, ReactNode> = {
  // Palm tree — tropical
  A: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" />
      <path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3" />
      <path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z" />
      <path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14" />
    </svg>
  ),
  // Sun — arid
  B: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  // Cloud-sun — temperate
  C: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </svg>
  ),
  // Cloud-snow — continental
  D: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 19.5h.01" />
      <path d="M8 15.5h.01" />
      <path d="M12 21.5h.01" />
      <path d="M12 17.5h.01" />
      <path d="M16 19.5h.01" />
      <path d="M16 15.5h.01" />
    </svg>
  ),
  // Snowflake — polar
  E: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12h20" />
      <path d="M12 2v20" />
      <path d="m20 16-4-4 4-4" />
      <path d="m4 8 4 4-4 4" />
      <path d="m16 4-4 4-4-4" />
      <path d="m8 20 4-4 4 4" />
    </svg>
  ),
};

/**
 * Returns the human-readable label for a Köppen code. Used as the tooltip /
 * aria-label content. Falls back to '<Group>' when the sub-code isn't in
 * SUB_LABEL.
 */
export function koppenLabel(code: string): string {
  const sub = SUB_LABEL[code];
  if (sub) return `${code}: ${sub}`;
  const group = groupOf(code);
  return group ? `${code}: ${GROUP_LABEL[group]}` : code;
}

export default function KoppenIcon({
  code,
  size = 14,
  className = 'text-slate',
}: {
  code: string | null | undefined;
  size?: number;
  /** Tailwind classes for color / margin. Defaults to neutral slate. */
  className?: string;
}) {
  if (!code) return null;
  const group = groupOf(code);
  if (!group) return <span className="text-muted">{code}</span>;
  return (
    <span
      title={koppenLabel(code)}
      aria-label={koppenLabel(code)}
      className={'inline-flex items-center justify-center flex-shrink-0 ' + className}
      style={{ width: size, height: size }}
    >
      {ICONS[group]}
    </span>
  );
}
