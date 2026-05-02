// === Pin views registry ====================================================
// Curated landing pages over the pins set. Each entry mints its own URL
// (/pins/views/<slug>) with editorial intro copy, dedicated SEO metadata,
// and a pre-applied filter state. The map / cards / table view component
// itself is reused — only the starting filter and the surrounding copy
// differ. See app/pins/views/[view]/page.tsx for the route handler.
//
// Why TS instead of markdown for the body:
//   * Tiny set (target ~10–15 views) — a registry is more legible than 15
//     stub markdown files.
//   * Editorial copy here is short and keyboard-friendly to revise.
//   * Filter patch + body live next to each other, not split across the
//     repo. Diffs read better in PRs.
// If a view's body grows past a couple paragraphs, move just that view
// into content/pins-views/<slug>.md and have the route fall back to the
// file when present.
//
// Add a view: drop a new entry into PIN_VIEWS, run typecheck, ship.

import type { PinFilterState } from '@/components/PinFiltersContext';

export type PinViewBaseSurface = 'map' | 'cards' | 'table';

export type PinView = {
  slug: string;
  /** Page H1 + breadcrumb leaf. Title-case. */
  label: string;
  /** ≤155 chars — used as <meta description>, OG description, twitter card. */
  description: string;
  /** Optional hero image (path under /public). Falls back to default OG. */
  heroImage?: string;
  /** Short editorial paragraphs. Plain prose; rendered as <p> blocks. */
  body: string[];
  /** Which sub-view to render below the intro. Defaults to 'map'. */
  surface?: PinViewBaseSurface;
  /** Partial filter patch applied to PinFiltersContext on mount. */
  filterPatch: Partial<PinFilterState>;
};

// Helper: empty Sets cast to the right union types so TS is happy when
// a view doesn't bother to override a multi-select dimension.
const emptyStringSet = (): Set<string> => new Set<string>();

// Curated-view copy is intentionally lean. The label *is* the page header;
// every additional sentence pushed travelers further from the cards. If a
// view ever needs editorial prose, drop a `content/lists/<slug>.md` for the
// long form — but the default here stays a one-line description (used for
// SEO meta only) and an empty body.
export const PIN_VIEWS: Record<string, PinView> = {
  reviewed: {
    slug: 'reviewed',
    label: 'Mike’s Reviews',
    description: 'Places Mike has reviewed.',
    body: [],
    surface: 'map',
    filterPatch: { reviewedOnly: true, visitedFilter: 'all' },
  },

  visited: {
    slug: 'visited',
    label: 'Places Mike has been',
    description: 'Pins marked visited.',
    body: [],
    surface: 'map',
    filterPatch: { visitedFilter: 'visited' },
  },

  unesco: {
    slug: 'unesco',
    label: 'UNESCO World Heritage Sites',
    description: 'UNESCO World Heritage entries on the map.',
    body: [],
    surface: 'map',
    filterPatch: { lists: new Set(['UNESCO']), visitedFilter: 'all' },
  },

  free: {
    slug: 'free',
    label: 'Free admission',
    description: 'Pins with free admission.',
    body: [],
    surface: 'map',
    filterPatch: { freeOnly: true, visitedFilter: 'all' },
  },

  'kid-friendly': {
    slug: 'kid-friendly',
    label: 'Kid-friendly',
    description: 'Pins flagged as kid-friendly.',
    body: [],
    surface: 'map',
    filterPatch: { kidFriendlyOnly: true, visitedFilter: 'all' },
  },
};

export const PIN_VIEW_SLUGS = Object.keys(PIN_VIEWS);

export function getPinView(slug: string): PinView | null {
  return PIN_VIEWS[slug] ?? null;
}

/** Useful for the sidebar / sitemap — yields all known view slugs in
 *  display order (which currently matches insertion order). */
export function listPinViews(): PinView[] {
  return PIN_VIEW_SLUGS.map(s => PIN_VIEWS[s]);
}

// Suppress unused-warning for the helper if a future view type pulls it in.
void emptyStringSet;
