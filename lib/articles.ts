/**
 * Article registry.
 *
 * Two flavors of long-form content live under one umbrella:
 *
 * 1. **Hand-coded articles** — bespoke TSX folders under app/<slug>/page.tsx
 *    with their own _components/ and _data/ co-located (e.g. the airline
 *    cheat sheet with its alliance-grouped program cards). Listed in the
 *    ARTICLES const below.
 *
 * 2. **File-based posts** — Markdown in /content/posts/<slug>.md, rendered
 *    by app/posts/[slug]/page.tsx via lib/posts.ts. The default surface
 *    when you want to write prose, attach a hero image, and link out to
 *    cities/countries/pins.
 *
 * Both surfaces (the /articles landing page and the sidebar dropdown) want
 * the union of the two, ordered newest-first. getAllArticleEntries() is the
 * server-side function that produces that merged list.
 *
 * Articles aren't always at /articles/<slug>; some are top-level (e.g. the
 * airline cheat sheet at /airline-stopover-programs). The href field carries
 * the canonical route, the slug is just an internal id for keying.
 */

import { getAllPosts } from './posts';

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
  /** Optional /public-relative path to a 16:9 hero image. When present, the
   *  /articles card renders with a cover; otherwise it falls back to the
   *  fields-only layout. File-based posts always carry one in frontmatter. */
  heroImage?: string;
  /** Alt text that pairs with heroImage. */
  heroAlt?: string;
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
    heroImage: '/images/posts/airline-stopover-programs.jpg',
    heroAlt:
      'A mosque visited during an Oman Air stopover in Muscat — a real-world example of breaking up a long-haul into a short trip.',
  },
];

/** Sorted newest-first for the index page; sidebar uses the same order. */
export function articlesByDate(): Article[] {
  return [...ARTICLES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Unified entry shape used by both /articles cards and the sidebar dropdown.
 * Hand-coded articles and file-based posts both flatten into this.
 */
export type ArticleEntry = {
  /** Stable React key (article: or post: prefix to avoid slug collisions). */
  key: string;
  /** Canonical route path. */
  href: string;
  title: string;
  description: string;
  publishedAt: string | null;
  /** Cover image path (file-based posts always carry one; hand-coded
   *  articles can opt in later by adding a heroImage field). */
  heroImage: string | null;
  heroAlt: string | null;
  /** Optional glyph for the sidebar's tight row layout. Hand-coded articles
   *  use this; posts default to a 📝 icon. */
  emoji: string | null;
};

/**
 * Per-post emoji map. Posts in the sidebar dropdown previously all rendered
 * with the same 📝 glyph, which made them visually indistinguishable. This
 * map gives each known post a topic-derived icon; new posts fall back to
 * 📝 until added here.
 *
 * The icons lean on country flags where the post is country-anchored so
 * the user can scan the list geographically; thematic posts (markets,
 * trains) get a topic icon instead.
 */
const POST_EMOJI: Record<string, string> = {
  'thailand-travel-notes': '🇹🇭',
  'bali-travel-guide': '🌴',
  'cape-town-travel-brief': '🏔️',
  'spanish-castles': '🏰',
  'bernina-express-first-class': '🚂',
  'balkan-green-markets': '🥬',
  'why-alicante': '🏖️',
  'rio-botanical-garden': '🌿',
};

function emojiForPost(slug: string): string {
  return POST_EMOJI[slug] ?? '📝';
}

/**
 * Server-only. Reads ARTICLES + content/posts/ and merges into one
 * newest-first list. Hand-coded articles win on href collisions so a
 * curated TSX page can supersede a stub post if needed.
 */
export async function getAllArticleEntries(): Promise<ArticleEntry[]> {
  const posts = await getAllPosts();
  const seenHrefs = new Set<string>();
  const out: ArticleEntry[] = [];

  for (const a of articlesByDate()) {
    if (seenHrefs.has(a.href)) continue;
    seenHrefs.add(a.href);
    out.push({
      key: `article:${a.slug}`,
      href: a.href,
      title: a.title,
      description: a.description,
      publishedAt: a.publishedAt,
      heroImage: a.heroImage ?? null,
      heroAlt: a.heroAlt ?? a.title,
      emoji: a.emoji ?? null,
    });
  }

  for (const p of posts) {
    // Skip stub posts whose external_route points at a hand-coded article we
    // already added above. Otherwise /articles would show two cards for the
    // same content (one per source) — hand-coded ARTICLES wins because that
    // page has the bespoke layout.
    if (p.externalRoute && seenHrefs.has(p.externalRoute)) continue;

    const href = `/posts/${p.slug}`;
    if (seenHrefs.has(href)) continue;
    seenHrefs.add(href);
    out.push({
      key: `post:${p.slug}`,
      href,
      title: p.title,
      description: p.subtitle ?? '',
      publishedAt: p.published ?? p.updated ?? null,
      heroImage: p.heroImage,
      heroAlt: p.heroAlt ?? p.title,
      emoji: emojiForPost(p.slug),
    });
  }

  return out.sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
}
