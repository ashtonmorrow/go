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

export const PIN_VIEWS: Record<string, PinView> = {
  reviewed: {
    slug: 'reviewed',
    label: 'Reviewed places',
    description:
      'Every place I’ve been and bothered to write a review for — about 900 pins, scattered across 60-odd countries.',
    body: [
      'These are the pins where I left a star rating and at least a sentence of what I thought. The map skews toward the cities I’ve spent the most time in — Madrid, Bangkok, Athens, Cape Town — but you’ll find a stray review on most continents.',
      'A review here doesn’t mean I’m recommending the place. Some are warnings. Read the actual text on the detail page before you adjust your trip.',
    ],
    surface: 'map',
    filterPatch: { reviewedOnly: true, visitedFilter: 'all' },
  },

  visited: {
    slug: 'visited',
    label: 'Places I’ve been',
    description:
      'Every pin marked visited — about 1,200 places across 60+ countries, from UNESCO sites to neighborhood coffee shops.',
    body: [
      'A flat list of everywhere I’ve actually showed up in person. Some of these have proper reviews; most just have a star rating or a sentence of notes. Hover for the photo, click for the detail.',
    ],
    surface: 'map',
    filterPatch: { visitedFilter: 'visited' },
  },

  unesco: {
    slug: 'unesco',
    label: 'UNESCO World Heritage Sites',
    description:
      'UNESCO World Heritage entries on my map — visited and to-go alike, each linked to its UNESCO ID and Wikipedia article.',
    body: [
      'There are 1,223 inscribed UNESCO sites on the planet (give or take a couple disputes a year). I’m tracking the ones I’ve been to, the ones near where I live, and the ones I’d break a trip for. Each pin links straight to UNESCO’s database.',
      'Plenty of these are over-tourist-ed. A couple are near-empty even on a Saturday in July. The rating sometimes tells you which.',
    ],
    surface: 'map',
    filterPatch: { lists: new Set(['UNESCO']), visitedFilter: 'all' },
  },

  free: {
    slug: 'free',
    label: 'Free to visit',
    description:
      'Pins where admission is free. Parks, plazas, Sunday-free museum days, and the kind of place a good city just gives you.',
    body: [
      'Not everything worth seeing has a turnstile. This view collects the pins flagged as free admission — usually parks, churches, public plazas, and the occasional museum on its no-charge day.',
      'Free doesn’t mean nothing. A donation, a coat-check, a coffee at the café next door. Be a guest.',
    ],
    surface: 'map',
    filterPatch: { freeOnly: true, visitedFilter: 'all' },
  },

  'kid-friendly': {
    slug: 'kid-friendly',
    label: 'Kid-friendly places',
    description:
      'Pins flagged as kid-friendly — places designed for, or comfortably tolerant of, traveling with small humans.',
    body: [
      'I don’t have kids myself, but plenty of friends do. These are the pins where I’ve marked the experience as comfortable for under-tens — open-air museums, parks with shade, restaurants that won’t glare at a high chair.',
      'Always sanity-check on the detail page; “kid-friendly” to me may not match your family’s threshold.',
    ],
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
