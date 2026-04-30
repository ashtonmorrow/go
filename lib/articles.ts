/**
 * Article registry.
 *
 * Each article is a hand-coded TSX folder under app/<slug>/page.tsx with its
 * own _components/ and _data/ co-located. This file is the central index the
 * sidebar dropdown + /articles landing page read from. Add a new entry here
 * when shipping a new article.
 *
 * Articles aren't always at /articles/<slug>; some are top-level (e.g. the
 * airline cheat sheet at /airline-stopover-programs). The href field carries
 * the canonical route, the slug is just an internal id for keying.
 */

export type Article = {
  /** Internal id. Used as React key + URL-fragment-friendly handle. */
  slug: string;
  /** Canonical route path. */
  href: string;
  title: string;
  /** One- or two-sentence summary used on the index card and dropdown subtitle. */
  description: string;
  /** ISO date string for the day the article first shipped. */
  publishedAt: string;
  /** Optional emoji used as a glanceable icon in the sidebar dropdown. */
  emoji?: string;
};

export const ARTICLES: Article[] = [
  {
    slug: 'airline-stopover-programs',
    href: '/airline-stopover-programs',
    title: 'Airline Stopover Programs',
    description:
      'The airlines whose long-haul tickets let you break the journey for a day or three at the connecting hub, sometimes with a free hotel. Sorted by alliance.',
    publishedAt: '2026-04-30',
    emoji: '✈️',
  },
];

/** Sorted newest-first for the index page; sidebar uses the same order. */
export function articlesByDate(): Article[] {
  return [...ARTICLES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
